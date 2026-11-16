// 3D 場景核心：渲染器、光源、後製、畫質分級、房間重建、鏡頭。只讀 W，不推進模擬。
// 遊戲（Renderer3D）與視覺原型（proto/main.ts）共用這一份。
import * as THREE from 'three/webgpu';
import { pass, mrt, normalView, screenUV, builtinAOContext } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { W } from '../sim/state';
import { T, RW, RH } from '../sim/util';
import { EN } from '../sim/data';
import { TIERS, Tier } from './quality';
import { buildRoomView, RoomView, Route, LightSrc, Brazier } from './room';
import { makePlayer, PlayerView, Actors } from './actors';
import { Fx } from './fx';
import { loadKay, Kay } from './kaykit';

const PITCH = 53 * Math.PI / 180;
type Wisp = LightSrc & { a: number; sp: number; r: number; cx: number; cz: number; mesh: THREE.Mesh };

export interface Scene3DOpts { forceWebGL?: boolean; tier: Tier; route: Route; base: string; }

export class Scene3D {
  renderer: THREE.WebGPURenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
  fx = new Fx(); tier: Tier; route: Route; base: string;
  kay: Kay | null = null; kayInfo = ''; private kayLoad: Promise<Kay> | null = null;
  roomView: RoomView | null = null; player: PlayerView | null = null; actors: Actors | null = null; curRoom: any = null;
  camTarget = new THREE.Vector3(); busy = false; trans = { n: 0, worst: 0 };
  private hemi = new THREE.HemisphereLight('#8aa4b6', '#1e2624', 0.95);
  private keyLight = new THREE.SpotLight('#ffd9a0', 70, 20, 1.2, 0.85, 1.4); // 提燈主光（有陰影）
  private moon = new THREE.DirectionalLight('#8fb4d8', 0.6);                 // 冷色補光（無陰影）
  private pool: THREE.PointLight[] = []; private wisps: Wisp[] = [];
  private pipeline: THREE.RenderPipeline | null = null; private aoOk = true;
  private w = 1; private h = 1; private tmpV = new THREE.Vector3(); private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();

  constructor(o: Scene3DOpts) {
    this.tier = TIERS[o.tier] ? o.tier : 'balanced'; this.route = o.route; this.base = o.base;
    const r = this.renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: !!o.forceWebGL, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25; r.shadowMap.enabled = true; r.info.autoReset = false;
    const k = this.keyLight; k.castShadow = true; k.shadow.bias = -0.0008; k.shadow.normalBias = 0.03; k.shadow.camera.near = 0.5; k.shadow.camera.far = 16;
    this.moon.position.set(-4, 10, 6);
    this.scene.add(this.hemi, k, k.target, this.moon, this.moon.target, this.fx.mesh);
    for (const [i, c] of ['#46ffd2', '#b070ff', '#ffb050'].entries()) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6), toneMapped: false })); this.scene.add(mesh);
      this.wisps.push({ x: 0, y: 1.2, z: 0, col: new THREE.Color(c), int: 6, dist: 6, flicker: 0.05, on: () => true, prio: 2, a: i * 2.1, sp: 0.35 + i * 0.12, r: 4 + i * 1.5, cx: RW / 2, cz: RH / 2, mesh });
    }
  }
  get canvas() { return this.renderer.domElement; }
  get isWebGPU() { return !!(this.renderer.backend as any)?.isWebGPUBackend; }
  get backendName() { return this.isWebGPU ? 'WebGPU' : 'WebGL 2'; }
  async init() { await this.renderer.init(); this.applyTier(); }

  // ---------- 畫質 ----------
  setTier(t: Tier) { if (TIERS[t]) { this.tier = t; this.applyTier(); } }
  applyTier() {
    const c = TIERS[this.tier], k = this.keyLight;
    this.renderer.setPixelRatio(Math.min(c.pr, devicePixelRatio || 1));
    k.castShadow = c.shadow > 0; this.renderer.shadowMap.type = THREE.PCFShadowMap; k.shadow.radius = c.soft ? 4 : 1;
    if (c.shadow) { k.shadow.mapSize.set(c.shadow, c.shadow); k.shadow.map?.dispose(); (k.shadow as any).map = null; }
    this.fx.scale = c.particles; this.buildPool(); this.buildPost();
    this.actors?.setBlob(!c.shadow); if (this.player) this.player.obj.userData.blob.visible = !c.shadow;
    this.resize(this.w, this.h);
  }
  private buildPool() {
    for (const l of this.pool) { this.scene.remove(l); l.dispose(); }
    this.pool = []; for (let i = 0; i < TIERS[this.tier].lights; i++) { const l = new THREE.PointLight('#fff', 0, 6, 1.7); this.scene.add(l); this.pool.push(l); }
  }
  private buildPost() {
    const c = TIERS[this.tier], { scene, camera } = this;
    this.pipeline?.dispose(); this.pipeline = null;
    if (!c.bloom && !c.ao) return;
    const pl = this.pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(scene, camera);
    if (c.ao && this.aoOk) {
      try {
        const pre = pass(scene, camera); pre.setMRT(mrt({ output: normalView }));
        const aoPass = ao(pre.getTextureNode('depth'), pre.getTextureNode(), camera); aoPass.resolutionScale = 0.5;
        (scenePass as any).contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
      } catch (e) { this.aoOk = false; console.warn('AO 停用', e); }
    }
    const col = scenePass.getTextureNode('output');
    if (c.bloom) { const b: any = bloom(col, 0.55, 0.45, 0.85); b.setResolutionScale(c.bloom); pl.outputNode = col.add(b); } else pl.outputNode = col;
  }
  resize(w: number, h: number) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------- 資產與房間 ----------
  async loadKay(onProg?: (d: number, n: number) => void) {
    if (this.kay) return this.kay;
    this.kayLoad ||= loadKay(this.base, (d, n) => { this.kayInfo = `KayKit 載入中 ${d}/${n}`; onProg?.(d, n); });
    this.kay = await this.kayLoad; this.kayInfo = `KayKit ${(this.kay.bytes / 1048576).toFixed(1)} MB／${(this.kay.ms / 1000).toFixed(1)} s`;
    return this.kay;
  }
  async setRoute(r: Route, onProg?: (d: number, n: number) => void) {
    if (r === 'kaykit') await this.loadKay(onProg);
    this.route = r; await this.rebuildAsync(); await this.warmup();
  }
  /** 房間是否換了（W.room 與目前畫的不同） */
  get stale() { return !!W.room && W.room !== this.curRoom; }
  rebuild() {
    const { scene } = this;
    if (this.roomView) { scene.remove(this.roomView.group); this.roomView.dispose(); }
    if (this.actors) { this.actors.clear(); scene.remove(this.actors.root); }
    if (this.player) { scene.remove(this.player.obj); this.player.dispose(); }
    const k = this.route === 'kaykit' ? this.kay : null, blob = !TIERS[this.tier].shadow;
    this.roomView = buildRoomView(W.room, this.route, k); scene.add(this.roomView.group);
    this.actors = new Actors(k); scene.add(this.actors.root); this.actors.setBlob(blob);
    this.player = makePlayer(k); scene.add(this.player.obj); this.player.obj.userData.blob.visible = blob;
    const pal = W.room.biome.pal; scene.background = new THREE.Color(pal.bg); scene.fog = new THREE.FogExp2(pal.bg, 0.016);
    this.curRoom = W.room; this.camTarget.set(W.p.x / T, 0, W.p.y / T); this.updCamera(1);
  }
  /** 重建並預先編譯著色器（呼叫端在這段期間顯示黑幕、不推進模擬）。回傳耗時 ms。 */
  async rebuildAsync() {
    this.busy = true; const t0 = performance.now();
    this.rebuild();
    try { await this.renderer.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); }
    const ms = performance.now() - t0; this.trans.n++; this.trans.worst = Math.max(this.trans.worst, ms);
    this.busy = false; return ms;
  }
  /** 把所有敵人種類與物件先放進場景編譯一次，避免第一次出現時卡頓。 */
  async warmup() {
    const a = this.actors; if (!a) return; this.busy = true; // 暖機期間 W 被暫時換成假敵人，呼叫端不可推進模擬
    const blob = !TIERS[this.tier].shadow, ids = ['slime', 'hound', 'spitter', 'guard', 'matriarch'], saved = W.ents, so = W.objs;
    W.ents = ids.map((id, i) => ({ uid: -1 - i, id, d: (EN as any)[id], x: W.p.x + (i - 2) * 30, y: W.p.y, r: (EN as any)[id].r, a: 0, state: 'move', t: 1, flash: 0, moving: true })) as any;
    W.objs = so.concat([{ uid: -99, k: 'chest', x: W.p.x, y: W.p.y }, { uid: -98, k: 'stairs', x: W.p.x, y: W.p.y }, { uid: -97, k: 'item', x: W.p.x, y: W.p.y }, { uid: -96, k: 'fire', x: W.p.x, y: W.p.y }] as any);
    a.update(0, 0.016, blob);
    try { await this.renderer.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); }
    W.ents = saved; W.objs = so; a.update(0, 0.016, blob); for (const c of a.corpses) a.root.remove(c.g); a.corpses = []; this.busy = false;
  }

  // ---------- 每幀 ----------
  /** 更新所有畫面物件。evs = 這一幀的模擬事件。 */
  update(t: number, dt: number, evs: any[]) {
    const { fx } = this, blob = !TIERS[this.tier].shadow;
    this.player!.update(t, dt, evs); this.actors!.update(t, dt, blob); fx.onEvents(evs);
    this.roomView!.update(t, dt, !!W.room.locked);
    const pal = W.room.biome.pal, ct = this.camTarget, R = Math.random;
    for (let i = fx.rate(40, dt); i-- > 0;) fx.emit(ct.x + (R() - 0.5) * 18, 0.1 + R() * 2, ct.z + (R() - 0.5) * 12, (R() - 0.5) * 0.2, 0.08 + R() * 0.1, (R() - 0.5) * 0.2, 4 + R() * 3, 0.018 + R() * 0.02, pal.acc, 2.2, 0.01, 0.1);
    for (const b of this.roomView!.braziers) if (b.lit) for (let i = fx.rate(22, dt); i-- > 0;) fx.emit(b.x + (R() - 0.5) * 0.25, 0.95, b.z + (R() - 0.5) * 0.25, (R() - 0.5) * 0.4, 1 + R() * 1.2, (R() - 0.5) * 0.4, 0.8 + R() * 0.6, 0.022, '#ff8a3d', 5, 0.3, 0.8);
    if (Math.hypot(W.p.vx || 0, W.p.vy || 0) > 60) for (let i = fx.rate(14, dt); i-- > 0;) fx.emit(W.p.x / T, 0.05, W.p.y / T, (R() - 0.5) * 0.6, 0.3, (R() - 0.5) * 0.6, 0.5, 0.03, '#9fb0a8', 0.5, -0.5, 2);
    fx.update(dt);
    for (const w of this.wisps) { w.a += dt * w.sp; w.x = w.cx + Math.cos(w.a) * w.r * 1.6; w.z = w.cz + Math.sin(w.a * 1.3) * w.r * 0.7; w.y = 1 + Math.sin(w.a * 3) * 0.3; w.mesh.position.set(w.x, w.y, w.z); }
    this.updCamera(dt); this.updLights(t);
  }
  render() {
    this.renderer.info.reset();
    if (this.pipeline) this.pipeline.render(); else this.renderer.render(this.scene, this.camera);
    return { dc: this.renderer.info.render.drawCalls, tri: this.renderer.info.render.triangles };
  }
  private updCamera(dt: number) {
    const cam = this.camera, ct = this.camTarget, px = W.p.x / T, pz = W.p.y / T, k = 1 - Math.exp(-dt * 6);
    const dist = 17 * Math.max(1, 1.5 / cam.aspect), halfW = dist * Math.tan(15 * Math.PI / 180) * cam.aspect;
    const tx = RW > halfW * 2 ? Math.min(RW - halfW + 0.5, Math.max(halfW - 0.5, px)) : RW / 2, tz = Math.min(RH - 4, Math.max(4, pz));
    ct.x += (tx - ct.x) * k; ct.z += (tz - ct.z) * k;
    cam.position.set(ct.x, Math.sin(PITCH) * dist, ct.z + Math.cos(PITCH) * dist); cam.lookAt(ct); cam.updateMatrixWorld();
  }
  /** 固定數量的點光源，每幀依重要度與距離分給各光源（數量不變 → 不會重新編譯著色器）。 */
  private updLights(t: number) {
    const p = W.p, px = p.x / T, pz = p.y / T, lan = this.player!.lantern.getWorldPosition(this.tmpV), k = this.keyLight;
    k.position.set(px - 0.3, 4.2, pz + 0.6); k.target.position.set(px, 0, pz); k.intensity = 68 + Math.sin(t * 7) * 4 + Math.sin(t * 17) * 2;
    this.moon.target.position.set(px, 0, pz); this.moon.position.set(px - 4, 10, pz + 6);
    const srcs: (LightSrc & { s?: number })[] = [{ x: lan.x, y: lan.y + 0.1, z: lan.z, col: new THREE.Color('#ffc27a'), int: 9, dist: 9, flicker: 0.15, on: () => true, prio: 9 }, ...this.wisps];
    for (const s of this.roomView!.lights) if (s.on()) srcs.push(s);
    for (const s of srcs) s.s = s.prio * 4 - Math.hypot(s.x - this.camTarget.x, s.z - this.camTarget.z);
    srcs.sort((a, b) => b.s! - a.s!);
    this.pool.forEach((l, i) => {
      const s = srcs[i]; if (!s) { l.intensity = 0; return; }
      l.position.set(s.x, s.y, s.z); l.color.copy(s.col); l.distance = s.dist;
      l.intensity = s.int * (1 - s.flicker + s.flicker * (0.6 + 0.4 * Math.sin(t * 11 + i * 3) * Math.sin(t * 7.3 + i)));
    });
  }

  // ---------- 互動 ----------
  /** 畫面座標（0..w, 0..h）→ 射線，打到哪個火盆。 */
  pickBrazier(x: number, y: number): Brazier | null {
    if (!this.roomView) return null; this.ndc.set(x / this.w * 2 - 1, -(y / this.h) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.roomView.braziers.map((b) => b.hit), false);
    return hits.length ? (hits[0].object as any).brazier : null;
  }
  toggleBrazier(b: Brazier) { b.lit = !b.lit; this.fx.burst(b.x, 0.9, b.z, b.lit ? 30 : 16, b.lit ? '#ff9a4a' : '#888', 2, 0.6, 0.04, b.lit ? 4 : 0.5, b.lit ? -2 : 1.5); }
  toggleNearest() { if (!this.roomView) return; let best: Brazier | null = null, bd = 1e9; for (const b of this.roomView.braziers) { const d = Math.hypot(b.x - W.p.x / T, b.z - W.p.y / T); if (d < bd) { bd = d; best = b; } } if (best) this.toggleBrazier(best); }
  /** 畫面座標 → 相機射線（世界座標，1 單位 = 1 格）。供 Input.toWorld 求與地面的交點。 */
  screenRay(x: number, y: number) {
    this.ndc.set(x / this.w * 2 - 1, -(y / this.h) * 2 + 1); this.ray.setFromCamera(this.ndc, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction; return { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z };
  }
}
