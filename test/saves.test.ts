import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { Saves, migrate, newSlot, fillDefaults, SAVE_VERSION, MIGRATIONS, SaveError } from '../src/platform/saves';
import { DB } from '../src/platform/db';
import { W, newMeta } from '../src/sim/state';
import { newRun, startRun, sanitizeRun, step } from '../src/sim/combat';
import { mkBot } from '../src/sim/bot';

describe('存檔', () => {
  beforeEach(async () => { for (const s of await DB.all('slots')) await DB.del('slots', (s as any).id); Saves.slots = []; Saves.cur = null; Saves.errors = {}; });

  it('寫入 IndexedDB 後可完整讀回（含進行中的遠征）', async () => {
    await Saves.init(); const s = (await Saves.select(1, true))!;
    W.meta = s.meta; const run = newRun('knight', 'normal', 4242); startRun(run); s.run = W.run;
    const bot = mkBot(0.8); for (let i = 0; i < 60 * 40; i++) step(1 / 60, () => { W.in = bot(1 / 60); });
    s.meta.shards = 77; await Saves.flush();
    const snap = JSON.parse(JSON.stringify(s));
    await Saves.init();                                   // 模擬重新開啟遊戲
    expect(Saves.slots[0]).toBeTruthy();
    expect(JSON.parse(JSON.stringify(Saves.slots[0]))).toEqual({ ...snap, updated: Saves.slots[0]!.updated });
    // 讀回的遠征可以直接接續
    W.meta = Saves.slots[0]!.meta; startRun(Saves.slots[0]!.run!);
    expect(W.run!.floor).toBe(snap.run.floor); expect(W.run!.cur).toBe(snap.run.cur); expect(W.room).toBeTruthy();
    for (let i = 0; i < 300; i++) step(1 / 60, () => { W.in = bot(1 / 60); });
  });

  it('三個欄位互不影響，刪除只影響該欄', async () => {
    await Saves.init(); const a = (await Saves.select(1, true))!; a.meta.shards = 1; await Saves.flush();
    const b = (await Saves.select(2, true))!; b.meta.shards = 2; await Saves.flush();
    await Saves.remove(1); await Saves.init();
    expect(Saves.slots[0]).toBeNull(); expect(Saves.slots[1]!.meta.shards).toBe(2); expect(Saves.slots[2]).toBeNull();
  });

  it('匯出後可匯入到另一欄，內容一致', async () => {
    await Saves.init(); const a = (await Saves.select(1, true))!; a.meta.shards = 123; a.meta.codex['wpn:iron'] = 1; await Saves.flush();
    const text = Saves.exportText(a); const b = await Saves.importInto(text, 3);
    expect(b.id).toBe(3); expect(b.meta).toEqual(a.meta);
    await Saves.init(); expect(Saves.slots[2]!.meta.shards).toBe(123);
  });

  it('拒絕損毀、非本遊戲、或來自較新版本的檔案，且不會動到現有存檔', async () => {
    await Saves.init(); const a = (await Saves.select(1, true))!; a.meta.shards = 5; await Saves.flush();
    const good = Saves.exportText(a);
    expect(() => Saves.parseImport('不是 JSON', 1)).toThrow(SaveError);
    expect(() => Saves.parseImport('{"format":"other"}', 1)).toThrow(SaveError);
    expect(() => Saves.parseImport(good.replace('"shards":5', '"shards":999999'), 1)).toThrow(/校驗/);   // 被竄改／截斷
    const future = JSON.parse(good); future.slot.v = SAVE_VERSION + 1; delete future.sum;
    expect(() => Saves.parseImport(JSON.stringify(future), 1)).toThrow(/較新/);
    await Saves.init(); expect(Saves.slots[0]!.meta.shards).toBe(5);
  });
});

describe('版本更新不破壞舊存檔', () => {
  it('舊存檔缺少新欄位時自動補上預設值，原有資料保留', () => {
    const old: any = { id: 2, v: SAVE_VERSION, created: 1, updated: 2, name: '老旅途', meta: { shards: 40, cls: { knight: 1, mage: 1 }, stats: { runs: 3 } }, run: null };
    const s = migrate(old);
    expect(s.meta.shards).toBe(40); expect(s.meta.cls.mage).toBe(1); expect(s.meta.stats.runs).toBe(3);
    expect(s.meta.stats.kills).toBe(0); expect(s.meta.codex).toEqual({}); expect(s.meta.graves).toEqual([]); expect(s.hub).toBeTruthy(); expect(s.name).toBe('老旅途');
  });
  it('未知的多餘欄位不會被刪掉（之後降版或跨版本匯入仍安全）', () => {
    const s: any = migrate({ ...newSlot(1), extra: { keep: true } }); expect(s.extra.keep).toBe(true);
  });
  it('遷移鏈：舊版本依序套用每一步轉換', () => {
    const v = SAVE_VERSION; const raw: any = { ...newSlot(1), v: v - 2 };
    MIGRATIONS[v - 2] = (s) => { s.meta.a = 1; s.v = v - 1; return s; }; MIGRATIONS[v - 1] = (s) => { s.meta.b = s.meta.a + 1; s.v = v; return s; };
    const s: any = migrate(raw); expect(s.v).toBe(v); expect(s.meta.b).toBe(2);
    delete MIGRATIONS[v - 2]; delete MIGRATIONS[v - 1];
    expect(() => migrate({ ...newSlot(1), v: v - 1 })).toThrow(SaveError);       // 缺轉換程式 → 明確報錯，不亂猜
  });
  it('存檔裡有已被移除的物品 id 時，遠征仍可載入', () => {
    W.meta = newMeta(); const run = newRun('knight', 'normal', 99);
    run.relics = ['heart', '已刪除的遺物']; run.runes = ['fire', 'nope']; run.wpn = { id: '不存在的武器', lv: 2 }; (run as any).cls = 'ghostclass'; run.diff = 'insane';
    const r = sanitizeRun(run); expect(r.relics).toEqual(['heart']); expect(r.runes).toEqual(['fire']); expect(r.wpn.id).toBe('iron'); expect(r.wpn.lv).toBe(2); expect(r.cls).toBe('knight'); expect(r.diff).toBe('normal');
    startRun(r); expect(W.room).toBeTruthy();
  });
  it('fillDefaults 不覆蓋既有值', () => { expect(fillDefaults({ a: 0, b: { c: false } }, { a: 5, b: { c: true, d: 1 }, e: [] })).toEqual({ a: 0, b: { c: false, d: 1 }, e: [] }); });
});
