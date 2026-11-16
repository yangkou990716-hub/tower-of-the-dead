// 抬頭顯示（DOM）：生命、體力、藥水、金幣、小地圖、Boss 血條、快捷列、觸控按鈕狀態、畫面後製。
import { W } from '../sim/state';
import { CLS, WPN, RUNE, RELIC, floorName, biomeOf } from '../sim/data';
import { clamp } from '../sim/util';
import { Input } from '../platform/input';
import { Saves } from '../platform/saves';
import { icon } from './icons';
import { drawHero } from '../view/art/hero';

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
  x.lineWidth = Math.max(2, cw * 0.09); x.strokeStyle = 'rgba(241,232,212,.3)'; x.lineCap = 'round';
  for (const r of fl.rooms) { if (!known.has(r.id)) continue; const cx = (r.gx + 0.5) * cw, cy = (r.gy + 0.5) * ch;
    for (const d of Object.values<any>(r.doors)) { if (!known.has(d.to) || d.to < r.id) continue; const o = fl.rooms[d.to]; x.beginPath(); x.moveTo(cx, cy); x.lineTo((o.gx + 0.5) * cw, (o.gy + 0.5) * ch); x.stroke(); } }
  for (const r of fl.rooms) { if (!known.has(r.id)) continue; const vis = !!run.rooms[r.id]?.v, cur = r.id === run.cur, px = r.gx * cw + pad, py = r.gy * ch + pad * 0.9, w = cw - pad * 2, h = ch - pad * 1.8, rad = Math.min(w, h) * 0.22;
    x.fillStyle = cur ? '#f2b65a' : vis ? (run.rooms[r.id].c || !['combat', 'elite', 'exit', 'boss'].includes(r.type) ? 'rgba(241,232,212,.5)' : 'rgba(222,90,69,.65)') : 'rgba(20,26,34,.92)';
    x.beginPath(); (x as any).roundRect(px, py, w, h, rad); x.fill(); if (!vis) { x.strokeStyle = 'rgba(241,232,212,.38)'; x.lineWidth = 1.5; x.stroke(); }
    const col = TYPE_COL[r.type]; if (col && (vis || all)) { x.fillStyle = cur ? '#2a1905' : col; const s = Math.min(w, h) * 0.3; x.beginPath(); x.moveTo(px + w / 2, py + h / 2 - s); x.lineTo(px + w / 2 + s, py + h / 2); x.lineTo(px + w / 2, py + h / 2 + s); x.lineTo(px + w / 2 - s, py + h / 2); x.closePath(); x.fill(); } }
}
/** 畫職業頭像 */
export function drawFace(cv: HTMLCanvasElement, cls: string) {
  const x = cv.getContext('2d')!, w = cv.width; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, w);
  const g = x.createRadialGradient(w / 2, w * 0.4, 0, w / 2, w / 2, w * 0.6); g.addColorStop(0, '#2c3b47'); g.addColorStop(1, '#0d1218'); x.fillStyle = g; x.fillRect(0, 0, w, w);
  const k = w / 96; x.translate(w / 2 - 2 * k, w / 2 + 70 * k); x.scale(2.9 * k, 2.9 * k); drawHero(x, cls, 0, false);
}

export const Hud = {
  init() {
    const h = $('#hud'), t = $('#touch');
    h.innerHTML = `<div class="vit"><canvas class="face" width="96" height="96"></canvas><div class="bars"><div class="bar hp"><b></b><i></i><span></span></div><div class="bar sta"><i></i></div>
        <div class="row"><span class="pots"></span><span class="gold">${icon('coin')}<b>0</b></span><span class="fx"></span></div></div></div>
      <div class="tr"><div class="sys"><button data-act="inv" aria-label="行囊">${icon('bag')}<kbd>Tab</kbd></button><button data-act="map" aria-label="地圖">${icon('map')}<kbd>M</kbd></button><button data-act="pause" aria-label="暫停">${icon('pause')}<kbd>Esc</kbd></button></div>
        <div class="mapbox"><div class="where"></div><canvas id="mini" width="252" height="180"></canvas></div></div>
      <div class="boss" hidden><span></span><div class="bar"><b></b><i></i></div></div>
      <div class="hot"></div><div class="wasd"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移動</span></div>
      <div class="prompt" hidden></div><div class="banner" hidden><b></b><span></span></div><div class="toasts"></div><div class="tip" hidden></div>`;
    t.innerHTML = `<div class="zone zl"><div class="sb"><div class="sk"></div></div></div>
      <button class="tb atk" data-b="attack" aria-label="攻擊"><span class="aimdir"></span>${icon('sword')}</button>
      <button class="tb dodge" data-b="dodge" aria-label="閃避"><i></i>${icon('dash')}</button>
      <button class="tb parry" data-b="parry" aria-label="彈反"><i></i>${icon('shield')}</button>
      <button class="tb s1" data-b="s1" aria-label="技能一"><i></i><span></span></button>
      <button class="tb s2" data-b="s2" aria-label="技能二"><i></i><span></span></button>
      <button class="tb potion" data-b="potion" aria-label="藥水">${icon('potion')}<b></b></button>
      <button class="tb act" data-b="interact" hidden></button>`;
    const q = (s: string) => h.querySelector(s) as HTMLElement;
    els = { hud: h, face: q('.face'), hp: q('.hp'), hpi: q('.hp i'), hpb: q('.hp b'), hpt: q('.hp span'), sta: q('.sta'), stai: q('.sta i'), pots: q('.pots'), gold: q('.gold b'), fx: q('.fx'),
      where: q('.where'), mini: $('#mini') as HTMLCanvasElement, boss: q('.boss'), bossn: q('.boss span'), bossi: q('.boss .bar i'), bossb: q('.boss .bar b'), hot: q('.hot'), wasd: q('.wasd'), sys: q('.sys'),
      prompt: q('.prompt'), banner: q('.banner'), toasts: q('.toasts'), tip: q('.tip'),
      touch: t, act: t.querySelector('.act') as HTMLElement, atk: t.querySelector('.atk') as HTMLElement, tdodge: t.querySelector('.dodge') as HTMLElement, tparry: t.querySelector('.parry') as HTMLElement, tpot: t.querySelector('.potion b') as HTMLElement, tpotb: t.querySelector('.potion') as HTMLElement, ts1: t.querySelector('.s1') as HTMLElement, ts2: t.querySelector('.s2') as HTMLElement,
      slow: $('#post .slow'), hurt: $('#post .hurt'), fade: $('#post .fade') };
  },
  get tipEl(): HTMLElement { return els.tip; },
  show(v: boolean) { els.hud.hidden = !v; last = {}; if (!v) { els.touch.hidden = true; els.hurt.classList.remove('low'); els.slow.classList.remove('on'); els.tip.hidden = true; } else this.setup(); },
  /** 進入遠征時建立與職業相關的固定元素 */
  setup() {
    const run = W.run; if (!run) return; const c = CLS[run.cls];
    drawFace(els.face, run.cls);
    const slot = (id: string, ic: string, key: string, big = false) => `<div class="hotk"><div class="slot${big ? ' big' : ''}" data-s="${id}">${icon(ic)}<i></i>${id === 'potion' ? '<em></em>' : ''}</div><span>${key}</span></div>`;
    els.hot.innerHTML = slot('attack', 'sword', icon('mouseL') + '攻擊', true) + slot('parry', 'shield', icon('mouseR') + '彈反') + slot('dodge', 'dash', '<kbd>空白</kbd>閃避') + slot('s1', run.cls + '0', '<kbd>Q</kbd>' + c.sk[0].n) + slot('s2', run.cls + '1', '<kbd>E</kbd>' + c.sk[1].n) + slot('potion', 'potion', '<kbd>R</kbd>藥水');
    els.hs = {}; els.hot.querySelectorAll('.slot').forEach((e: HTMLElement) => (els.hs[e.getAttribute('data-s')!] = e));
    (els.ts1.querySelector('span') as HTMLElement).innerHTML = icon(run.cls + '0'); (els.ts2.querySelector('span') as HTMLElement).innerHTML = icon(run.cls + '1');
    this.where(); this.minimap();
  },
  where() { const run = W.run; if (run) els.where.textContent = `${biomeOf(run.floor).n}　${floorName(run.floor)}`; },
  minimap() { drawMap(els.mini); },
  toast(text: string, cls = '') { const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text; els.toasts.appendChild(t); while (els.toasts.children.length > 3) els.toasts.firstChild!.remove(); setTimeout(() => t.remove(), 2000); },
  banner(title: string, sub: string) { els.banner.hidden = true; void els.banner.offsetWidth; (els.banner.querySelector('b') as HTMLElement).textContent = title; (els.banner.querySelector('span') as HTMLElement).textContent = sub; els.banner.hidden = false; },
  boss(e: any) { bossE = e; els.boss.hidden = !e; if (e) els.bossn.textContent = e.d.n; },
  fade() { els.fade.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => els.fade.classList.remove('on'))); },
  hurt() { els.hurt.classList.add('on'); hurtT = 0.12; },
  staFlash() { els.sta.classList.remove('flash'); void els.sta.offsetWidth; els.sta.classList.add('flash'); },
  update(dt: number) {
    const run = W.run, p = W.p, S = W.ST; if (!run || !p || !S || els.hud.hidden) return;
    const touch = Input.touch, hints = Saves.settings.hints;
    const hpf = clamp(run.hp / S.maxHp, 0, 1);
    set('hp', Math.round(hpf * 500), () => { els.hpi.style.transform = `scaleX(${hpf})`; els.hpb.style.transform = `scaleX(${hpf})`; });
    set('hpt', Math.ceil(run.hp) + '/' + S.maxHp + '/' + Math.round(p.shield), () => { els.hpt.textContent = `${Math.max(0, Math.ceil(run.hp))} / ${S.maxHp}` + (p.shield > 0 ? `　+${Math.round(p.shield)}` : ''); els.hp.classList.toggle('sh', p.shield > 0); });
    const sf = clamp(p.sta / S.maxSta, 0, 1), out = p.sta <= 0;
    set('sta', Math.round(sf * 300), () => { els.stai.style.transform = `scaleX(${sf})`; }); set('stao', out, () => els.sta.classList.toggle('out', out));
    set('pots', run.potions + '/' + S.potMax, () => { let s = ''; for (let i = 0; i < S.potMax; i++) s += icon('potion', i < run.potions ? '' : 'e'); els.pots.innerHTML = s; els.tpot.textContent = String(run.potions); if (els.hs) els.hs.potion.querySelector('em').textContent = String(run.potions); els.tpotb.classList.toggle('off', run.potions <= 0); });
    set('gold', run.gold, () => { els.gold.textContent = String(run.gold); });
    const fx = (p.st.burn > 0 ? '<b style="color:#ff8a3d">灼燒</b>' : '') + (p.st.poison > 0 ? '<b style="color:#a4e86a">中毒</b>' : '') + (p.st.chill > 0 ? '<b style="color:#8fdcff">冰緩</b>' : '') + (p.buff.cry > 0 ? '<b style="color:#ffb86b">戰吼</b>' : '') + (p.buff.pd > 0 ? '<b style="color:#fff0b0">必暴</b>' : '') + (p.buff.smoke > 0 ? '<b style="color:#c9a0ff">隱身</b>' : '');
    set('fx', fx, () => { els.fx.innerHTML = fx; });
    set('touch', touch + '|' + hints, () => { els.touch.hidden = !touch; els.hot.hidden = touch; els.wasd.hidden = touch || !hints; els.hot.classList.toggle('nohint', !hints); els.sys.querySelectorAll('kbd').forEach((k: HTMLElement) => (k.hidden = touch || !hints));
      document.documentElement.classList.toggle('touch', touch); document.documentElement.style.setProperty('--bs', String(Saves.settings.btnScale)); });
    // 冷卻與可用狀態
    const c = CLS[run.cls], cd = [clamp(p.cds[0] / (c.sk[0].cd * S.cdr), 0, 1), clamp(p.cds[1] / (c.sk[1].cd * S.cdr), 0, 1)], pcd = clamp(p.parryCd / 0.65, 0, 1);
    const pct = (f: number) => Math.round(f * 50) * 2 + '%';
    if (touch) {
      set('tcd0', pct(cd[0]), () => (els.ts1.querySelector('i') as HTMLElement).style.setProperty('--cd', pct(cd[0]))); set('tcd1', pct(cd[1]), () => (els.ts2.querySelector('i') as HTMLElement).style.setProperty('--cd', pct(cd[1])));
      set('tpc', pct(pcd), () => (els.tparry.querySelector('i') as HTMLElement).style.setProperty('--cd', pct(pcd)));
      set('tout', out, () => { els.atk.classList.toggle('off', out); els.tdodge.classList.toggle('off', out); els.tparry.classList.toggle('off', out); });
      const chg = Math.round(p.charge * 10); set('tchg', chg, () => { els.atk.classList.toggle('charge', chg > 0); els.atk.style.setProperty('--chg', String(p.charge)); });
    } else if (els.hs) {
      set('hcd0', pct(cd[0]), () => { els.hs.s1.querySelector('i').style.setProperty('--cd', pct(cd[0])); els.hs.s1.classList.toggle('off', cd[0] > 0); }); set('hcd1', pct(cd[1]), () => { els.hs.s2.querySelector('i').style.setProperty('--cd', pct(cd[1])); els.hs.s2.classList.toggle('off', cd[1] > 0); });
      set('hpc', pct(pcd), () => els.hs.parry.querySelector('i').style.setProperty('--cd', pct(pcd)));
      set('hout', out, () => { els.hs.attack.classList.toggle('off', out); els.hs.dodge.classList.toggle('off', out); els.hs.parry.classList.toggle('off', out); });
      set('hchg', p.charge >= 0.4, () => els.hs.attack.classList.toggle('on', p.charge >= 0.4)); set('hpot', run.potions <= 0, () => els.hs.potion.classList.toggle('off', run.potions <= 0));
    }
    // 互動提示
    const n = W.near, label = !n || W.paused ? '' : n.k === 'chest' ? '打開寶箱' : n.k === 'fire' ? '在營火旁坐下' : n.k === 'stairs' ? '走下階梯' : n.k === 'item' ? itemName(n.it) : '';
    const ic = !n ? 'hand' : n.k === 'chest' ? 'chest' : n.k === 'fire' ? 'flame' : n.k === 'stairs' ? 'stairs' : n.it?.kind === 'wpn' ? 'sword' : n.it?.kind === 'rune' ? 'rune' : 'gem';
    set('near' + touch, label, () => { if (touch) { els.prompt.hidden = true; els.act.hidden = !label; els.act.innerHTML = icon(ic) + (label || ''); } else { els.act.hidden = true; els.prompt.hidden = !label; els.prompt.innerHTML = label ? `<kbd>F</kbd>${icon(ic)}${label}` : ''; } });
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
