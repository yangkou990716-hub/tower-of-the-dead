// 故事文本。世界觀一句話：塔是向下長的；把最後的燈火帶到塔底，重新點燃長明火。
import { Meta } from './state';

export const TAGLINE = '把最後的燈火，帶到塔底。';
export const GOAL = '把燈火帶到塔底（第 15 層），重新點燃長明火。';
export const TOTAL_FLOORS = 15;

/** 序章：開始一段新旅途時播放。每個元素是一頁。 */
export const INTRO: string[][] = [
  ['很久以前，王國在大地的最深處點了一盞火。', '人們叫它「長明火」。', '只要它亮著，死去的人就能安睡。'],
  ['為了守住這盞火，人們向下築了一座塔。', '一層，又一層，往地底生長——', '所以它沒有塔頂，只有塔底。'],
  ['後來，火暗了。', '亡者醒來，沿著塔一層一層往上爬。', '花園、書庫、鑄城、王陵……整個王國都被塔吞了進去。'],
  ['塔外只剩下最後一處營地，和最後一點火種。', '提燈者帶著火種走進塔裡。', '一個接一個，沒有人回來。'],
  ['現在，燈在你手上。', '', '把火帶到塔底，重新點燃長明火。'],
];

/** 營地的守燈人。依進度說不同的話。 */
export function keeperLine(m: Meta): string {
  const s = m.stats;
  if (s.runs === 0) return '燈油夠你走到第一層的盡頭。剩下的，要靠你自己從塔裡帶回來。';
  if (s.bosses > 0 && s.bestFloor <= 4) return '腐菌之母倒了？牠曾是王家花園的園丁。別替牠難過，牠等這一天很久了。';
  if (s.deaths === 1) return '你的燈自己飄回來了。它還記得路——所以你也會記得。';
  const pool = [
    '塔不會變淺，但你會變強。',
    '看到黃光就擋，看到紅光就跑。我就是這樣活到現在的。',
    '體力見底的人，死得比受傷的人還快。',
    '魂晶是倒下的提燈者留下的記憶。拿來，我讓下一盞燈燒得更久。',
    '每一層的盡頭都有往下的階梯。第三層的盡頭……有東西守著。',
    `你到過${s.bestFloor ? `第 ${s.bestFloor} 層` : '塔口'}。火還在更下面。`,
  ];
  return pool[(s.runs + s.deaths) % pool.length];
}

export const BIOME_LORE: Record<string, string> = {
  fungal: '這裡曾是王家花園。園丁們沒有離開，只是長進了土裡。',
};
export const BOSS_LORE: Record<string, { title: string; intro: string; death: string }> = {
  matriarch: { title: '王家花園最後的園丁', intro: '「……又一盞燈。來，讓我看看它能照多久。」', death: '「謝謝你。花……終於可以謝了。」' },
};
export const DEATH_LINES = [
  '燈熄了。但營地的火還亮著。',
  '燈沿著來時的路飄回營地，等下一雙手。',
  '塔記不住你的名字。燈記得。',
  '你倒下的地方，會成為下一位提燈者的路標。',
];
export const FIRST_STEP = '塔在腳下。往下走。';
