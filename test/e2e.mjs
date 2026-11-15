// 正式版端對端測試：安裝 Service Worker → 斷網 → 啟動、遊玩、存檔、讀檔、匯出匯入、舊存檔相容。
// 用法：npm run build && npx vite preview --port 4173 &  然後  node test/e2e.mjs
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:4173/';
const results = []; const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log((cond ? '✓ ' : '✗ ') + name + (extra ? '  — ' + extra : '')); };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function suite(label, ctxOpt, touch) {
  console.log('\n== ' + label + ' ==');
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GL Driver') && !m.text().includes('net::ERR_INTERNET_DISCONNECTED')) errs.push(m.text()); });
  const ready = () => p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 20000 });
  await p.goto(URL); await ready();
  // 1) Service Worker 安裝並接管
  const sw = await p.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; const r = await navigator.serviceWorker.ready; for (let i = 0; i < 100 && !(r.active && r.active.state === 'activated'); i++) await new Promise((s) => setTimeout(s, 100)); const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return r.active.state + ' / 快取 ' + n + ' 個檔案'; });
  ok('Service Worker 啟用並預先快取全部資源', /activated/.test(sw) && +sw.match(/(\d+) 個/)[1] >= 10, sw);
  // 2) 開始遊玩並存檔
  await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); });
  await p.waitForFunction(() => window.__totd.W.room && window.__totd.App.game.scene.isActive('game'), null, { timeout: 15000 }); await p.waitForTimeout(1200);
  const before = await p.evaluate(async () => { const t = window.__totd, W = t.W; W.run.gold = 321; W.run.relics.push('heart'); W.meta.shards = 55; t.App.save(true); await t.Saves._writing; return { seed: W.run.seed, floor: W.run.floor, cur: W.run.cur, gold: W.run.gold }; });
  ok('遠征中可寫入存檔', before.gold === 321);
  // 3) 斷網後重新啟動
  await ctx.setOffline(true); await p.reload(); let offlineBoot = true; try { await ready(); } catch { offlineBoot = false; }
  ok('斷網後仍可啟動（從快取載入）', offlineBoot);
  const fontOk = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('900 20px TowerSerif', '亡者之塔'); });
  ok('斷網時內建字型可用（未依賴 CDN）', fontOk);
  // 4) 斷網讀檔、接續遊玩、再存檔
  const after = await p.evaluate(async () => { const t = window.__totd; const s = t.Saves.slots[0]; if (!s || !s.run) return null; await t.App.enterSlot(1); t.UI.closeAll(); t.App.resumeRun(); const W = t.W; return { seed: W.run.seed, floor: W.run.floor, cur: W.run.cur, gold: W.run.gold, relic: W.run.relics.includes('heart'), shards: W.meta.shards }; });
  ok('斷網讀檔：進度與離開時一致', after && after.seed === before.seed && after.gold === 321 && after.relic && after.shards === 55 && after.cur === before.cur, JSON.stringify(after));
  await p.waitForFunction(() => window.__totd.App.game.scene.isActive('game'), null, { timeout: 15000 });
  // 實際操作輸入
  if (touch) { await p.touchscreen.tap(120, 300); await p.waitForTimeout(200); const shown = await p.evaluate(() => !document.getElementById('touch').hidden); ok('觸控後顯示虛擬搖桿與按鈕', shown);
    const x0 = await p.evaluate(() => window.__totd.W.p.x); const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 280, id: 1 }] }); for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + i * 8, y: 280, id: 1 }] }); await p.waitForTimeout(60); }
    await p.waitForTimeout(900); const x1 = await p.evaluate(() => window.__totd.W.p.x); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ok('左搖桿拖曳可移動角色', x1 > x0 + 3, `x ${x0.toFixed(0)} → ${x1.toFixed(0)}`);
    await p.locator('#touch .dodge').tap(); await p.waitForTimeout(150); ok('閃避鍵有反應', await p.evaluate(() => window.__totd.W.p.sta < window.__totd.W.ST.maxSta));
  } else { const x0 = await p.evaluate(() => window.__totd.W.p.x); await p.mouse.move(700, 300); await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD'); const x1 = await p.evaluate(() => window.__totd.W.p.x);
    ok('鍵盤可移動角色', x1 > x0 + 3, `x ${x0.toFixed(0)} → ${x1.toFixed(0)}`);
    await p.mouse.click(700, 300); await p.waitForTimeout(200); ok('滑鼠點擊可攻擊（消耗體力）', await p.evaluate(() => window.__totd.W.p.sta < window.__totd.W.ST.maxSta || window.__totd.W.p.atkCd > 0));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok('Esc 開啟暫停面板並暫停模擬', await p.evaluate(() => window.__totd.W.paused && !!document.querySelector('#ui .sheet'))); await p.keyboard.press('Escape'); }
  // 5) 切到背景：自動暫停＋存檔；回來不會暴衝
  const bg = await p.evaluate(async () => { const t = window.__totd; t.UI.closeAll(); const t0 = t.W.run.time; Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const paused = t.W.paused; await t.Saves._writing;
    await new Promise((r) => setTimeout(r, 1500)); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await new Promise((r) => setTimeout(r, 300)); return { paused, dt: t.W.run.time - t0, saved: !!t.Saves.slots[0].run }; });
  ok('切到背景時自動暫停並存檔，離開期間遊戲時間不前進', bg.paused && bg.dt < 0.2 && bg.saved, `背景 1.5 秒內遊戲時間 +${bg.dt.toFixed(2)} 秒`);
  // 6) 匯出 → 刪除 → 匯入
  const io = await p.evaluate(async () => { const t = window.__totd; t.UI.closeAll(); t.App.save(true); await t.Saves._writing; const text = t.Saves.exportText(t.Saves.slots[0]); const gold = t.Saves.slots[0].run.gold; t.App.toTitle(); await t.Saves.remove(1); const gone = !t.Saves.slots[0]; const s = await t.Saves.importInto(text, 2); await t.Saves.init(); return { gone, back: t.Saves.slots[1] && t.Saves.slots[1].run.gold === gold && t.Saves.slots[1].meta.shards === 55, len: text.length }; });
  ok('匯出、刪除、匯入到另一欄後資料一致', io.gone && io.back, `匯出 ${io.len} 字元`);
  // 7) 舊格式存檔（缺欄位、含已移除物品）在這一版可讀
  await p.evaluate(() => new Promise((res, rej) => { const rq = indexedDB.open('tower-of-the-dead'); rq.onsuccess = () => { const tx = rq.result.transaction('slots', 'readwrite'); tx.objectStore('slots').put({ id: 3, v: 1, created: 1, updated: 2, name: '舊版存檔', meta: { shards: 9, cls: { knight: 1 }, stats: { runs: 2 } }, run: { seed: 7, floor: 2, cls: 'knight', diff: 'normal', hp: 50, potions: 1, gold: 3, wpn: { id: 'removed-weapon', lv: 1 }, runes: ['gone'], relics: ['heart', 'gone'], time: 10, kills: 4, cur: 0, rooms: {}, stats: {}, flags: {} } }); tx.oncomplete = () => res(1); tx.onerror = () => rej(tx.error); }; }));
  await p.reload(); await ready();
  const old = await p.evaluate(async () => { const t = window.__totd; const s = t.Saves.slots[2]; if (!s) return { err: t.Saves.errors[3] }; await t.App.enterSlot(3); t.UI.closeAll(); t.App.resumeRun(); const W = t.W; return { shards: W.meta.shards, kills0: W.meta.stats.kills, floor: W.run.floor, wpn: W.run.wpn.id, relics: W.run.relics, room: !!W.room }; });
  ok('舊格式存檔可載入並自動修補', old.shards === 9 && old.kills0 === 0 && old.floor === 2 && old.wpn === 'iron' && old.relics.join() === 'heart' && old.room, JSON.stringify(old));
  await p.waitForTimeout(800);
  ok('過程中沒有任何程式錯誤', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.setOffline(false); await ctx.close();
}
await suite('Windows 桌面（Chromium 1366×768，滑鼠鍵盤）', { viewport: { width: 1366, height: 768 } }, false);
await suite('iPhone 橫向（模擬 844×390、DPR 3、觸控）', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, true);
// 直向鎖定的手機：畫面自動轉 90°，橫拿即可玩
{ console.log('\n== iPhone 直向鎖定（390×844，自動旋轉） ==');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL); await p.waitForFunction(() => window.__totd && window.__totd.App.state === 'title', null, { timeout: 20000 });
  const r = await p.evaluate(() => { const c = document.querySelector('#game canvas'); return { rot: document.documentElement.classList.contains('rot'), cw: c.width, ch: c.height }; });
  ok('直拿時整個畫面自動轉為橫向', r.rot && r.cw > r.ch, `畫布 ${r.cw}×${r.ch}`);
  await p.evaluate(async () => { const t = window.__totd; await t.App.enterSlot(1); t.UI.closeAll(); t.App.startRun('knight', 'normal'); }); await p.waitForFunction(() => window.__totd.App.game.scene.isActive('game')); await p.waitForTimeout(800);
  await p.touchscreen.tap(200, 420); await p.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(p), x0 = await p.evaluate(() => window.__totd.W.p.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 150, id: 1 }] }); for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 150 + i * 8, id: 1 }] }); await p.waitForTimeout(50); }
  await p.waitForTimeout(900); const x1 = await p.evaluate(() => window.__totd.W.p.x); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok('旋轉後搖桿方向正確（沿螢幕長邊拖 = 遊戲內左右）', x1 > x0 + 3, `x ${x0.toFixed(0)} → ${x1.toFixed(0)}`);
  ok('過程中沒有任何程式錯誤', errs.length === 0, errs.join(' | ')); await ctx.close(); }
await b.close();
const fail = results.filter((r) => !r.pass).length; console.log(`\n${results.length - fail}/${results.length} 通過`); process.exit(fail ? 1 : 0);
