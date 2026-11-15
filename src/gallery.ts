// 開發用：把所有烘焙貼圖攤開檢視（不會進正式版）。
import Phaser from 'phaser';
import { bakeFx, img } from './view/art/core';
import { bakeHeroes, LOOK } from './view/art/hero';
import { bakeEnemy, enemyTex } from './view/art/enemies';
import { EN, WPN } from './sim/data';
class Gallery extends Phaser.Scene {
  create() {
    bakeFx(this); bakeHeroes(this);
    const Z = 4; let y = 10;
    for (const cls of Object.keys(LOOK)) { for (let i = 0; i < 16; i++) { const im = img(this, 'hero_' + cls, i, 0, 0); im.setScale(Z / 2); im.setPosition(10 + i * 60 * Z / 2 * 0.9, y); } y += 72 * Z / 2 + 4; }
    let xx = 10; for (const id of Object.keys(WPN)) { const im = img(this, 'w_' + id, 0, 0, 0); im.setScale(Z / 2); im.setPosition(xx, y); xx += 90; if (xx > 1700) { xx = 10; y += 74; } } y += 80;
    for (const id of Object.keys(EN)) { const t = bakeEnemy(this, id); const sc = EN[id].boss ? 1 : Z / 2; for (let i = 0; i < 12; i++) { const im = img(this, 'en_' + id, i, 0, 0); im.setScale(sc); im.setPosition(10 + i * t.fw * sc, y); } y += t.fh * sc + 6; }
    xx = 10; for (const k of ['glow', 'dot', 'spark', 'ring', 'disc', 'smoke', 'star', 'slash', 'thrust', 'shadow', 'orb', 'arrow']) { const im = img(this, k, 0, 0, 0); im.setPosition(xx, y); im.setScale(0.6); xx += 110; }
    (window as any).__ready = true;
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 2200, height: 2100, backgroundColor: '#2a3238', scene: Gallery, banner: false, audio: { noAudio: true } });
