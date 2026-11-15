// 標題畫面：倒懸於深淵之上的塔群，與一名提燈者。全部即時繪製。
import Phaser from 'phaser';
import { VH, RNG, sin, cos, rr, rnd, TAU } from '../sim/util';
import { img, S1, bakeFx, mkCanvas, addCanvasTex, vgrad, rgrad, poly, rrect, circ, Ctx, toInt, BS } from './art/core';
import { bakeHeroes, HERO } from './art/hero';
import { Fx } from './fx';
import { Bus } from '../app/bus';

const ADD = Phaser.BlendModes.ADD;
/** 一座倒掛的塔（從上方垂下） */
function tower(x: Ctx, r: any, cx: number, w: number, len: number, col: string, lit: number) {
  x.fillStyle = col; const seg = r.int(2, 4); let y = 0, ww = w;
  for (let i = 0; i < seg; i++) { const h = (len / seg) * r.rr(0.8, 1.2); rrect(x, cx - ww / 2, y - 2, ww, h + 2, [0, 0, 3, 3]);
    for (let k = -1; k <= 1; k += 2) rrect(x, cx + k * (ww / 2 + 2) - 3, y + h - 9, 6, 9, 1.5);            // 垛口
    for (let j = 0; j < r.int(0, 3); j++) if (r.chance(lit)) { x.fillStyle = 'rgba(255,214,150,.85)'; rrect(x, cx + r.rr(-ww / 2 + 4, ww / 2 - 7), y + r.rr(8, h - 16), 2.6, 4.4, 1); x.fillStyle = col; }
    y += h; ww *= r.rr(0.62, 0.82); }
  poly(x, [cx - ww / 2, y - 1, cx + ww / 2, y - 1, cx, y + ww * r.rr(1.2, 2.2)]);                                // 塔尖
}
export class TitleScene extends Phaser.Scene {
  fx!: Fx; layers: { im: Phaser.GameObjects.Image; k: number; x0: number }[] = []; lamp!: Phaser.GameObjects.Image; hero!: Phaser.GameObjects.Image; t = 0; zoom = 1; VW = 960;
  constructor() { super('title'); }
  create() {
    if (!this.textures.exists('glow')) { bakeFx(this); bakeHeroes(this); }
    this.layers = []; this.fx = new Fx(this); const Wd = 1800;
    { const [c, x] = mkCanvas(8, VH, 1); x.fillStyle = vgrad(x, 0, VH, 0, '#070b10', 0.45, '#0c1820', 0.8, '#113338', 1, '#1d5a55'); x.fillRect(0, 0, 8, VH); addCanvasTex(this, 't_sky', c); }
    const mk = (key: string, seed: number, n: number, col: string, lmin: number, lmax: number, wmin: number, wmax: number, lit: number, edge = false) => {
      const [c, x] = mkCanvas(Wd, VH), r = RNG(seed);
      for (let i = 0; i < n; i++) { let cx = r.rr(0, Wd); if (edge && cx > Wd * 0.3 && cx < Wd * 0.7) cx += (cx < Wd / 2 ? -1 : 1) * Wd * 0.22; tower(x, r, cx, r.rr(wmin, wmax), r.rr(lmin, lmax), col, lit); }
      addCanvasTex(this, key, c);
    };
    mk('t_far', 11, 22, '#12222b', 70, 250, 22, 54, 0.25); mk('t_mid', 23, 12, '#0e1a22', 150, 360, 44, 96, 0.5); mk('t_near', 37, 7, '#080f14', 220, 430, 70, 150, 0.6, true);
    { const [c, x] = mkCanvas(Wd, 260), r = RNG(5); x.fillStyle = '#05090c';   // 前景崖壁
      x.beginPath(); x.moveTo(0, 260); x.lineTo(0, 120); let px = 0, py = 120; while (px < 620) { px += r.rr(18, 60); py += r.rr(-14, 16); py = Math.max(96, Math.min(150, py)); if (px > 400) py = 122; x.lineTo(px, py); } x.lineTo(800, 122); x.lineTo(815, 150); x.lineTo(850, 260); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(Wd, 260); x.lineTo(Wd, 150); px = Wd; py = 150; while (px > Wd - 380) { px -= r.rr(18, 60); py += r.rr(-12, 18); py = Math.max(130, Math.min(200, py)); x.lineTo(px, py); } x.lineTo(Wd - 430, 260); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(125,255,208,.16)'; x.lineWidth = 1.5; for (let i = 0; i < 14; i++) { const gx = r.rr(20, 600), gy = r.rr(120, 160); x.beginPath(); x.moveTo(gx, gy); x.quadraticCurveTo(gx + r.rr(-5, 5), gy - 8, gx + r.rr(-7, 7), gy - r.rr(8, 16)); x.stroke(); }
      addCanvasTex(this, 't_cliff', c); }
    this.add.image(0, 0, 't_sky').setOrigin(0.5, 0).setScale(400, 1).setDepth(0);
    this.add.image(0, VH - 30, 'glow').setScale(9, 3.2).setTint(0x3fd0b0).setAlpha(0.42).setBlendMode(ADD).setDepth(1);
    for (const [key, k, d, a] of [['t_far', 0.25, 2, 0.9], ['t_mid', 0.5, 3, 1], ['t_near', 0.8, 4, 1]] as any[]) this.layers.push({ im: this.add.image(0, 0, key).setOrigin(0.5, 0).setScale(S1).setDepth(d).setAlpha(a), k, x0: 0 });
    this.add.image(0, VH - 60, 'glow').setScale(14, 2).setTint(0x7dffd0).setAlpha(0.1).setBlendMode(ADD).setDepth(5);
    this.layers.push({ im: this.add.image(0, VH - 260, 't_cliff').setOrigin(0.5, 0).setScale(S1).setDepth(6), k: 1, x0: 0 });
    this.lamp = this.add.image(0, 0, 'glow').setBlendMode(ADD).setTint(0xffc878).setDepth(7);
    this.hero = img(this, 'hero_knight', 8, HERO.ox / HERO.fw, HERO.oy / HERO.fh).setDepth(8).setScale(S1 * 2.6);
    this.scale.on('resize', this.layout, this); this.layout();
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }
  layout() { const w = this.scale.width, h = this.scale.height; this.zoom = h / VH; this.VW = w / this.zoom; this.cameras.main.setZoom(this.zoom); this.cameras.main.centerOn(0, VH / 2); }
  update(_t: number, delta: number) {
    const dt = Math.min(delta / 1000, 1 / 30); this.t += dt; const t = this.t, drift = sin(t * 0.05) * 40;
    for (const l of this.layers) l.im.x = drift * l.k * (l.k === 1 ? 0 : 1);
    // 提燈者站在左側崖邊，位置隨螢幕寬度調整
    const hx = Math.min(-130, Math.max(-430, -this.VW / 2 + this.VW * 0.36)), hy = VH - 260 + 122;
    this.hero.setPosition(hx, hy).setScale(S1 * 2.6, S1 * 2.6 * (1 + sin(t * 2) * 0.012));
    this.lamp.setPosition(hx + 26, hy - 26).setScale(1.5 + sin(t * 9) * 0.04 + sin(t * 23) * 0.02).setAlpha(0.55);
    if (rnd() < dt * 9) this.fx.spawn({ key: 'dot', x: rr(-this.VW / 2, this.VW / 2), y: VH + 6, vx: rr(-10, 10), vy: rr(-46, -14), life: rr(4, 9), s0: rr(0.2, 0.5), s1: 0.05, a0: 0.8, a1: 0, tint: rnd() < 0.75 ? 0x7dffd0 : 0xffc878, depth: 9 });
    this.fx.update(dt); Bus.emit('frame', dt);
  }
}
