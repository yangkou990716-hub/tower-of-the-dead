// 主角與武器的繪製。四個職業共用「兜帽下只看得見發光雙眼」的造型語言。
import Phaser from 'phaser';
import { TAU, sin, cos, abs, max } from '../../sim/util';
import { Ctx, ell, circ, rrect, poly, line, vgrad, rgrad, shade, rgba, bakeSheet, bakeOne } from './core';
import { WPN, EL } from '../../sim/data';

export const LOOK: Record<string, any> = {
  knight: { body: '#3f6fb6', cape: '#22385c', boot: '#262b36', eye: '#ffdf9a', metal: '#bcc7d6', metalD: '#66748a', trim: '#e9c96f', plume: '#dc5a4e' },
  ranger: { body: '#7d5c3d', cape: '#3b6b47', boot: '#33271e', eye: '#dcffb4', hood: '#4f8a5b', trim: '#e2cb93' },
  rogue: { body: '#474160', cape: '#2b2640', boot: '#1c1a28', eye: '#ffa590', hood: '#332d4a', trim: '#dc5a4e' },
  mage: { body: '#5a55b8', cape: '#383480', boot: '#272550', eye: '#b0ecff', hood: '#433e96', trim: '#f3b95f' },
};
const VOID = '#14121a';

function eyes(x: Ctx, col: string, cx: number, cy: number, gap = 4.2, r = 1.35, narrow = 1) {
  x.fillStyle = rgba(col, 0.35); ell(x, cx, cy, r * 2.6, r * 2 * narrow); ell(x, cx + gap, cy, r * 2.6, r * 2 * narrow);
  x.fillStyle = col; ell(x, cx, cy, r, r * narrow); ell(x, cx + gap, cy, r, r * narrow);
  x.fillStyle = '#fff'; ell(x, cx - 0.3, cy - 0.3, r * 0.45, r * 0.45 * narrow); ell(x, cx + gap - 0.3, cy - 0.3, r * 0.45, r * 0.45 * narrow);
}
function lantern(x: Ctx, lx: number, ly: number) {
  line(x, lx, ly - 5, lx, ly - 2.5, 0.8, '#8a6a34');
  x.fillStyle = '#c9a25a'; rrect(x, lx - 2.3, ly - 2.8, 4.6, 5.6, 1.2);
  x.fillStyle = '#fff1c4'; rrect(x, lx - 1.3, ly - 1.7, 2.6, 3.4, 0.8);
}

/** t：走路週期 0..1（0 = 站立）。back：背對鏡頭。原點在腳底，面向右。 */
export function drawHero(x: Ctx, cls: string, t: number, back: boolean) {
  const L = LOOK[cls], ph = t * TAU, s = sin(ph), bob = abs(s) * 1.7, sway = s * 1.4;
  // 腳
  x.fillStyle = L.boot; ell(x, -4 + s * 2.2, -1.3 - max(0, s) * 2.8, 3.7, 2.6); ell(x, 4 - s * 2.2, -1.3 - max(0, -s) * 2.8, 3.7, 2.6);
  x.save(); x.translate(0, -bob);
  const wide = cls === 'mage' ? 1.6 : 0;
  // 披風（正面時在身後露出兩側）
  if (!back) {
    x.fillStyle = L.cape; x.beginPath(); x.moveTo(-7, -19); x.quadraticCurveTo(-13 - wide, -10, -12.5 - wide - sway, -1.5);
    x.quadraticCurveTo(-2, 1.5, 8 - sway * 0.4, -2); x.quadraticCurveTo(10, -10, 7, -19); x.closePath(); x.fill();
    lantern(x, -10.5 - sway * 0.5, -8);
  }
  // 身體
  x.fillStyle = vgrad(x, -20, -2, 0, shade(L.body, 0.16), 1, shade(L.body, -0.28));
  x.beginPath(); x.moveTo(-6.6, -19); x.quadraticCurveTo(-9.8 - wide, -9, -9.2 - wide, -3.2);
  x.quadraticCurveTo(-4.5, -0.8 + sway * 0.4, 0, -3); x.quadraticCurveTo(4.5, -0.8 - sway * 0.4, 9.2 + wide, -3.2);
  x.quadraticCurveTo(9.8 + wide, -9, 6.6, -19); x.closePath(); x.fill();
  if (!back) {
    if (cls === 'knight') {
      x.fillStyle = '#efe6cf'; rrect(x, -2.6, -18, 5.2, 13.5, 1.2); x.fillStyle = L.trim; poly(x, [0, -14.5, 2.2, -11.5, 0, -8.5, -2.2, -11.5]);
      x.fillStyle = shade(L.body, -0.35); rrect(x, -8.6, -7.6, 17.2, 2, 1);
    } else if (cls === 'ranger') {
      x.fillStyle = shade(L.body, -0.3); rrect(x, -8.8, -8, 17.6, 2.2, 1); x.fillStyle = L.trim; rrect(x, -1.4, -8.6, 2.8, 3.4, 0.8);
      line(x, -6, -17, 5, -9, 1.6, shade(L.body, -0.4));
    } else if (cls === 'rogue') {
      line(x, -6, -17, 6, -8, 1.5, shade(L.body, -0.45)); line(x, 6, -17, -6, -8, 1.5, shade(L.body, -0.45));
      x.fillStyle = '#c9ced8'; rrect(x, 4.5, -7.5, 1.6, 4.6, 0.6);
    } else {
      x.fillStyle = L.trim; rrect(x, -0.9, -18, 1.8, 14.5, 0.8); x.strokeStyle = L.trim; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(-10.4, -3.8); x.quadraticCurveTo(-4.5, -1.6 + sway * 0.4, 0, -3.7); x.quadraticCurveTo(4.5, -1.6 - sway * 0.4, 10.4, -3.8); x.stroke();
    }
    // 手
    x.fillStyle = shade(L.body, -0.18); circ(x, -8.6 - wide * 0.5, -11.5 + s * 0.8, 2.7); circ(x, 8.6 + wide * 0.5, -11.5 - s * 0.8, 2.7);
  }
  // 背面：披風蓋住身體
  if (back) {
    x.fillStyle = vgrad(x, -20, 0, 0, shade(L.cape, 0.12), 1, shade(L.cape, -0.2));
    x.beginPath(); x.moveTo(-7.4, -19.5); x.quadraticCurveTo(-12.5 - wide, -9, -11.5 - wide + sway, -1.5); x.quadraticCurveTo(-5, 1.2, 0, -1.2);
    x.quadraticCurveTo(5, 1.2, 11.5 + wide + sway, -1.5); x.quadraticCurveTo(12.5 + wide, -9, 7.4, -19.5); x.closePath(); x.fill();
    x.strokeStyle = rgba(L.trim, 0.8); x.lineWidth = 1.1; x.beginPath(); x.moveTo(-11 - wide + sway, -2.6); x.quadraticCurveTo(-5, 0.2, 0, -2.2); x.quadraticCurveTo(5, 0.2, 11 + wide + sway, -2.6); x.stroke();
    if (cls === 'ranger') { x.save(); x.translate(3, -12); x.rotate(-0.5); x.fillStyle = '#6b4a2e'; rrect(x, -2.6, -8, 5.2, 14, 2); x.fillStyle = '#efe6cf'; poly(x, [-2, -8, -1, -12, 0, -8]); x.fillStyle = '#dc5a4e'; poly(x, [0.4, -8, 1.6, -12.5, 2.6, -8]); x.restore(); }
    lantern(x, 10.5 + sway * 0.5, -8);
  }
  // ---- 頭 ----
  const hy = -24.5;
  if (cls === 'knight') {
    // 盔纓
    x.fillStyle = L.plume; x.beginPath(); x.moveTo(1, hy - 8.4); x.bezierCurveTo(-4, hy - 15, -13 - sway, hy - 11, -12 - sway, hy - 3); x.bezierCurveTo(-9, hy - 7, -5, hy - 7.5, -1.5, hy - 7.8); x.closePath(); x.fill();
    x.fillStyle = rgrad(x, -3, hy - 4, 13, 0, '#eef2f7', 0.45, L.metal, 1, L.metalD); circ(x, 0, hy, 8.7);
    if (!back) {
      x.fillStyle = VOID; rrect(x, -6.4, hy - 2.6, 13.6, 5.4, 2.4); eyes(x, L.eye, 0.6, hy + 0.2);
      x.fillStyle = L.metal; rrect(x, 2.1, hy - 3.2, 1.5, 7.6, 0.7);
      x.strokeStyle = rgba(L.metalD, 0.9); x.lineWidth = 1; x.beginPath(); x.arc(0, hy, 8.2, 0.35, Math.PI - 0.35); x.stroke();
    } else { x.strokeStyle = rgba(L.metalD, 0.8); x.lineWidth = 1; x.beginPath(); x.moveTo(0, hy - 8); x.lineTo(0, hy + 8); x.stroke(); }
    x.fillStyle = rgrad(x, -1, -18, 5, 0, '#e6ecf3', 1, L.metalD); ell(x, -8.2, -17.2, 3.8, 3.1); ell(x, 8.2, -17.2, 3.8, 3.1);
  } else if (cls === 'mage') {
    x.fillStyle = shade(L.hood, -0.1); circ(x, 0, hy, 7.8);
    if (!back) { x.fillStyle = VOID; ell(x, 0.8, hy + 0.8, 6, 5); eyes(x, L.eye, -0.6, hy + 1.2); }
    // 帽
    x.fillStyle = vgrad(x, hy - 23, hy - 3, 0, shade(L.hood, 0.2), 1, shade(L.hood, -0.15));
    x.beginPath(); x.moveTo(-7.4, hy - 3.6); x.quadraticCurveTo(-4.5, hy - 14, -1, hy - 19); x.quadraticCurveTo(2, hy - 24, 8 + sway * 0.6, hy - 21.5);
    x.quadraticCurveTo(4.5, hy - 19.5, 4, hy - 15); x.quadraticCurveTo(5.5, hy - 9, 7.4, hy - 3.6); x.closePath(); x.fill();
    x.fillStyle = shade(L.hood, -0.25); ell(x, 0, hy - 3.6, 13, 3.7); x.fillStyle = shade(L.hood, 0.08); ell(x, 0, hy - 4.4, 12.4, 3);
    x.fillStyle = L.trim; x.beginPath(); x.ellipse(0, hy - 5.2, 7.5, 2.1, 0, 0, Math.PI); x.fill();
    x.fillStyle = rgba('#fff3c8', 0.9); circ(x, 8 + sway * 0.6, hy - 21.5, 1.7);
  } else {
    const hood = L.hood;
    // 兜帽（尖端向後垂）
    x.fillStyle = vgrad(x, hy - 12, hy + 9, 0, shade(hood, 0.2), 1, shade(hood, -0.22));
    x.beginPath(); x.moveTo(-8.8, hy + 4.5); x.bezierCurveTo(-11, hy - 6, -8, hy - 11.5, -1, hy - 10.2);
    if (cls === 'ranger') x.bezierCurveTo(-4, hy - 14.5, -10 - sway, hy - 14.5, -12.5 - sway, hy - 9.5), x.bezierCurveTo(-8, hy - 11, -4, hy - 10.8, 0, hy - 10);
    x.bezierCurveTo(7, hy - 10.5, 10.5, hy - 5, 8.8, hy + 4.5); x.quadraticCurveTo(0, hy + 9, -8.8, hy + 4.5); x.closePath(); x.fill();
    if (!back) {
      x.fillStyle = VOID; ell(x, 1, hy + 0.6, 6, 5.3);
      if (cls === 'rogue') { eyes(x, L.eye, -0.6, hy - 0.4, 4.4, 1.5, 0.6); x.fillStyle = L.trim; rrect(x, -5.6, hy + 2.2, 13, 3.6, 1.6); }
      else eyes(x, L.eye, -0.6, hy + 0.6);
    }
    if (cls === 'rogue') { // 圍巾飄帶
      x.strokeStyle = L.trim; x.lineWidth = 3; x.beginPath(); x.moveTo(-6, hy + 5); x.bezierCurveTo(-11, hy + 6 + sway, -15 - sway * 1.5, hy + 9, -19 - sway * 2.2, hy + 7 + sway * 1.5); x.stroke();
      x.lineWidth = 2.2; x.strokeStyle = shade(L.trim, -0.2); x.beginPath(); x.moveTo(-6, hy + 6); x.bezierCurveTo(-10, hy + 10, -13 - sway, hy + 13 - sway, -16 - sway * 1.8, hy + 13); x.stroke();
    }
    if (cls === 'ranger' && !back) { x.fillStyle = shade(L.cape, 0.1); ell(x, 0, -17.6, 9.4, 3.6); }
  }
  x.restore();
}

const METAL = ['#f2f5f8', '#aab6c4', '#6d7a8c'];
/** 武器：握把在原點，朝右。 */
export function drawWeapon(x: Ctx, id: string) {
  const w = WPN[id], el = w.el ? EL[w.el] : null, t = w.t;
  const blade = (len: number, wd: number, tip = 7) => {
    x.fillStyle = vgrad(x, -wd, wd, 0, METAL[0], 0.5, METAL[1], 1, METAL[2]); poly(x, [5, -wd, len - tip, -wd * 0.9, len, 0, len - tip, wd * 0.9, 5, wd]);
    x.fillStyle = 'rgba(255,255,255,.55)'; poly(x, [7, -wd * 0.25, len - tip - 2, -wd * 0.2, len - tip - 2, 0.2, 7, 0.3]);
    if (el) { x.strokeStyle = rgba(el, 0.95); x.lineWidth = 1.4; x.shadowColor = el; x.shadowBlur = 5; x.beginPath(); x.moveTo(5, -wd); x.lineTo(len - tip, -wd * 0.9); x.lineTo(len, 0); x.lineTo(len - tip, wd * 0.9); x.lineTo(5, wd); x.stroke(); x.shadowBlur = 0; }
  };
  const gold = t >= 3 ? '#f3d27a' : '#c9a25a', wood = '#6b4a2e';
  switch (w.k) {
    case 'sword': blade(t >= 3 ? 42 : 38, t >= 3 ? 3.6 : 3); x.fillStyle = gold; rrect(x, 2, -6.5, 3.6, 13, 1.6); x.fillStyle = wood; rrect(x, -6, -1.7, 9, 3.4, 1.2); x.fillStyle = gold; circ(x, -7, 0, 2.3); break;
    case 'dagger': blade(24, 2.6, 6); x.fillStyle = gold; rrect(x, 2.4, -4.4, 2.8, 8.8, 1.2); x.fillStyle = '#3a3344'; rrect(x, -5, -1.5, 8, 3, 1.2); break;
    case 'spear': line(x, -14, 0, 44, 0, 2.6, wood); x.save(); x.translate(38, 0); x.fillStyle = vgrad(x, -5, 5, 0, METAL[0], 0.5, METAL[1], 1, METAL[2]); poly(x, [0, -1.6, 6, -5, 24, 0, 6, 5, 0, 1.6]);
      if (el) { x.strokeStyle = rgba(el, 0.95); x.lineWidth = 1.4; x.shadowColor = el; x.shadowBlur = 5; x.beginPath(); x.moveTo(6, -5); x.lineTo(24, 0); x.lineTo(6, 5); x.stroke(); x.shadowBlur = 0; } x.restore();
      x.fillStyle = '#dc5a4e'; poly(x, [34, 1, 37, 1, 34, 8]); x.fillStyle = gold; rrect(x, 35, -2.2, 3.4, 4.4, 1); break;
    case 'hammer': line(x, -10, 0, 30, 0, 3, wood); x.fillStyle = vgrad(x, -11, 11, 0, METAL[0], 0.45, METAL[1], 1, METAL[2]); rrect(x, 24, -11, 15, 22, 3);
      x.fillStyle = el ? rgba(el, 0.95) : gold; rrect(x, 26.5, -11, 2.4, 22, 1); rrect(x, 34, -11, 2.4, 22, 1); if (el) { x.fillStyle = rgba(el, 0.35); circ(x, 31.5, 0, 12); } break;
    case 'bow': x.strokeStyle = t >= 3 ? '#f3d27a' : wood; x.lineWidth = 3; x.beginPath(); x.moveTo(-1, -19); x.quadraticCurveTo(15, -10, 9, 0); x.quadraticCurveTo(15, 10, -1, 19); x.stroke();
      line(x, -1, -19, -1, 19, 0.8, 'rgba(240,235,220,.85)'); x.fillStyle = el ? el : gold; rrect(x, 6.5, -3.4, 4.6, 6.8, 1.6); break;
    case 'staff': line(x, -14, 0, 31, 0, 2.6, wood); x.strokeStyle = gold; x.lineWidth = 2.2; x.beginPath(); x.arc(37, 0, 7, 2.2, -2.2 + TAU); x.stroke();
      { const c = el || '#cfe8ff'; x.fillStyle = rgba(c, 0.35); circ(x, 37, 0, 8); x.fillStyle = rgrad(x, 36, -1, 5, 0, '#fff', 0.5, c, 1, shade(c, -0.3)); circ(x, 37, 0, 4.4); } break;
  }
}

export const HERO = { fw: 60, fh: 72, ox: 30, oy: 58, frames: 16 };
export function bakeHeroes(scene: Phaser.Scene) {
  for (const cls of Object.keys(LOOK)) bakeSheet(scene, 'hero_' + cls, HERO.fw, HERO.fh, 16, HERO.ox, HERO.oy, (x, i) => drawHero(x, cls, (i % 8) / 8, i >= 8));
  for (const id of Object.keys(WPN)) bakeOne(scene, 'w_' + id, 84, 48, 18, 24, (x) => drawWeapon(x, id));
}
