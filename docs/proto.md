# 視覺原型（proto.html）

依 `docs/architecture-review.md`「視覺原型」製作。只新增檔案；正式版不受影響（`package.json` 只加了 three 依賴與 `proto*` 指令）。

## 指令
```
npm run proto            # 開發：開 /proto.html
npm run proto:build      # 建置到 dist-proto/（自帶 Service Worker，可離線）
npm run proto:preview    # 以正式版內容啟動
```
網址參數：`?q=high|balanced|perf`、`?assets=proc|kaykit`、`?api=webgpu|webgl`、`?auto=0`（關自動降級）、`?seed=`。

## 內容
- 房間：sim 的 `genFloor()`/`buildRoom()` 格子 → 地板、牆、柱、門（鎖門時柵欄升起）、水窪（泥沼格＋裝飾水）、發光蕈菇、四角火盆（可點擊點燃／熄滅）、寶箱。
- 材質：石（程序化法線＋粗糙度）、苔、金屬、發光、液體（流動法線＋清漆）、木、火。
- 光：提燈 SpotLight 有陰影；固定數量點光源（12/8/4）每幀分配給提燈、3 盞彩色遊走光、火盆、蕈菇。
- 後製：Bloom（高 0.5／平衡 0.25 取樣）、GTAO（僅高）、指數霧＋霧片、粒子（孢子、火星、命中、死亡、彈反…）。
- 角色：sim＋自動遊玩機器人驅動（原型中不會死）；觸控左半邊拖曳／WASD 手動移動。
- KayKit：Dungeon Remastered＋Character Pack Adventures（CC0，`public/models/kaykit/`，約 4 MB）。敵人兩條路線都用程序化造型。
- 自動降級：1 秒 fps 連續 4 秒低於上限的 80% → 降一級。

## 程式
`src/proto/`：`main.ts`（渲染器、迴圈、統計、HUD）、`room.ts`、`actors.ts`、`fx.ts`、`kaykit.ts`、`textures.ts`、`quality.ts`。
參考：three.js 官方 `examples/jsm`（`tsl/display/BloomNode`、`GTAONode`、`loaders/GLTFLoader`、`utils/SkeletonUtils`）。
