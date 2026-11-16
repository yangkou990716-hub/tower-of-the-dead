// 選單與面板（DOM）。openSheet 是通用的對話面板；遠征中開啟時模擬會暫停。
import { W } from '../sim/state';
import { CLS, DIFF, WPN, KIND, RUNE, RELIC, EL_NAME, biomeOf, floorName } from '../sim/data';
import { takeItem, useFire, nextFloor, shardsEarned, weaponDmg } from '../sim/combat';
import { Saves, SLOT_COUNT, SAVE_VERSION } from '../platform/saves';
import { dbInfo } from '../platform/db';
import { PWA } from '../platform/pwa';
import { Snd } from '../platform/audio';
import { Input } from '../platform/input';
import { View } from '../platform/view';
import { Hud, drawMap, itemName, itemDesc, TYPE_COL, TYPE_NAME } from './hud';
import { drawHero } from '../view/art/hero';
import { icon } from './icons';
import { Haptics } from '../platform/haptics';
import { INTRO, TAGLINE, GOAL, TOTAL_FLOORS, keeperLine } from '../sim/story';

declare const __APP_VERSION__: string;
const ui = () => document.getElementById('ui')!;
const esc = (s: any) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtTime = (s: number) => { const m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? `${h} 小時 ${m % 60} 分` : `${m} 分 ${Math.floor(s % 60)} 秒`; };
const fmtDate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface Btn { label: string; cls?: string; act?: () => void | boolean | Promise<void | boolean>; disabled?: boolean; }
interface SheetOpt { title: string; sub?: string; body?: string; buttons?: Btn[]; wide?: boolean; clear?: boolean; closable?: boolean; onClose?: () => void; setup?: (root: HTMLElement, close: () => void) => void; }
const stack: { el: HTMLElement; o: SheetOpt; close: () => void }[] = [];
export const sheetOpen = () => stack.length > 0;
const syncPause = () => { W.paused = stack.length > 0; if (W.paused) Input.clear(); };

export function openSheet(o: SheetOpt) {
  const el = document.createElement('div'); el.className = 'scrim' + (o.clear ? ' clear' : '');
  el.innerHTML = `<section class="sheet${o.wide ? ' wide' : ''}" role="dialog" aria-label="${esc(o.title)}"><header><h2>${esc(o.title)}</h2>${o.sub ? `<p>${o.sub}</p>` : ''}</header><div class="body">${o.body || ''}</div><footer></footer></section>`;
  const foot = el.querySelector('footer')!;
  const close = () => { const i = stack.findIndex((s) => s.el === el); if (i < 0) return; stack.splice(i, 1); el.remove(); syncPause(); o.onClose?.(); };
  for (const b of o.buttons || []) {
    const bt = document.createElement('button'); bt.className = 'btn ' + (b.cls || ''); bt.textContent = b.label; bt.disabled = !!b.disabled;
    bt.onclick = async () => { Snd.init(); Snd.play('ui'); const r = b.act ? await b.act() : undefined; if (r !== false) close(); };
    foot.appendChild(bt);
  }
  if (!o.buttons?.length) foot.remove();
  if (o.closable !== false) el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  ui().appendChild(el); stack.push({ el, o, close }); syncPause(); View.dragScroll(el.querySelector('.body') as HTMLElement); o.setup?.(el, close);
  (foot.querySelector('.pri') as HTMLElement || foot.querySelector('button') as HTMLElement)?.focus?.();
  return close;
}
export function closeTop() { const t = stack[stack.length - 1]; if (t && t.o.closable !== false) { t.close(); return true; } return false; }
export function closeAll() { while (stack.length) stack[stack.length - 1].close(); }
const confirmSheet = (title: string, sub: string, yes: string, act: () => void, danger = false) => openSheet({ title, sub, buttons: [{ label: '取消' }, { label: yes, cls: danger ? 'dan' : 'pri', act }] });

// ================= 標題 =================
export interface Nav { slots(): void; enter(id: number): void; camp(): void; start(cls: string, diff: string): void; resume(): void; abandon(): void; toTitle(): void; }
let nav: Nav; export const setNav = (n: Nav) => { nav = n; };
let titleEl: HTMLElement | null = null;
export function showTitle() {
  hideTitle(); const el = document.createElement('div'); el.className = 'title'; titleEl = el;
  const store = dbInfo.backend === 'indexeddb' ? '' : dbInfo.backend === 'localstorage' ? '（存檔使用備援儲存）' : '（此環境無法保存進度）';
  const nb = (a: string, t: string, pri = false) => `<button${pri ? ' class="pri"' : ''} data-a="${a}">${icon('lantern')}${t}</button>`;
  el.innerHTML = `<h1>亡者之塔<small>無盡深界</small></h1><div class="tagline">${TAGLINE}</div><nav>${nb('go', '踏入塔中', true)}${nb('how', '操作說明')}${nb('set', '設定')}${PWA.installEvt ? nb('ins', '安裝到這台裝置') : ''}</nav>
  <div class="ver">版本 ${__APP_VERSION__}　存檔格式 ${SAVE_VERSION}<br>${PWA.offlineReady || PWA.standalone() ? '已可離線遊玩' : ''}${store}</div>${PWA.needRefresh ? '<div class="upd">有新版本可用<button class="btn sm pri" data-a="upd">更新</button></div>' : ''}`;
  el.addEventListener('click', (e) => { const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a'); if (!a) return; Snd.init(); Snd.play('ui');
    if (a === 'go') nav.slots(); else if (a === 'how') howTo(); else if (a === 'set') settings(); else if (a === 'ins') PWA.install(); else if (a === 'upd') PWA.update?.(true); });
  ui().appendChild(el);
}
export function hideTitle() { titleEl?.remove(); titleEl = null; }
export const titleShown = () => !!titleEl;

// ================= 存檔欄 =================
export function slotsSheet() {
  const row = (i: number) => { const s = Saves.slots[i - 1], err = Saves.errors[i];
    if (err) return `<div class="slot-row">${icon('skull')}<div><h4>旅途 ${i}</h4><p class="bad-t">無法讀取：${esc(err)}</p></div><div class="acts"><button class="btn sm dan" data-del="${i}">刪除</button></div></div>`;
    if (!s) return `<div class="slot-row">${icon('lantern')}<div><h4>旅途 ${i}</h4><p>尚未開始</p></div><div class="acts"><button class="btn sm" data-imp="${i}">匯入</button><button class="btn sm pri" data-new="${i}">開始</button></div></div>`;
    const m = s.meta; return `<div class="slot-row cur">${icon('lantern')}<div><h4>${esc(s.name)}</h4><p>最深到達 ${m.stats.bestFloor ? floorName(m.stats.bestFloor) : '尚無紀錄'}　魂晶 ${m.shards}　已遊玩 ${fmtTime(m.stats.playtime + (s.run?.time || 0))}</p><p>${s.run ? `<span class="gold-t">遠征中：${CLS[s.run.cls]?.n || ''}，${floorName(s.run.floor)}</span>　` : ''}最後存檔 ${fmtDate(s.updated)}</p></div>
      <div class="acts"><button class="btn sm" data-exp="${i}">匯出</button><button class="btn sm" data-imp="${i}">匯入</button><button class="btn sm dan" data-del="${i}">刪除</button><button class="btn sm pri" data-go="${i}">進入</button></div></div>`; };
  let html = ''; for (let i = 1; i <= SLOT_COUNT; i++) html += row(i);
  openSheet({ title: '選擇旅途', sub: '三段各自獨立的旅途。進度自動保存在這台裝置上。', body: html, wide: true, buttons: [{ label: '返回' }],
    setup: (root, close) => root.addEventListener('click', async (e) => { const t = (e.target as HTMLElement).closest('button'); if (!t) return; const g = (k: string) => Number(t.getAttribute(k));
      if (t.hasAttribute('data-go') || t.hasAttribute('data-new')) { close(); nav.enter(g('data-go') || g('data-new')); }
      else if (t.hasAttribute('data-exp')) exportSheet(g('data-exp'));
      else if (t.hasAttribute('data-imp')) importSheet(g('data-imp'), () => { close(); slotsSheet(); });
      else if (t.hasAttribute('data-del')) confirmSheet('刪除旅途 ' + g('data-del'), '這段旅途的所有進度會永久消失，無法復原。建議先匯出備份。', '永久刪除', async () => { await Saves.remove(g('data-del')); close(); slotsSheet(); }, true); }) });
}
function exportSheet(id: number) {
  const s = Saves.slots[id - 1]; if (!s) return; const text = Saves.exportText(s), name = `tower-save-${id}-${new Date().toISOString().slice(0, 10)}.json`;
  openSheet({ title: '匯出存檔', sub: '把這份文字或檔案保存在別處，之後可以在任何裝置匯入。', body: `<textarea class="io" readonly>${esc(text)}</textarea><p class="note" id="expmsg"></p>`,
    buttons: [{ label: '關閉' }, { label: '複製文字', act: async () => { const ta = document.querySelector('textarea.io') as HTMLTextAreaElement; try { await navigator.clipboard.writeText(text); msg('已複製到剪貼簿'); } catch { ta.select(); try { document.execCommand('copy'); msg('已複製到剪貼簿'); } catch { msg('請長按文字框手動複製'); } } return false; } },
      { label: '儲存檔案', cls: 'pri', act: async () => { try { const file = new File([text], name, { type: 'application/json' }); const nv: any = navigator;
          if (nv.canShare?.({ files: [file] }) && PWA.isIOS()) { await nv.share({ files: [file], title: '亡者之塔存檔' }); msg('已交給系統分享選單'); }
          else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); msg('已下載 ' + name); } } catch { msg('這個環境無法下載檔案，請改用「複製文字」'); } return false; } }] });
  const msg = (m: string) => { const e = document.getElementById('expmsg'); if (e) e.textContent = m; };
}
function importSheet(id: number, done: () => void) {
  const had = !!Saves.slots[id - 1];
  openSheet({ title: '匯入存檔', sub: `匯入到「旅途 ${id}」${had ? '，<span class="bad-t">會覆蓋這一欄現有的進度</span>' : ''}。`, body: `<p><input type="file" id="impfile" accept=".json,application/json,text/plain"></p><p class="note">或直接貼上匯出的文字：</p><textarea class="io" id="imptext" placeholder="貼上存檔文字"></textarea><p class="bad-t" id="impmsg"></p>`,
    buttons: [{ label: '取消' }, { label: had ? '覆蓋並匯入' : '匯入', cls: 'pri', act: async () => { const ta = document.getElementById('imptext') as HTMLTextAreaElement, f = (document.getElementById('impfile') as HTMLInputElement).files?.[0];
        try { const text = f ? await f.text() : ta.value.trim(); if (!text) throw new Error('請選擇檔案或貼上文字。'); await Saves.importInto(text, id); Hud.toast('匯入完成', 'good'); done(); } catch (e: any) { document.getElementById('impmsg')!.textContent = e.message || String(e); return false; } } }] });
}

// ================= 序章 =================
/** 播放序章（每頁淡入）；點擊翻頁，略過或看完後呼叫 done。會放進面板堆疊，closeAll 也能關掉。 */
export function storySheet(done: () => void) {
  const el = document.createElement('div'); el.className = 'story'; let pg = 0, ended = false;
  const close = () => { const i = stack.findIndex((x) => x.el === el); if (i < 0) return; stack.splice(i, 1); el.remove(); syncPause(); };
  const finish = () => { if (ended) return; ended = true; close(); done(); };
  const render = () => { const lines = INTRO[pg];
    el.innerHTML = `${icon('lantern', 'lamp')}${lines.map((l, j) => `<p style="animation-delay:${j * 0.7}s">${esc(l) || '&nbsp;'}</p>`).join('')}
      <div class="nav"><span class="dots">${INTRO.map((_, j) => `<i class="${j <= pg ? 'on' : ''}"></i>`).join('')}</span><span>${pg < INTRO.length - 1 ? '點一下繼續' : '點一下出發'}</span></div><button type="button" class="skip">略過</button>`; };
  el.addEventListener('click', (e) => { Snd.init(); if ((e.target as HTMLElement).closest('.skip')) return finish(); Snd.play('ui'); if (++pg >= INTRO.length) finish(); else render(); });
  render(); ui().appendChild(el); stack.push({ el, o: { title: '序章', closable: false }, close }); syncPause();
}

// ================= 營地（之後的批次會擴充成可走動的據點）=================
export function campSheet() {
  const s = Saves.cur!, m = s.meta, run = s.run;
  openSheet({ title: '燈火營地', sub: '塔外唯一還亮著的地方。', closable: false,
    body: `<div class="quote">${esc(keeperLine(m))}<cite>—— 守燈人</cite></div>
      <div class="goal">${icon('flame')}<div>${GOAL}<div class="prog"><i style="width:${Math.round(Math.min(1, m.stats.bestFloor / TOTAL_FLOORS) * 100)}%"></i></div><small class="note">最深 ${m.stats.bestFloor} / ${TOTAL_FLOORS} 層</small></div></div>
      <div class="kv"><span>魂晶</span><b>${m.shards}</b></div><div class="kv"><span>最深到達</span><b>${m.stats.bestFloor ? floorName(m.stats.bestFloor) : '尚無紀錄'}</b></div><div class="kv"><span>遠征次數</span><b>${m.stats.runs}</b></div><div class="kv"><span>擊敗頭目</span><b>${m.stats.bosses}</b></div>
      ${run ? `<p class="gold-t" style="margin-top:.8em">有一趟未完的遠征：${CLS[run.cls].n}，${biomeOf(run.floor).n} ${floorName(run.floor)}。</p>` : ''}`,
    buttons: [{ label: '回到標題', act: () => nav.toTitle() }, ...(run ? [{ label: '放棄這趟遠征', cls: 'dan', act: () => { confirmSheet('放棄遠征', '這趟遠征會直接結算，已取得的魂晶仍會保留。', '放棄', () => { closeAll(); nav.abandon(); }, true); return false; } }, { label: '繼續遠征', cls: 'pri', act: () => nav.resume() }] : [{ label: '出發遠征', cls: 'pri', act: () => { classSheet(); } }])] });
}
export function classSheet() {
  const m = Saves.cur!.meta; let sel = Object.keys(CLS).find((c) => m.cls[c]) || 'knight', diff = Saves.settings.diff;
  const body = `<div class="classes">${Object.entries(CLS).map(([id, c]: any) => `<button class="cls${m.cls[id] ? '' : ' lock'}" data-c="${id}">${m.cls[id] ? '' : `<span class="lk">${icon('lock')}</span>`}<canvas width="120" height="144"></canvas><b>${c.n}</b><small>${m.cls[id] ? '已解鎖' : `需要 ${c.cost} 魂晶`}</small></button>`).join('')}</div><div class="clsinfo"></div>
    <div class="field"><span>難度</span><span class="seg">${Object.entries(DIFF).map(([id, d]: any) => `<button data-d="${id}">${d.n}</button>`).join('')}</span></div><p class="note" id="diffd"></p>`;
  openSheet({ title: '選擇職業', wide: true, body, buttons: [{ label: '返回', act: () => campSheet() }, { label: '解鎖', act: () => { const c = CLS[sel]; if (!m.cls[sel] && m.shards >= c.cost) { m.shards -= c.cost; m.cls[sel] = 1; Saves.queue(); Snd.play('pick'); classSheet(); } else return false; } }, { label: '出發', cls: 'pri', act: () => { if (!m.cls[sel]) return false; Saves.settings.diff = diff; Saves.saveSettings(); nav.start(sel, diff); } }],
    setup: (root) => {
      root.querySelectorAll<HTMLCanvasElement>('.cls canvas').forEach((cv) => { const x = cv.getContext('2d')!; x.translate(60, 118); x.scale(2.9, 2.9); drawHero(x, cv.parentElement!.getAttribute('data-c')!, 0, false); });
      const info = root.querySelector('.clsinfo') as HTMLElement, btns = root.querySelectorAll<HTMLButtonElement>('footer .btn'), dd = root.querySelector('#diffd') as HTMLElement;
      const upd = () => { const c = CLS[sel], w = WPN[c.wpn], own = !!m.cls[sel];
        root.querySelectorAll('.cls').forEach((e) => e.classList.toggle('sel', e.getAttribute('data-c') === sel)); root.querySelectorAll('.seg button').forEach((e) => e.classList.toggle('on', e.getAttribute('data-d') === diff));
        info.innerHTML = `<p>${c.d}</p><div class="kv"><span>生命 / 體力 / 速度</span><b>${c.hp} / ${c.sta} / ${c.spd}</b></div><div class="kv"><span>起始武器</span><b>${w.n}（${KIND[w.k].n}）</b></div><div class="kv"><span>${c.sk[0].n}</span><span>${c.sk[0].d}</span></div><div class="kv"><span>${c.sk[1].n}</span><span>${c.sk[1].d}</span></div>`;
        btns[1].hidden = own; btns[1].disabled = m.shards < c.cost; btns[1].textContent = `解鎖（${c.cost} 魂晶，持有 ${m.shards}）`; btns[2].disabled = !own; dd.textContent = DIFF[diff].d; };
      root.addEventListener('click', (e) => { const t = e.target as HTMLElement, c = t.closest('[data-c]'), d = t.closest('[data-d]'); if (c) { sel = c.getAttribute('data-c')!; Snd.play('ui'); upd(); } if (d) { diff = d.getAttribute('data-d')!; Snd.play('ui'); upd(); } });
      upd();
    } });
}

// ================= 遠征中的面板 =================
function itemBlock(it: any, label = '') {
  const tag = it.kind === 'wpn' ? KIND[WPN[it.id].k].n : it.kind === 'rune' ? '符文' : '遺物'; let extra = '';
  if (it.kind === 'wpn') { const w = WPN[it.id], k = KIND[w.k]; extra = `<p>傷害 ${Math.round(w.dmg * (1 + 0.15 * W.run!.wpn.lv))}　${k.proj ? '遠程' : `範圍 ${k.rng}`}　出手間隔 ${k.cd} 秒${w.el ? `　附加${EL_NAME[w.el]}` : ''}</p>`; }
  const ic = it.kind === 'wpn' ? 'sword' : it.kind === 'rune' ? 'rune' : 'gem';
  return `<div class="item"><div class="ico">${icon(ic)}</div><div><b>${itemName(it)}</b><span class="tagk">${tag}</span>${label ? `　<span class="note">${label}</span>` : ''}</div><p>${itemDesc(it)}</p>${extra}</div>`;
}
export function itemSheet(o: any) {
  const it = o.it, run = W.run!, S = W.ST;
  if (it.kind === 'wpn') openSheet({ title: '武器', clear: true, body: itemBlock({ kind: 'wpn', id: run.wpn.id }, '目前持有' + (run.wpn.lv ? `（強化 +${run.wpn.lv}）` : '')) + itemBlock(it, '地上的'), buttons: [{ label: '不換' }, { label: '換上這把', cls: 'pri', act: () => { takeItem(o); } }] });
  else if (it.kind === 'relic') openSheet({ title: '遺物', clear: true, body: itemBlock(it), buttons: [{ label: '留在原地' }, { label: '帶走', cls: 'pri', act: () => { takeItem(o); } }] });
  else if (run.runes.length < S.slots) openSheet({ title: '符文', clear: true, sub: `武器符文槽 ${run.runes.length} / ${S.slots}`, body: itemBlock(it), buttons: [{ label: '留在原地' }, { label: '嵌入武器', cls: 'pri', act: () => { takeItem(o); } }] });
  else openSheet({ title: '符文槽已滿', clear: true, sub: '選一枚換下來，或留在原地。', body: itemBlock(it, '地上的') + run.runes.map((id, i) => `<div class="item"><div class="ico">${icon('rune')}</div><div><b>${RUNE[id].n}</b>　<button class="btn sm" data-rep="${i}">換掉這枚</button></div><p>${RUNE[id].d}</p></div>`).join(''), buttons: [{ label: '留在原地' }],
    setup: (root, close) => root.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest('[data-rep]'); if (t) { takeItem(o, Number(t.getAttribute('data-rep'))); close(); } }) });
}
export function fireSheet(o: any) {
  const run = W.run!, S = W.ST, w = WPN[run.wpn.id];
  openSheet({ title: '營火', clear: true, sub: '火只夠做一件事。', body: `<div class="item"><div class="ico">${icon('heart')}</div><div><b>休息</b></div><p>回復 ${Math.round(S.maxHp * 0.5)} 點生命，並把藥水補滿（目前 ${run.potions} / ${S.potMax}）。</p></div><div class="item"><div class="ico">${icon('flame')}</div><div><b>磨利武器</b></div><p>${w.n} 強化 +${run.wpn.lv} → +${run.wpn.lv + 1}，傷害 ${Math.round(weaponDmg())} → ${Math.round(weaponDmg() / (1 + 0.15 * run.wpn.lv) * (1 + 0.15 * (run.wpn.lv + 1)))}。強化會跟著你，換武器也保留。</p></div>`,
    buttons: [{ label: '先不用' }, { label: '磨利武器', act: () => { useFire(o, 'forge'); } }, { label: '休息', cls: 'pri', act: () => { useFire(o, 'rest'); } }] });
}
export function stairsSheet() {
  const run = W.run!, left = W.floor.rooms.filter((r: any) => !run.rooms[r.id]?.v).length, nb = biomeOf(run.floor + 1);
  openSheet({ title: '走下階梯', clear: true, sub: `前往 ${nb.n} ${floorName(run.floor + 1)}。${left ? `這一層還有 <b class="gold-t">${left}</b> 個房間沒去過，下去之後無法回頭。` : '這一層已經全部探索過。'}`, buttons: [{ label: '再逛逛' }, { label: '下去', cls: 'pri', act: () => { nextFloor(); } }] });
}
export function pauseSheet() {
  const run = W.run!;
  openSheet({ title: '暫停', sub: `${CLS[run.cls].n}　${biomeOf(run.floor).n} ${floorName(run.floor)}　已進行 ${fmtTime(run.time)}`, buttons: [{ label: '回到營地', act: () => { confirmSheet('回到營地', '進度會保存，下次可以從這個房間繼續（房內的敵人會重新出現）。', '保存並離開', () => { closeAll(); nav.camp(); }); return false; } },
    { label: '行囊', act: () => { bagSheet(); return false; } }, { label: '操作說明', act: () => { howTo(); return false; } }, { label: '設定', act: () => { settings(); return false; } }, { label: '繼續', cls: 'pri' }] });
}
export function bagSheet() {
  const run = W.run!, S = W.ST;
  const stat = `<div class="kv"><span>生命上限</span><b>${S.maxHp}</b></div><div class="kv"><span>傷害倍率</span><b>${Math.round(S.dmg * 100)}%</b></div><div class="kv"><span>暴擊率 / 暴擊傷害</span><b>${Math.round(S.crit * 100)}% / ${Math.round(S.critMult * 100)}%</b></div><div class="kv"><span>減傷</span><b>${Math.round(S.armor * 100)}%</b></div>`;
  openSheet({ title: '行囊', wide: true, body: `<h3>武器</h3>${itemBlock({ kind: 'wpn', id: run.wpn.id }, run.wpn.lv ? `強化 +${run.wpn.lv}` : '')}<h3>符文　${run.runes.length} / ${S.slots}</h3>${run.runes.map((id) => itemBlock({ kind: 'rune', id })).join('') || '<p class="note">還沒有符文。</p>'}<h3>遺物　${run.relics.length}</h3>${run.relics.map((id) => itemBlock({ kind: 'relic', id })).join('') || '<p class="note">還沒有遺物。</p>'}<h3>能力</h3>${stat}`, buttons: [{ label: '關閉', cls: 'pri' }] });
}
export function mapSheet() {
  const run = W.run!, types = [...new Set<string>(W.floor.rooms.map((r: any) => r.type))].filter((t) => TYPE_COL[t]);
  openSheet({ title: `${biomeOf(run.floor).n}　${floorName(run.floor)}`, body: `<canvas id="bigmap" width="700" height="500"></canvas><div class="legend"><span><i style="background:#f3b95f"></i>你在這裡</span><span><i style="background:rgba(224,98,79,.6)"></i>尚未淨空</span>${types.map((t) => `<span><i style="background:${TYPE_COL[t]};transform:rotate(45deg) scale(.7)"></i>${TYPE_NAME[t]}</span>`).join('')}</div>`, buttons: [{ label: '關閉', cls: 'pri' }], setup: (root) => drawMap(root.querySelector('#bigmap') as HTMLCanvasElement) });
}
export function resultSheet(ev: any, onDone: () => void) {
  const run = W.run!, dead = ev.kind === 'dead';
  openSheet({ title: dead ? '燈熄了' : '遠征結束', closable: false, sub: dead ? `你倒在 ${biomeOf(run.floor).n} ${floorName(run.floor)}。` : `你從 ${biomeOf(run.floor).n} ${floorName(run.floor)} 平安歸來。`,
    body: `<div class="kv"><span>到達</span><b>${floorName(run.floor)}</b></div><div class="kv"><span>歷時</span><b>${fmtTime(run.time)}</b></div><div class="kv"><span>擊殺</span><b>${run.kills}</b></div><div class="kv"><span>擊敗頭目 / 菁英</span><b>${run.stats.boss} / ${run.stats.elite}</b></div><div class="kv"><span>精準閃避 / 彈反</span><b>${run.stats.pd} / ${run.stats.parry}</b></div><div class="kv"><span>被擊中</span><b>${run.stats.hit} 次</b></div><div class="kv"><span>帶回魂晶</span><b class="gold-t">+${ev.shards}</b></div>`,
    buttons: [{ label: '回到營地', cls: 'pri', act: onDone }] });
}

// ================= 設定與說明 =================
export function settings() {
  const s = Saves.settings;
  openSheet({ title: '設定', body: `<div class="field"><span>音效音量</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></div>
    <div class="field"><span>畫面震動</span><span class="seg" data-k="shake"><button data-v="1">開</button><button data-v="0">關</button></span></div>
    <div class="field"><span>畫質</span><span class="seg" data-k="quality"><button data-v="high">高</button><button data-v="low">省電</button></span></div>
    <div class="field"><span>觸控按鈕大小</span><input type="range" min="0.8" max="1.3" step="0.05" value="${s.btnScale}" data-k="btnScale"></div>
    <div class="field"><span>觸控輔助瞄準</span><span class="seg" data-k="aimAssist"><button data-v="1">開</button><button data-v="0">關</button></span></div>
    <div class="field"><span>觸覺回饋</span><span class="seg" data-k="haptics"><button data-v="1">開</button><button data-v="0">關</button></span></div>
    <div class="field"><span>操作提示</span><span class="seg" data-k="hints"><button data-v="1">開</button><button data-v="0">關</button></span></div>
    <p class="note">${Haptics.supported ? '觸覺回饋在 Android 與手把上有效；較新的 iOS 可能沒有反應。' : '這台裝置不支援觸覺回饋。'}操作提示是畫面上的按鍵說明。</p>
    <p class="note">省電畫質會關閉環境粒子並把畫面更新率降到每秒 30 幀，適合想省電或裝置發燙時使用。</p>
    <p class="note">存檔位置：${dbInfo.backend === 'indexeddb' ? '這台裝置的瀏覽器資料庫（IndexedDB）' : dbInfo.backend === 'localstorage' ? '備援儲存（localStorage）' : '僅記憶體，關閉後會消失'}${dbInfo.persisted ? '，已標記為不自動清除' : ''}。存檔的匯出與匯入在「踏入塔中」的旅途清單裡。</p>`,
    buttons: [{ label: '完成', cls: 'pri' }], onClose: () => { Saves.saveSettings(); applySettings(); },
    setup: (root) => { const upd = () => root.querySelectorAll<HTMLElement>('.seg').forEach((sg) => { const k = sg.getAttribute('data-k')!, v = (s as any)[k]; sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === String(typeof v === 'boolean' ? (v ? 1 : 0) : v))); });
      root.addEventListener('input', (e) => { const t = e.target as HTMLInputElement, k = t.getAttribute('data-k'); if (k) { (s as any)[k] = Number(t.value); applySettings(); if (k === 'sfx') Snd.play('coin'); } });
      root.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.seg button'); if (!b) return; const k = b.parentElement!.getAttribute('data-k')!, v = b.getAttribute('data-v')!; (s as any)[k] = k === 'quality' ? v : v === '1'; Snd.play('ui'); upd(); applySettings(); }); upd(); } });
}
export let onApplySettings = () => {}; export const setApply = (f: () => void) => { onApplySettings = f; };
export function applySettings() { const s = Saves.settings; Snd.setVol(s.sfx); Haptics.set(s.haptics); W.assistOn = s.aimAssist; document.documentElement.style.setProperty('--bs', String(s.btnScale)); onApplySettings(); }
export function howTo() {
  const touch = Input.touch;
  const keys = touch ? [['左半邊螢幕', '拖曳移動'], [icon('sword'), '點一下攻擊（自動瞄準最近的敵人）；按住蓄力、放開重擊；按住時拖曳可手動瞄準'], [icon('dash'), '朝移動方向閃避'], [icon('shield'), '彈反'], ['技能鍵', '職業技能'], [icon('potion'), '喝藥水'], [icon('bag') + icon('map') + icon('pause'), '行囊、地圖、暫停']]
    : [['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', '移動'], [icon('mouse'), '瞄準'], [icon('mouseL'), '輕攻擊；按住蓄力，放開重擊'], ['<kbd>空白鍵</kbd>', '朝移動方向閃避'], [icon('mouseR') + '<kbd>Shift</kbd>', '彈反'], ['<kbd>Q</kbd><kbd>E</kbd>', '職業技能'], ['<kbd>R</kbd>', '喝藥水'], ['<kbd>F</kbd>', '互動'], ['<kbd>M</kbd><kbd>Tab</kbd><kbd>Esc</kbd>', '地圖、行囊、暫停']];
  openSheet({ title: '操作說明', wide: true, body: `<div class="keys">${keys.map(([k, d]) => `<span>${k}</span><span>${d}</span>`).join('')}</div>
    <h3>在塔裡活下來</h3>
    <p><b class="gold-t">體力</b>是一切。攻擊、閃避、彈反都會消耗體力；見底時什麼都做不了，還要更久才開始回復。</p>
    <p><b class="gold-t">看顏色。</b>敵人出招前地上會亮起範圍：<span style="color:#ffc24a">黃色</span>的攻擊可以彈反，<span style="color:#ff5548">紅色</span>的只能閃開。</p>
    <p><b class="gold-t">精準閃避。</b>在攻擊命中的前一瞬間閃避，時間會變慢，下一擊必定暴擊，還會回復體力。</p>
    <p><b class="gold-t">彈反。</b>在黃色攻擊命中的瞬間按下，敵人會失衡，失衡中受到的傷害大幅提高。飛來的彈丸也能彈回去。按太早會露出破綻。</p>
    <p><b class="gold-t">重擊</b>會打斷大多數敵人，也能擊破盾牌。</p>
    <p class="note">房間淨空後門才會打開。每層有一處營火、一個寶箱；第三層的盡頭有頭目。</p>`, buttons: [{ label: '知道了', cls: 'pri' }] });
}
/** 首次啟動或回到前景時的提示 */
export function infoSheet(title: string, html: string) { openSheet({ title, body: html, buttons: [{ label: '好', cls: 'pri' }] }); }
export function installHint() {
  if (PWA.standalone()) return;
  if (PWA.isIOS()) infoSheet('加入主畫面', `<p>在 Safari 點下方的<b class="gold-t">分享</b>按鈕，選擇<b class="gold-t">加入主畫面</b>。</p><p>之後從主畫面的圖示開啟，就會以全螢幕 App 的形式執行，不需要網路也能玩，存檔也比較不會被系統清除。</p>`);
}
