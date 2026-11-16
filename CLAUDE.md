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
- `main`：最後可執行的版本（Phaser 3，第 1 批：菌林 4 敵人＋Boss、4 職業、20 武器、15 符文、30 遺物），已含第二輪回饋：文楷字型、SVG 圖示、新 HUD＋電腦操作提示、觸控攻擊鍵（點擊自動瞄準／按住蓄力／拖曳瞄準）、新手教學、序章、守燈人台詞、打擊感、觸覺、設定的觸覺與操作提示開關。
- 觸覺：iOS 的 switch 技巧在 iOS 26.5 已被封，iPhone 上可能無效；Android／手把可用。
- `test/play.mjs` 的機器人模式（秒數 > 0）只能對 `npm run dev` 用；對 preview 只截前段畫面。
- e2e 曾出現一次 26/27 的偶發失敗，重跑皆 27/27，原因未查明。

## 下一步
依 `docs/architecture-review.md` 做 WebGPU 視覺原型（`proto.html`，只新增檔案）。

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
