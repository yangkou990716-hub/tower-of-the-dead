// 用法：node test/shot.mjs <url-path> <out.png> [w] [h] [waitMs] [mobile]
import { chromium } from 'playwright-core';
const [, , path = '/', out = '/tmp/shot.png', w = '1280', h = '720', wait = '1500', mobile = ''] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173' + path);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close(); console.log('saved', out);
