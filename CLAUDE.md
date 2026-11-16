# 亡者之塔 — 給 Claude Code 的交接

回覆用繁體中文。主要裝置 iPhone 16e（iOS 26，可用 WebGPU），次要 Windows 筆電。

## 現況
- `main`：最後一個可執行版本（Phaser 3 試玩版，第 1 批）。
- `wip-ui-feel`：使用者第二輪回饋的半成品，**目前無法啟動**。內容：文楷字型、SVG 圖示按鍵、觸控攻擊鍵（點擊自動瞄準／按住蓄力／拖曳瞄準）、電腦快捷列操作提示、新手教學、故事文本（src/sim/story.ts）、打擊感（hitstop、鏡頭後座、命中特效）、觸覺（src/platform/haptics.ts）。
  未完成：`src/ui/screens.ts`、`src/app/app.ts`（仍找已移除的 `#touch .zr`）、`index.html`（舊 HUD 標記）尚未配合新 hud.ts；`Tutorial` 尚未接上。
- 架構決策報告：claude.ai 專案「新遊戲」內的 `claude/亡者之塔-架構審查與視覺升級報告.md`。結論：遷移到 Three.js（固定俯角 3D），先做獨立視覺原型實測。使用者已確認裝置可用 WebGPU → 原型以 WebGPURenderer 為主、WebGL 2 為退路。

## 架構要點
- `src/sim/`：純邏輯，不依賴 DOM/Phaser。`step()` 推進，事件寫入 `W.ev`。渲染層只讀 `W`。
- `src/platform/`：IndexedDB 存檔（`SAVE_VERSION` + `MIGRATIONS`）、PWA、輸入、音效、旋轉。
- `src/view/`：Phaser 專用，遷移時重寫的部分。
- 存檔不含畫面資料；換渲染器不需改存檔格式。

## 指令
npm install / npm run dev / npm test / npm run build / npm run preview / npm run e2e（需先 build+preview）
