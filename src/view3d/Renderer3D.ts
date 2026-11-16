// 3D 渲染器（Three.js）：用 Scene3D（與視覺原型共用的光源、材質、畫質分級）畫 W。
// 只讀 W、消化 W.ev；遊戲規則全在 sim。資產對應見 manifest.ts。
import { W } from '../sim/state';
import { T } from '../sim/util';
import { step } from '../sim/combat';
import { Input, groundHit } from '../platform/input';
import { View } from '../platform/view';
import { Saves } from '../platform/saves';
import { Bus } from '../app/bus';
import { bridgeEvent } from '../app/simEvents';
import type { GameRenderer } from '../app/renderer';
import { TIERS, Tier, lowerTier } from './quality';
import { Scene3D } from './Scene3D';

export class Renderer3D implements GameRenderer {
  readonly kind = '3d' as const;
  s3!: Scene3D; private playing = false; private last = 0; private ready = false;
  private loadEl: HTMLElement | null = null; private dbgEl: HTMLElement | null = null;
  /** 自動降級：每秒 fps 連續 5 秒低於上限 75% → 降一級（不自動升級；設定頁的畫質仍可手動改）。 */
  private perf = { frames: 0, t: 0, low: 0, fps: 0, dc: 0, tri: 0 };
  private userLow = false;

  async boot(host: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.userLow = Saves.settings.quality === 'low';
    const tier = (q.get('q') as Tier) || (this.userLow ? 'perf' : 'balanced');
    this.s3 = new Scene3D({ tier, route: 'kaykit', base: new URL('./', location.href).href, forceWebGL: q.get('api') === 'webgl' });
    const cv = this.s3.canvas; cv.style.width = '100%'; cv.style.height = '100%'; host.appendChild(cv);
    await this.s3.init(); // 失敗（沒有 WebGPU 也沒有 WebGL 2）→ App 退回 2D
    // GPU 裝置遺失（iOS 背景太久、記憶體不足）：下次啟動改用 2D，避免卡在壞掉的 3D
    this.s3.renderer.onDeviceLost = () => { Saves.settings.renderer = '2d'; Saves.saveSettings(); Bus.emit('toast', '3D 畫面中斷，已切回 2D，重新整理後生效', 'bad'); };
    const fit = () => { View.update(); this.s3.resize(View.w, View.h); };
    addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250)); fit();
    // 滑鼠位置 → 相機射線 → 與地面 (y=0) 的交點
    Input.toWorld = (mx, my) => groundHit(this.s3.screenRay(mx, my), T);
    if (q.get('debug') === '1') { this.dbgEl = this.overlay('left:8px;top:40%;font:11px/1.3 ui-monospace,monospace;white-space:pre;padding:4px 6px'); }
    // 模型在背景下載；失敗就用程序化模型（2D 不受影響）
    this.s3.loadKay((d, n) => this.progress(`載入 3D 資源 ${d}/${n}`))
      .catch((e) => { console.warn('3D 模型載入失敗，改用程序化模型', e); this.s3.route = 'proc'; })
      .finally(() => { this.ready = true; this.progress(null); });
    this.s3.renderer.setAnimationLoop((now) => this.frame(now));
  }
  showTitle() { this.playing = false; this.progress(null); }
  play() { this.playing = true; this.s3.curRoom = null; this.last = 0; if (!this.ready) this.progress('載入 3D 資源…'); }
  setLowQuality(low: boolean) { this.userLow = low; const t: Tier = low ? 'perf' : 'balanced'; if (this.s3 && this.s3.tier !== t) this.s3.setTier(t); }

  private frame(now: number) {
    const s3 = this.s3, cap = TIERS[s3.tier].cap;
    if (!this.playing || !W.run || !W.room) { this.last = 0; return; }
    if (cap < 60 && this.last && now - this.last < 1000 / cap - 2) return;
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60, dt = Math.min(raw, 1 / 30); this.last = now;
    if (!this.ready || s3.busy) return;
    if (s3.stale) { this.rebuild(); return; }
    Bus.emit('frame', dt);
    step(dt, () => { W.in = Input.build(W.p); });
    const evs = W.ev.splice(0); for (const e of evs) bridgeEvent(e);
    if (s3.stale) { this.rebuild(); return; } // 這一步換了房間
    s3.update(now / 1000, dt, evs); const r = s3.render();
    Bus.emit('hud', dt);
    this.track(raw, r);
  }
  /** 換房：黑幕下重建並預先編譯，完成後通知介面（Hud 淡入）。第一次另外在背景暖機所有敵人樣本。 */
  private rebuild() {
    const first = !this.s3.roomView, fade = document.querySelector('#post .fade');
    fade?.classList.add('on');
    this.s3.rebuildAsync().then(() => {
      this.last = 0; fade?.classList.remove('on'); Bus.emit('room', true);
      if (first) this.s3.warmup();
    });
  }
  private track(raw: number, r: { dc: number; tri: number }) {
    const p = this.perf; p.frames++; p.t += raw; p.dc = r.dc; p.tri = r.tri;
    if (p.t < 1) return;
    p.fps = p.frames / p.t; p.frames = 0; p.t = 0;
    if (raw < 0.5 && p.fps < TIERS[this.s3.tier].cap * 0.75) { if (++p.low >= 5) { p.low = 0; const nt = lowerTier(this.s3.tier); if (nt) { this.s3.setTier(nt); Bus.emit('toast', `畫面較慢，已自動降為「${TIERS[nt].name}」畫質`, ''); } } }
    else p.low = 0;
    if (this.dbgEl) this.dbgEl.textContent = `${p.fps.toFixed(0)} fps｜${this.s3.backendName}｜${TIERS[this.s3.tier].name}\nDC ${p.dc}  △ ${(p.tri / 1000).toFixed(0)}k\n換房 ${this.s3.trans.n} 次 上次 ${this.s3.trans.last.toFixed(0)} ms 最長 ${this.s3.trans.worst.toFixed(0)} ms\n${this.s3.kayInfo}`;
  }
  private overlay(css: string) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;z-index:50;pointer-events:none;color:#e9e1cf;background:rgba(5,8,10,.72);border-radius:6px;' + css;
    document.body.appendChild(el); return el;
  }
  private progress(text: string | null) {
    if (!text) { this.loadEl?.remove(); this.loadEl = null; return; }
    if (!this.playing && !this.loadEl) return; // 標題畫面不顯示（背景下載）
    this.loadEl ||= this.overlay('left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;font-size:15px');
    this.loadEl.textContent = text;
  }
}
