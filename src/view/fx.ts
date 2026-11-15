// 粒子與傷害數字。自製物件池：所有粒子共用少量貼圖，手機上也能維持流暢。
import Phaser from 'phaser';
import { S1 } from './art/core';
import { rr, cos, sin, TAU } from '../sim/util';

interface Pt { im: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; life: number; max: number; s0: number; s1: number; a0: number; a1: number; vr: number; grav: number; drag: number; sx: number; }
export interface PtOpt { key?: string; x: number; y: number; vx?: number; vy?: number; life?: number; s0?: number; s1?: number; a0?: number; a1?: number; rot?: number; vr?: number; tint?: number; add?: boolean; grav?: number; drag?: number; depth?: number; sx?: number; }
const ADD = Phaser.BlendModes.ADD, NORMAL = Phaser.BlendModes.NORMAL;

export class Fx {
  live: Pt[] = []; pool: Phaser.GameObjects.Image[] = []; nums: { t: Phaser.GameObjects.BitmapText; life: number; max: number; vy: number; vx: number; s: number }[] = []; numPool: Phaser.GameObjects.BitmapText[] = [];
  max = 420;
  constructor(public scene: Phaser.Scene) {}
  spawn(o: PtOpt) {
    if (this.live.length >= this.max) return;
    const key = o.key || 'dot', im = this.pool.pop() || this.scene.add.image(0, 0, key, 0);
    im.setTexture(key, 0).setVisible(true).setBlendMode(o.add === false ? NORMAL : ADD).setDepth(o.depth ?? 930).setTint(o.tint ?? 0xffffff).setRotation(o.rot ?? 0);
    const life = o.life ?? 0.4;
    this.live.push({ im, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, life, max: life, s0: o.s0 ?? 1, s1: o.s1 ?? 0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, vr: o.vr || 0, grav: o.grav || 0, drag: o.drag || 0, sx: o.sx ?? 1 });
  }
  burst(x: number, y: number, n: number, o: Partial<PtOpt> & { spd?: [number, number]; ang?: number; spread?: number; sr?: [number, number]; lr?: [number, number] } = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.ang != null ? o.ang + rr(-(o.spread ?? 0.6), o.spread ?? 0.6) : rr(0, TAU), sp = rr(o.spd?.[0] ?? 60, o.spd?.[1] ?? 220);
      this.spawn({ ...o, x, y, vx: cos(a) * sp, vy: sin(a) * sp, rot: o.key === 'spark' ? a : o.rot ?? rr(0, TAU), s0: o.sr ? rr(o.sr[0], o.sr[1]) : o.s0, life: o.lr ? rr(o.lr[0], o.lr[1]) : o.life });
    }
  }
  num(x: number, y: number, text: string, tint: number, scale = 1) {
    const t = this.numPool.pop() || this.scene.add.bitmapText(0, 0, 'num', '').setOrigin(0.5).setDepth(960);
    t.setText(text).setVisible(true).setTint(tint).setPosition(x + rr(-8, 8), y).setAlpha(1).setScale(S1 * scale * 1.5);
    this.nums.push({ t, life: 0.75, max: 0.75, vy: -70, vx: rr(-18, 18), s: scale });
  }
  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]; p.life -= dt;
      if (p.life <= 0) { p.im.setVisible(false); this.pool.push(p.im); this.live[i] = this.live[this.live.length - 1]; this.live.pop(); continue; }
      const k = 1 - p.life / p.max; p.vy += p.grav * dt; if (p.drag) { const f = Math.min(1, p.drag * dt); p.vx -= p.vx * f; p.vy -= p.vy * f; }
      p.x += p.vx * dt; p.y += p.vy * dt; const s = (p.s0 + (p.s1 - p.s0) * k) * S1;
      p.im.setPosition(p.x, p.y).setScale(s * p.sx, s).setAlpha(p.a0 + (p.a1 - p.a0) * k); if (p.vr) p.im.rotation += p.vr * dt;
    }
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.life -= dt;
      if (n.life <= 0) { n.t.setVisible(false); this.numPool.push(n.t); this.nums.splice(i, 1); continue; }
      const k = 1 - n.life / n.max; n.vy += 160 * dt; n.t.x += n.vx * dt; n.t.y += n.vy * dt;
      const pop = k < 0.15 ? 1.5 - (k / 0.15) * 0.5 : 1; n.t.setScale(S1 * n.s * pop).setAlpha(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    }
  }
  clear() { for (const p of this.live) { p.im.setVisible(false); this.pool.push(p.im); } this.live.length = 0; for (const n of this.nums) { n.t.setVisible(false); this.numPool.push(n.t); } this.nums.length = 0; }
}
