// 數學與隨機工具（純邏輯，不依賴 DOM / Phaser）
export const TAU = Math.PI * 2;
export const T = 40;            // 格子邊長（邏輯像素）
export const RW = 27, RH = 15;  // 房間格數
export const RPW = RW * T, RPH = RH * T;
export const WH = 26;           // 牆正面高度（3/4 視角假高度）
export const VH = 540;          // 邏輯視窗高度

export const { sin, cos, abs, min, max, round, hypot, atan2, PI, pow, sqrt } = Math;
export const Mf = Math.floor;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => hypot(a.x - b.x, a.y - b.y);
export const angTo = (a: { x: number; y: number }, b: { x: number; y: number }) => atan2(b.y - a.y, b.x - a.x);
export const angDiff = (a: number, b: number) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
export const turn = (a: number, to: number, maxStep: number) => { const d = angDiff(to, a); return a + clamp(d, -maxStep, maxStep); };
export const rnd = Math.random;
export const rr = (a: number, b: number) => a + rnd() * (b - a);
export const ease = (t: number) => t * t * (3 - 2 * t);
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export interface Rng { (): number; int(a: number, b: number): number; pick<X>(a: X[]): X; chance(p: number): boolean; rr(a: number, b: number): number; shuffle<X>(a: X[]): X[]; }
/** 可重現的亂數（mulberry32）。地圖、掉落都由種子決定。 */
export function RNG(seed: number): Rng {
  let s = seed >>> 0;
  const f: any = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (a: number, b: number) => a + Mf(f() * (b - a + 1));
  f.pick = (a: any[]) => a[Mf(f() * a.length)];
  f.chance = (p: number) => f() < p;
  f.rr = (a: number, b: number) => a + f() * (b - a);
  f.shuffle = (a: any[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Mf(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return f;
}
export const hash = (...n: number[]) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; } return h >>> 0; };
export const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** 點到線段距離 */
export function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
