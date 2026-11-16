// 應用程式流程：標題 → 選擇旅途 → 營地 → 遠征 → 結算。把模擬、畫面、介面、存檔接在一起。
import { W } from '../sim/state';
import { newRun, startRun, shardsEarned, calcStats } from '../sim/combat';
import { biomeOf, floorName } from '../sim/data';
import { Saves } from '../platform/saves';
import { DB } from '../platform/db';
import { Snd } from '../platform/audio';
import { Input } from '../platform/input';
import { Lifecycle } from '../platform/lifecycle';
import { PWA } from '../platform/pwa';
import { View } from '../platform/view';
import { Haptics } from '../platform/haptics';
import { Tutorial } from '../ui/tutorial';
import { Bus } from './bus';
import { Hud, itemName } from '../ui/hud';
import * as UI from '../ui/screens';
import type { GameRenderer } from './renderer';
import { Renderer2D } from '../view/Renderer2D';

export const App = {
  game: null as any, renderer: null as GameRenderer | null, state: 'boot' as 'boot' | 'title' | 'play', saveT: 0,

  async boot() {
    await Saves.init(); await PWA.init(); Lifecycle.init();
    View.update();
    this.renderer = await this.makeRenderer();
    this.game = (this.renderer as any).game ?? null; // 2D：Phaser.Game（自動化測試用）
    Input.init(document.getElementById('game')!); Hud.init(); this.bindTouch(); this.wire();
    UI.setNav({ slots: () => UI.slotsSheet(), enter: (id) => this.enterSlot(id), camp: () => this.toCamp(), start: (c, d) => this.startRun(c, d), resume: () => this.resumeRun(), abandon: () => this.abandon(), toTitle: () => this.toTitle() });
    UI.setApply(() => this.applyPerf()); UI.applySettings();
    PWA.onChange = () => { if (UI.titleShown()) UI.showTitle(); };
    this.state = 'title'; UI.showTitle();
    (window as any).__totd = { W, App, Saves, UI, Input }; // 自動化測試用
  },
  /** 選渲染器：網址 ?r=3d／?r=2d（會記住），或設定頁。預設 2D；3D 啟動失敗自動退回 2D。 */
  async makeRenderer(): Promise<GameRenderer> {
    const q = new URLSearchParams(location.search).get('r');
    if (q === '2d' || q === '3d') { Saves.settings.renderer = q; await Saves.saveSettings(); }
    const host = document.getElementById('game')!;
    document.documentElement.dataset.renderer = Saves.settings.renderer === '3d' ? '3d' : '2d';
    if (Saves.settings.renderer === '3d') {
      try { const { Renderer3D } = await import('../view3d/Renderer3D'); const r = new Renderer3D(); await r.boot(host); return r; }
      catch (e) { console.error('3D 渲染器啟動失敗，改用 2D', e); host.textContent = ''; Saves.settings.renderer = '2d'; Saves.saveSettings(); document.documentElement.dataset.renderer = '2d'; setTimeout(() => Hud.toast('3D 無法啟動，已改用 2D', 'bad'), 500); }
    }
    const r = new Renderer2D(); await r.boot(host); return r;
  },
  applyPerf() { this.renderer?.setLowQuality(Saves.settings.quality === 'low'); },

  bindTouch() {
    const t = document.getElementById('touch')!;
    Input.stick(t.querySelector('.zl') as HTMLElement, (x, y) => { Input.mv.x = x; Input.mv.y = y; });
    Input.attackPad(t.querySelector('.atk') as HTMLElement);
    t.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => { const n = b.getAttribute('data-b')!; if (n !== 'attack') Input.button(b, n); });
    document.querySelectorAll<HTMLElement>('#hud .sys button').forEach((b) => b.addEventListener('click', () => { Snd.init(); Haptics.fire('tap'); Input.press(b.getAttribute('data-act')!); }));
    // 第一次碰到螢幕就切到觸控介面
    addEventListener('touchstart', () => Input.setTouch(true), { passive: true });
    Input.onMode = () => { if (Tutorial.active) Tutorial.render(); };
  },
  /** 模擬事件 → 觸覺回饋 */
  haptic(e: any) {
    switch (e.k) {
      case 'hitfx': if (!e.blocked) Haptics.fire(e.crit ? 'crit' : e.heavy ? 'heavy' : 'hit'); break;
      case 'die': Haptics.fire(e.boss ? 'boss' : 'kill'); break;
      case 'parry': Haptics.fire('parry'); break;
      case 'pdodge': Haptics.fire('pdodge'); break;
      case 'phit': case 'pdeath': Haptics.fire('hurt'); break;
      case 'boss': Haptics.fire('boss'); break;
      case 'exhaust': Haptics.fire('deny'); break;
    }
  },

  /** 模擬事件 → 介面 */
  wire() {
    Bus.on('frame', (dt: number) => this.frame(dt));
    Bus.on('ev', (e: any) => { Tutorial.onEv(e); this.haptic(e); });
    Bus.on('hud', (dt: number) => Hud.update(dt));
    Bus.on('room', () => { Hud.fade(); Hud.minimap(); Hud.boss(W.boss); });
    Bus.on('clear', () => { Hud.minimap(); this.save(); });
    Bus.on('floor', () => { Hud.where(); const b = biomeOf(W.run!.floor); Hud.banner(b.n, floorName(W.run!.floor) + '　' + b.sub); this.save(); });
    Bus.on('toast', (t: string, c: string) => Hud.toast(t, c));
    Bus.on('hurt', () => Hud.hurt());
    Bus.on('exhaust', () => Hud.staFlash());
    Bus.on('took', (it: any) => { Hud.toast('取得　' + itemName(it), 'good'); this.save(); });
    Bus.on('boss', (e: any) => { Hud.boss(e); Hud.banner(e.d.n, biomeOf(W.run!.floor).n + ' 之主'); });
    Bus.on('bossdie', (e: any) => { Hud.boss(null); Hud.toast(e.noHit ? '無傷擊敗頭目' : '頭目倒下了', 'good'); });
    Bus.on('panel', (e: any) => { if (e.p === 'item') UI.itemSheet(e.o); else if (e.p === 'fire') UI.fireSheet(e.o); else if (e.p === 'stairs') UI.stairsSheet(); });
    Bus.on('over', (e: any) => this.onOver(e));
    Lifecycle.onHide(() => { if (this.state === 'play' && !W.over && !UI.sheetOpen()) UI.pauseSheet(); this.save(true); Snd.suspend(); Input.clear(); });
    Lifecycle.onShow(() => { Snd.resume(); Input.clear(); });
    Lifecycle.onBlur(() => { Input.clear(); });
    addEventListener('beforeunload', () => { this.save(true); });
  },
  /** 每幀：處理系統按鍵與自動存檔 */
  frame(dt: number) {
    if (Input.take('pause')) { if (!UI.closeTop() && this.state === 'play' && !W.over) UI.pauseSheet(); }
    if (this.state !== 'play') { Input.take('map'); Input.take('inv'); return; }
    Tutorial.frame(dt);
    if (Input.take('map') && !W.over) { if (!UI.closeTop()) UI.mapSheet(); }
    if (Input.take('inv') && !W.over) { if (!UI.closeTop()) UI.bagSheet(); }
    if (W.dirty) { W.dirty = false; this.save(); }
    this.saveT += dt; if (this.saveT > 20) this.save();
  },
  save(now = false) { this.saveT = 0; const s = Saves.cur; if (!s) return; if (this.state === 'play' && W.run && !W.over) s.run = W.run; s.hub.last = Date.now(); if (now) Saves.flush(); else Saves.queue(); },

  toTitle() { Tutorial.stop(false); UI.closeAll(); this.save(true); Hud.show(false); Input.enabled = false; this.state = 'title'; Saves.cur = null; W.run = null; this.renderer!.showTitle(); UI.showTitle(); },
  async enterSlot(id: number) {
    const s = await Saves.select(id, true); if (!s) return; W.meta = s.meta; DB.requestPersist();
    UI.hideTitle();
    if (!s.meta.tut) { s.meta.tut = 1; Saves.queue(); UI.storySheet(() => this.toCamp()); } else this.toCamp();
  },
  toCamp() {
    Tutorial.stop(false); UI.closeAll(); this.save(true); Hud.show(false); Input.enabled = false; this.state = 'title'; W.run = null; W.over = null;
    this.renderer!.showTitle();
    UI.hideTitle(); UI.campSheet();
  },
  startRun(cls: string, diff: string) { const s = Saves.cur!; W.meta = s.meta; const run = newRun(cls, diff); s.run = run; this.beginPlay(run, true); },
  resumeRun() { const s = Saves.cur!; if (!s.run) return this.toCamp(); W.meta = s.meta; this.beginPlay(s.run, false); },
  beginPlay(run: any, fresh: boolean) {
    UI.closeAll(); UI.hideTitle(); startRun(run); Saves.cur!.run = W.run; this.state = 'play'; Input.clear(); Input.enabled = true;
    this.renderer!.play(); Hud.show(true);
    const b = biomeOf(run.floor); Hud.banner(b.n, floorName(run.floor) + '　' + b.sub); this.save(true);
    if (fresh && (Saves.cur!.meta.tut || 0) < 2) setTimeout(() => { if (this.state === 'play' && W.p) Tutorial.start(); }, 3200);
  },
  /** 在營地放棄未完的遠征：直接結算帶回魂晶。 */
  abandon() {
    const s = Saves.cur!; if (!s.run) return this.toCamp();
    const m = s.meta; W.meta = m; W.run = s.run; W.over = null; calcStats(); const sh = shardsEarned();
    m.shards += sh; m.stats.runs++; m.stats.bestFloor = Math.max(m.stats.bestFloor, s.run.floor); m.stats.playtime += s.run.time; s.run = null; W.run = null;
    Saves.flush(); this.toCamp(); Hud.toast('帶回魂晶 +' + sh, 'good');
  },
  onOver(e: any) { Tutorial.stop(false); const s = Saves.cur!; s.run = null; Saves.flush(); Input.enabled = false; setTimeout(() => UI.resultSheet(e, () => this.toCamp()), 600); },
};
