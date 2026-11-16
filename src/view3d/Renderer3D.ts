// 3D 渲染器（Three.js）：用 Scene3D（與視覺原型共用的光源、材質、畫質分級）畫 W。
import { W } from '../sim/state';
import { T } from '../sim/util';
import { step } from '../sim/combat';
import { Input, groundHit } from '../platform/input';
import { View } from '../platform/view';
import { Saves } from '../platform/saves';
import { Bus } from '../app/bus';
import { bridgeEvent } from '../app/simEvents';
import type { GameRenderer } from '../app/renderer';
import { TIERS, Tier } from './quality';
import { Scene3D } from './Scene3D';

export class Renderer3D implements GameRenderer {
  readonly kind = '3d' as const;
  s3!: Scene3D; private playing = false; private last = 0; private ready = false;

  async boot(host: HTMLElement) {
    const q = new URLSearchParams(location.search);
    const tier = (q.get('q') as Tier) || (Saves.settings.quality === 'low' ? 'perf' : 'balanced');
    this.s3 = new Scene3D({ tier, route: 'kaykit', base: new URL('./', location.href).href, forceWebGL: q.get('api') === 'webgl' });
    const cv = this.s3.canvas; cv.style.width = '100%'; cv.style.height = '100%'; host.appendChild(cv);
    await this.s3.init();
    const fit = () => { View.update(); this.s3.resize(View.w, View.h); };
    addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250)); fit();
    // 3D：滑鼠位置 → 相機射線 → 與地面 (y=0) 的交點
    Input.toWorld = (mx, my) => groundHit(this.s3.screenRay(mx, my), T);
    this.s3.loadKay().catch((e) => { console.warn('KayKit 載入失敗，改用程序化模型', e); this.s3.route = 'proc'; }).finally(() => { this.ready = true; });
    this.s3.renderer.setAnimationLoop((now) => this.frame(now));
  }
  showTitle() { this.playing = false; }
  play() { this.playing = true; this.s3.curRoom = null; this.last = 0; }
  setLowQuality(low: boolean) { const t: Tier = low ? 'perf' : 'balanced'; if (this.s3 && this.s3.tier !== t) this.s3.setTier(t); }

  private frame(now: number) {
    const s3 = this.s3, cap = TIERS[s3.tier].cap;
    if (!this.playing || !W.run || !W.room) { this.last = 0; return; }
    if (cap < 60 && this.last && now - this.last < 1000 / cap - 2) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 30) : 1 / 60; this.last = now;
    if (!this.ready || s3.busy) return;
    if (s3.stale) { this.rebuild(); return; }
    Bus.emit('frame', dt);
    step(dt, () => { W.in = Input.build(W.p); });
    const evs = W.ev.splice(0); for (const e of evs) bridgeEvent(e);
    if (s3.stale) { this.rebuild(); return; } // 這一步換了房間
    s3.update(now / 1000, dt, evs); s3.render();
    Bus.emit('hud', dt);
  }
  /** 換房：黑幕下重建並預先編譯著色器，完成後通知介面。 */
  private rebuild() {
    const first = !this.s3.roomView;
    this.s3.rebuildAsync().then(async () => { if (first) await this.s3.warmup(); this.last = 0; Bus.emit('room', true); });
  }
}
