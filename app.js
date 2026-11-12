/* 樂器合照 – AR-style instrument photo booth. Plain JS, no build step. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#video'), vwrap = $('#vwrap'), stage = $('#stage'), layer = $('#layer'), touch = $('#touch');
  const frameCanvas = $('#frameCanvas'), selbar = $('#selbar');
  const INST = window.INSTRUMENTS, GROUPS = window.GROUPS;
  const BYID = Object.fromEntries(INST.map(i => [i.id, i]));
  const MAX_W_MM = Math.max(...INST.map(i => i.w)), MAX_H_MM = Math.max(...INST.map(i => i.h));
  const MIN_FRAC = 0.24; // tiny instruments (castanets, triangle) get at least this size so kids can see them

  const ORIENT_KEY = 'arOrchestra.orient', FRAME_STYLE_KEY = 'arOrchestra.frameStyle', RATIO = { portrait: 3 / 4, landscape: 4 / 3 }; // photo width / height
  let savedOrient = null, savedFrameStyle = null;
  try { savedOrient = localStorage.getItem(ORIENT_KEY); } catch (e) {}
  try { savedFrameStyle = localStorage.getItem(FRAME_STYLE_KEY); } catch (e) {}
  const frameStyles = window.FRAME_STYLES || [];
  const frameById = window.FRAME_STYLE_BY_ID || {};
  const defaultFrameId = window.FRAME_DEFAULT_ID || 'anniversary';
  const initialFrameStyle = (savedFrameStyle && frameById[savedFrameStyle]) ? savedFrameStyle : defaultFrameId;
  const state = { stream: null, facing: 'user', mirror: true, items: [], selected: null, timer: false, busy: false, frame: false, title: '音樂課合照',
    orient: savedOrient === 'landscape' ? 'landscape' : 'portrait', frameStyle: initialFrameStyle };
  let nextId = 1;

  // ---------- assets (images + alpha masks for accurate hit testing) ----------
  const imgs = {}, masks = {};
  INST.forEach(inst => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      const M = 200, sc = M / Math.max(inst.w, inst.h);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(inst.w * sc)); c.height = Math.max(1, Math.round(inst.h * sc));
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
      try { masks[inst.id] = { w: c.width, h: c.height, a: x.getImageData(0, 0, c.width, c.height).data }; } catch (e) { /* ignore */ }
    };
    im.src = inst.src; imgs[inst.id] = im;
  });

  // ---------- geometry ----------
  // Centre crop of the camera frame (in video px) with the chosen photo ratio (直度 3:4 / 橫度 4:3).
  function cropRect() {
    const vw = video.videoWidth, vh = video.videoHeight, A = RATIO[state.orient];
    if (!vw || !vh) return null;
    let w = vw, h = vh;
    if (vw / vh > A) w = Math.round(vh * A); else h = Math.round(vw / A);
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h, vw, vh };
  }
  // Rect (in stage px) of the visible photo area: the crop ratio fitted (contain) into the stage.
  function videoRect() {
    const W = stage.clientWidth, H = stage.clientHeight, A = RATIO[state.orient];
    const s = Math.min(W / A, H), w = A * s, h = s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  // Show only the cropped part of the video inside the photo area (no stretching).
  function layoutVideo(R) {
    Object.assign(vwrap.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px' });
    const C = cropRect(); if (!C) return;
    const k = R.w / C.w;
    Object.assign(video.style, { width: C.vw * k + 'px', height: C.vh * k + 'px', left: -C.x * k + 'px', top: -C.y * k + 'px' });
  }
  // pixels per millimetre for a picture of size w×h – same formula on screen and in the capture => WYSIWYG
  function pxPerMM(w, h) { return Math.min(h * 0.85 / MAX_H_MM, w * 0.95 / MAX_W_MM); }
  function baseSize(inst, w, h) {
    let k = pxPerMM(w, h);
    const minSide = Math.min(w, h) * MIN_FRAC, big = Math.max(inst.w, inst.h) * k;
    if (big < minSide) k *= minSide / big;
    return { w: inst.w * k, h: inst.h * k };
  }

  // ---------- items ----------
  function addItem(id) {
    const inst = BYID[id]; if (!inst) return;
    const el = document.createElement('div'); el.className = 'item';
    const img = document.createElement('img'); img.src = inst.src; img.alt = inst.name; img.draggable = false;
    el.appendChild(img); layer.insertBefore(el, frameCanvas);
    const n = state.items.length;
    const item = { uid: nextId++, id, el, nx: 0.5 + ((n % 5) - 2) * 0.06, ny: 0.5 + ((Math.floor(n / 5) % 3) - 1) * 0.08, s: 1, rot: 0, flip: 1 };
    state.items.push(item); layoutItem(item); select(item);
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    return item;
  }
  function layoutItem(it, R) {
    R = R || videoRect();
    const b = baseSize(BYID[it.id], R.w, R.h);
    it.el.style.width = b.w + 'px'; it.el.style.height = b.h + 'px';
    it.el.style.transform = `translate(${it.nx * R.w - b.w / 2}px,${it.ny * R.h - b.h / 2}px) rotate(${it.rot}rad) scale(${it.s * it.flip},${it.s})`;
    it.el.style.zIndex = state.items.indexOf(it) + 1;
  }
  function layoutAll() {
    const R = videoRect(); layoutVideo(R);
    Object.assign(layer.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px' });
    state.items.forEach(it => layoutItem(it, R));
    drawFrameOverlay(R);
  }
  function select(it) {
    state.selected = it;
    state.items.forEach(i => i.el.classList.toggle('sel', i === it));
    selbar.hidden = !it;
  }
  function removeItem(it) {
    it.el.remove(); state.items = state.items.filter(i => i !== it);
    if (state.selected === it) select(null);
    layoutAll();
  }
  function toFront(it) { state.items = state.items.filter(i => i !== it); state.items.push(it); layoutAll(); }
  function clamp(it) {
    it.nx = Math.min(1, Math.max(0, it.nx)); it.ny = Math.min(1, Math.max(0, it.ny));
    it.s = Math.min(6, Math.max(0.2, it.s));
  }

  // Hit test using alpha masks so transparent parts of a big instrument don't block others.
  function hitTest(px, py) {
    const R = videoRect(), x = px - R.x, y = py - R.y;
    const tol = 14; // screen px of tolerance so thin instruments (flute, triangle) are easy to grab
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i], b = baseSize(BYID[it.id], R.w, R.h), m = masks[it.id];
      const cx = it.nx * R.w, cy = it.ny * R.h, c = Math.cos(-it.rot), s = Math.sin(-it.rot);
      const pts = [[0, 0], [tol, 0], [-tol, 0], [0, tol], [0, -tol], [tol * .7, tol * .7], [-tol * .7, tol * .7], [tol * .7, -tol * .7], [-tol * .7, -tol * .7]];
      for (const [ox, oy] of pts) {
        const dx = x + ox - cx, dy = y + oy - cy;
        let lx = (dx * c - dy * s) / (it.s * it.flip) + b.w / 2, ly = (dx * s + dy * c) / it.s + b.h / 2;
        if (lx < 0 || ly < 0 || lx >= b.w || ly >= b.h) continue;
        if (!m) return it;
        const mx = Math.floor(lx / b.w * m.w), my = Math.floor(ly / b.h * m.h);
        if (m.a[(my * m.w + mx) * 4 + 3] > 30) return it;
      }
    }
    return null;
  }

  // ---------- gestures (Pointer Events: works on iOS 13+, Android, desktop) ----------
  const pointers = new Map();
  let gest = null; // {item, base:{nx,ny,s,rot}, pts:[{x,y}], moved}
  function stagePt(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function rebase() {
    if (!gest || !gest.item) return;
    const it = gest.item;
    gest.base = { nx: it.nx, ny: it.ny, s: it.s, rot: it.rot };
    gest.pts = [...pointers.values()].slice(0, 2).map(p => ({ x: p.x, y: p.y }));
  }
  touch.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { touch.setPointerCapture(e.pointerId); } catch (_) {}
    const p = stagePt(e); pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const it = hitTest(p.x, p.y);
      gest = { item: it, moved: false, start: p, t: Date.now() };
      if (it) { select(it); if (state.items[state.items.length - 1] !== it) toFront(it); }
    } else if (gest && !gest.item && state.selected) {
      gest.item = state.selected; // two fingers anywhere => pinch/rotate the selected instrument
    }
    rebase();
  });
  touch.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, stagePt(e));
    if (!gest || !gest.item || !gest.pts) return;
    const it = gest.item, R = videoRect(), cur = [...pointers.values()].slice(0, 2);
    if (cur.length === 1 || gest.pts.length === 1) {
      const dx = cur[0].x - gest.pts[0].x, dy = cur[0].y - gest.pts[0].y;
      if (Math.abs(dx) + Math.abs(dy) > 3) gest.moved = true;
      it.nx = gest.base.nx + dx / R.w; it.ny = gest.base.ny + dy / R.h;
    } else {
      const [a0, b0] = gest.pts, [a1, b1] = cur;
      const c0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, c1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
      const r0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), r1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
      it.s = gest.base.s * d1 / d0; it.rot = gest.base.rot + (r1 - r0);
      it.nx = gest.base.nx + (c1.x - c0.x) / R.w; it.ny = gest.base.ny + (c1.y - c0.y) / R.h;
      gest.moved = true;
    }
    clamp(it); layoutItem(it, R);
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (gest && !gest.item && !gest.moved && Date.now() - gest.t < 500) select(null); // tap on empty space
      gest = null;
    } else rebase();
  }
  touch.addEventListener('pointerup', endPointer);
  touch.addEventListener('pointercancel', endPointer);
  touch.addEventListener('lostpointercapture', endPointer);
  // desktop: wheel = scale, shift+wheel = rotate
  touch.addEventListener('wheel', e => {
    const p = stagePt(e), it = hitTest(p.x, p.y) || state.selected; if (!it) return;
    e.preventDefault(); select(it);
    if (e.shiftKey) it.rot += (e.deltaY || e.deltaX) * 0.003; else it.s *= Math.exp(-e.deltaY * 0.0015);
    clamp(it); layoutItem(it);
  }, { passive: false });
  // stop iOS page pinch-zoom
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));

  selbar.addEventListener('click', e => {
    const b = e.target.closest('button'); const it = state.selected; if (!b || !it) return;
    const a = b.dataset.act;
    if (a === 'bigger') it.s *= 1.2; else if (a === 'smaller') it.s /= 1.2;
    else if (a === 'rotl') it.rot -= Math.PI / 12; else if (a === 'rotr') it.rot += Math.PI / 12;
    else if (a === 'flip') it.flip *= -1; else if (a === 'front') toFront(it);
    else if (a === 'delete') return removeItem(it);
    clamp(it); layoutItem(it);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) removeItem(state.selected);
  });

  // ---------- picker ----------
  const tabs = $('#tabs'), picker = $('#picker');
  function showGroup(gid) {
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.g === gid));
    picker.innerHTML = '';
    INST.filter(i => i.group === gid).forEach(i => {
      const b = document.createElement('button'); b.className = 'inst'; b.dataset.id = i.id; b.setAttribute('aria-label', '加入' + i.name);
      b.innerHTML = `<img src="${i.src}" alt=""><span>${i.name}</span>`;
      b.addEventListener('click', () => addItem(i.id));
      picker.appendChild(b);
    });
  }
  GROUPS.forEach(g => {
    const b = document.createElement('button'); b.dataset.g = g.id; b.textContent = g.name; b.setAttribute('role', 'tab');
    b.style.background = g.color; b.addEventListener('click', () => showGroup(g.id)); tabs.appendChild(b);
  });
  showGroup(GROUPS[0].id);
  $('#clearBtn').addEventListener('click', () => {
    if (!state.items.length) return;
    if (!confirm('要清除畫面上所有樂器嗎？')) return;
    state.items.slice().forEach(removeItem);
  });

  // ---------- photo frame ----------
  const frameToggle = $('#frameToggle'), titleInput = $('#titleInput'), frameStyleRow = $('#frameStyles');
  function syncFrameUi() {
    titleInput.disabled = !state.frame;
    if (frameStyleRow) frameStyleRow.hidden = !state.frame;
  }
  frameToggle.addEventListener('change', () => { state.frame = frameToggle.checked; syncFrameUi(); layoutAll(); });
  titleInput.addEventListener('input', () => { state.title = titleInput.value; layoutAll(); });
  const crestImg = new Image(); crestImg.onload = () => layoutAll(); crestImg.src = 'assets/crest.png';
  let frameFontReady = Promise.resolve();
  if (window.FontFace && document.fonts) {
    const ff = new FontFace('FrameHuninn', "url(fonts/huninn-frame.woff2) format('woff2')");
    frameFontReady = ff.load().then(f => { document.fonts.add(f); layoutAll(); }).catch(() => {});
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function setFrameStyle(id, save) {
    const style = frameById[id] || frameById[defaultFrameId] || frameStyles[0];
    if (!style) return;
    state.frameStyle = style.id;
    if (frameStyleRow) {
      frameStyleRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.style === state.frameStyle)));
    }
    if (save) try { localStorage.setItem(FRAME_STYLE_KEY, state.frameStyle); } catch (e) {}
    layoutAll();
  }
  if (frameStyleRow) {
    frameStyleRow.innerHTML = '';
    frameStyles.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.style = s.id;
      b.textContent = s.name; b.setAttribute('aria-label', '相框樣式 ' + s.name);
      b.addEventListener('click', () => setFrameStyle(s.id, true));
      frameStyleRow.appendChild(b);
    });
  }
  setFrameStyle(state.frameStyle, false);
  syncFrameUi();
  function drawFrame(ctx, W, H) {
    if (!state.frame) return;
    const style = frameById[state.frameStyle] || frameById[defaultFrameId] || frameStyles[0];
    if (!style || typeof style.draw !== 'function') return;
    style.draw(ctx, W, H, { title: state.title, crestImg, roundRect });
  }
  function drawFrameOverlay(R) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    frameCanvas.width = Math.max(1, Math.round(R.w * dpr)); frameCanvas.height = Math.max(1, Math.round(R.h * dpr));
    const ctx = frameCanvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, R.w, R.h);
    drawFrame(ctx, R.w, R.h);
  }

  // ---------- photo orientation (直度 / 橫度) ----------
  const orientBtns = [...document.querySelectorAll('#orientSeg button')];
  function setOrient(o, save) {
    state.orient = o === 'landscape' ? 'landscape' : 'portrait';
    orientBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.o === state.orient)));
    if (save) try { localStorage.setItem(ORIENT_KEY, state.orient); } catch (e) {}
    layoutAll(); // items keep their position relative to the visible photo area (nx, ny)
  }
  orientBtns.forEach(b => b.addEventListener('click', () => setOrient(b.dataset.o, true)));
  setOrient(state.orient, false);
  video.addEventListener('resize', () => layoutAll()); // camera switched / rotated

  // ---------- camera ----------
  const startMsg = $('#startMsg');
  async function startCamera(facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(location.protocol !== 'https:' ? '需要用 https 網址先可以開相機。' : '呢個瀏覽器唔支援相機，請用 Safari 或 Chrome。');
    }
    const old = state.stream;
    if (old) old.getTracks().forEach(t => t.stop());
    const tries = [
      { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: facing }, audio: false },
      { video: true, audio: false }];
    let stream, err;
    for (const c of tries) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { err = e; if (e && e.name === 'NotAllowedError') break; } }
    if (!stream) throw err;
    state.stream = stream; state.facing = facing;
    const st = stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings() : {};
    // mirror like a real selfie camera for the front camera (and for desktop webcams with no facingMode info)
    state.mirror = st.facingMode ? st.facingMode === 'user' : facing === 'user';
    video.classList.toggle('mirror', state.mirror);
    video.srcObject = stream;
    await new Promise(res => { if (video.readyState >= 1 && video.videoWidth) res(); else video.onloadedmetadata = () => res(); });
    try { await video.play(); } catch (e) {}
    layoutAll();
  }
  function camError(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return '未有相機權限。請喺瀏覽器設定容許使用相機，然後重新載入。';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return '搵唔到相機。';
    if (n === 'NotReadableError') return '相機正被其他 App 使用，請關閉後再試。';
    return (e && e.message) || '開唔到相機，請再試一次。';
  }
  $('#startBtn').addEventListener('click', async () => {
    startMsg.textContent = '開緊相機…';
    try {
      await startCamera('user');
      $('#startScreen').hidden = true; startMsg.textContent = '';
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (devs.filter(d => d.kind === 'videoinput').length < 2) $('#switchBtn').classList.add('nocam');
      } catch (e) {}
    } catch (e) { startMsg.textContent = camError(e); }
  });
  $('#switchBtn').addEventListener('click', async () => {
    const want = state.facing === 'user' ? 'environment' : 'user';
    try { await startCamera(want); } catch (e) { try { await startCamera(state.facing); } catch (_) {} alert(camError(e)); }
  });
  video.addEventListener('resize', layoutAll);
  window.addEventListener('resize', () => requestAnimationFrame(layoutAll));
  window.addEventListener('orientationchange', () => setTimeout(layoutAll, 300));
  if (window.ResizeObserver) new ResizeObserver(() => layoutAll()).observe(stage);

  // ---------- capture ----------
  function composite() {
    const C = cropRect();
    if (!C) throw new Error('相機未準備好');
    const vw = C.w, vh = C.h;                                   // photo = centre crop at the camera's native resolution
    const c = document.createElement('canvas'); c.width = vw; c.height = vh;
    const ctx = c.getContext('2d');
    ctx.save();
    if (state.mirror) { ctx.translate(vw, 0); ctx.scale(-1, 1); } // match the mirrored preview (crop is centred, so it mirrors onto itself)
    ctx.drawImage(video, C.x, C.y, C.w, C.h, 0, 0, vw, vh);
    ctx.restore();
    state.items.forEach(it => {
      const inst = BYID[it.id], b = baseSize(inst, vw, vh);
      ctx.save(); ctx.translate(it.nx * vw, it.ny * vh); ctx.rotate(it.rot); ctx.scale(it.s * it.flip, it.s);
      ctx.drawImage(imgs[it.id], -b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    });
    drawFrame(ctx, vw, vh);
    return c;
  }
  const result = $('#result'), resultImg = $('#resultImg'), shareBtn = $('#shareBtn'), dl = $('#downloadLink');
  const resultHint = $('#resultHint'), qrPanel = $('#qrPanel'), qrCode = $('#qrCode'), qrStatus = $('#qrStatus'), qrCaption = $('#qrCaption');
  let lastFile = null, lastUrl = null, uploadCtl = null;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
  function apiBase() {
    const raw = String(window.PHOTO_API_BASE || '').trim().replace(/\/$/, '');
    if (!raw || !/^https?:\/\//i.test(raw)) return '';
    return raw;
  }
  function resetQr() {
    if (uploadCtl) { try { uploadCtl.abort(); } catch (e) {} uploadCtl = null; }
    if (!qrPanel) return;
    qrPanel.hidden = true;
    if (qrCode) { qrCode.hidden = true; qrCode.innerHTML = ''; }
    if (qrCaption) qrCaption.hidden = true;
    if (qrStatus) { qrStatus.hidden = true; qrStatus.textContent = ''; }
  }
  function showQrPreparing() {
    qrPanel.hidden = false;
    qrCode.hidden = true; qrCode.innerHTML = '';
    qrCaption.hidden = true;
    qrStatus.hidden = false;
    qrStatus.textContent = '準備緊 QR code…';
  }
  function showQr(url) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrCode.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: '帶走相片的 QR code' });
    qrCode.hidden = false;
    qrCaption.hidden = false;
    qrStatus.hidden = true;
  }
  function showQrFail() {
    qrPanel.hidden = true;
    qrCode.hidden = true; qrCode.innerHTML = '';
    qrCaption.hidden = true;
    qrStatus.hidden = true;
    resultHint.textContent = '暫時出唔到 QR，請用分享或儲存帶走相片';
  }
  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀唔到相片')); };
      img.src = url;
    });
  }
  async function maybeCompress(blob) {
    const LIMIT = 800 * 1024, MAX_EDGE = 2048;
    try {
      const img = await loadImageFromBlob(blob);
      const w = img.naturalWidth, h = img.naturalHeight, edge = Math.max(w, h);
      if (edge <= MAX_EDGE && blob.size <= LIMIT) return blob;
      const scale = edge > MAX_EDGE ? MAX_EDGE / edge : 1;
      const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      const cnv = document.createElement('canvas'); cnv.width = cw; cnv.height = ch;
      cnv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      const out = await new Promise(r => cnv.toBlob(r, 'image/jpeg', 0.85));
      return (out && out.size && out.size < blob.size) ? out : blob;
    } catch (e) { return blob; }
  }
  async function uploadForQr(blob, title) {
    const base = apiBase();
    if (!base) return;
    if (typeof qrcode !== 'function') { showQrFail(); return; }
    showQrPreparing();
    const ctl = new AbortController();
    uploadCtl = ctl;
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const body = await maybeCompress(blob);
      if (ctl.signal.aborted) return;
      const url = base + '/upload?title=' + encodeURIComponent(title || '音樂課合照');
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body, signal: ctl.signal });
      if (!res.ok) throw new Error('upload ' + res.status);
      const data = await res.json();
      if (!data || !data.url) throw new Error('no url');
      if (uploadCtl !== ctl) return;
      showQr(data.url);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (uploadCtl !== ctl) return;
      showQrFail();
    } finally {
      clearTimeout(t);
      if (uploadCtl === ctl) uploadCtl = null;
    }
  }
  async function takePhoto() {
    if (state.busy || !state.stream) return; state.busy = true;
    try {
      if (state.timer) {
        const cd = $('#countdown'); cd.hidden = false;
        for (let n = 3; n > 0; n--) { cd.textContent = n; await new Promise(r => setTimeout(r, 1000)); }
        cd.hidden = true;
      }
      const f = $('#flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
      await Promise.race([frameFontReady, new Promise(r => setTimeout(r, 1500))]);
      const c = composite(); window.__lastCapture = c;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      const name = `音樂課合照-${stamp()}.jpg`;
      lastFile = new File([blob], name, { type: 'image/jpeg' });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      resultImg.src = lastUrl; dl.href = lastUrl; dl.download = name;
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [lastFile] }));
      shareBtn.hidden = !canShare;
      dl.hidden = isIOS && canShare; // on iOS the share sheet (「儲存影像」) or long-press is the way to save
      resultHint.textContent = isIOS ? '相片完成！長按相片可以「加入照片」，或者㩒「分享 / 儲存」。' : '相片完成！可以分享或者下載。';
      resetQr();
      result.hidden = false;
      uploadForQr(blob, state.title || '音樂課合照');
    } catch (e) { alert('影相失敗：' + (e.message || e)); }
    finally { state.busy = false; }
  }
  $('#shutter').addEventListener('click', takePhoto);
  $('#timerBtn').addEventListener('click', e => {
    state.timer = !state.timer; const b = e.currentTarget;
    b.setAttribute('aria-pressed', state.timer); b.querySelector('.lbl').textContent = state.timer ? '倒數 3秒' : '倒數 關';
  });
  shareBtn.addEventListener('click', async () => {
    try { await navigator.share({ files: [lastFile], title: state.title || '音樂課合照' }); }
    catch (e) { if (e && e.name !== 'AbortError') { dl.hidden = false; alert('分享唔到，請用「下載相片」或長按相片儲存。'); } }
  });
  $('#againBtn').addEventListener('click', () => { resetQr(); result.hidden = true; });

  // ---------- help ----------
  $('#helpBtn').addEventListener('click', () => { $('#help').hidden = false; });
  $('#helpClose').addEventListener('click', () => { $('#help').hidden = true; });

  // ---------- offline ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
    // when a new version (new artwork) takes over, reload once so the page uses the fresh files
    let reloaded = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !state.stream) { reloaded = true; location.reload(); } });
  }
  // test hook
  window.__app = { state, addItem, composite, layoutAll, videoRect, cropRect, setOrient, select };
  layoutAll();
})();
