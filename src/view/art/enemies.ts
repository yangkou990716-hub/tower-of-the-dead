// 敵人繪製。每種「外型」是一個參數化的繪圖函式；格 0–7 = 行動循環、8–10 = 出招前搖、11 = 失衡。
import Phaser from 'phaser';
import { TAU, sin, cos, abs, max, RNG } from '../../sim/util';
import { Ctx, ell, circ, rrect, poly, line, vgrad, rgrad, shade, rgba, mix, bakeSheet } from './core';
import { EN } from '../../sim/data';

interface Pose { t: number; wind: number; stag: boolean; col: string; c2: string; }
type Draw = (x: Ctx, o: Pose) => void;
const glowDot = (x: Ctx, cx: number, cy: number, r: number, col: string) => { x.fillStyle = rgba(col, 0.3); circ(x, cx, cy, r * 2.4); x.fillStyle = col; circ(x, cx, cy, r); x.fillStyle = 'rgba(255,255,255,.8)'; circ(x, cx - r * 0.25, cy - r * 0.25, r * 0.4); };
const cap = (x: Ctx, cx: number, cy: number, rx: number, ry: number, col: string, spot: string, rot = 0) => {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = shade(col, -0.35); ell(x, 0, ry * 0.25, rx * 0.92, ry * 0.42);
  x.fillStyle = vgrad(x, -ry, ry * 0.4, 0, shade(col, 0.28), 0.55, col, 1, shade(col, -0.3));
  x.beginPath(); x.moveTo(-rx, ry * 0.2); x.bezierCurveTo(-rx * 1.02, -ry * 0.9, -rx * 0.45, -ry * 1.05, 0, -ry); x.bezierCurveTo(rx * 0.45, -ry * 1.05, rx * 1.02, -ry * 0.9, rx, ry * 0.2); x.quadraticCurveTo(0, ry * 0.62, -rx, ry * 0.2); x.fill();
  x.fillStyle = rgba(spot, 0.92); ell(x, -rx * 0.45, -ry * 0.42, rx * 0.16, ry * 0.2, -0.4); ell(x, rx * 0.3, -ry * 0.55, rx * 0.13, ry * 0.17, 0.3); ell(x, rx * 0.62, -ry * 0.05, rx * 0.1, ry * 0.14, 0.5); ell(x, -rx * 0.05, -ry * 0.78, rx * 0.09, ry * 0.1);
  x.fillStyle = 'rgba(255,255,255,.22)'; ell(x, -rx * 0.35, -ry * 0.7, rx * 0.28, ry * 0.12, -0.35);
  x.restore();
};

const LOOKS: Record<string, { fw: number; fh: number; ox: number; oy: number; draw: Draw }> = {
  // ---- 史萊姆類 ----
  blob: { fw: 48, fh: 44, ox: 24, oy: 36, draw(x, o) {
    const hop = sin(o.t * TAU), sq = o.wind > 0 ? -o.wind * 0.42 : o.stag ? -0.3 : hop * 0.16, lift = o.wind > 0 ? 0 : max(0, hop) * 4;
    const w = 13.5 * (1 - sq * 0.75), h = 11.5 * (1 + sq * 1.25);
    x.translate(0, -lift);
    x.fillStyle = vgrad(x, -h * 1.75, 3, 0, shade(o.col, 0.4), 0.5, o.col, 1, shade(o.col, -0.38));
    x.beginPath(); x.moveTo(-w, -1); x.bezierCurveTo(-w * 1.2, -h * 0.95, -w * 0.62, -h * 1.75, 0, -h * 1.75); x.bezierCurveTo(w * 0.62, -h * 1.75, w * 1.2, -h * 0.95, w, -1); x.quadraticCurveTo(w * 0.5, 2.6, 0, 1.6); x.quadraticCurveTo(-w * 0.5, 2.6, -w, -1); x.fill();
    x.fillStyle = rgba(o.c2, 0.28); ell(x, -1, -h * 0.72, w * 0.56, h * 0.5); glowDot(x, -1.5, -h * 0.7, 2.3 + o.wind * 1.4, o.c2);
    x.fillStyle = 'rgba(255,255,255,.38)'; ell(x, -w * 0.42, -h * 1.3, w * 0.24, h * 0.13, -0.5);
    const ey = -h * 1.0, ex = w * 0.3; x.fillStyle = '#0f1f18';
    if (o.stag) { line(x, ex - 2, ey - 2, ex + 2, ey + 2, 1.3, '#0f1f18'); line(x, ex + 2, ey - 2, ex - 2, ey + 2, 1.3, '#0f1f18'); line(x, ex + 4.5, ey - 2, ex + 8, ey + 2, 1.3, '#0f1f18'); line(x, ex + 8, ey - 2, ex + 4.5, ey + 2, 1.3, '#0f1f18'); }
    else { ell(x, ex, ey, 1.9, 2.5 - o.wind * 1.1); ell(x, ex + 6, ey + 0.4, 1.7, 2.3 - o.wind * 1.1); if (o.wind > 0.3) { line(x, ex - 3, ey - 4.5, ex + 2, ey - 2.6, 1.2, '#0f1f18'); line(x, ex + 9, ey - 4, ex + 4.5, ey - 2.4, 1.2, '#0f1f18'); } }
    line(x, -w * 0.35, -h * 1.62, -w * 0.45, -h * 1.95, 1.5, '#e9dcc0'); cap(x, -w * 0.47, -h * 2.0, 3.6, 2.6, '#d98a5a', '#fff2cc', -0.2);
    line(x, w * 0.1, -h * 1.72, w * 0.16, -h * 1.98, 1.2, '#e9dcc0'); cap(x, w * 0.17, -h * 2.02, 2.5, 1.9, '#d98a5a', '#fff2cc', 0.15);
  } },
  // ---- 四足獸類 ----
  beast: { fw: 68, fh: 48, ox: 34, oy: 40, draw(x, o) {
    const run = o.t * TAU, bob = sin(run * 2) * 1.1, cr = o.wind;
    const leg = (lx: number, ph: number, back: boolean) => { const sw = o.wind > 0 ? (back ? -3 : 3) * cr : sin(run + ph) * 5; line(x, lx, -9 - bob * 0.5 + cr * 2, lx + sw * 0.5, -4.5, 3.4, shade(o.col, back ? -0.42 : -0.28)); line(x, lx + sw * 0.5, -4.5, lx + sw, -0.8, 3, shade(o.col, back ? -0.42 : -0.28)); };
    leg(-9, 0, true); leg(8, Math.PI, true);
    x.save(); x.translate(0, -bob + cr * 2.5); x.rotate(-cr * 0.16);
    // 尾
    x.strokeStyle = shade(o.col, -0.15); x.lineWidth = 3.2; x.beginPath(); x.moveTo(-13, -13); x.quadraticCurveTo(-21, -17 - sin(run) * 3, -24, -22 - sin(run) * 4 + cr * 6); x.stroke();
    glowDot(x, -24, -22 - sin(run) * 4 + cr * 6, 1.6, o.c2);
    x.fillStyle = vgrad(x, -22, -5, 0, shade(o.col, 0.22), 1, shade(o.col, -0.3)); ell(x, 0, -13.5, 15, 7.6);
    x.fillStyle = shade(o.col, -0.12); ell(x, -9, -14.5, 7, 6.6);
    // 背上菌絲
    for (const [mx, mh] of [[-8, 5], [-2, 7], [4, 5.5]]) { line(x, mx, -20, mx - 0.6, -20 - mh, 1.2, '#dfe9d8'); glowDot(x, mx - 0.6, -20.5 - mh, 1.5, o.c2); }
    // 頭
    x.save(); x.translate(13, -17 + cr * 5); x.rotate(cr * 0.35);
    x.fillStyle = shade(o.col, -0.3); poly(x, [-3.5, -5, -5.5, -12, 0, -6.5]); poly(x, [1, -5.5, 2, -12.5, 5, -5]);
    x.fillStyle = vgrad(x, -7, 7, 0, shade(o.col, 0.2), 1, shade(o.col, -0.22)); circ(x, 0, 0, 7); rrect(x, 2, -1.5, 10, 6.4, 3);
    x.fillStyle = '#17110f'; circ(x, 11.3, 0.6, 1.5);
    if (o.wind > 0.3 || o.stag) { x.fillStyle = '#efe6d2'; poly(x, [4.5, 4.4, 6, 7, 7.5, 4.4]); poly(x, [8, 4.4, 9.2, 6.4, 10.4, 4.4]); }
    if (o.stag) { line(x, 0.5, -3.5, 4.5, -0.5, 1.3, '#17110f'); line(x, 4.5, -3.5, 0.5, -0.5, 1.3, '#17110f'); } else glowDot(x, 2.6, -2, 1.5 + cr * 0.9, o.c2);
    x.restore(); x.restore();
    leg(-12, Math.PI, false); leg(5, 0, false);
  } },
  // ---- 植物類（遠程）----
  plant: { fw: 52, fh: 60, ox: 26, oy: 50, draw(x, o) {
    const w = sin(o.t * TAU), inf = 1 + o.wind * 0.22, lean = o.stag ? 0.35 : w * 0.05 - o.wind * 0.12;
    for (const [rx, ph] of [[-7, 0], [0, 2], [7, 4]]) { x.strokeStyle = '#6b4a36'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(rx * 0.5, -5); x.quadraticCurveTo(rx, -3, rx * 1.35 + sin(o.t * TAU + ph) * 2, -0.6); x.stroke(); }
    x.save(); x.rotate(lean);
    x.fillStyle = vgrad(x, -18, -2, 0, '#8fbf7a', 1, '#3f6f4a'); x.beginPath(); x.moveTo(-5, -3); x.quadraticCurveTo(-7.5, -11, -4, -17); x.lineTo(4, -17); x.quadraticCurveTo(7.5, -11, 5, -3); x.closePath(); x.fill();
    for (const s of [-1, 1]) { x.fillStyle = '#5d9b5f'; x.beginPath(); x.moveTo(s * 3, -11); x.quadraticCurveTo(s * 13, -17 - w * 1.5, s * 15, -9 + w); x.quadraticCurveTo(s * 9, -8, s * 3, -11); x.fill(); }
    // 球莖
    const by = -25 - o.wind * 1.5, br = 10.5 * inf;
    x.fillStyle = rgrad(x, -3, by - 4, br * 1.5, 0, shade(o.col, 0.38), 0.5, o.col, 1, shade(o.col, -0.38)); ell(x, 0, by, br, br * 0.94);
    x.fillStyle = rgba(o.c2, 0.9); ell(x, -5.5, by - 3.5, 2, 2.5, -0.4); ell(x, -2, by + 5, 1.6, 1.9); ell(x, -6.5, by + 3, 1.2, 1.5);
    // 口
    const mo = o.stag ? 0.25 : 0.3 + o.wind * 0.7;
    x.fillStyle = '#231814'; ell(x, 6.5, by - 2, 4.6 * mo + 1.2, 5.2 * mo + 1.2, 0.25);
    if (o.wind > 0.1) { x.fillStyle = rgba(o.c2, 0.4 + o.wind * 0.5); ell(x, 6.8, by - 2, 3.4 * mo, 3.9 * mo, 0.25); x.fillStyle = '#fff6d8'; circ(x, 7, by - 2, 1.4 * o.wind); }
    x.fillStyle = shade(o.col, 0.3); for (const a of [-0.9, -0.1, 0.7]) poly(x, [6.5 + cos(a) * 5.5 * mo, by - 2 + sin(a) * 6 * mo, 6.5 + cos(a + 0.3) * (6.5 * mo + 3.2), by - 2 + sin(a + 0.3) * (7 * mo + 3.2), 6.5 + cos(a + 0.6) * 5.5 * mo, by - 2 + sin(a + 0.6) * 6 * mo]);
    x.restore();
  } },
  // ---- 持盾衛兵 ----
  knight: { fw: 64, fh: 68, ox: 32, oy: 56, draw(x, o) {
    const s = sin(o.t * TAU), bob = abs(s) * 1.3, wd = o.wind;
    x.fillStyle = '#3a2a22'; ell(x, -5 + s * 2.2, -1.4 - max(0, s) * 2.4, 4.6, 3); ell(x, 5 - s * 2.2, -1.4 - max(0, -s) * 2.4, 4.6, 3);
    x.save(); x.translate(0, -bob); if (o.stag) x.rotate(-0.22);
    // 棍棒（身後）
    x.save(); x.translate(-9, -15); x.rotate(-2.2 - wd * 1.1 + s * 0.06); line(x, 0, 0, 17, 0, 3.4, '#6b4a2e'); x.fillStyle = '#4f3724'; rrect(x, 13, -4.6, 12, 9.2, 4); x.fillStyle = rgba(o.c2, 0.85); circ(x, 17, -2, 1.3); circ(x, 21.5, 1.6, 1.3); x.restore();
    // 身（樹皮甲）
    x.fillStyle = vgrad(x, -26, -3, 0, '#8a6448', 1, '#4a3324'); rrect(x, -9.5, -25, 19, 22, [6, 6, 4, 4]);
    x.strokeStyle = 'rgba(30,18,10,.45)'; x.lineWidth = 1; for (const ly of [-17, -11]) { x.beginPath(); x.moveTo(-9, ly); x.quadraticCurveTo(0, ly + 1.8, 9, ly); x.stroke(); }
    // 臉
    x.fillStyle = '#17110f'; rrect(x, -7.6, -30, 15.2, 7, 3);
    if (o.stag) { for (const ex of [-1.5, 4.5]) { line(x, ex - 1.6, -28.2, ex + 1.6, -25, 1.3, o.c2); line(x, ex + 1.6, -28.2, ex - 1.6, -25, 1.3, o.c2); } } else { glowDot(x, -1, -26.6, 1.4 + wd * 0.7, o.c2); glowDot(x, 4.6, -26.6, 1.4 + wd * 0.7, o.c2); }
    cap(x, 0, -34, 18.5, 11.5, o.col, o.c2, -0.04 - wd * 0.08);
    // 盾（面向側）
    x.save(); x.translate(11.5, -14.5 + wd * 1.5); x.rotate(0.06);
    x.fillStyle = '#3d2a1c'; ell(x, 0.8, 0.6, 7.2, 11.4); x.fillStyle = vgrad(x, -11, 11, 0, '#b08a5a', 1, '#6b4a2e'); ell(x, 0, 0, 6.6, 10.8);
    x.strokeStyle = '#d8b673'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, 0, 6.6, 10.8, 0, 0, TAU); x.stroke();
    x.strokeStyle = rgba(o.c2, 0.95); x.lineWidth = 1.4; x.shadowColor = o.c2; x.shadowBlur = 4; x.beginPath(); x.moveTo(0, -6); x.lineTo(0, 6); x.moveTo(-3, -2); x.lineTo(0, -6); x.lineTo(3, -2); x.stroke(); x.shadowBlur = 0;
    x.restore(); x.restore();
  } },
  // ---- Boss：腐菌之母 ----
  matriarch: { fw: 176, fh: 168, ox: 88, oy: 140, draw(x, o) {
    const w = sin(o.t * TAU), w2 = cos(o.t * TAU), wd = o.wind, st = o.stag ? 1 : 0;
    // 菌絲裙
    for (let i = 0; i < 11; i++) { const k = i / 10 - 0.5, bx = k * 44, ph = o.t * TAU + i * 1.3;
      x.strokeStyle = mix('#e9d8c4', '#8a6a70', abs(k) * 1.4); x.lineWidth = 5.2 - abs(k) * 4; x.beginPath(); x.moveTo(bx, -16);
      x.bezierCurveTo(bx + k * 22, -8, bx + k * 46 + sin(ph) * 4, -6 + cos(ph) * 2, bx + k * 62 + sin(ph) * 7, -1 - abs(k) * 5); x.stroke(); }
    x.save(); x.translate(0, w * 1.6); x.scale(1 + w * 0.012, 1 + wd * 0.07 - st * 0.08 - w * 0.012); x.rotate(st * 0.09);
    // 手臂（根鬚）
    for (const s of [-1, 1]) { const up = wd * 30; x.strokeStyle = '#cbb8a4'; x.lineWidth = 6.5; x.beginPath(); x.moveTo(s * 20, -44); x.bezierCurveTo(s * 42, -46 - up * 0.6, s * 50 + w2 * 3, -30 - up, s * 58 + w2 * 4, -18 - up * 1.5); x.stroke();
      x.lineWidth = 3; for (const f of [-0.5, 0, 0.5]) { x.beginPath(); x.moveTo(s * 58 + w2 * 4, -18 - up * 1.5); x.lineTo(s * (66 + f * 6) + w2 * 4, -11 - up * 1.5 + abs(f) * 5); x.stroke(); } }
    // 軀幹
    x.fillStyle = vgrad(x, -70, -8, 0, '#f4e8d6', 0.6, '#d9c4ae', 1, '#8f7470'); x.beginPath(); x.moveTo(-22, -12); x.bezierCurveTo(-34, -30, -28, -62, -16, -70); x.lineTo(16, -70); x.bezierCurveTo(28, -62, 34, -30, 22, -12); x.quadraticCurveTo(0, -4, -22, -12); x.fill();
    x.strokeStyle = 'rgba(120,90,90,.28)'; x.lineWidth = 1.4; for (const rx of [-14, -5, 5, 14]) { x.beginPath(); x.moveTo(rx, -66); x.quadraticCurveTo(rx * 1.5, -40, rx * 1.2, -14); x.stroke(); }
    // 臉：五隻眼
    const eyeR = 3 + wd * 1.4;
    for (const [ex, ey, k] of [[-14, -41, 0.8], [-7, -45, 1], [0, -47, 1.15], [7, -45, 1], [14, -41, 0.8]]) { x.fillStyle = '#3a1f24'; ell(x, ex, ey, eyeR * k + 1.4, (st ? 1.2 : eyeR * k + 1.4)); if (!st) glowDot(x, ex + w2 * 0.6, ey, eyeR * k * 0.62, o.c2); }
    x.fillStyle = '#3a1f24'; x.beginPath(); x.moveTo(-9, -31); x.quadraticCurveTo(0, -25 + wd * 7, 9, -31); x.quadraticCurveTo(0, -29 + wd * 2, -9, -31); x.fill();
    // 蕈傘
    x.save(); x.translate(0, -72); x.rotate(-wd * 0.07 + w * 0.012);
    x.fillStyle = '#f2cdb4'; ell(x, 0, 6, 60, 13); x.strokeStyle = 'rgba(150,90,90,.4)'; x.lineWidth = 1.1; for (let i = -9; i <= 9; i++) { x.beginPath(); x.moveTo(i * 2, 0); x.lineTo(i * 6.4, 14 - abs(i) * 0.5); x.stroke(); }
    x.fillStyle = vgrad(x, -44, 12, 0, shade(o.col, 0.3), 0.45, o.col, 1, shade(o.col, -0.42));
    x.beginPath(); x.moveTo(-64, 6); x.bezierCurveTo(-68, -26, -34, -46, 0, -46); x.bezierCurveTo(34, -46, 68, -26, 64, 6);
    for (let i = 5; i >= -5; i--) x.quadraticCurveTo(i * 11.6 + 5.8, 13 + (i % 2 ? 2 : 0), i * 11.6, 7.5); x.lineTo(-64, 6); x.fill();
    const r = RNG(77);
    for (let i = 0; i < 11; i++) { const a = r.rr(-2.7, -0.44), d = r.rr(0.25, 0.92), sx = cos(a) * 56 * d, sy = sin(a) * 40 * d - 2, sr = r.rr(2.6, 6.2);
      x.fillStyle = rgba(o.c2, 0.22 + wd * 0.2); ell(x, sx, sy, sr * 2, sr * 1.5); x.fillStyle = mix(o.c2, '#fff4d8', 0.25 + wd * 0.5); ell(x, sx, sy, sr, sr * 0.74); }
    x.fillStyle = 'rgba(255,255,255,.16)'; ell(x, -24, -30, 22, 7, -0.42);
    for (const [cx, cy, cr, rot] of [[-30, -41, 9, -0.35], [26, -43, 7, 0.3], [-2, -50, 11, 0]] as number[][]) { line(x, cx, cy + cr * 0.9, cx, cy, 2.6, '#f4e8d6'); cap(x, cx, cy, cr, cr * 0.66, shade(o.col, 0.14), o.c2, rot); }
    x.restore(); x.restore();
  } },
};

export const EN_FRAMES = 12;
export const enemyTex: Record<string, { key: string; ox: number; oy: number; fw: number; fh: number }> = {};
export function bakeEnemy(scene: Phaser.Scene, id: string) {
  if (enemyTex[id] && scene.textures.exists('en_' + id)) return enemyTex[id];
  const d = EN[id], L = LOOKS[d.look];
  const info = bakeSheet(scene, 'en_' + id, L.fw, L.fh, EN_FRAMES, L.ox, L.oy, (x, i) => {
    const o: Pose = { t: i < 8 ? i / 8 : 0, wind: i >= 8 && i <= 10 ? (i - 7) / 3 : 0, stag: i === 11, col: d.col, c2: d.c2 };
    L.draw(x, o);
  });
  return (enemyTex[id] = { ...info });
}
/** 依敵人狀態選格 */
export function enemyFrame(e: any) {
  if (e.state === 'stag') return 11;
  if (e.state === 'wind') { const k = 1 - e.t / (e.tw || 1); return 8 + Math.min(2, Math.floor(k * 3)); }
  if (e.state === 'act') return 10;
  if (e.d.mv === 'hop') return Math.floor((e.hop % 1) * 8) % 8;
  return e.moving ? Math.floor(((e.anim * 1.25) % 1) * 8) % 8 : (Math.floor(e.anim * 2) % 2) * 4;
}
