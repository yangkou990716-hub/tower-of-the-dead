// 亡者之塔 美術展示場景（showcase.html）。
// 菌林遺跡的 Boss 戰：主角（提燈者）對蘑菇王與召喚出的蘑菇小妖。戰鬥由現有模擬層（src/sim）驅動。
import './showcase.css';
import * as THREE from 'three/webgpu';
import { pass, vec3, vec4, float, mix, smoothstep, length, screenUV, luminance, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { rtt, vec2 } from 'three/tsl';
import { W, emptyInput, InputState } from '../sim/state';
import { newRun, startRun, step, calcStats, mkEnemy, mkPlayer, mkShot, mkHaz } from '../sim/combat';
import { buildRoom } from '../sim/world';
import { T, RW, RH } from '../sim/util';
import { Snd } from '../platform/audio';
import { buildEnv, Env, playerXZ, CX, CZ } from './env';
import { Actor, loadChars } from './chars';
import * as FX from './fx';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const store = { get(k: string) { try { return localStorage.getItem('show.' + k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem('show.' + k, v); } catch { /* 無痕模式 */ } } };
const Q = new URLSearchParams(location.search);
const BASE = new URL('./', location.href).href;

// ---------------- 畫質分級（iPhone 以「平衡」為目標） ----------------
type Tier = 'high' | 'bal' | 'perf';
const TIERS = {
  high: { name: '高', pr: 2, shadow: 2048, lanternShadow: true, grass: 1, bloom: 0.5, particles: 1, cap: 60 },
  bal: { name: '平衡', pr: 1.5, shadow: 1024, lanternShadow: false, grass: 0.45, bloom: 0.25, particles: 0.7, cap: 60 },
  perf: { name: '效能', pr: 1, shadow: 512, lanternShadow: false, grass: 0.3, bloom: 0, particles: 0.4, cap: 30 },
};
let tier: Tier = (Q.get('q') as Tier) || (store.get('tier') as Tier) || 'bal'; if (!TIERS[tier]) tier = 'bal';
const wantGL = Q.get('api') === 'webgl' || (Q.get('api') == null && store.get('api') === 'webgl');

// ---------------- 渲染器與場景 ----------------
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: wantGL, powerPreference: 'high-performance', trackTimestamp: true } as any);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
$('#app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#c9a8d8', 0.009);
const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 200);
FX.FXC.scene = scene;

// 光：黃昏陽光（主陰影）＋天空光＋提燈＋場景中的發光體
const hemi = new THREE.HemisphereLight('#b8c8ff', '#6a7a4a', 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd6ae', 3.6);
sun.position.set(CX - 11, 20, CZ - 13); sun.target.position.set(CX, 0, CZ);
sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 14, bottom: -14, near: 2, far: 60 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const lantern = new THREE.PointLight('#ffbf6a', 4.2, 6, 1.6); lantern.shadow.mapSize.set(256, 256); lantern.shadow.bias = -0.003; scene.add(lantern);
const bossGlow = new THREE.PointLight('#ff6fbf', 0, 6, 1.6); scene.add(bossGlow);

// ---------------- 後處理：Bloom＋調色（暗部偏紫、亮部偏暖）＋暈影 ----------------
let pipeline: THREE.RenderPipeline;
const hurtU = uniform(0), flashU = uniform(0);
/** 省 GPU 的泛光：亮部擷取（1/4 解析度，4 點取樣防閃爍）→ 兩層高斯模糊（1/4 與 1/8），共 5 道處理；原本的 BloomNode 是 11 道 */
function cheapBloom(src: any, scale: number) {
  const tex: any = src, px = vec2(1).div(vec2(innerWidth, innerHeight).mul(renderer.getPixelRatio()));
  const tap = (dx: number, dy: number) => tex.sample(screenUV.add(px.mul(vec2(dx, dy)))).rgb;
  const avg: any = tap(-1, -1).add(tap(1, -1)).add(tap(-1, 1)).add(tap(1, 1)).mul(0.25);
  const lum = luminance(avg), k = smoothstep(0.82, 1.15, lum);
  const bright = rtt(vec4(avg.mul(k), 1), null, null, { resolutionScale: scale } as any);
  // 注意：模糊節點的尺寸是依畫面大小計算，必須明確給縮放，否則會用全解析度
  const b1: any = gaussianBlur(bright, null, 3, { resolutionScale: scale });
  const b2: any = gaussianBlur(b1, null, 4, { resolutionScale: scale * 0.5 });
  return vec3(b1.rgb.mul(0.32).add(b2.rgb.mul(0.42)));
}
function buildPost() {
  pipeline?.dispose();
  pipeline = new THREE.RenderPipeline(renderer);
  const sp = pass(scene, camera);
  let c: any = sp.getTextureNode('output');
  if (TIERS[tier].bloom && !DIAG.noBloom) {
    if (OPT.on) c = c.add(cheapBloom(c, TIERS[tier].bloom));
    else { const b: any = bloom(c, 0.32, 0.45, 0.88); b.setResolutionScale(TIERS[tier].bloom); c = c.add(b); }
  }
  let o: any = vec3(c.rgb);
  const l = luminance(o);
  o = mix(vec3(l), o, 1.18);                                                   // 稍微提高飽和
  o = o.mul(mix(vec3(0.92, 0.9, 1.08), vec3(1), smoothstep(0.0, 0.35, l))); // 暗部偏紫（不抬黑）
  o = o.mul(mix(vec3(1), vec3(1.04, 1.0, 0.94), smoothstep(0.4, 1.0, l)));      // 亮部偏暖
  const d = length(screenUV.sub(0.5));
  o = o.mul(float(1).sub(smoothstep(0.4, 0.95, d).mul(0.32)));
  o = mix(o, vec3(1, 0.25, 0.3), hurtU.mul(smoothstep(0.3, 0.75, d)).mul(0.55));
  o = o.add(vec3(1, 0.95, 0.9).mul(flashU));
  pipeline.outputNode = vec4(o, 1);
}

// ---------------- 模擬：Boss 房 ----------------
function solidAt(x: number, z: number) { const t = W.room?.g[Math.floor(z)]?.[Math.floor(x)]; return t === 1 || t === 2; }
function initSim() {
  (W as any).meta = null;
  const run = newRun('knight', 'easy', 20261116); startRun(run);
  run.floor = 3;
  const room: any = buildRoom({ id: 0, gx: 3, gy: 2, type: 'boss', doors: {}, seed: 7, dist: 3 } as any, 3);
  for (let y = 11; y <= 13; y++) for (let x = 6; x <= 10; x++) if (Math.hypot((x + 0.5 - 8) / 2.3, (y + 0.5 - 12.2) / 1.45) < 1 && room.g[y][x] === 0) room.g[y][x] = 6; // 水池＝淺水減速
  room.locked = true; room.cleared = false;
  W.room = room; W.ents = []; W.shots = []; W.haz = []; W.picks = []; W.objs = [];
  W.p.x = CX * T; W.p.y = (CZ + 3.5) * T; W.p.aim = -Math.PI / 2; calcStats();
  bossT = 1.2;
}
let bossT = 0;
function spawnBoss() {
  const b = mkEnemy('matriarch', CX * T, (CZ - 1.8) * T, { t: 1.8 }); W.boss = b;
  FX.ring(CX, CZ - 1.8, 4, '#ff7fd0', 0.9); FX.emit(60, { x: CX, y: 0.3, z: CZ - 1.8, c: '#ffb0e0', spd: [1, 5], up: 4, life: [0.6, 1.4], s: [0.3, 0], drag: 1.5, jit: 1.5 });
  toast('蘑菇王 甦醒了');
}

// ---------------- 輸入 ----------------
const keys: Record<string, boolean> = {}, q: Record<string, boolean> = {};
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, touch = matchMedia('(pointer: coarse)').matches, lastAim = -Math.PI / 2;
const stick = { x: 0, y: 0, on: false, id: -1, ox: 0, oy: 0 };
addEventListener('keydown', (e) => { if (e.repeat) return; keys[e.code] = true; Snd.init(); setTouch(false);
  const a = ({ Space: 'dodge', ShiftLeft: 'parry', ShiftRight: 'parry', KeyK: 'parry', KeyR: 'potion', KeyQ: 's1', KeyE: 's2', KeyJ: 'attack' } as any)[e.code]; if (a) { q[a] = true; if (a === 'attack') mouseDown = true; e.preventDefault(); } });
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyJ') { mouseDown = false; q.attackUp = true; } });
const cv = renderer.domElement;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouseX = e.clientX; mouseY = e.clientY; } });
cv.addEventListener('pointerdown', (e) => {
  Snd.init();
  if (e.pointerType === 'mouse') { setTouch(false); if (e.button === 0) { mouseDown = true; q.attack = true; } else if (e.button === 2) q.parry = true; return; }
  setTouch(true);
  if (e.clientX < innerWidth * 0.5 && !stick.on) { stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; cv.setPointerCapture(e.pointerId); showStick(); }
});
cv.addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), R = 56; stick.x = dx / Math.max(R, l); stick.y = dy / Math.max(R, l); showStick(); });
const endStick = (e: PointerEvent) => { if (e.pointerId !== stick.id) return; stick.on = false; stick.id = -1; stick.x = stick.y = 0; showStick(); };
cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0 && mouseDown) { mouseDown = false; q.attackUp = true; } });
function showStick() { const s = $('#stick'); s.style.display = stick.on ? 'block' : 'none'; s.style.left = stick.ox + 'px'; s.style.top = stick.oy + 'px'; ($('#stick i') as HTMLElement).style.transform = `translate(${stick.x * 42}px,${stick.y * 42}px)`; }
document.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => {
  const n = b.dataset.b!;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Snd.init(); setTouch(true); b.classList.add('on'); q[n] = true; if (n === 'attack') mouseDown = true; });
  const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); if (n === 'attack') { mouseDown = false; q.attackUp = true; } };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});
function setTouch(v: boolean) { touch = v; document.documentElement.classList.toggle('touch', v); }
setTouch(touch);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function buildInput(): InputState {
  const I = emptyInput(), p = W.p;
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (stick.on) { mx = stick.x; my = stick.y; }
  const l = Math.hypot(mx, my); if (l > 0.15) { I.mx = mx / Math.max(1, l); I.my = my / Math.max(1, l); }
  if (!touch) {
    ndc.set(mouseX / innerWidth * 2 - 1, -(mouseY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.ray.intersectPlane(groundP, hitP);
    I.aimPt = { x: hitP.x * T, y: hitP.z * T }; I.aim = Math.atan2(hitP.z * T - p.y, hitP.x * T - p.x);
  } else {
    // 觸控：自動瞄準最近的敵人，否則面向移動方向
    let best: any = null, bd = 7 * T; for (const e of W.ents) { const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r; if (d < bd) { bd = d; best = e; } }
    if (best) lastAim = Math.atan2(best.y - p.y, best.x - p.x); else if (l > 0.3) lastAim = Math.atan2(my, mx);
    I.aim = lastAim;
  }
  I.attack = !!q.attack; I.attackHeld = mouseDown; I.attackUp = !!q.attackUp;
  I.dodge = !!q.dodge; I.parry = !!q.parry; I.potion = !!q.potion; I.s1 = !!q.s1; I.s2 = !!q.s2;
  for (const k in q) q[k] = false;
  return I;
}

// ---------------- 角色 ----------------
let hero: Actor; const actors = new Map<number, Actor>(); const dying: Actor[] = [];
let pLock = 0, swingSide = 1;
function heroAnim(a: Actor, p: any, dt: number) {
  pLock -= dt;
  if (p.dead) { a.play('Death', { once: true, hold: true }); return; }
  if (p.dodgeT > 0) { a.play('Roll', { once: true, ts: a.dur('Roll') / 0.36, fade: 0.05 }); return; }
  if (pLock > 0) return;
  if (p.charge > 0 || p.parryT > 0) { a.play('Attacking_Idle', { ts: 1.2, fade: 0.08 }); return; }
  if (p.potT > 0) { a.play('PickUp', { once: true, ts: a.dur('PickUp') / 0.75 }); return; }
  if (p.hurt > 0.15) { a.play('RecieveHit', { once: true, ts: 1.5, fade: 0.05 }); return; }
  if (p.moving) a.play('Run', { ts: 1.15, fade: 0.15 }); else a.play('Idle', { fade: 0.2 });
}
const KING_CLIP: Record<string, string> = { swing: 'Punch', slam: 'Weapon', dash: 'Jump', rain: 'Yes', radial: 'Duck', summon: 'Wave', spiral: 'No', shot: 'Punch', lob: 'Yes', beam: 'No', blink: 'Wave' };
function enemyAnim(a: Actor, e: any) {
  const st = e.state, king = a.kind === 'matriarch';
  const restartWind = st === 'wind' && (a.prevState !== 'wind' || e.t > a.prevT + 0.01);
  a.prevState = st; a.prevT = e.t;
  switch (st) {
    case 'spawn': a.play(king ? 'Jump_Land' : 'Jump', { once: true, hold: true, ts: 0.8 }); break;
    case 'wind': { const c = king ? KING_CLIP[e.atk.t] || 'Punch' : 'Bite_Front'; a.play(c, { once: true, restart: restartWind, ts: (a.dur(c) * 0.45) / Math.max(0.15, e.tw), fade: 0.1 }); break; }
    case 'act': if (e.atk?.t === 'dash') a.play('Run', { ts: 2.2, fade: 0.06 }); else if (a.cur) a.cur.timeScale = 1; break;
    case 'rec': if (a.cur) a.cur.timeScale = 1; break;
    case 'stag': a.play(king ? 'HitReact' : 'HitRecieve', { once: true, restart: a.prevState !== 'stag' && false, ts: 0.9 }); break;
    default: if (e.moving) a.play(king && e.phase > 0 ? 'Run' : 'Walk', { ts: king ? 1.1 : 1.4, fade: 0.2 }); else a.play('Idle', { fade: 0.25 });
  }
}
function syncEnemies(dt: number) {
  const seen = new Set<number>();
  for (const e of W.ents) {
    let a = actors.get(e.uid);
    if (!a) { a = new Actor(e.id === 'matriarch' ? 'matriarch' : 'slime'); if (OPT.on && a.kind === 'slime') a.model.traverse((o: any) => { if (o.isMesh) o.castShadow = false; }); scene.add(a.root); actors.set(e.uid, a); }
    seen.add(e.uid); a.set(e.x, e.y, e.a); enemyAnim(a, e);
    // 前搖時身體微微脹大、泛紅：出招提示
    const wind = e.state === 'wind' ? 1 - e.t / e.tw : 0;
    a.root.scale.setScalar(1 + wind * 0.06); a.tint.value.setRGB(1 + wind * 0.25, 1 - wind * 0.1, 1 - wind * 0.15);
    a.flash.value = Math.max(0, a.flash.value - dt * 9);
  }
  for (const [uid, a] of actors) if (!seen.has(uid)) { actors.delete(uid); a.play('Death', { once: true, hold: true, fade: 0.05 }); a.dead = 2.2; dying.push(a); }
  for (let i = dying.length - 1; i >= 0; i--) { const a = dying[i]; a.dead -= dt; a.flash.value = Math.max(0, a.flash.value - dt * 6); if (a.dead < 0.7) a.root.position.y -= dt * 1.2; if (a.dead <= 0) { scene.remove(a.root); dying.splice(i, 1); } }
  for (const a of [...actors.values(), ...dying]) a.mixer.update(dt * (W.slow > 0 ? 0.3 : 1));
}
const nearestActor = (x: number, y: number) => { let b: Actor | undefined, bd = 1e9; for (const e of W.ents) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = actors.get(e.uid); } } return b; };

// ---------------- 出招提示（地面） ----------------
function drawTele() {
  for (const e of W.ents) {
    if ((e.state !== 'wind' && !(e.state === 'act' && e.atk?.t === 'beam')) || !e.atk) continue;
    const a = e.atk, p = e.state === 'wind' ? 1 - e.t / Math.max(0.01, e.tw) : 1, x = e.x / T, z = e.y / T;
    switch (a.t) {
      case 'swing': FX.teleDraw('sector', x, z, e.a, a.reach / T, a.arc, p, true); break;
      case 'slam': FX.teleDraw('circle', x, z, 0, a.rad / T, 0, p, true); break;
      case 'dash': FX.teleDraw('rect', x, z, e.a, (a.spd * a.dur) / T, (e.r * 2) / T, p, true); break;
      case 'shot': case 'radial': case 'spiral': FX.teleDraw('circle', x, z, 0, 1.4, 0, p, false); break;
    }
  }
  for (const h of W.haz) {
    if (h.k === 'blast' && h.from === 'e') FX.teleDraw('circle', h.x / T, h.y / T, 0, h.r / T, 0, 1 - h.t / h.t0, false);
    else if (h.k === 'puddle') FX.teleDraw('circle', h.x / T, h.y / T, 0, h.r / T, 0, 0.5, false);
  }
}

// ---------------- 事件 → 特效／音效 ----------------
let shake = 0, slowFlash = 0;
const kick = new THREE.Vector2();
const px = (v: number) => v / T;
function onEv(e: any) {
  switch (e.k) {
    case 'snd': Snd.play(e.n); break;
    case 'swing': {
      swingSide *= -1; const heavy = e.heavy;
      FX.slash(px(e.x), px(e.y), e.a, px(e.rng) * 1.1, e.arc * 1.05, heavy, heavy ? '#ffcf6a' : '#fff1c8', e.side ?? swingSide);
      if (heavy) FX.slash(px(e.x), px(e.y), e.a, px(e.rng) * 0.85, e.arc * 0.9, true, '#7ff6ff', -(e.side ?? swingSide), 0.6);
      pLock = heavy ? 0.36 : 0.24;
      hero.play(heavy ? 'Dagger_Attack2' : (swingSide > 0 ? 'Dagger_Attack' : 'Dagger_Attack2'), { once: true, restart: true, ts: heavy ? 1.5 : 2.3, at: heavy ? 0.1 : 0.15, fade: 0.04 });
      break;
    }
    case 'eswing': FX.slash(px(e.x), px(e.y), e.a, px(e.r), e.arc, true, '#ff7fd0', 1, 0.9); break;
    case 'hitfx': {
      const a = nearestActor(e.x, e.y); if (a && !e.blocked) a.flash.value = 1;
      const c = e.crit ? '#ffe27a' : e.blocked ? '#b8c4d0' : '#fff6e0';
      FX.emit(e.crit || e.heavy ? 26 : 14, { x: px(e.x), y: 0.9, z: px(e.y), c, spd: [4, 11], up: 3, life: [0.15, 0.35], s: [0.2, 0], drag: 6, dir: e.a, spread: 1.4, grav: 9 });
      FX.emit(8, { x: px(e.x), y: 0.9, z: px(e.y), c: '#ff9ad8', spd: [1, 4], up: 2, life: [0.3, 0.7], s: [0.28, 0], drag: 3 });
      FX.ring(px(e.x), px(e.y), e.heavy ? 1.6 : 1.0, e.crit ? '#ffe27a' : '#ffffff', 0.18);
      shake = Math.max(shake, e.heavy || e.crit ? 8 : 3.5); kick.x += Math.cos(e.a) * 0.35; kick.y += Math.sin(e.a) * 0.35; break;
    }
    case 'die': { const big = e.boss; FX.emit(big ? 140 : 34, { x: px(e.x), y: big ? 1.5 : 0.6, z: px(e.y), c: e.c2 || '#ffb0e0', spd: [1, big ? 9 : 6], up: big ? 7 : 5, life: [0.5, big ? 2 : 1.1], s: [big ? 0.4 : 0.26, 0], drag: 1.8, grav: 5, jit: big ? 2 : 0.5 });
      FX.ring(px(e.x), px(e.y), big ? 7 : 1.8, big ? '#ffd27a' : '#ff9ad8', big ? 1.2 : 0.45); if (big) { flashU.value = 0.7; shake = 16; toast('蘑菇王 倒下了'); bossT = 5; } break; }
    case 'phit': hero.flash.value = 1; shake = 11; hurtU.value = 1; FX.emit(16, { x: px(e.x), y: 0.9, z: px(e.y), c: '#ff6a6a', spd: [2, 6], up: 3, life: [0.2, 0.5], s: [0.22, 0], grav: 8 }); break;
    case 'pdodge': FX.ring(px(e.x), px(e.y), 3.2, '#bfe8ff', 0.55); slowFlash = 0.5; toast('精準閃避'); break;
    case 'parry': FX.ring(px(e.x), px(e.y), 2.4, '#ffe9a8', 0.35); FX.emit(26, { x: px(e.x) + Math.cos(e.a) * 0.5, y: 1, z: px(e.y) + Math.sin(e.a) * 0.5, c: '#fff0b0', spd: [5, 12], up: 2, life: [0.15, 0.4], s: [0.22, 0], drag: 6 }); shake = 7; flashU.value = 0.25; toast('彈反！'); break;
    case 'dodge': FX.emit(10, { x: px(e.x), y: 0.2, z: px(e.y), c: '#e8f0ff', spd: [0.5, 2], life: [0.3, 0.6], s: [0.35, 0.8], a: 0.3, dir: e.a + Math.PI, spread: 1 }); break;
    case 'boom': { const r = px(e.r); FX.ring(px(e.x), px(e.y), r, e.col || '#ff9ad8', 0.4); FX.ring(px(e.x), px(e.y), r * 0.6, '#ffffff', 0.25);
      FX.emit(e.slam ? 46 : 20, { x: px(e.x), y: 0.25, z: px(e.y), c: e.col || '#ff9ad8', spd: [2, e.slam ? 9 : 6], up: 3, life: [0.25, 0.7], s: [0.35, 0], drag: 4, jit: r * 0.8 });
      if (e.slam) FX.emit(24, { x: px(e.x), y: 0.15, z: px(e.y), c: '#d8c8b0', spd: [1, 4], up: 1, life: [0.5, 1.0], s: [0.5, 1.0], a: 0.25, drag: 2, jit: r });
      shake = Math.max(shake, e.slam ? 10 : 5); break; }
    case 'spawn': FX.ring(px(e.e.x), px(e.e.y), 1.4, '#9cffd6', 0.5); FX.emit(14, { x: px(e.e.x), y: 0.1, z: px(e.e.y), c: '#9cffd6', spd: [0.2, 1.2], up: 3, life: [0.5, 0.9], s: [0.22, 0], drag: 1 }); break;
    case 'shotdie': FX.emit(8, { x: px(e.x), y: 0.7, z: px(e.y), c: e.col || '#ff9ad8', spd: [1, 4], life: [0.15, 0.35], s: [0.2, 0] }); break;
    case 'charged': FX.ring(px(W.p.x), px(W.p.y), e.full ? 1.5 : 1.0, e.full ? '#ffffff' : '#ffd27a', 0.28); FX.emit(e.full ? 20 : 10, { x: px(W.p.x), y: 0.8, z: px(W.p.y), c: '#ffd27a', spd: [1, 3], up: 2, life: [0.3, 0.6], s: [0.15, 0] }); break;
    case 'healfx': FX.emit(20, { x: px(e.x), y: 0.3, z: px(e.y), c: '#9affb8', spd: [0.3, 1.2], up: 3, life: [0.6, 1.0], s: [0.2, 0], drag: 1 }); break;
    case 'stag': FX.emit(8, { x: px(e.e.x), y: 2, z: px(e.e.y), c: '#fff0a0', spd: [1, 3], up: 1, life: [0.4, 0.8], s: [0.22, 0] }); break;
    case 'summon': markEv('召喚'); break;
    case 'phase': markEv('換階段'); FX.ring(px(e.e.x), px(e.e.y), 8, '#ff7fd0', 1.0); flashU.value = 0.5; shake = 14; toast(e.e.phase === 2 ? '蘑菇王 狂暴化' : '蘑菇王 憤怒了'); break;
  }
}

// ---------------- 環境粒子 ----------------
let fxAcc = 0;
let trailTick = 0;
function ambient(dt: number, t: number) {
  fxAcc += dt; if (fxAcc < 1 / 30) return; const k = fxAcc * 30; fxAcc = 0; trailTick++;
  const cx = camTarget.x, cz = camTarget.z;
  if (Math.random() < 0.9 * k) FX.emit(1, { x: cx + (Math.random() - 0.5) * 24, y: 0.3 + Math.random() * 2.2, z: cz + (Math.random() - 0.5) * 14, c: Math.random() < 0.5 ? '#ffe9a0' : '#a8fff0', spd: [0.05, 0.25], up: 0.12, life: [2.5, 5], s: [0.07, 0.07], a: 0.9, drag: 0.2, grav: -0.02 });
  if (Math.random() < 0.6 * k) { const a = t * 1.7, r = 1.2 + Math.random() * 0.8; FX.emit(1, { x: CX + Math.cos(a) * r, y: 2.3 + Math.sin(a) * r, z: -0.4, c: '#c9a8ff', spd: [0.1, 0.4], up: 0.3, life: [1, 2], s: [0.12, 0], drag: 0.5 }); }
  let si = 0; for (const s of W.shots) if (s.from === 'e' && (!OPT.on || (si++ + trailTick) % 3 === 0)) FX.emit(1, { x: s.x / T, y: 0.75, z: s.y / T, c: s.col || '#ff9ad8', spd: [0, 0.2], life: [0.2, 0.35], s: [0.22, 0], drag: 2 });
  const b = W.boss && !W.boss.dead ? W.boss : null;
  if (b && Math.random() < 0.5 * k) FX.emit(1, { x: b.x / T + (Math.random() - 0.5) * 1.6, y: 2.6 + Math.random(), z: b.y / T + (Math.random() - 0.5) * 1.6, c: '#ff9ad8', spd: [0.1, 0.4], up: 0.6, life: [1, 1.8], s: [0.12, 0], drag: 0.6 });
}

// ---------------- 鏡頭 ----------------
const camTarget = new THREE.Vector3(CX, 0, CZ + 2);
const PITCH = 46 * Math.PI / 180, ZOOM = +(Q.get('zoom') || 1.18);
function updCamera(dt: number) {
  const px = W.p.x / T, pz = W.p.y / T, k = 1 - Math.exp(-dt * 5);
  const dist = 16 * Math.max(1, 1.65 / camera.aspect) * ZOOM;
  camTarget.x += (Math.min(18.5, Math.max(8.5, px)) - camTarget.x) * k; camTarget.z += (Math.min(10.5, Math.max(5.5, pz + 0.6)) - camTarget.z) * k;
  shake = Math.max(0, shake - dt * 35); kick.multiplyScalar(Math.exp(-dt * 12));
  const sx = (Math.random() - 0.5) * shake * 0.015, sz = (Math.random() - 0.5) * shake * 0.015;
  camera.position.set(camTarget.x + sx + kick.x * 0.2, Math.sin(PITCH) * dist, camTarget.z + Math.cos(PITCH) * dist + sz + kick.y * 0.2);
  camera.lookAt(camTarget.x + sx, 1.1, camTarget.z + sz);
}
function onResize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize);

// ---------------- HUD ----------------
let toastT: any = 0;
function toast(s: string) { const t = $('#toast'); t.textContent = s; t.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = '0'; }, 1200); }
function hud() {
  const run = W.run!, p = W.p;
  ($('#hp i') as HTMLElement).style.transform = `scaleX(${Math.max(0, run.hp / W.ST.maxHp)})`;
  ($('#st i') as HTMLElement).style.transform = `scaleX(${Math.max(0, p.sta / W.ST.maxSta)})`;
  $('#pot').textContent = '× ' + run.potions;
  const b = W.boss && !W.boss.dead ? W.boss : null; $('#boss').style.opacity = b ? '1' : '0';
  if (b) ($('#boss i') as HTMLElement).style.transform = `scaleX(${Math.max(0, b.hp / b.mhp)})`;
  $('#btn-atk').classList.toggle('charge', p.charge > 0);
}
const S = { hitch: 0, frames: 0, t: 0, fps: 0, sum: 0, n: 0, worst: 0, minF: 1e9, dc: 0, tri: 0, cpu: 0, t0: performance.now() };
function stats() {
  const be = (renderer.backend as any).isWebGPUBackend ? 'WebGPU' : 'WebGL 2', c = TIERS[tier];
  $('#stats').textContent = `${S.fps.toFixed(0)} fps  平均 ${(S.n ? 1000 / (S.sum / S.n) : 0).toFixed(1)}  最低 ${S.minF < 1e9 ? S.minF.toFixed(0) : '-'}\n` +
    `幀 ${(S.n ? S.sum / S.n : 0).toFixed(1)} ms  最慢 ${S.worst.toFixed(0)} ms  卡頓 ${S.hitch}  CPU ${S.cpu.toFixed(1)}\n` +
    `draw calls ${S.dc}  三角形 ${(S.tri / 1000).toFixed(0)}k  草 ${env.grass.count}  粒子 ${FX.fxStats().parts}  GPU ${gpuMs > 0 ? gpuMs.toFixed(1) + ' ms' : '不可得'}\n${be}｜${c.name}｜${innerWidth}×${innerHeight}×${renderer.getPixelRatio()}`;
  document.querySelectorAll<HTMLElement>('[data-q]').forEach((e) => e.classList.toggle('on', e.dataset.q === tier));
  $('#opt').classList.toggle('on', OPT.on); $('#bench').textContent = bench ? `測試中 ${bench.i + 1}/${BENCH.length}：${BENCH[bench.i].n}` : benchDone ? '重跑基準測試' : '基準測試（約 95 秒）';
  document.querySelectorAll<HTMLElement>('[data-api]').forEach((e) => e.classList.toggle('on', (e.dataset.api === 'webgl') === (be !== 'WebGPU')));
}
function report() {
  const be = (renderer.backend as any).isWebGPUBackend ? 'WebGPU' : 'WebGL 2', sec = (performance.now() - S.t0) / 1000, cv = renderer.domElement;
  const L = [`亡者之塔 展示場景 回報（診斷版）`, `裝置：${navigator.userAgent}`,
    `後端：${be}｜畫質：${TIERS[tier].name}｜最佳化：${OPT.on ? '開' : '關'}｜GPU 計時：${gpuOK ? '可用（timestamp-query）' : '不可得（瀏覽器未提供 timestamp-query）'}`,
    `解析度：CSS ${innerWidth}×${innerHeight}｜裝置像素比 ${devicePixelRatio}｜渲染倍率 ${renderer.getPixelRatio()}｜實際繪製 ${cv.width}×${cv.height}（${(cv.width * cv.height / 1e6).toFixed(2)} MP）`,
    `自由遊玩（不含基準測試）${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}｜平均 ${(S.n ? 1000 / (S.sum / S.n) : 0).toFixed(1)} fps｜最低 1 秒 ${S.minF < 1e9 ? S.minF.toFixed(0) : '-'} fps｜最慢一幀 ${S.worst.toFixed(0)} ms｜卡頓（>100 ms）${S.hitch} 次`];
  const free = secs.filter((x) => !x.stage);
  if (free.length) {
    L.push('', '【自由遊玩：最慢的 5 秒】');
    for (const x of [...free].sort((a, b) => a.fps - b.fps).slice(0, 5)) L.push(fmtSec(x));
    L.push('', '【自由遊玩：平常 vs 戰鬥高峰】', '平常：' + fmtAvg(avgOf(free.filter((x) => !isPeak(x)))), '高峰：' + fmtAvg(avgOf(free.filter(isPeak))));
  }
  const all = secs.length ? secs : [];
  if (all.length >= 5) {
    const lock = all.filter((x) => x.fps > 28.5 && x.fps < 31.5).length / all.length, g = all.filter((x) => x.gpu > 0), gm = g.length ? g.reduce((a, x) => a + x.gpu, 0) / g.length : -1;
    const cm = all.reduce((a, x) => a + x.upd + x.sub, 0) / all.length;
    L.push('', `【幀率上限判斷】${(lock * 100).toFixed(0)}% 的秒數落在 30 fps｜CPU 平均 ${cm.toFixed(1)} ms｜GPU 平均 ${gm > 0 ? gm.toFixed(1) + ' ms' : '不可得'}` +
      (lock > 0.8 ? (gm > 16.7 ? '｜GPU 每幀超過 16.7 ms，被螢幕更新（60 Hz）對齊成 30 fps' : '｜CPU 與 GPU 都低於 16.7 ms 仍鎖 30：疑似系統限制（低耗電模式等）') : ''));
  }
  if (benchDone) { L.push('', '【基準測試（同一劇本）】'); for (const r of benchDone) L.push(`${r.n}：${fmtAvg(r.a)}`); }
  else L.push('', '（尚未跑基準測試）');
  return L.join('\n');
}
function resetStats() { Object.assign(S, { hitch: 0, frames: 0, t: 0, sum: 0, n: 0, worst: 0, minF: 1e9, t0: performance.now() }); }

// ---------------- 畫質 ----------------
let env: Env, grassMax = 0;
function applyTier() {
  const c = TIERS[tier];
  renderer.setPixelRatio(Math.min(c.pr, devicePixelRatio || 1));
  sun.shadow.mapSize.set(c.shadow, c.shadow); sun.shadow.map?.dispose(); (sun.shadow as any).map = null;
  sun.shadow.radius = tier === 'perf' ? 1 : 3;
  if (lantern.castShadow !== c.lanternShadow) { lantern.castShadow = c.lanternShadow; lantern.shadow.map?.dispose(); (lantern.shadow as any).map = null; }
  if (env) env.grass.count = Math.round(grassMax * c.grass);
  FX.FXC.particles = c.particles; applyOpt();
  store.set('tier', tier); onResize(); buildPost(); resetStats();
}
document.querySelectorAll<HTMLElement>('[data-q]').forEach((e) => e.onclick = () => { tier = e.dataset.q as Tier; applyTier(); });
document.querySelectorAll<HTMLElement>('[data-api]').forEach((e) => e.onclick = () => { store.set('api', e.dataset.api!); const u = new URL(location.href); u.searchParams.delete('api'); location.href = u.href; });
$('#panel-t').onclick = () => document.body.classList.toggle('mini');
$('#bench').onclick = () => startBench();
$('#opt').onclick = () => { OPT.on = !OPT.on; applyOpt(); resetStats(); stats(); };
$('#copy').onclick = async () => { const t = report(); let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch { /* 不給剪貼簿 */ } const b = $('#report'); (b.querySelector('textarea') as HTMLTextAreaElement).value = t; b.style.display = 'flex'; ($('#report b') as HTMLElement).textContent = ok ? '已複製，貼給 Claude 即可' : '請長按全選後複製'; };
$('#report button').onclick = () => { $('#report').style.display = 'none'; };

// ---------------- 效能診斷 ----------------
// CPU：update＝模擬＋動畫＋特效（JS 實測）；submit＝建立並送出繪圖指令（JS 實測）。
// GPU：只有瀏覽器提供 WebGPU timestamp-query 時才是實測；否則顯示「不可得」，GPU 負擔只能用「關掉某效果後 fps 的變化」推測。
const OPT = { on: store.get('opt') !== '0' };
const DIAG = { noBloom: false, noPost: false, hidden: [] as THREE.Object3D[] };
const PCAP: Record<Tier, number> = { high: 1600, bal: 1000, perf: 500 };
let optBuilt: boolean | null = null;
function applyOpt() {
  FX.FXC.instShots = OPT.on; FX.FXC.cap = OPT.on ? PCAP[tier] : 2400; FX.FXC.teleOne = OPT.on;
  if (env) { const gm = env.grass.userData.mats; env.grass.material = OPT.on ? gm.lam : gm.std; }
  if (optBuilt !== null && optBuilt !== OPT.on && pipeline) buildPost(); optBuilt = OPT.on;
  for (const a of actors.values()) if (a.kind === 'slime') a.model.traverse((o: any) => { if (o.isMesh) o.castShadow = !OPT.on; });
  store.set('opt', OPT.on ? '1' : '0');
}
interface Sec { fps: number; worst: number; upd: number; sub: number; gpu: number; dc: number; tri: number; ents: number; shots: number; parts: number; tele: number; haz: number; evs: string[]; stage: string }
const secs: Sec[] = [];
const newAcc = () => ({ n: 0, ms: 0, worst: 0, upd: 0, sub: 0, gpu: 0, gn: 0, dc: 0, tri: 0, ents: 0, shots: 0, parts: 0, tele: 0, haz: 0, evs: new Set<string>() });
let acc = newAcc();
let lastBossAtk = '';
function sample(real: number, upd: number, sub: number) {
  const f = FX.fxStats();
  acc.n++; acc.ms += real; acc.worst = Math.max(acc.worst, real); acc.upd += upd; acc.sub += sub;
  if (gpuMs > 0) { acc.gpu += gpuMs; acc.gn++; }
  acc.dc = Math.max(acc.dc, S.dc); acc.tri = Math.max(acc.tri, S.tri); acc.ents = Math.max(acc.ents, W.ents.length); acc.shots = Math.max(acc.shots, W.shots.length);
  acc.parts = Math.max(acc.parts, f.parts); acc.tele = Math.max(acc.tele, f.tele); acc.haz = Math.max(acc.haz, W.haz.length);
  const b = W.boss && !W.boss.dead ? W.boss : null, ba = b && (b.state === 'wind' || b.state === 'act') ? (b.atk?.t || '') : '';
  if (ba && ba !== lastBossAtk) acc.evs.add('Boss:' + ba); lastBossAtk = ba;
  if (acc.ms >= 1000) {
    const sec: Sec = { fps: acc.n * 1000 / acc.ms, worst: acc.worst, upd: acc.upd / acc.n, sub: acc.sub / acc.n, gpu: acc.gn ? acc.gpu / acc.gn : -1, dc: acc.dc, tri: acc.tri, ents: acc.ents, shots: acc.shots, parts: acc.parts, tele: acc.tele, haz: acc.haz, evs: [...acc.evs], stage: bench ? BENCH[bench.i].n : performance.now() < quietUntil ? '測試後' : '' };
    if (performance.now() - S.t0 > 3000) { secs.push(sec); if (secs.length > 600) secs.shift(); }
    if (bench && bench.t > 1.5) bench.secs.push(sec);
    acc = newAcc();
  }
}
const markEv = (k: string) => { acc.evs.add(k); };
const fmtSec = (x: Sec) => `${x.fps.toFixed(0)} fps｜最慢 ${x.worst.toFixed(0)} ms｜CPU 更新 ${x.upd.toFixed(1)}＋提交 ${x.sub.toFixed(1)} ms｜GPU ${x.gpu > 0 ? x.gpu.toFixed(1) + ' ms' : '不可得'}｜DC ${x.dc}｜△ ${(x.tri / 1000).toFixed(0)}k｜敵 ${x.ents}｜彈 ${x.shots}｜粒子 ${x.parts}｜提示圈 ${x.tele}｜危害 ${x.haz}${x.evs.length ? '｜' + x.evs.join(',') : ''}`;
const isPeak = (x: Sec) => x.shots >= 8 || x.ents >= 3 || x.parts >= 300 || x.tele >= 4;
function avgOf(xs: Sec[]) {
  if (!xs.length) return null;
  const m = (k: 'fps' | 'upd' | 'sub' | 'dc' | 'tri' | 'parts' | 'shots') => xs.reduce((a, x) => a + x[k], 0) / xs.length;
  const g = xs.filter((x) => x.gpu > 0);
  return { n: xs.length, fps: m('fps'), min: Math.min(...xs.map((x) => x.fps)), worst: Math.max(...xs.map((x) => x.worst)), upd: m('upd'), sub: m('sub'), gpu: g.length ? g.reduce((a, x) => a + x.gpu, 0) / g.length : -1, dc: m('dc'), tri: m('tri'), parts: m('parts'), shots: m('shots') };
}
const fmtAvg = (a: ReturnType<typeof avgOf>) => a ? `${a.n} 秒｜平均 ${a.fps.toFixed(1)} fps｜最低 ${a.min.toFixed(0)}｜最慢 ${a.worst.toFixed(0)} ms｜CPU ${a.upd.toFixed(1)}＋${a.sub.toFixed(1)} ms｜GPU ${a.gpu > 0 ? a.gpu.toFixed(1) + ' ms' : '不可得'}｜DC ${a.dc.toFixed(0)}｜△ ${(a.tri / 1000).toFixed(0)}k｜粒子 ${a.parts.toFixed(0)}｜彈 ${a.shots.toFixed(0)}` : '無資料';

// ---------------- 基準測試：同一場景、固定劇本 ----------------
// 高峰＝模擬 Boss 第三階段最忙的時候：螺旋彈（每 0.13 秒 3 發）＋每 1.5 秒放射彈 14 發＋每 1.2 秒孢子雨 5 個落點＋維持 4 隻小怪；Boss 定住、主角不死、定點自動揮刀。
type Off = '' | 'particles' | 'bloom' | 'shadow' | 'grass' | 'tele' | 'res' | 'post' | 'transp';
const BENCH: { n: string; d: number; peak: boolean; opt: boolean; off: Off }[] = [
  { n: '平常・修改前', d: 8, peak: false, opt: false, off: '' },
  { n: '高峰・修改前', d: 10, peak: true, opt: false, off: '' },
  { n: '高峰・關粒子', d: 7, peak: true, opt: false, off: 'particles' },
  { n: '高峰・關泛光', d: 7, peak: true, opt: false, off: 'bloom' },
  { n: '高峰・關陰影', d: 7, peak: true, opt: false, off: 'shadow' },
  { n: '高峰・關草', d: 7, peak: true, opt: false, off: 'grass' },
  { n: '高峰・關提示圈', d: 7, peak: true, opt: false, off: 'tele' },
  { n: '高峰・解析度減半', d: 7, peak: true, opt: false, off: 'res' },
  { n: '高峰・關整條後處理', d: 7, peak: true, opt: false, off: 'post' },
  { n: '高峰・關全部半透明', d: 7, peak: true, opt: false, off: 'transp' },
  { n: '高峰・修改後', d: 10, peak: true, opt: true, off: '' },
  { n: '平常・修改後', d: 8, peak: false, opt: true, off: '' },
];
let bench: { i: number; t: number; secs: Sec[]; res: { n: string; a: ReturnType<typeof avgOf> }[]; k: Record<string, number>; optWas: boolean } | null = null;
let benchDone: { n: string; a: ReturnType<typeof avgOf> }[] | null = null;
function setOff(off: Off, on: boolean) {
  switch (off) {
    case 'particles': FX.FXC.noParticles = on; break;
    case 'bloom': DIAG.noBloom = on; buildPost(); break;
    case 'shadow': sun.castShadow = !on; break;
    case 'grass': env.grass.visible = !on; break;
    case 'tele': FX.FXC.noTele = on; break;
    case 'post': DIAG.noPost = on; break;
    case 'transp': FX.FXC.noParticles = on; FX.FXC.noTele = on; DIAG.hidden = []; if (on) scene.traverse((o: any) => { if (o.isMesh && o.visible && o.material?.transparent && o.renderOrder !== 8) DIAG.hidden.push(o); }); else DIAG.hidden.forEach((o) => o.visible = true); if (!on) DIAG.hidden = []; break;
    case 'res': renderer.setPixelRatio(Math.min(TIERS[tier].pr, devicePixelRatio || 1) * (on ? 0.5 : 1)); onResize(); break;
  }
}
function clearPeak() { for (const e of W.ents) if (!e.boss) e.dead = true; W.ents = W.ents.filter((e: any) => !e.dead); W.shots = []; W.haz = []; }
function enterStage(i: number) {
  const st = BENCH[i]; OPT.on = st.opt; applyOpt(); setOff(st.off, true);
  if (!st.peak) clearPeak();
  bench!.t = 0; bench!.secs = []; bench!.k = {}; acc = newAcc();
}
function startBench() {
  if (bench) return; bench = { i: 0, t: 0, secs: [], res: [], k: {}, optWas: OPT.on }; toast('基準測試開始，請勿操作');
  if (!W.ents.some((e: any) => e.boss)) spawnBoss();
  enterStage(0);
}
function benchStep(dt: number) {
  if (!bench) return;
  const st = BENCH[bench.i], b = W.ents.find((e: any) => e.boss), run = W.run!, p = W.p;
  bench.t += dt;
  run.hp = W.ST.maxHp; p.dead = false; W.over = null; p.x = CX * T; p.y = (CZ + 2.6) * T;
  if (b) { b.hp = b.mhp; b.state = 'stag'; b.t = 99; b.x = CX * T; b.y = (CZ - 1.8) * T; }
  const K = bench.k;
  if ((K.atk = (K.atk || 0) + dt) > 0.4) { K.atk = 0; q.attack = true; }
  if (st.peak && b) {
    const bx = b.x, by = b.y;
    if ((K.rad = (K.rad || 0) + dt) > 1.5) { K.rad = 0; const o = Math.random() * 6.28; for (let i = 0; i < 14; i++) mkShot('e', bx, by, o + i * 6.283 / 14, 165, 1, { col: '#ffb86b', r: 6 }); }
    if ((K.spi = (K.spi || 0) + dt) > 0.13) { K.spi = 0; K.sa = (K.sa || 0) + 0.33; for (let i = 0; i < 3; i++) mkShot('e', bx, by, K.sa + i * 2.094, 155, 1, { col: '#ff9ad8', r: 6 }); }
    if ((K.rain = (K.rain || 0) + dt) > 1.2) { K.rain = 0; for (let i = 0; i < 5; i++) mkHaz({ k: 'blast', from: 'e', x: p.x + (Math.random() - 0.5) * 340, y: p.y - 40 + (Math.random() - 0.5) * 300, r: 54, t: 1.0 + i * 0.16, dmg: 1, col: '#ffb86b', puddle: 'poison' }); }
    if (W.ents.filter((e: any) => !e.boss && !e.dead).length < 4) mkEnemy('slime', (CX + (Math.random() - 0.5) * 9) * T, (CZ + 1 + (Math.random() - 0.5) * 4) * T);
  }
  if (bench.t >= st.d) {
    bench.res.push({ n: st.n, a: avgOf(bench.secs) }); setOff(st.off, false);
    bench.i++;
    if (bench.i >= BENCH.length) { quietUntil = performance.now() + 4000; benchDone = bench.res; OPT.on = bench.optWas; applyOpt(); bench = null; clearPeak(); toast('基準測試完成，請按「產生回報」'); stats(); return; }
    enterStage(bench.i);
  }
}

// ---------------- 主迴圈 ----------------
let last = 0;
function frame(now: number) {
  const cap = TIERS[tier].cap;
  if (cap < 60 && now - last < 1000 / cap - 2) return;
  const real = last ? now - last : 16.7; last = now;
  if (real > 1000) return; // 背景回來：不推進
  const c0 = performance.now(), dt = Math.min(0.05, real / 1000), t = now / 1000;
  benchStep(dt);
  update(dt, t);
  const c1 = performance.now();
  renderer.info.reset(); if (DIAG.hidden.length) DIAG.hidden.forEach((o) => o.visible = false);
  if (Q.has('raw') || DIAG.noPost) renderer.render(scene, camera); else pipeline.render();
  if (DIAG.hidden.length) DIAG.hidden.forEach((o) => o.visible = true);
  const c2 = performance.now();
  S.dc = renderer.info.render.drawCalls; S.tri = renderer.info.render.triangles; S.cpu = c2 - c0;
  if (gpuOK && (++gpuTick % 4 === 0) && !gpuBusy) { gpuBusy = true; renderer.resolveTimestampsAsync('render' as any).then((v: any) => { if (typeof v === 'number' && v > 0) gpuMs = v; gpuBusy = false; }).catch(() => { gpuBusy = false; }); }
  sample(real, c1 - c0, c2 - c1);
  const freePlay = !bench && performance.now() >= quietUntil; // 基準測試中與結束後 4 秒（重新編譯）不算進自由遊玩
  S.frames++; S.t += real;
  if (freePlay) { S.sum += real; S.n++; S.worst = Math.max(S.worst, real); if (real > 100 && performance.now() - S.t0 > 3000) S.hitch++; }
  if (S.t >= 1000) { S.fps = S.frames * 1000 / S.t; if (freePlay && performance.now() - S.t0 > 3000) S.minF = Math.min(S.minF, S.fps); S.frames = 0; S.t = 0; stats(); }
  hud();
}
let simT = 0;
let quietUntil = 0;
let gpuOK = false, gpuTick = 0, gpuBusy = false, gpuMs = -1;
function update(dt: number, t: number) {
  simT = t;
  // 模擬
  step(dt, () => { W.in = buildInput(); });
  if (W.over || W.p.dead) { respawnT += dt; if (respawnT > 1.8) { respawnT = 0; W.over = null; const run = W.run!; const p0 = W.p; W.p = mkPlayer(); W.p.x = p0.x; W.p.y = p0.y; run.hp = W.ST.maxHp; run.potions = W.ST.potMax; W.p.inv = 2; toast('燈火重新亮起'); } }
  if (!W.ents.some((e: any) => e.boss)) { bossT -= dt; if (bossT <= 0) { bossT = 99; spawnBoss(); } }
  for (const e of W.ev) onEv(e); W.ev.length = 0;
  // 角色
  hero.set(W.p.x, W.p.y, W.p.aim); heroAnim(hero, W.p, dt); hero.flash.value = Math.max(0, hero.flash.value - dt * 8);
  hero.root.visible = !(W.p.inv > 0 && !W.p.dead && W.p.dodgeT <= 0 && Math.floor(t * 20) % 2 === 0 && W.p.inv < 1.9);
  hero.mixer.update(dt * (W.slow > 0 ? 0.7 : 1)); syncEnemies(dt);
  playerXZ.value.set(W.p.x / T, W.p.y / T);
  // 光
  hero.lantern!.getWorldPosition(lantern.position); lantern.position.y += 0.25;
  lantern.intensity = 4.2 * (0.9 + 0.06 * Math.sin(t * 9) + 0.04 * Math.sin(t * 23));
  const b = W.boss && !W.boss.dead ? W.boss : null;
  if (b) { bossGlow.position.set(b.x / T, 3.2, b.y / T); bossGlow.intensity = 8 + (b.state === 'wind' ? 14 * (1 - b.t / b.tw) : 0); } else bossGlow.intensity = 0;
  env.update(t, dt);
  // 特效
  FX.teleBegin(); drawTele(); FX.teleEnd();
  FX.shotsBegin(); for (const s of W.shots) FX.shotDraw(s.x / T, s.y / T, (s.r || 5) / T * 1.6, s.col || '#ff9ad8'); for (const k of W.picks) FX.shotDraw(k.x / T, k.y / T, 0.1, k.kind === 'gold' ? '#ffd65a' : '#ff8aa0'); FX.shotsEnd();
  ambient(dt, t); FX.updFx(dt); FX.updArcs(dt);
  hurtU.value = Math.max(0, hurtU.value - dt * 2.2); flashU.value = Math.max(0, flashU.value - dt * 3); slowFlash = Math.max(0, slowFlash - dt);
  updCamera(dt);
}
let respawnT = 0;

async function main() {
  await renderer.init();
  gpuOK = !!(renderer.backend as any).trackTimestamp && (renderer.backend as any).isWebGPUBackend;
  const bar = $('#boot i'), lp = $('#boot span');
  await loadChars(BASE, (f) => { bar.style.width = (f * 70).toFixed(0) + '%'; });
  lp.textContent = '生成場景…'; await new Promise((r) => setTimeout(r, 0));
  initSim();
  grassMax = 14000;
  env = buildEnv(scene, grassMax, solidAt);
  FX.initFx(); FX.initArcs(); FX.initTele1();
  hero = new Actor('player'); scene.add(hero.root);
  applyTier();
  bar.style.width = '85%'; lp.textContent = '編譯著色器…';
  updCamera(1);
  // 預熱：把會在戰鬥中才出現的東西（Boss、小怪、刀光、光環、彈幕、提示圈）先畫一次，避免第一次出現時卡頓
  const tmp = [new Actor('matriarch'), new Actor('slime')]; tmp.forEach((a, i) => { a.root.position.set(CX + i * 2, 0, CZ); scene.add(a.root); });
  FX.slash(CX, CZ, 0, 1.5, 2, true, '#ffcf6a'); FX.slash(CX, CZ, 1, 1.5, 2, false, '#ff7fd0'); for (let i = 0; i < 3; i++) FX.ring(CX, CZ, 2, '#ffffff');
  for (const one of [false, true]) { FX.FXC.teleOne = one; FX.teleBegin(); FX.teleDraw('sector', CX, CZ, 0, 2, 1.5, 0.5, true); FX.teleDraw('circle', CX, CZ, 0, 2, 0, 0.5, false); FX.teleDraw('rect', CX, CZ, 0, 4, 0.5, 0.5, true); FX.teleEnd(); } FX.FXC.teleOne = OPT.on;
  env.grass.material = env.grass.userData.mats.lam; try { await renderer.compileAsync(scene, camera); } catch { /* 預熱失敗不影響執行 */ } applyOpt();
  FX.shotsBegin(); for (const c of ['#ff9ad8', '#ffb86b', '#e6ffb8', '#ffd65a', '#ff8aa0', '#a4e86a']) FX.shotDraw(CX, CZ, 0.2, c); FX.shotsEnd();
  FX.emit(20, { x: CX, y: 1, z: CZ, c: '#fff', life: [0.1, 0.2] }); FX.updFx(0.016);
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
  pipeline.render(); await new Promise((r) => setTimeout(r, 50)); pipeline.render();
  tmp.forEach((a) => scene.remove(a.root)); FX.updArcs(10); FX.teleBegin(); FX.teleEnd(); FX.shotsBegin(); FX.shotsEnd();
  bar.style.width = '100%';
  $('#boot').style.display = 'none';
  resetStats(); stats();
  renderer.setAnimationLoop(frame);
}
main().catch((e) => { $('#boot span').textContent = '啟動失敗：' + (e?.message || e) + '（可在網址後加 ?api=webgl 再試）'; console.error(e); });
(window as any).__show = { W, renderer, camera, scene, setTier: (t: Tier) => { tier = t; applyTier(); }, report, adv: (sec: number) => { for (let i = 0; i < sec * 30; i++) { benchStep(1 / 30); update(1 / 30, simT + 1 / 30); } }, buildInput, startBench, bstate: () => bench && { i: bench.i, t: bench.t }, RW, RH, mkPlayer };
