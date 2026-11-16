# 亡者之塔 — 給 Claude Code 的交接

## 使用者
- 回覆用繁體中文，直接、精簡，不要奉承。
- 做新東西前先查 GitHub 有沒有現成好用的開源專案。
- 主要裝置 iPhone 16e（iOS 26，可用 WebGPU），次要 Windows 筆電（Ryzen 5 3500U 內顯、8 GB RAM）。
- 在意額度：回饋會一次講完；方向沒定前先問，不要先做。
- 美術是重中之重；要有操作難度的技術型戰鬥（體力、閃避、彈反）。

## 遊戲
動作 Roguelike。提燈者把最後的燈火帶到倒懸之塔的塔底（第 15 層）。5 生態域 × 3 層，第 3 層 Boss。橫屏；觸控直拿時自動轉 90°。完全離線 PWA，IndexedDB 存檔 3 欄、匯出匯入、版本遷移。故事文本在 `src/sim/story.ts`（wip 分支）。

## 分支
- `main`：最後可執行的版本（Phaser 3，第 1 批：菌林 4 敵人＋Boss、4 職業、20 武器、15 符文、30 遺物）。
- `wip-ui-feel`：使用者第二輪回饋的半成品，**目前無法啟動**。
  - 已完成：文楷字型（`public/fonts/tower-kai-*.woff2`）、SVG 圖示（`src/ui/icons.ts`）、新 HUD（`src/ui/hud.ts`，含電腦快捷列操作提示）、觸控攻擊鍵（點擊自動瞄準／按住蓄力／拖曳瞄準，`input.ts` 的 `attackPad`）、新手教學（`src/ui/tutorial.ts`）、手感數值與 hitstop、鏡頭後座、命中特效、觸覺（`src/platform/haptics.ts`）、`style.css` 重寫。
  - 未完成：`index.html`（仍是舊 HUD/觸控標記，Hud.init 會自己重建所以可刪掉舊的）、`app/app.ts`（綁定已移除的 `#touch .zr` 與舊按鈕；需改用 `Input.attackPad`、接上 `Tutorial.onEv/frame`、`Haptics.fire`、序章 `INTRO`）、`ui/screens.ts`（改用 `icon()`、新 class 名稱 `.slot-row`、加序章與 `keeperLine`、設定加觸覺與操作提示開關）、`Settings` 新欄位 `haptics`/`hints` 的介面。
  - 觸覺：iOS 的 switch 技巧在 iOS 26.5 已被封，iPhone 上可能無效；Android／手把可用。

## 下一步（使用者擇一）
1. 把 `wip-ui-feel` 收尾、驗證後合併到 `main`。
2. 依 `docs/architecture-review.md` 做 WebGPU 視覺原型（`proto.html`，只新增檔案）。

## 架構要點
- `src/sim/`：純邏輯，不依賴 DOM/Phaser。`step(dt, poll)` 推進，事件寫入 `W.ev`；渲染層只讀 `W`。
- `src/platform/`：存檔（`SAVE_VERSION` + `MIGRATIONS`；改結構必加遷移與測試）、PWA、輸入、音效合成、旋轉（`view.ts`）。
- `src/view/`：Phaser 專用，遷移時重寫。
- `src/sim/data.ts`：存檔只記 id，不要改或刪既有 id。
- 所有圖像目前都是程式繪製，沒有圖檔。

## 指令
```
npm install
npm run dev          # 開發
npm test             # vitest：地圖、自動遊玩機器人、存檔遷移
npm run build        # 型別檢查＋建置
npm run preview      # 正式版（Service Worker 只在這裡生效）
npm run e2e          # 需先 build＋preview；Chrome 路徑可用 CHROME= 指定
node test/play.mjs [mobile] <秒> <輸出前綴>   # 自動遊玩並截圖（GOD=1 無敵）
python3 scripts/subset-font.py               # 新增文字後重新裁字型
```
雲端環境是軟體繪圖（約 4 fps）且沒有 Safari：只能驗證畫面正確，效能以使用者實機回報為準。
