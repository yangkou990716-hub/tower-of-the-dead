// 輸入：鍵盤滑鼠、觸控（雙搖桿＋按鈕）、手把，統一轉成模擬層看得懂的 InputState。
import { InputState, emptyInput } from '../sim/state';
import { hypot, abs, atan2 } from '../sim/util';
import { Snd } from './audio';
import { View } from './view';

const KEYMAP: Record<string, string> = { Space: 'dodge', KeyQ: 's1', KeyE: 's2', KeyR: 'potion', KeyF: 'interact', KeyM: 'map', Tab: 'inv', KeyI: 'inv', Escape: 'pause', KeyP: 'pause', ShiftLeft: 'parry', ShiftRight: 'parry', KeyJ: 'attack', KeyK: 'parry' };
const PADMAP = ['dodge', 'parry', 'heavy', 'potion', 's1', 's2', 's1', 's2', 'map', 'pause'];

export const Input = {
  k: {} as Record<string, boolean>, q: {} as Record<string, boolean>, dn: {} as Record<string, boolean>,
  mv: { x: 0, y: 0 }, aimV: { x: 0, y: 0, on: false }, aimRelease: false, mx: 0, my: 0, touch: false, pad: false, padPrev: [] as boolean[], lastAim: 0,
  enabled: false, toWorld: (x: number, y: number) => ({ x, y }), onMode: () => {},
  press(a: string) { this.q[a] = true; },
  take(a: string) { const v = this.q[a]; this.q[a] = false; return !!v; },
  clear() { this.q = {}; this.dn = {}; this.k = {}; this.mv.x = this.mv.y = 0; this.aimV.on = false; },
  setTouch(v: boolean) { if (this.touch !== v) { this.touch = v; this.onMode(); } },

  init(canvasHost: HTMLElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (KEYMAP[e.code] && this.enabled) e.preventDefault(); if (e.repeat) return;
      this.k[e.code] = true; this.setTouch(false); this.pad = false; Snd.init();
      const a = KEYMAP[e.code]; if (a) { this.press(a); if (a === 'attack') this.dn.attack = true; }
    });
    addEventListener('keyup', (e) => { this.k[e.code] = false; if (e.code === 'KeyJ' && this.dn.attack) { this.dn.attack = false; this.press('attackUp'); } });
    addEventListener('blur', () => { this.k = {}; this.dn = {}; });
    canvasHost.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; });
    canvasHost.addEventListener('mousedown', (e) => {
      Snd.init(); if (this.touch) return; this.mx = e.clientX; this.my = e.clientY;
      if (e.button === 0) { this.dn.attack = true; this.press('attack'); } else if (e.button === 2) this.press('parry'); e.preventDefault();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0 && this.dn.attack) { this.dn.attack = false; this.press('attackUp'); } });
    canvasHost.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS：阻止雙指縮放、長按選單
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false } as any);
  },
  /** 綁定一個浮動搖桿區。 */
  stick(zone: HTMLElement, cb: (x: number, y: number, on: boolean) => void) {
    let id: number | null = null, ox = 0, oy = 0; const base = zone.querySelector('.sb') as HTMLElement, knob = zone.querySelector('.sk') as HTMLElement;
    const R = () => View.h * 0.13;
    const place = (kx: number, ky: number) => { const b = View.rect(zone); base.style.left = ox - b.left + 'px'; base.style.top = oy - b.top + 'px'; knob.style.transform = `translate(${kx}px,${ky}px)`; };
    zone.addEventListener('pointerdown', (e) => { this.setTouch(true); Snd.init(); if (id !== null) return; id = e.pointerId; try { zone.setPointerCapture(id); } catch { /* 無 */ } const a = View.toApp(e.clientX, e.clientY); ox = a.x; oy = a.y; base.classList.add('on'); place(0, 0); cb(0, 0, true); e.preventDefault(); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const a = View.toApp(e.clientX, e.clientY); let dx = a.x - ox, dy = a.y - oy; const r = R(), d = hypot(dx, dy); if (d > r) { ox += dx * (1 - r / d) * 0.5; oy += dy * (1 - r / d) * 0.5; dx *= r / d; dy *= r / d; } place(dx, dy); cb(dx / r, dy / r, true); e.preventDefault(); });
    const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; base.classList.remove('on'); base.style.left = ''; base.style.top = ''; knob.style.transform = ''; cb(0, 0, false); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  },
  /** 觸控攻擊鍵：點 = 輕攻擊（自動瞄準）、按住 = 蓄力、拖曳 = 手動瞄準。 */
  attackPad(el: HTMLElement) {
    let id: number | null = null, ox = 0, oy = 0; const arrow = el.querySelector('.aimdir') as HTMLElement | null;
    el.addEventListener('pointerdown', (e) => { this.setTouch(true); Snd.init(); if (id !== null) return; id = e.pointerId; try { el.setPointerCapture(id); } catch { /* 無 */ } const a = View.toApp(e.clientX, e.clientY); ox = a.x; oy = a.y;
      this.press('attack'); this.dn.attack = true; this.aimV.on = false; this.aimRelease = false; el.classList.add('on'); e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const a = View.toApp(e.clientX, e.clientY), dx = a.x - ox, dy = a.y - oy, d = hypot(dx, dy), th = View.h * 0.055;
      if (d > th) { this.aimV.on = true; this.aimV.x = dx / d; this.aimV.y = dy / d; el.classList.add('aim'); if (arrow) arrow.style.transform = `rotate(${atan2(dy, dx)}rad)`; } else if (d < th * 0.6) { this.aimV.on = false; el.classList.remove('aim'); }
      e.preventDefault(); });
    const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; this.dn.attack = false; this.press('attackUp'); this.aimRelease = this.aimV.on; el.classList.remove('on', 'aim'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
  button(el: HTMLElement, name: string) {
    el.addEventListener('pointerdown', (e) => { this.setTouch(true); Snd.init(); this.press(name); this.dn[name] = true; el.classList.add('on'); e.preventDefault(); e.stopPropagation(); });
    const up = () => { if (!this.dn[name]) return; this.dn[name] = false; this.press(name + 'Up'); el.classList.remove('on'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  },
  pollPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null; if (!gp) return;
    const dz = (v: number) => (abs(v) < 0.2 ? 0 : v), lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (!this.pad && (lx || ly || rx || ry || gp.buttons.some((b) => b.pressed))) { this.pad = true; this.setTouch(false); }
    if (!this.pad) return;
    this.mv.x = lx; this.mv.y = ly; const m = hypot(rx, ry); this.aimV.on = m > 0.45; if (m > 0.3) { this.aimV.x = rx / m; this.aimV.y = ry / m; }
    gp.buttons.forEach((b, i) => { const a = PADMAP[i]; if (!a) return; const was = this.padPrev[i];
      if (b.pressed && !was) { this.press(a); this.dn[a] = true; if (a === 'dodge') this.press('interact'); }
      if (!b.pressed && was) { this.dn[a] = false; this.press(a + 'Up'); } this.padPrev[i] = b.pressed; });
  },
  /** 產生這一幀的輸入。p = 玩家（用來算滑鼠瞄準角）。 */
  build(p: { x: number; y: number } | null): InputState {
    const I = emptyInput(), k = this.k;
    if (!this.touch && !this.pad) { let x = 0, y = 0; if (k.KeyA || k.ArrowLeft) x--; if (k.KeyD || k.ArrowRight) x++; if (k.KeyW || k.ArrowUp) y--; if (k.KeyS || k.ArrowDown) y++; const d = hypot(x, y) || 1; this.mv.x = x / d; this.mv.y = y / d; }
    this.pollPad();
    const m = hypot(this.mv.x, this.mv.y); I.mx = m > 1 ? this.mv.x / m : this.mv.x; I.my = m > 1 ? this.mv.y / m : this.mv.y; if (m < 0.16) I.mx = I.my = 0;
    if (this.touch) {
      // 攻擊鍵：沒有拖曳時由模擬層自動瞄準最近的敵人；拖曳時用拖曳方向
      if (this.aimV.on) I.aim = this.lastAim = atan2(this.aimV.y, this.aimV.x);
      else { I.auto = true; if (m > 0.3) I.aim = this.lastAim = atan2(this.mv.y, this.mv.x); }
      if (this.aimRelease) { this.aimRelease = false; this.aimV.on = false; }
      I.attack = this.take('attack'); I.attackHeld = !!this.dn.attack; I.attackUp = this.take('attackUp');
    } else if (this.pad) {
      I.repeat = true;
      if (this.aimV.on) I.aim = this.lastAim = atan2(this.aimV.y, this.aimV.x); else if (m > 0.3) I.aim = this.lastAim = atan2(this.mv.y, this.mv.x);
      I.attackHeld = this.aimV.on; I.attack = this.take('attack'); I.heavyHeld = !!this.dn.heavy; I.heavyUp = this.take('heavyUp');
    } else {
      if (p) { const w = this.toWorld(this.mx, this.my); I.aimPt = w; I.aim = atan2(w.y - p.y, w.x - p.x); }
      I.attack = this.take('attack'); I.attackHeld = !!this.dn.attack; I.attackUp = this.take('attackUp');
    }
    I.dodge = this.take('dodge'); I.parry = this.take('parry'); I.s1 = this.take('s1'); I.s2 = this.take('s2'); I.potion = this.take('potion'); I.interact = this.take('interact');
    return I;
  },
};
