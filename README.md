# GS Bridge V0.4 — KIRI-Fork Integration

## 本版結論

V0.4 不再重新設計手勢辨識，而改為沿用 KIRI-Maker 的核心互動架構：

- MediaPipe Tasks Vision 0.10.18
- 0.62 confidence threshold
- 8-frame history voting
- 8-frame stable transition
- Pointing_Up landmark tracking
- Continuous hand openness 0–1
- Open Palm / Closed Fist particle progress

### GS Bridge 修改

- 移除 KIRI 原本的雙拳 Zoom。
- 新增單手 `Pinch`：
  - Thumb tip = landmark 4
  - Index tip = landmark 8
  - Pinch distance 以 palm length 正規化。
  - Pinch 有 hysteresis，避免臨界值反覆跳動。
  - Pinch 後使用 landmark 9 的上下移動控制 Dolly。
- Viewer-specific 操作移到 `gsBridgeAdapter.js`，避免把 SuperSplat 邏輯塞進 GestureControl。

## 目前可測

### Direct Asset / Self-host Viewer
- ☝️ 食指：Orbit
- 🤏 Pinch + 上下：Dolly / Zoom
- 🤚 / 👊：已輸出 KIRI-style 0–1 scatter progress，UI 可看到百分比

### Published superspl.at Scene
目前仍屬跨網域 hosted viewer，只能顯示與做手勢辨識。
要做到 Scene URL → Camera + Particle，需要下一步 Scene Resolver / self-host runtime。

## Particle 狀態

本版**沒有假裝已完成 SOG 粒子解碼**。
KIRI-Maker 的 ParticleSystem 是 THREE.Points + ShaderMaterial，輸入需要 positions / colors。
V0.4 已把 Gesture 的 scatter progress 完整保留，下一階段只需將 SuperSplat/SOG 的 Gaussian
centers/colors 暴露給 Particle Renderer，即可接 KIRI ParticleSystem。

## Attribution

KIRI-Maker by Willjim:
https://github.com/willjim/KIRI-Maker

KIRI-Maker is MIT licensed. See:
- `KIRI-MAKER-LICENSE`
- `THIRD_PARTY_NOTICES.md`

## Netlify

- Build: `npm run build`
- Publish: `dist`
- Node 20
