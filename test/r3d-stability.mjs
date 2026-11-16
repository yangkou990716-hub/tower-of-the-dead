// 3D 穩定性測試：首次載入、模型快取、暫停恢復、自動降級、斷網重開、GPU 遺失 → 下次用 2D。
// 用法：npm run build && npx vite preview --port 4173 &  然後  node test/r3d-stability.mjs
// 注意：雲端是軟體繪圖，fps 與耗時不代表 iPhone 實機。
import { chromium } from 'playwright-core';
const B = process.env.URL || 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 640 } }); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GL Driver')) errs.push(m.text()); });
const ok = (n, c, x = '') => { console.log((c ? '✓ ' : '✗ ') + n + (x ? '  — ' + x : '')); if (!c) process.exitCode = 1; };
const title = () => p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 60000 });
const inRoom = () => p.waitForFunction(() => { const r = window.__totd.App.renderer.s3; return r && r.roomView && !r.busy; }, null, { timeout: 120000 });

await p.goto(B + '?r=3d&api=webgl'); await title();
await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; for (let i = 0; i < 100 && !(r.active && r.active.state === 'activated'); i++) await new Promise((s) => setTimeout(s, 100)); });
const t1 = Date.now();
await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); t.UI.closeAll(); });
await inRoom(); const kay = await p.evaluate(() => window.__totd.App.renderer.s3.kayInfo);
ok('首次進入遠征：3D 房間建好、模型載入', /KayKit .*MB/.test(kay), `${Date.now() - t1} ms（雲端軟體繪圖）｜${kay}`);
await p.waitForTimeout(1000);
const n = await p.evaluate(async () => (await caches.has('tower-models')) ? (await (await caches.open('tower-models')).keys()).length : 0);
ok('第一次造訪就把 3D 模型寫進離線快取', n >= 10, `${n} 個檔案`);
const pr = await p.evaluate(async () => { const t = window.__totd; t.UI.closeAll(); const t0 = t.W.run.time; Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const paused = t.W.paused; await new Promise((r) => setTimeout(r, 2000)); const dt = t.W.run.time - t0; Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await new Promise((r) => setTimeout(r, 500)); return { paused, dt, saved: !!t.Saves.slots[0]?.run }; });
ok('3D：切到背景自動暫停並存檔，時間不前進', pr.paused && pr.dt < 0.1 && pr.saved, JSON.stringify(pr));
await p.evaluate(() => window.__totd.UI.closeAll());
await p.waitForFunction(() => window.__totd.App.renderer.s3.tier !== 'balanced', null, { timeout: 30000 }).catch(() => {});
ok('持續低 fps 時自動降級畫質（雲端必然觸發）', await p.evaluate(() => window.__totd.App.renderer.s3.tier === 'perf'));
await ctx.setOffline(true); await p.reload(); await title();
await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.resumeRun(); t.UI.closeAll(); });
await inRoom().catch(() => {});
const off = await p.evaluate(() => { const s = window.__totd.App.renderer.s3; return { kind: window.__totd.App.renderer.kind, route: s.route, room: !!s.roomView }; });
ok('斷網重開：3D 啟動、讀檔、用快取的模型進房間', off.kind === '3d' && off.route === 'kaykit' && off.room, JSON.stringify(off));
await ctx.setOffline(false);
await p.evaluate(() => { const gl = window.__totd.App.renderer.s3.canvas.getContext('webgl2'); gl.getExtension('WEBGL_lose_context').loseContext(); });
await p.waitForTimeout(1500);
ok('GPU 遺失：提示並把設定改為 2D', await p.evaluate(() => window.__totd.Saves.settings.renderer === '2d' && [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes('切回 2D'))));
await p.goto(B); await title();
ok('重新開啟（不帶參數）改用 2D', await p.evaluate(() => window.__totd.App.renderer.kind === '2d'));
ok('過程中沒有程式錯誤', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
