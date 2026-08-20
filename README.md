# GS Bridge V0.2.2 中文版 — SuperSplat × KIRI

## 結論
這版是可部署到 Netlify 的 **V0.2 架構版**。

它有兩條載入路徑：

1. **SuperSplat Published Scene**
   - 輸入 `https://superspl.at/scene/<id>`
   - 使用 SuperSplat hosted runtime 播放。
   - 這條路徑不嘗試逆向或抓取 SuperSplat 私有 CDN / scene API。

2. **Direct Asset / Self-hosted Viewer**
   - 輸入你自己可公開存取的 `.sog`, `.lod-meta.json`, `.meta.json`, `.ply`, `.compressed.ply`
   - 由 Netlify build 時安裝官方 `@playcanvas/supersplat-viewer`
   - 產生 `dist/viewer.html`
   - 由你自己的 Netlify domain 同站執行 Viewer。

這使 Direct Asset 模式擺脫 cross-origin viewer iframe 限制，適合作為下一階段 KIRI Camera / FX / Export Bridge 的基礎。

## Netlify Deploy

### 方法 A：GitHub → Netlify（推薦）
把整個資料夾推到 GitHub，Netlify Import repository。

Netlify 會讀取 `netlify.toml`：

- Build command: `npm run build`
- Publish: `dist`
- Node: 20

### 方法 B：Netlify CLI
```bash
npm install
npm run build
npx netlify deploy --prod --dir=dist
```

> 這版不建議直接使用 Netlify Drop 上傳原始資料夾，因為 Viewer npm package 需要先 build。
> 若要 Drag & Drop，請先本機執行 `npm install && npm run build`，然後拖 `dist/`。

## Direct Asset 注意事項
遠端 `.sog` / `.lod-meta.json` 必須允許瀏覽器 CORS。
最穩定的方法是把 Gaussian Splat assets 一起放在 Netlify / R2 / S3 等你可控制的來源。

## V0.3 建議
- 直接 fork / 整合 KIRI-Maker UI
- Viewer Camera bridge
- 16 組 cinematic camera paths
- KIRI particle/scatter layer
- MediaRecorder / WebCodecs export
- Mobile / Quest Gaussian budget preset
- Optional WebXR launch button

## Why not scrape `/scene/<id>`?
SuperSplat 的 hosted Studio / Manage / Explore / Scene page 與 publish/scene API 屬於 hosted proprietary platform；官方 open-source 的部分是 Editor、Viewer、splat-transform 等。公開場景用 hosted runtime 最穩；要自行操作 Gaussian data，建議使用自有 SOG / Streamed SOG asset。


## V0.2.1 Fix
V0.2 incorrectly injected the npm-exported CSS/JS into the viewer HTML while the official HTML still referenced `./index.css` and `./index.js`.

V0.2.1 follows the official npm package contract exactly:

- `viewer.html` = exported `html`
- `index.css` = exported `css`
- `index.js` = exported `js`

This is the correct structure for the self-hosted viewer.


## V0.2.2 中文化
本版只進行 UI 與提示文字中文化，不新增新功能。

下一階段預定：
- Direct `.sog` 自架 Viewer 實測
- KIRI Camera Path
- KIRI Particle / Scatter
