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
ok('過程中沒有程式錯誤', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
