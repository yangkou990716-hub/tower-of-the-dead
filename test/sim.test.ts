import { describe, it, expect } from 'vitest';
import { W, newMeta } from '../src/sim/state';
import { newRun, startRun, step } from '../src/sim/combat';
import { genFloor, buildRoom, SOLID } from '../src/sim/world';
import { mkBot } from '../src/sim/bot';
import { RW, RH } from '../src/sim/util';

function play(cls: string, skill: number, seed: number, maxSec = 900, diff = 'normal') {
  W.meta = newMeta(); const run = newRun(cls, diff, seed); startRun(run);
  const bot = mkBot(skill); const dt = 1 / 60; let t = 0, input = W.in;
  while (!W.over && t < maxSec) { step(dt, () => { W.in = bot(dt); }); t += dt; }
  return { floor: run.floor, over: W.over, time: Math.round(run.time), kills: run.kills, hp: Math.round(run.hp), rooms: Object.keys(run.rooms).length, stats: run.stats };
}

describe('地圖生成', () => {
  it('每層都連通、有出口，且房間內所有地板可達', () => {
    for (let seed = 1; seed <= 60; seed++) for (const floor of [1, 2, 3, 5, 9, 15]) {
      const fl = genFloor(seed * 7919, floor);
      expect(fl.rooms.length).toBeGreaterThanOrEqual(9);
      expect(fl.rooms.filter((r) => r.type === (floor % 3 === 0 ? 'boss' : 'exit')).length).toBe(1);
      // 連通
      const seen = new Set([0]); const q = [0];
      while (q.length) { const a = fl.rooms[q.shift()!]; for (const d of Object.values(a.doors)) if (!seen.has(d.to)) { seen.add(d.to); q.push(d.to); } }
      expect(seen.size).toBe(fl.rooms.length);
      // 門成對
      for (const a of fl.rooms) for (const [dir, d] of Object.entries(a.doors)) { const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[dir]!; expect(fl.rooms[d.to].doors[opp]?.to).toBe(a.id); }
      // 房內可達性
      for (const def of fl.rooms) {
        const room = buildRoom(def, floor); const pass = (x: number, y: number) => !SOLID(room.g[y]?.[x]);
        let sx = 13, sy = 7; expect(pass(sx, sy)).toBe(true);
        const vis = new Set<string>([sx + ',' + sy]); const qq = [[sx, sy]];
        while (qq.length) { const [x, y] = qq.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx >= 0 && ny >= 0 && nx < RW && ny < RH && pass(nx, ny) && !vis.has(k)) { vis.add(k); qq.push([nx, ny]); } } }
        let total = 0; for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (pass(x, y)) total++;
        expect(vis.size).toBe(total);
      }
    }
  });
  it('同種子產生相同地圖', () => {
    expect(JSON.stringify(genFloor(12345, 4))).toBe(JSON.stringify(genFloor(12345, 4)));
  });
});

describe('自動遊玩（模擬不當機、流程可前進）', () => {
  it('四個職業各跑數趟', () => {
    const rows: any[] = [];
    for (const cls of ['knight', 'ranger', 'rogue', 'mage']) for (const skill of [0.35, 0.7, 0.95]) {
      let sum = 0, best = 0; const n = 6;
      for (let i = 0; i < n; i++) { const r = play(cls, skill, 1000 + i * 37 + skill * 100, 1200); sum += r.floor; best = Math.max(best, r.floor); expect(Number.isFinite(r.hp)).toBe(true); }
      rows.push({ cls, skill, avgFloor: +(sum / n).toFixed(1), best });
    }
    console.table(rows);
    expect(rows.some((r) => r.best >= 3)).toBe(true);
  }, 120000);
});
