# 渲染器架構（renderer-3d 分支）

## 分層
- `src/sim/`：遊戲規則，純邏輯。渲染器只讀 `W`、消化 `W.ev`。
- `src/app/renderer.ts`：`GameRenderer` 介面與每幀契約。`app/simEvents.ts`：模擬事件 → 介面（提示、面板、音效）。
- `src/view/`（2D，Phaser）：`Renderer2D` 包住原本的場景，行為與 main 相同，是可靠的退路。
- `src/view3d/`（3D，Three.js）：`Renderer3D`（遊戲用）→ `Scene3D`（光源、後製、畫質、房間重建、鏡頭；原型共用）→ `room.ts` / `actors.ts` / `fx.ts`。
- `src/view3d/manifest.ts`：**唯一**寫死素材名稱的地方。

## 切換
`?r=3d`／`?r=2d`（會記住）或設定頁「畫面（實驗）」。預設 2D。3D 初始化失敗 → 自動用 2D 並把設定改回 2D；執行中 GPU 裝置遺失 → 提示並在下次啟動用 2D。`?debug=1` 顯示 3D 的 fps、draw calls、換房耗時。`?q=high|balanced|perf` 強制畫質。

## 接入新美術
1. 把 glTF 二進位檔（`.glb`）放進 `public/models/<資料夾>/`，把 `manifest.ts` 的 `DIR` 指過去。
2. 角色（玩家、每種敵人）：在 `PLAYER`／`ENEMIES` 填 `file`、`scale`、動畫對照 `anim`（idle、move、attack、hit、die、spawn、dodge），武器等道具用 `attach`（骨頭名 → 模型檔）。模型缺的動畫自動略過。
   - 新敵人 id（新生態域）沒寫進清單時用 `ENEMY_DEFAULT`，不會壞。
3. 場景件：`ENV.floor`（可多個、帶權重）、`wall`、`door`（含門扇節點名）、`obstacle`、`corner`、`brazierBase`、`chest`。
4. 規格建議：1 單位 = 1 格（模擬 40 px）；地面在 y = 0；角色面向 +Z；同一個角色包的動畫放在同一個檔；每個角色 ≤ 15k 三角形、貼圖 ≤ 1024²（手機）。
5. 材質、特效、光：`room.ts` 的 `mats()`（程序化材質）、`fx.ts`（粒子）、`Scene3D`（光源與後製）。風格化著色（toon、描邊、像素化）屬於材質與後製，換掉這幾處即可，不影響 sim 與介面。
6. 模型只在選 3D 時下載，第一次載入後由 Service Worker 快取（`vite.config.ts` 的 runtimeCaching），之後可離線。

## 測試
`npm test`、`npm run build`、`npm run e2e`（2D）、`node test/r3d.mjs`（3D：啟動、進房、移動、滑鼠射線、換房、切回 2D）。後兩者需先 `npx vite preview --port 4173`。
