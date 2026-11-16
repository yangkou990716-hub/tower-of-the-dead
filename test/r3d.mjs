// 3D 渲染器冒煙測試：?r=3d 啟動 → 進遠征 → 房間畫出來 → 鍵盤可移動 → 換房後仍正常。
// 用法：npm run build && npx vite preview --port 4173 &  然後  node test/r3d.mjs [截圖路徑]
import { chromium } from 'playwright-core';
const URL = (process.env.URL || 'http://localhost:4173/') + '?r=3d&api=webgl';
const shot = process.argv[2] || 'r3d.png';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 640 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GL Driver')) errs.push(m.text()); });
const ok = (n, c, x = '') => { console.log((c ? '✓ ' : '✗ ') + n + (x ? '  — ' + x : '')); if (!c) process.exitCode = 1; };
await p.goto(URL); await p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 30000 });
ok('3D 渲染器啟動', await p.evaluate(() => window.__totd.App.renderer.kind === '3d' && document.documentElement.dataset.renderer === '3d'));
await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); t.UI.closeAll(); });
await p.waitForFunction(() => { const r = window.__totd.App.renderer.s3; return r && r.roomView && !r.busy; }, null, { timeout: 120000 });
const info = await p.evaluate(() => { const s = window.__totd.App.renderer.s3; return { kids: s.scene.children.length, route: s.route, backend: s.backendName }; });
ok('進入房間並建出 3D 場景', info.kids > 5, JSON.stringify(info));
await p.mouse.move(900, 300);
const x0 = await p.evaluate(() => window.__totd.W.p.x);
await p.keyboard.down('KeyD'); await p.waitForTimeout(6000); await p.keyboard.up('KeyD');
const x1 = await p.evaluate(() => window.__totd.W.p.x);
ok('鍵盤可移動角色', x1 > x0 + 3, `x ${x0.toFixed(0)} → ${x1.toFixed(0)}`);
const aim = await p.evaluate(() => { const w = window.__totd.Input.toWorld(900, 300); return w; });
ok('滑鼠 → 地面交點在房間內', aim.x > 0 && aim.x < 27 * 40 && aim.y > 0 && aim.y < 15 * 40, JSON.stringify(aim));
await p.screenshot({ path: shot });
// 換房：把玩家放到有門的那一側門口，往門走
const dir = await p.evaluate(() => { const W = window.__totd.W, ds = Object.keys(W.room.def.doors); const d = ds[0]; const pos = { n: [13.5, 1.6], s: [13.5, 13.4], w: [1.6, 7.5], e: [25.4, 7.5] }[d]; W.p.x = pos[0] * 40; W.p.y = pos[1] * 40; return d; });
const key = { n: 'KeyW', s: 'KeyS', w: 'KeyA', e: 'KeyD' }[dir], cur0 = await p.evaluate(() => window.__totd.W.run.cur);
await p.keyboard.down(key); await p.waitForFunction((c) => window.__totd.W.run.cur !== c, cur0, { timeout: 60000 }).catch(() => {}); await p.keyboard.up(key);
const moved = await p.evaluate((c) => window.__totd.W.run.cur !== c, cur0);
await p.waitForFunction(() => { const r = window.__totd.App.renderer.s3; return r.curRoom === window.__totd.W.room && !r.busy; }, null, { timeout: 120000 }).catch(() => {});
const re = await p.evaluate(() => { const r = window.__totd.App.renderer.s3; return { ok: r.curRoom === window.__totd.W.room, n: r.trans.n, last: Math.round(r.trans.last) }; });
ok('走出房門 → 3D 重建新房間', moved && re.ok, JSON.stringify(re));
// 切回 2D：網址 ?r=2d 會記住設定，Phaser 正常啟動
await p.goto(URL.replace('?r=3d&api=webgl', '?r=2d')); await p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 30000 });
ok('?r=2d 切回 Phaser 2D', await p.evaluate(() => window.__totd.App.renderer.kind === '2d' && !!window.__totd.App.game && window.__totd.App.game.scene.isActive('title')));
await p.goto(URL.replace('?r=3d&api=webgl', '')); await p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 30000 });
ok('不帶參數時沿用上次的選擇（2D）', await p.evaluate(() => window.__totd.App.renderer.kind === '2d'));
ok('過程中沒有程式錯誤', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
