// 新手引導：第一次遠征時，一步一步提示操作；做到了才進下一步。電腦與觸控各有說明。
import { W } from '../sim/state';
import { Input } from '../platform/input';
import { Saves } from '../platform/saves';
import { Hud } from './hud';
import { icon } from './icons';

const Y = '<b style="color:#ffc24a">黃光</b>', R = '<b style="color:#ff6a5e">紅光</b>', STA = '<b style="color:#93d6aa">體力</b>';
const STEPS: { pc: string; touch: string; flag: string }[] = [
  { flag: 'move', pc: '用 <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <b>移動</b>', touch: '在<b>螢幕左半邊</b>拖曳來<b>移動</b>' },
  { flag: 'atk', pc: `用滑鼠瞄準，按 ${icon('mouseL')}<b>左鍵攻擊</b>`, touch: `點 ${icon('sword')} <b>攻擊</b>——會自動面向最近的敵人` },
  { flag: 'heavy', pc: `<b>按住</b> ${icon('mouseL')}左鍵蓄力，放開使出<b>重擊</b>`, touch: `<b>按住</b> ${icon('sword')} 蓄力，放開使出<b>重擊</b>。按住時拖曳可以手動瞄準` },
  { flag: 'dodge', pc: '按 <kbd>空白鍵</kbd> 朝移動方向<b>閃避</b>。閃避的瞬間不會受傷', touch: `按 ${icon('dash')} 朝移動方向<b>閃避</b>。閃避的瞬間不會受傷` },
  { flag: 'parry', pc: `敵人腳下亮${Y}時，在命中的瞬間按 ${icon('mouseR')}<b>右鍵彈反</b>。${R}擋不住，只能閃`, touch: `敵人腳下亮${Y}時，在命中的瞬間按 ${icon('shield')} <b>彈反</b>。${R}擋不住，只能閃` },
  { flag: 'room', pc: `攻擊、閃避、彈反都會消耗${STA}。現在，走進<b>發亮的門</b>`, touch: `攻擊、閃避、彈反都會消耗${STA}。現在，走進<b>發亮的門</b>` },
];
let on = false, i = 0, moved = 0, lx = 0, ly = 0, flags: Record<string, boolean> = {}, wait = 0, lastKey = '';

export const Tutorial = {
  get active() { return on; },
  start() { on = true; i = 0; moved = 0; flags = {}; wait = 0; lastKey = ''; const p = W.p; lx = p.x; ly = p.y; this.render(); },
  stop(finished: boolean) { if (!on) return; on = false; Hud.tipEl.hidden = true; if (finished && Saves.cur) { Saves.cur.meta.tut = 2; Saves.queue(); } },
  /** 模擬事件 */
  onEv(e: any) {
    if (!on) return;
    if ((e.k === 'swing' || e.k === 'pshoot') && !e.heavy) flags.atk = true;
    if ((e.k === 'swing' || e.k === 'pshoot') && e.heavy) flags.heavy = true;
    if (e.k === 'dodge') flags.dodge = true;
    if (e.k === 'parrytry' || e.k === 'parry') flags.parry = true;
    if (e.k === 'room' && i >= STEPS.length - 1) flags.room = true;
    if (e.k === 'pdeath') this.stop(false);
  },
  frame(dt: number) {
    if (!on || W.paused) return; const p = W.p; if (!p) return;
    moved += Math.hypot(p.x - lx, p.y - ly); lx = p.x; ly = p.y; if (moved > 130) flags.move = true;
    if (wait > 0) { wait -= dt; if (wait <= 0) { i++; if (i >= STEPS.length) return this.stop(true); this.render(); } return; }
    if (flags[STEPS[i].flag]) { wait = 0.7; Hud.tipEl.classList.add('done'); const pEl = Hud.tipEl.querySelector('p'); if (pEl) pEl.innerHTML = '<b style="color:#93d6aa">做到了</b>'; }
    else this.render();
  },
  render() {
    const el = Hud.tipEl, s = STEPS[i], key = i + (Input.touch ? 't' : 'p'); if (key === lastKey && !el.hidden) return; lastKey = key;
    el.classList.remove('done'); el.hidden = false;
    el.innerHTML = `<p>${Input.touch ? s.touch : s.pc}</p><small><span class="dots">${STEPS.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</span><button type="button">略過教學</button></small>`;
    (el.querySelector('button') as HTMLElement).onclick = () => this.stop(true);
  },
};
