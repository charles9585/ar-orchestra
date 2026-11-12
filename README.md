# 樂器合照 (AR Orchestra photo booth)
Plain HTML/CSS/JS, no build step. Serve the folder over HTTPS (camera requires it) and open `index.html`.
- `index.html`, `style.css`, `app.js` – the app; `instruments.js` – list of the 16 instruments (sizes in mm)
- `assets/*.png` – the teacher's own drawings for all 16 instruments, processed with `tools/cutout.py`
  (hand-picked see-through gaps: `tools/brass-gaps.sh`, `tools/percussion-gaps.sh`); old placeholder SVGs in `tools/original-svg/`
- `sw.js`, `manifest.webmanifest` – offline cache + "Add to Home Screen"
- `tools/headless-test.js` – Puppeteer test with Chrome's fake camera
To host permanently: upload this folder to GitHub Pages / Netlify Drop / Cloudflare Pages (any static host with HTTPS).

## Photo frame

The 🖼️ 相框 toggle adds a frame with an editable title and four corner decorations: 純潔 (top-left), a colourful 120 (top-right), the school crest (bottom-left) and 剛毅 (bottom-right). They appear in the preview and in the saved photo at full resolution. The crest is `assets/crest.png` and the corner font is `fonts/huninn-frame.woff2`; both are cached for offline use.

## Photo orientation

The 直度 / 橫度 switch beside 相框 sets the photo to a 3:4 portrait or 4:3 landscape shape, however the phone is held. The preview and the saved photo both use a centre crop of the camera at its full resolution, with no stretching. Instruments keep their place relative to the visible photo area, and the app remembers the choice on that device (`localStorage` key `arOrchestra.orient`).

## 臨時 QR 取相

影完相之後，可以上載到 Cloudflare Worker + R2 臨時相庫（保留 14 日），結果頁顯示大型 QR，訪客用自己電話掃描帶走個人相片。連結係難以猜測嘅獨立網址，冇公開相簿。詳情同部署步驟見 `worker/README.md`。

前端設定喺 `photos-config.js` 嘅 `PHOTO_API_BASE`。留空就跳過上載，只保留「分享／儲存」。
