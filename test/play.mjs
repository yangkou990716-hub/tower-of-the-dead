// 自動進入遊戲並截圖。用法：node test/play.mjs [mobile] [botSeconds] [outPrefix] [cls]
import { chromium } from 'playwright-core';
const mobile = process.argv[2] === 'mobile', secs = +(process.argv[3] || 0), out = process.argv[4] || '/tmp/play', cls = process.argv[5] || 'knight';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GL Driver')) { errs.push(t); console.log('[' + m.type() + ']', t); } });
p.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
await p.goto(process.env.URL || 'http://localhost:5173/');
await p.waitForFunction(() => window.__totd, null, { timeout: 15000 });
const click = async (text) => { const l = p.locator('button', { hasText: text }).last(); await l.waitFor({ timeout: 5000 }); if (mobile) await l.tap(); else await l.click(); await p.waitForTimeout(250); };
await click('踏入塔中'); await p.screenshot({ path: out + '_slots.png' });
await click('開始'); await p.waitForTimeout(300); await p.screenshot({ path: out + '_howto.png' });
await click('知道了'); await p.screenshot({ path: out + '_camp.png' });
await click('出發遠征'); await p.waitForTimeout(300);
if (cls !== 'knight') await p.evaluate((c) => { const t = window.__totd; t.Saves.cur.meta.cls[c] = 1; }, cls);
await p.screenshot({ path: out + '_class.png' });
if (cls !== 'knight') { await p.evaluate((c) => { const t = window.__totd; t.UI.closeAll(); t.App.startRun(c, 'normal'); }, cls); } else await click('出發');
await p.waitForTimeout(1800); await p.screenshot({ path: out + '_0.png' });
if (secs > 0) {
  await p.evaluate(async ({ god }) => {
    const { mkBot } = await import('/src/sim/bot.ts'); const t = window.__totd; const bot = mkBot(0.75, { headless: false });
    t.Input.build = () => { const I = bot(1 / 60); return I; };
    // 面板由機器人直接處理
    setInterval(() => { const btn = [...document.querySelectorAll('#ui .sheet footer .btn.pri')].pop(); if (btn && !t.W.over) btn.click(); }, 400);
    window.__turbo = +(new URLSearchParams(location.search).get('turbo') || 6);
    if (god) setInterval(() => { if (t.W.run) t.W.run.hp = t.W.ST.maxHp; }, 200);
  }, { god: !!process.env.GOD });
  const n = Math.max(1, Math.floor(secs / 4));
  for (let i = 1; i <= n; i++) { await p.waitForTimeout((secs * 1000) / n); await p.screenshot({ path: `${out}_${i}.png` }); const st = await p.evaluate(() => { const W = window.__totd.W; return W.run ? `fl=${W.run.floor} room=${W.run.cur}(${W.room.type}) hp=${Math.round(W.run.hp)} kills=${W.run.kills} over=${W.over}` : 'no run'; }); console.log(i, st); }
}
const fps = await p.evaluate(() => Math.round(window.__totd.App.game.loop.actualFps));
console.log('fps', fps, 'errors', errs.length);
await b.close();
