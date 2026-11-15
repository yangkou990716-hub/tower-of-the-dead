// 樓層與房間生成。全部由種子決定：同種子、同層數 → 完全相同的地圖。
import { RNG, hash, RW, RH, T, Rng, hypot } from './util';
import { biomeOf } from './data';

export const DIRS: Record<string, [number, number, string]> = { n: [0, -1, 's'], e: [1, 0, 'w'], s: [0, 1, 'n'], w: [-1, 0, 'e'] };
export const DOOR_TILES: Record<string, [number, number][]> = {
  n: [[12, 0], [13, 0], [14, 0]], s: [[12, RH - 1], [13, RH - 1], [14, RH - 1]],
  w: [[0, 6], [0, 7], [0, 8]], e: [[RW - 1, 6], [RW - 1, 7], [RW - 1, 8]],
};
export const COMBAT_TYPES = ['combat', 'elite', 'exit', 'boss'];
// 格子代碼：0 地板｜1 牆｜2 障礙物｜4 熔岩｜5 尖刺｜6 泥沼｜9 門
export const SOLID = (t: number | undefined) => t === undefined || t === 1 || t === 2;

export interface RoomDef { id: number; gx: number; gy: number; type: string; doors: Record<string, { to: number; secret?: boolean }>; seed: number; dist: number; }
export interface Floor { floor: number; rooms: RoomDef[]; gw: number; gh: number; }

/** 產生一層樓的房間圖。features：這個版本已實作的特殊房型。 */
export function genFloor(seed: number, floor: number, features: string[] = ['treasure', 'campfire']): Floor {
  const r = RNG(hash(seed, floor, 7));
  const GW = 7, GH = 5, cell: Record<string, RoomDef> = {}, rooms: RoomDef[] = [];
  const key = (x: number, y: number) => x + ',' + y;
  const add = (x: number, y: number, type: string) => { const rm: RoomDef = { id: rooms.length, gx: x, gy: y, type, doors: {}, seed: hash(seed, floor, x * 31 + y, 99), dist: 0 }; rooms.push(rm); cell[key(x, y)] = rm; return rm; };
  add(3, 2, 'start');
  const target = Math.min(14, 9 + Math.floor(floor / 3) + r.int(0, 2));
  const dirs = Object.entries(DIRS);
  let guard = 0;
  while (rooms.length < target && guard++ < 4000) {
    const b = r.pick(rooms), [dn, [dx, dy, opp]] = r.pick(dirs), x = b.gx + dx, y = b.gy + dy;
    if (x < 0 || y < 0 || x >= GW || y >= GH || cell[key(x, y)]) continue;
    let nb = 0; for (const [, [ex, ey]] of dirs) if (cell[key(x + ex, y + ey)]) nb++;
    if (nb > 1 && r() < 0.8) continue;           // 避免擠成一團，保留分支與死路
    if (b.id === 0 && Object.keys(b.doors).length >= 3) continue;
    const n = add(x, y, 'combat'); b.doors[dn] = { to: n.id }; n.doors[opp] = { to: b.id };
  }
  // 少量環路，讓探索不只是樹狀
  for (const a of rooms) for (const [dn, [dx, dy, opp]] of dirs) {
    const b = cell[key(a.gx + dx, a.gy + dy)];
    if (b && !a.doors[dn] && a.id < b.id && a.id !== 0 && r() < 0.12) { a.doors[dn] = { to: b.id }; b.doors[opp] = { to: a.id }; }
  }
  // 與起點的距離
  const q = [rooms[0]]; const seen = new Set([0]);
  while (q.length) { const a = q.shift()!; for (const d of Object.values(a.doors)) if (!seen.has(d.to)) { seen.add(d.to); rooms[d.to].dist = a.dist + 1; q.push(rooms[d.to]); } }
  const far = rooms.filter((x) => x.id !== 0).sort((a, b) => b.dist - a.dist || a.id - b.id);
  const dead = far.filter((x) => Object.keys(x.doors).length === 1);
  const isBoss = floor % 3 === 0;
  const end = dead[0] || far[0]; end.type = isBoss ? 'boss' : 'exit';
  const pool = dead.filter((x) => x !== end);
  const take = (type: string) => { const x = pool.shift() || far.find((y) => y.type === 'combat' && y.dist >= 1); if (x) x.type = type; return x; };
  if (features.includes('treasure')) take('treasure');
  if (features.includes('shop')) take('shop');
  if (features.includes('altar') && r.chance(0.65)) take('altar');
  if (features.includes('campfire')) {
    const adj = rooms[Object.values(end.doors)[0].to];
    if (isBoss && adj.type === 'combat') adj.type = 'campfire';
    else { const c = far.filter((x) => x.type === 'combat' && x.dist >= 2); if (c.length) r.pick(c).type = 'campfire'; }
  }
  const combats = r.shuffle(rooms.filter((x) => x.type === 'combat' && x.dist >= 2));
  const ne = floor >= 2 ? (floor >= 7 ? 2 : 1) : 0;
  for (let i = 0; i < ne && i < combats.length; i++) combats[i].type = 'elite';
  if (features.includes('event')) { const ev = combats.slice(ne, ne + r.int(1, 2)); for (const x of ev) x.type = 'event'; }
  return { floor, rooms, gw: GW, gh: GH };
}

export interface Room { def: RoomDef; g: number[][]; biome: any; type: string; cleared: boolean; locked: boolean; wavesLeft: number; spikeT: number; spikeUp: boolean; spikeN: number; floor: number; }

/** 依房間定義蓋出格子地圖。 */
export function buildRoom(def: RoomDef, floor: number): Room {
  const r = RNG(def.seed), biome = biomeOf(floor);
  const g: number[][] = [];
  for (let y = 0; y < RH; y++) { g.push([]); for (let x = 0; x < RW; x++) g[y].push(x === 0 || y === 0 || x === RW - 1 || y === RH - 1 ? 1 : 0); }
  const doorTiles: [number, number][] = [];
  for (const d in def.doors) for (const [x, y] of DOOR_TILES[d]) { g[y][x] = 9; doorTiles.push([x, y]); }
  const nearDoor = (x: number, y: number, n = 3) => doorTiles.some(([dx, dy]) => Math.abs(dx - x) <= n && Math.abs(dy - y) <= n);
  const put = (x: number, y: number, v: number) => { if (x > 0 && y > 0 && x < RW - 1 && y < RH - 1 && g[y][x] === 0 && !nearDoor(x, y, 2)) g[y][x] = v; };
  const SHAPES = [[[0, 0]], [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]];
  if (['combat', 'elite', 'exit'].includes(def.type)) {
    // 障礙物放在 3 格間距的格點上、左右鏡射 → 永遠不會把路堵死
    const dens = r.rr(0.12, 0.5), vsym = r.chance(0.4);
    for (const lx of [4, 7, 10]) for (const ly of vsym ? [3, 7] : [3, 7, 11]) {
      if (!r.chance(dens)) continue;
      const sh = r.pick(SHAPES), w = Math.max(...sh.map((s) => s[0])) + 1, h = Math.max(...sh.map((s) => s[1])) + 1;
      for (const [sx, sy] of sh) {
        put(lx + sx, ly + sy, 2); put(RW - 1 - lx - (w - 1) + sx, ly + sy, 2);
        if (vsym && ly !== 7) { put(lx + sx, RH - 1 - ly - (h - 1) + sy, 2); put(RW - 1 - lx - (w - 1) + sx, RH - 1 - ly - (h - 1) + sy, 2); }
      }
    }
    // 地形危害（每個生態域不同）
    const nh = r.int(0, 3);
    for (let i = 0; i < nh; i++) {
      const cx = r.int(3, RW - 4), cy = r.int(3, RH - 4), rad = r.rr(1.2, 2.4);
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++)
        if (hypot(x - cx, y - cy) + r.rr(-0.4, 0.4) < rad) put(x, y, biome.haz);
    }
  } else if (def.type === 'boss') {
    for (const [x, y] of [[4, 3], [22, 3], [4, 11], [22, 11]]) g[y][x] = 2;
  } else if (def.type !== 'start') {
    for (const [x, y] of [[3, 3], [23, 3], [3, 11], [23, 11]]) if (r.chance(0.7)) put(x, y, 2);
  }
  return { def, g, biome, type: def.type, cleared: false, locked: false, wavesLeft: 0, spikeT: 0, spikeUp: false, spikeN: 0, floor };
}

export function freeTiles(room: Room, pred?: (x: number, y: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) if (room.g[y][x] === 0 && (!pred || pred(x, y))) out.push([x, y]);
  return out;
}
export const tileCenter = (x: number, y: number) => ({ x: x * T + T / 2, y: y * T + T / 2 });
export function doorDirAt(tx: number, ty: number): string | null {
  for (const d in DOOR_TILES) if (DOOR_TILES[d].some(([x, y]) => x === tx && y === ty)) return d;
  return null;
}
export type { Rng };
