// 戰鬥模擬：玩家、敵人、投射物、危害區、拾取物、房間流程。純邏輯，不碰畫面。
import { W, emit, snd, Run, emptyInput } from './state';
import { TAU, T, RW, RH, RPW, RPH, sin, cos, abs, min, max, round, hypot, PI, Mf, clamp, dist, angTo, angDiff, turn, rnd, rr, RNG, hash, segDist, Rng } from './util';
import { WPN, KIND, RUNE, RELIC, CLS, EN, DIFF, EL, biomeOf } from './data';
import { genFloor, buildRoom, DOOR_TILES, DIRS, COMBAT_TYPES, SOLID, freeTiles, tileCenter, doorDirAt } from './world';

export const FEATURES = ['treasure', 'campfire'];
const DODGE_T = 0.3;

// ================= 數值 =================
export function calcStats() {
  const run = W.run!, c = CLS[run.cls], m: any = W.meta?.tal || {}, D = DIFF[run.diff] || DIFF.normal;
  const S: any = {
    maxHp: c.hp + (m.hp || 0) * 8, maxSta: c.sta + (m.sta || 0) * 6, staRegen: 38, speed: c.spd,
    dmg: 1 + (m.dmg || 0) * 0.04, crit: 0.05 + (m.crit || 0) * 0.03, critMult: 1.8, armor: (m.arm || 0) * 0.04,
    potMax: 3 + (m.pot || 0), iframe: 0.25 + D.ifr, parryWin: 0.2 + (c.parry || 0), dodgeCost: 22 * (c.dodge || 1),
    cdr: 1, goldMult: 1, shardMult: (1 + (m.shard || 0) * 0.1) * D.shard, shopMult: 1 - (m.shop || 0) * 0.05, slots: 2,
    leech: 0, exec: 0, aspd: 1, range: 1, staCost: 1, vsStag: 0, echo: 0, ward: 0, heavy: 1, hpMul: 1, luck: 0, killHeal: 0, roomHeal: 0, els: [] as string[],
  };
  for (const id of run.relics) RELIC[id]?.st(S);
  for (const id of run.runes) RUNE[id]?.st(S);
  const w = WPN[run.wpn.id] || WPN.iron;
  if (w.el) S.els.push(w.el);
  if (w.sp === 'exec') S.exec += 0.5;
  if (w.sp === 'vsStag') S.vsStag += 0.6;
  S.els = [...new Set(S.els)];
  S.maxHp = round(S.maxHp * S.hpMul); S.armor = min(0.6, S.armor);
  W.ST = S; if (run.hp > S.maxHp) run.hp = S.maxHp;
  return S;
}
export const weaponDmg = () => { const run = W.run!; return (WPN[run.wpn.id] || WPN.iron).dmg * (1 + 0.15 * run.wpn.lv) * W.ST.dmg; };

/** 清掉存檔裡已不存在的物品 id（版本更新後內容被移除時）。 */
export function sanitizeRun(run: Run): Run {
  if (!CLS[run.cls]) run.cls = 'knight';
  if (!WPN[run.wpn?.id]) run.wpn = { id: CLS[run.cls].wpn, lv: run.wpn?.lv || 0 };
  run.runes = (run.runes || []).filter((x) => RUNE[x]); run.relics = (run.relics || []).filter((x) => RELIC[x]);
  if (!DIFF[run.diff]) run.diff = 'normal';
  run.rooms = run.rooms || {}; run.flags = run.flags || {};
  return run;
}

export function newRun(cls: string, diff: string, seed = (Math.random() * 2 ** 32) >>> 0, daily: string | null = null): Run {
  const m: any = W.meta?.tal || {};
  const run: Run = { seed, floor: 1, cls, diff, daily, hp: 1, potions: 0, gold: (m.gold || 0) * 25, wpn: { id: CLS[cls].wpn, lv: 0 }, runes: [], relics: [],
    time: 0, kills: 0, cur: 0, rooms: {}, stats: { pd: 0, parry: 0, hit: 0, elite: 0, boss: 0, secret: 0, gold: 0, dmg: 0 }, flags: {}, endless: false };
  W.run = run; calcStats(); run.hp = W.ST.maxHp; run.potions = W.ST.potMax;
  return run;
}
/** 開始或接續一趟遠征。 */
export function startRun(run: Run) {
  W.run = sanitizeRun(run); W.over = null; W.overT = 0; W.time = 0; W.slow = 0; W.hitstop = 0; W.paused = false; W.ev.length = 0; W.in = emptyInput();
  calcStats(); W.p = mkPlayer();
  W.floor = genFloor(run.seed, run.floor, FEATURES);
  W.room = null; enterRoom(run.rooms[run.cur] ? run.cur : 0);
}

// ================= 碰撞 =================
function solidAt(tx: number, ty: number, isP: boolean) {
  const t = W.room.g[ty]?.[tx];
  if (t === 9) return !isP || W.room.locked;
  return SOLID(t);
}
function collides(e: any, isP: boolean) {
  const r = e.r * 0.85, x0 = Mf((e.x - r) / T), x1 = Mf((e.x + r) / T), y0 = Mf((e.y - r) / T), y1 = Mf((e.y + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty, isP)) {
    const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
    if (hypot(e.x - cx, e.y - cy) < r) return true;
  }
  return false;
}
/** 分軸移動，回傳實際移動距離。 */
export function moveEnt(e: any, dx: number, dy: number) {
  const ox = e.x, oy = e.y, isP = e === W.p;
  if (dx) { e.x += dx; if (collides(e, isP)) e.x = ox; }
  if (dy) { e.y += dy; if (collides(e, isP)) e.y = oy; }
  return hypot(e.x - ox, e.y - oy);
}
const solidPx = (x: number, y: number) => SOLID(W.room.g[Mf(y / T)]?.[Mf(x / T)]) || W.room.g[Mf(y / T)]?.[Mf(x / T)] === 9;

// ================= 玩家 =================
export function mkPlayer() {
  return { x: RPW / 2, y: RPH / 2, r: 11, vx: 0, vy: 0, aim: 0, moving: false, mvx: 0, mvy: 0, sta: W.ST.maxSta, inv: 0,
    dodgeT: 0, dodgeAge: 9, ddx: 0, ddy: 0, pdDone: false, dashK: null as any, parryT: 0, parryCd: 0, parryFail: 0,
    atkCd: 0, atkLock: 0, atkHeavy: false, bufAtk: 0, holdT: 0, charge: 0, staDelay: 0, hurt: 0, cds: [0, 0], potT: 0, potHeal: false,
    buff: { cry: 0, smoke: 0, pd: 0, smokeCrit: 0 } as Record<string, number>, shield: 0, combo: 0, comboT: 0, hitN: 0,
    st: { burn: 0, poison: 0, chill: 0, tick: 0 } as Record<string, number>, dead: false, swing: null as any, swingSide: 1, spikeHit: -1, anim: 0 };
}
const P_TIMERS = ['inv', 'parryCd', 'atkCd', 'atkLock', 'hurt', 'potT', 'staDelay', 'parryFail', 'bufAtk'];

export function heal(v: number, quiet = false) {
  const run = W.run!, b = run.hp; run.hp = min(W.ST.maxHp, run.hp + v);
  const g = round(run.hp - b); if (g > 0 && !quiet) emit('dmg', { x: W.p.x, y: W.p.y - 34, v: g, heal: true });
}
function dotPlayer(d: number) { const run = W.run!; if (run.hp > 1) { run.hp = max(1, run.hp - d); emit('dmg', { x: W.p.x, y: W.p.y - 30, v: d, hurt: true, small: true }); } }

function tryDodge() {
  const p = W.p, S = W.ST, I = W.in;
  if (p.dodgeT > 0 || p.sta <= 0) { if (p.sta <= 0) snd('deny'); return; }
  let dx = I.mx, dy = I.my; const m = hypot(dx, dy);
  if (m < 0.2) { dx = cos(p.aim); dy = sin(p.aim); } else { dx /= m; dy /= m; }
  p.sta = max(0, p.sta - S.dodgeCost); p.staDelay = p.sta <= 0 ? 0.9 : 0.4;
  p.dodgeT = DODGE_T; p.dodgeAge = 0; p.ddx = dx; p.ddy = dy; p.pdDone = false; p.dashK = null; p.charge = 0; p.parryT = 0; p.potT = 0; p.potHeal = false;
  snd('dodge'); emit('dodge', { x: p.x, y: p.y, a: Math.atan2(dy, dx) });
}
function tryParry() {
  const p = W.p, S = W.ST;
  if (p.parryCd > 0 || p.sta <= 0 || p.potT > 0) return;
  p.sta = max(0, p.sta - 10); p.staDelay = 0.4; p.parryT = S.parryWin; p.parryCd = 0.65; p.charge = 0;
  snd('swing'); emit('parrytry', {});
}
function tryPotion() {
  const p = W.p, run = W.run!;
  if (p.potT > 0) return;
  if (run.potions <= 0 || run.hp >= W.ST.maxHp) { snd('deny'); return; }
  run.potions--; p.potT = 0.75; p.potHeal = true; p.charge = 0; emit('drink', {});
}
function perfectDodge(src: any) {
  const p = W.p, S = W.ST, run = W.run!;
  W.slow = 0.9 * (S.pdLong || 1); p.buff.pd = 3; p.sta = min(S.maxSta, p.sta + 22); p.staDelay = 0;
  run.stats.pd++; if (S.pdHeal) heal(S.pdHeal);
  snd('pdodge'); emit('pdodge', { x: p.x, y: p.y });
}
function parryOk(src: any, o: any) {
  const p = W.p, S = W.ST, run = W.run!;
  p.parryT = 0; p.parryCd = 0.15; p.sta = min(S.maxSta, p.sta + 18); p.staDelay = 0; p.inv = max(p.inv, 0.25);
  run.stats.parry++; W.hitstop = max(W.hitstop, 0.09);
  snd('parry'); emit('parry', { x: p.x, y: p.y, a: src ? angTo(p, src) : p.aim });
  if (src && src.d && !o.shot) { src.state = 'stag'; src.t = src.boss ? 1.1 : 1.7; src.rep = 0; emit('stag', { e: src }); }
  if (S.parryBlast) for (const e of W.ents) if (!e.dead && dist(e, p) < 120 + e.r) hitEnemy(e, weaponDmg() * 1.2, { from: p, kb: 200, chain: true });
}
/** 玩家受擊。回傳 'hit' | 'dodge' | 'parry' | 'none'。 */
export function hitPlayer(dmg: number, src: any, o: any = {}): string {
  const p = W.p, S = W.ST, run = W.run!;
  if (p.dead || W.over) return 'none';
  if (p.dodgeT > 0 && p.dodgeAge < S.iframe) {
    if (p.dodgeAge < 0.17 && !p.pdDone && !o.trap) { p.pdDone = true; perfectDodge(src); }
    return 'dodge';
  }
  if (p.inv > 0) return 'none';
  if (p.parryT > 0 && !o.noParry) { parryOk(src, o); return 'parry'; }
  let d = dmg * (1 - S.armor); if (p.buff.cry > 0) d *= 0.7;
  d = max(1, round(d));
  if (p.shield > 0) { const a = min(p.shield, d); p.shield -= a; d -= a; }
  run.hp -= d; run.stats.hit++; run.flags.bossHit = 1;
  p.inv = 0.7; p.hurt = 0.35; p.charge = 0; p.combo = 0; p.potHeal = false; p.potT = 0;
  const from = o.pos || src;
  if (from) { const a = angTo(from, p); p.vx += cos(a) * 240; p.vy += sin(a) * 240; }
  if (o.eff === 'poison') p.st.poison = 4; else if (o.eff === 'fire') p.st.burn = 3; else if (o.eff === 'ice') p.st.chill = 2.5;
  if (S.thorns && src && src.d && !o.shot && !src.dead) hitEnemy(src, S.thorns, { dot: true, col: '#c9a25a' });
  W.hitstop = max(W.hitstop, 0.11);
  snd('hurt'); emit('phit', { x: p.x, y: p.y, v: d }); emit('dmg', { x: p.x, y: p.y - 34, v: d, hurt: true });
  if (run.hp <= 0) {
    if (S.phoenix && !run.flags.phoenix) {
      run.flags.phoenix = 1; run.relics = run.relics.filter((x) => x !== 'phoenix'); calcStats();
      run.hp = round(W.ST.maxHp * 0.5); p.inv = 2; W.slow = 1; emit('revive', { x: p.x, y: p.y }); snd('pdodge');
    } else { run.hp = 0; p.dead = true; W.overT = 1.8; W.slow = 0; snd('die'); emit('pdeath', { x: p.x, y: p.y }); }
  }
  return 'hit';
}

/** 觸控／手把的輔助瞄準：只在準星附近有敵人時微幅修正。 */
function assist(a: number, range: number) {
  let best: any = null, bd = 0.45;
  for (const e of W.ents) { if (e.dead) continue; const d = dist(W.p, e); if (d > range) continue; const df = abs(angDiff(angTo(W.p, e), a)); if (df < bd) { bd = df; best = e; } }
  return best ? angTo(W.p, best) : a;
}
/** 觸控攻擊鍵的自動瞄準目標：最近的敵人優先，面前的略為加權。 */
export function autoTarget(a: number, range: number) {
  let best: any = null, bs = 1e9;
  for (const e of W.ents) { if (e.dead || e.state === 'spawn') continue; const d = dist(W.p, e) - e.r; if (d > range) continue; const sc = d * (1 + abs(angDiff(angTo(W.p, e), a)) * 0.3); if (sc < bs) { bs = sc; best = e; } }
  return best;
}
export const autoRange = () => { const k = KIND[(WPN[W.run!.wpn.id] || WPN.iron).k]; return k.proj ? 470 : k.rng * W.ST.range * 2.6 + 50; };
function autoAim(a: number, range: number) { const t = autoTarget(a, range); return t ? angTo(W.p, t) : a; }
function canAct() { const p = W.p; return p.dodgeT <= 0 && p.potT <= 0 && p.parryFail <= 0; }

function doAttack(heavy: boolean, ck = 0) {
  const run = W.run!, S = W.ST, p = W.p, w = WPN[run.wpn.id], k = KIND[w.k], I = W.in;
  if (p.sta <= 0) { snd('deny'); emit('exhaust', {}); return; }
  p.sta = max(0, p.sta - k.sta * S.staCost * (heavy ? 1.6 : 1)); p.staDelay = p.sta <= 0 ? 0.9 : 0.4;
  if (p.sta <= 0) emit('exhaust', {});
  p.atkCd = (k.cd / S.aspd) * (heavy ? 1.35 : 1); p.atkLock = heavy ? 0.26 : 0.12; p.atkHeavy = heavy; p.bufAtk = 0;
  if (I.auto) p.aim = autoAim(p.aim, k.proj ? 470 : k.rng * 2.6 + 50);
  else if (I.repeat && W.assistOn !== false) p.aim = assist(p.aim, (k.proj ? 420 : k.rng * 2.2));
  let dmg = weaponDmg() * (heavy ? k.hv * S.heavy * (0.85 + 0.3 * ck) : 1);
  if (S.berserk && run.hp < S.maxHp * 0.4) dmg *= 1 + S.berserk;
  if (p.buff.cry > 0) dmg *= 1.3;
  const crit = p.buff.pd > 0 || p.buff.smokeCrit > 0; p.buff.pd = 0; p.buff.smokeCrit = 0; p.buff.smoke = 0;
  const col = EL[S.els[0]] || EL.none, ca = cos(p.aim), sa = sin(p.aim);
  if (k.proj) {
    const n = w.sp === 'twin' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = p.aim + (n > 1 ? (i - 0.5) * 0.13 : 0);
      mkShot('p', p.x + cos(a) * 16, p.y + sin(a) * 16, a, k.proj * S.range * (heavy ? 1.3 : 1), dmg, {
        kind: w.k === 'bow' ? 'arrow' : 'orb', heavy, crit, col, r: w.k === 'staff' ? (heavy ? 9 : 6) : 4,
        pierce: heavy && w.k === 'bow' ? 4 : w.sp === 'home' ? 2 : 0, home: w.sp === 'home',
        boom: (w.k === 'staff' && heavy) || (w.sp === 'boom' && heavy) ? 74 : 0 });
    }
    snd(w.k === 'bow' ? 'shoot' : 'cast'); p.vx -= ca * (heavy ? 120 : 40); p.vy -= sa * (heavy ? 120 : 40);
    emit('pshoot', { x: p.x, y: p.y, a: p.aim, heavy, col });
  } else {
    const rng = k.rng * S.range * (heavy ? 1.25 : 1), arc = k.arc * (heavy ? 1.25 : 1);
    p.swingSide *= -1; p.swing = { a: p.aim, arc, rng, t: 0, d: heavy ? 0.24 : 0.16, heavy, side: p.swingSide, kind: w.k };
    emit('swing', { x: p.x, y: p.y, a: p.aim, arc, rng, heavy, side: p.swingSide, kind: w.k, col });
    snd(heavy ? 'heavy' : 'swing'); p.vx += ca * (heavy ? 300 : 140); p.vy += sa * (heavy ? 300 : 140);
    let any = false;
    for (const e of [...W.ents]) {
      if (e.dead || e.state === 'spawn') continue;
      const d = dist(p, e); if (d > rng + e.r) continue;
      if (d > e.r + 10 && abs(angDiff(angTo(p, e), p.aim)) > arc / 2 + 0.12) continue;
      hitEnemy(e, dmg, { from: p, melee: true, heavy, crit, stag: heavy, kb: heavy ? 400 : 200, col }); any = true;
    }
    for (const s of W.shots) if (!s.dead && s.from === 'e' && heavy && dist(p, s) < rng && abs(angDiff(angTo(p, s), p.aim)) < arc / 2) killShot(s);
    if (heavy && w.sp === 'quake') mkHaz({ k: 'blast', from: 'p', x: p.x + ca * rng * 0.7, y: p.y + sa * rng * 0.7, r: 92, t: 0.12, dmg: dmg * 0.5, stag: true, col: '#c9a25a' });
    if (any) { W.hitstop = max(W.hitstop, heavy ? 0.12 : 0.055); emit('kick', { a: p.aim, f: heavy ? 1 : 0.45 }); }
  }
}
function handleAttack(dt: number) {
  const I = W.in, p = W.p;
  if (I.attack) p.bufAtk = 0.2;
  const ready = p.atkCd <= 0 && canAct();
  if (!I.repeat) { // 電腦：點一下輕攻擊，按住蓄力
    if (p.bufAtk > 0 && ready && p.charge <= 0) { doAttack(false); p.holdT = 0; }
    if (I.attackHeld) { p.holdT += dt; if (p.holdT > 0.24 && ready) chargeUp(dt); } else if (!I.attackUp) p.holdT = 0;
    if (I.attackUp) { releaseCharge(false); p.holdT = 0; }
  } else {         // 觸控／手把：右搖桿按住連續輕攻擊，重擊鍵蓄力
    if (I.heavyHeld) { if (ready) chargeUp(dt); }
    else if ((I.attackHeld || p.bufAtk > 0) && ready && p.charge <= 0) doAttack(false);
    if (I.heavyUp) releaseCharge(true);
  }
}
function chargeUp(dt: number) {
  const p = W.p, b = p.charge; if (p.sta <= 0) return;
  p.charge = min(1, p.charge + dt * 1.25);
  if (b < 0.4 && p.charge >= 0.4) { snd('charge'); emit('charged', { full: false }); }
  if (b < 1 && p.charge >= 1) { snd('charge'); emit('charged', { full: true }); }
}
function releaseCharge(tapLight: boolean) {
  const p = W.p, c = p.charge; p.charge = 0;
  if (!(p.atkCd <= 0 && canAct())) return;
  if (c >= 0.4) doAttack(true, (c - 0.4) / 0.6); else if (tapLight) doAttack(false);
}

/** 技能瞄準落點 */
function aimPoint(range: number) {
  const p = W.p, I = W.in;
  if (I.aimPt && !I.repeat) { const d = hypot(I.aimPt.x - p.x, I.aimPt.y - p.y), k = min(1, range / (d || 1)); return { x: p.x + (I.aimPt.x - p.x) * k, y: p.y + (I.aimPt.y - p.y) * k }; }
  let best: any = null, bd = range;
  for (const e of W.ents) { if (e.dead) continue; const d = dist(p, e); if (d < bd && abs(angDiff(angTo(p, e), p.aim)) < 0.9) { bd = d; best = e; } }
  return best ? { x: best.x, y: best.y } : { x: p.x + cos(p.aim) * range * 0.6, y: p.y + sin(p.aim) * range * 0.6 };
}
function startDash(dx: number, dy: number, dur: number, spd: number, k: any) {
  const p = W.p; p.dodgeT = dur; p.dodgeAge = 0; p.ddx = dx; p.ddy = dy; p.pdDone = true; p.dashK = { spd, hit: [], ...k }; p.charge = 0;
}
function useSkill(i: number) {
  const p = W.p, S = W.ST, run = W.run!, c = CLS[run.cls], sk = c.sk[i];
  if (p.cds[i] > 0 || !canAct()) { if (p.cds[i] > 0) snd('deny'); return; }
  if (W.in.auto) p.aim = autoAim(p.aim, 340);
  p.cds[i] = sk.cd * S.cdr; const ca = cos(p.aim), sa = sin(p.aim), wd = weaponDmg(), id = run.cls + i;
  emit('skill', { id, x: p.x, y: p.y, a: p.aim });
  switch (id) {
    case 'knight0': startDash(ca, sa, 0.26, 640, { bash: wd * 1.6 }); snd('heavy'); break;
    case 'knight1': p.buff.cry = 8; snd('boss'); for (const e of W.ents) if (!e.dead && !e.boss && dist(e, p) < 190 && e.state !== 'spawn') { e.state = 'stag'; e.t = 0.8; e.rep = 0; } break;
    case 'ranger0': startDash(-ca, -sa, 0.24, 560, {}); for (let j = -1; j <= 1; j++) mkShot('p', p.x, p.y, p.aim + j * 0.2, 620, wd * 1.1, { kind: 'arrow', r: 4, col: EL[S.els[0]] || EL.none }); snd('shoot'); break;
    case 'ranger1': { const t = aimPoint(340); for (let j = 0; j < 7; j++) mkHaz({ k: 'blast', from: 'p', x: t.x + rr(-58, 58), y: t.y + rr(-58, 58), r: 38, t: 0.25 + j * 0.13, dmg: wd * 0.85, col: '#f1ead8', arrow: true }); snd('shoot'); break; }
    case 'rogue0': {
      let best: any = null, bd = 300; for (const e of W.ents) { if (e.dead || e.state === 'spawn') continue; const d = dist(p, e); if (d < bd && abs(angDiff(angTo(p, e), p.aim)) < 1.1) { bd = d; best = e; } }
      if (!best) { p.cds[i] = 0.5; snd('deny'); break; }
      emit('blink', { x: p.x, y: p.y }); const ox = p.x, oy = p.y;
      const tryPos = (a: number) => { p.x = best.x + cos(a) * (best.r + 18); p.y = best.y + sin(a) * (best.r + 18); return !collides(p, true); };
      if (!tryPos(best.a + PI) && !tryPos(angTo(best, { x: ox, y: oy }))) { p.x = ox; p.y = oy; }
      p.aim = angTo(p, best); p.inv = max(p.inv, 0.35); emit('blink', { x: p.x, y: p.y });
      hitEnemy(best, wd * 2.2, { from: p, melee: true, crit: true, kb: 160, heavy: true, stag: true }); p.swing = { a: p.aim, arc: 1.6, rng: 60, t: 0, d: 0.16, heavy: true, side: 1, kind: 'dagger' };
      emit('swing', { x: p.x, y: p.y, a: p.aim, arc: 1.6, rng: 60, heavy: true, side: 1, kind: 'dagger', col: '#c9a0ff' }); snd('crit'); break; }
    case 'rogue1': p.buff.smoke = 3.5; p.buff.smokeCrit = 3.5; snd('dodge'); break;
    case 'mage0': {
      let dx = W.in.mx, dy = W.in.my; const m = hypot(dx, dy); if (m < 0.2) { dx = ca; dy = sa; } else { dx /= m; dy /= m; }
      emit('blink', { x: p.x, y: p.y }); for (let s = 0; s < 17; s++) { const ox = p.x, oy = p.y; p.x += dx * 10; p.y += dy * 10; if (collides(p, true)) { p.x = ox; p.y = oy; break; } }
      p.inv = max(p.inv, 0.3); emit('blink', { x: p.x, y: p.y }); snd('cast'); break; }
    case 'mage1': for (const e of W.ents) if (!e.dead && dist(e, p) < 150 + e.r) { applyEl(e, 'ice', wd); e.st.chill = 4; hitEnemy(e, wd * 1.6, { from: p, kb: 220, stag: true, col: EL.ice }); } snd('freeze'); emit('boom', { x: p.x, y: p.y, r: 150, col: EL.ice }); break;
  }
}
function dashHit(k: any) {
  const p = W.p; if (!k.bash) return;
  for (const e of W.ents) if (!e.dead && e.state !== 'spawn' && !k.hit.includes(e.uid) && dist(e, p) < e.r + p.r + 14) {
    k.hit.push(e.uid); hitEnemy(e, k.bash, { from: p, melee: true, heavy: true, stag: true, kb: 320 }); W.hitstop = max(W.hitstop, 0.05);
  }
}

function updPlayer(dt: number) {
  const p = W.p, S = W.ST, I = W.in, run = W.run!, room = W.room; if (p.dead) return;
  for (const k of P_TIMERS) if (p[k] > 0) p[k] = max(0, p[k] - dt);
  p.cds[0] = max(0, p.cds[0] - dt); p.cds[1] = max(0, p.cds[1] - dt);
  for (const k in p.buff) if (p.buff[k] > 0) p.buff[k] = max(0, p.buff[k] - dt);
  if (p.comboT > 0 && (p.comboT -= dt) <= 0) p.combo = 0;
  if (p.swing && (p.swing.t += dt) >= p.swing.d) p.swing = null;
  p.anim += dt;
  const st = p.st; st.tick -= dt;
  if (st.tick <= 0) { st.tick = 0.5; if (st.burn > 0) dotPlayer(3); if (st.poison > 0) dotPlayer(2); }
  for (const k of ['burn', 'poison', 'chill']) if (st[k] > 0) st[k] = max(0, st[k] - dt);
  const tx = Mf(p.x / T), ty = Mf(p.y / T), tile = room.g[ty]?.[tx];
  if (tile === 4 && p.dodgeT <= 0) st.burn = max(st.burn, 1.2);
  if (tile === 5 && room.spikeUp && p.dodgeT <= 0 && p.spikeHit !== room.spikeN) { p.spikeHit = room.spikeN; hitPlayer(9 + run.floor, null, { noParry: true, trap: true }); }
  if (I.aim !== null) p.aim = I.aim;
  if (I.auto && p.charge > 0) { const w0 = WPN[run.wpn.id], k0 = KIND[w0.k]; p.aim = turn(p.aim, autoAim(p.aim, k0.proj ? 470 : k0.rng * 2.6 + 50), 10 * dt); }
  if (p.parryT > 0 && (p.parryT -= dt) <= 0) { p.parryT = 0; p.parryFail = 0.3; }
  if (p.potT > 0 && p.potHeal && p.potT < 0.3) { p.potHeal = false; heal(S.maxHp * 0.42); snd('heal'); emit('healfx', { x: p.x, y: p.y }); }
  if (p.staDelay <= 0 && p.dodgeT <= 0) p.sta = min(S.maxSta, p.sta + S.staRegen * dt * (p.charge > 0 ? 0.3 : 1));
  if (p.dodgeT > 0) {
    p.dodgeT -= dt; p.dodgeAge += dt; const k = p.dashK, sp = k ? k.spd : 720 * (0.3 + 0.7 * max(0, p.dodgeT / DODGE_T));
    moveEnt(p, p.ddx * sp * dt, p.ddy * sp * dt); if (k) dashHit(k);
    if (p.dodgeT <= 0) { p.dashK = null; p.dodgeT = 0; }
    p.moving = true; if (I.attack) p.bufAtk = 0.22;
  } else {
    let sp = S.speed; if (st.chill > 0) sp *= 0.7; if (tile === 6) sp *= 0.55; if (p.charge > 0) sp *= 0.55; if (p.potT > 0) sp *= 0.45; if (p.atkLock > 0) sp *= p.atkHeavy ? 0.35 : 0.6; if (p.parryFail > 0 || p.parryT > 0) sp *= 0.35;
    p.mvx = I.mx; p.mvy = I.my; p.moving = hypot(I.mx, I.my) > 0.12;
    moveEnt(p, (I.mx * sp + p.vx) * dt, (I.my * sp + p.vy) * dt);
    const f = min(1, 9 * dt); p.vx -= p.vx * f; p.vy -= p.vy * f;
    if (I.dodge) tryDodge();
    if (p.dodgeT <= 0) {
      if (I.parry) tryParry(); if (I.potion) tryPotion();
      if (I.s1) useSkill(0); if (I.s2) useSkill(1);
      handleAttack(dt);
    }
  }
  // 互動物
  let near: any = null, nd = 52;
  for (const o of W.objs) { if (o.dead || (o.used && o.k !== 'stairs')) continue; const d = dist(o, p); if (d < nd) { nd = d; near = o; } }
  W.near = near;
  if (I.interact && near && canAct()) interact(near);
  // 走進門 → 換房間
  if (!room.locked) {
    const t2 = room.g[Mf(p.y / T)]?.[Mf(p.x / T)];
    if (t2 === 9) { const dir = doorDirAt(Mf(p.x / T), Mf(p.y / T)); const d = dir && room.def.doors[dir]; if (d) { emit('leave', { dir }); enterRoom(d.to, DIRS[dir!][2]); } }
  }
}

// ================= 敵人 =================
export function mkEnemy(id: string, x: number, y: number, o: any = {}) {
  const d = EN[id], run = W.run!, f = run.floor, cyc = Mf((f - 1) / 15);
  const hs = 1 + 0.13 * (f - 1) + cyc * 0.8, ds = (1 + 0.065 * (f - 1) + cyc * 0.3) * (DIFF[run.diff] || DIFF.normal).dmg;
  const e: any = { uid: ++W.seq, id, d, x, y, r: d.r * (o.elite ? 1.22 : 1), a: rnd() * TAU, state: 'spawn', t: o.t ?? 0.6 + rnd() * 0.4, tw: 1, cd: 0.5 + rnd() * 1.2,
    atk: null, lastAtk: null, flash: 0, kx: 0, ky: 0, anim: rnd() * 9, elite: !!o.elite, mod: o.mod || null, boss: !!d.boss, phase: 0, minion: !!o.minion,
    st: { burn: 0, burnD: 0, poison: 0, pT: 0, poiD: 0, chill: 0, shock: 0, tick: 0.5 }, dmgMul: ds * (o.elite ? 1.3 : 1), rep: 0, hitDone: false, dead: false,
    avoid: 0, avoidDir: 1, hitT: 0, hitA: 0, strafe: rnd() < 0.5 ? 1 : -1, hop: rnd(), wa: rnd() * TAU, moving: false, sa: 0, sacc: 0, lock: 0.2 };
  e.mhp = e.hp = round(d.hp * (d.boss ? 1 + Mf((f - 1) / 3) * 0.35 + cyc * 0.6 : hs) * (o.elite ? 2.6 : 1));
  W.ents.push(e);
  if (W.meta) W.meta.codex['en:' + id] = 1;
  return e;
}
function stagger(e: any, t: number) { e.state = 'stag'; e.t = t; e.rep = 0; }

function steer(e: any, dt: number, d: number, ang: number, sees: boolean) {
  const D = e.d, p = W.p; let tx = 0, ty = 0;
  const sp = D.spd * (e.boss ? 1 + e.phase * 0.14 : 1) * (DIFF[W.run!.diff] || DIFF.normal).spd;
  if (!sees) { e.wa += rr(-2, 2) * dt; tx = cos(e.wa) * 0.5; ty = sin(e.wa) * 0.5; }
  else switch (D.mv) {
    case 'chase': if (d > (D.stop || e.r + p.r + 8)) { tx = cos(ang); ty = sin(ang); } break;
    case 'hop': e.hop += dt; if (e.hop % 1 < 0.46 && d > e.r + p.r + 4) { tx = cos(ang) * 2; ty = sin(ang) * 2; } break;
    case 'keep': if (d > D.keep + 50) { tx = cos(ang); ty = sin(ang); } else if (d < D.keep - 60) { tx = -cos(ang); ty = -sin(ang); } else { tx = -sin(ang) * 0.55 * e.strafe; ty = cos(ang) * 0.55 * e.strafe; } break;
    case 'orbit': { const k = d > D.keep + 40 ? 1 : d < D.keep - 50 ? -0.8 : 0; tx = cos(ang) * k - sin(ang) * 0.9 * e.strafe; ty = sin(ang) * k + cos(ang) * 0.9 * e.strafe; const m = hypot(tx, ty) || 1; tx /= m; ty /= m; break; }
  }
  if (sees) e.a = turn(e.a, ang, 7 * dt);
  if (e.avoid > 0) { e.avoid -= dt; const ox = tx; tx = -ty * e.avoidDir; ty = ox * e.avoidDir; }
  for (const o of W.ents) { if (o === e || o.dead) continue; const dd = dist(o, e), mn = o.r + e.r; if (dd < mn && dd > 0.01) { const k = ((mn - dd) / mn) * 1.4; tx += ((e.x - o.x) / dd) * k; ty += ((e.y - o.y) / dd) * k; } }
  const mx = tx * sp * dt, my = ty * sp * dt, want = hypot(mx, my);
  e.moving = want > 0.05;
  if (e.moving) {
    const got = moveEnt(e, mx, my);
    if (got < want * 0.4 && e.avoid <= 0) { e.avoid = 0.45; e.avoidDir = rnd() < 0.5 ? 1 : -1; e.strafe *= -1; }
  }
}
function pickAtk(e: any, d: number) {
  const c = e.d.atks.filter((a: any) => (a.ph || 0) <= e.phase && d <= a.rng && d >= (a.min || 0) && !(a.t === 'summon' && W.ents.filter((x) => !x.dead).length > 7));
  if (!c.length) return null;
  const c2 = c.length > 1 ? c.filter((a: any) => a !== e.lastAtk) : c;
  let tot = 0; for (const a of c2) tot += a.w || 1; let x = rnd() * tot;
  for (const a of c2) { x -= a.w || 1; if (x <= 0) return a; }
  return c2[0];
}
function startAtk(e: any, a: any, wind?: number) {
  const D = DIFF[W.run!.diff] || DIFF.normal;
  e.atk = a; e.state = 'wind'; e.hitDone = false;
  e.tw = e.t = (wind ?? a.wind) * D.wind * (e.boss ? Math.pow(0.88, e.phase) : 1) * (e.mod === 'swift' ? 0.85 : 1);
  e.lock = a.lock ?? min(0.22, e.tw * 0.4);
  if (a.t === 'dash' || a.t === 'beam') emit('warn', { e });
}
function endAtk(e: any) {
  const a = e.atk;
  if (e.rep > 0) { e.rep--; startAtk(e, a, a.rwind || 0.35); return; }
  e.state = 'rec'; e.t = a.rec; e.cd = a.cd * rr(0.8, 1.2) * (e.elite ? 0.8 : 1); e.lastAtk = a;
}
function execAtk(e: any) {
  const a = e.atk, p = W.p, dmg = (a.dmg || 0) * e.dmgMul, eff = a.eff || (e.mod === 'fire' ? 'fire' : undefined);
  switch (a.t) {
    case 'swing': emit('eswing', { x: e.x, y: e.y, a: e.a, arc: a.arc, r: a.reach, col: e.d.c2 }); snd('swing');
      if (dist(e, p) <= a.reach + p.r && abs(angDiff(angTo(e, p), e.a)) <= a.arc / 2 + 0.15) hitPlayer(dmg, e, { eff }); break;
    case 'slam': emit('boom', { x: e.x, y: e.y, r: a.rad, col: e.d.c2, slam: true }); snd('boom');
      if (dist(e, p) <= a.rad + p.r * 0.5) hitPlayer(dmg, e, { eff }); break;
    case 'dash': e.state = 'act'; e.t = a.dur; snd('dodge'); return;
    case 'shot': { const n = a.n || 1; for (let i = 0; i < n; i++) mkShot('e', e.x + cos(e.a) * e.r, e.y + sin(e.a) * e.r, e.a + (i - (n - 1) / 2) * (a.spread || 0.24), a.spd, dmg, { col: e.d.c2, eff, r: a.r || 6 }); snd('shoot'); break; }
    case 'radial': { const off = rnd() * TAU; for (let i = 0; i < a.n; i++) mkShot('e', e.x, e.y, off + (i * TAU) / a.n, a.spd, dmg, { col: e.d.c2, eff, r: a.r || 6 }); snd('cast'); break; }
    case 'lob': mkHaz({ k: 'blast', from: 'e', x: clamp(p.x + p.mvx * 30, 60, RPW - 60), y: clamp(p.y + p.mvy * 30, 60, RPH - 60), r: a.rad, t: a.delay, dmg, eff, puddle: a.puddle, col: e.d.c2, sx: e.x, sy: e.y }); snd('shoot'); break;
    case 'rain': for (let i = 0; i < a.k; i++) mkHaz({ k: 'blast', from: 'e', x: clamp(i ? p.x + rr(-170, 170) : p.x, 60, RPW - 60), y: clamp(i ? p.y + rr(-150, 150) : p.y, 60, RPH - 60), r: a.rad, t: a.delay + i * 0.16, dmg, eff, puddle: a.puddle, col: e.d.c2, sx: e.x, sy: e.y }); snd('cast'); break;
    case 'blink': { emit('blink', { x: e.x, y: e.y }); const ba = rnd() * TAU, ox = e.x, oy = e.y; e.x = p.x + cos(ba) * 70; e.y = p.y + sin(ba) * 70; if (collides(e, false)) { e.x = ox; e.y = oy; } e.a = angTo(e, p); emit('blink', { x: e.x, y: e.y }); snd('cast'); startAtk(e, a.then, a.then.wind); return; }
    case 'summon': for (let i = 0; i < a.n; i++) { const m = mkEnemy(a.id, e.x + rr(-70, 70), e.y + rr(-70, 70), { minion: true }); if (collides(m, false)) { m.x = e.x; m.y = e.y; } emit('spawn', { e: m }); } snd('spawn'); break;
    case 'beam': e.state = 'act'; e.t = a.dur; snd('cast'); return;
    case 'spiral': e.state = 'act'; e.t = a.dur; e.sa = rnd() * TAU; e.sacc = 0; return;
  }
  if (e.state === 'stag' || e.dead) return; // 被彈反或反傷致死
  endAtk(e);
}
function actAtk(e: any, dt: number) {
  const a = e.atk, p = W.p, dmg = (a.dmg || 0) * e.dmgMul;
  e.t -= dt;
  if (a.t === 'dash') {
    const step = a.spd * dt, got = moveEnt(e, cos(e.a) * step, sin(e.a) * step);
    if (!e.hitDone && dist(e, p) < e.r + p.r + 3) { e.hitDone = true; hitPlayer(dmg, e, { eff: a.eff }); if (e.state === 'stag') return; }
    if (got < step * 0.5) { e.t = 0; if (!e.boss) { stagger(e, 0.7); emit('bonk', { x: e.x, y: e.y }); return; } }
  } else if (a.t === 'beam') {
    if (!e.hitDone && segDist(p.x, p.y, e.x, e.y, e.x + cos(e.a) * 900, e.y + sin(e.a) * 900) < (a.w || 18) / 2 + p.r * 0.6) { e.hitDone = true; hitPlayer(dmg, e, { noParry: true, eff: a.eff }); }
    if (a.sweep) e.a += a.sweep * dt;
  } else if (a.t === 'spiral') {
    e.sacc += dt; while (e.sacc >= a.iv) { e.sacc -= a.iv; e.sa += a.rot || 0.33; for (let i = 0; i < a.arms; i++) mkShot('e', e.x, e.y, e.sa + (i * TAU) / a.arms, a.spd, dmg, { col: e.d.c2, eff: a.eff, r: 6 }); }
  }
  if (e.t <= 0) endAtk(e);
}
function updEnemy(e: any, dt0: number) {
  const p = W.p; let dt = dt0 * (W.slow > 0 ? 0.25 : 1); if (e.st.chill > 0) dt *= 0.6; if (e.mod === 'swift') dt *= 1.22;
  // 狀態異常
  const st = e.st; st.tick -= dt0;
  if (st.tick <= 0) { st.tick = 0.5;
    if (st.burn > 0) hitEnemy(e, st.burnD * 0.5, { dot: true, col: EL.fire });
    if (!e.dead && st.poison > 0) hitEnemy(e, st.poison * st.poiD * 0.5, { dot: true, col: EL.poison });
    if (e.dead) return; }
  if (st.burn > 0) st.burn -= dt0; if (st.chill > 0) st.chill -= dt0; if (st.shock > 0) st.shock -= dt0;
  if (st.pT > 0 && (st.pT -= dt0) <= 0) st.poison = 0;
  if (e.flash > 0) e.flash -= dt0;
  if (abs(e.kx) + abs(e.ky) > 1) { moveEnt(e, e.kx * dt0, e.ky * dt0); const f = min(1, 11 * dt0); e.kx -= e.kx * f; e.ky -= e.ky * f; }
  if (e.hitT > 0) e.hitT -= dt0;
  e.anim += dt * (e.moving ? 1.6 : 0.8);
  const d = dist(e, p), ang = angTo(e, p), sees = !(p.buff.smoke > 0) && !p.dead;
  switch (e.state) {
    case 'spawn': e.t -= dt0; if (e.t <= 0) e.state = 'move'; break;
    case 'stag': e.t -= dt0; e.moving = false; if (e.t <= 0) { e.state = 'move'; e.cd = max(e.cd, 0.35); } break;
    case 'move': steer(e, dt, d, ang, sees); e.cd -= dt;
      if (e.cd <= 0 && sees) { const a = pickAtk(e, d); if (a) { e.rep = a.rep || 0; startAtk(e, a); } else e.cd = 0.25; } break;
    case 'wind': e.t -= dt; e.moving = false; if (e.t > e.lock && sees) e.a = turn(e.a, ang, 9 * dt); if (e.t <= 0) execAtk(e); break;
    case 'act': actAtk(e, dt); break;
    case 'rec': e.t -= dt; e.moving = false; if (e.t <= 0) e.state = 'move'; break;
  }
  if (e.mod === 'fire' && e.moving && rnd() < dt * 2) mkHaz({ k: 'puddle', from: 'e', x: e.x, y: e.y, r: 26, t: 2.2, eff: 'fire', tick: 0.3 });
}
export function applyEl(e: any, el: string, base: number) {
  const st = e.st, S = W.ST;
  if (el === 'fire') { st.burn = 3; st.burnD = max(st.burnD, base * 0.25); }
  else if (el === 'ice') st.chill = 3;
  else if (el === 'shock') st.shock = 4;
  else if (el === 'poison') { st.poison = min(5, st.poison + 1); st.pT = 4; st.poiD = max(st.poiD, base * 0.1 * (S.poisonUp || 1)); }
}
/** 對敵人造成傷害。o.dot = 持續傷害（不觸發連鎖效果）。 */
export function hitEnemy(e: any, base: number, o: any = {}) {
  if (e.dead || e.state === 'spawn') return false;
  const S = W.ST, p = W.p, run = W.run!, w = WPN[run.wpn.id]; let d = base, crit = !!o.crit, blocked = false;
  if (e.d.shield && e.state !== 'stag' && o.from && !o.dot && abs(angDiff(angTo(e, o.from), e.a)) < 1.05) {
    if (o.heavy) { d *= 0.6; stagger(e, 0.9); emit('gbreak', { x: e.x, y: e.y }); } else { d *= 0.2; blocked = true; }
  }
  if (!o.dot) {
    if (!crit && rnd() < S.crit) crit = true;
    if (w.sp === 'back' && o.melee && abs(angDiff(angTo(e, p), e.a)) > 2.1) crit = true;
    if (crit) d *= S.critMult;
    if (e.state === 'stag') d *= 1.5 + S.vsStag;
    if (S.exec && e.hp < e.mhp * 0.3) d *= 1 + S.exec;
    if (S.chillBonus && e.st.chill > 0) d *= 1 + S.chillBonus;
    if (e.mod === 'armor' && e.state !== 'stag') d *= 0.5;
    if (S.comboUp) d *= 1 + min(0.3, p.combo * 0.02);
  }
  d = max(1, round(d)); e.hp -= d; e.flash = 0.12; run.stats.dmg += d;
  if (!o.dot) { e.hitT = 0.2; e.hitA = o.from ? angTo(o.from, e) : 0; if (crit) W.hitstop = max(W.hitstop, 0.09); }
  emit('dmg', { x: e.x, y: e.y - e.r * 2 - 8, v: d, crit, blocked, col: o.col, small: !!o.dot });
  if (!o.dot) {
    snd(blocked ? 'block' : crit ? 'crit' : o.heavy ? 'hhit' : 'hit');
    emit('hitfx', { x: e.x, y: e.y - e.r * 0.9, a: o.from ? angTo(o.from, e) : 0, crit, blocked, heavy: !!o.heavy, r: e.r, col: o.col || EL.none, c2: e.d.col });
    if (o.kb && !e.boss) { const a = angTo(o.from || p, e), kb = (o.kb * (e.elite ? 0.5 : 1)) / (1 + (e.d.poise || 0) * 0.6); e.kx += cos(a) * kb; e.ky += sin(a) * kb; }
    if (e.state !== 'stag' && !blocked) { const pz = e.boss ? 99 : e.elite ? 2 : e.d.poise || 0; if (o.stag && pz < 2) stagger(e, 0.7); else if (pz === 0 && (e.state === 'wind' || e.state === 'move')) stagger(e, 0.28); }
    if (!o.chain) {
      const others = () => W.ents.filter((x) => x !== e && !x.dead && x.state !== 'spawn' && dist(x, e) < 170).sort((a, b) => dist(a, e) - dist(b, e));
      const hadShock = e.st.shock > 0;
      if (hadShock) { e.st.shock = 0; for (const x of others().slice(0, 2)) { emit('bolt', { x1: e.x, y1: e.y - e.r, x2: x.x, y2: x.y - x.r }); hitEnemy(x, base * 0.6, { chain: true, col: EL.shock }); } snd('freeze'); }
      for (const el of S.els) if (!(el === 'shock' && hadShock)) applyEl(e, el, base);
      if (S.leech) heal(d * S.leech, true);
      p.combo++; p.comboT = 2.5; p.hitN++;
      if (S.static && p.hitN % 5 === 0) { let prev = e; for (const x of others().slice(0, 3)) { emit('bolt', { x1: prev.x, y1: prev.y - prev.r, x2: x.x, y2: x.y - x.r }); hitEnemy(x, base * 0.8, { chain: true, col: EL.shock }); prev = x; } }
      if (S.echo && rnd() < S.echo && e.hp > 0) hitEnemy(e, base * 0.6, { chain: true, col: '#b9f' });
    }
  }
  if (e.hp <= 0) killEnemy(e); else if (e.boss) bossPhase(e);
  return true;
}
function bossPhase(e: any) {
  const f = e.hp / e.mhp, ph = f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
  if (ph > e.phase) { e.phase = ph; stagger(e, 1.1); for (const s of W.shots) if (s.from === 'e') killShot(s); emit('phase', { e }); snd('boss'); }
}
function dropGold(x: number, y: number, total: number) {
  let left = max(1, total); const n = min(8, max(1, Mf(left / 3)));
  for (let i = 0; i < n; i++) { const v = i === n - 1 ? left : max(1, round(total / n)); left -= v; mkPick('gold', x, y, { v }); if (left <= 0) break; }
}
function killEnemy(e: any) {
  if (e.dead) return; const S = W.ST, p = W.p, run = W.run!;
  e.dead = true; e.hp = 0; run.kills++; if (W.meta) W.meta.stats.kills++; W.hitstop = max(W.hitstop, e.boss ? 0.3 : e.elite ? 0.16 : 0.1);
  emit('die', { x: e.x, y: e.y, r: e.r, col: e.d.col, c2: e.d.c2, boss: e.boss, elite: e.elite, id: e.id }); snd('kill');
  if (S.killHeal) heal(S.killHeal, true);
  if (S.ward) p.shield = min(30, p.shield + S.ward);
  if (e.st.burn > 0 && S.burnSpread) for (const o of W.ents) if (!o.dead && o !== e && dist(o, e) < 120) applyEl(o, 'fire', e.st.burnD * 4);
  if (e.minion) return;
  dropGold(e.x, e.y, round(e.d.gold * (1 + run.floor * 0.08) * S.goldMult * (e.elite ? 3 : 1) * rr(0.8, 1.2)));
  if (rnd() < (e.elite ? 0.5 : 0.04)) mkPick('heart', e.x, e.y);
  if (e.elite) { run.stats.elite++; mkObj('item', e.x, e.y, { it: rollItem(RNG(hash(e.uid, run.seed, run.kills)), run.floor) }); }
  if (e.boss) {
    run.stats.boss++; if (W.meta) W.meta.stats.bosses++; W.slow = 1.6; W.boss = null;
    for (const o of W.ents) if (!o.dead) { o.dead = true; emit('die', { x: o.x, y: o.y, r: o.r, col: o.d.col, c2: o.d.c2 }); }
    for (const s of W.shots) s.dead = true; for (const h of W.haz) h.dead = true;
    const r = RNG(hash(run.seed, run.floor, 555));
    mkObj('item', e.x - 46, e.y + 30, { it: rollItem(r, run.floor, 'relic') }); mkObj('item', e.x + 46, e.y + 30, { it: rollItem(r, run.floor, r.chance(0.5) ? 'wpn' : 'rune') });
    mkPick('heart', e.x, e.y); mkPick('heart', e.x, e.y);
    emit('bossdie', { x: e.x, y: e.y, noHit: !run.flags.bossHit });
  }
}

// ================= 投射物 / 危害區 / 拾取物 / 互動物 =================
export function mkShot(from: string, x: number, y: number, a: number, spd: number, dmg: number, o: any = {}) {
  const s: any = { uid: ++W.seq, from, x, y, a, spd, vx: cos(a) * spd, vy: sin(a) * spd, dmg, r: o.r || 5, life: o.life || 3.2, col: o.col || '#fff', kind: o.kind || 'orb',
    pierce: o.pierce || 0, boom: o.boom || 0, home: !!o.home, eff: o.eff, crit: !!o.crit, heavy: !!o.heavy, hit: [] as number[], dead: false };
  W.shots.push(s); return s;
}
function killShot(s: any) {
  if (s.dead) return; s.dead = true; emit('shotdie', { x: s.x, y: s.y, col: s.col });
  if (s.boom && s.from === 'p') { for (const e of [...W.ents]) if (!e.dead && dist(e, s) < s.boom + e.r) hitEnemy(e, s.dmg * 0.7, { from: s, kb: 160, chain: true, col: s.col }); emit('boom', { x: s.x, y: s.y, r: s.boom, col: s.col }); snd('boom'); }
}
function updShots(dt: number) {
  const p = W.p;
  for (const s of W.shots) {
    if (s.dead) continue; const sdt = s.from === 'e' && W.slow > 0 ? dt * 0.25 : dt;
    s.life -= sdt; if (s.life <= 0) { killShot(s); continue; }
    if (s.home) { let best: any = null, bd = 280; for (const e of W.ents) { if (e.dead || s.hit.includes(e.uid)) continue; const d = dist(e, s); if (d < bd) { bd = d; best = e; } } if (best) { s.a = turn(s.a, angTo(s, best), 5 * sdt); s.vx = cos(s.a) * s.spd; s.vy = sin(s.a) * s.spd; } }
    s.x += s.vx * sdt; s.y += s.vy * sdt;
    if (solidPx(s.x, s.y)) { killShot(s); continue; }
    if (s.from === 'e') {
      if (!p.dead && dist(s, p) < s.r + p.r) {
        const res = hitPlayer(s.dmg, s, { shot: true, eff: s.eff });
        if (res === 'hit') killShot(s);
        else if (res === 'parry') { s.from = 'p'; s.vx *= -1.5; s.vy *= -1.5; s.a += PI; s.spd *= 1.5; s.dmg = weaponDmg() * 2.2; s.life = 2; s.col = '#f3b95f'; s.crit = true; s.hit = []; }
      }
    } else for (const e of W.ents) {
      if (e.dead || e.state === 'spawn' || s.hit.includes(e.uid) || dist(s, e) >= s.r + e.r + 3) continue;
      s.hit.push(e.uid); hitEnemy(e, s.dmg, { from: { x: s.x - s.vx * 0.05, y: s.y - s.vy * 0.05 }, kb: s.heavy ? 180 : 70, crit: s.crit, heavy: s.heavy, stag: s.heavy, col: s.col });
      if (s.boom || s.pierce-- <= 0) { killShot(s); break; }
    }
  }
}
export function mkHaz(o: any) { o.uid = ++W.seq; o.t0 = o.t; o.dead = false; W.haz.push(o); return o; }
function updHaz(dt: number) {
  const p = W.p;
  for (const h of W.haz) {
    if (h.dead) continue; const hdt = h.from === 'e' && W.slow > 0 ? dt * 0.25 : dt;
    if (h.k === 'blast') {
      h.t -= hdt; if (h.t > 0) continue; h.dead = true;
      emit('boom', { x: h.x, y: h.y, r: h.r, col: h.col, arrow: h.arrow }); if (!h.arrow) snd('boom');
      if (h.from === 'e') {
        if (dist(h, p) < h.r + p.r * 0.4) hitPlayer(h.dmg, null, { noParry: true, eff: h.eff, pos: h });
        if (h.puddle) mkHaz({ k: 'puddle', from: 'e', x: h.x, y: h.y, r: h.r * 0.85, t: 4, eff: h.puddle, tick: 0.2 });
      } else for (const e of [...W.ents]) if (!e.dead && dist(e, h) < h.r + e.r) hitEnemy(e, h.dmg, { from: h, kb: 140, stag: h.stag, chain: true, col: h.col });
    } else if (h.k === 'puddle') {
      h.t -= dt; h.tick -= dt; if (h.t <= 0) { h.dead = true; continue; }
      if (h.tick <= 0) { h.tick = 0.4; if (h.from === 'e' && dist(h, p) < h.r && p.dodgeT <= 0) { if (h.eff === 'poison') p.st.poison = max(p.st.poison, 2.5); else p.st.burn = max(p.st.burn, 2); } }
    }
  }
}
export function mkPick(kind: string, x: number, y: number, o: any = {}) {
  const a = rnd() * TAU, sp = rr(70, 190); const pk: any = { uid: ++W.seq, kind, x, y, vx: cos(a) * sp, vy: sin(a) * sp, t: 0, dead: false, ...o };
  W.picks.push(pk); return pk;
}
function updPicks(dt: number) {
  const p = W.p, run = W.run!;
  for (const k of W.picks) {
    if (k.dead) continue; k.t += dt;
    const nx = k.x + k.vx * dt, ny = k.y + k.vy * dt;
    if (!solidPx(nx, k.y)) k.x = nx; else k.vx *= -0.5; if (!solidPx(k.x, ny)) k.y = ny; else k.vy *= -0.5;
    const f = min(1, 5 * dt); k.vx -= k.vx * f; k.vy -= k.vy * f;
    const d = dist(k, p); if (p.dead) continue;
    if (k.t > 0.35 && (k.kind === 'gold' ? W.room.cleared || d < 120 : d < 70)) { const a = angTo(k, p), s = 460 + k.t * 200; k.x += cos(a) * s * dt; k.y += sin(a) * s * dt; }
    if (d < p.r + 12 && k.t > 0.25) {
      if (k.kind === 'gold') { run.gold += k.v; run.stats.gold += k.v; snd('coin'); emit('gold', { x: p.x, y: p.y, v: k.v }); k.dead = true; }
      else if (k.kind === 'heart') { if (run.hp < W.ST.maxHp) { heal(W.ST.maxHp * 0.12); snd('heal'); emit('healfx', { x: p.x, y: p.y }); k.dead = true; } }
    }
  }
}
export function mkObj(k: string, x: number, y: number, o: any = {}) { const ob: any = { uid: ++W.seq, k, x, y, used: false, dead: false, t: 0, ...o }; W.objs.push(ob); return ob; }

export function rollItem(r: Rng, floor: number, force?: string) {
  const run = W.run!, S = W.ST;
  const maxT = min(3, 1 + Mf((floor - 1) / 3) + (S.luck && r.chance(0.35) ? 1 : 0));
  let kind = force || (r() < 0.28 ? 'wpn' : r() < 0.47 ? 'rune' : 'relic');
  for (let tries = 0; tries < 3; tries++) {
    if (kind === 'wpn') { const c = Object.keys(WPN).filter((id) => WPN[id].t <= maxT && id !== run.wpn.id); const top = c.filter((id) => WPN[id].t === maxT); return { kind, id: r.pick(top.length && r.chance(0.65) ? top : c) }; }
    if (kind === 'rune') { const c = Object.keys(RUNE).filter((id) => !run.runes.includes(id)); if (c.length) return { kind, id: r.pick(c) }; kind = 'relic'; continue; }
    const c = Object.keys(RELIC).filter((id) => !run.relics.includes(id) && !(id === 'phoenix' && run.flags.phoenix)); if (c.length) return { kind: 'relic', id: r.pick(c) }; kind = 'wpn';
  }
  return { kind: 'wpn', id: 'iron' };
}
/** 拿取物品。符文槽已滿時需指定 rep（要換掉的槽）。回傳是否成功。 */
export function takeItem(o: any, rep?: number) {
  const it = o.it, run = W.run!, oldMax = W.ST.maxHp;
  if (it.kind === 'wpn') { const old = run.wpn.id; run.wpn.id = it.id; o.it = { kind: 'wpn', id: old }; }
  else if (it.kind === 'rune') {
    if (run.runes.length < W.ST.slots) { run.runes.push(it.id); o.dead = true; }
    else if (rep != null && run.runes[rep]) { const old = run.runes[rep]; run.runes[rep] = it.id; o.it = { kind: 'rune', id: old }; }
    else return false;
  } else { run.relics.push(it.id); o.dead = true; }
  if (W.meta) W.meta.codex[it.kind + ':' + it.id] = 1;
  calcStats(); if (W.ST.maxHp > oldMax) run.hp += W.ST.maxHp - oldMax;
  if (it.id === 'belt') run.potions = min(W.ST.potMax, run.potions + 1);
  snd('pick'); emit('took', { it }); W.dirty = true; return true;
}
function interact(o: any) {
  const run = W.run!, rs = run.rooms[run.cur];
  if (o.k === 'chest') { o.used = true; rs.u = 1; mkObj('item', o.x, o.y + 40, { it: rollItem(RNG(hash(W.room.def.seed, 5)), run.floor) }); snd('pick'); emit('chest', { x: o.x, y: o.y }); W.dirty = true; }
  else emit('ui', { p: o.k, o });
}
/** 營火：休息（回復並補滿藥水）或強化武器。 */
export function useFire(o: any, mode: 'rest' | 'forge') {
  const run = W.run!; if (o.used) return false;
  if (mode === 'rest') { heal(W.ST.maxHp * 0.5); run.potions = W.ST.potMax; snd('heal'); emit('healfx', { x: W.p.x, y: W.p.y }); }
  else { run.wpn.lv++; calcStats(); snd('pick'); emit('took', { it: { kind: 'wpn', id: run.wpn.id } }); }
  o.used = true; run.rooms[run.cur].u = 1; W.dirty = true; return true;
}

// ================= 房間流程 =================
function spawnWave(room: any, r: Rng, type: string) {
  const run = W.run!, fl = run.floor, p = W.p;
  let budget = 2.2 + fl * 0.55 + r.rr(0, 1.2); if (type === 'exit') budget *= 1.25; if (type === 'wave') budget *= 0.7;
  const free = r.shuffle(freeTiles(room, (x, y) => hypot(x * T + 20 - p.x, y * T + 20 - p.y) > 230));
  const pos = () => { const t = free.pop() || [13, 7]; return tileCenter(t[0], t[1]); };
  const pool: [string, number][] = room.biome.en;
  if (type === 'elite') { const c = pool.filter((e) => e[1] >= 1.5), q = pos(); const e = mkEnemy(r.pick(c)[0], q.x, q.y, { elite: true, mod: r.pick(['swift', 'armor', 'fire']) }); emit('spawn', { e }); budget *= 0.45; }
  let n = 0;
  while (budget >= 1 && n < 7) {
    const c = pool.filter((e) => e[1] <= budget && (fl > 1 || e[1] <= 1.5)); if (!c.length) break;
    const pk = r.pick(c), q = pos(); const e = mkEnemy(pk[0], q.x, q.y); emit('spawn', { e }); budget -= pk[1]; n++;
  }
  snd('spawn');
}
export function enterRoom(id: number, from?: string) {
  const run = W.run!, p = W.p;
  if (W.room) { const rs0 = run.rooms[W.room.def.id]; if (rs0) rs0.items = W.objs.filter((o) => o.k === 'item' && !o.dead).map((o) => ({ kind: o.it.kind, id: o.it.id, x: o.x, y: o.y })); }
  const def = W.floor.rooms[id], room: any = buildRoom(def, run.floor); W.room = room; run.cur = id;
  const rs = run.rooms[id] || (run.rooms[id] = {}); const first = !rs.v; rs.v = 1;
  W.ents = []; W.shots = []; W.haz = []; W.picks = []; W.objs = []; W.boss = null; W.near = null; W.waveT = 0;
  if (from) { const [dx, dy] = DOOR_TILES[from][1], [ix, iy] = DIRS[from]; p.x = dx * T + T / 2 - ix * T * 1.7; p.y = dy * T + T / 2 - iy * T * 1.7; p.aim = Math.atan2(-iy, -ix); }
  else { p.x = RPW / 2; p.y = RPH / 2 + 50; }
  p.vx = p.vy = 0; p.dodgeT = 0; p.charge = 0; p.swing = null; p.dashK = null;
  room.cleared = !!rs.c || !COMBAT_TYPES.includes(def.type);
  const r = RNG(hash(def.seed, run.floor, 31)), cx = RPW / 2, cy = RPH / 2;
  if (!rs.c) {
    if (def.type === 'combat' || def.type === 'exit' || def.type === 'elite') { room.wavesLeft = def.type !== 'elite' && r.chance(0.3 + min(0.3, run.floor * 0.03)) ? 1 : 0; spawnWave(room, r, def.type); }
    else if (def.type === 'boss') { run.flags.bossHit = 0; const b = mkEnemy(room.biome.boss, cx, cy - 70, { t: 1.8 }); W.boss = b; emit('boss', { e: b }); snd('boss'); }
  }
  if (def.type === 'treasure') mkObj('chest', cx, cy - 20, { used: !!rs.u });
  if (def.type === 'campfire') mkObj('fire', cx, cy - 10, { used: !!rs.u });
  if (rs.c && (def.type === 'exit' || def.type === 'boss')) mkObj('stairs', cx, cy - 10);
  for (const it of rs.items || []) mkObj('item', it.x, it.y, { it: { kind: it.kind, id: it.id } });
  rs.items = [];
  room.locked = !room.cleared;
  if (first && W.ST.roomHeal && run.hp < W.ST.maxHp) heal(W.ST.roomHeal);
  emit('room', { first, from }); W.dirty = true;
}
function clearRoom() {
  const run = W.run!, room = W.room, def = room.def;
  room.cleared = true; room.locked = false; run.rooms[def.id].c = 1;
  emit('clear', {}); snd('clear');
  if (def.type === 'exit' || def.type === 'boss') { mkObj('stairs', RPW / 2, RPH / 2 - 10); emit('stairs', {}); }
  else if (rnd() < 0.2) mkPick('heart', RPW / 2, RPH / 2);
  W.dirty = true;
}
export function nextFloor() {
  const run = W.run!; run.floor++; run.rooms = {}; run.cur = 0;
  if (W.meta) W.meta.stats.bestFloor = max(W.meta.stats.bestFloor, run.floor);
  W.floor = genFloor(run.seed, run.floor, FEATURES); W.room = null; enterRoom(0);
  snd('stairs'); emit('floor', {});
}
/** 一趟遠征結束時能帶回的魂晶。 */
export function shardsEarned() {
  const run = W.run!; return round(((run.floor - 1) * 6 + run.kills * 0.3 + run.stats.boss * 20 + run.stats.elite * 5) * W.ST.shardMult);
}
function finishRun(kind: 'dead' | 'win') {
  const run = W.run!, m = W.meta; const shards = shardsEarned();
  if (m) {
    m.shards += shards; m.stats.runs++; if (kind === 'dead') m.stats.deaths++; else m.stats.wins++;
    m.stats.bestFloor = max(m.stats.bestFloor, run.floor); m.stats.playtime += run.time; m.stats.pd += run.stats.pd; m.stats.parry += run.stats.parry;
    if (kind === 'dead') { m.graves.unshift({ floor: run.floor, cls: run.cls, t: Date.now(), gold: round(run.gold * 0.5), words: Mf(rnd() * 8) }); m.graves.length = min(m.graves.length, 12); }
  }
  W.over = kind; emit('over', { kind, shards }); W.dirty = true;
}

/** 推進一幀。poll 用來在「真的要更新」時才讀取輸入（卡肉停頓時不吃掉按鍵）。 */
export function step(dt: number, poll: () => void) {
  if (W.paused || !W.run || W.over) return;
  if (W.hitstop > 0) { W.hitstop -= dt; return; }
  poll();
  W.time += dt; W.run.time += dt; if (W.slow > 0) W.slow -= dt;
  const room = W.room; room.spikeT = (room.spikeT + dt) % 3.2; const up = room.spikeT > 2.2; if (up && !room.spikeUp) room.spikeN++; room.spikeUp = up;
  updPlayer(dt);
  if (W.room !== room) return; // 已換房間
  for (const e of [...W.ents]) if (!e.dead) updEnemy(e, dt);
  updShots(dt); updHaz(dt); updPicks(dt);
  for (const o of W.objs) o.t += dt;
  W.ents = W.ents.filter((e) => !e.dead); W.shots = W.shots.filter((s) => !s.dead); W.haz = W.haz.filter((h) => !h.dead); W.picks = W.picks.filter((k) => !k.dead); W.objs = W.objs.filter((o) => !o.dead);
  if (!room.cleared && !W.ents.length) {
    if (room.wavesLeft > 0) { W.waveT += dt; if (W.waveT > 0.7) { W.waveT = 0; room.wavesLeft--; spawnWave(room, RNG(hash(room.def.seed, room.wavesLeft, 3)), 'wave'); } }
    else clearRoom();
  }
  if (W.p.dead) { W.overT -= dt; if (W.overT <= 0) finishRun('dead'); }
}
