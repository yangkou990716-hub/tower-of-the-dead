// IndexedDB 封裝。IndexedDB 不可用（隱私模式、受限框架）時退回 localStorage，再不行用記憶體。
const DB_NAME = 'tower-of-the-dead';
const DB_VER = 1;
type StoreName = 'slots' | 'kv';

let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, any>();
export const dbInfo = { backend: 'indexeddb' as 'indexeddb' | 'localstorage' | 'memory', persisted: false };

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    let done = false;
    const fin = (d: IDBDatabase | null) => { if (!done) { done = true; res(d); } };
    try {
      if (typeof indexedDB === 'undefined') return fin(null);
      const rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('slots')) d.createObjectStore('slots', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => d.close(); fin(d); };
      rq.onerror = () => fin(null);
      rq.onblocked = () => fin(null);
      setTimeout(() => fin(null), 4000);
    } catch { fin(null); }
  });
  dbp.then((d) => { if (!d) dbInfo.backend = lsOk() ? 'localstorage' : 'memory'; });
  return dbp;
}
const lsOk = () => { try { localStorage.setItem('totd:_t', '1'); localStorage.removeItem('totd:_t'); return true; } catch { return false; } };
const lk = (s: string, k: any) => `totd:${s}:${k}`;

function run<R>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<R> {
  return open().then((d) => new Promise<R>((res, rej) => {
    if (!d) return rej(new Error('no-idb'));
    try {
      const tx = d.transaction(store, mode);
      const rq = fn(tx.objectStore(store));
      if (mode === 'readonly') { rq.onsuccess = () => res(rq.result as R); }
      else { tx.oncomplete = () => res(rq.result as R); }
      tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    } catch (e) { rej(e); }
  }));
}

export const DB = {
  async get<V = any>(store: StoreName, key: any): Promise<V | undefined> {
    try { return await run<V>(store, 'readonly', (s) => s.get(key)); } catch {
      try { const v = localStorage.getItem(lk(store, key)); if (v != null) return JSON.parse(v); } catch { /* 無 */ }
      return mem.get(lk(store, key));
    }
  },
  async put(store: StoreName, val: any, key?: any): Promise<void> {
    const k = store === 'slots' ? val.id : key;
    try { await run(store, 'readwrite', (s) => (store === 'slots' ? s.put(val) : s.put(val, key))); } catch {
      mem.set(lk(store, k), val);
      try { localStorage.setItem(lk(store, k), JSON.stringify(val)); } catch { /* 無 */ }
    }
  },
  async del(store: StoreName, key: any): Promise<void> {
    try { await run(store, 'readwrite', (s) => s.delete(key)); } catch {
      mem.delete(lk(store, key));
      try { localStorage.removeItem(lk(store, key)); } catch { /* 無 */ }
    }
  },
  async all<V = any>(store: StoreName): Promise<V[]> {
    try { return await run<V[]>(store, 'readonly', (s) => s.getAll()); } catch {
      const out: V[] = []; const pre = `totd:${store}:`; const seen = new Set<string>();
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(pre)) { out.push(JSON.parse(localStorage.getItem(k)!)); seen.add(k); } } } catch { /* 無 */ }
      for (const [k, v] of mem) if (k.startsWith(pre) && !seen.has(k)) out.push(v);
      return out;
    }
  },
  /** 請瀏覽器把資料標成「不可自動清除」。iOS 加入主畫面後較不會被回收。 */
  async requestPersist(): Promise<boolean> {
    try { if (navigator.storage?.persist) { dbInfo.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } } catch { /* 無 */ }
    return dbInfo.persisted;
  },
  init: () => open().then(() => dbInfo.backend),
};
