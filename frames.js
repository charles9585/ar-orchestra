/* Frame styles for 慈幼中學 120th anniversary photo booth.
   Each style exposes { id, name, draw(ctx, W, H, api) }.
   api: { title, crestImg, roundRect, FF, boldText, badge, colours } */
(function (global) {
  'use strict';

  const BLUE = '#1A47A0';
  const RED = '#C8102E';
  const GOLD = '#C9A227';
  const INK = '#5a3e22';
  const CREST_BG = '#000'; // crest PNG has black backdrop – we draw as-is

  const SCHOOL_ZH = '慈幼中學';
  const ANNIV = '120週年';
  const MOTTO = '純潔剛毅';

  function helpers(ctx) {
    const FF = s => `${s}px "FrameHuninn","PingFang HK","PingFang TC","Noto Sans CJK TC","Microsoft JhengHei",sans-serif`;
    const sysFont = s => `bold ${s}px "PingFang HK","PingFang TC","Noto Sans CJK TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
    function roundRect(x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    function boldText(txt, x, y, fs, fill, outline) {
      ctx.font = FF(fs);
      ctx.lineWidth = fs * 0.30; ctx.strokeStyle = outline || '#fff'; ctx.strokeText(txt, x, y);
      ctx.lineWidth = fs * 0.07; ctx.strokeStyle = fill; ctx.strokeText(txt, x, y);
      ctx.fillStyle = fill; ctx.fillText(txt, x, y);
      return ctx.measureText(txt).width;
    }
    function badge(cx, cy, w, h) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = h * 0.15; ctx.shadowOffsetY = h * 0.04;
      ctx.beginPath(); roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.restore();
    }
    function draw120(cx, cy, dfs) {
      const d = ['1', '2', '0'], dc = ['#FF3B30', '#FFB300', '#1E9BFF'];
      ctx.font = FF(dfs);
      const dw = d.map(ch => ctx.measureText(ch).width + dfs * 0.08);
      const tw = dw.reduce((a, b) => a + b, 0);
      let x = cx - tw / 2;
      d.forEach((ch, i) => {
        const px = x + dw[i] / 2, y = cy + dfs * 0.04;
        ctx.font = FF(dfs);
        ctx.lineWidth = dfs * 0.34; ctx.strokeStyle = '#fff'; ctx.strokeText(ch, px, y);
        ctx.lineWidth = dfs * 0.16; ctx.strokeStyle = '#23305a'; ctx.strokeText(ch, px, y);
        ctx.lineWidth = dfs * 0.05; ctx.strokeStyle = dc[i]; ctx.strokeText(ch, px, y);
        ctx.fillStyle = dc[i]; ctx.fillText(ch, px, y);
        x += dw[i];
      });
      return tw;
    }
    function drawCrest(x, y, h) {
      const img = apiCrest;
      if (!img || !img.complete || !img.naturalWidth) return 0;
      const w = h * img.naturalWidth / img.naturalHeight;
      ctx.drawImage(img, x, y - h / 2, w, h);
      return w;
    }
    function fitTitle(title, maxW, baseFs, y) {
      if (!title) return;
      let fs = baseFs;
      ctx.font = sysFont(fs);
      const tw = ctx.measureText(title).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = sysFont(fs); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#fff';
      ctx.strokeText(title, W_title / 2, y);
      ctx.fillStyle = INK; ctx.fillText(title, W_title / 2, y);
    }
    // closures filled by drawFrame wrapper
    let apiCrest = null, W_title = 0;
    return {
      FF, sysFont, roundRect, boldText, badge, draw120, drawCrest, fitTitle,
      setCrest(img) { apiCrest = img; },
      setW(w) { W_title = w; },
      BLUE, RED, GOLD, INK, SCHOOL_ZH, ANNIV, MOTTO
    };
  }

  // Shared metrics from photo size
  function metrics(W, H) {
    const m = Math.min(W, H);
    return { m, t: m * 0.035, band: m * 0.12, r: m * 0.05 };
  }

  /* ---------- 經典：現行四角（純潔 / 120 / 校徽 / 剛毅）+ 底欄標題 ---------- */
  function drawClassic(ctx, W, H, api) {
    const { m, t, band, r } = metrics(W, H);
    const h = helpers(ctx); h.setCrest(api.crestImg); h.setW(W);
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffd6a5'); g.addColorStop(.5, '#fdffb6'); g.addColorStop(1, '#caffbf');
    ctx.beginPath(); ctx.rect(0, 0, W, H); h.roundRect(t, t, W - 2 * t, H - t - band, r);
    ctx.fillStyle = g; ctx.fill('evenodd');
    ctx.beginPath(); h.roundRect(t, t, W - 2 * t, H - t - band, r);
    ctx.lineWidth = m * 0.006; ctx.strokeStyle = '#fff'; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const cfs = band * 0.46, bh = cfs * 1.45, by = t * 0.55 + bh / 2;
    ctx.font = h.FF(cfs); const w1 = ctx.measureText('純潔').width + cfs * 0.9;
    h.badge(t * 0.6 + w1 / 2, by, w1, bh);
    h.boldText('純潔', t * 0.6 + w1 / 2, by + cfs * 0.04, cfs, h.BLUE);

    const dfs = cfs * 1.08;
    ctx.font = h.FF(dfs);
    const dw = ['1', '2', '0'].map(ch => ctx.measureText(ch).width + dfs * 0.08);
    const tw120 = dw.reduce((a, b) => a + b, 0);
    const w2 = tw120 + cfs * 0.9, cx2 = W - t * 0.6 - w2 / 2;
    h.badge(cx2, by, w2, bh);
    h.draw120(cx2, by, dfs);

    const by2 = H - band / 2;
    let leftR = t, rightR = t;
    const cw = h.drawCrest(t * 0.9, by2, band * 0.92);
    if (cw) leftR = t * 0.9 + cw;
    ctx.font = h.FF(cfs); const w4 = ctx.measureText('剛毅').width;
    h.boldText('剛毅', W - t * 0.9 - cfs * 0.15 - w4 / 2, by2 + cfs * 0.04, cfs, h.BLUE);
    rightR = t * 0.9 + cfs * 0.15 + w4;

    const title = (api.title || '').trim();
    if (title) {
      let fs = band * 0.52;
      ctx.font = h.sysFont(fs);
      const side = Math.max(leftR, rightR) + band * 0.25;
      const maxW = Math.max(band, W - 2 * side);
      const tw = ctx.measureText(title).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = h.sysFont(fs); }
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#fff';
      ctx.strokeText(title, W / 2, by2); ctx.fillStyle = h.INK; ctx.fillText(title, W / 2, by2);
    }
    ctx.restore();
  }

  /* ---------- 校慶：頂欄校名+週年、完整校訓、彩色120、校徽+標題底欄（攤位推薦） ---------- */
  function drawAnniversary(ctx, W, H, api) {
    const m = Math.min(W, H);
    const t = m * 0.032, topBand = m * 0.11, botBand = m * 0.13, r = m * 0.045;
    const h = helpers(ctx); h.setCrest(api.crestImg); h.setW(W);
    ctx.save();
    // Cream / soft gold matte with blue accent strip
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fff3d6'); g.addColorStop(0.45, '#ffe8b0'); g.addColorStop(1, '#f5d78e');
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    h.roundRect(t, t + topBand * 0.15, W - 2 * t, H - t - botBand - topBand * 0.15, r);
    ctx.fillStyle = g; ctx.fill('evenodd');
    // Inner white stroke + thin blue line
    ctx.beginPath();
    h.roundRect(t, t + topBand * 0.15, W - 2 * t, H - t - botBand - topBand * 0.15, r);
    ctx.lineWidth = m * 0.008; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath();
    h.roundRect(t + m * 0.01, t + topBand * 0.15 + m * 0.01, W - 2 * t - m * 0.02, H - t - botBand - topBand * 0.15 - m * 0.02, r * 0.85);
    ctx.lineWidth = m * 0.004; ctx.strokeStyle = h.BLUE; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';

    // Top centre banner: 慈幼中學 · 120週年
    const topY = t * 0.55 + topBand * 0.42;
    const bannerFs = topBand * 0.38;
    const bannerTxt = SCHOOL_ZH + '・' + ANNIV;
    ctx.font = h.FF(bannerFs);
    const bw = ctx.measureText(bannerTxt).width + bannerFs * 1.2;
    h.badge(W / 2, topY, Math.min(bw, W - t * 2), bannerFs * 1.5);
    h.boldText(bannerTxt, W / 2, topY + bannerFs * 0.04, bannerFs, h.BLUE);

    // Colourful 120 top-right (slightly overlapping band edge)
    const dfs = topBand * 0.55;
    const tw120 = (() => { ctx.font = h.FF(dfs); return ['1','2','0'].map(c => ctx.measureText(c).width + dfs * 0.08).reduce((a,b)=>a+b,0); })();
    h.badge(W - t * 0.7 - (tw120 + dfs * 0.7) / 2, topY, tw120 + dfs * 0.7, dfs * 1.35);
    h.draw120(W - t * 0.7 - (tw120 + dfs * 0.7) / 2, topY, dfs);

    // Motto badge top-left
    const mfs = topBand * 0.36;
    ctx.font = h.FF(mfs); const mw = ctx.measureText(MOTTO).width + mfs * 0.9;
    h.badge(t * 0.7 + mw / 2, topY, mw, mfs * 1.5);
    h.boldText(MOTTO, t * 0.7 + mw / 2, topY + mfs * 0.04, mfs, h.RED);

    // Bottom: crest | title | small 純潔／剛毅 split optional — crest + title
    const by2 = H - botBand / 2;
    let leftR = t;
    const cw = h.drawCrest(t * 0.85, by2, botBand * 0.88);
    if (cw) leftR = t * 0.85 + cw;

    // Small school blue tag on bottom-right: 校慶
    const tagFs = botBand * 0.32;
    ctx.font = h.FF(tagFs);
    const tag = '校慶';
    const tagW = ctx.measureText(tag).width + tagFs * 0.85;
    h.badge(W - t * 0.85 - tagW / 2, by2, tagW, tagFs * 1.45);
    h.boldText(tag, W - t * 0.85 - tagW / 2, by2 + tagFs * 0.04, tagFs, h.BLUE);
    const rightR = t * 0.85 + tagW;

    const title = (api.title || '').trim();
    if (title) {
      let fs = botBand * 0.48;
      ctx.font = h.sysFont(fs);
      const side = Math.max(leftR, rightR) + botBand * 0.2;
      const maxW = Math.max(botBand, W - 2 * side);
      const tw = ctx.measureText(title).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = h.sysFont(fs); }
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#fff';
      ctx.strokeText(title, W / 2, by2); ctx.fillStyle = h.INK; ctx.fillText(title, W / 2, by2);
    }
    ctx.restore();
  }

  /* ---------- 簡約：奶白底欄 + 幼藍雙線，小校徽／校訓／120，突出主體 ---------- */
  function drawMinimal(ctx, W, H, api) {
    const m = Math.min(W, H);
    const t = m * 0.03, band = m * 0.105, r = m * 0.035;
    const h = helpers(ctx); h.setCrest(api.crestImg); h.setW(W);
    ctx.save();
    // Cream matte (readable on any photo)
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    h.roundRect(t, t, W - 2 * t, H - t - band, r);
    ctx.fillStyle = '#f4efe6'; ctx.fill('evenodd');
    // Double blue line around photo
    ctx.beginPath(); h.roundRect(t, t, W - 2 * t, H - t - band, r);
    ctx.lineWidth = m * 0.0055; ctx.strokeStyle = BLUE; ctx.stroke();
    ctx.beginPath();
    h.roundRect(t + m * 0.012, t + m * 0.012, W - 2 * t - m * 0.024, H - t - band - m * 0.024, r * 0.8);
    ctx.lineWidth = m * 0.0025; ctx.strokeStyle = 'rgba(26,71,160,.4)'; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';

    // Top badges straddling border
    const cfs = band * 0.38, bh = cfs * 1.4, by = t * 0.55 + bh / 2;
    ctx.font = h.FF(cfs);
    const mw = ctx.measureText(MOTTO).width + cfs * 0.85;
    h.badge(t * 0.65 + mw / 2, by, mw, bh);
    h.boldText(MOTTO, t * 0.65 + mw / 2, by + cfs * 0.04, cfs, BLUE);

    const dfs = cfs * 1.05;
    ctx.font = h.FF(dfs);
    const tw120 = ctx.measureText('120').width + cfs * 0.7;
    h.badge(W - t * 0.65 - tw120 / 2, by, tw120, bh);
    h.boldText('120', W - t * 0.65 - tw120 / 2, by + dfs * 0.04, dfs, BLUE);

    // Bottom: crest + title (school name via crest)
    const by2 = H - band / 2;
    let leftR = t;
    // white disc behind crest to hide PNG black backdrop
    const crestH = band * 0.88;
    if (api.crestImg && api.crestImg.complete && api.crestImg.naturalWidth) {
      const cw0 = crestH * api.crestImg.naturalWidth / api.crestImg.naturalHeight;
      ctx.save();
      ctx.beginPath();
      ctx.arc(t * 0.85 + cw0 / 2, by2, crestH * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    }
    const cw = h.drawCrest(t * 0.85, by2, crestH);
    if (cw) leftR = t * 0.85 + cw;

    const title = (api.title || '').trim();
    if (title) {
      let fs = band * 0.48;
      ctx.font = h.sysFont(fs);
      const side = leftR + band * 0.25;
      const maxW = Math.max(band, W - side - t * 1.2);
      const tw = ctx.measureText(title).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = h.sysFont(fs); }
      ctx.textAlign = 'center';
      ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#fff';
      ctx.strokeText(title, (leftR + W - t) / 2, by2);
      ctx.fillStyle = INK; ctx.fillText(title, (leftR + W - t) / 2, by2);
    }
    ctx.restore();
  }

  /* ---------- 全幅：校藍寬邊、頂校名、左右校訓、底校徽+標題+彩色120 ---------- */
  function drawFull(ctx, W, H, api) {
    const m = Math.min(W, H);
    const side = m * 0.072, top = m * 0.09, bot = m * 0.11, r = m * 0.04;
    const h = helpers(ctx); h.setCrest(api.crestImg); h.setW(W);
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1A47A0'); g.addColorStop(0.4, '#2a5fc4'); g.addColorStop(0.75, '#1A47A0'); g.addColorStop(1, '#0f2f70');
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    h.roundRect(side, top, W - 2 * side, H - top - bot, r);
    ctx.fillStyle = g; ctx.fill('evenodd');
    // Gold + white inner strokes
    ctx.beginPath(); h.roundRect(side, top, W - 2 * side, H - top - bot, r);
    ctx.lineWidth = m * 0.006; ctx.strokeStyle = GOLD; ctx.stroke();
    ctx.beginPath();
    h.roundRect(side + m * 0.01, top + m * 0.01, W - 2 * side - m * 0.02, H - top - bot - m * 0.02, r * 0.85);
    ctx.lineWidth = m * 0.002; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';

    // Top: school + anniversary
    const topFs = top * 0.42;
    h.boldText(SCHOOL_ZH + '  ' + ANNIV, W / 2, top * 0.52, topFs, '#fff', 'rgba(0,0,0,.35)');

    // Side motto on blue border with pill badges
    const sideFs = side * 0.55;
    ctx.font = h.FF(sideFs);
    const pillW = ctx.measureText('純潔').width + sideFs * 0.7;
    const pillH = sideFs * 1.45;
    h.badge(side * 0.5, H * 0.42, Math.min(pillW, side * 0.92), pillH);
    h.boldText('純潔', side * 0.5, H * 0.42 + sideFs * 0.04, sideFs, BLUE);
    h.badge(W - side * 0.5, H * 0.42, Math.min(pillW, side * 0.92), pillH);
    h.boldText('剛毅', W - side * 0.5, H * 0.42 + sideFs * 0.04, sideFs, BLUE);

    // Bottom band: crest | title | colourful 120
    const by = H - bot * 0.5;
    const crestH = bot * 0.82;
    let leftR = side * 0.2;
    if (api.crestImg && api.crestImg.complete && api.crestImg.naturalWidth) {
      const cw0 = crestH * api.crestImg.naturalWidth / api.crestImg.naturalHeight;
      ctx.save();
      ctx.beginPath();
      ctx.arc(side * 0.25 + cw0 / 2, by, crestH * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
      const cw = h.drawCrest(side * 0.25, by, crestH);
      if (cw) leftR = side * 0.25 + cw;
    }

    const dfs = bot * 0.48;
    ctx.font = h.FF(dfs);
    const tw120 = ['1', '2', '0'].map(c => ctx.measureText(c).width + dfs * 0.08).reduce((a, b) => a + b, 0);
    const cx120 = W - side * 0.25 - tw120 / 2;
    h.draw120(cx120, by, dfs);
    const rightR = side * 0.25 + tw120;

    const title = (api.title || '').trim();
    if (title) {
      let fs = bot * 0.42;
      ctx.font = h.sysFont(fs);
      const maxW = Math.max(bot, W - leftR - rightR - bot * 0.3);
      const tw = ctx.measureText(title).width;
      if (tw > maxW) { fs *= maxW / tw; ctx.font = h.sysFont(fs); }
      ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.strokeText(title, W / 2, by);
      ctx.fillStyle = '#fff'; ctx.fillText(title, W / 2, by);
    }
    ctx.restore();
  }

  const FRAME_STYLES = [
    { id: 'classic', name: '經典', draw: drawClassic },
    { id: 'anniversary', name: '校慶', draw: drawAnniversary },
    { id: 'minimal', name: '簡約', draw: drawMinimal },
    { id: 'full', name: '全幅', draw: drawFull }
  ];

  const BY_ID = Object.fromEntries(FRAME_STYLES.map(s => [s.id, s]));

  global.FRAME_STYLES = FRAME_STYLES;
  global.FRAME_STYLE_BY_ID = BY_ID;
  global.FRAME_DEFAULT_ID = 'anniversary';
  global.FRAME_SCHOOL = { zh: SCHOOL_ZH, motto: MOTTO, anniv: ANNIV, en: 'Salesian English School' };
})(typeof window !== 'undefined' ? window : globalThis);
