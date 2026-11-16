// 亡者之塔 — Three.js 視覺原型（獨立入口 proto.html）。
// 用現有 sim 驅動：genFloor/buildRoom 的格子 → 3D 房間；自動遊玩機器人（或手動）推動角色。
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, screenUV, builtinAOContext } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { W } from '../sim/state';
import { T, RW, RH } from '../sim/util';
import { newRun, startRun, step } from '../sim/combat';
import { mkBot } from '../sim/bot';
import { TIERS, Tier, lowerTier } from './quality';
import { buildRoomView, RoomView, Route, LightSrc } from './room';
import { makePlayer, PlayerView, Actors } from './actors';
import { Fx } from './fx';
import { loadKay, Kay } from './kaykit';

const Q = new URLSearchParams(location.search);
const BASE = new URL('./', location.href).href;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const store = { get(k: string) { try { return localStorage.getItem('proto.' + k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem('proto.' + k, v); } catch { /* 無痕模式 */ } } };

let tier: Tier = (Q.get('q') as Tier) || (store.get('tier') as Tier) || 'balanced'; if (!TIERS[tier]) tier = 'balanced';
let route: Route = (Q.get('assets') as Route) || (store.get('route') as Route) || 'proc';
let autoDown = (Q.get('auto') ?? store.get('auto') ?? '1') === '1';
const wantGL = Q.get('api') === 'webgl' || (Q.get('api') == null && store.get('api') === 'webgl');

// ---------------- 渲染器 ----------------
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: wantGL, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false;
renderer.onDeviceLost = (info: any) => { const b = $('#boot'); b.style.display = 'flex'; b.textContent = `GPU 裝置遺失（${info?.message || info?.reason || '未知'}）。請重新整理，或改用 WebGL 2：在網址後加 ?api=webgl`; };
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
const PITCH = 53 * Math.PI / 180;

// ---------------- 光 ----------------
const hemi = new THREE.HemisphereLight('#5d7a8c', '#141a18', 0.8); scene.add(hemi);
const keyLight = new THREE.SpotLight('#ffd9a0', 70, 16, 1.15, 0.75, 1.6); // 提燈的主光（有陰影）
keyLight.castShadow = true; keyLight.shadow.bias = -0.0008; keyLight.shadow.normalBias = 0.03; keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 16;
scene.add(keyLight, keyLight.target);
let pool: THREE.PointLight[] = [];
function buildPool() {
  for (const l of pool) { scene.remove(l); l.dispose(); }
  pool = []; for (let i = 0; i < TIERS[tier].lights; i++) { const l = new THREE.PointLight('#fff', 0, 6, 1.7); scene.add(l); pool.push(l); }
}
// 2–3 盞彩色遊走光
const wisps: (LightSrc & { a: number; sp: number; r: number; cx: number; cz: number; mesh: THREE.Mesh })[] = [];
for (const [i, c] of ['#46ffd2', '#b070ff', '#ffb050'].entries()) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6), toneMapped: false })); scene.add(mesh);
  wisps.push({ x: 0, y: 1.2, z: 0, col: new THREE.Color(c), int: 6, dist: 6, flicker: 0.05, on: () => true, prio: 2, a: i * 2.1, sp: 0.35 + i * 0.12, r: 4 + i * 1.5, cx: RW / 2, cz: RH / 2, mesh });
}

// ---------------- 後製 ----------------
let pipeline: THREE.RenderPipeline | null = null, bloomNode: any = null, aoOk = true;
function buildPost() {
  const c = TIERS[tier];
  pipeline?.dispose(); pipeline = null; bloomNode = null;
  if (!c.bloom && !c.ao) return;
  pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  if (c.ao && aoOk) {
    try {
      const pre = pass(scene, camera); pre.setMRT(mrt({ output: normalView }));
      const aoPass = ao(pre.getTextureNode('depth'), pre.getTextureNode(), camera); aoPass.resolutionScale = 0.5;
      (scenePass as any).contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
    } catch (e) { aoOk = false; console.warn('AO 停用', e); }
  }
  const col = scenePass.getTextureNode('output');
  if (c.bloom) { bloomNode = bloom(col, 0.55, 0.45, 0.85); bloomNode.setResolutionScale(c.bloom); pipeline.outputNode = col.add(bloomNode); }
  else pipeline.outputNode = col;
}

function applyTier() {
  const c = TIERS[tier];
  renderer.setPixelRatio(Math.min(c.pr, devicePixelRatio || 1));
  keyLight.castShadow = c.shadow > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap; keyLight.shadow.radius = c.soft ? 4 : 1;
  if (c.shadow) { keyLight.shadow.mapSize.set(c.shadow, c.shadow); keyLight.shadow.map?.dispose(); (keyLight.shadow as any).map = null; }
  fx.scale = c.particles; buildPool(); buildPost(); actors?.setBlob(!c.shadow); if (player) player.obj.userData.blob.visible = !c.shadow;
  onResize(); store.set('tier', tier); hud();
}

// ---------------- 模擬 ----------------
const bot = mkBot(0.8, { headless: true });
function newSim() { const run = newRun('knight', 'easy', (Number(Q.get('seed')) || 20261116) >>> 0); startRun(run); }
newSim();
const keys: Record<string, boolean> = {}, stick = { x: 0, y: 0, on: false, id: -1, ox: 0, oy: 0 };
let manualT = 0; // 最近一次手動輸入後的秒數
function poll() {
  const I = bot(1 / 60), kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  let mx = kx, my = ky; if (stick.on) { mx = stick.x; my = stick.y; }
  const l = Math.hypot(mx, my); if (l > 0.05) { I.mx = mx / Math.max(1, l); I.my = my / Math.max(1, l); manualT = 0; }
  else if (manualT < 3) { I.mx = 0; I.my = 0; } // 放手後 3 秒才交還機器人
  W.in = I;
}

// ---------------- 場景物件 ----------------
let kay: Kay | null = null, kayLoad: Promise<Kay> | null = null, kayInfo = '';
let roomView: RoomView | null = null, player: PlayerView | null = null, actors: Actors | null = null, curRoom: any = null;
const fx = new Fx(); scene.add(fx.mesh);
function rebuild() {
  if (roomView) { scene.remove(roomView.group); roomView.dispose(); }
  if (actors) { actors.clear(); scene.remove(actors.root); }
  if (player) { scene.remove(player.obj); player.dispose(); }
  const k = route === 'kaykit' ? kay : null;
  roomView = buildRoomView(W.room, route, k); scene.add(roomView.group);
  actors = new Actors(k); scene.add(actors.root); actors.setBlob(!TIERS[tier].shadow);
  player = makePlayer(k); scene.add(player.obj); player.obj.userData.blob.visible = !TIERS[tier].shadow;
  const pal = W.room.biome.pal; scene.background = new THREE.Color(pal.bg); scene.fog = new THREE.FogExp2(pal.bg, 0.028);
  curRoom = W.room; camTarget.set(W.p.x / T, 0, W.p.y / T);
}
async function setRoute(r: Route) {
  if (r === 'kaykit' && !kay) {
    kayLoad ||= loadKay(BASE, (d, n) => { kayInfo = `KayKit 載入中 ${d}/${n}`; hud(); });
    try { kay = await kayLoad; kayInfo = `KayKit ${(kay.bytes / 1048576).toFixed(1)} MB／${(kay.ms / 1000).toFixed(1)} s`; }
    catch (e) { kayInfo = 'KayKit 載入失敗：' + e; hud(); return; }
  }
  route = r; store.set('route', r); rebuild(); hud();
}

// ---------------- 鏡頭 ----------------
const camTarget = new THREE.Vector3();
function onResize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
function updCamera(dt: number) {
  const px = W.p.x / T, pz = W.p.y / T, k = 1 - Math.exp(-dt * 6);
  const dist = 21 * Math.max(1, 1.5 / camera.aspect), halfW = dist * Math.tan(15 * Math.PI / 180) * camera.aspect;
  const tx = RW > halfW * 2 ? Math.min(RW - halfW + 0.5, Math.max(halfW - 0.5, px)) : RW / 2;
  const tz = Math.min(RH - 4, Math.max(4, pz));
  camTarget.x += (tx - camTarget.x) * k; camTarget.z += (tz - camTarget.z) * k;
  camera.position.set(camTarget.x, Math.sin(PITCH) * dist, camTarget.z + Math.cos(PITCH) * dist); camera.lookAt(camTarget);
}

// ---------------- 光源分配：固定數量的點光源，每幀依重要度與距離分給光源 ----------------
const tmpV = new THREE.Vector3();
function updLights(t: number) {
  const p = W.p, px = p.x / T, pz = p.y / T;
  const lan = player!.lantern.getWorldPosition(tmpV);
  keyLight.position.set(px - 0.3, 4.2, pz + 0.6); keyLight.target.position.set(px, 0, pz); keyLight.intensity = 60 + Math.sin(t * 7) * 3 + Math.sin(t * 17) * 2;
  const srcs: (LightSrc & { s?: number })[] = [{ x: lan.x, y: lan.y + 0.1, z: lan.z, col: new THREE.Color('#ffc27a'), int: 5, dist: 7, flicker: 0.15, on: () => true, prio: 9 }];
  for (const w of wisps) { srcs.push(w); }
  for (const s of roomView!.lights) if (s.on()) srcs.push(s);
  for (const s of srcs) s.s = s.prio * 4 - Math.hypot(s.x - camTarget.x, s.z - camTarget.z);
  srcs.sort((a, b) => b.s! - a.s!);
  pool.forEach((l, i) => {
    const s = srcs[i]; if (!s) { l.intensity = 0; return; }
    l.position.set(s.x, s.y, s.z); l.color.copy(s.col); l.distance = s.dist;
    l.intensity = s.int * (1 - s.flicker + s.flicker * (0.6 + 0.4 * Math.sin(t * 11 + i * 3) * Math.sin(t * 7.3 + i)));
  });
}

// ---------------- 輸入：鍵盤、虛擬搖桿、點擊火盆 ----------------
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyF') toggleNearest(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function tapAt(x: number, y: number) {
  if (!roomView) return false; ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(roomView.braziers.map((b) => b.hit), false);
  if (hits.length) { const b = (hits[0].object as any).brazier; toggle(b); return true; } return false;
}
function toggle(b: any) { b.lit = !b.lit; fx.burst(b.x, 0.9, b.z, b.lit ? 30 : 16, b.lit ? '#ff9a4a' : '#888', 2, 0.6, 0.04, b.lit ? 4 : 0.5, b.lit ? -2 : 1.5); }
function toggleNearest() { if (!roomView) return; let best: any = null, bd = 1e9; for (const b of roomView.braziers) { const d = Math.hypot(b.x - W.p.x / T, b.z - W.p.y / T); if (d < bd) { bd = d; best = b; } } if (best) toggle(best); }
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => {
  if (tapAt(e.clientX, e.clientY)) return;
  if (e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.5 && !stick.on) { stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; cv.setPointerCapture(e.pointerId); showStick(); }
});
cv.addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), R = 55; stick.x = dx / Math.max(R, l); stick.y = dy / Math.max(R, l); showStick(); });
const endStick = (e: PointerEvent) => { if (e.pointerId !== stick.id) return; stick.on = false; stick.id = -1; stick.x = stick.y = 0; showStick(); };
cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
function showStick() { const s = $('#stick'); s.style.display = stick.on ? 'block' : 'none'; s.style.left = stick.ox + 'px'; s.style.top = stick.oy + 'px'; ($('#stick i') as HTMLElement).style.transform = `translate(${stick.x * 40}px,${stick.y * 40}px)`; }

// ---------------- 統計 ----------------
const S = { t0: 0, frames: 0, sum: 0, worst: 0, hist: [] as number[], secFrames: 0, secT: 0, minSec: 1e9, below45: 0, lastFps: 0, lowStreak: 0, log: [] as string[], dc: 0, tri: 0, cpu: 0 };
let loadMs = 0;
function resetStats() { Object.assign(S, { t0: performance.now(), frames: 0, sum: 0, worst: 0, hist: [], secFrames: 0, secT: 0, minSec: 1e9, below45: 0, lowStreak: 0 }); }
function stat(dtMs: number) {
  S.frames++; S.sum += dtMs; S.worst = Math.max(S.worst, dtMs); S.hist.push(dtMs); if (S.hist.length > 6000) S.hist.splice(0, 1000);
  S.secFrames++; S.secT += dtMs;
  if (S.secT >= 1000) {
    const f = S.secFrames * 1000 / S.secT; S.lastFps = f; S.secFrames = 0; S.secT = 0;
    if (performance.now() - S.t0 > 3000) { S.minSec = Math.min(S.minSec, f); if (f < 45) S.below45++; }
    const cap = TIERS[tier].cap;
    if (autoDown && f < cap * 0.8) { if (++S.lowStreak >= 4) { const nt = lowerTier(tier); if (nt) { S.log.push(`${fmtT()} ${TIERS[tier].name}→${TIERS[nt].name}（${f.toFixed(0)} fps）`); tier = nt; applyTier(); } S.lowStreak = 0; } }
    else S.lowStreak = 0;
  }
}
const fmtT = () => { const s = Math.floor((performance.now() - S.t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function p99() { if (!S.hist.length) return 0; const a = [...S.hist].sort((x, y) => x - y); return a[Math.floor(a.length * 0.99)]; }
let swState = '檢查中';
function report() {
  const c = TIERS[tier], b = (renderer.backend as any).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  const avg = S.frames ? 1000 / (S.sum / S.frames) : 0;
  return [
    `亡者之塔 視覺原型 回報`,
    `裝置：${navigator.userAgent}`,
    `後端：${b}｜畫質：${c.name}｜資產：${route === 'kaykit' ? 'KayKit' : '程序化'}｜自動降級：${autoDown ? '開' : '關'}`,
    `畫面：${innerWidth}×${innerHeight} ×${renderer.getPixelRatio()}`,
    `首次載入：${(loadMs / 1000).toFixed(2)} s｜${kayInfo || 'KayKit 未載入'}｜離線：${swState}`,
    `測試時長：${fmtT()}`,
    `平均 fps：${avg.toFixed(1)}｜最低 1 秒 fps：${S.minSec < 1e9 ? S.minSec.toFixed(0) : '-'}｜低於 45 的秒數：${S.below45}`,
    `幀時間：平均 ${(S.sum / Math.max(1, S.frames)).toFixed(1)} ms／99% ${p99().toFixed(1)} ms／最差 ${S.worst.toFixed(0)} ms`,
    `draw calls：${S.dc}｜三角形：${(S.tri / 1000).toFixed(1)}k｜粒子：${fx.alive}｜點光源：${c.lights}`,
    `降級紀錄：${S.log.join('；') || '無'}`,
  ].join('\n');
}
function hud() {
  const c = TIERS[tier], b = (renderer.backend as any)?.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  const avg = S.frames ? 1000 / (S.sum / S.frames) : 0;
  $('#stats').textContent =
    `${S.lastFps.toFixed(0)} fps  平均 ${avg.toFixed(1)}  最低 ${S.minSec < 1e9 ? S.minSec.toFixed(0) : '-'}\n` +
    `幀 ${(S.sum / Math.max(1, S.frames)).toFixed(1)} ms  99% ${p99().toFixed(1)}  CPU ${S.cpu.toFixed(1)}\n` +
    `DC ${S.dc}  △ ${(S.tri / 1000).toFixed(1)}k  粒子 ${fx.alive}\n` +
    `${b}｜${c.name}｜${route === 'kaykit' ? 'KayKit' : '程序化'}｜${fmtT()}\n` +
    `載入 ${(loadMs / 1000).toFixed(2)} s｜離線 ${swState}${kayInfo ? '\n' + kayInfo : ''}${S.log.length ? '\n降級 ' + S.log[S.log.length - 1] : ''}`;
  document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((e) => e.classList.toggle('on', e.dataset.q === tier));
  document.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((e) => e.classList.toggle('on', e.dataset.r === route));
  document.querySelectorAll<HTMLButtonElement>('[data-api]').forEach((e) => e.classList.toggle('on', (e.dataset.api === 'webgl') === (b !== 'WebGPU')));
  $('#auto').classList.toggle('on', autoDown);
}

// ---------------- 按鈕 ----------------
document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((e) => e.onclick = () => { tier = e.dataset.q as Tier; applyTier(); resetStats(); });
document.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((e) => e.onclick = () => { setRoute(e.dataset.r as Route).then(resetStats); });
document.querySelectorAll<HTMLButtonElement>('[data-api]').forEach((e) => e.onclick = () => { store.set('api', e.dataset.api!); if (Q.has('api')) { const u = new URL(location.href); u.searchParams.set('api', e.dataset.api!); location.href = u.href; } else location.reload(); });
$('#auto').onclick = () => { autoDown = !autoDown; store.set('auto', autoDown ? '1' : '0'); hud(); };
$('#reset').onclick = () => { resetStats(); S.log = []; hud(); };
$('#copy').onclick = async () => {
  const txt = report(); let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch { /* 有些環境不給剪貼簿 */ }
  const box = $('#report'); (box.querySelector('textarea') as HTMLTextAreaElement).value = txt; box.style.display = 'flex';
  ($('#report b') as HTMLElement).textContent = ok ? '已複製，貼給 Claude 即可' : '無法自動複製，請長按全選後複製';
};
$('#report button').onclick = () => { $('#report').style.display = 'none'; };
$('#panel-t').onclick = () => document.body.classList.toggle('mini');

// ---------------- 主迴圈 ----------------
let last = 0, lastRender = 0, acc = 0, hudT = 0;
async function main() {
  await renderer.init();
  if (!(renderer.backend as any).isWebGPUBackend && !wantGL) S.log.push('WebGPU 不可用，自動改用 WebGL 2');
  applyTier();
  if (route === 'kaykit') await setRoute('kaykit'); else rebuild();
  resetStats();
  renderer.setAnimationLoop(frame);
}
function frame(now: number) {
  const cap = TIERS[tier].cap;
  if (cap < 60 && now - lastRender < 1000 / cap - 2) return;
  const dtMs = lastRender ? now - lastRender : 16.7; lastRender = now;
  const dt = Math.min(0.1, dtMs / 1000), c0 = performance.now();
  manualT += dt;
  // 模擬：固定 60 Hz
  acc += dt; let n = 0; const evs: any[] = [];
  while (acc >= 1 / 60 && n < 4) {
    step(1 / 60, poll); acc -= 1 / 60; n++;
    for (const e of W.ev) evs.push(e);
    if (W.run && W.p && W.run.hp < W.ST.maxHp * 0.4) W.run.hp = W.ST.maxHp; // 原型：不會死
    if (W.over) { newSim(); }
  }
  if (W.room !== curRoom) rebuild();
  const t = now / 1000;
  player!.update(t, dt, evs); actors!.update(t, dt, !TIERS[tier].shadow); fx.onEvents(evs);
  roomView!.update(t, dt, !!W.room.locked);
  // 環境粒子：孢子、火盆火星
  const pal = W.room.biome.pal;
  for (let i = fx.rate(40, dt); i-- > 0;) fx.emit(camTarget.x + (Math.random() - 0.5) * 18, 0.1 + Math.random() * 2, camTarget.z + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 0.2, 0.08 + Math.random() * 0.1, (Math.random() - 0.5) * 0.2, 4 + Math.random() * 3, 0.018 + Math.random() * 0.02, pal.acc, 2.2, 0.01, 0.1);
  for (const b of roomView!.braziers) if (b.lit) for (let i = fx.rate(22, dt); i-- > 0;) fx.emit(b.x + (Math.random() - 0.5) * 0.25, 0.95, b.z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.6, 0.022, '#ff8a3d', 5, 0.3, 0.8);
  if (Math.hypot(W.p.vx || 0, W.p.vy || 0) > 60) for (let i = fx.rate(14, dt); i-- > 0;) fx.emit(W.p.x / T, 0.05, W.p.y / T, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 0.5, 0.03, '#9fb0a8', 0.5, -0.5, 2);
  fx.update(dt);
  // 遊走光
  for (const w of wisps) { w.a += dt * w.sp; w.x = w.cx + Math.cos(w.a) * w.r * 1.6; w.z = w.cz + Math.sin(w.a * 1.3) * w.r * 0.7; w.y = 1 + Math.sin(w.a * 3) * 0.3; w.mesh.position.set(w.x, w.y, w.z); }
  updCamera(dt); updLights(t);
  renderer.info.reset();
  if (pipeline) pipeline.render(); else renderer.render(scene, camera);
  S.dc = renderer.info.render.drawCalls; S.tri = renderer.info.render.triangles; S.cpu = performance.now() - c0;
  if (!loadMs) { loadMs = performance.now(); $('#boot').style.display = 'none'; }
  stat(dtMs);
  hudT += dt; if (hudT > 0.25) { hudT = 0; hud(); }
}

// ---------------- 離線（Service Worker） ----------------
if ('serviceWorker' in navigator && isSecureContext && !import.meta.env.DEV) {
  navigator.serviceWorker.register('./proto-sw.js', { scope: './proto' }).then((reg) => {
    const done = () => { swState = '已可離線'; hud(); };
    if (reg.active) done(); else (reg.installing || reg.waiting)?.addEventListener('statechange', (e: any) => { if (e.target.state === 'activated') done(); });
  }).catch((e) => { swState = '不支援（' + (e?.name || e) + '）'; });
} else swState = import.meta.env.DEV ? '開發模式不啟用' : '不支援';

main().catch((e) => { $('#boot').textContent = '啟動失敗：' + (e?.message || e); console.error(e); });
(window as any).__proto = { W, renderer, report, setTier: (t: Tier) => { tier = t; applyTier(); }, setRoute };
