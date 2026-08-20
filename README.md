# GS Bridge V0.6.0 — UX / Camera Continuity Milestone

本版在 V0.5.5 基礎上完成操作體驗整合：

- 手勢 HUD：Gesture / confidence / hold progress / mode
- 靈敏度：Orbit Speed / Dolly Speed / Gesture Smoothing
- Reset View：按鈕、雙擊 viewport、鍵盤 R
- Reality ↔ Particle Camera Continuity：共享 yaw / pitch / distance / target / FOV 邏輯狀態
- 手勢模式鎖：Camera Only / Particle Only / Full
- Presentation Mode：P 鍵隱藏 UI，HUD 保留
- Adaptive Particle Budget：150K / 300K / 600K / 1M

## Camera continuity 說明
Particle Camera 可直接讀寫完整 camera state。官方 self-hosted SuperSplat Viewer 目前未提供父頁穩定公開的 CameraManager API，因此 Reality 端採「同網域 input tracking + shared logical camera state」維持切換連續性；Reset Reality 使用 Viewer reload 回到 authored/default view，而不是依賴未公開內部 API。

## 快捷鍵
- `P`: Presentation Mode
- `R`: Reset View
- viewport 雙擊：Reset View

KIRI-Maker by Willjim, MIT License。
