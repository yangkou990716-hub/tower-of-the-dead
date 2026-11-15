// 遊戲狀態型別與全域模擬世界 W（純資料，供模擬、畫面、測試共用）
export interface InputState {
  mx: number; my: number;        // 移動向量（長度 ≤ 1）
  aim: number | null;            // 瞄準角；null = 沿用上一次
  aimPt: { x: number; y: number } | null; // 滑鼠指向的世界座標（技能落點用）
  attack: boolean;               // 本幀按下輕攻擊
  attackHeld: boolean;           // 持續按住（電腦＝蓄力；觸控右搖桿＝連續輕攻擊）
  attackUp: boolean;
  repeat: boolean;               // true = 按住即連續輕攻擊（觸控/手把）
  heavyHeld: boolean; heavyUp: boolean;
  dodge: boolean; parry: boolean; s1: boolean; s2: boolean; potion: boolean; interact: boolean;
}
export const emptyInput = (): InputState => ({ mx: 0, my: 0, aim: null, aimPt: null, attack: false, attackHeld: false, attackUp: false, repeat: false, heavyHeld: false, heavyUp: false, dodge: false, parry: false, s1: false, s2: false, potion: false, interact: false });

export interface RoomState { v?: 1; c?: 1; u?: 1; items?: { kind: string; id: string; x: number; y: number }[]; }
export interface Run {
  seed: number; floor: number; cls: string; diff: string; daily: string | null;
  hp: number; potions: number; gold: number;
  wpn: { id: string; lv: number }; runes: string[]; relics: string[];
  time: number; kills: number; cur: number; rooms: Record<number, RoomState>;
  stats: { pd: number; parry: number; hit: number; elite: number; boss: number; secret: number; gold: number; dmg: number };
  flags: Record<string, any>; endless: boolean;
}
export interface Grave { floor: number; cls: string; t: number; gold: number; words: number; taken?: 1; }
export interface Meta {
  shards: number; ore: number; herbs: number;
  cls: Record<string, 1>; tal: Record<string, number>; codex: Record<string, 1>; ach: Record<string, number>;
  stats: { runs: number; deaths: number; kills: number; bestFloor: number; wins: number; playtime: number; pd: number; parry: number; bosses: number };
  graves: Grave[]; tut: number;
}
export interface Hub { last: number; lv: Record<string, number>; jobs: any[]; stock: Record<string, number>; }
export interface Slot { id: number; v: number; created: number; updated: number; name: string; meta: Meta; hub: Hub; run: Run | null; }
export interface Settings { sfx: number; music: number; shake: boolean; diff: string; btnScale: number; quality: 'high' | 'low'; multi: boolean; name: string; aimAssist: boolean; }

export const newMeta = (): Meta => ({
  shards: 0, ore: 0, herbs: 0, cls: { knight: 1 }, tal: {}, codex: {}, ach: {},
  stats: { runs: 0, deaths: 0, kills: 0, bestFloor: 0, wins: 0, playtime: 0, pd: 0, parry: 0, bosses: 0 },
  graves: [], tut: 0,
});
export const newHub = (now = Date.now()): Hub => ({ last: now, lv: {}, jobs: [], stock: {} });
export const newSettings = (): Settings => ({ sfx: 0.7, music: 0.5, shake: true, diff: 'normal', btnScale: 1, quality: 'high', multi: false, name: '', aimAssist: true });

/** 模擬世界：一次只有一個。畫面層每幀讀它、清空 ev。 */
export const W = {
  time: 0, run: null as Run | null, meta: null as Meta | null, ST: null as any,
  floor: null as any, room: null as any, p: null as any,
  ents: [] as any[], shots: [] as any[], haz: [] as any[], picks: [] as any[], objs: [] as any[],
  ev: [] as any[], in: emptyInput(),
  slow: 0, hitstop: 0, paused: false, over: null as null | 'dead' | 'win', overT: 0,
  near: null as any, boss: null as any, seq: 0, waveT: 0, dirty: false, assistOn: true,
};
export const emit = (k: string, o: any = {}) => { o.k = k; W.ev.push(o); return o; };
export const snd = (n: string) => { W.ev.push({ k: 'snd', n }); };
