# 架構審查摘要（2026-11-16）

完整版在 claude.ai 專案「新遊戲」：`claude/亡者之塔-架構審查與視覺升級報告.md`。

## 決定
- 渲染改用 **Three.js**，固定俯角（約 50–55°、窄視角透視）跟隨鏡頭，風格化 3D。
- 使用者裝置可用 WebGPU（iPhone 16e、iOS 26）→ `WebGPURenderer` 為主，自動退回 WebGL 2（Windows 內顯筆電可能較弱，是效能下限）。
- **以視覺原型的實測結果作為是否遷移的閘門**。不達標 → 退回「Phaser + 法線光照 + Bloom」。
- 不用 Godot／Unity（要重寫全部邏輯、需要編輯器、iOS 網頁版風險高）。不混用 Phaser＋Three。

## 為什麼可行
- `src/sim/` 完全不依賴 Phaser／DOM；`step()` 推進、事件進 `W.ev`，渲染層只讀 `W`。新渲染層沿用同一契約。
- 沒用 Phaser 物理與輸入；碰撞是自製 2D（`combat.ts` 的 `collides()`、`moveEnt()`）。
- 模擬座標 (x, y) 直接對應 3D 地面 (x, 0, y)，戰鬥邏輯不用改。
- 存檔不含畫面資料，換渲染器不動存檔格式。

## 保留／調整／重寫
- 保留：`sim/*`、`platform/*`、`ui/*` 大部分、`app/bus.ts`、單元測試、PWA 設定。
- 調整：`app/app.ts`（渲染器建立與切換）、`platform/input.ts` 的 `toWorld()`（改射線打地面）、`ui` 中用 `drawHero` 的頭像、`sim/data.ts` 加 3D 外觀欄位、`test/e2e.mjs`。
- 重寫：`view/GameScene.ts`、`TitleScene.ts`、`fx.ts`、`art/*`（約 1,000 行）。

## 目錄（新增，不刪舊的）
```
src/view3d/  Renderer3D.ts、room/、actors/、light/、materials/、fx/、assets/
src/proto/   視覺原型，獨立入口 proto.html
public/models/、public/textures/
```
不引入 ECS、3D 物理、React 包裝層。

## 視覺原型（下一個大任務）
- 獨立入口 `proto.html`，只新增檔案。
- 用現有 `buildRoom()` 的格子資料生成房間：地板、牆、柱、門、水窪、發光植物、火盆、寶箱。
- 材質 ≥5 種（石、苔、金屬、發光、液體）；玩家提燈點光源＋動態陰影；2–3 盞彩色動態光；可點燃／熄滅的火盆。
- 粒子、Bloom、霧；用現有模擬驅動角色走動。
- 兩種資產路線並排：純程序化 vs KayKit CC0 模型（github.com/KayKit-Game-Assets：Dungeon Remastered、Character Pack Adventurers）。
- 畫面顯示 fps、幀時間、draw calls、三角形數；可切三級畫質與 WebGPU／WebGL 2。可離線。

通過標準（使用者實機回報）：
- iPhone 16e「平衡」平均 ≥55 fps，10 分鐘不低於 45、不當機
- Windows 筆電「效能」≥30 fps
- 首次載入 ≤8 秒；斷網可開
- 使用者覺得明顯比現在好（不過就不遷移）

## 畫質分級
| | 高 | 平衡 | 效能 |
|---|---|---|---|
| 解析度倍率 | 2 | 1.5 | 1 |
| 主光陰影 | 1024 柔邊 | 512 | 關（貼地假影） |
| 無陰影光源 | 12 | 8 | 4 |
| Bloom | 開 | 低取樣 | 關 |
| SSAO | 半解析度 | 關 | 關 |
| 粒子 | 100% | 60% | 30% |
| 幀率上限 | 60 | 60 | 30 |
加自動降級（持續低於門檻就降一級）。

## 遷移階段（每階段打 git tag，可回退）
1. ✅ 審查
2. wip-ui-feel 收尾，main 可執行
3. 視覺原型＋實測
4. `app.ts` 可用旗標切 2D／3D，2D 行為不變
5. 逐步遷移：房間 → 玩家 → 敵人 → 地面提示貼花 → 特效 → Boss（每步 3D 都可玩）
6. 頭像、標題、資源下載進度、畫質設定、離線測試
7. iPhone、Windows、斷網、舊存檔全過後才移除 Phaser

## 注意
- 資產會從 2.5 MB 增加到約 15–40 MB：調高 `vite.config.ts` 的 `maximumFileSizeToCacheInBytes`，加下載進度畫面。
- 雲端開發環境是軟體繪圖（約 4 fps）且沒有 Safari：只能驗證畫面正確，效能一律以使用者實機回報為準。

## 題材提醒
使用者明確要求：題材與美術風格未定，不要擅自定義成奇幻／黑暗奇幻／科幻。現有「亡者之塔」題材是暫定，見 CLAUDE.md。
