import { chromium } from 'playwright-core'; import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__totd);
await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); });
await p.waitForTimeout(1500);
await p.evaluate(async () => { const t = window.__totd; const c = await import('/src/sim/combat.ts'); const fl = t.W.floor; const r = fl.rooms.find((x) => x.type === 'combat'); c.enterRoom(r.id, Object.keys(r.doors)[0]); });
await p.waitForTimeout(1500);
for (const k of process.argv.slice(2)) { const d = await p.evaluate((k) => window.__totd.App.game.textures.get(k).getSourceImage().toDataURL(), k); fs.writeFileSync(`/tmp/tex_${k}.png`, Buffer.from(d.split(',')[1], 'base64')); console.log('saved', k); }
await b.close();
