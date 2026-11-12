# 臨時相庫（Cloudflare Worker + KV）

影完相之後，攤位 iPad 會把 JPEG 上傳到呢個 Worker，再用難以猜測嘅連結產生 QR code。訪客用自己電話掃描，就可以喺之後 14 日內查看同下載自己嗰張相。呢度**冇公開相簿、冇列出全部相片嘅接口**。

部署呢個 Worker 需要 Charles 自己嘅免費 Cloudflare 帳戶（用 KV，唔需要開通要綁卡嘅 R2）。未有帳戶之前，前端會保持 `PHOTO_API_BASE` 空白，結果頁只顯示「分享／儲存」，唔會出現壞咗嘅 QR。

## 一次過部署

喺已安裝 Node.js 嘅電腦（或呢個專案嘅 `worker/` 目錄）執行：

```bash
# 1. 登入 Cloudflare（瀏覽器授權；唔好把 API token 寫入前端或呢個 repo）
npx wrangler login

# 2. 建立 KV namespace（只需做一次；把 id 填入 wrangler.toml）
cd /path/to/ar-orchestra-site/worker
npx wrangler kv namespace create ar-orchestra-photos

# 3. 發布 Worker
npx wrangler deploy
```

部署成功後，Wrangler 會顯示公開網址，例如：

`https://ar-orchestra-photos.<你的子域>.workers.dev`

然後：

1. 編輯網站根目錄嘅 `photos-config.js`，將 `PHOTO_API_BASE` 設成呢個網址（唔好加結尾斜線）。
2. 先喺本機用兩部裝置試一次上傳同掃 QR。
3. 確認無誤後，先提交再部署 GitHub Pages（例如執行 `../deploy.sh`）。**唔好把 Cloudflare API token 寫入 `photos-config.js` 或任何前端檔。**

可選：喺 Cloudflare 為呢個 Worker 加自訂網域，並喺 `wrangler.toml` 設定 `PUBLIC_BASE_URL`（QR 同回傳嘅 `url` 就會用呢個網址）。

## 本機測試（唔需要帳戶都可以試 wrangler dev 嘅本地 R2 模擬）

一個終端：

```bash
cd /path/to/ar-orchestra-site/worker
npx wrangler dev
```

預設係 `http://127.0.0.1:8787`。另一個終端提供靜態網站（相機功能要喺 localhost 先用得）：

```bash
cd /path/to/ar-orchestra-site
# 暫時將 photos-config.js 嘅 PHOTO_API_BASE 設成 'http://127.0.0.1:8787'
python3 -m http.server 8080
```

瀏覽器打開 `http://127.0.0.1:8080/`，影一張相。成功嘅話結果頁會出現 QR；用另一部裝置掃描可能掃唔到 `127.0.0.1`（電話打不開電腦嘅 localhost）。可用 curl 驗證：

```bash
# 上載（把 sample.jpg 換做一張 JPEG）
curl -sS -D - -o /tmp/upload.json \
  -H 'Content-Type: image/jpeg' \
  --data-binary @sample.jpg \
  'http://127.0.0.1:8787/upload?title=%E9%9F%B3%E6%A8%82%E8%AA%B2%E5%90%88%E7%85%A7'

# 睇回傳嘅 id / url，再開取相片頁同原圖
# curl -sS -o /tmp/photo.jpg http://127.0.0.1:8787/i/<id>.jpg
# 瀏覽器打開 http://127.0.0.1:8787/p/<id>
```

本機模擬每日清理（清走過期物件）：

```bash
npx wrangler dev --test-scheduled
# 另一個終端：
curl "http://127.0.0.1:8787/__scheduled"
```

測完記得把 `photos-config.js` 改返空字串，除非你已經部署咗正式 Worker 並要提交呢個設定。

## 接口摘要

| 方法 | 路徑 | 說明 |
|---|---|---|
| `POST` | `/upload` | 接受 raw `image/jpeg` 或 multipart 欄位 `file`／`photo`／`image`，最大約 8MB。可選 `?title=` 或表單 `title`。回傳 `{ id, url, expiresAt }`。大約每 IP 每分鐘 30 次。 |
| `GET` | `/p/:id` | 手機友善嘅繁體中文取相片頁（慈幼中學 120週年、下載、到期日）。 |
| `GET` | `/i/:id.jpg` | 原始 JPEG。 |
| 排程 | 每日 00:00（亞洲／澳門） | 刪除已過期物件。 |

`:id` 係 128-bit 隨機值（32 位十六進制）。過期或唔存在都顯示「已過期／搵唔到」，並回傳 404。CORS 允許 `https://charles9585.github.io`，以及本機測試用嘅 `http://127.0.0.1:*`／`http://localhost:*`。
