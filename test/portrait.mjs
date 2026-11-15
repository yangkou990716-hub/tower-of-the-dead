import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(process.env.URL || 'http://localhost:5173/'); await p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title');
await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/p_title.png' });
await p.locator('button', { hasText: '踏入塔中' }).tap(); await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/p_slots.png' });
await p.evaluate(async () => { const t = window.__totd; t.UI.closeAll(); await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); });
await p.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(p); const pos = () => p.evaluate(() => ({ x: window.__totd.W.p.x, y: window.__totd.W.p.y, rot: document.documentElement.classList.contains('rot') }));
const a = await pos();
// 遊戲畫面左下 = 直立螢幕的左上。往「螢幕下方」拖 = 遊戲畫面往右
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 150, id: 1 }] });
for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 150 + i * 8, id: 1 }] }); await p.waitForTimeout(50); }
await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/p_game.png' }); const c = await pos();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
console.log('rot', c.rot, 'dx', (c.x - a.x).toFixed(1), 'dy', (c.y - a.y).toFixed(1));
await b.close();
