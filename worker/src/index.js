/* 樂器合照臨時相庫（Workers KV）：上傳 JPEG、以難估 id 取回、14 日後刪除。冇公開相簿。 */
const MAX_BYTES = 8 * 1024 * 1024;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RATE_PER_MIN = 30;
const ID_RE = /^[0-9a-f]{32}$/;
const JPEG_TYPE = 'image/jpeg';
const DEFAULT_TITLE = '音樂課合照';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request);

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'POST' && (path === '/upload' || path === '/upload/')) {
        return withCors(request, await handleUpload(request, env, url));
      }

      const page = path.match(/^\/p\/([0-9a-f]{32})\/?$/);
      if (request.method === 'GET' && page) {
        return handlePage(page[1], env, ctx);
      }

      const img = path.match(/^\/i\/([0-9a-f]{32})(?:\.jpe?g)?$/i);
      if (request.method === 'GET' && img) {
        return handleImage(img[1], env, ctx);
      }

      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (err) {
      return withCors(request, json({ error: 'server_error' }, 500));
    }
  },

  async scheduled(event, env) {
    await purgeExpired(env);
  }
};

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return null;
  if (origin === 'https://charles9585.github.io') return origin;
  try {
    const u = new URL(origin);
    if ((u.protocol === 'http:' || u.protocol === 'https:') &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return origin;
    }
  } catch (_) {}
  return null;
}

function corsHeaders(request) {
  const origin = allowedOrigin(request);
  const h = { Vary: 'Origin' };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-Photo-Title';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function withCors(request, response) {
  const h = corsHeaders(request);
  const out = new Headers(response.headers);
  for (const [k, v] of Object.entries(h)) out.set(k, v);
  return new Response(response.body, { status: response.status, headers: out });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}

function publicOrigin(request, env) {
  const fromEnv = (env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin;
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeTitle(raw) {
  let s = String(raw || '').trim();
  try { s = decodeURIComponent(s); } catch (_) {}
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, 80);
  return s || DEFAULT_TITLE;
}

function filenameFor(title) {
  const base = sanitizeTitle(title).replace(/[\\/:*?"<>|]+/g, '').trim() || DEFAULT_TITLE;
  return `${base}.jpg`;
}

function contentDisposition(name) {
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape);
  return `attachment; filename="photo.jpg"; filename*=UTF-8''${encoded}`;
}

function isJpeg(bytes) {
  return bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function tooManyUploads(request) {
  const ip = request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || 'local';
  const bucket = Math.floor(Date.now() / 60000);
  const key = new Request(`https://rate.limit/upload/${encodeURIComponent(ip)}/${bucket}`);
  let n = 0;
  try {
    const hit = await caches.default.match(key);
    if (hit) n = parseInt(await hit.clone().text(), 10) || 0;
  } catch (_) {}
  if (n >= RATE_PER_MIN) return true;
  try {
    await caches.default.put(key, new Response(String(n + 1), {
      headers: { 'Cache-Control': 'max-age=120' }
    }));
  } catch (_) {}
  return false;
}

async function readUpload(request, url) {
  const len = Number(request.headers.get('Content-Length') || '0');
  if (len > MAX_BYTES) return { error: 'too_large', status: 413 };

  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  let bytes;
  let title = url.searchParams.get('title')
    || request.headers.get('X-Photo-Title')
    || '';

  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    if (form.get('title')) title = String(form.get('title'));
    const file = form.get('file') || form.get('photo') || form.get('image')
      || [...form.values()].find((v) => v && typeof v === 'object' && typeof v.arrayBuffer === 'function');
    if (!file || typeof file.arrayBuffer !== 'function') return { error: 'missing_file', status: 400 };
    const fileType = (file.type || '').toLowerCase();
    if (fileType && fileType !== JPEG_TYPE && fileType !== 'image/jpg') {
      return { error: 'unsupported_type', status: 415 };
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    bytes = buf;
  } else if (ct.includes('image/jpeg') || ct.includes('image/jpg') || ct.includes('application/octet-stream') || !ct) {
    if (ct && !ct.includes('image/jpeg') && !ct.includes('image/jpg') && !ct.includes('application/octet-stream')) {
      return { error: 'unsupported_type', status: 415 };
    }
    bytes = new Uint8Array(await request.arrayBuffer());
  } else {
    return { error: 'unsupported_type', status: 415 };
  }

  if (bytes.byteLength > MAX_BYTES) return { error: 'too_large', status: 413 };
  if (bytes.byteLength < 24) return { error: 'invalid_image', status: 400 };
  if (!isJpeg(bytes)) return { error: 'unsupported_type', status: 415 };
  return { bytes, title: sanitizeTitle(title) };
}

async function handleUpload(request, env, url) {
  if (!env.PHOTOS) return json({ error: 'not_configured' }, 500);
  if (await tooManyUploads(request)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const parsed = await readUpload(request, url);
  if (parsed.error) return json({ error: parsed.error }, parsed.status);

  const id = randomId();
  const now = Date.now();
  const expires = now + TTL_MS;

  await env.PHOTOS.put(id, parsed.bytes, {
    expirationTtl: Math.floor(TTL_MS / 1000),
    metadata: {
      created: String(now),
      expires: String(expires),
      title: parsed.title
    }
  });

  const origin = publicOrigin(request, env);
  return json({
    id,
    url: `${origin}/p/${id}`,
    expiresAt: new Date(expires).toISOString()
  }, 201);
}

function metaOf(obj) {
  const m = (obj && obj.metadata) || {};
  return {
    created: Number(m.created || 0),
    expires: Number(m.expires || 0),
    title: sanitizeTitle(m.title)
  };
}

function isExpired(meta) {
  return !meta.expires || Date.now() >= meta.expires;
}

async function loadPhoto(id, env) {
  if (!ID_RE.test(id) || !env.PHOTOS) return null;
  const result = await env.PHOTOS.getWithMetadata(id, { type: 'arrayBuffer' });
  if (result.value == null) return null;
  return { body: result.value, metadata: result.metadata || {} };
}

async function handlePage(id, env, ctx) {
  const obj = await loadPhoto(id, env);
  if (!obj) return htmlPage(gonePage(), 404);
  const meta = metaOf(obj);
  if (isExpired(meta)) {
    if (ctx && ctx.waitUntil) ctx.waitUntil(env.PHOTOS.delete(id));
    return htmlPage(gonePage(), 404);
  }
  return htmlPage(photoPage(id, meta), 200);
}

async function handleImage(id, env, ctx) {
  const obj = await loadPhoto(id, env);
  if (!obj) return new Response('Not found', { status: 404 });
  const meta = metaOf(obj);
  if (isExpired(meta)) {
    if (ctx && ctx.waitUntil) ctx.waitUntil(env.PHOTOS.delete(id));
    return new Response('Not found', { status: 404 });
  }
  const remain = Math.max(60, Math.min(86400, Math.floor((meta.expires - Date.now()) / 1000)));
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': JPEG_TYPE,
      'Content-Disposition': contentDisposition(filenameFor(meta.title)),
      'Cache-Control': `public, max-age=${remain > 3600 ? 3600 : remain}`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

async function purgeExpired(env) {
  if (!env.PHOTOS) return;
  const now = Date.now();
  let cursor;
  do {
    const listed = await env.PHOTOS.list({ cursor, limit: 1000 });
    const dead = [];
    for (const item of listed.keys || []) {
      const expires = Number((item.metadata && item.metadata.expires) || 0);
      if (!expires || now >= expires) dead.push(item.name);
    }
    if (dead.length) await Promise.all(dead.map((key) => env.PHOTOS.delete(key)));
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatMacau(ms) {
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: 'Asia/Macau',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  }).format(new Date(Number(ms))) + '（澳門時間）';
}

function htmlPage(body, status) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY'
    }
  });
}

function pageShell(title, inner) {
  return `<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#fdf6e9">
<title>${escapeHtml(title)}</title>
<style>
  :root { --ink:#3b3024; --bg:#fdf6e9; --accent:#ef8354; --line:#eadcc4; --blue:#1e4b8a; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; background:linear-gradient(160deg,#fdf6e9,#f7e3c8); color:var(--ink);
    font-family:"PingFang HK","PingFang TC","Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;
    padding: calc(16px + env(safe-area-inset-top,0px)) 16px calc(20px + env(safe-area-inset-bottom,0px)); }
  main { max-width: 560px; margin: 0 auto; text-align: center; }
  h1 { margin: 8px 0 4px; font-size: 26px; color: var(--blue); letter-spacing: .04em; }
  .sub { margin: 0 0 16px; font-size: 15px; color: #6b5e4e; }
  img { width: 100%; height: auto; max-height: 70dvh; object-fit: contain; border-radius: 14px; background: #fff;
    box-shadow: 0 8px 28px rgba(90,60,20,.16); }
  .btn { display: inline-flex; align-items: center; justify-content: center; margin: 18px 0 10px;
    min-height: 56px; padding: 0 28px; border-radius: 999px; background: var(--accent); color: #fff;
    font-size: 20px; font-weight: 700; text-decoration: none; box-shadow: 0 4px 0 #c9633a; }
  .btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #c9633a; }
  .note, .expiry { font-size: 15px; line-height: 1.55; color: #6b5e4e; margin: 8px 0; }
  .expiry { font-weight: 700; color: var(--ink); }
  .gone { font-size: 18px; line-height: 1.6; margin-top: 28px; }
</style>
</head>
<body>
<main>${inner}</main>
</body>
</html>`;
}

function photoPage(id, meta) {
  const title = meta.title || DEFAULT_TITLE;
  return pageShell(`${title}｜慈幼中學 120週年`, `
  <h1>慈幼中學 120週年</h1>
  <p class="sub">${escapeHtml(title)}</p>
  <img src="/i/${id}.jpg" alt="${escapeHtml(title)}">
  <p><a class="btn" href="/i/${id}.jpg" download="${escapeHtml(filenameFor(title))}">下載相片</a></p>
  <p class="expiry">此相片將於 ${escapeHtml(formatMacau(meta.expires))} 後自動刪除</p>
  <p class="note">此連結只屬於呢張相片，唔會公開展示。過期後就睇唔到，請盡快下載保存。</p>`);
}

function gonePage() {
  return pageShell('已過期／搵唔到｜慈幼中學 120週年', `
  <h1>慈幼中學 120週年</h1>
  <p class="gone">呢張相片可能已經過期，或者連結唔正確。<br>照片會喺拍攝後 14 日自動刪除。</p>`);
}
