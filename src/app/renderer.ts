// 渲染器介面：畫面層只讀模擬世界 W、每幀消化 W.ev，不改遊戲規則。
// 2D（Phaser，src/view/）與 3D（Three.js，src/view3d/）各實作一份；App 只透過這個介面切換畫面。
//
// 每一幀，實作者必須依序：
//   1. Bus.emit('frame', dt)            —— 系統按鍵、教學、自動存檔
//   2. step(dt, () => { W.in = Input.build(W.p) })
//   3. 取出 W.ev，逐一交給介面橋接（Bus.emit('ev')、提示、面板…；見 app/simEvents.ts）並畫出特效
//   4. 畫出 W
//   5. Bus.emit('hud', dt)
// 換房間後要 Bus.emit('room')，並把 Input.toWorld 設成「畫面座標 → 模擬座標」。
export interface GameRenderer {
  readonly kind: '2d' | '3d';
  /** 建立畫布、開始主迴圈。host = #game。 */
  boot(host: HTMLElement): Promise<void>;
  /** 標題／營地背景（不推進模擬）。 */
  showTitle(): void;
  /** 開始畫並推進目前的遠征（W.run 已由 startRun 建好）。 */
  play(): void;
  /** 省電畫質（30 fps、少粒子）。 */
  setLowQuality(low: boolean): void;
}
