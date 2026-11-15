# 亡者之塔：無盡深界

提燈走入倒懸之塔的動作 Roguelike。iPhone 與 Windows 共用同一份程式碼，安裝後可完全離線遊玩。

- 技術：TypeScript、Phaser 3、Vite、PWA（Service Worker）、IndexedDB
- 不依賴任何雲端服務、外部 API 或 CDN：圖像全部由程式即時繪製，音效即時合成，字型內建
- 存檔：三個欄位、自動存檔、可匯出與匯入、有版本遷移機制

> 目前進度見 [PLAN.md](PLAN.md)。

## 開發

需要 Node.js 20 以上。

```bash
npm install
npm run dev        # 開發伺服器（手機連同一個 Wi-Fi 可用區網位址測試）
npm test           # 單元測試：地圖生成、自動遊玩、存檔與版本遷移
npm run build      # 型別檢查 + 正式版建置，輸出到 dist/
npm run preview    # 以正式版內容啟動本機伺服器（Service Worker 只在這裡與正式站生效）
npm run e2e        # 端對端測試：需先 build 並執行 preview（預設連 http://localhost:4173/）
```

`npm run e2e` 需要本機有 Chrome；路徑不同時用環境變數 `CHROME=/path/to/chrome` 指定。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個專案，把這個資料夾的內容推上 `main` 分支。
2. 專案的 **Settings → Pages → Source** 選 **GitHub Actions**。
3. 之後每次推送，`.github/workflows/deploy.yml` 會自動測試、建置、部署。網址是 `https://<帳號>.github.io/<專案名>/`。

`vite.config.ts` 用相對路徑（`base: './'`），放在任何子路徑都能運作，不需要改設定。
也可以手動部署：`npm run build` 後把 `dist/` 的內容放到任何支援 HTTPS 的靜態主機。Service Worker 需要 HTTPS（或 localhost）。

## 安裝

### iPhone（主要平台）
1. 用 **Safari** 開啟網址，等標題畫面右下角出現「已可離線遊玩」。
2. 點分享按鈕 → **加入主畫面**。
3. 從主畫面的圖示開啟，會以全螢幕 App 執行。
4. 手機**橫著拿**。即使開著「直向鎖定」也沒關係，遊戲會自己把畫面轉過來。

從主畫面開啟的版本，存檔比在 Safari 分頁裡更不容易被系統回收。重要進度仍建議定期匯出備份。

### Windows（次要平台）
用 Edge 或 Chrome 開啟網址，按網址列右側的安裝圖示（或標題畫面的「安裝到這台裝置」）。之後可從開始功能表或桌面啟動。

## 離線測試流程

1. `npm run build && npm run preview`，開啟 `http://localhost:4173/`。
2. 等標題畫面右下角出現「已可離線遊玩」（代表所有資源已存入快取）。
3. 開發者工具 → Network → 勾選 **Offline**（手機則開飛航模式）。
4. 重新整理：遊戲應正常啟動。開始一趟遠征、打幾個房間、回到營地。
5. 再重新整理：進入同一段旅途，應顯示「繼續遠征」，進度與剛才一致。
6. 在旅途清單匯出存檔、刪除該欄、再匯入：進度應完全相同。

`npm run e2e` 會自動執行以上流程（桌面、iPhone 橫向、iPhone 直向鎖定三種設定）。

## 存檔與版本更新

- 資料存在瀏覽器的 IndexedDB（資料庫名 `tower-of-the-dead`）。IndexedDB 不可用時退回 localStorage。
- 每份存檔帶有格式版本 `v`。讀取時由 `src/platform/saves.ts` 的 `migrate()` 依序套用 `MIGRATIONS` 升級到目前版本，並用預設值補齊缺少的欄位。
- **改動存檔結構時**：把 `SAVE_VERSION` 加一，在 `MIGRATIONS` 新增「舊版 → 新版」的轉換，並在 `test/saves.test.ts` 加一筆舊版存檔的測試。不要修改已經發佈過的轉換。
- **內容資料**（`src/sim/data.ts`）：存檔只記物品 id，所以不要更改或刪除既有 id。真的要刪時，讀檔會自動略過不存在的 id，不會壞檔。
- 來自較新版本的存檔會被拒絕載入（顯示提示），不會被舊版覆寫。
- 新版本下載完成後不會中途替換：標題畫面會出現「有新版本可用」，按下才更新。

## 字型與圖示

- `public/fonts/` 是 Noto Serif CJK TC（SIL Open Font License 1.1）裁剪後的子集，只含遊戲用到的字。
  新增了文字內容後執行 `python3 scripts/subset-font.py` 重新產生（需要系統已安裝該字型與 fonttools、brotli）。缺字時會自動退回系統字型，不會出現方塊。
- `public/icons/` 由 `node scripts/gen-icons.mjs` 產生。

## 專案結構

```
src/sim/       純邏輯：資料、地圖生成、戰鬥模擬、測試用機器人（不依賴瀏覽器，可在 Node 執行）
src/view/      Phaser 場景與美術（所有圖像以 Canvas 繪製後烘焙成貼圖）
src/ui/        選單、抬頭顯示、觸控按鈕（DOM）
src/platform/  IndexedDB、存檔、輸入、音效、前景／背景切換、PWA、畫面方向
src/app/       流程串接
test/          單元測試與端對端測試
```

## 實機驗證清單

自動化測試使用 Chromium（含 iPhone 尺寸與觸控模擬）。以下項目需要在實機上確認：

- [ ] iPhone Safari：加入主畫面後以全螢幕開啟，瀏海／動態島不遮住介面
- [ ] iPhone：飛航模式下從主畫面啟動、遊玩、存檔、關閉再開啟後讀檔
- [ ] iPhone：遊玩中按 Home 或切換 App，回來後遊戲處於暫停、進度仍在
- [ ] iPhone：直向鎖定開啟時橫拿可玩，雙搖桿與按鈕位置順手
- [ ] iPhone：連續遊玩 15 分鐘的流暢度與發熱（太燙可在設定切換「省電」畫質）
- [ ] Windows Edge／Chrome：安裝為桌面應用程式、離線啟動、鍵鼠操作
- [ ] 兩個平台：匯出的存檔可在另一個平台匯入
