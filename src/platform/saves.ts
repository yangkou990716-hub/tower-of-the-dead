// 存檔：多欄位、版本遷移、匯出／匯入。資料存在 IndexedDB。
import { DB } from './db';
import { Slot, Settings, newMeta, newHub, newSettings } from '../sim/state';
import { strHash } from '../sim/util';

/** 存檔格式版本。改動存檔結構時 +1，並在 MIGRATIONS 加一條「舊版 → 新版」的轉換。 */
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
const EXPORT_FORMAT = 'tower-of-the-dead-save';

/** MIGRATIONS[n] 把版本 n 的存檔轉成 n+1。永遠只新增，不要改舊的。 */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  // 範例：1: (s) => { s.meta.newField = 0; s.v = 2; return s; },
};

export class SaveError extends Error { constructor(public code: 'invalid' | 'future' | 'corrupt', msg: string) { super(msg); } }

/** 遞迴補齊缺少的欄位（舊存檔缺新欄位時用預設值），不刪除多出來的欄位。 */
export function fillDefaults(obj: any, tpl: any): any {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj == null ? structuredCloneSafe(tpl) : obj;
  for (const k of Object.keys(tpl)) {
    const t = tpl[k];
    if (obj[k] === undefined || obj[k] === null && t !== null && typeof t === 'object') obj[k] = structuredCloneSafe(t);
    else if (t && typeof t === 'object' && !Array.isArray(t)) fillDefaults(obj[k], t);
  }
  return obj;
}
const structuredCloneSafe = (v: any) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function newSlot(id: number, name = ''): Slot {
  const now = Date.now();
  return { id, v: SAVE_VERSION, created: now, updated: now, name: name || `旅途 ${id}`, meta: newMeta(), hub: newHub(now), run: null };
}

/** 把任何版本的存檔資料轉成目前版本。資料不合法或來自更新的版本時丟出 SaveError。 */
export function migrate(raw: any): Slot {
  if (!raw || typeof raw !== 'object' || typeof raw.v !== 'number' || !raw.meta) throw new SaveError('invalid', '這不是有效的存檔資料。');
  if (raw.v > SAVE_VERSION) throw new SaveError('future', `這份存檔來自較新的遊戲版本（存檔格式 ${raw.v}），請先更新遊戲。`);
  let s = structuredCloneSafe(raw);
  let guard = 0;
  while (s.v < SAVE_VERSION) {
    const f = MIGRATIONS[s.v];
    if (!f || guard++ > 100) throw new SaveError('corrupt', `缺少存檔格式 ${s.v} 的轉換程式。`);
    s = f(s);
  }
  const tpl = newSlot(typeof s.id === 'number' ? s.id : 1);
  delete (tpl as any).run;
  fillDefaults(s, tpl);
  if (s.run === undefined) s.run = null;
  return s as Slot;
}

export const Saves = {
  slots: [] as (Slot | null)[],
  cur: null as Slot | null,
  settings: newSettings() as Settings,
  errors: {} as Record<number, string>,
  _timer: 0 as any, _writing: Promise.resolve() as Promise<any>,

  async init() {
    await DB.init();
    const st = await DB.get('kv', 'settings');
    this.settings = fillDefaults(st || {}, newSettings());
    const all = await DB.all<any>('slots');
    this.slots = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const raw = all.find((s) => s && s.id === i);
      if (!raw) { this.slots.push(null); continue; }
      try { this.slots.push(migrate(raw)); } catch (e: any) { this.slots.push(null); this.errors[i] = e.message || String(e); }
    }
  },
  saveSettings() { return DB.put('kv', this.settings, 'settings'); },
  async lastSlot(): Promise<number> { return (await DB.get('kv', 'lastSlot')) || 0; },
  async select(id: number, create = false) {
    let s = this.slots[id - 1];
    if (!s && create) { s = newSlot(id); this.slots[id - 1] = s; await DB.put('slots', s); }
    this.cur = s || null;
    if (s) await DB.put('kv', id, 'lastSlot');
    return this.cur;
  },
  /** 排程寫入（合併短時間內的多次存檔）。 */
  queue() { clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), 350); },
  /** 立刻寫入。切到背景、關閉前呼叫。 */
  flush(): Promise<any> {
    clearTimeout(this._timer);
    const s = this.cur; if (!s) return Promise.resolve();
    s.updated = Date.now(); s.v = SAVE_VERSION;
    const snap = structuredCloneSafe(s);
    this._writing = this._writing.then(() => DB.put('slots', snap)).catch(() => {});
    return this._writing;
  },
  async remove(id: number) { await DB.del('slots', id); this.slots[id - 1] = null; delete this.errors[id]; if (this.cur?.id === id) this.cur = null; },

  /** 匯出成文字（JSON）。含校驗碼，可偵測檔案被截斷。 */
  exportText(s: Slot): string {
    const body = JSON.stringify(s);
    return JSON.stringify({ format: EXPORT_FORMAT, v: s.v, app: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev', exportedAt: new Date().toISOString(), sum: strHash(body), slot: s });
  },
  /** 解析匯入文字，回傳已遷移好的存檔（尚未寫入）。 */
  parseImport(text: string, intoId: number): Slot {
    let o: any;
    try { o = JSON.parse(text); } catch { throw new SaveError('invalid', '檔案內容不是有效的存檔（無法解析）。'); }
    if (!o || o.format !== EXPORT_FORMAT || !o.slot) throw new SaveError('invalid', '這不是《亡者之塔》的存檔檔案。');
    if (typeof o.sum === 'number' && strHash(JSON.stringify(o.slot)) !== o.sum) throw new SaveError('corrupt', '存檔檔案已損毀（校驗碼不符）。');
    const s = migrate(o.slot);
    s.id = intoId;
    return s;
  },
  async importInto(text: string, id: number) {
    const s = this.parseImport(text, id);
    await DB.put('slots', s); this.slots[id - 1] = s; delete this.errors[id];
    return s;
  },
};
declare const __APP_VERSION__: string;
