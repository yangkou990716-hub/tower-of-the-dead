// 自動遊玩機器人：用於自動化測試與平衡統計（不是遊戲內容的一部分）。
// skill ∈ [0,1]：看到敵人出招時成功做出反應（閃避／彈反）的機率。
import { W, emptyInput, InputState } from './state';
import { T, RPW, RPH, dist, angTo, angDiff, abs, cos, sin, hypot, rnd, Mf, segDist } from './util';
import { WPN, KIND } from './data';
import { takeItem, useFire, nextFloor } from './combat';
import { DOOR_TILES } from './world';

export function mkBot(skill = 0.6, opts: { parry?: number; headless?: boolean } = { headless: true }) {
  let react = new Map<number, boolean>(), stuckT = 0, lastX = 0, lastY = 0, side = 1, goal: string | null = null, lastRoom = -1, lastFloor = -1;
  const decide = (uid: number) => { if (!react.has(uid)) react.set(uid, rnd() < skill); return react.get(uid)!; };
  /** 找出通往「最近的未探索房間」的第一步方向 */
  function nextDir(): string | null {
    const fl = W.floor, run = W.run!, start = run.cur; const prev = new Map<number, { from: number; dir: string }>(); const q = [start]; const seen = new Set([start]);
    while (q.length) {
      const id = q.shift()!; const def = fl.rooms[id];
      if (id !== start && !run.rooms[id]?.v) { let c = id, d = ''; while (c !== start) { const p = prev.get(c)!; d = p.dir; c = p.from; } return d; }
      for (const [dir, door] of Object.entries<any>(def.doors)) if (!seen.has(door.to)) { seen.add(door.to); prev.set(door.to, { from: id, dir }); q.push(door.to); }
    }
    // 全部探索完 → 去有樓梯的房間
    const tgt = fl.rooms.find((r: any) => r.type === 'exit' || r.type === 'boss'); if (!tgt || tgt.id === start) return null;
    let c = tgt.id, d = ''; while (c !== start) { const p = prev.get(c); if (!p) return null; d = p.dir; c = p.from; } return d;
  }
  return function bot(dt: number): InputState {
    const I = emptyInput(), p = W.p, run = W.run!, S = W.ST; if (!p || p.dead) { if (opts.headless !== false) W.ev.length = 0; return I; }
    if (run.cur !== lastRoom || run.floor !== lastFloor) { goal = null; lastRoom = run.cur; lastFloor = run.floor; }
    const w = WPN[run.wpn.id], k = KIND[w.k], range = k.proj ? 300 : k.rng * S.range;
    // UI 事件（測試時沒有畫面，直接處理）
    if (opts.headless !== false) { const evs = W.ev.splice(0); for (const ev of evs) if (ev.k === 'ui') {
      if (ev.p === 'item') { if (!takeItem(ev.o) && ev.o.it.kind === 'rune') takeItem(ev.o, 0); if (!ev.o.dead) ev.o.used = true; }
      else if (ev.p === 'fire') useFire(ev.o, run.hp < S.maxHp * 0.7 ? 'rest' : 'forge');
      else if (ev.p === 'stairs') { nextFloor(); return I; }
    } }
    let tgt: any = null, td = 1e9; for (const e of W.ents) { if (e.dead) continue; const d = dist(e, p); if (d < td) { td = d; tgt = e; } }
    const go = (x: number, y: number, sp = 1) => { const a = Math.atan2(y - p.y, x - p.x); I.mx = cos(a) * sp; I.my = sin(a) * sp; };
    /** 沿格子最短路徑走向目標（繞過障礙物） */
    const nav = (gx: number, gy: number) => {
      const g = W.room.g, sx = Mf(p.x / T), sy = Mf(p.y / T), ex = Mf(gx / T), ey = Mf(gy / T);
      if (sx === ex && sy === ey) return go(gx, gy);
      const ok = (x: number, y: number) => { const t = g[y]?.[x]; return t === 0 || t === 9 || t === 4 || t === 5 || t === 6; };
      const prev = new Map<number, number>(); const key = (x: number, y: number) => y * 100 + x; const q = [[ex, ey]]; prev.set(key(ex, ey), -1);
      while (q.length) { const [x, y] = q.shift()!; if (x === sx && y === sy) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, kk = key(nx, ny); if (ok(nx, ny) && !prev.has(kk)) { prev.set(kk, key(x, y)); q.push([nx, ny]); } } }
      const nk = prev.get(key(sx, sy)); if (nk === undefined || nk < 0) return go(gx, gy);
      const nx = nk % 100, ny = Mf(nk / 100); const cx = sx * T + T / 2, cy = sy * T + T / 2;
      // 先靠近目前格子中心線再轉向，避免卡角
      if (nx !== sx && abs(p.y - cy) > 6) go(p.x + (nx - sx) * 8, cy); else if (ny !== sy && abs(p.x - cx) > 6) go(cx, p.y + (ny - sy) * 8); else go(nx * T + T / 2, ny * T + T / 2);
    };
    // 卡住偵測 → 側移
    stuckT += dt; if (stuckT > 0.5) { if (hypot(p.x - lastX, p.y - lastY) < 6 && (I.mx || I.my || true)) side = -side; lastX = p.x; lastY = p.y; stuckT = 0; }
    // 危險偵測
    let danger: any = null, canParry = false;
    for (const e of W.ents) {
      if (e.dead || !e.atk) continue; const a = e.atk, d = dist(e, p);
      if (e.state === 'wind' && e.t < 0.2) {
        if (a.t === 'swing' && d < a.reach + 26) { danger = e; canParry = true; }
        else if (a.t === 'slam' && d < a.rad + 20) danger = e;
        else if (a.t === 'dash' && segDist(p.x, p.y, e.x, e.y, e.x + cos(e.a) * a.spd * a.dur, e.y + sin(e.a) * a.spd * a.dur) < 34) { danger = e; canParry = true; }
      } else if (e.state === 'act' && a.t === 'dash' && d < 70) { danger = e; canParry = true; }
    }
    for (const h of W.haz) if (h.k === 'blast' && h.from === 'e' && h.t < 0.28 && dist(h, p) < h.r + 14) danger = h;
    for (const s of W.shots) if (s.from === 'e' && dist(s, p) < 54 && abs(angDiff(Math.atan2(s.vy, s.vx), angTo(s, p))) < 0.6) { danger = s; canParry = true; }
    if (danger && decide(danger.uid) && p.dodgeT <= 0 && p.inv <= 0) {
      if (canParry && rnd() < (opts.parry ?? 0.3) && p.parryCd <= 0 && p.sta > 12) I.parry = true;
      else if (p.sta > S.dodgeCost * 0.5) { const a = angTo(danger, p) + (PIH * side); I.mx = cos(a); I.my = sin(a); I.dodge = true; }
    }
    if (tgt) {
      I.aim = angTo(p, tgt);
      if (!I.dodge) {
        const low = run.hp < S.maxHp * 0.4;
        if (low && run.potions > 0 && td > 130 && p.potT <= 0) I.potion = true;
        if (td > range * 0.8 + tgt.r) nav(tgt.x, tgt.y);
        else if (k.proj && td < 150) go(p.x - cos(I.aim), p.y - sin(I.aim));
        else if (p.sta < 15) go(p.x - cos(I.aim) + sin(I.aim) * side, p.y - sin(I.aim) - cos(I.aim) * side, 0.8);
        if (td <= range + tgt.r && p.sta > 22 && tgt.state !== 'spawn') { I.attack = true; }
        if (p.cds[0] <= 0 && td < 160 && rnd() < 0.02) I.s1 = true;
        if (p.cds[1] <= 0 && rnd() < 0.01) I.s2 = true;
      }
      goal = null;
    } else {
      // 撿東西
      let o: any = null, od = 1e9; for (const x of W.objs) { if (x.dead || x.used) continue; const d = dist(x, p); if (d < od) { od = d; o = x; } }
      if (o && (o.k !== 'stairs' || !nextDir() || W.floor.rooms[run.cur].type === 'exit' || W.floor.rooms[run.cur].type === 'boss')) {
        if (o.k === 'stairs' && nextDir() && W.floor.rooms.some((r: any) => !run.rooms[r.id]?.v)) o = null; // 先探索完
        if (o) { if (od > 34) nav(o.x, o.y + 14); else I.interact = true; if (run.hp < S.maxHp * 0.5 && run.potions > 0) I.potion = true; return I; }
      }
      if (W.room.cleared) {
        goal = goal || nextDir();
        if (goal) { const [dx, dy] = DOOR_TILES[goal][1]; const gx = dx * T + T / 2, gy = dy * T + T / 2;
          nav(gx, gy);
        }
      }
    }
    return I;
  };
}
const PIH = Math.PI / 2;
