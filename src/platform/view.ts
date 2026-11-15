// 畫面方向與尺寸。
// iPhone 常開著「直向鎖定」，從主畫面開啟的網頁 App 也無法強制橫向。
// 所以在觸控裝置直拿時，我們自己把整個畫面轉 90°：玩家把手機橫過來拿就能玩，不必去關鎖定。
export const View = {
  rot: false, w: innerWidth, h: innerHeight,
  update() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const rot = coarse && innerHeight > innerWidth * 1.05;
    this.rot = rot; this.w = rot ? innerHeight : innerWidth; this.h = rot ? innerWidth : innerHeight;
    const de = document.documentElement, b = document.body.style;
    de.classList.toggle('rot', rot); de.classList.toggle('short', this.h < 520); de.classList.toggle('narrow', this.w < 720);
    de.style.setProperty('--u', this.h / 100 + 'px'); de.style.setProperty('--w', this.w / 100 + 'px');
    b.width = rot ? this.w + 'px' : ''; b.height = rot ? this.h + 'px' : '';
  },
  /** 螢幕座標 → 遊戲畫面座標 */
  toApp(x: number, y: number) { return this.rot ? { x: y, y: innerWidth - x } : { x, y }; },
  /** 元素在遊戲畫面座標中的位置 */
  rect(el: Element) { const r = el.getBoundingClientRect(); return this.rot ? { left: r.top, top: innerWidth - r.right, width: r.height, height: r.width } : { left: r.left, top: r.top, width: r.width, height: r.height }; },
  /** 旋轉模式下，原生捲動方向會錯，改用拖曳捲動 */
  dragScroll(el: HTMLElement) {
    let id: number | null = null, last = 0, moved = 0;
    el.addEventListener('pointerdown', (e) => { if (!this.rot) return; id = e.pointerId; last = this.toApp(e.clientX, e.clientY).y; moved = 0; });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const y = this.toApp(e.clientX, e.clientY).y; el.scrollTop -= y - last; moved += Math.abs(y - last); last = y; });
    const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (this.rot && moved > 8) { e.stopPropagation(); e.preventDefault(); } moved = 0; }, true);
  },
};
