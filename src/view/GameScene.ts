// 遊戲主畫面：把模擬世界 W 畫出來。分層：地板 → 角色與牆（依 y 穿插）→ 光照圖（相乘）→ 泛光與特效（相加）。
import Phaser from 'phaser';
import { W } from '../sim/state';
import { step } from '../sim/combat';
import { T, RW, RH, RPW, RPH, WH, VH, TAU, PI, sin, cos, abs, min, max, clamp, lerp, rr, rnd, Mf, easeOut, hypot } from '../sim/util';
import { DOOR_TILES } from '../sim/world';
import { EL, WPN, RUNE } from '../sim/data';
import { Input } from '../platform/input';
import { Snd } from '../platform/audio';
import { Saves } from '../platform/saves';
import { Bus } from '../app/bus';
import { View } from '../platform/view';
import { img, S1, toInt, bakeFx, BS } from './art/core';
import { bakeHeroes, HERO, LOOK } from './art/hero';
import { bakeEnemy, enemyFrame } from './art/enemies';
import { bakeFloor, bakeWalls, bakeProps, RoomArt } from './art/tiles';
import { Fx } from './fx';

const ADD = Phaser.BlendModes.ADD, MULT = Phaser.BlendModes.MULTIPLY;
const LM = 90, LS = 0.5;                 // 光照圖：外擴邊界與解析度倍率
const C_PARRY = 0xffc24a, C_DODGE = 0xff5548; // 黃 = 可彈反；紅 = 只能閃
type Img = Phaser.GameObjects.Image;

export class GameScene extends Phaser.Scene {
  fx!: Fx; gfx!: Phaser.GameObjects.Graphics; rt!: Phaser.GameObjects.RenderTexture | null;
  roomObjs: Phaser.GameObjects.GameObject[] = []; art: RoomArt = { lights: [], props: [] };
  ents = new Map<number, any>(); shots = new Map<number, any>(); hazs = new Map<number, any>(); picks = new Map<number, any>(); objs = new Map<number, any>();
  pv: any = null; doors: any[] = []; flashes: any[] = []; bolts: any[] = []; fog: Img[] = [];
  shake = 0; cam = { x: 0, y: 0 }; zoom = 1; VW = 960; biomeKey = ''; time0 = 0; lit = true; ambT = 0;
  constructor() { super('game'); }

  create() {
    if (!this.textures.exists('glow')) { bakeFx(this); bakeHeroes(this); }
    this.fx = new Fx(this);
    this.gfx = this.add.graphics().setDepth(905);
    this.lit = this.game.renderer.type === Phaser.WEBGL;
    this.rt = this.lit ? this.add.renderTexture(-LM, -WH - LM, Mf((RPW + LM * 2) * LS), Mf((RPH + WH + LM * 2) * LS)).setOrigin(0).setScale(1 / LS).setBlendMode(MULT).setDepth(900) : null;
    for (let i = 0; i < 3; i++) this.fog.push(img(this, 'smoke').setBlendMode(ADD).setDepth(906).setAlpha(0.05).setScale(7 + i * 2));
    this.scale.on('resize', this.layout, this); this.layout();
    this.events.once('shutdown', () => { this.scale.off('resize', this.layout, this); this.ents.clear(); this.shots.clear(); this.hazs.clear(); this.picks.clear(); this.objs.clear(); this.roomObjs = []; this.doors = []; this.fog = []; this.pv = null; this.biomeKey = ''; });
    Input.toWorld = (mx, my) => { const z = this.zoom, dpr = this.scale.width / View.w; return { x: this.cam.x + (mx * dpr) / z, y: this.cam.y + (my * dpr) / z }; };
    this.buildRoom(true);
  }
  layout() {
    const w = this.scale.width, h = this.scale.height; this.zoom = h / VH; this.VW = w / this.zoom;
    this.cameras.main.setZoom(this.zoom);
  }

  // ---------- 房間 ----------
  buildRoom(snap = false) {
    const room = W.room, P = room.biome.pal;
    for (const o of this.roomObjs) o.destroy(); this.roomObjs = [];
    for (const m of [this.ents, this.shots, this.hazs, this.picks, this.objs]) { for (const v of m.values()) this.kill(v); m.clear(); }
    for (const d of this.doors) { d.im.destroy(); d.gl.destroy(); } this.doors = [];
    this.fx.clear(); this.flashes = []; this.bolts = [];
    if (this.biomeKey !== room.biome.id) { bakeProps(this, P); for (const [id] of room.biome.en) bakeEnemy(this, id); bakeEnemy(this, room.biome.boss); this.biomeKey = room.biome.id; }
    this.art = { lights: [], props: [] };
    bakeFloor(this, room, this.art); bakeWalls(this, room, this.art);
    this.cameras.main.setBackgroundColor(P.bg);
    const add = <G extends Phaser.GameObjects.GameObject>(o: G) => { this.roomObjs.push(o); return o; };
    add(this.add.image(0, 0, 'floor').setOrigin(0).setScale(S1).setDepth(0));
    for (let ty = 0; ty < RH; ty++) add(this.add.image(0, ty * T - WH, 'walls', ty).setOrigin(0).setScale(S1).setDepth(100 + ty * T - 0.5));
    for (const pr of this.art.props) {
      const im = add(img(this, pr.key, 0, 0.5, pr.key === 'prop_fern' ? 32 / 36 : 50 / 56)); im.setPosition(pr.x, pr.y).setScale(S1 * (pr.s || 1) * (pr.flip ? -1 : 1), S1 * (pr.s || 1)).setDepth(100 + pr.y);
      if (pr.glow) { add(img(this, 'glow').setBlendMode(ADD).setTint(toInt(pr.glow)).setAlpha(0.32).setScale(S1 * 0.55).setPosition(pr.x, pr.y - 16).setDepth(910)); this.art.lights.push({ x: pr.x, y: pr.y - 8, r: 105, col: pr.glow, a: 0.85 }); }
    }
    // 門
    for (const dir in room.def.doors) {
      const [tx, ty] = DOOR_TILES[dir][1], horiz = dir === 'n' || dir === 's';
      const x = tx * T + T / 2 + (dir === 'w' ? 14 : dir === 'e' ? -14 : 0), y = ty * T + T / 2 + (dir === 'n' ? 12 : dir === 's' ? -14 : 0);
      const im = img(this, 'barrier').setBlendMode(ADD).setTint(toInt(P.acc)).setPosition(x, y).setRotation(horiz ? 0 : PI / 2).setDepth(912);
      const gl = img(this, 'glow').setBlendMode(ADD).setTint(toInt(P.acc)).setPosition(x, y).setDepth(911).setScale(S1 * (horiz ? 1.3 : 0.5), S1 * (horiz ? 0.5 : 1.3));
      this.doors.push({ dir, x, y, im, gl, a: room.locked ? 1 : 0 });
    }
    if (!this.pv) this.mkPlayer();
    const p = W.p; this.cam.x = p.x - this.VW / 2; this.cam.y = p.y - VH / 2; this.clampCam();
    Bus.emit('room', snap);
  }
  kill(v: any) { for (const k in v) { const o = v[k]; if (o && typeof o.destroy === 'function') o.destroy(); } }

  // ---------- 玩家 ----------
  mkPlayer() {
    const run = W.run!;
    this.pv = { sh: img(this, 'shadow').setDepth(50), body: img(this, 'hero_' + run.cls, 0, HERO.ox / HERO.fw, HERO.oy / HERO.fh), wpn: img(this, 'w_' + run.wpn.id, 0, 18 / 84, 0.5),
      lamp: img(this, 'glow').setBlendMode(ADD).setDepth(909).setTint(0xffd9a0).setAlpha(0.22).setScale(S1 * 0.42), ring: img(this, 'ring').setBlendMode(ADD).setDepth(915).setVisible(false),
      guard: img(this, 'ring').setBlendMode(ADD).setDepth(916).setVisible(false), aura: img(this, 'glow').setBlendMode(ADD).setDepth(908).setVisible(false), wid: run.wpn.id, ghost: 0, kick: 0 };
  }
  updPlayer(dt: number) {
    const p = W.p, v = this.pv, run = W.run!, t = this.time0; if (!v) return;
    if (v.wid !== run.wpn.id) { v.wpn.setTexture('w_' + run.wpn.id, 0); v.wid = run.wpn.id; }
    const back = sin(p.aim) < -0.38, left = cos(p.aim) < 0, kind = WPN[run.wpn.id].k;
    const fr = p.moving && p.dodgeT <= 0 && !p.dead ? Mf(((p.anim * 1.7) % 1) * 8) : 0;
    let sx = S1, sy = S1 * (1 + sin(p.anim * 3) * 0.018), rot = 0, yo = 0, alpha = 1;
    if (p.dodgeT > 0) { const k = clamp(p.dodgeT / 0.34, 0, 1); sx = S1 * 1.12; sy = S1 * 0.84; rot = p.ddx * 0.32; yo = -sin((1 - k) * PI) * 5;
      v.ghost -= dt; if (v.ghost <= 0) { v.ghost = 0.035; this.fx.spawn({ key: 'smoke', x: p.x, y: p.y - 12, life: 0.28, s0: 0.75, s1: 0.4, a0: 0.3, a1: 0, tint: toInt(LOOK[run.cls].eye), depth: 99 + p.y }); } }
    if (p.dead) { rot = (left ? 1 : -1) * 1.45; yo = 4; alpha = 0.85; }
    else if (p.inv > 0 && p.hurt <= 0 && p.dodgeT <= 0) alpha = 0.55 + 0.45 * sin(t * 42);
    if (p.buff.smoke > 0) alpha *= 0.4;
    v.body.setFrame(fr + (back ? 8 : 0)).setFlipX(left).setPosition(p.x, p.y + yo).setScale(sx, sy).setRotation(rot).setAlpha(alpha).setDepth(100 + p.y);
    if (p.hurt > 0.27) v.body.setTintFill(0xffffff); else if (p.hurt > 0) v.body.setTint(0xff8a80); else if (p.potT > 0) v.body.setTint(0xb8ffc8); else if (p.st.poison > 0) v.body.setTint(0xc8f0a0); else if (p.st.burn > 0) v.body.setTint(0xffc0a0); else if (p.st.chill > 0) v.body.setTint(0xb0dcff); else v.body.clearTint();
    v.sh.setPosition(p.x, p.y + 1).setScale(S1 * 0.85, S1 * 0.85).setAlpha(p.dodgeT > 0 ? 0.5 : 0.9);
    // 武器
    let wa = p.aim, fwd = 0; const melee = kind !== 'bow' && kind !== 'staff';
    v.kick = max(0, v.kick - dt * 6);
    if (p.swing) { const k = easeOut(clamp(p.swing.t / p.swing.d, 0, 1)); if (kind === 'spear') fwd = sin(k * PI) * 20; else wa = p.swing.a + p.swing.side * lerp(-(p.swing.arc / 2 + 0.35), p.swing.arc / 2 + 0.25, k); }
    else if (melee) wa = p.aim + (left ? 0.7 : -0.7) * (p.charge > 0 ? 1 + p.charge * 1.4 : 1) + sin(p.anim * 3) * 0.04;
    else fwd = -v.kick * 6 - p.charge * 4;
    const hx = p.x + cos(p.aim) * (8 + fwd), hy = p.y - 13 + sin(p.aim) * (5 + fwd * 0.9) + yo;
    v.wpn.setPosition(hx, hy).setRotation(wa).setFlipY(cos(wa) < 0).setAlpha(alpha).setVisible(!p.dead && p.dodgeT <= 0).setDepth(100 + p.y + (back ? -1 : 1));
    v.lamp.setPosition(p.x, p.y - 10).setAlpha(0.2 + sin(t * 9) * 0.02);
    // 蓄力、彈反、增益
    if (p.charge > 0) { const rdy = p.charge >= 0.4, full = p.charge >= 1; v.ring.setVisible(true).setPosition(p.x, p.y - 13).setScale(S1 * lerp(0.75, 0.22, p.charge)).setTint(full ? 0xffffff : rdy ? 0xffd27a : 0x8a94a0).setAlpha(full ? 0.7 + sin(t * 40) * 0.3 : 0.75);
      if (rdy && rnd() < dt * 30) this.fx.spawn({ key: 'dot', x: hx + rr(-20, 20), y: hy + rr(-20, 20), vx: 0, vy: -20, life: 0.3, s0: 0.5, s1: 0, tint: 0xffd27a }); }
    else v.ring.setVisible(false);
    if (p.parryT > 0) v.guard.setVisible(true).setPosition(p.x + cos(p.aim) * 6, p.y - 13 + sin(p.aim) * 4).setScale(S1 * 0.42).setTint(0xfff0c0).setAlpha(0.95);
    else if (p.parryFail > 0) v.guard.setVisible(true).setPosition(p.x, p.y - 13).setScale(S1 * 0.36).setTint(0x6a7480).setAlpha(p.parryFail * 2);
    else v.guard.setVisible(false);
    const au = p.buff.cry > 0 ? 0xff9a5a : p.buff.pd > 0 ? 0xfff0b0 : p.shield > 0 ? 0x8cc8ff : 0;
    if (au) v.aura.setVisible(true).setPosition(p.x, p.y - 12).setTint(au).setScale(S1 * (0.55 + sin(t * 8) * 0.04)).setAlpha(0.4); else v.aura.setVisible(false);
  }

  // ---------- 敵人 ----------
  mkEnemy(e: any) {
    const tx = bakeEnemy(this, e.id), sc = e.elite ? 1.22 : 1;
    const v: any = { body: img(this, tx.key, 0, tx.ox, tx.oy), sh: img(this, 'shadow').setDepth(50), sc, h: (tx.fh * tx.oy - 6) * sc, hb: null, hf: null, aura: null, warn: null };
    if (!e.boss) { v.hb = this.add.image(0, 0, 'px').setOrigin(0.5).setTint(0x0a0d10).setDepth(940).setVisible(false); v.hf = this.add.image(0, 0, 'px').setOrigin(0, 0.5).setTint(0xe0624f).setDepth(941).setVisible(false); }
    if (e.elite) v.aura = img(this, 'glow').setBlendMode(ADD).setDepth(60).setTint(e.mod === 'fire' ? 0xff7a33 : e.mod === 'swift' ? 0x9ad7a5 : 0xb0c4de);
    return v;
  }
  updEnemy(v: any, e: any) {
    const left = cos(e.a) < 0, t = this.time0; let sc = v.sc * S1, a = 1, jx = 0, sxm = 1, sym = 1;
    if (e.state === 'spawn') { const k = clamp(1 - e.t / 0.8, 0, 1); a = k; sc *= 0.55 + 0.45 * k; }
    else if (e.state === 'wind') jx = sin(t * 70) * (1 - e.t / e.tw) * 1.3;
    else if (e.state === 'act' && e.atk?.t === 'dash') { sxm = 1.18; sym = 0.86; if (rnd() < 0.6) this.fx.spawn({ key: 'smoke', x: e.x, y: e.y - 8, life: 0.3, s0: e.r / 16, s1: e.r / 30, a0: 0.3, a1: 0, tint: toInt(e.d.c2), depth: 99 + e.y }); }
    else if (e.state === 'stag') { jx = sin(t * 30) * 1.2; if (rnd() < 0.08) this.fx.spawn({ key: 'star', x: e.x + rr(-10, 10), y: e.y - v.h - 4, vy: -14, life: 0.45, s0: 0.5, s1: 0.1, tint: 0xfff0a0 }); }
    v.body.setFrame(enemyFrame(e)).setFlipX(left).setPosition(e.x + jx, e.y).setScale(sc * sxm, sc * sym).setAlpha(a).setDepth(100 + e.y);
    if (e.flash > 0) v.body.setTintFill(0xffffff); else if (e.st.chill > 0) v.body.setTint(0x9fd4ff); else if (e.st.burn > 0) v.body.setTint(0xffb890); else if (e.st.poison > 0) v.body.setTint(0xc4f0a0); else if (e.st.shock > 0) v.body.setTint(0xfff2a0); else v.body.clearTint();
    if (e.st.burn > 0 && rnd() < 0.2) this.fx.spawn({ key: 'dot', x: e.x + rr(-e.r, e.r), y: e.y - rr(4, v.h), vy: -50, life: 0.4, s0: 0.5, s1: 0, tint: 0xff8a3d });
    v.sh.setPosition(e.x, e.y + 1).setScale(S1 * e.r / 13, S1 * e.r / 13).setAlpha(a * 0.9);
    if (v.hb) { const show = e.hp < e.mhp && e.state !== 'spawn', w = e.elite ? 36 : 26, f = clamp(e.hp / e.mhp, 0, 1), y = e.y - v.h - 5;
      v.hb.setVisible(show).setPosition(e.x, y).setScale((w + 2) / 8, 5 / 8); v.hf.setVisible(show).setPosition(e.x - w / 2, y).setScale((w * f) / 8, 3 / 8).setTint(e.elite ? 0xf3b95f : 0xe0624f); }
    if (v.aura) v.aura.setPosition(e.x, e.y - 4).setScale(S1 * (0.5 + sin(t * 5) * 0.04), S1 * 0.3).setAlpha(0.55 * a);
  }
  /** 敵人出招提示：黃 = 可彈反，紅 = 只能閃避 */
  telegraphs() {
    const g = this.gfx; g.clear();
    for (const e of W.ents) {
      if (e.dead || !e.atk) continue; const a = e.atk;
      if (e.state === 'wind') {
        const k = clamp(1 - e.t / e.tw, 0, 1), fa = 0.1 + 0.22 * k;
        if (a.t === 'swing') { g.fillStyle(C_PARRY, fa); g.slice(e.x, e.y, a.reach, e.a - a.arc / 2, e.a + a.arc / 2, false); g.fillPath(); g.fillStyle(C_PARRY, 0.28); g.slice(e.x, e.y, a.reach * k, e.a - a.arc / 2, e.a + a.arc / 2, false); g.fillPath(); g.lineStyle(2, C_PARRY, 0.5 + 0.5 * k); g.slice(e.x, e.y, a.reach, e.a - a.arc / 2, e.a + a.arc / 2, false); g.strokePath(); }
        else if (a.t === 'slam') { g.fillStyle(C_DODGE, fa); g.fillCircle(e.x, e.y, a.rad); g.fillStyle(C_DODGE, 0.26); g.fillCircle(e.x, e.y, a.rad * k); g.lineStyle(2, C_DODGE, 0.5 + 0.5 * k); g.strokeCircle(e.x, e.y, a.rad); }
        else if (a.t === 'dash') { const len = a.spd * a.dur + e.r, w = e.r + 6, ca = cos(e.a), sa = sin(e.a), nx = -sa * w, ny = ca * w;
          g.fillStyle(C_PARRY, fa); g.fillPoints([{ x: e.x + nx, y: e.y + ny }, { x: e.x + ca * len + nx, y: e.y + sa * len + ny }, { x: e.x + ca * (len + 16), y: e.y + sa * (len + 16) }, { x: e.x + ca * len - nx, y: e.y + sa * len - ny }, { x: e.x - nx, y: e.y - ny }] as any, true);
          g.fillStyle(C_PARRY, 0.3); g.fillPoints([{ x: e.x + nx, y: e.y + ny }, { x: e.x + ca * len * k + nx, y: e.y + sa * len * k + ny }, { x: e.x + ca * len * k - nx, y: e.y + sa * len * k - ny }, { x: e.x - nx, y: e.y - ny }] as any, true); }
        else if (a.t === 'beam') { g.lineStyle(2 + k * 3, C_DODGE, 0.3 + 0.6 * k); g.lineBetween(e.x, e.y - e.r * 0.6, e.x + cos(e.a) * 900, e.y - e.r * 0.6 + sin(e.a) * 900); }
        else { g.lineStyle(2.5, toInt(e.d.c2), 0.35 + 0.65 * k); g.strokeCircle(e.x, e.y - e.r * 0.8, e.r * (2.1 - 1.1 * k)); }
      } else if (e.state === 'act' && a.t === 'beam') { const w = (a.w || 18) * (0.7 + 0.3 * sin(this.time0 * 50)); g.lineStyle(w, toInt(e.d.c2), 0.85); g.lineBetween(e.x, e.y - e.r * 0.6, e.x + cos(e.a) * 900, e.y - e.r * 0.6 + sin(e.a) * 900); g.lineStyle(w * 0.4, 0xffffff, 0.9); g.lineBetween(e.x, e.y - e.r * 0.6, e.x + cos(e.a) * 900, e.y - e.r * 0.6 + sin(e.a) * 900); }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) { const b = this.bolts[i]; b.t -= 1 / 60; if (b.t <= 0) { this.bolts.splice(i, 1); continue; }
      g.lineStyle(3, 0xffe66b, b.t * 8); g.beginPath(); g.moveTo(b.x1, b.y1); const n = 5; for (let j = 1; j < n; j++) g.lineTo(lerp(b.x1, b.x2, j / n) + rr(-9, 9), lerp(b.y1, b.y2, j / n) + rr(-9, 9)); g.lineTo(b.x2, b.y2); g.strokePath(); }
    // 互動提示光圈
    const n = W.near; if (n && !W.paused) { g.lineStyle(2, 0xf3b95f, 0.5 + 0.3 * sin(this.time0 * 6)); g.strokeEllipse(n.x, n.y + 4, 46, 20); }
  }

  // ---------- 其他物件 ----------
  mkShot(s: any) { const arrow = s.kind === 'arrow'; const v: any = { im: img(this, arrow ? 'arrow' : 'orb', 0, arrow ? 26 / 36 : 0.5, 0.5).setDepth(arrow ? 800 : 915), sh: img(this, 'shadow').setDepth(51).setAlpha(0.5).setScale(S1 * 0.3) }; if (!arrow) v.im.setBlendMode(ADD); return v; }
  updShot(v: any, s: any) {
    const arrow = s.kind === 'arrow', c = toInt(s.col), y = s.y - 13;
    v.im.setPosition(s.x, y).setRotation(s.a).setScale(arrow ? S1 * (s.heavy ? 1.5 : 1.15) : S1 * (s.r / 7)).setTint(arrow ? 0xffffff : c).setDepth(arrow ? 100 + s.y : 915);
    v.sh.setPosition(s.x, s.y + 2);
    if (rnd() < 0.7) this.fx.spawn({ key: 'dot', x: s.x + rr(-2, 2), y: y + rr(-2, 2), life: 0.22, s0: arrow ? 0.35 : s.r / 9, s1: 0, a0: 0.7, tint: c });
  }
  mkHaz(h: any) { return h.k === 'blast' ? { ring: img(this, 'ring').setDepth(907).setBlendMode(ADD), fill: img(this, 'disc').setDepth(906).setBlendMode(ADD) } : { fill: img(this, 'disc').setDepth(6), b: 0 }; }
  updHaz(v: any, h: any) {
    if (h.k === 'blast') { const k = clamp(1 - h.t / h.t0, 0, 1), c = h.from === 'e' ? C_DODGE : 0xf1ead8;
      v.ring.setPosition(h.x, h.y).setScale(S1 * h.r / 54).setTint(c).setAlpha(0.45 + 0.5 * k); v.fill.setPosition(h.x, h.y).setScale(S1 * (h.r / 62) * k).setTint(c).setAlpha(0.25 + 0.2 * k); }
    else { const c = h.eff === 'poison' ? 0x8fd85a : 0xff7a33, fade = min(1, h.t / 0.6); v.fill.setPosition(h.x, h.y).setScale(S1 * h.r / 60).setTint(c).setAlpha(0.42 * fade);
      if (rnd() < 0.12) this.fx.spawn({ key: 'dot', x: h.x + rr(-h.r, h.r) * 0.7, y: h.y + rr(-h.r, h.r) * 0.7, vy: -26, life: 0.6, s0: 0.5, s1: 0.1, a0: 0.8, tint: c }); }
  }
  mkPick(k: any) { return { im: img(this, k.kind === 'gold' ? 'coin' : 'heart'), sh: img(this, 'shadow').setDepth(51).setScale(S1 * 0.3), gl: img(this, 'glow').setBlendMode(ADD).setDepth(909).setTint(k.kind === 'gold' ? 0xf3c95f : 0xff7a70).setScale(S1 * 0.16).setAlpha(0.5) }; }
  updPick(v: any, k: any) { const b = abs(sin(k.t * 5 + k.uid)) * 5 + 4; v.im.setPosition(k.x, k.y - b).setDepth(100 + k.y).setScale(S1 * (k.kind === 'gold' ? 1 + min(0.6, (k.v || 1) / 14) : 1.05)); v.sh.setPosition(k.x, k.y + 1); v.gl.setPosition(k.x, k.y - b); }
  mkObj(o: any) {
    const v: any = { k: o.k };
    if (o.k === 'chest') { v.im = img(this, 'chest', o.used ? 1 : 0, 0.5, 42 / 52); v.gl = img(this, 'glow').setBlendMode(ADD).setDepth(909).setTint(0xf3c95f).setScale(S1 * 0.5); }
    else if (o.k === 'fire') { v.im = img(this, 'firepit', 0, 0.5, 30 / 44); v.f1 = img(this, 'flame', 0, 0.5, 44 / 48).setBlendMode(ADD); v.f2 = img(this, 'flame', 0, 0.5, 44 / 48).setBlendMode(ADD); v.gl = img(this, 'glow').setBlendMode(ADD).setDepth(909).setTint(0xff9a3d).setScale(S1 * 0.9); }
    else if (o.k === 'stairs') { v.im = img(this, 'stairs', 0, 0.5, 40 / 64).setDepth(7); v.gl = img(this, 'glow').setBlendMode(ADD).setDepth(909).setTint(toInt(W.room.biome.pal.acc)).setScale(S1 * 0.8, S1 * 0.45).setAlpha(0.4); }
    else if (o.k === 'item') { const it = o.it; v.itk = '';
      v.im = img(this, 'ico_relic'); v.sh = img(this, 'shadow').setDepth(51).setScale(S1 * 0.55); v.gl = img(this, 'glow').setBlendMode(ADD).setDepth(909).setScale(S1 * 0.42); v.beam = img(this, 'glow').setBlendMode(ADD).setDepth(908).setScale(S1 * 0.12, S1 * 1.1).setAlpha(0.5); }
    return v;
  }
  updObj(v: any, o: any) {
    const t = this.time0, d = 100 + o.y;
    if (o.k === 'chest') { v.im.setFrame(o.used ? 1 : 0).setPosition(o.x, o.y).setDepth(d); v.gl.setPosition(o.x, o.y - 14).setAlpha(o.used ? 0.12 : 0.3 + sin(t * 3) * 0.08); if (!o.used && rnd() < 0.05) this.fx.spawn({ key: 'star', x: o.x + rr(-16, 16), y: o.y - rr(6, 30), vy: -12, life: 0.6, s0: 0.35, s1: 0, tint: 0xffe9a8 }); }
    else if (o.k === 'fire') { const k = o.used ? 0.62 : 1; v.im.setPosition(o.x, o.y).setDepth(d); const f = sin(t * 17) * 0.08 + sin(t * 29) * 0.05;
      v.f1.setPosition(o.x - 2, o.y - 3).setScale(S1 * (1.25 + f) * k, S1 * (1.35 + f * 2) * k).setDepth(d + 1); v.f2.setPosition(o.x + 4, o.y - 2).setScale(-S1 * (0.9 - f) * k, S1 * (1 - f * 2) * k).setDepth(d + 1).setAlpha(0.8);
      v.gl.setPosition(o.x, o.y - 14).setAlpha((0.42 + f) * k); if (rnd() < 0.3) this.fx.spawn({ key: 'dot', x: o.x + rr(-8, 8), y: o.y - rr(8, 20), vx: rr(-12, 12), vy: rr(-70, -30), life: rr(0.5, 1), s0: 0.4, s1: 0, tint: 0xffb347 }); }
    else if (o.k === 'stairs') { v.im.setPosition(o.x, o.y); v.gl.setPosition(o.x, o.y).setAlpha(0.3 + sin(t * 2.5) * 0.1); if (rnd() < 0.2) this.fx.spawn({ key: 'dot', x: o.x + rr(-30, 30), y: o.y + rr(-10, 10), vy: rr(-50, -20), life: 0.9, s0: 0.45, s1: 0, tint: toInt(W.room.biome.pal.acc) }); }
    else if (o.k === 'item') { const it = o.it, key = it.kind + it.id; const col = it.kind === 'rune' ? toInt(RUNE[it.id].col) : it.kind === 'relic' ? 0xf3c95f : toInt(EL[WPN[it.id].el] || '#dfe8f2');
      if (v.itk !== key) { v.itk = key; if (it.kind === 'wpn') v.im.setTexture('w_' + it.id, 0).setOrigin(0.45, 0.5).setRotation(-0.8).clearTint(); else if (it.kind === 'rune') v.im.setTexture('ico_rune', 0).setOrigin(0.5).setRotation(0).setTint(col); else v.im.setTexture('ico_relic', 0).setOrigin(0.5).setRotation(0).clearTint(); v.gl.setTint(col); v.beam.setTint(col); }
      const b = sin(t * 2.6 + o.uid) * 3; v.im.setPosition(o.x, o.y - 18 + b).setDepth(d + 30); v.sh.setPosition(o.x, o.y + 2); v.gl.setPosition(o.x, o.y - 18 + b).setAlpha(0.42 + sin(t * 4) * 0.08); v.beam.setPosition(o.x, o.y - 50); }
  }
  sync<V>(list: any[], map: Map<number, V>, make: (o: any) => V, upd: (v: V, o: any) => void) {
    const seen = new Set<number>();
    for (const o of list) { if (o.dead) continue; seen.add(o.uid); let v = map.get(o.uid); if (!v) { v = make.call(this, o); map.set(o.uid, v!); } upd.call(this, v!, o); }
    for (const [id, v] of map) if (!seen.has(id)) { this.kill(v); map.delete(id); }
  }

  // ---------- 事件 → 特效 ----------
  flash(x: number, y: number, r: number, col: string | number, a = 1, t = 0.25) { this.flashes.push({ x, y, r, c: typeof col === 'number' ? col : toInt(col), a, t, t0: t }); }
  ringFx(x: number, y: number, r: number, tint: number, life = 0.35, depth = 925) { this.fx.spawn({ key: 'ring', x, y, life, s0: r / 54 * 0.25, s1: r / 54, a0: 0.9, a1: 0, tint, depth }); }
  handleEvents() {
    const fx = this.fx, evs = W.ev.splice(0);
    for (const e of evs) switch (e.k) {
      case 'snd': Snd.play(e.n); break;
      case 'room': this.buildRoom(); break;
      case 'dmg': if (e.heal) fx.num(e.x, e.y, '+' + e.v, 0x9ae6a8, 0.9); else if (e.hurt) fx.num(e.x, e.y, '-' + e.v, 0xff6a5e, e.small ? 0.7 : 1.15); else fx.num(e.x, e.y, e.v + (e.crit ? '!' : ''), e.blocked ? 0x8a94a0 : e.crit ? 0xffd27a : e.small ? toInt(e.col || '#f1ead8') : 0xffffff, e.crit ? 1.25 : e.small ? 0.65 : 0.9); break;
      case 'hitfx': { const c = toInt(e.col || '#fff'); fx.burst(e.x, e.y, e.crit ? 9 : 5, { key: 'spark', ang: e.a, spread: 0.9, spd: [120, 380], life: 0.22, s0: e.crit ? 1.1 : 0.8, s1: 0.2, tint: e.blocked ? 0xb0b8c0 : c, drag: 5 });
        fx.spawn({ key: 'star', x: e.x, y: e.y, life: 0.14, s0: e.crit ? 2.2 : 1.3, s1: 0.4, tint: 0xffffff, rot: rr(0, TAU) }); this.flash(e.x, e.y, e.crit ? 90 : 55, c, 0.7, 0.12); this.shake = max(this.shake, e.crit ? 5 : 2.2); break; }
      case 'swing': case 'eswing': { const pl = e.k === 'swing', thr = e.kind === 'spear'; const rng = pl ? e.rng : e.r, c = toInt(e.col || '#fff');
        const im = img(this, thr ? 'thrust' : 'slash', 0, thr ? 10 / 160 : 14 / 128, 0.5).setBlendMode(ADD).setDepth(920).setTint(c).setPosition(e.x, e.y - (pl ? 12 : 8)).setRotation(e.a);
        const sc = thr ? rng / 150 : rng / 100, ys = thr ? (e.heavy ? 1.5 : 1) : sc * (e.arc ? clamp(e.arc / 2.1, 0.5, 1.4) : 1) * (e.side === -1 ? -1 : 1);
        im.setScale(S1 * sc * 0.75, S1 * ys).setAlpha(pl ? 0.95 : 0.7);
        this.tweens.add({ targets: im, alpha: 0, scaleX: S1 * sc * 1.06, duration: e.heavy ? 240 : 170, ease: 'Quad.out', onComplete: () => im.destroy() });
        if (e.heavy) this.shake = max(this.shake, 3); break; }
      case 'pshoot': fx.burst(e.x + cos(e.a) * 18, e.y - 13 + sin(e.a) * 12, e.heavy ? 8 : 4, { key: 'spark', ang: e.a, spread: 0.5, spd: [80, 240], life: 0.18, s0: 0.7, tint: toInt(e.col), drag: 4 }); if (this.pv) this.pv.kick = 1; break;
      case 'die': { const c = toInt(e.col), c2 = toInt(e.c2 || e.col), n = e.boss ? 60 : e.elite ? 26 : 12;
        fx.burst(e.x, e.y - e.r, n, { key: 'dot', spd: [60, e.boss ? 420 : 240], lr: [0.3, 0.7], sr: [0.5, 1.3], s1: 0, tint: c, drag: 3, add: true });
        fx.burst(e.x, e.y - e.r, Mf(n / 2), { key: 'shard', spd: [80, 260], lr: [0.4, 0.8], s0: 1.4, s1: 0.2, tint: c2, grav: 380, vr: 9, add: false, depth: 100 + e.y });
        fx.burst(e.x, e.y - e.r * 0.6, e.boss ? 14 : 4, { key: 'smoke', spd: [10, 60], lr: [0.4, 0.8], s0: e.r / 14, s1: e.r / 7, a0: 0.35, tint: c, add: true });
        this.flash(e.x, e.y, e.boss ? 320 : 110, c2, 1, 0.3); this.shake = max(this.shake, e.boss ? 16 : e.elite ? 7 : 3); break; }
      case 'boom': { const c = toInt(e.col || '#ff7a33'); if (e.arrow) { fx.burst(e.x, e.y, 5, { key: 'spark', ang: PI / 2, spread: 0.25, spd: [0, 40], life: 0.18, s0: 0.9, tint: 0xf1ead8 }); this.ringFx(e.x, e.y, e.r, 0xf1ead8, 0.2, 907); break; }
        this.ringFx(e.x, e.y, e.r * 1.15, c, 0.36, 907); fx.spawn({ key: 'disc', x: e.x, y: e.y, life: 0.22, s0: e.r / 62, s1: e.r / 62 * 1.1, a0: 0.7, a1: 0, tint: c, depth: 907 });
        fx.burst(e.x, e.y, 10, { key: 'dot', spd: [60, 260], lr: [0.3, 0.6], sr: [0.5, 1.1], s1: 0, tint: c, drag: 3 }); fx.burst(e.x, e.y, 5, { key: 'smoke', spd: [10, 50], life: 0.6, s0: e.r / 40, s1: e.r / 22, a0: 0.3, tint: c });
        this.flash(e.x, e.y, e.r * 2.4, c, 1, 0.3); this.shake = max(this.shake, min(12, e.r / 12)); break; }
      case 'dodge': fx.burst(e.x, e.y - 2, 5, { key: 'smoke', ang: e.a + PI, spread: 0.7, spd: [20, 90], life: 0.35, s0: 0.35, s1: 0.7, a0: 0.3, tint: 0xc8d4dc, add: false, depth: 60 }); break;
      case 'pdodge': this.ringFx(e.x, e.y - 12, 120, 0xbfe8ff, 0.5); fx.spawn({ key: 'star', x: e.x, y: e.y - 14, life: 0.3, s0: 3, s1: 0.5, tint: 0xffffff }); this.flash(e.x, e.y, 200, 0xbfe8ff, 0.9, 0.4); Bus.emit('slowmo'); break;
      case 'parry': this.ringFx(e.x, e.y - 12, 90, 0xffe9a8, 0.3); fx.spawn({ key: 'star', x: e.x + cos(e.a) * 16, y: e.y - 13 + sin(e.a) * 12, life: 0.22, s0: 3.4, s1: 0.6, tint: 0xffffff });
        fx.burst(e.x + cos(e.a) * 16, e.y - 13 + sin(e.a) * 12, 14, { key: 'spark', spd: [160, 460], life: 0.26, s0: 1, s1: 0.2, tint: 0xffe9a8, drag: 4 }); this.flash(e.x, e.y, 180, 0xffe9a8, 1, 0.25); this.shake = max(this.shake, 6); Bus.emit('toast', '彈反！', 'good'); break;
      case 'phit': this.shake = max(this.shake, 9); fx.burst(e.x, e.y - 12, 10, { key: 'dot', spd: [80, 260], life: 0.4, s0: 0.8, s1: 0, tint: 0xff5a4e, drag: 3 }); Bus.emit('hurt'); break;
      case 'pdeath': fx.burst(e.x, e.y - 12, 40, { key: 'dot', spd: [40, 320], lr: [0.5, 1.2], sr: [0.5, 1.4], s1: 0, tint: 0xffd9a0, drag: 2 }); this.shake = 14; Bus.emit('hurt'); break;
      case 'revive': this.ringFx(e.x, e.y - 12, 200, 0xffb347, 0.7); fx.burst(e.x, e.y - 12, 40, { key: 'dot', spd: [60, 340], life: 0.9, s0: 1, s1: 0, tint: 0xffb347, grav: -200 }); Bus.emit('toast', '鳳凰羽化為灰燼', 'good'); break;
      case 'spawn': this.ringFx(e.e.x, e.e.y, 34 + e.e.r, toInt(e.e.d.c2), 0.5, 907); fx.burst(e.e.x, e.e.y, 6, { key: 'dot', spd: [10, 60], life: 0.6, s0: 0.6, s1: 0, tint: toInt(e.e.d.c2), grav: -160 }); break;
      case 'healfx': fx.burst(e.x, e.y - 8, 12, { key: 'dot', ang: -PI / 2, spread: 0.7, spd: [30, 110], life: 0.7, s0: 0.7, s1: 0, tint: 0x9ae6a8 }); this.flash(e.x, e.y, 120, 0x9ae6a8, 0.6, 0.4); break;
      case 'blink': fx.burst(e.x, e.y - 12, 8, { key: 'smoke', spd: [10, 70], life: 0.4, s0: 0.5, s1: 0.9, a0: 0.4, tint: 0xc9a0ff }); this.ringFx(e.x, e.y - 12, 50, 0xc9a0ff, 0.25); break;
      case 'bolt': this.bolts.push({ ...e, t: 0.14 }); this.flash(e.x2, e.y2, 80, 0xffe66b, 0.8, 0.14); break;
      case 'shotdie': fx.burst(e.x, e.y - 13, 5, { key: 'dot', spd: [30, 140], life: 0.25, s0: 0.6, s1: 0, tint: toInt(e.col) }); break;
      case 'chest': fx.burst(e.x, e.y - 20, 22, { key: 'star', ang: -PI / 2, spread: 1.1, spd: [60, 260], life: 0.7, s0: 0.6, s1: 0, tint: 0xffe9a8, grav: 240 }); this.flash(e.x, e.y, 200, 0xf3c95f, 1, 0.5); break;
      case 'gold': fx.num(e.x, e.y - 30, '+' + e.v, 0xf3c95f, 0.6); break;
      case 'stag': fx.burst(e.e.x, e.e.y - e.e.r * 2, 6, { key: 'star', spd: [30, 120], life: 0.5, s0: 0.8, s1: 0, tint: 0xfff0a0 }); break;
      case 'gbreak': fx.burst(e.x, e.y - 14, 12, { key: 'shard', spd: [100, 300], life: 0.5, s0: 1.6, s1: 0.2, tint: 0xd8b673, grav: 400, vr: 10, add: false }); Bus.emit('toast', '破盾！', 'good'); break;
      case 'bonk': fx.burst(e.x, e.y - 10, 8, { key: 'star', spd: [40, 160], life: 0.4, s0: 0.7, s1: 0, tint: 0xfff0a0 }); this.shake = max(this.shake, 4); break;
      case 'charged': if (this.pv) this.ringFx(W.p.x, W.p.y - 13, e.full ? 46 : 30, e.full ? 0xffffff : 0xffd27a, 0.25); break;
      case 'skill': this.ringFx(e.x, e.y - 12, e.id === 'knight1' ? 190 : 46, toInt(LOOK[W.run!.cls].eye), 0.4); if (e.id === 'rogue1') fx.burst(e.x, e.y - 10, 16, { key: 'smoke', spd: [20, 110], life: 0.9, s0: 0.8, s1: 1.6, a0: 0.5, tint: 0x8a80a8, add: false, depth: 930 }); break;
      case 'phase': this.ringFx(e.e.x, e.e.y - 30, 300, toInt(e.e.d.c2), 0.7); this.shake = 14; this.flash(e.e.x, e.e.y, 360, toInt(e.e.d.c2), 1, 0.6); Bus.emit('toast', e.e.phase === 2 ? '牠被逼到絕境了' : '牠憤怒了', 'bad'); break;
      case 'clear': for (const d of this.doors) fx.burst(d.x, d.y, 10, { key: 'dot', spd: [30, 150], life: 0.5, s0: 0.7, s1: 0, tint: toInt(W.room.biome.pal.acc) }); Bus.emit('clear'); break;
      case 'warn': fx.num(e.e.x, e.e.y - e.e.r * 2 - 20, '!', e.e.atk.t === 'dash' ? C_PARRY : C_DODGE, 1.5); Snd.play('warn'); break;
      case 'took': Bus.emit('took', e.it); break;
      case 'ui': Bus.emit('panel', e); break;
      case 'boss': Bus.emit('boss', e.e); break;
      case 'bossdie': Bus.emit('bossdie', e); break;
      case 'over': Bus.emit('over', e); break;
      case 'floor': Bus.emit('floor'); break;
      case 'exhaust': Bus.emit('exhaust'); break;
      case 'stairs': Bus.emit('toast', '通往下一層的階梯出現了', 'good'); break;
    }
  }

  // ---------- 鏡頭與光照 ----------
  clampCam() {
    const c = this.cam, VW = this.VW;
    c.x = VW >= RPW + 40 ? (RPW - VW) / 2 : clamp(c.x, -20, RPW - VW + 20);
    c.y = clamp(c.y, -WH - 16, RPH - VH + 14);
  }
  camera(dt: number) {
    const p = W.p, c = this.cam, look = Input.touch ? 0 : 26;
    const tx = p.x + cos(p.aim) * look - this.VW / 2, ty = p.y - 12 + sin(p.aim) * look * 0.6 - VH / 2, k = 1 - Math.pow(0.0015, dt);
    c.x = lerp(c.x, tx, k); c.y = lerp(c.y, ty, k); this.clampCam();
    this.shake = max(0, this.shake - dt * 28); const sk = Saves.settings.shake ? this.shake : 0;
    this.cameras.main.centerOn(c.x + this.VW / 2 + rr(-sk, sk), c.y + VH / 2 + rr(-sk, sk));
  }
  light() {
    const rt = this.rt; if (!rt) return; const P = W.room.biome.pal, t = this.time0, p = W.p;
    const amb = W.slow > 0 ? [P.amb[0] * 0.8, P.amb[1] * 0.9, P.amb[2] * 1.25] : P.amb;
    // 先鋪一層不透明的環境色，再用「濾色」疊上各個光源（不受目標 alpha 影響，不會出現方塊痕跡）
    rt.clear(); rt.beginDraw();
    rt.stamp('px', 0, rt.width / 2, rt.height / 2, { scaleX: rt.width / (4 * BS) + 1, scaleY: rt.height / (4 * BS) + 1, tint: (amb[0] << 16) | (amb[1] << 8) | (amb[2] | 0), blendMode: Phaser.BlendModes.NORMAL, skipBatch: true } as any);
    // 強度直接乘進顏色（相加混合下最穩定，不依賴 alpha 的處理方式）
    const st = (x: number, y: number, r: number, c: number, a: number) => { const k = a > 1 ? 1 : a < 0 ? 0 : a, tint = (((c >> 16 & 255) * k) << 16) | (((c >> 8 & 255) * k) << 8) | ((c & 255) * k);
      rt.stamp('glow', 0, (x + LM) * LS, (y + WH + LM) * LS, { scale: (r * 2 * LS) / (128 * BS), tint, blendMode: Phaser.BlendModes.SCREEN, skipBatch: true } as any); };
    st(p.x, p.y - 12, 250 + sin(t * 7) * 4, toInt(P.lamp), 1); st(p.x, p.y - 12, 120, toInt(P.lamp), 0.5);
    for (const l of this.art.lights) st(l.x, l.y, l.r * (1 + sin(t * 2 + l.x) * 0.05), toInt(l.col), l.a);
    for (const o of W.objs) { if (o.k === 'fire') st(o.x, o.y - 12, (o.used ? 200 : 300) + sin(t * 17) * 12, 0xffa850, 1); else if (o.k === 'chest') st(o.x, o.y - 10, 120, 0xf3c95f, o.used ? 0.3 : 0.8); else if (o.k === 'stairs') st(o.x, o.y, 170, toInt(P.acc), 0.9); else if (o.k === 'item') st(o.x, o.y - 14, 100, 0xfff0d0, 0.8); }
    for (const s of W.shots) st(s.x, s.y - 13, s.r * 11, toInt(s.col), 0.75);
    for (const e of W.ents) { if (e.boss) st(e.x, e.y - 40, 260, toInt(e.d.c2), 0.75); else st(e.x, e.y - e.r, e.elite ? 130 : 84, toInt(e.d.c2), e.elite ? 0.6 : 0.42); if (e.state === 'wind') st(e.x, e.y - e.r, 90, e.atk.t === 'swing' || e.atk.t === 'dash' ? C_PARRY : C_DODGE, 0.55 * (1 - e.t / e.tw)); }
    for (const h of W.haz) st(h.x, h.y, h.r * 2, h.k === 'blast' ? C_DODGE : h.eff === 'poison' ? 0x8fd85a : 0xff7a33, h.k === 'blast' ? 0.5 : 0.35);
    for (const k of W.picks) st(k.x, k.y - 6, 44, k.kind === 'gold' ? 0xf3c95f : 0xff7a70, 0.6);
    for (const d of this.doors) st(d.x, d.y, 100, toInt(P.acc), 0.25 + d.a * 0.5);
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t -= 1 / 60; if (f.t <= 0) { this.flashes.splice(i, 1); continue; } st(f.x, f.y, f.r, f.c, f.a * (f.t / f.t0)); }
    rt.endDraw();
  }
  ambient(dt: number) {
    const P = W.room.biome.pal, t = this.time0, c = toInt(P.acc);
    this.fog.forEach((f, i) => f.setTint(c).setPosition(RPW / 2 + sin(t * 0.07 + i * 2.1) * 420, RPH / 2 + cos(t * 0.05 + i * 1.3) * 190));
    if (Saves.settings.quality === 'low') return;
    this.ambT -= dt; if (this.ambT <= 0) { this.ambT = 0.09; const x = this.cam.x + rr(0, this.VW), y = this.cam.y + rr(0, VH);
      this.fx.spawn({ key: 'dot', x, y, vx: rr(-8, 8), vy: rr(-16, -4), life: rr(2.5, 5), s0: rr(0.14, 0.34), s1: 0.1, a0: 0.0, a1: 0.0, tint: rnd() < 0.7 ? c : toInt(P.acc2), depth: 907 });
      const pt = this.fx.live[this.fx.live.length - 1]; if (pt) { pt.a0 = 0.75; pt.a1 = 0; } }
  }

  update(_time: number, delta: number) {
    if (!W.run || !W.room) return;
    const dt = min(delta / 1000, 1 / 30); this.time0 += dt;
    Bus.emit('frame', dt);
    const turbo = (window as any).__turbo || 1; // 自動化測試加速用
    for (let i = 0; i < turbo; i++) { step(dt, () => { W.in = Input.build(W.p); }); this.handleEvents(); }
    this.updPlayer(dt);
    this.sync(W.ents, this.ents, this.mkEnemy, this.updEnemy); this.sync(W.shots, this.shots, this.mkShot, this.updShot); this.sync(W.haz, this.hazs, this.mkHaz, this.updHaz);
    this.sync(W.picks, this.picks, this.mkPick, this.updPick); this.sync(W.objs, this.objs, this.mkObj, this.updObj);
    for (const d of this.doors) { d.a = lerp(d.a, W.room.locked ? 1 : 0, min(1, dt * 6)); const f = 0.75 + sin(this.time0 * 9 + d.x) * 0.25; d.im.setAlpha(d.a * f).setVisible(d.a > 0.02); d.gl.setAlpha(0.12 + d.a * 0.3 * f); }
    this.telegraphs(); this.fx.update(dt); this.ambient(dt); this.camera(dt); this.light();
    Bus.emit('hud', dt);
  }
}
