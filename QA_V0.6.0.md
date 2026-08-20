# GS Bridge V0.6.0 自我檢查

- ✅ JS syntax app.js — OK
- ✅ JS syntax gestureControl.js — OK
- ✅ JS syntax gsBridgeAdapter.js — OK
- ✅ JS syntax sogDataLoader.js — OK
- ✅ JS syntax particleSystem.js — OK
- ✅ JS syntax modeController.js — OK
- ✅ JS syntax build.mjs — OK
- ✅ HTML duplicate IDs — none
- ✅ DOM references — all found
- ✅ HUD — PASS
- ✅ Orbit sensitivity — PASS
- ✅ Dolly sensitivity — PASS
- ✅ Smoothing — PASS
- ✅ Reset button — PASS
- ✅ Reality dblclick reset — PASS
- ✅ Particle dblclick reset — PASS
- ✅ Particle camera state IO — PASS
- ✅ Reality camera tracking — PASS
- ✅ Reality tracking auto-attach — PASS
- ✅ Mode camera continuity — PASS
- ✅ Gesture lock UI — PASS
- ✅ Camera Only semantics — PASS
- ✅ Particle Only / OpenPalm guard — PASS
- ✅ Victory Full-only — PASS
- ✅ Presentation mode — PASS
- ✅ Adaptive particle budget — PASS
- ✅ Loader budget option — PASS
- ✅ KIRI OrbitControls preserved — PASS
- ✅ Pinch isolation preserved — PASS
- ✅ Package version — 0.6.0
- ✅ Build manifest app.js — included
- ✅ Build manifest styles.css — included
- ✅ Build manifest gestureControl.js — included
- ✅ Build manifest gsBridgeAdapter.js — included
- ✅ Build manifest sogDataLoader.js — included
- ✅ Build manifest particleSystem.js — included
- ✅ Build manifest modeController.js — included
- ✅ Build manifest settings.json — included

## Overall: PASS

## Build 環境限制
- `npm run build` 在目前工作容器無法完成，因容器沒有 `node_modules`，且 `npm install` 因外網連線逾時。
- Netlify 會依 `package.json` 安裝 `@playcanvas/supersplat-viewer` 後執行同一個 `build.mjs`。
- 因此本次自我檢查包含所有本地 JS syntax、DOM wiring、互動路由與 build manifest，但不宣稱已完成線上 Webcam/CDN runtime。

## Camera Sync 實作範圍
- Particle Camera：完整 get/set camera state。
- Reality Viewer：使用同網域 canvas input tracking 維持 shared logical yaw/pitch/distance；官方 Viewer 未提供穩定父頁 CameraManager API，因此不是直接讀取其私有 CameraManager。
- Reality Reset：可靠 fallback 為重新載入 Viewer 回到 authored/default view。