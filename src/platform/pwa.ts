// Service Worker 註冊與更新提示。
// 新版本下載完成後不會自動取代舊版（避免遊玩中途換版），由玩家按下「更新」才切換。
export const PWA = {
  needRefresh: false, offlineReady: false,
  update: null as null | ((reload?: boolean) => Promise<void>),
  onChange: () => {},
  standalone: () => (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as any).standalone === true),
  isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  installEvt: null as any,
  async init() {
    addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); this.installEvt = e; this.onChange(); });
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    try {
      const { registerSW } = await import('virtual:pwa-register');
      this.update = registerSW({
        immediate: true,
        onNeedRefresh: () => { this.needRefresh = true; this.onChange(); },
        onOfflineReady: () => { this.offlineReady = true; this.onChange(); },
        onRegisterError: () => { /* 受限環境（例如內嵌框架）不支援，忽略 */ },
      });
    } catch { /* 不支援 Service Worker：仍可線上遊玩 */ }
  },
  async install() { const e = this.installEvt; if (!e) return false; e.prompt(); const r = await e.userChoice; this.installEvt = null; this.onChange(); return r?.outcome === 'accepted'; },
};
