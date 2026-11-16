// 特效：GPU 實例化粒子（CPU 模擬）、地面出招提示、投射物、揮砍弧。
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, uv, float, vec4, color, uniform, smoothstep, mix, positionLocal, length, select } from 'three/tsl';
export const FXC = { scene: null as any as THREE.Scene, particles: 1, cap: 2400, noParticles: false, noTele: false, instShots: false, teleOne: false };
const G = { get scene() { return FXC.scene; } };

// ---------- 粒子 ----------
const N = 2400;
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; s0: number; s1: number; r: number; g: number; b: number; a: number; grav: number; drag: number; }
const ps: P[] = [];
const pos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3), col = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), siz = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage); siz.setUsage(THREE.DynamicDrawUsage);
let sprite: THREE.Sprite;
export function initFx() {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = instancedBufferAttribute(pos);
  const c: any = instancedBufferAttribute(col);
  const d = float(1).sub(uv().sub(0.5).length().mul(2)).clamp(0, 1);
  m.colorNode = vec4(c.xyz.mul(d.pow(1.6)).mul(c.w), 1);
  m.scaleNode = instancedBufferAttribute(siz);
  sprite = new THREE.Sprite(m); (sprite as any).count = 0; sprite.frustumCulled = false; sprite.userData.keep = true; sprite.renderOrder = 10;
  G.scene.add(sprite);
  initTele();
}
const tmpC = new THREE.Color();
export function emit(n: number, o: { x: number; y: number; z: number; c: string; spd?: [number, number]; up?: number; life?: [number, number]; s?: [number, number]; grav?: number; drag?: number; a?: number; spread?: number; dir?: number; jit?: number }) {
  if (FXC.noParticles) return;
  n = Math.max(1, Math.round(n * FXC.particles));
  tmpC.set(o.c);
  const cap = Math.min(N, FXC.cap);
  for (let i = 0; i < n && ps.length < cap; i++) {
    const sp = o.spd ? o.spd[0] + Math.random() * (o.spd[1] - o.spd[0]) : 1;
    const ang = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2;
    const j = o.jit ?? 0;
    ps.push({ x: o.x + (Math.random() - 0.5) * j, y: o.y + (Math.random() - 0.5) * j * 0.5, z: o.z + (Math.random() - 0.5) * j, vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: (o.up ?? 0) * (0.6 + Math.random() * 0.8),
      life: o.life ? o.life[0] + Math.random() * (o.life[1] - o.life[0]) : 0.5, age: 0, s0: o.s?.[0] ?? 0.2, s1: o.s?.[1] ?? 0, r: tmpC.r, g: tmpC.g, b: tmpC.b, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 2 });
  }
}
export function updFx(dt: number) {
  let n = 0;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]; p.age += dt; if (p.age >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    const f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f; p.vy = p.vy * f - p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  const pa = pos.array as Float32Array, ca = col.array as Float32Array, sa = siz.array as Float32Array;
  for (const p of ps) {
    const t = p.age / p.life, k = 1 - t;
    pa[n * 3] = p.x; pa[n * 3 + 1] = p.y; pa[n * 3 + 2] = p.z;
    ca[n * 4] = p.r * 2.2; ca[n * 4 + 1] = p.g * 2.2; ca[n * 4 + 2] = p.b * 2.2; ca[n * 4 + 3] = p.a * Math.min(1, k * 2.5) * Math.min(1, p.age * 30);
    sa[n] = p.s0 + (p.s1 - p.s0) * t; n++;
  }
  (sprite as any).count = n; sprite.visible = n > 0 && !FXC.noParticles;
  pos.needsUpdate = true; col.needsUpdate = true; siz.needsUpdate = true;
  pos.clearUpdateRanges(); col.clearUpdateRanges(); siz.clearUpdateRanges();
  pos.addUpdateRange(0, n * 3); col.addUpdateRange(0, n * 4); siz.addUpdateRange(0, n);
}

// ---------- 地面提示（出招前搖、落點） ----------
interface Tele { mesh: THREE.Mesh; fill: THREE.Mesh; u: any; uf: any; used: boolean; }
const tele: Tele[] = [];
const C_DANGER = '#ff4a5a', C_PARRY = '#ffcf4a';
function mkTeleMat(c: string, a: number) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide });
  const u = uniform(a), cc = uniform(new THREE.Color(c));
  const edge = smoothstep(0.0, 0.08, uv().y).mul(0.4).add(0.6);
  m.colorNode = color(cc as any); m.opacityNode = u.mul(edge);
  (m as any)._u = u; (m as any)._c = cc; return m;
}
function initTele() { for (let i = 0; i < 24; i++) newTele(); }
function newTele() {
  const m1 = mkTeleMat(C_DANGER, 0.25), m2 = mkTeleMat(C_DANGER, 0.5);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m1), fill = new THREE.Mesh(new THREE.BufferGeometry(), m2);
  mesh.renderOrder = 5; fill.renderOrder = 6; mesh.userData.keep = fill.userData.keep = true; mesh.visible = fill.visible = false;
  G.scene.add(mesh, fill);
  const t: Tele = { mesh, fill, u: (m1 as any)._u, uf: (m2 as any)._u, used: false }; tele.push(t); return t;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function sector(r: number, arc: number) {
  const k = 'S' + r.toFixed(2) + arc.toFixed(2); let g = geoCache.get(k);
  if (!g) { g = new THREE.CircleGeometry(r, 32, -arc / 2, arc); g.rotateX(-Math.PI / 2); g.scale(1, 1, -1); geoCache.set(k, g); }
  return g;
}
function rect(len: number, w: number) {
  const k = 'R' + len.toFixed(2) + w.toFixed(2); let g = geoCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(len, w); g.translate(len / 2, 0, 0); g.rotateX(-Math.PI / 2); geoCache.set(k, g); }
  return g;
}
let teleI = 0, teleN = 0;
export function teleBegin() { teleI = 0; }
/** 畫一個提示：shape 'sector'|'circle'|'rect'；p = 進度 0..1 */
export function teleDraw(shape: string, x: number, z: number, ang: number, a: number, b: number, p: number, parry: boolean) {
  if (FXC.teleOne) { teleDraw1(shape, x, z, ang, a, b, p, parry); return; }
  const t = tele[teleI++] || newTele();
  const g = shape === 'rect' ? rect(a, b) : sector(a, shape === 'circle' ? Math.PI * 2 : b);
  t.mesh.geometry = g; t.fill.geometry = g;
  const c = parry ? C_PARRY : C_DANGER;
  (t.mesh.material as any)._c.value.set(c); (t.fill.material as any)._c.value.set(c);
  t.mesh.position.set(x, 0.07, z); t.fill.position.set(x, 0.08, z);
  t.mesh.rotation.y = -ang; t.fill.rotation.y = -ang;
  if (shape === 'rect') t.fill.scale.set(Math.max(0.01, p), 1, 1); else t.fill.scale.setScalar(Math.max(0.01, p));
  t.u.value = 0.22; t.uf.value = 0.35 + p * 0.3;
  t.mesh.visible = t.fill.visible = !FXC.noTele;
}
export function teleEnd() {
  if (FXC.noTele) { teleI = 0; tele1I = 0; }
  for (let i = FXC.teleOne ? 0 : teleI; i < tele.length; i++) tele[i].mesh.visible = tele[i].fill.visible = false;
  for (let i = FXC.teleOne ? tele1I : 0; i < tele1.length; i++) tele1[i].mesh.visible = false;
  if (FXC.teleOne) teleI = tele1I;
}
// 單層提示：外框、底色、進度填滿在同一個著色器裡（每個提示 1 次繪製、半透明只疊一層）
interface Tele1 { mesh: THREE.Mesh; p: any; c: any; R: any; rect: any; }
const tele1: Tele1[] = [];
let tele1I = 0;
function newTele1() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const p = uniform(0), c = uniform(new THREE.Color(1, 0, 0)), R = uniform(1), rect = uniform(0);
  const radial = length(positionLocal.xz).div(R), along = positionLocal.x.div(R);
  const k = select(rect.greaterThan(0.5), along, radial);
  const filled = smoothstep(p.add(0.015), p.sub(0.015), k);          // 進度內側
  const rim = smoothstep(0.9, 0.99, k);                               // 外緣亮邊（對應原本外框的邊）
  m.colorNode = c as any;
  const base = float(0.22).mul(float(0.6).add(rim.mul(0.4))), fillA = filled.mul(float(0.35).add(p.mul(0.3))).mul(0.8);
  m.opacityNode = base.add(fillA.mul(float(1).sub(base))); // 等同原本兩層疊加的透明度
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); mesh.renderOrder = 5; mesh.visible = false; G.scene.add(mesh);
  const t = { mesh, p, c, R, rect }; tele1.push(t); return t;
}
function teleDraw1(shape: string, x: number, z: number, ang: number, a: number, b: number, p: number, parry: boolean) {
  const t = tele1[tele1I++] || newTele1();
  t.mesh.geometry = shape === 'rect' ? rect(a, b) : sector(a, shape === 'circle' ? Math.PI * 2 : b);
  t.c.value.set(parry ? C_PARRY : C_DANGER); t.p.value = Math.max(0.01, p); t.R.value = a; t.rect.value = shape === 'rect' ? 1 : 0;
  t.mesh.position.set(x, 0.075, z); t.mesh.rotation.y = -ang; t.mesh.visible = !FXC.noTele;
}
export function initTele1() { for (let i = 0; i < 24; i++) newTele1(); }

// ---------- 投射物 ----------
const shotPool: THREE.Mesh[] = []; const shotGeo = new THREE.SphereGeometry(1, 10, 8);
const shotMats = new Map<string, THREE.Material>();
let shotI = 0;
let shotIM: THREE.InstancedMesh | null = null, shotN = 0;
const _m = new THREE.Matrix4(), _c = new THREE.Color();
export function shotsBegin() { shotI = 0; shotN = 0; }
export function shotDraw(x: number, z: number, r: number, c: string) {
  if (FXC.instShots) { // 所有彈幕合成 1 次 draw call
    if (!shotIM) { const mm = new THREE.MeshBasicNodeMaterial(); shotIM = new THREE.InstancedMesh(shotGeo, mm, 256); shotIM.frustumCulled = false; shotIM.count = 0; shotIM.setColorAt(0, _c.set(1, 1, 1)); G.scene.add(shotIM); }
    if (shotN >= 256) return; const k = Math.max(0.09, r);
    _m.makeScale(k, k, k).setPosition(x, 0.7, z); shotIM.setMatrixAt(shotN, _m); shotIM.setColorAt(shotN, _c.set(c).multiplyScalar(3)); shotN++; return;
  }
  let m = shotMats.get(c); if (!m) { const mm = new THREE.MeshBasicNodeMaterial(); mm.colorNode = color(c).mul(3); m = mm; shotMats.set(c, m); }
  let s = shotPool[shotI++]; if (!s) { s = new THREE.Mesh(shotGeo, m); s.userData.keep = true; G.scene.add(s); shotPool.push(s); }
  s.material = m; s.visible = true; s.position.set(x, 0.7, z); s.scale.setScalar(Math.max(0.09, r));
}
export function shotsEnd() {
  for (let i = shotI; i < shotPool.length; i++) shotPool[i].visible = false;
  if (shotIM) { shotIM.count = shotN; shotIM.instanceMatrix.needsUpdate = true; if (shotIM.instanceColor) shotIM.instanceColor.needsUpdate = true; }
}
export function fxStats() { return { parts: ps.length, tele: FXC.noTele ? 0 : teleI, shots: FXC.instShots ? shotN : shotI, arcs: arcs.length }; }
void teleN;

// ---------- 揮砍弧：沿弧線由亮到暗的刀光（頭亮尾淡、內緣透明） ----------
interface Arc { m: THREE.Mesh; t: number; d: number; }
const arcs: Arc[] = [];
function arcGeo(r0: number, r1: number, arc: number) {
  const N = 28, pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) { const t = i / N, a = -arc / 2 + arc * t; for (const [r, v] of [[r0, 0], [r1, 1]] as const) { pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); uvs.push(t, v); } }
  for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); return g;
}
// 刀光與光環都用物件池：材質只建一次（不在戰鬥中編譯著色器）
interface ArcM { mesh: THREE.Mesh; u: any; c: any; side: any; k: any; busy: boolean; }
const slashPool: ArcM[] = [], ringPool: ArcM[] = [];
function mkSlash(): ArcM {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uniform(1), c = uniform(new THREE.Color(1, 1, 1)), side = uniform(1), k = uniform(1);
  const along = mix(float(1).sub(uv().x), uv().x, side);
  const sweep = smoothstep(float(1).sub(u).sub(0.15), float(1).sub(u).add(0.25), along);
  const edge = smoothstep(0.0, 0.85, uv().y).mul(smoothstep(1.0, 0.92, uv().y));
  m.colorNode = (c as any).mul(k).add(color('#ffffff').mul(smoothstep(0.75, 0.98, uv().y)).mul(2));
  m.opacityNode = sweep.mul(edge).mul(u);
  const mesh = new THREE.Mesh(arcGeo(0.3, 1, 2), m); mesh.renderOrder = 8; mesh.visible = false; G.scene.add(mesh);
  const a = { mesh, u, c, side, k, busy: false }; slashPool.push(a); return a;
}
function mkRing(): ArcM {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uniform(1), c = uniform(new THREE.Color(1, 1, 1));
  m.colorNode = (c as any).mul(2.5); m.opacityNode = u;
  const mesh = new THREE.Mesh(RING_G, m); mesh.renderOrder = 8; mesh.visible = false; G.scene.add(mesh);
  const a = { mesh, u, c, side: null, k: null, busy: false }; ringPool.push(a); return a;
}
const RING_G = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
export function initArcs() { for (let i = 0; i < 8; i++) mkSlash(); for (let i = 0; i < 16; i++) mkRing(); }
const free = (p: ArcM[], mk: () => ArcM) => p.find((a) => !a.busy) || mk();
export function slash(x: number, z: number, ang: number, rng: number, arc: number, heavy: boolean, c = '#fff2d0', side = 1, y = 0.75) {
  const a = free(slashPool, mkSlash); a.busy = true;
  a.mesh.geometry.dispose(); a.mesh.geometry = arcGeo(rng * 0.3, rng, arc);
  a.c.value.set(c); a.k.value = heavy ? 3.2 : 2.4; a.side.value = side > 0 ? 1 : 0; a.u.value = 1;
  a.mesh.position.set(x, y, z); a.mesh.rotation.set(0, -ang, (side > 0 ? 1 : -1) * 0.12); a.mesh.scale.setScalar(1); a.mesh.visible = true;
  arcs.push({ m: a.mesh, t: 0, d: heavy ? 0.26 : 0.18, a } as any);
}
/** 爆炸／彈反的地面光環 */
export function ring(x: number, z: number, r: number, c: string, d = 0.35) {
  const a = free(ringPool, mkRing); a.busy = true; a.c.value.set(c); a.u.value = 1;
  a.mesh.position.set(x, 0.1, z); a.mesh.userData.ring = r; a.mesh.visible = true;
  arcs.push({ m: a.mesh, t: 0, d, a } as any);
}
export function updArcs(dt: number) {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i]; a.t += dt; const k = a.t / a.d;
    const P = (a as any).a as ArcM;
    if (k >= 1) { a.m.visible = false; P.busy = false; arcs.splice(i, 1); continue; }
    P.u.value = 1 - k;
    if (a.m.userData.ring) a.m.scale.setScalar(a.m.userData.ring * (0.3 + 0.7 * Math.sqrt(k)));
    else a.m.scale.setScalar(1 + k * 0.12);
  }
}
