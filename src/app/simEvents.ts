// 模擬事件 → 介面（提示、面板、音效、觸覺）。與畫面無關的部分，給 3D 渲染器用。
// 2D 的 GameScene.handleEvents 內含同一組對應（與特效寫在一起）；遷移第 5 階段統一後刪除重複。
import { Bus } from './bus';
import { Snd } from '../platform/audio';

export function bridgeEvent(e: any) {
  Bus.emit('ev', e);
  switch (e.k) {
    case 'snd': Snd.play(e.n); break;
    case 'pdodge': Bus.emit('slowmo'); break;
    case 'parry': Bus.emit('toast', '彈反！', 'good'); break;
    case 'phit': case 'pdeath': Bus.emit('hurt'); break;
    case 'revive': Bus.emit('toast', '鳳凰羽化為灰燼', 'good'); break;
    case 'gbreak': Bus.emit('toast', '破盾！', 'good'); break;
    case 'phase': Bus.emit('toast', e.e.phase === 2 ? '牠被逼到絕境了' : '牠憤怒了', 'bad'); break;
    case 'clear': Bus.emit('clear'); break;
    case 'warn': Snd.play('warn'); break;
    case 'took': Bus.emit('took', e.it); break;
    case 'ui': Bus.emit('panel', e); break;
    case 'boss': Bus.emit('boss', e.e); break;
    case 'bossdie': Bus.emit('bossdie', e); break;
    case 'over': Bus.emit('over', e); break;
    case 'floor': Bus.emit('floor'); break;
    case 'exhaust': Bus.emit('exhaust'); break;
    case 'stairs': Bus.emit('toast', '通往下一層的階梯出現了', 'good'); break;
  }
}
