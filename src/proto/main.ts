// 亡者之塔 — Three.js 視覺原型（獨立入口 proto.html）。
// 渲染核心在 src/view3d/Scene3D.ts（與遊戲共用）；這裡只有：自動遊玩、觸控/鍵盤、效能統計與回報面板。
import { W } from '../sim/state';
import { newRun, startRun, step } from '../sim/combat';
import { mkBot } from '../sim/bot';
import { TIERS, Tier, lowerTier } from '../view3d/quality';
import type { Route } from '../view3d/room';
import { Scene3D } from '../view3d/Scene3D';

const Q = new URLSearchParams(location.search);
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const store = { get(k: string) { try { return localStorage.getItem('proto.' + k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem('proto.' + k, v); } catch { /* 無痕模式 */ } } };

let autoDown = (Q.get('auto') ?? store.get('auto') ?? '1') === '1';
const wantGL = Q.get('api') === 'webgl' || (Q.get('api') == null && store.get('api') === 'webgl');
const S3 = new Scene3D({
  forceWebGL: wantGL, base: new URL('./', location.href).href,
  tier: ((Q.get('q') as Tier) || (store.get('tier') as Tier) || 'balanced'),
  route: ((Q.get('assets') as Route) || (store.get('route') as Route) || 'kaykit'),
});
S3.renderer.onDeviceLost = (info: any) => { const b = $('#boot'); b.style.display = 'flex'; b.textContent = `GPU 裝置遺失（${info?.message || info?.reason || '未知'}）。請重新整理，或改用 WebGL 2：在網址後加 ?api=webgl`; };
$('#app').appendChild(S3.canvas);
const onResize = () => S3.resize(innerWidth, innerHeight); addEventListener('resize', onResize); onResize();
const setTier = (t: Tier) => { S3.setTier(t); store.set('tier', t); hud(); };

// ---------------- 模擬（自動遊玩，可手動接管） ----------------
const bot = mkBot(0.8, { headless: true });
function newSim() { startRun(newRun('knight', 'easy', (Number(Q.get('seed')) || 20261116) >>> 0)); }
newSim();
const keys: Record<string, boolean> = {}, stick = { x: 0, y: 0, on: false, id: -1, ox: 0, oy: 0 };
let manualT = 0;
function poll() {
  const I = bot(1 / 60), kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  let mx = kx, my = ky; if (stick.on) { mx = stick.x; my = stick.y; }
  const l = Math.hypot(mx, my); if (l > 0.05) { I.mx = mx / Math.max(1, l); I.my = my / Math.max(1, l); manualT = 0; }
  else if (manualT < 3) { I.mx = 0; I.my = 0; } // 放手後 3 秒才交還機器人
  W.in = I;
}

// ---------------- 輸入：鍵盤、虛擬搖桿、點擊火盆 ----------------
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyF') S3.toggleNearest(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const cv = S3.canvas;
cv.addEventListener('pointerdown', (e) => {
  const b = S3.pickBrazier(e.clientX, e.clientY); if (b) { S3.toggleBrazier(b); return; }
  if (e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.5 && !stick.on) { stick.on = true; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; cv.setPointerCapture(e.pointerId); showStick(); }
});
cv.addEventListener('pointermove', (e) => { if (e.pointerId !== stick.id) return; const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, l = Math.hypot(dx, dy), R = 55; stick.x = dx / Math.max(R, l); stick.y = dy / Math.max(R, l); showStick(); });
const endStick = (e: PointerEvent) => { if (e.pointerId !== stick.id) return; stick.on = false; stick.id = -1; stick.x = stick.y = 0; showStick(); };
cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
function showStick() { const s = $('#stick'); s.style.display = stick.on ? 'block' : 'none'; s.style.left = stick.ox + 'px'; s.style.top = stick.oy + 'px'; ($('#stick i') as HTMLElement).style.transform = `translate(${stick.x * 40}px,${stick.y * 40}px)`; }

// ---------------- 統計 ----------------
const S = { pauses: 0, t0: 0, frames: 0, sum: 0, worst: 0, hist: [] as number[], secFrames: 0, secT: 0, minSec: 1e9, below45: 0, lastFps: 0, lowStreak: 0, log: [] as string[], dc: 0, tri: 0, cpu: 0 };
let loadMs = 0, skipStat = false;
function resetStats() { Object.assign(S, { pauses: 0, t0: performance.now(), frames: 0, sum: 0, worst: 0, hist: [], secFrames: 0, secT: 0, minSec: 1e9, below45: 0, lowStreak: 0 }); S3.trans.n = 0; S3.trans.worst = 0; }
function stat(dtMs: number) {
  S.frames++; S.sum += dtMs; S.worst = Math.max(S.worst, dtMs); S.hist.push(dtMs); if (S.hist.length > 6000) S.hist.splice(0, 1000);
  S.secFrames++; S.secT += dtMs;
  if (S.secT >= 1000) {
    const f = S.secFrames * 1000 / S.secT; S.lastFps = f; S.secFrames = 0; S.secT = 0;
    if (performance.now() - S.t0 > 3000) { S.minSec = Math.min(S.minSec, f); if (f < 45) S.below45++; }
    if (autoDown && f < TIERS[S3.tier].cap * 0.8) { if (++S.lowStreak >= 4) { const nt = lowerTier(S3.tier); if (nt) { S.log.push(`${fmtT()} ${TIERS[S3.tier].name}→${TIERS[nt].name}（${f.toFixed(0)} fps）`); setTier(nt); } S.lowStreak = 0; } }
    else S.lowStreak = 0;
  }
}
const fmtT = () => { const s = Math.floor((performance.now() - S.t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function p99() { if (!S.hist.length) return 0; const a = [...S.hist].sort((x, y) => x - y); return a[Math.floor(a.length * 0.99)]; }
let swState = '檢查中';
const routeName = () => (S3.route === 'kaykit' ? 'KayKit' : '程序化');
function report() {
  const c = TIERS[S3.tier], avg = S.frames ? 1000 / (S.sum / S.frames) : 0;
  return [
    `亡者之塔 視覺原型 回報`,
    `裝置：${navigator.userAgent}`,
    `後端：${S3.backendName}｜畫質：${c.name}｜資產：${routeName()}｜自動降級：${autoDown ? '開' : '關'}`,
    `畫面：${innerWidth}×${innerHeight} ×${S3.renderer.getPixelRatio()}`,
    `首次載入：${(loadMs / 1000).toFixed(2)} s｜${S3.kayInfo || 'KayKit 未載入'}｜離線：${swState}`,
    `測試時長：${fmtT()}｜換房 ${S3.trans.n} 次（黑幕最長 ${S3.trans.worst.toFixed(0)} ms，不計入 fps）｜長暫停 ${S.pauses} 次`,
    `平均 fps：${avg.toFixed(1)}｜最低 1 秒 fps：${S.minSec < 1e9 ? S.minSec.toFixed(0) : '-'}｜低於 45 的秒數：${S.below45}`,
    `幀時間：平均 ${(S.sum / Math.max(1, S.frames)).toFixed(1)} ms／99% ${p99().toFixed(1)} ms／最差 ${S.worst.toFixed(0)} ms`,
    `draw calls：${S.dc}｜三角形：${(S.tri / 1000).toFixed(1)}k｜粒子：${S3.fx.alive}｜點光源：${c.lights}`,
    `降級紀錄：${S.log.join('；') || '無'}`,
  ].join('\n');
}
function hud() {
  const c = TIERS[S3.tier], avg = S.frames ? 1000 / (S.sum / S.frames) : 0;
  $('#stats').textContent =
    `${S.lastFps.toFixed(0)} fps  平均 ${avg.toFixed(1)}  最低 ${S.minSec < 1e9 ? S.minSec.toFixed(0) : '-'}\n` +
    `幀 ${(S.sum / Math.max(1, S.frames)).toFixed(1)} ms  99% ${p99().toFixed(1)}  CPU ${S.cpu.toFixed(1)}\n` +
    `DC ${S.dc}  △ ${(S.tri / 1000).toFixed(1)}k  粒子 ${S3.fx.alive}\n` +
    `${S3.backendName}｜${c.name}｜${routeName()}｜${fmtT()}\n` +
    `載入 ${(loadMs / 1000).toFixed(2)} s｜離線 ${swState}${S3.kayInfo ? '\n' + S3.kayInfo : ''}${S.log.length ? '\n降級 ' + S.log[S.log.length - 1] : ''}`;
  document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((e) => e.classList.toggle('on', e.dataset.q === S3.tier));
  document.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((e) => e.classList.toggle('on', e.dataset.r === S3.route));
  document.querySelectorAll<HTMLButtonElement>('[data-api]').forEach((e) => e.classList.toggle('on', (e.dataset.api === 'webgl') === !S3.isWebGPU));
  $('#auto').classList.toggle('on', autoDown);
}

// ---------------- 按鈕 ----------------
document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((e) => e.onclick = () => { setTier(e.dataset.q as Tier); resetStats(); });
document.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((e) => e.onclick = () => { const r = e.dataset.r as Route; S3.setRoute(r, () => hud()).then(() => { store.set('route', r); resetStats(); hud(); }).catch((err) => { S3.kayInfo = 'KayKit 載入失敗：' + err; hud(); }); });
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
let lastRender = 0, acc = 0, hudT = 0, fade = 0;
async function main() {
  await S3.init();
  if (!S3.isWebGPU && !wantGL) S.log.push('WebGPU 不可用，自動改用 WebGL 2');
  try { await S3.setRoute(S3.route, () => hud()); } catch (e) { S3.kayInfo = 'KayKit 載入失敗：' + e; await S3.setRoute('proc'); }
  S3.render(); // 第一幀先畫一次（WebGPU 首幀會建立管線），再開始計時
  resetStats(); hud();
  S3.renderer.setAnimationLoop(frame);
}
function frame(now: number) {
  const cap = TIERS[S3.tier].cap;
  if (cap < 60 && now - lastRender < 1000 / cap - 2) return;
  const dtMs = lastRender ? now - lastRender : 16.7; lastRender = now;
  if (dtMs > 1000) { S.pauses++; return; } // 切到背景、通知中心等造成的長暫停，不算進效能
  if (S3.busy) return;                     // 換房編譯中：停在黑幕
  const dt = Math.min(0.1, dtMs / 1000), c0 = performance.now();
  manualT += dt;
  acc += dt; let n = 0; const evs: any[] = [];
  while (acc >= 1 / 60 && n < 4) {
    step(1 / 60, poll); acc -= 1 / 60; n++;
    for (const e of W.ev) evs.push(e);
    if (W.run && W.p && W.run.hp < W.ST.maxHp * 0.4) W.run.hp = W.ST.maxHp; // 原型：不會死
    if (W.over) newSim();
  }
  if (S3.stale) { fade = 1; $('#fade').style.opacity = '1'; S3.rebuildAsync().then(() => { skipStat = true; }); return; }
  fade = Math.max(0, fade - dt * 4); $('#fade').style.opacity = String(fade);
  S3.update(now / 1000, dt, evs);
  const r = S3.render(); S.dc = r.dc; S.tri = r.tri; S.cpu = performance.now() - c0;
  if (!loadMs) { loadMs = performance.now(); $('#boot').style.display = 'none'; }
  if (skipStat) skipStat = false; else stat(dtMs);
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
(window as any).__proto = { W, S3, report, setTier, setRoute: (r: Route) => S3.setRoute(r) };
