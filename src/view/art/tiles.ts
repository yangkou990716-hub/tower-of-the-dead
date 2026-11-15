// 房間美術：地板、3/4 視角的牆、裝飾物、互動物。每進一個房間依種子重新烘焙，所以每間都不一樣。
import Phaser from 'phaser';
import { T, RW, RH, RPW, RPH, WH, TAU, RNG, sin, cos, abs, Mf, Rng, hash } from '../../sim/util';
import { SOLID } from '../../sim/world';
import { Ctx, ell, circ, rrect, poly, line, vgrad, rgrad, shade, rgba, mix, mkCanvas, addCanvasTex, bakeOne, bakeSheet, BS } from './core';

export interface RoomArt { lights: { x: number; y: number; r: number; col: string; a: number }[]; props: { key: string; x: number; y: number; glow?: string; flip?: boolean; s?: number }[]; }
const solid = (g: number[][], x: number, y: number) => SOLID(g[y]?.[x]);
const jit = (r: Rng, c: string, k = 0.05) => shade(c, r.rr(-k, k));

function slab(x: Ctx, r: Rng, px: number, py: number, w: number, h: number, col: string) {
  x.fillStyle = col; rrect(x, px + 0.9, py + 0.9, w - 1.8, h - 1.8, 3.6);
  x.fillStyle = 'rgba(255,255,255,.07)'; rrect(x, px + 1.6, py + 1.4, w - 3.2, 1.6, 0.8);
  x.fillStyle = 'rgba(0,0,0,.16)'; rrect(x, px + 1.6, py + h - 3, w - 3.2, 1.6, 0.8);
  if (r.chance(0.16)) { x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 0.9; x.beginPath(); const sx = px + r.rr(6, w - 6), sy = py + r.rr(5, h - 5); x.moveTo(sx, sy); x.lineTo(sx + r.rr(-7, 7), sy + r.rr(3, 8)); x.lineTo(sx + r.rr(-9, 9), sy + r.rr(8, 13)); x.stroke(); }
}
function tuft(x: Ctx, r: Rng, cx: number, cy: number, col: string) {
  for (let i = 0; i < 5; i++) { const a = -1.57 + r.rr(-0.9, 0.9), l = r.rr(4, 8.5); x.strokeStyle = shade(col, r.rr(-0.1, 0.25)); x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx + r.rr(-3, 3), cy); x.quadraticCurveTo(cx + cos(a) * l * 0.4, cy - l * 0.6, cx + cos(a) * l, cy + sin(a) * l); x.stroke(); }
}
function tinyShroom(x: Ctx, cx: number, cy: number, s: number, col: string, glow: string | null) {
  line(x, cx, cy, cx, cy - 4.5 * s, 1.6 * s, '#e6dcc6');
  x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy - 4.5 * s, 4 * s, 3 * s, 0, Math.PI, TAU); x.fill(); x.fillStyle = shade(col, -0.3); ell(x, cx, cy - 4.4 * s, 4 * s, 0.9 * s);
  if (glow) { x.fillStyle = rgba(glow, 0.9); circ(x, cx - 1.2 * s, cy - 6 * s, 0.8 * s); circ(x, cx + 1.6 * s, cy - 5.4 * s, 0.6 * s); }
}

/** 烘焙地板（含危害地形、牆腳陰影、地面小物）。 */
export function bakeFloor(scene: Phaser.Scene, room: any, art: RoomArt) {
  const [c, x] = mkCanvas(RPW, RPH), g: number[][] = room.g, P = room.biome.pal, r = RNG(hash(room.def.seed, 4242));
  x.fillStyle = P.grout; x.fillRect(0, 0, RPW, RPH);
  for (let ty = 0; ty < RH; ty++) for (let tx = 0; tx < RW; tx++) {
    if (solid(g, tx, ty)) continue; const px = tx * T, py = ty * T, col = jit(r, r.pick(P.floor), 0.045), k = r();
    if (g[ty][tx] === 9) { slab(x, r, px, py, T, T, shade(P.floor[0], 0.1)); continue; }
    if (k < 0.66) slab(x, r, px, py, T, T, col);
    else if (k < 0.82) { slab(x, r, px, py, T / 2, T, col); slab(x, r, px + T / 2, py, T / 2, T, jit(r, col)); }
    else if (k < 0.94) { slab(x, r, px, py, T, T / 2, col); slab(x, r, px, py + T / 2, T, T / 2, jit(r, col)); }
    else { for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) slab(x, r, px + ox * T / 2, py + oy * T / 2, T / 2, T / 2, jit(r, col, 0.07)); }
  }
  // 大片苔蘚色塊，打破格子感
  x.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 16; i++) { const cx = r.rr(0, RPW), cy = r.rr(0, RPH), rad = r.rr(50, 130); x.fillStyle = rgrad(x, cx, cy, rad, 0, rgba(P.moss, r.rr(0.16, 0.34)), 1, rgba(P.moss, 0)); x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 7; i++) { const cx = r.rr(0, RPW), cy = r.rr(0, RPH), rad = r.rr(60, 150); x.fillStyle = rgrad(x, cx, cy, rad, 0, 'rgba(8,14,18,.3)', 1, 'rgba(8,14,18,0)'); x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
  x.globalCompositeOperation = 'source-over';
  // 危害地形
  for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) {
    const t = g[ty][tx], px = tx * T, py = ty * T, cx = px + T / 2, cy = py + T / 2;
    if (t === 6) { // 泥沼：先畫外圈（與相鄰泥格連成一片），內層稍後再疊
      x.fillStyle = shade(P.haz, -0.35); rrect(x, px - 4, py - 4, T + 8, T + 8, 14);
    } else if (t === 4) { x.fillStyle = '#3a1410'; rrect(x, px - 2, py - 2, T + 4, T + 4, 10); x.fillStyle = rgrad(x, cx, cy, 26, 0, '#ffd27a', 0.5, '#ff7a33', 1, '#a02a12'); rrect(x, px + 1, py + 1, T - 2, T - 2, 9); }
    else if (t === 5) { x.fillStyle = 'rgba(10,14,18,.55)'; rrect(x, px + 3, py + 3, T - 6, T - 6, 5); x.fillStyle = '#0a0d10'; for (const [ox, oy] of [[-9, -9], [9, -9], [0, 0], [-9, 9], [9, 9]]) circ(x, cx + ox, cy + oy, 2.6); }
  }
  for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) if (g[ty][tx] === 6) { const px = tx * T, py = ty * T; x.fillStyle = P.haz; rrect(x, px - 1, py - 1, T + 2, T + 2, 11); }
  for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) if (g[ty][tx] === 6) { const cx = tx * T + T / 2, cy = ty * T + T / 2;
    x.fillStyle = rgba(shade(P.haz, 0.22), 0.55); ell(x, cx + r.rr(-8, 8), cy + r.rr(-8, 8), r.rr(8, 15), r.rr(4, 8), r.rr(-0.4, 0.4));
    if (r.chance(0.55)) { x.strokeStyle = rgba(P.acc, 0.3); x.lineWidth = 1; const bx = cx + r.rr(-12, 12), by2 = cy + r.rr(-12, 12), br = r.rr(1.6, 3.4); x.beginPath(); x.arc(bx, by2, br, 0, TAU); x.stroke(); x.fillStyle = 'rgba(255,255,255,.18)'; circ(x, bx - br * 0.3, by2 - br * 0.3, br * 0.3); } }
  // 牆腳陰影（環境遮蔽）
  for (let ty = 0; ty < RH; ty++) for (let tx = 0; tx < RW; tx++) {
    if (solid(g, tx, ty)) continue; const px = tx * T, py = ty * T;
    if (solid(g, tx, ty - 1)) { x.fillStyle = vgrad(x, py, py + 20, 0, 'rgba(4,8,10,.62)', 1, 'rgba(4,8,10,0)'); x.fillRect(px, py, T, 20); }
    if (solid(g, tx - 1, ty)) { const gr = x.createLinearGradient(px, 0, px + 11, 0); gr.addColorStop(0, 'rgba(4,8,10,.34)'); gr.addColorStop(1, 'rgba(4,8,10,0)'); x.fillStyle = gr; x.fillRect(px, py, 11, T); }
    if (solid(g, tx + 1, ty)) { const gr = x.createLinearGradient(px + T, 0, px + T - 11, 0); gr.addColorStop(0, 'rgba(4,8,10,.34)'); gr.addColorStop(1, 'rgba(4,8,10,0)'); x.fillStyle = gr; x.fillRect(px + T - 11, py, 11, T); }
    if (solid(g, tx, ty + 1)) { x.fillStyle = vgrad(x, py + T - WH - 9, py + T - WH, 0, 'rgba(4,8,10,0)', 1, 'rgba(4,8,10,.4)'); x.fillRect(px, py + T - WH - 9, T, 9 + WH); }
  }
  // 地面小物
  for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) {
    if (g[ty][tx] !== 0) continue; const cx = tx * T + r.rr(8, 32), cy = ty * T + r.rr(12, 34), k = r();
    const edge = solid(g, tx, ty - 1) || solid(g, tx - 1, ty) || solid(g, tx + 1, ty);
    if (k < (edge ? 0.3 : 0.1)) tuft(x, r, cx, cy, P.moss);
    else if (k < (edge ? 0.42 : 0.14)) { const gl = r.chance(0.55); tinyShroom(x, cx, cy, r.rr(0.8, 1.25), gl ? shade(P.acc, -0.25) : '#c9825a', gl ? P.acc : null); if (gl) art.lights.push({ x: cx, y: cy - 4, r: 46, col: P.acc, a: 0.5 }); }
    else if (k < 0.2) { x.fillStyle = 'rgba(0,0,0,.25)'; ell(x, cx + 1, cy + 1.5, 3.4, 2.2); x.fillStyle = shade(P.floor[0], 0.18); ell(x, cx, cy, 3.2, 2.3); }
  }
  addCanvasTex(scene, 'floor', c);
}

/** 烘焙牆面：每一列牆是一條獨立貼圖帶（頂面 + 正面），畫面依列與角色穿插排序。 */
export function bakeWalls(scene: Phaser.Scene, room: any, art: RoomArt) {
  const BH = T + WH, [c, x] = mkCanvas(RPW, BH * RH), g: number[][] = room.g, P = room.biome.pal, r = RNG(hash(room.def.seed, 9191));
  for (let ty = 0; ty < RH; ty++) {
    const by = ty * BH;
    for (let tx = 0; tx < RW; tx++) {
      if (!solid(g, tx, ty)) continue; const px = tx * T, block = g[ty][tx] === 2;
      const oN = !solid(g, tx, ty - 1) && ty > 0, oS = !solid(g, tx, ty + 1) && ty < RH - 1, oW = !solid(g, tx - 1, ty) && tx > 0, oE = !solid(g, tx + 1, ty) && tx < RW - 1;
      // 正面
      if (oS) {
        x.fillStyle = vgrad(x, by + T, by + BH, 0, P.wallFace, 1, P.wallFace2); x.fillRect(px, by + T, T, WH);
        x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, by + T + 9); x.lineTo(px + T, by + T + 9); x.moveTo(px, by + T + 18); x.lineTo(px + T, by + T + 18);
        const o1 = r.rr(8, 30); x.moveTo(px + o1, by + T); x.lineTo(px + o1, by + T + 9); x.moveTo(px + (o1 + 18) % T, by + T + 9); x.lineTo(px + (o1 + 18) % T, by + T + 18); x.moveTo(px + o1, by + T + 18); x.lineTo(px + o1, by + BH); x.stroke();
        x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(px, by + BH - 3, T, 3); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(px, by + T, T, 2.5);
        if (oW) { x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(px, by + T, 2, WH); } if (oE) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(px + T - 2, by + T, 2, WH); }
        // 垂藤
        if (r.chance(0.5)) for (let i = 0; i < r.int(1, 3); i++) { const vx = px + r.rr(4, T - 4), vl = r.rr(7, WH - 3); x.strokeStyle = shade(P.moss, r.rr(-0.15, 0.2)); x.lineWidth = 1.7; x.beginPath(); x.moveTo(vx, by + T - 1); x.quadraticCurveTo(vx + r.rr(-3, 3), by + T + vl * 0.5, vx + r.rr(-2, 2), by + T + vl); x.stroke(); x.fillStyle = shade(P.moss, 0.2); ell(x, vx + r.rr(-2, 2), by + T + vl, 2, 1.5, r.rr(0, 3)); }
        // 壁上發光菌
        if (r.chance(0.13)) { const fx = px + r.rr(9, T - 9), fy = by + T + r.rr(8, 16); for (const [ox, s] of [[-4, 0.9], [2, 1.15], [7, 0.75]]) { x.fillStyle = shade(P.acc, -0.2); x.beginPath(); x.ellipse(fx + ox, fy + s * 2, 4 * s, 2.6 * s, 0, Math.PI, TAU); x.fill(); x.fillStyle = rgba(P.acc, 0.95); x.beginPath(); x.ellipse(fx + ox, fy + s * 2 - 0.6, 3 * s, 1.5 * s, 0, Math.PI, TAU); x.fill(); } art.lights.push({ x: fx + 2, y: ty * T + T - WH + (fy - by - T) + 14, r: 80, col: P.acc, a: 0.75 }); }
      }
      // 頂面
      const top = jit(r, r.chance(0.5) ? P.wallTop : P.wallTop2, 0.04), rad = block ? [oN && oW ? 7 : 0, oN && oE ? 7 : 0, oS && oE ? 5 : 0, oS && oW ? 5 : 0] : 0;
      x.fillStyle = top; rrect(x, px, by, T, T, rad as any);
      x.save(); x.beginPath(); (x as any).roundRect(px, by, T, T, rad); x.clip();
      for (let i = 0; i < 2; i++) { x.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; ell(x, px + r.rr(0, T), by + r.rr(0, T), r.rr(8, 18), r.rr(6, 12), r.rr(0, 3)); }
      for (let i = 0; i < r.int(0, 2); i++) { x.fillStyle = rgba(shade(P.moss, r.rr(0, 0.3)), r.rr(0.4, 0.8)); const ex = r.chance(0.5) ? r.rr(0, 6) : r.rr(T - 6, T); ell(x, px + (r.chance(0.5) ? ex : r.rr(0, T)), by + (r.chance(0.5) ? ex : r.rr(0, T)), r.rr(4, 9), r.rr(3, 6), r.rr(0, 3)); }
      if (block) { // 石塊：內嵌一圈刻紋，讀起來是實心的石頭而不是平面
        x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 1.4; const ix = px + (oW ? 6 : -4), iy = by + (oN ? 6 : -4), iw = T - (oW ? 6 : -4) - (oE ? 6 : -4), ih = T - (oN ? 6 : -4) - (oS ? 6 : -4); x.beginPath(); (x as any).roundRect(ix, iy, iw, ih, 3); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1; x.beginPath(); (x as any).roundRect(ix + 1.4, iy + 1.4, iw, ih, 3); x.stroke();
        if (r.chance(0.4)) { x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1; x.beginPath(); const sx = px + r.rr(10, 30), sy = by + r.rr(8, 14); x.moveTo(sx, sy); x.lineTo(sx + r.rr(-5, 5), sy + r.rr(6, 10)); x.lineTo(sx + r.rr(-8, 8), sy + r.rr(12, 18)); x.stroke(); } }
      if (oN) { x.fillStyle = rgba(P.rim, 0.85); x.fillRect(px, by, T, 2.8); } if (oW) { x.fillStyle = rgba(P.rim, 0.55); x.fillRect(px, by, 2.6, T); }
      if (oE) { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(px + T - 2.6, by, 2.6, T); } if (oS) { x.fillStyle = rgba(P.rim, 0.7); x.fillRect(px, by + T - 2.8, T, 2.8); }
      x.restore();
      // 障礙物上的蕈叢（發光）
      if (block && oS && r.chance(0.5)) art.props.push({ key: 'prop_shroom' + r.int(0, 2), x: px + T / 2 + r.rr(-5, 5), y: ty * T + T - WH + r.rr(-10, -3), glow: P.acc, flip: r.chance(0.5), s: r.rr(0.85, 1.15) });
    }
  }
  const tex = addCanvasTex(scene, 'walls', c);
  for (let ty = 0; ty < RH; ty++) tex.add(ty, 0, 0, ty * BH * BS, RPW * BS, BH * BS);
  // 牆邊裝飾（會與角色前後遮擋）
  for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) {
    if (g[ty][tx] !== 0 || !solid(g, tx, ty - 1) || g[ty - 1][tx] === 9) continue;
    const k = r(); if (k < 0.1) art.props.push({ key: 'prop_shroom' + r.int(0, 2), x: tx * T + r.rr(10, 30), y: ty * T + r.rr(7, 13), glow: P.acc, flip: r.chance(0.5), s: r.rr(0.9, 1.3) });
    else if (k < 0.2) art.props.push({ key: 'prop_fern', x: tx * T + r.rr(10, 30), y: ty * T + r.rr(6, 12), flip: r.chance(0.5), s: r.rr(0.8, 1.2) });
  }
}

/** 生態域共用的裝飾與互動物貼圖 */
export function bakeProps(scene: Phaser.Scene, P: any) {
  for (let v = 0; v < 3; v++) bakeOne(scene, 'prop_shroom' + v, 48, 56, 24, 50, (x) => {
    const r = RNG(100 + v), n = 2 + v;
    for (let i = 0; i < n; i++) { const ox = (i - (n - 1) / 2) * 8 + r.rr(-2, 2), h = r.rr(12, 30) * (i === 1 ? 1.25 : 1), rw = r.rr(6, 10), lean = r.rr(-0.25, 0.25);
      x.strokeStyle = '#e9dfc9'; x.lineWidth = 3; x.beginPath(); x.moveTo(ox, 0); x.quadraticCurveTo(ox + lean * 10, -h * 0.5, ox + lean * 14, -h); x.stroke();
      const cx = ox + lean * 14, cy = -h; x.fillStyle = rgba(P.acc, 0.22); ell(x, cx, cy - 1, rw * 1.6, rw * 1.2);
      x.fillStyle = shade(P.acc, -0.45); ell(x, cx, cy + 1, rw, rw * 0.36);
      x.fillStyle = vgrad(x, cy - rw * 0.8, cy + 2, 0, mix(P.acc, '#ffffff', 0.45), 1, shade(P.acc, -0.22)); x.beginPath(); x.ellipse(cx, cy + 0.5, rw, rw * 0.78, lean, Math.PI, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,.7)'; circ(x, cx - rw * 0.35, cy - rw * 0.4, rw * 0.13); circ(x, cx + rw * 0.3, cy - rw * 0.25, rw * 0.09); }
  });
  bakeOne(scene, 'prop_fern', 44, 36, 22, 32, (x) => { const r = RNG(31);
    for (let i = 0; i < 7; i++) { const a = -1.57 + (i - 3) * 0.36, l = 17 + r.rr(-3, 6), ex = cos(a) * l, ey = sin(a) * l * 0.95; x.strokeStyle = shade(P.moss, r.rr(-0.05, 0.3)); x.lineWidth = 2.4; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(ex * 0.5, ey * 1.25, ex, ey + abs(i - 3) * 2.5); x.stroke(); } });
  // 寶箱（關／開）
  bakeSheet(scene, 'chest', 56, 52, 2, 28, 42, (x, i) => {
    x.fillStyle = 'rgba(0,0,0,.35)'; ell(x, 0, 2, 22, 7);
    x.fillStyle = vgrad(x, -18, 0, 0, '#8a5a34', 1, '#4f3220'); rrect(x, -18, -16, 36, 16, 3); x.fillStyle = '#c9a25a'; rrect(x, -18, -9, 36, 2.6, 1); rrect(x, -12, -16, 2.6, 16, 1); rrect(x, 9.4, -16, 2.6, 16, 1);
    if (i === 0) { x.fillStyle = vgrad(x, -30, -15, 0, '#a8703f', 1, '#6b4426'); x.beginPath(); x.moveTo(-19, -15); x.quadraticCurveTo(-19, -29, 0, -29); x.quadraticCurveTo(19, -29, 19, -15); x.closePath(); x.fill(); x.fillStyle = '#c9a25a'; rrect(x, -19, -17.5, 38, 3, 1); rrect(x, -12, -28, 2.6, 12, 1); rrect(x, 9.4, -28, 2.6, 12, 1); x.fillStyle = '#f3d27a'; rrect(x, -3.2, -19, 6.4, 7.5, 1.6); x.fillStyle = '#3a2a14'; circ(x, 0, -15.6, 1.3); }
    else { x.fillStyle = '#231710'; rrect(x, -16, -19, 32, 5, 1.5); x.fillStyle = rgba('#ffe2a6', 0.85); rrect(x, -14, -18, 28, 3, 1.5); x.fillStyle = vgrad(x, -40, -20, 0, '#8a5a34', 1, '#5a3a22'); x.beginPath(); x.moveTo(-19, -20); x.lineTo(-17, -38); x.quadraticCurveTo(0, -43, 17, -38); x.lineTo(19, -20); x.closePath(); x.fill(); x.fillStyle = '#c9a25a'; rrect(x, -19, -22, 38, 2.6, 1); }
  });
  // 營火
  bakeOne(scene, 'firepit', 64, 44, 32, 30, (x) => {
    x.fillStyle = 'rgba(0,0,0,.35)'; ell(x, 0, 3, 26, 9);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, sx = cos(a) * 20, sy = sin(a) * 8; x.fillStyle = shade('#6f7a80', (i % 3) * 0.08 - 0.1); ell(x, sx, sy, 5.2, 3.8); x.fillStyle = 'rgba(255,255,255,.12)'; ell(x, sx - 1, sy - 1.2, 2.6, 1.3); }
    x.save(); x.rotate(0.35); x.fillStyle = '#5a3a22'; rrect(x, -14, -4.5, 28, 6, 3); x.restore(); x.save(); x.rotate(-0.4); x.fillStyle = '#6b4628'; rrect(x, -14, -5, 28, 6, 3); x.restore();
    x.fillStyle = rgba('#ff9a3d', 0.55); ell(x, 0, -2, 9, 4);
  });
  bakeOne(scene, 'flame', 32, 48, 16, 44, (x) => {
    x.fillStyle = vgrad(x, -40, 0, 0, 'rgba(255,120,40,0)', 0.25, 'rgba(255,140,50,.85)', 1, '#ffb347'); x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-14, -6, -11, -22, -2, -40); x.bezierCurveTo(-1, -28, 12, -22, 0, 0); x.fill();
    x.fillStyle = vgrad(x, -24, 0, 0, 'rgba(255,240,190,0)', 0.4, '#ffe9a8', 1, '#fff6d8'); x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-7, -4, -6, -13, -1, -24); x.bezierCurveTo(0, -15, 7, -11, 0, 0); x.fill();
  });
  // 向下的階梯（傳送井）
  bakeOne(scene, 'stairs', 88, 64, 44, 40, (x) => {
    x.fillStyle = shade(P.wallTop, -0.1); ell(x, 0, 0, 42, 20); x.fillStyle = '#05080a'; ell(x, 0, 1, 35, 16);
    for (let i = 0; i < 5; i++) { const k = i / 5; x.fillStyle = mix(shade(P.wallTop, -0.15), '#05080a', k); x.beginPath(); x.ellipse(-(k * 6), 3 + k * 4, 30 * (1 - k * 0.55), 12 * (1 - k * 0.55), 0, 0.2, Math.PI - 0.2); x.fill(); }
    x.strokeStyle = rgba(P.acc, 0.9); x.lineWidth = 1.8; x.shadowColor = P.acc; x.shadowBlur = 8; x.beginPath(); x.ellipse(0, 0, 38.5, 18, 0, 0, TAU); x.stroke(); x.shadowBlur = 0;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.fillStyle = rgba(P.acc, 0.95); circ(x, cos(a) * 38.5, sin(a) * 18, 1.7); }
  });
  // 金幣、治癒之心
  bakeOne(scene, 'coin', 16, 16, 8, 8, (x) => { x.fillStyle = '#a8742a'; circ(x, 0, 0.8, 5.6); x.fillStyle = rgrad(x, -1.5, -2, 7, 0, '#fff0b8', 0.5, '#f3c95f', 1, '#c9912f'); circ(x, 0, 0, 5.4); x.fillStyle = 'rgba(160,100,20,.55)'; rrect(x, -1, -2.8, 2, 5.6, 1); });
  bakeOne(scene, 'heart', 24, 24, 12, 12, (x) => { x.fillStyle = rgrad(x, -2, -3, 11, 0, '#ffb1a6', 0.5, '#e8584c', 1, '#9c2a2a'); x.beginPath(); x.moveTo(0, 8); x.bezierCurveTo(-12, -1, -7, -10, 0, -4); x.bezierCurveTo(7, -10, 12, -1, 0, 8); x.fill(); x.fillStyle = 'rgba(255,255,255,.6)'; ell(x, -3.4, -3.6, 2, 1.3, -0.6); });
  // 符文石與遺物（依顏色著色）
  bakeOne(scene, 'ico_rune', 28, 32, 14, 16, (x) => { x.fillStyle = vgrad(x, -13, 13, 0, '#6d7884', 1, '#353c46'); poly(x, [0, -13, 10, -6, 10, 7, 0, 13, -10, 7, -10, -6]); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -13); x.lineTo(10, -6); x.moveTo(0, -13); x.lineTo(-10, -6); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.shadowColor = '#fff'; x.shadowBlur = 6; x.beginPath(); x.moveTo(0, -7); x.lineTo(0, 7); x.moveTo(-4.5, -2.5); x.lineTo(0, -7); x.lineTo(4.5, -2.5); x.moveTo(-4, 3); x.lineTo(4, 3); x.stroke(); });
  bakeOne(scene, 'ico_relic', 32, 34, 16, 17, (x) => { x.strokeStyle = '#c9a25a'; x.lineWidth = 2.4; x.beginPath(); x.arc(0, -9, 4, 0, TAU); x.stroke();
    x.fillStyle = vgrad(x, -6, 14, 0, '#f3d27a', 1, '#a8782e'); poly(x, [0, -6, 10, 3, 0, 15, -10, 3]); x.fillStyle = rgrad(x, -1, 2, 7, 0, '#fffbe6', 0.5, '#ffe2a6', 1, '#d99a3a'); poly(x, [0, -1.5, 5.6, 3.4, 0, 10.4, -5.6, 3.4]); x.fillStyle = 'rgba(255,255,255,.75)'; poly(x, [-1.6, 0.6, 1.2, 2.6, -2.4, 4]); });
  // 鎖門的光障
  bakeOne(scene, 'barrier', 124, 20, 62, 10, (x) => { const g = x.createLinearGradient(-62, 0, 62, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.15, '#fff'); g.addColorStop(0.85, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; rrect(x, -62, -2, 124, 4, 2); x.globalAlpha = 0.4; rrect(x, -62, -7, 124, 14, 7); });
}
