# GS Bridge V0.5 — Integrated KIRI / SuperSplat Runtime

## 這版完成的重點

- SuperSplat 公開 Scene URL 不再只用跨網域 iframe。
- 會解析公開 Scene ID，優先尋找 SuperSplat CDN 的 `meta.json`（v1–v10）。
- 找到 SOG metadata 後，本站 self-host SuperSplat Viewer 直接載入該 asset。
- 因此公開 Scene 也能進入本站可控 Runtime，Camera gesture 不再卡 Same-Origin iframe。
- `meta.json + means_l/means_u/sh0.webp` 在瀏覽器直接解碼成 KIRI 粒子資料。
- Bundled `.sog` 也可在瀏覽器解包後產生粒子資料（使用 fflate ESM）。
- 粒子最多取 300K points，避免高密度 SOG 把瀏覽器拖垮。

## 操作

- ☝️ 食指：Camera Orbit
- 🤏 Pinch + 上下：Dolly / Zoom
- 🤚 張手：切入粒子並散開
- 👊 握拳：粒子聚合
- ✌️ Victory：3D 實景 / 粒子模式切換
- UI 也可直接按「3D 實景 / 粒子模式」、「散開 / 聚合」。
- 粒子效果：Explosion / Thanos / Curl / Grid / Helix / Rain / Wave。

## Source Compatibility

- `https://superspl.at/scene/<8-char-id>`
- `https://superspl.at/s?id=<8-char-id>`
- direct `.sog`
- direct `meta.json`
- direct `.compressed.ply` / `.ply`：Reality Viewer 可用；Particle 目前以 SOG/meta 為主。

## Attribution

Gesture architecture and particle-rendering design are derived from KIRI-Maker by Willjim (MIT).
See `KIRI-MAKER-LICENSE` and `THIRD_PARTY_NOTICES.md`.

SuperSplat Viewer is MIT-licensed and loaded through `@playcanvas/supersplat-viewer`.

## Important

SuperSplat public CDN resolution is an interoperability implementation based on public scene IDs
and publicly accessible assets. If the platform changes its public CDN layout, the resolver may
need to be updated.
