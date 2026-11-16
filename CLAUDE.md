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

## 使用者的硬性需求（原始要求，不可偷工）
- 是**真正可玩的完整遊戲**，不是 demo；內容一次做完、封閉、不需長期維護；越大越完整越好（不用顧慮額度消耗，但分批做，避免被額度卡斷）。
- **美術是重中之重**：畫面要令人賞心悅目，風格與圖像要選好、一致。
- 技術導向戰鬥、有難度：體力、閃避無敵幀、精準閃避慢動作、彈反、蓄力重擊、清楚的出招提示。
- 橫屏。手機：雙搖桿／觸控按鈕；電腦：鍵鼠／手把，且**電腦要有畫面操作提示**。
- 手感與打擊感要好；觸覺回饋是加分項。按鈕盡量用圖示（例：盾牌＝彈反）。
- 主題與故事要清楚（標語「把最後的燈火，帶到塔底。」）。
- 存檔：3 欄、匯出匯入、版本遷移，**更新後舊存檔不能壞**（content id 永不改名或刪除）。
- 離線：首次下載後永久可離線啟動、遊玩、存檔、讀檔；必須實測斷網。零 CDN、零雲端 AI／外部 API。
- iOS 背景暫停（pagehide/visibilitychange）要自動暫停並存檔，不可讓時間錯亂推進。
- 多人：選用的非同步多人（Firebase REST，未設定＝純離線），尚未實作，排在最後一批。
- 技術棧是使用者指定的：TypeScript、Phaser 3、Vite、PWA(Service Worker)、IndexedDB。改用 Three.js 是提案，**須使用者看過原型並同意**才遷移。
- 必須實測：iPhone Safari 與 Windows。我在雲端無法實機測；效能與觸覺一律請使用者回報，不可假裝測過。
- 回報要誠實標示：已確認／推測／未確認。

## 完整路線圖
見 `PLAN.md`（批次 2–5：第 2–3 域與商店祭壇事件密室 → 營地（隨真實時間成長）、天賦、圖鑑、成就 → 第 4–5 域、結局、無盡 → 選用多人、音樂、平衡、文件）。
架構審查全文在 claude.ai 專案「新遊戲」的 `claude/亡者之塔-架構審查與視覺升級報告.md`，repo 內是摘要 `docs/architecture-review.md`。

## 先決定再動手
`wip-ui-feel` 收尾、3D 原型、之後各批內容，**一次只做一件**，並先看 `git log` 與 `PLAN.md` 確認現況。方向有疑問就先問使用者，不要先做。
