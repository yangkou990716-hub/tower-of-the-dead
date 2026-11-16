// 美術基礎：所有圖像都在啟動時用 Canvas 2D 繪製後烘焙成貼圖（零圖檔、可離線、任何解析度都銳利）。
import Phaser from 'phaser';
import { TAU, Mf, clamp } from '../../sim/util';

export type Ctx = CanvasRenderingContext2D;
/** 烘焙倍率：貼圖以邏輯尺寸的 2 倍繪製，手機高 DPI 下仍清晰。 */
export const BS = 2;

// ---------- 顏色 ----------
export const hex = (c: string): [number, number, number] => { const n = parseInt(c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const toInt = (c: string) => { const [r, g, b] = hex(c); return (r << 16) | (g << 8) | b; };
export const rgba = (c: string, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const h2 = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
export const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return '#' + h2(A[0] + (B[0] - A[0]) * t) + h2(A[1] + (B[1] - A[1]) * t) + h2(A[2] + (B[2] - A[2]) * t); };
/** k>0 變亮、k<0 變暗 */
export const shade = (c: string, k: number) => (k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k));

// ---------- 形狀 ----------
export const ell = (x: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); x.fill(); };
export const circ = (x: Ctx, cx: number, cy: number, r: number) => { x.beginPath(); x.arc(cx, cy, Math.max(0.01, r), 0, TAU); x.fill(); };
export const rrect = (x: Ctx, px: number, py: number, w: number, h: number, r: number | number[]) => { x.beginPath(); (x as any).roundRect(px, py, w, h, r); x.fill(); };
export const poly = (x: Ctx, pts: number[]) => { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
export const line = (x: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, col: string) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); };
export const vgrad = (x: Ctx, y0: number, y1: number, ...stops: (string | number)[]) => { const g = x.createLinearGradient(0, y0, 0, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i] as number, stops[i + 1] as string); return g; };
export const rgrad = (x: Ctx, cx: number, cy: number, r: number, ...stops: (string | number)[]) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i] as number, stops[i + 1] as string); return g; };

// ---------- 烘焙 ----------
export function mkCanvas(w: number, h: number, scale = BS): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const x = c.getContext('2d')!; x.scale(scale, scale); x.lineJoin = 'round'; x.lineCap = 'round';
  return [c, x];
}
/** 烘焙一張圖集：n 格，每格 fw×fh（邏輯像素），draw 以 (ox,oy) 為原點作畫。 */
export function bakeSheet(scene: Phaser.Scene, key: string, fw: number, fh: number, n: number, ox: number, oy: number, draw: (x: Ctx, i: number) => void) {
  const cols = Math.min(n, 8), rows = Math.ceil(n / cols);
  const [c, x] = mkCanvas(fw * cols, fh * rows);
  for (let i = 0; i < n; i++) {
    const cx = (i % cols) * fw, cy = Mf(i / cols) * fh;
    x.save(); x.beginPath(); x.rect(cx, cy, fw, fh); x.clip(); x.translate(cx + ox, cy + oy); draw(x, i); x.restore();
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, c)!;
  for (let i = 0; i < n; i++) tex.add(i, 0, (i % cols) * fw * BS, Mf(i / cols) * fh * BS, fw * BS, fh * BS);
  return { key, fw, fh, ox: ox / fw, oy: oy / fh };
}
export function bakeOne(scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (x: Ctx) => void) {
  return bakeSheet(scene, key, w, h, 1, ox, oy, (x) => draw(x));
}
export function addCanvasTex(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  return scene.textures.addCanvas(key, c)!;
}
/** 建立以烘焙貼圖為底的圖片（自動套用 1/BS 縮放）。 */
export function img(scene: Phaser.Scene, key: string, frame: number | string = 0, ox = 0.5, oy = 0.5) {
  const im = scene.add.image(0, 0, key, frame); im.setOrigin(ox, oy); im.setScale(1 / BS); return im;
}
export const S1 = 1 / BS;

// ---------- 通用特效貼圖 ----------
export function bakeFx(scene: Phaser.Scene) {
  // 柔光（光照圖與泛光用）
  bakeOne(scene, 'glow', 128, 128, 64, 64, (x) => { x.fillStyle = rgrad(x, 0, 0, 64, 0, 'rgba(255,255,255,1)', 0.25, 'rgba(255,255,255,.55)', 0.6, 'rgba(255,255,255,.13)', 1, 'rgba(255,255,255,0)'); x.fillRect(-64, -64, 128, 128); });
  bakeOne(scene, 'dot', 24, 24, 12, 12, (x) => { x.fillStyle = rgrad(x, 0, 0, 12, 0, '#fff', 0.35, 'rgba(255,255,255,.8)', 1, 'rgba(255,255,255,0)'); x.fillRect(-12, -12, 24, 24); });
  bakeOne(scene, 'spark', 40, 10, 20, 5, (x) => { const g = x.createLinearGradient(-20, 0, 20, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(-20, 0); x.quadraticCurveTo(6, -4, 20, 0); x.quadraticCurveTo(6, 4, -20, 0); x.fill(); });
  bakeOne(scene, 'ring', 128, 128, 64, 64, (x) => { x.strokeStyle = '#fff'; x.lineWidth = 5; x.shadowColor = '#fff'; x.shadowBlur = 8; x.beginPath(); x.arc(0, 0, 54, 0, TAU); x.stroke(); });
  bakeOne(scene, 'disc', 128, 128, 64, 64, (x) => { x.fillStyle = rgrad(x, 0, 0, 62, 0, 'rgba(255,255,255,.35)', 0.8, 'rgba(255,255,255,.55)', 0.96, 'rgba(255,255,255,.95)', 1, 'rgba(255,255,255,0)'); x.fillRect(-64, -64, 128, 128); });
  bakeOne(scene, 'smoke', 64, 64, 32, 32, (x) => { for (const [dx, dy, r] of [[0, 0, 22], [-9, 6, 15], [10, 4, 16], [2, -9, 15]]) { x.fillStyle = rgrad(x, dx, dy, r, 0, 'rgba(255,255,255,.5)', 1, 'rgba(255,255,255,0)'); x.fillRect(-32, -32, 64, 64); } });
  bakeOne(scene, 'shard', 12, 12, 6, 6, (x) => { x.fillStyle = '#fff'; poly(x, [-5, 3, 0, -5, 5, 4]); });
  bakeOne(scene, 'star', 32, 32, 16, 16, (x) => { x.fillStyle = '#fff'; x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8, r = i % 2 ? 2.2 : 14; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill(); x.fillStyle = rgrad(x, 0, 0, 10, 0, 'rgba(255,255,255,.7)', 1, 'rgba(255,255,255,0)'); x.fillRect(-16, -16, 32, 32); });
  // 揮砍弧光：以原點為圓心、朝右 ±60° 的新月
  bakeOne(scene, 'slash', 128, 200, 14, 100, (x) => {
    const R = 100, A = 1.05, cg = (x as any).createConicGradient ? (x as any).createConicGradient(-A - 0.02, 0, 0) : null, span = (2 * A + 0.04) / TAU;
    if (cg) { cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(span * 0.45, 'rgba(255,255,255,.16)'); cg.addColorStop(span * 0.85, 'rgba(255,255,255,.6)'); cg.addColorStop(span * 0.985, 'rgba(255,255,255,1)'); cg.addColorStop(span, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); }
    x.fillStyle = cg || 'rgba(255,255,255,.4)';
    x.beginPath(); x.arc(0, 0, R - 2, -A, A); x.arc(-26, 0, R - 2, A * 0.78, -A * 0.78, true); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2.2; x.beginPath(); x.arc(0, 0, R - 3, A * 0.1, A * 0.98); x.stroke();
  });
  bakeOne(scene, 'thrust', 160, 40, 10, 20, (x) => { const g = x.createLinearGradient(0, 0, 150, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,.95)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(90, -13, 150, 0); x.quadraticCurveTo(90, 13, 0, 0); x.fill(); });
  bakeOne(scene, 'shadow', 64, 32, 32, 16, (x) => { x.scale(1, 0.5); x.fillStyle = rgrad(x, 0, 0, 30, 0, 'rgba(0,0,0,.55)', 0.6, 'rgba(0,0,0,.35)', 1, 'rgba(0,0,0,0)'); x.fillRect(-32, -32, 64, 64); });
  bakeOne(scene, 'px', 4, 4, 0, 0, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); });
  // 投射物
  bakeOne(scene, 'orb', 32, 32, 16, 16, (x) => { x.fillStyle = rgrad(x, 0, 0, 16, 0, '#fff', 0.3, 'rgba(255,255,255,.95)', 0.5, 'rgba(255,255,255,.4)', 1, 'rgba(255,255,255,0)'); x.fillRect(-16, -16, 32, 32); });
  bakeOne(scene, 'arrow', 36, 12, 26, 6, (x) => { line(x, -24, 0, 6, 0, 1.6, '#d8c9a8'); x.fillStyle = '#f4f0e4'; poly(x, [9, 0, 2, -3.2, 2, 3.2]); x.fillStyle = '#c9534a'; poly(x, [-24, 0, -19, -3, -16, 0, -19, 3]); });
  // 傷害數字用的點陣字
  const chars = '0123456789+-!', cw = 15, ch = 28; const [c, x] = mkCanvas(cw * chars.length, ch);
  x.font = '900 23px "TowerKai","Noto Serif TC","Songti TC",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  for (let i = 0; i < chars.length; i++) { x.strokeStyle = 'rgba(10,12,16,.9)'; x.lineWidth = 5; x.strokeText(chars[i], i * cw + cw / 2, ch / 2 + 1); x.fillStyle = '#fff'; x.fillText(chars[i], i * cw + cw / 2, ch / 2 + 1); }
  addCanvasTex(scene, 'numfont', c);
  scene.cache.bitmapFont.add('num', Phaser.GameObjects.RetroFont.Parse(scene, { image: 'numfont', width: cw * BS, height: ch * BS, chars, charsPerRow: chars.length, 'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0 } as any));
}
