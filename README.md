# GS Bridge V0.6.1 — Three-Finger Assemble

## 手勢配置

- ☝️ Pointing → Orbit
- 🤏 Pinch → Dolly
- 🤚 Open Palm → Scatter
- 🖖 Three Finger (Index + Middle + Ring extended, Pinky folded) → Assemble
- ✌️ Victory hold → Reality / Particle Toggle

## 本版修正

1. **Closed Fist 完全移出操作邏輯**
   - 避免和 Pinch 的半握姿勢互相誤判。

2. **Three_Finger Assemble**
   - landmark-driven，不依賴 MediaPipe 內建 Closed_Fist。
   - 食指、中指、無名指伸直。
   - 小指收起。
   - 拇指忽略，降低姿勢要求。
   - 穩定約 450ms 後觸發一次 Assemble。

3. **手移出畫面 = HOLD**
   - no hand / gesture none 不再把 scatter progress 設成 0。
   - 張手散開後，把手拿走，粒子保持目前位置。
   - 只有 🖖 三指或 UI「聚合」才會 Assemble。

4. **Particle gesture 與 Camera gesture 保持隔離**
   - Pinch 優先級最高。
   - Three Finger / Open Palm 都受 Camera gesture cooldown 保護。

KIRI-Maker by Willjim, MIT License.
