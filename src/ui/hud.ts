// 抬頭顯示（DOM）：生命、體力、藥水、金幣、小地圖、Boss 血條、提示、觸控按鈕狀態、畫面後製。
import { W } from '../sim/state';
import { CLS, WPN, RUNE, RELIC, floorName, biomeOf } from '../sim/data';
import { clamp, Mf } from '../sim/util';
import { Input } from '../platform/input';
import { Saves } from '../platform/saves';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let els: any = null, last: any = {}, slowOn = false, hurtT = 0, bossE: any = null;
const set = (k: string, v: any, f: () => void) => { if (last[k] !== v) { last[k] = v; f(); } };

export const TYPE_COL: Record<string, string> = { boss: '#e0624f', exit: '#7dffd0', treasure: '#f3c95f', campfire: '#ff9a3d', elite: '#c79bff', shop: '#8cc8ff', altar: '#ff8fb0', event: '#b8e986', secret: '#ffffff' };
export const TYPE_NAME: Record<string, string> = { boss: '頭目', exit: '階梯', treasure: '寶箱', campfire: '營火', elite: '菁英', shop: '商店', altar: '祭壇', event: '事件', secret: '密室' };

/** 畫樓層地圖（小地圖與大地圖共用） */
export function drawMap(cv: HTMLCanvasElement) {
  const x = cv.getContext('2d')!, fl = W.floor, run = W.run; if (!fl || !run) return;
  const cw = cv.width / fl.gw, ch = cv.height / fl.gh, pad = cw * 0.14; x.clearRect(0, 0, cv.width, cv.height);
  const known = new Set<number>(), all = !!W.ST?.compass;
  for (const r of fl.rooms) if (run.rooms[r.id]?.v) { known.add(r.id); for (const d of Object.values<any>(r.doors)) known.add(d.to); }
  if (all) for (const r of fl.rooms) known.add(r.id);
  x.lineWidth = Math.max(2, cw * 0.09); x.strokeStyle = 'rgba(233,225,207,.3)';
  for (const r of fl.rooms) { if (!known.has(r.id)) continue; const cx = (r.gx + 0.5) * cw, cy = (r.gy + 0.5) * ch;
    for (const [dir, d] of Object.entries<any>(r.doors)) { if (!known.has(d.to) || d.to < r.id) continue; const o = fl.rooms[d.to]; x.beginPath(); x.moveTo(cx, cy); x.lineTo((o.gx + 0.5) * cw, (o.gy + 0.5) * ch); x.stroke(); } }
  for (const r of fl.rooms) { if (!known.has(r.id)) continue; const vis = !!run.rooms[r.id]?.v, cur = r.id === run.cur, px = r.gx * cw + pad, py = r.gy * ch + pad * 0.9, w = cw - pad * 2, h = ch - pad * 1.8;
    x.fillStyle = cur ? '#f3b95f' : vis ? (run.rooms[r.id].c || !['combat', 'elite', 'exit', 'boss'].includes(r.type) ? 'rgba(233,225,207,.5)' : 'rgba(224,98,79,.6)') : 'rgba(18,24,32,.9)';
    x.fillRect(px, py, w, h); if (!vis) { x.strokeStyle = 'rgba(233,225,207,.35)'; x.lineWidth = 1.5; x.strokeRect(px + 0.75, py + 0.75, w - 1.5, h - 1.5); }
    const col = TYPE_COL[r.type]; if (col && (vis || all)) { x.fillStyle = cur ? '#1a1206' : col; const s = Math.min(w, h) * 0.3; x.beginPath(); x.moveTo(px + w / 2, py + h / 2 - s); x.lineTo(px + w / 2 + s, py + h / 2); x.lineTo(px + w / 2, py + h / 2 + s); x.lineTo(px + w / 2 - s, py + h / 2); x.closePath(); x.fill(); } }
}

export const Hud = {
  init() {
    const h = $('#hud');
    els = { hud: h, hp: h.querySelector('.hp') as HTMLElement, hpi: h.querySelector('.hp i') as HTMLElement, hpb: h.querySelector('.hp b') as HTMLElement, hpt: h.querySelector('.hp span') as HTMLElement,
      sta: h.querySelector('.sta') as HTMLElement, stai: h.querySelector('.sta i') as HTMLElement, pots: h.querySelector('.pots') as HTMLElement, gold: h.querySelector('.gold b') as HTMLElement, fx: h.querySelector('.fx') as HTMLElement,
      where: h.querySelector('.where') as HTMLElement, mini: $('#mini') as HTMLCanvasElement, boss: h.querySelector('.boss') as HTMLElement, bossn: h.querySelector('.boss span') as HTMLElement, bossi: h.querySelector('.boss .bar i') as HTMLElement, bossb: h.querySelector('.boss .bar b') as HTMLElement,
      skills: h.querySelector('.skills') as HTMLElement, prompt: h.querySelector('.prompt') as HTMLElement, banner: h.querySelector('.banner') as HTMLElement, toasts: h.querySelector('.toasts') as HTMLElement,
      touch: $('#touch'), act: $('#touch .act'), tpot: $('#touch .potion b'), ts1: $('#touch .s1'), ts2: $('#touch .s2'),
      slow: $('#post .slow'), hurt: $('#post .hurt'), fade: $('#post .fade') };
  },
  show(v: boolean) { els.hud.hidden = !v; last = {}; if (!v) { els.touch.hidden = true; els.hurt.classList.remove('low'); els.slow.classList.remove('on'); } else this.setup(); },
  /** 進入遠征時建立與職業相關的固定元素 */
  setup() {
    const run = W.run; if (!run) return; const c = CLS[run.cls];
    els.skills.innerHTML = `<div class="sk1" data-i="0"><kbd>Q</kbd>${c.sk[0].n}<i></i></div><div class="sk1" data-i="1"><kbd>E</kbd>${c.sk[1].n}<i></i></div>`;
    (els.ts1.querySelector('span') as HTMLElement).textContent = c.sk[0].n.slice(0, 2); (els.ts2.querySelector('span') as HTMLElement).textContent = c.sk[1].n.slice(0, 2);
    this.where(); this.minimap();
  },
  where() { const run = W.run; if (run) els.where.textContent = `${biomeOf(run.floor).n}　${floorName(run.floor)}`; },
  minimap() { drawMap(els.mini); },
  toast(text: string, cls = '') { const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text; els.toasts.appendChild(t); while (els.toasts.children.length > 3) els.toasts.firstChild!.remove(); setTimeout(() => t.remove(), 1900); },
  banner(title: string, sub: string) { els.banner.hidden = true; void els.banner.offsetWidth; (els.banner.querySelector('b') as HTMLElement).textContent = title; (els.banner.querySelector('span') as HTMLElement).textContent = sub; els.banner.hidden = false; },
  boss(e: any) { bossE = e; els.boss.hidden = !e; if (e) els.bossn.textContent = e.d.n; },
  fade() { els.fade.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => els.fade.classList.remove('on'))); },
  hurt() { els.hurt.classList.add('on'); hurtT = 0.12; },
  staFlash() { els.sta.classList.remove('flash'); void els.sta.offsetWidth; els.sta.classList.add('flash'); },
  update(dt: number) {
    const run = W.run, p = W.p, S = W.ST; if (!run || !p || !S || els.hud.hidden) return;
    const hpf = clamp(run.hp / S.maxHp, 0, 1);
    set('hp', Math.round(hpf * 500), () => { els.hpi.style.transform = `scaleX(${hpf})`; els.hpb.style.transform = `scaleX(${hpf})`; });
    set('hpt', Math.ceil(run.hp) + '/' + S.maxHp + '/' + Math.round(p.shield), () => { els.hpt.textContent = `${Math.max(0, Math.ceil(run.hp))} / ${S.maxHp}` + (p.shield > 0 ? `　+${Math.round(p.shield)}` : ''); els.hp.classList.toggle('sh', p.shield > 0); });
    const sf = clamp(p.sta / S.maxSta, 0, 1); set('sta', Math.round(sf * 300), () => { els.stai.style.transform = `scaleX(${sf})`; }); set('stao', p.sta <= 0, () => els.sta.classList.toggle('out', p.sta <= 0));
    set('pots', run.potions + '/' + S.potMax, () => { let s = ''; for (let i = 0; i < S.potMax; i++) s += `<i class="${i < run.potions ? '' : 'e'}"></i>`; els.pots.innerHTML = s; els.tpot.textContent = String(run.potions); });
    set('gold', run.gold, () => { els.gold.textContent = String(run.gold); });
    const fx = (p.st.burn > 0 ? '<b style="color:#ff8a3d">灼燒</b>' : '') + (p.st.poison > 0 ? '<b style="color:#a4e86a">中毒</b>' : '') + (p.st.chill > 0 ? '<b style="color:#8fdcff">冰緩</b>' : '') + (p.buff.cry > 0 ? '<b style="color:#ffb86b">戰吼</b>' : '') + (p.buff.pd > 0 ? '<b style="color:#fff0b0">必暴</b>' : '') + (p.buff.smoke > 0 ? '<b style="color:#c9a0ff">隱身</b>' : '');
    set('fx', fx, () => { els.fx.innerHTML = fx; });
    // 技能冷卻
    const c = CLS[run.cls], touch = Input.touch;
    for (let i = 0; i < 2; i++) { const f = clamp(p.cds[i] / (c.sk[i].cd * S.cdr), 0, 1), k = Math.round(f * 40);
      set('cd' + i + touch, k, () => { if (touch) ((i ? els.ts2 : els.ts1).querySelector('i') as HTMLElement).style.height = f * 100 + '%'; else { const e = els.skills.children[i] as HTMLElement; if (e) { (e.querySelector('i') as HTMLElement).style.height = f * 100 + '%'; e.classList.toggle('cd', f > 0); } } }); }
    set('touch', touch, () => { els.touch.hidden = !touch; els.skills.hidden = touch; document.documentElement.style.setProperty('--bs', String(Saves.settings.btnScale)); });
    // 互動提示
    const n = W.near, label = !n || W.paused ? '' : n.k === 'chest' ? '打開寶箱' : n.k === 'fire' ? '在營火旁坐下' : n.k === 'stairs' ? '走下階梯' : n.k === 'item' ? itemName(n.it) : '';
    set('near' + touch, label, () => { if (touch) { els.prompt.hidden = true; els.act.hidden = !label; els.act.textContent = label.length > 6 ? '查看' : label || '互動'; } else { els.act.hidden = true; els.prompt.hidden = !label; els.prompt.innerHTML = label ? `<kbd>F</kbd>${label}` : ''; } });
    // Boss
    if (bossE) { if (bossE.dead || !W.ents.includes(bossE)) this.boss(null); else { const f = clamp(bossE.hp / bossE.mhp, 0, 1); set('boss', Math.round(f * 600), () => { els.bossi.style.transform = `scaleX(${f})`; els.bossb.style.transform = `scaleX(${f})`; }); } }
    // 後製
    const slow = W.slow > 0; if (slow !== slowOn) { slowOn = slow; els.slow.classList.toggle('on', slow); }
    if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) els.hurt.classList.remove('on'); }
    set('low', hpf < 0.3 && !p.dead, () => els.hurt.classList.toggle('low', hpf < 0.3 && !p.dead));
  },
};
export function itemName(it: any) { return it.kind === 'wpn' ? WPN[it.id].n : it.kind === 'rune' ? RUNE[it.id].n : RELIC[it.id].n; }
export function itemDesc(it: any) { return it.kind === 'wpn' ? WPN[it.id].d : it.kind === 'rune' ? RUNE[it.id].d : RELIC[it.id].d; }
