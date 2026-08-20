# GS Bridge V0.5.5 — Particle OrbitControls

## 為什麼 KIRI 粒子模式可以用滑鼠旋轉

KIRI-Maker 使用單一：
- `THREE.PerspectiveCamera`
- `THREE.WebGLRenderer`
- `OrbitControls(camera, renderer.domElement)`

Particle 與 Spark 共用相機與 renderer，切換模式只改 visibility。
主迴圈仍持續 `controls.update()`。

## GS Bridge V0.5.5

SuperSplat Viewer 仍是 self-host Viewer iframe；Particle 是獨立 Three.js canvas，
因此 Particle Mode 需要自己的 OrbitControls。

新增：
- Particle canvas `OrbitControls`
- Left drag = Orbit
- Wheel = Zoom
- Right drag = Pan
- Damping
- Gesture Pointing / Pinch 修改同一顆 particle camera 並同步 controls
- Particle canvas pointer event 不再漏到下面的 SuperSplat Viewer
- controls 每個 interactive frame update
- controls 在 dispose 時清理

Gesture Channel Lock V0.5.4 全部保留。

KIRI-Maker by Willjim, MIT License.
