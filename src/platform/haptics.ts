// 觸覺回饋（盡力而為）。
//  - Android：Vibration API
//  - iPhone：Safari 不支援 Vibration API。iOS 17.4–26.4 可借用「開關」控制項的系統觸覺；較新的 iOS 已封鎖，屆時會安靜地沒有反應
//  - 手把：雙馬達震動
import { View } from './view';

let label: HTMLLabelElement | null = null, lastT = 0, enabled = true;
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function iosTick() {
  try {
    if (!label) { label = document.createElement('label'); label.setAttribute('aria-hidden', 'true'); label.style.cssText = 'position:fixed;left:-99px;top:-99px;width:1px;height:1px;opacity:0;pointer-events:none';
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.tabIndex = -1; label.appendChild(inp); document.body.appendChild(label); }
    label.click();
  } catch { /* 不支援 */ }
}
const PAT: Record<string, { v: number | number[]; n: number; pad: [number, number, number] }> = {
  tap: { v: 8, n: 1, pad: [0, 0.2, 30] },
  hit: { v: 14, n: 1, pad: [0.15, 0.5, 50] },
  heavy: { v: 34, n: 2, pad: [0.6, 0.8, 110] },
  crit: { v: [18, 30, 26], n: 2, pad: [0.5, 1, 110] },
  kill: { v: 26, n: 1, pad: [0.4, 0.7, 90] },
  parry: { v: [12, 24, 40], n: 3, pad: [1, 1, 160] },
  pdodge: { v: [10, 40, 10], n: 2, pad: [0.2, 0.7, 120] },
  hurt: { v: 70, n: 3, pad: [1, 0.6, 220] },
  boss: { v: [60, 50, 120], n: 4, pad: [1, 1, 500] },
  deny: { v: [6, 30, 6], n: 1, pad: [0, 0.3, 40] },
};
export const Haptics = {
  supported: canVibrate || isIOS,
  set(on: boolean) { enabled = on; },
  /** 觸發一種觸覺樣式；過於頻繁的呼叫會被節流。 */
  fire(kind: string) {
    if (!enabled) return; const p = PAT[kind] || PAT.tap, now = performance.now();
    if (now - lastT < 28 && kind !== 'parry' && kind !== 'hurt') return; lastT = now;
    try {
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null, act: any = gp && (gp as any).vibrationActuator;
      if (act && act.playEffect) act.playEffect('dual-rumble', { startDelay: 0, duration: p.pad[2], weakMagnitude: p.pad[1], strongMagnitude: p.pad[0] }).catch(() => {});
      if (canVibrate) navigator.vibrate(p.v);
      else if (isIOS) { iosTick(); for (let i = 1; i < p.n; i++) setTimeout(iosTick, i * 55); }
    } catch { /* 無 */ }
  },
};
void View;
