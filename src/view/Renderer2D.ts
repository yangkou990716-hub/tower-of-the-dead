// 2D 渲染器：原本 App.boot 裡的 Phaser 建立與場景切換，原封不動搬來（行為不變）。
import Phaser from 'phaser';
import { View } from '../platform/view';
import type { GameRenderer } from '../app/renderer';
import { TitleScene } from './TitleScene';
import { GameScene } from './GameScene';

export class Renderer2D implements GameRenderer {
  readonly kind = '2d' as const;
  game: Phaser.Game | null = null; private lowFps = false;

  async boot(_host: HTMLElement) {
    const dpr = () => Math.min(devicePixelRatio || 1, View.h < 500 ? 2 : 1.5);
    const size = () => { const d = dpr(); return { w: Math.round(View.w * d), h: Math.round(View.h * d), d }; };
    const s0 = size();
    this.game = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', backgroundColor: '#06090b', banner: false, disableContextMenu: true,
      scale: { mode: Phaser.Scale.NONE, width: s0.w, height: s0.h, zoom: 1 / s0.d },
      render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
      audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      fps: { smoothStep: true }, scene: [TitleScene, GameScene],
    });
    const fit = () => { View.update(); const s = size(); const g = this.game!; if (g.scale.zoom !== 1 / s.d) g.scale.setZoom(1 / s.d); g.scale.resize(s.w, s.h); };
    addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250)); fit();
  }
  showTitle() { const g = this.game!; if (g.scene.isActive('game')) g.scene.stop('game'); if (!g.scene.isActive('title')) g.scene.start('title'); }
  play() { const g = this.game!; g.scene.stop('title'); g.scene.start('game'); }
  setLowQuality(low: boolean) { if (this.game && low !== this.lowFps) { this.lowFps = low; this.game.loop.targetFps = low ? 30 : 60; (this.game.loop as any).fpsLimit = low ? 30 : 0; } }
}
