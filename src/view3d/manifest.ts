// 3D 資產清單：sim 只認自己的 id（敵人 id、格子代碼、物件種類），這裡把它們對應到模型檔、縮放與動畫名稱。
// 換美術 = 換模型檔與這份清單，不必改 sim、Scene3D 或渲染流程。
// 目前內容是 KayKit（CC0）暫用素材，不代表最終美術。
//
// 規則：
// - file 是 public/<DIR> 下的 glTF 二進位檔（不含副檔名）。角色檔需含骨架與動畫。
// - 動畫用「角色」對應（idle、move…），模型沒有的動畫自動略過，不會出錯。
// - 敵人 scale 是基準值，實際大小還會乘上 sqrt(碰撞半徑 / 12)，與 sim 的 e.r 一致。
// - 找不到對應的敵人 id 會用 ENEMY_DEFAULT；整包載入失敗則退回程序化模型（room.ts / actors.ts 內建）。

export const DIR = 'models/kaykit/';

export interface AnimMap { idle: string; move: string; attack: string; hit: string; die: string; spawn?: string; dodge?: string; cast?: string; }
export interface CharSpec {
  file: string; scale: number; anim: AnimMap;
  /** 掛在骨頭上的道具：骨頭名稱 → 模型檔 */
  attach?: Record<string, string>;
  /** 模型內要隱藏的網格（名稱比對），keep 優先 */
  hide?: RegExp; keep?: string[];
  /** 提燈要掛的骨頭（只有玩家） */
  lanternBone?: RegExp;
}

export const PLAYER: CharSpec = {
  file: 'Knight', scale: 0.48,
  anim: { idle: 'Idle', move: 'Running_A', attack: '1H_Melee_Attack_Slice_Diagonal', hit: 'Hit_A', die: 'Death_A', dodge: 'Dodge_Forward' },
  hide: /Shield|Sword|Axe|Offhand/i, keep: ['1H_Sword', 'Round_Shield'], lanternBone: /hand.?slot.?l|handslot\.l|hand\.l|lowerarm\.l/i,
};

const SK = { idle: 'Idle_Combat', move: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', die: 'Death_A', spawn: 'Spawn_Ground_Skeletons' };
export const ENEMIES: Record<string, CharSpec> = {
  slime: { file: 'Skeleton_Minion', scale: 0.46, anim: SK, attach: { 'handslot.r': 'Skeleton_Blade' } },
  hound: { file: 'Skeleton_Rogue', scale: 0.46, anim: { ...SK, move: 'Running_A' }, attach: { 'handslot.r': 'Skeleton_Blade', 'handslot.l': 'Skeleton_Blade' } },
  spitter: { file: 'Skeleton_Mage', scale: 0.46, anim: { ...SK, attack: 'Spellcast_Shoot' }, attach: { 'handslot.r': 'Skeleton_Staff' } },
  guard: { file: 'Skeleton_Warrior', scale: 0.46, anim: SK, attach: { 'handslot.r': 'Skeleton_Blade', 'handslot.l': 'Skeleton_Shield_Large_A' } },
  matriarch: { file: 'Skeleton_Warrior', scale: 0.46, anim: { ...SK, attack: '2H_Melee_Attack_Chop' }, attach: { 'handslot.r': 'Skeleton_Axe' } },
};
export const ENEMY_DEFAULT = 'slime';

/** 場景件：每個「角色」對應一個或多個模型（多個時依權重隨機）。s = 縮放，h = 高度縮放。 */
export const ENV = {
  /** 地板：1×1 格 */
  floor: [{ file: 'floor_tile_small', w: 0.72, s: 0.5 }, { file: 'floor_tile_small_broken_A', w: 0.12, s: 0.5 }, { file: 'floor_tile_small_weeds_A', w: 0.09, s: 0.5 }, { file: 'floor_dirt_small_A', w: 0.07, s: 0.5 }],
  /** 牆：原寬 4、高 4；s 讓一段 = 2 格寬 */
  wall: { file: 'wall', s: 0.5 },
  /** 門：門框＋門扇（門扇在房間上鎖時顯示） */
  door: { file: 'wall_doorway', leaf: 'wall_doorway_door', s: 0.75, h: 0.5 },
  /** 障礙物（格子代碼 2） */
  obstacle: [{ file: 'pillar', w: 0.6, s: 0.6, h: 0.4 }, { file: 'barrel_large', w: 0.2, s: 0.45 }, { file: 'box_small', w: 0.2, s: 0.45 }],
  corner: { file: 'pillar', s: 0.5, h: 0.55 },
  brazierBase: { file: 'column', s: 0.45 },
  chest: { file: 'chest', s: 0.42 },
};

/** 需要下載的所有模型檔（去重）。 */
export function modelFiles(): string[] {
  const s = new Set<string>([PLAYER.file]);
  for (const e of Object.values(ENEMIES)) { s.add(e.file); for (const f of Object.values(e.attach || {})) s.add(f); }
  for (const v of Object.values(ENV)) for (const x of Array.isArray(v) ? v : [v]) s.add(x.file);
  return [...s];
}
/** 依權重挑一個（r ∈ [0,1)）。 */
export function pick<T extends { w: number }>(list: T[], r: number): T { let a = 0; const tot = list.reduce((n, x) => n + x.w, 0); for (const x of list) { a += x.w / tot; if (r < a) return x; } return list[list.length - 1]; }
