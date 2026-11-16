// 角色與物件：每幀只讀 W（模擬世界），不寫回。
import * as THREE from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { W } from '../sim/state';
import { T } from '../sim/util';
import { EN } from '../sim/data';
import { mats, makeChest, GEO } from './room';
import type { Kay } from './kaykit';
import { PLAYER, ENEMIES, ENEMY_DEFAULT, type CharSpec, type AnimMap } from './manifest';

const v3 = new THREE.Vector3();
const std = (c: string, o: any = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });

// ---------- 玩家 ----------
export interface PlayerView { obj: THREE.Object3D; lantern: THREE.Object3D; update(t: number, dt: number, evs: any[]): void; dispose(): void; }

function procPlayer(): PlayerView {
  const m = mats(W.room.biome.pal), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10, 1, true).translate(0, 0.4, 0), std('#2d3440', { side: THREE.DoubleSide, roughness: 0.9 }));
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.5, 8).translate(0, 0.55, 0), std('#594636'));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), std('#e3c9a8', { roughness: 0.6 })); head.position.y = 0.92;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), std('#3a4352', { roughness: 0.95, side: THREE.DoubleSide })); hood.position.y = 0.94; hood.rotation.x = -0.25;
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.3, 5).translate(0, 0.65, 0), m.wood); staff.position.set(0.24, 0, 0.05); staff.rotation.z = -0.12;
  const lantern = new THREE.Group(); lantern.position.set(0.38, 1.18, 0.05);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 6, 1, true), m.darkMetal);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.4), toneMapped: false }));
  lantern.add(cage, glow);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55).translate(0, 0, 0.3), m.metal); blade.position.set(-0.22, 0.55, 0.05);
  for (const o of [cloak, torso, head, hood, staff, cage, blade]) { o.castShadow = true; body.add(o); }
  body.add(lantern);
  const shadow = new THREE.Mesh(GEO.disc, m.shadow); shadow.position.y = 0.02; shadow.scale.setScalar(0.9); root.add(shadow); root.userData.blob = shadow;
  let swingT = 0;
  return {
    obj: root, lantern,
    update(t, dt, evs) {
      const p = W.p; root.position.set(p.x / T, 0, p.y / T);
      root.rotation.y = Math.PI / 2 - p.aim;
      const mv = Math.hypot(p.vx || 0, p.vy || 0) > 5;
      body.position.y = mv ? Math.abs(Math.sin(t * 12)) * 0.06 : Math.sin(t * 2) * 0.01;
      body.rotation.x = mv ? 0.12 : 0;
      if (p.dodgeT > 0) { body.rotation.x = 0.5; body.scale.set(1.05, 0.8, 1.05); } else body.scale.set(1, 1, 1);
      for (const e of evs) if (e.k === 'hitfx' || e.k === 'pshoot') swingT = 0.18;
      swingT = Math.max(0, swingT - dt); blade.rotation.y = swingT > 0 ? -1.4 + (0.18 - swingT) / 0.18 * 2.8 : -0.3;
      lantern.rotation.z = Math.sin(t * 3) * 0.15 + (mv ? Math.sin(t * 12) * 0.1 : 0);
      root.visible = !p.dead || Math.sin(t * 20) > 0;
    },
    dispose() {},
  };
}

// ---------- 骨架角色（玩家與敵人共用）：清單 → 模型、道具、動畫 ----------
interface Rig { model: THREE.Object3D; once(role: keyof AnimMap, speed?: number): void; base(role: keyof AnimMap): void; stopAll(except?: keyof AnimMap): void; update(dt: number): void; bone(re: RegExp | string): THREE.Object3D | null; }
function makeRig(kay: Kay, spec: CharSpec, scale: number): Rig {
  const src = kay.gltf(spec.file), model = SkeletonUtils.clone(src.scene); model.scale.setScalar(scale);
  const keep = new Set(spec.keep || []);
  if (spec.hide) model.traverse((o: any) => { if ((o.isMesh || o.isSkinnedMesh) && spec.hide!.test(o.name) && !keep.has(o.name)) o.visible = false; });
  const bone = (re: RegExp | string) => { let b: THREE.Object3D | null = null; model.traverse((o) => { if (!b && (typeof re === 'string' ? o.name === re : re.test(o.name))) b = o; }); return b as THREE.Object3D | null; };
  for (const [slot, f] of Object.entries(spec.attach || {})) if (kay.has(f)) bone(slot)?.add(kay.clone(f));
  const mixer = new THREE.AnimationMixer(model), A: Partial<Record<keyof AnimMap, THREE.AnimationAction>> = {};
  for (const [role, name] of Object.entries(spec.anim) as [keyof AnimMap, string][]) { const c = name && THREE.AnimationClip.findByName(src.animations, name); if (c) A[role] = mixer.clipAction(c); }
  for (const r of ['attack', 'hit', 'die', 'spawn', 'dodge', 'cast'] as (keyof AnimMap)[]) { const a = A[r]; if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = r === 'die'; } }
  mixer.addEventListener('finished', (e: any) => { if (e.action !== A.die) e.action.fadeOut(0.15); });
  let cur: keyof AnimMap | '' = '';
  return {
    model, bone,
    once(role, speed = 1) { const a = A[role]; if (!a) return; a.reset(); a.timeScale = speed; a.setEffectiveWeight(1); a.fadeIn(0.06).play(); },
    base(role) { if (role === cur || !A[role]) return; if (cur) A[cur]?.fadeOut(0.18); A[role]!.reset().fadeIn(0.18).play(); cur = role; },
    stopAll(except) { for (const k in A) if (k !== except) A[k as keyof AnimMap]!.fadeOut(0.1); },
    update(dt) { mixer.update(dt); },
  };
}

function kayPlayer(kay: Kay): PlayerView {
  const m = mats(W.room.biome.pal), root = new THREE.Group(), rig = makeRig(kay, PLAYER, PLAYER.scale); root.add(rig.model);
  rig.base('idle');
  // 提燈掛在手上（找不到骨頭就掛在身旁）
  const lantern = new THREE.Group();
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 6, 1, true), m.darkMetal);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.4), toneMapped: false }));
  lantern.add(cage, glow);
  const hand = PLAYER.lanternBone ? rig.bone(PLAYER.lanternBone) : null;
  if (hand) { hand.add(lantern); lantern.scale.setScalar(1 / PLAYER.scale); lantern.position.set(0, -0.35, 0); }
  else { lantern.position.set(-0.35, 0.75, 0.1); root.add(lantern); }
  const shadow = new THREE.Mesh(GEO.disc, m.shadow); shadow.position.y = 0.02; shadow.scale.setScalar(0.9); root.add(shadow); root.userData.blob = shadow;
  let dead = false;
  return {
    obj: root, lantern,
    update(t, dt, evs) {
      const p = W.p; root.position.set(p.x / T, 0, p.y / T); root.rotation.y = Math.PI / 2 - p.aim;
      rig.base(Math.hypot(p.vx || 0, p.vy || 0) > 5 ? 'move' : 'idle');
      for (const e of evs) {
        if (e.k === 'hitfx' || e.k === 'pshoot') rig.once('attack', 1.8);
        else if (e.k === 'dodge' || e.k === 'pdodge') rig.once('dodge', 1.6);
        else if (e.k === 'phit') rig.once('hit', 1.4);
        else if (e.k === 'pdeath') { rig.stopAll('die'); rig.once('die'); dead = true; }
      }
      if (dead && !p.dead) { dead = false; rig.stopAll(); rig.base('idle'); }
      rig.update(dt);
    },
    dispose() {},
  };
}
export const makePlayer = (kay: Kay | null) => (kay ? kayPlayer(kay) : procPlayer());

// ---------- 敵人（兩條路線共用程序化造型） ----------
const EM: Record<string, THREE.MeshStandardMaterial> = {};
const emat = (key: string, c: string, o: any = {}) => EM[key] || (EM[key] = std(c, o));
function enemyMesh(e: any): THREE.Group {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.userData.body = body;
  const d = e.d, s = e.r / T * 2.2, col = d.col, c2 = d.c2, mats0: THREE.MeshStandardMaterial[] = [];
  const mk = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, z); mm.castShadow = true; body.add(mm); return mm; };
  const own = (c: string, o: any = {}) => { const m = std(c, o); mats0.push(m); return m; };
  const glow = emat('glow' + c2, '#111', { emissive: c2, emissiveIntensity: 3 });
  switch (d.look) {
    case 'blob': {
      mk(new THREE.SphereGeometry(0.5, 16, 10), own(col, { roughness: 0.25, transparent: true, opacity: 0.85, emissive: col, emissiveIntensity: 0.25 }), 0, 0.42, 0).scale.set(1, 0.8, 1);
      mk(new THREE.SphereGeometry(0.18, 8, 6), glow, 0, 0.45, 0);
      for (const x of [-0.15, 0.15]) mk(new THREE.SphereGeometry(0.06, 6, 4), emat('eye', '#111', { emissive: '#fff', emissiveIntensity: 2 }), x, 0.55, 0.38);
      break;
    }
    case 'beast': {
      mk(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8).rotateX(Math.PI / 2), own(col, { roughness: 0.9 }), 0, 0.38, 0);
      mk(new THREE.SphereGeometry(0.2, 10, 8), own(col, { roughness: 0.9 }), 0, 0.48, 0.45);
      for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(0.06, 0.04, 0.3), glow, 0, 0.6, -0.25 + i * 0.16);
      for (const [x, z] of [[-0.14, 0.25], [0.14, 0.25], [-0.14, -0.25], [0.14, -0.25]]) mk(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 5), emat('dk' + col, '#3a342c'), x, 0.15, z);
      break;
    }
    case 'plant': {
      mk(new THREE.CylinderGeometry(0.12, 0.2, 0.6, 8), own('#d9c9a8'), 0, 0.3, 0);
      mk(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), own(col, { emissive: c2, emissiveIntensity: 0.15 }), 0, 0.55, 0).scale.set(1, 0.7, 1);
      mk(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 8).rotateX(Math.PI / 2), glow, 0, 0.4, 0.2);
      break;
    }
    case 'knight': {
      mk(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), own(col, { roughness: 0.6 }), 0, 0.35, 0);
      mk(new THREE.SphereGeometry(0.38, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), own(c2, { emissive: '#ffb86b', emissiveIntensity: 0.2 }), 0, 0.75, 0).scale.set(1, 0.55, 1);
      mk(new THREE.BoxGeometry(0.5, 0.6, 0.08), emat('bark', '#6b4a32', { roughness: 1 }), 0, 0.4, 0.3);
      break;
    }
    default: { // matriarch
      mk(new THREE.SphereGeometry(0.5, 20, 14), own(col, { roughness: 0.4, emissive: col, emissiveIntensity: 0.2 }), 0, 0.5, 0);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const sp = mk(new THREE.ConeGeometry(0.08, 0.4, 6), glow, Math.cos(a) * 0.42, 0.62 + Math.sin(i) * 0.1, Math.sin(a) * 0.42); sp.lookAt(Math.cos(a) * 2, 1.2, Math.sin(a) * 2); sp.rotateX(Math.PI / 2); }
      mk(new THREE.SphereGeometry(0.16, 10, 8), emat('eye', '#111', { emissive: '#fff', emissiveIntensity: 2 }), 0, 0.62, 0.43);
    }
  }
  g.scale.setScalar(s); g.userData.mats = mats0;
  const sh = new THREE.Mesh(GEO.disc, mats(W.room.biome.pal).shadow); sh.position.y = 0.02 / s; sh.scale.setScalar(1.1); g.add(sh); g.userData.blob = sh;
  return g;
}

// ---------- KayKit 骷髏敵人（CC0 Skeletons 包；共用骨架動畫） ----------
function kayEnemy(kay: Kay, e: any): THREE.Group {
  const spec = ENEMIES[e.id] || ENEMIES[ENEMY_DEFAULT], g = new THREE.Group();
  const sc = spec.scale * Math.sqrt(e.r / 12), rig = makeRig(kay, spec, sc); g.add(rig.model);
  rig.base('idle'); if (e.state === 'spawn') rig.once('spawn', 1.6);
  const m = mats(W.room.biome.pal);
  const sh = new THREE.Mesh(GEO.disc, m.shadow); sh.position.y = 0.02; sh.scale.setScalar(sc * 2.2); g.add(sh); g.userData.blob = sh;
  const ring = new THREE.Mesh(RING, RING_MAT); ring.position.y = 0.035; ring.scale.setScalar(sc * 2.4); ring.visible = false; g.add(ring);
  let state = '', flash = 0;
  g.userData.kay = {
    update(t: number, dt: number, en: any) {
      if (en.state !== state) { if (en.state === 'wind') rig.once('attack', 1.1); else if (en.state === 'stag') rig.once('hit', 1.3); state = en.state; }
      if (en.flash > 0 && flash <= 0) rig.once('hit', 1.6);
      flash = en.flash;
      rig.base(en.moving ? 'move' : 'idle');
      ring.visible = en.state === 'wind'; if (ring.visible) ring.scale.setScalar(sc * 2.4 * (1 + Math.sin(t * 25) * 0.08));
      rig.model.scale.setScalar(sc * (en.flash > 0 ? 1.06 : 1));
      rig.update(dt);
    },
    die() { ring.visible = false; rig.stopAll('die'); rig.once('die', 1.2); },
    tick(dt: number) { rig.update(dt); },
  };
  return g;
}
const RING = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2);
const RING_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.25), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });

// ---------- 世界裡其他東西（投射物、危害預警、拾取物、物件） ----------
export class Actors {
  root = new THREE.Group();
  ens = new Map<number, THREE.Group>();
  corpses: { g: THREE.Group; t: number }[] = [];
  objs = new Map<number, THREE.Object3D>();
  shots: THREE.InstancedMesh; haz: THREE.InstancedMesh; picks: THREE.InstancedMesh;
  private tmp = new THREE.Matrix4(); private c = new THREE.Color();
  constructor(public kay: Kay | null) {
    this.shots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 128);
    this.haz = new THREE.InstancedMesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }), 32);
    this.picks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12), std('#ffd36b', { metalness: 1, roughness: 0.25, emissive: '#7a5a10', emissiveIntensity: 1 }), 64);
    for (const im of [this.shots, this.haz, this.picks]) { im.count = 0; im.frustumCulled = false; this.root.add(im); }
    this.shots.setColorAt(0, this.c.set(0xffffff)); this.haz.setColorAt(0, this.c);
  }
  clear() { for (const g of this.ens.values()) this.root.remove(g); this.ens.clear(); for (const c of this.corpses) this.root.remove(c.g); this.corpses = []; for (const o of this.objs.values()) this.root.remove(o); this.objs.clear(); }
  setBlob(on: boolean) { this.root.traverse((o) => { if (o.userData.blob) o.userData.blob.visible = on; }); }
  update(t: number, dt: number, blob: boolean) {
    const seen = new Set<number>();
    for (const e of W.ents) {
      if (e.dead) continue; seen.add(e.uid);
      let g = this.ens.get(e.uid); if (!g) { g = this.kay ? kayEnemy(this.kay, e) : enemyMesh(e); this.ens.set(e.uid, g); this.root.add(g); g.userData.blob.visible = blob; }
      g.position.set(e.x / T, 0, e.y / T); g.rotation.y = Math.PI / 2 - e.a;
      if (g.userData.kay) { g.userData.kay.update(t, dt, e); continue; }
      const body = g.userData.body as THREE.Group, hop = e.d.mv === 'hop' ? Math.abs(Math.sin(t * 6 + e.uid)) : 0;
      body.position.y = hop * 0.3; body.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.08, 1 + (1 - hop) * 0.08);
      const wind = e.state === 'wind', fl = e.flash > 0;
      for (const m of g.userData.mats as THREE.MeshStandardMaterial[]) { m.emissive.set(fl ? '#ffffff' : wind ? '#ff3020' : (e.d.look === 'blob' ? e.d.col : '#000')); m.emissiveIntensity = fl ? 2.5 : wind ? 1.2 + Math.sin(t * 30) * 0.6 : 0.2; }
      if (e.state === 'spawn') g.scale.setScalar(e.r / T * 2.2 * Math.max(0.05, 1 - e.t / 0.8)); else g.scale.setScalar(e.r / T * 2.2);
    }
    for (const [uid, g] of this.ens) if (!seen.has(uid)) { this.ens.delete(uid); if (g.userData.kay) { g.userData.kay.die(); this.corpses.push({ g, t: 0 }); } else this.root.remove(g); }
    this.corpses = this.corpses.filter((c) => { c.t += dt; c.g.userData.kay.tick(dt); if (c.t > 1.6) c.g.position.y -= dt * 0.8; if (c.t > 2.4) { this.root.remove(c.g); return false; } return true; });
    // 投射物
    let n = 0; for (const s of W.shots) { if (s.dead || n >= 128) continue; const r = (s.r || 5) / T * 1.2; this.tmp.makeScale(r, r, r).setPosition(s.x / T, 0.5, s.y / T); this.shots.setMatrixAt(n, this.tmp); this.c.set(s.col || '#fff').multiplyScalar(3); this.shots.setColorAt(n++, this.c); }
    this.shots.count = n; this.shots.instanceMatrix.needsUpdate = true; if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
    n = 0; for (const h of W.haz) { if (h.dead || n >= 32) continue; const r = (h.r || 40) / T, k = h.t0 ? 1 - Math.max(0, h.t) / h.t0 : 1; this.tmp.makeScale(r, 1, r).setPosition(h.x / T, 0.04, h.y / T); this.haz.setMatrixAt(n, this.tmp); this.c.set(h.col || '#ff5040').multiplyScalar(1 + k * 2); this.haz.setColorAt(n++, this.c); }
    this.haz.count = n; this.haz.instanceMatrix.needsUpdate = true; if (this.haz.instanceColor) this.haz.instanceColor.needsUpdate = true;
    n = 0; for (const k of W.picks) { if (k.dead || n >= 64) continue; this.tmp.makeRotationY(t * 3 + k.uid).setPosition(k.x / T, 0.25 + Math.sin(t * 4 + k.uid) * 0.06, k.y / T); this.picks.setMatrixAt(n++, this.tmp); }
    this.picks.count = n; this.picks.instanceMatrix.needsUpdate = true;
    // 物件
    const so = new Set<number>();
    for (const o of W.objs) {
      if (o.dead) continue; so.add(o.uid); let m = this.objs.get(o.uid);
      if (!m) { m = this.mkObj(o); this.objs.set(o.uid, m); this.root.add(m); }
      m.position.set(o.x / T, 0, o.y / T);
      if (o.k === 'item') m.children[0].position.y = 0.4 + Math.sin(t * 3) * 0.08, m.rotation.y = t;
    }
    for (const [uid, m] of this.objs) if (!so.has(uid)) { this.root.remove(m); this.objs.delete(uid); }
  }
  /** 預先編譯用：每種敵人與物件各一個樣本（不碰 W）。 */
  samples(): THREE.Group {
    const g = new THREE.Group();
    for (const id of Object.keys(EN)) { const d = (EN as any)[id], e = { uid: 0, id, d, r: d.r, x: 0, y: 0, a: 0, state: 'move', t: 1, flash: 0 }; g.add(this.kay ? kayEnemy(this.kay, e) : enemyMesh(e)); }
    for (const k of ['chest', 'stairs', 'item', 'fire']) g.add(this.mkObj({ k }));
    return g;
  }
  private mkObj(o: any): THREE.Object3D {
    const m = mats(W.room.biome.pal);
    if (o.k === 'chest') return makeChest(this.kay, 0, 0);
    if (o.k === 'stairs') { const g = new THREE.Group(); const d = new THREE.Mesh(GEO.disc, new THREE.MeshBasicMaterial({ color: '#000' })); d.scale.setScalar(1.6); d.position.y = 0.02; const r = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.5, 2), toneMapped: false })); r.position.y = 0.03; g.add(d, r); return g; }
    if (o.k === 'item') { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: '#222', emissive: '#a0d8ff', emissiveIntensity: 3 })); g.add(c); return g; }
    if (o.k === 'fire') { const g = new THREE.Group(); const c = new THREE.Mesh(GEO.coal, m.ember); c.scale.set(2, 0.6, 2); c.position.y = 0.1; g.add(c); g.userData.campfire = true; return g; }
    return new THREE.Group();
  }
}
export { v3 };
