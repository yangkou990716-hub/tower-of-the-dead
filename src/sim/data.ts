// 遊戲內容資料：武器、符文、遺物、職業、敵人、生態域。
// 新增內容只需在此加資料；存檔只記 id，所以「不要改或刪既有 id」，否則舊存檔會遺失該物品。

export const EL: Record<string, string> = { fire: '#ff8a3d', ice: '#8fdcff', shock: '#ffe66b', poison: '#a4e86a', none: '#f1ead8' };
export const EL_NAME: Record<string, string> = { fire: '灼燒', ice: '冰緩', shock: '感電', poison: '中毒' };

export const DIFF: Record<string, any> = {
  normal: { n: '普通', dmg: 1, wind: 1, spd: 1, shard: 1, ifr: 0, d: '為這座塔設計的難度。' },
  hard: { n: '困難', dmg: 1.3, wind: 0.8, spd: 1.12, shard: 1.5, ifr: 0, d: '敵人更快、出招提示更短。魂晶 +50%。' },
  assist: { n: '輔助', dmg: 0.65, wind: 1.2, spd: 0.95, shard: 0.7, ifr: 0.12, d: '閃避無敵時間加長、受傷減少。魂晶 −30%。' },
};

// ---------- 武器 ----------
export const KIND: Record<string, any> = {
  sword: { n: '劍', cd: 0.34, sta: 11, rng: 74, arc: 2.0, hv: 2.3 },
  dagger: { n: '匕首', cd: 0.2, sta: 6, rng: 54, arc: 1.4, hv: 2.1 },
  spear: { n: '長槍', cd: 0.4, sta: 12, rng: 118, arc: 0.55, hv: 2.4 },
  hammer: { n: '重錘', cd: 0.68, sta: 21, rng: 84, arc: 2.7, hv: 2.7, stag: 1 },
  bow: { n: '弓', cd: 0.38, sta: 8, proj: 560, hv: 2.6 },
  staff: { n: '法杖', cd: 0.46, sta: 10, proj: 400, hv: 2.4 },
};
export const WPN: Record<string, any> = {
  iron: { n: '鐵劍', k: 'sword', dmg: 14, t: 1, d: '平凡而可靠。無數亡者握過同樣的劍。' },
  flame: { n: '炎牙', k: 'sword', dmg: 16, t: 2, el: 'fire', d: '劍脊嵌著一枚未熄的炭。命中使敵人灼燒。' },
  frost: { n: '霜語', k: 'sword', dmg: 16, t: 2, el: 'ice', d: '揮動時有細碎的結冰聲。命中使敵人遲緩。' },
  regicide: { n: '弒王者', k: 'sword', dmg: 22, t: 3, sp: 'exec', d: '只為終結而鑄。對生命低於三成的敵人傷害 +50%。' },
  dag1: { n: '短匕', k: 'dagger', dmg: 8, t: 1, d: '輕、快、不起眼。' },
  venom: { n: '毒刺', k: 'dagger', dmg: 9, t: 2, el: 'poison', d: '刃上的綠色不是鏽。命中疊加中毒。' },
  shadow: { n: '影吻', k: 'dagger', dmg: 12, t: 3, sp: 'back', d: '從背後命中必定暴擊。' },
  pike: { n: '長槍', k: 'spear', dmg: 15, t: 1, d: '把危險留在一臂之外。可貫穿成列的敵人。' },
  thunder: { n: '雷霆戟', k: 'spear', dmg: 17, t: 2, el: 'shock', d: '命中使敵人感電，下一擊會連鎖到附近敵人。' },
  dragon: { n: '龍脊槍', k: 'spear', dmg: 23, t: 3, sp: 'vsStag', d: '對失衡中的敵人傷害額外 +60%。' },
  maul: { n: '戰錘', k: 'hammer', dmg: 26, t: 1, d: '慢，但每一下都算數。重擊必定打斷敵人。' },
  quake: { n: '震地者', k: 'hammer', dmg: 30, t: 2, sp: 'quake', d: '重擊落地時掀起一圈震波。' },
  magma: { n: '熔核錘', k: 'hammer', dmg: 38, t: 3, el: 'fire', d: '錘頭仍是半融的。命中使敵人灼燒。' },
  bow1: { n: '獵弓', k: 'bow', dmg: 11, t: 1, d: '蓄力射出貫穿箭。' },
  gale: { n: '風語弓', k: 'bow', dmg: 10, t: 2, sp: 'twin', d: '每次射出兩支箭。' },
  starfall: { n: '星墜弓', k: 'bow', dmg: 17, t: 3, sp: 'boom', d: '蓄力箭命中時爆炸。' },
  stf1: { n: '學徒法杖', k: 'staff', dmg: 13, t: 1, d: '蓄力釋放一顆會爆裂的法球。' },
  rime: { n: '冰晶杖', k: 'staff', dmg: 14, t: 2, el: 'ice', d: '法彈使敵人遲緩。' },
  storm: { n: '雷雲杖', k: 'staff', dmg: 15, t: 2, el: 'shock', d: '法彈使敵人感電。' },
  voidrod: { n: '虛空權杖', k: 'staff', dmg: 19, t: 3, sp: 'home', d: '法彈會追蹤敵人並貫穿。' },
};

// ---------- 符文（嵌在武器上，預設 2 槽）----------
export const RUNE: Record<string, any> = {
  fire: { n: '烈焰符文', col: EL.fire, d: '攻擊附加灼燒。', st: (S: any) => S.els.push('fire') },
  ice: { n: '寒霜符文', col: EL.ice, d: '攻擊附加冰緩。', st: (S: any) => S.els.push('ice') },
  shock: { n: '雷鳴符文', col: EL.shock, d: '攻擊附加感電。', st: (S: any) => S.els.push('shock') },
  poison: { n: '劇毒符文', col: EL.poison, d: '攻擊附加中毒。', st: (S: any) => S.els.push('poison') },
  leech: { n: '吸血符文', col: '#e0624f', d: '造成傷害的 3% 回復生命。', st: (S: any) => (S.leech += 0.03) },
  sharp: { n: '銳利符文', col: '#f1ead8', d: '傷害 +18%。', st: (S: any) => (S.dmg *= 1.18) },
  swift: { n: '迅捷符文', col: '#9ad7a5', d: '攻擊速度 +15%。', st: (S: any) => (S.aspd *= 1.15) },
  keen: { n: '精準符文', col: '#f3b95f', d: '暴擊率 +12%。', st: (S: any) => (S.crit += 0.12) },
  exec: { n: '處決符文', col: '#c44', d: '對生命低於三成的敵人傷害 +45%。', st: (S: any) => (S.exec += 0.45) },
  reach: { n: '巨人符文', col: '#c9a25a', d: '攻擊範圍與射速 +22%。', st: (S: any) => (S.range *= 1.22) },
  light: { n: '輕盈符文', col: '#bfe', d: '攻擊消耗的體力 −30%。', st: (S: any) => (S.staCost *= 0.7) },
  breaker: { n: '破勢符文', col: '#fa6', d: '對失衡中的敵人傷害額外 +60%。', st: (S: any) => (S.vsStag += 0.6) },
  echo: { n: '回響符文', col: '#b9f', d: '18% 機率追加一次命中。', st: (S: any) => (S.echo += 0.18) },
  greed: { n: '貪婪符文', col: '#fd6', d: '獲得的金幣 +35%。', st: (S: any) => (S.goldMult *= 1.35) },
  ward: { n: '守護符文', col: '#8cf', d: '擊殺敵人獲得 6 點護盾（上限 30）。', st: (S: any) => (S.ward += 6) },
};

// ---------- 遺物（被動，無數量上限）----------
export const RELIC: Record<string, any> = {
  heart: { n: '鐵心', d: '生命上限 +25。', st: (S: any) => (S.maxHp += 25) },
  boots: { n: '風靴', d: '移動速度 +12%。', st: (S: any) => (S.speed *= 1.12) },
  lung: { n: '肺石', d: '體力上限 +30。', st: (S: any) => (S.maxSta += 30) },
  berserk: { n: '狂戰之血', d: '生命低於四成時傷害 +30%。', st: (S: any) => (S.berserk = 0.3) },
  perfect: { n: '完美主義', d: '精準閃避回復 5 點生命。', st: (S: any) => (S.pdHeal = 5) },
  riposte: { n: '反擊之盾', d: '彈反成功時對周圍造成傷害。', st: (S: any) => (S.parryBlast = 1) },
  hand: { n: '貪婪之手', d: '金幣 +30%。', st: (S: any) => (S.goldMult *= 1.3) },
  belt: { n: '藥師腰帶', d: '藥水上限 +1。', st: (S: any) => (S.potMax += 1) },
  thorn: { n: '荊棘甲', d: '被近身命中時反彈 15 點傷害。', st: (S: any) => (S.thorns = 15) },
  phoenix: { n: '鳳凰羽', d: '死亡時以半血復活一次，之後化為灰燼。', st: (S: any) => (S.phoenix = 1) },
  dice: { n: '賭徒骰', d: '暴擊率 +10%，暴擊傷害 +30%。', st: (S: any) => { S.crit += 0.1; S.critMult += 0.3; } },
  blood: { n: '嗜血', d: '擊殺敵人回復 2 點生命。', st: (S: any) => (S.killHeal += 2) },
  cloak: { n: '幽靈斗篷', d: '閃避無敵時間加長。', st: (S: any) => (S.iframe += 0.08) },
  sand: { n: '時之沙', d: '精準閃避的慢動作持續兩倍。', st: (S: any) => (S.pdLong = 2) },
  giant: { n: '巨人腰帶', d: '重擊傷害 +40%。', st: (S: any) => (S.heavy *= 1.4) },
  core: { n: '靜電核心', d: '每第五次命中釋放連鎖閃電。', st: (S: any) => (S.static = 1) },
  iceheart: { n: '冰心', d: '對冰緩中的敵人傷害 +25%。', st: (S: any) => (S.chillBonus = 0.25) },
  ember: { n: '火種', d: '灼燒中的敵人死亡時引燃周圍敵人。', st: (S: any) => (S.burnSpread = 1) },
  fang: { n: '毒牙', d: '中毒傷害 +60%。', st: (S: any) => (S.poisonUp = 1.6) },
  badge: { n: '商人徽章', d: '商店價格 −25%。', st: (S: any) => (S.shopMult *= 0.75) },
  compass: { n: '探險家羅盤', d: '顯示整層地圖與密室。', st: (S: any) => (S.compass = 1) },
  socket: { n: '第三符槽', d: '武器符文槽 +1。', st: (S: any) => (S.slots += 1) },
  charm: { n: '能量護符', d: '技能冷卻 −25%。', st: (S: any) => (S.cdr *= 0.75) },
  glass: { n: '玻璃大砲', d: '傷害 +40%，生命上限 −30%。', st: (S: any) => { S.dmg *= 1.4; S.hpMul *= 0.7; } },
  wall: { n: '堅壁', d: '受到的傷害 −15%。', st: (S: any) => (S.armor += 0.15) },
  soullamp: { n: '魂燈', d: '獲得的魂晶 +50%。', st: (S: any) => (S.shardMult *= 1.5) },
  clover: { n: '幸運草', d: '寶箱與事件更容易出好東西。', st: (S: any) => (S.luck += 1) },
  moss: { n: '回復苔', d: '進入新房間時回復 6 點生命。', st: (S: any) => (S.roomHeal += 6) },
  chain: { n: '連擊徽', d: '連續命中每次 +2% 傷害（上限 30%），受傷時歸零。', st: (S: any) => (S.comboUp = 1) },
  dauntless: { n: '無畏', d: '體力回復速度 +40%。', st: (S: any) => (S.staRegen *= 1.4) },
};

// ---------- 職業 ----------
export const CLS: Record<string, any> = {
  knight: { n: '騎士', hp: 120, sta: 100, spd: 150, wpn: 'iron', parry: 0.06, cost: 0, d: '重甲與盾。彈反的判定時間較寬，適合第一次入塔。',
    sk: [{ n: '盾擊', cd: 8, d: '向前衝撞，沿途敵人失衡。衝撞中無敵。' }, { n: '戰吼', cd: 20, d: '8 秒內傷害 +30%、受傷 −30%，並震懾周圍敵人。' }] },
  ranger: { n: '遊俠', hp: 92, sta: 105, spd: 160, wpn: 'bow1', cost: 60, d: '保持距離，以箭解決問題。',
    sk: [{ n: '後躍射擊', cd: 6, d: '向後翻躍並射出三支箭。翻躍中無敵。' }, { n: '箭雨', cd: 11, d: '在瞄準處降下一陣箭雨。' }] },
  rogue: { n: '刺客', hp: 85, sta: 120, spd: 172, wpn: 'dag1', dodge: 0.7, cost: 120, d: '閃避消耗更少。脆弱，但從不站在原地。',
    sk: [{ n: '影襲', cd: 7, d: '瞬移到敵人身後並給予一記暴擊。' }, { n: '煙幕', cd: 16, d: '3.5 秒內敵人失去你的蹤影，下一擊必定暴擊。' }] },
  mage: { n: '法師', hp: 80, sta: 100, spd: 150, wpn: 'stf1', cost: 200, d: '最低的生命，最大的範圍。',
    sk: [{ n: '閃現', cd: 5, d: '朝移動方向瞬間位移。' }, { n: '冰霜新星', cd: 12, d: '以自身為中心爆發寒氣，傷害並冰緩敵人。' }] },
};

// ---------- 敵人 ----------
// atks 欄位：t 類型｜rng 觸發距離｜min 最短距離｜dmg｜wind 前搖秒數｜rec 收招｜cd 冷卻｜w 權重｜ph 需要的 Boss 階段
export const EN: Record<string, any> = {
  slime: { n: '孢子史萊姆', hp: 30, spd: 62, r: 12, gold: 2, look: 'blob', col: '#74c98a', c2: '#e6ffb8', mv: 'hop', poise: 0,
    atks: [{ t: 'swing', rng: 46, reach: 44, arc: 2.4, dmg: 9, wind: 0.55, rec: 0.5, cd: 1.3 }],
    d: '菌林裡最常見的東西。牠不恨你，牠只是餓。' },
  hound: { n: '菌絲獵犬', hp: 40, spd: 118, r: 12, gold: 3, look: 'beast', col: '#8f8470', c2: '#7dffd0', mv: 'orbit', keep: 150, poise: 0,
    atks: [{ t: 'dash', rng: 240, min: 60, dmg: 13, wind: 0.6, spd: 520, dur: 0.36, rec: 0.7, cd: 1.9 }],
    d: '皮毛下長滿發光的菌絲。會繞著獵物打轉，壓低身子後直線撲擊——看到牠伏低，就往側邊閃。' },
  spitter: { n: '吐孢者', hp: 34, spd: 52, r: 13, gold: 3, look: 'plant', col: '#c88654', c2: '#ffb86b', mv: 'keep', keep: 230, poise: 0,
    atks: [{ t: 'shot', rng: 430, dmg: 10, wind: 0.6, n: 1, spd: 230, rec: 0.4, cd: 2.1, eff: 'poison' },
      { t: 'lob', rng: 380, dmg: 14, wind: 0.5, delay: 0.95, rad: 52, rec: 0.5, cd: 3.4, w: 0.6, puddle: 'poison' }],
    d: '一株會走路的蕈。孢子彈可以用彈反打回去。' },
  guard: { n: '蕈傘衛兵', hp: 88, spd: 68, r: 15, gold: 6, look: 'knight', col: '#b85c48', c2: '#f6dca6', mv: 'chase', shield: 1, poise: 1,
    atks: [{ t: 'swing', rng: 62, reach: 66, arc: 1.8, dmg: 17, wind: 0.75, rec: 0.85, cd: 1.5 },
      { t: 'slam', rng: 72, rad: 86, dmg: 20, wind: 1.0, rec: 1.0, cd: 4, w: 0.6 }],
    d: '舉著樹皮盾的老兵。正面攻擊大多會被擋下——繞到背後、用重擊破盾，或彈反牠的揮擊。' },
  matriarch: { n: '腐菌之母', boss: 1, hp: 640, spd: 46, r: 34, gold: 70, look: 'matriarch', col: '#a8465c', c2: '#ffb86b', mv: 'chase', poise: 9,
    atks: [{ t: 'slam', rng: 150, rad: 128, dmg: 22, wind: 1.0, rec: 0.9, cd: 1.4 },
      { t: 'rain', rng: 900, k: 5, rad: 54, dmg: 16, delay: 1.0, wind: 0.7, rec: 0.6, cd: 2, puddle: 'poison' },
      { t: 'radial', rng: 900, n: 14, spd: 165, dmg: 12, wind: 0.8, rec: 0.5, cd: 2, eff: 'poison' },
      { t: 'summon', rng: 900, id: 'slime', n: 2, wind: 0.9, rec: 0.6, cd: 6, w: 0.5 },
      { t: 'dash', ph: 1, rng: 520, min: 130, dmg: 24, wind: 0.85, spd: 540, dur: 0.5, rec: 1.0, cd: 2 },
      { t: 'spiral', ph: 2, rng: 900, arms: 3, dur: 2.4, iv: 0.13, spd: 155, dmg: 11, wind: 0.8, rec: 0.9, cd: 3 }],
    d: '整座菌林是牠的身體，這只是牠願意讓你看見的部分。生命越低，牠越不耐煩。' },
};

// ---------- 生態域 ----------
export const BIOMES: any[] = [
  { id: 'fungal', n: '菌林', sub: '腐爛與新生之地',
    en: [['slime', 1], ['hound', 1.5], ['spitter', 1.5], ['guard', 2.5]], boss: 'matriarch', haz: 6,
    pal: { amb: [70, 92, 108], bg: '#05080a', grout: '#1a2b2d', floor: ['#3b5a54', '#36534e', '#40625a', '#324d49'], moss: '#5f9468',
      wallTop: '#7fa58d', wallTop2: '#739a84', wallFace: '#4a756e', wallFace2: '#1a2f33', rim: '#d2ecc8',
      acc: '#7dffd0', acc2: '#ffb86b', lamp: '#ffd9a0', haz: '#4a3e2c' },
    d: '塔的最上層早已被菌絲吞沒。發光的蕈傘替代了火把，空氣裡飄著細小的孢子。' },
];
export const biomeOf = (floor: number) => BIOMES[Math.floor((floor - 1) / 3) % BIOMES.length];
export const floorName = (floor: number) => `第 ${floor} 層`;

/** 遺言（死亡時留在屍體上；多人模式下其他人看得到）。只能從清單選，避免不當文字。 */
export const LAST_WORDS = ['差一點。', '不要貪刀。', '看到牠伏低就閃。', '我還會回來。', '這層有好東西。', '彈反比想像中容易。', '體力見底時別出手。', '……燈熄了。'];
