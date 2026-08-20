# GS Bridge V0.3.2 GitHub Release Proxy 版 — SuperSplat × KIRI

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


## V0.3 Webcam 手勢控制

新增：
- MediaPipe Gesture Recognizer
- Webcam 320×240 / 15 FPS ideal
- 食指追蹤 → Camera Orbit
- 雙拳距離 → Camera Dolly / Zoom
- 手勢穩定判定、歷史投票與 dead-zone
- 中文手勢狀態 UI

### 很重要：Published Scene vs Direct Asset

`https://superspl.at/scene/<id>` 會載入 `superspl.at` 官方 hosted viewer。
因為它是跨網域 iframe，父網站不能直接存取裡面的 Canvas / Camera。

所以：
- Published Scene：Webcam 可辨識，但目前不能控制 Camera。
- Direct Asset：使用本站 self-hosted SuperSplat Viewer，可以將手勢轉成 Pointer/Wheel 輸入來控制 Camera。

V0.3 的 Camera bridge 採用 same-origin Canvas input injection，先驗證互動鏈路；
後續若需要更精確的 cinematic camera control，建議改成直接暴露 Viewer / CameraManager API。


## V0.3.1 修正
Direct Asset 白畫面修正：
- 補上官方 Viewer 預設要求的 `settings.json`
- Direct Asset 明確傳入 `settings=./settings.json`
- Direct Asset 測試階段強制 `webgl`，降低 WebGPU / iframe 差異
- 背景改為近黑色，方便區分 runtime 正常但 asset 載入失敗的狀態

官方 SuperSplat Viewer 的 URL 參數規格中，`settings` 預設為 `./settings.json`。


## V0.3.2 — GitHub Release CORS 修正

Console 已確認 GitHub Release 直連被瀏覽器 CORS 阻擋：

`No 'Access-Control-Allow-Origin' header`

本版新增 Netlify reverse proxy：

`/github-release/*`
→
`https://github.com/aiclass00001-debug/supersplat-kiri-bridge/releases/download/:splat`

當 Direct Asset 輸入：

`https://github.com/aiclass00001-debug/supersplat-kiri-bridge/releases/download/TESTSOG/gs_full.sog`

前端會自動改成本站同網域：

`/github-release/TESTSOG/gs_full.sog`

因此 SuperSplat Viewer 不再直接跨網域 fetch github.com。

### 注意
這個 proxy 目前只對 `aiclass00001-debug/supersplat-kiri-bridge` Release Assets 做明確映射，
避免做成任意 URL open proxy。

`ERR_BLOCKED_BY_CLIENT` 如果只出現在 Segment / Bugsnag 等 analytics 網域，可以忽略，
通常是 AdBlock / Privacy extension 阻擋，與 SOG 載入無關。


## V0.3.3 — Gesture Pointer Capture Fix

Console confirmed:
- SuperSplat Viewer loads successfully.
- WebGL2 renderer starts successfully.
- MediaPipe Gesture Recognizer starts successfully.
- The remaining failure was `Element.setPointerCapture: Invalid pointer id`.

Cause:
Synthetic PointerEvents do not own a real browser pointer, while SuperSplat's input controller
calls `setPointerCapture()` / `releasePointerCapture()`.

Fix:
- One continuous gesture drag session per pointing gesture.
- `pointerdown` only when Pointing_Up begins.
- `pointermove` while the finger moves.
- `pointerup` when pointing ends.
- In the same-origin self-hosted canvas only, pointer capture methods are replaced with no-op
  handlers for the synthetic gesture pointer.
