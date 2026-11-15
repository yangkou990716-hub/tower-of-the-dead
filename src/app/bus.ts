// 極簡事件匯流排：讓畫面層與介面層互相通知而不互相 import。
type Fn = (...a: any[]) => void;
const m = new Map<string, Fn[]>();
export const Bus = {
  on(k: string, f: Fn) { (m.get(k) || m.set(k, []).get(k)!).push(f); },
  emit(k: string, ...a: any[]) { for (const f of m.get(k) || []) f(...a); },
};
