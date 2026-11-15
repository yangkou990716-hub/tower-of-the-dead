// 前景／背景切換。iOS 把網頁丟到背景時會凍結計時器，回來時必須：
//  1) 不能把離開的時間當成一幀（否則角色瞬移、敵人秒殺玩家）
//  2) 以「時間戳」計算營地的離線進度，而不是靠累加
type Fn = (awayMs: number) => void;
const hideFns: (() => void)[] = [], showFns: Fn[] = [];
let hiddenAt = 0;

export const Lifecycle = {
  onHide(f: () => void) { hideFns.push(f); },
  onShow(f: Fn) { showFns.push(f); },
  init() {
    const hide = () => { if (hiddenAt) return; hiddenAt = Date.now(); for (const f of hideFns) try { f(); } catch (e) { console.error(e); } };
    const show = () => { if (!hiddenAt) return; const away = Math.max(0, Date.now() - hiddenAt); hiddenAt = 0; for (const f of showFns) try { f(away); } catch (e) { console.error(e); } };
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? hide() : show()));
    // iOS Safari 在某些情況只發 pagehide / pageshow（例如從主畫面 App 切走）
    addEventListener('pagehide', hide);
    addEventListener('pageshow', show);
    addEventListener('freeze' as any, hide);
    addEventListener('resume' as any, show);
    addEventListener('blur', () => { /* 桌面切視窗：只暫停，不算離開 */ for (const f of blurFns) f(); });
  },
  onBlur(f: () => void) { blurFns.push(f); },
};
const blurFns: (() => void)[] = [];
