// 展示場景的環境：全部程序化生成（沒有外部素材）。
// 主題：黃昏的菌林遺跡——古老石砌祭壇、巨型發光蘑菇、苔岩、晶簇、草原與花、遠方的樹，以及傳送門。
// 座標：1 單位 = 模擬層 1 格；競技場是模擬房間 27×15 格，中心 (13.5, 7.5)。
import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  positionWorld, positionLocal, uv, vec2, vec3, vec4, float, color, mix, smoothstep, length, atan, fract, floor, sin, cos, abs, max, min, clamp,
  mx_noise_float, time, instancedBufferAttribute, cameraViewMatrix, attribute, uniform, normalView, positionViewDirection, dot, pow, PI2, hash,
} from 'three/tsl';

export const CX = 13.5, CZ = 7.5;
export const playerXZ = uniform(new THREE.Vector2(CX, CZ + 2));

// ---------- 小工具 ----------
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const h3 = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number, z: number) { // 三維值雜訊（CPU，用來捏形狀）
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (i: number, j: number, k: number) => h3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x: number, y: number, z: number) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.1;
function paint(g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => void) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i); f(p, n, c); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
const C = (s: string) => new THREE.Color(s);
/** 共用頂點後重算法線＝平滑表面 */
function smoothed(g: THREE.BufferGeometry) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m; }
const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
/** 只保留 position/normal/color/uv，避免合併失敗 */
function clean(g: THREE.BufferGeometry) {
  let x = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) x.deleteAttribute(k);
  if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
  return x;
}
/** 角色用的邊緣光（輪廓更鮮明） */
export const rim = (c: string, k = 0.7) => color(c).mul(pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 3)).mul(k);

export interface Env { group: THREE.Group; grass: THREE.InstancedMesh; lights: { l: THREE.PointLight; base: number; f: number }[]; portal: THREE.Mesh; update(t: number, dt: number): void; }

// ---------- 地面：草地＋古老石砌祭壇（同一張著色器） ----------
function ground() {
  const g = new THREE.PlaneGeometry(110, 80, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const p = positionWorld.xz, q = p.sub(vec2(CX, CZ));
  const e = q.div(vec2(7.6, 4.9)), d = length(e);
  const n1 = mx_noise_float(vec3(p.mul(0.18), 0)), n2 = mx_noise_float(vec3(p.mul(0.7), 3)), n3 = mx_noise_float(vec3(p.mul(2.6), 7));
  // 草地：大色塊＋中頻＋細斑；遠處偏藍綠（空氣透視）
  const grassA = color('#3f8a55'), grassB = color('#8fc463'), grassC = color('#2f6f5a');
  let gc: any = mix(grassA, grassB, smoothstep(-0.5, 0.7, n1)).mul(float(0.9).add(n2.mul(0.08)).add(n3.mul(0.05)));
  gc = mix(gc, grassC, smoothstep(10, 26, length(q)).mul(0.6));
  const dirt = color('#b49270').mul(float(0.92).add(n3.mul(0.08)));
  gc = mix(gc, dirt, smoothstep(1.25, 1.02, d.add(n2.mul(0.12))).mul(0.85)); // 祭壇外圍的土徑
  // 石砌：橢圓同心環＋放射縫
  const r = d.mul(5.2), th = atan(q.y, q.x).div(PI2).add(0.5), ring = floor(r);
  const segs = max(float(6), ring.mul(7)), cell = floor(th.mul(segs).add(ring.mul(0.37)));
  const fr = fract(r), ft = fract(th.mul(segs).add(ring.mul(0.37)));
  const groove = smoothstep(0.0, 0.07, fr).mul(smoothstep(1.0, 0.93, fr)).mul(smoothstep(0.0, 0.05, ft)).mul(smoothstep(1.0, 0.95, ft));
  const hc = hash(cell.add(ring.mul(57.3)));
  let stone: any = mix(color('#efe3cc'), color('#d5cde6'), hc).mul(float(0.88).add(n3.mul(0.07)).add(n2.mul(0.05)));
  stone = mix(stone, color('#f6d9b8'), smoothstep(0.75, 1.0, hc).mul(0.5));
  const moss = color('#6f9e55');
  stone = mix(mix(color('#6c6476'), moss, smoothstep(0.0, 0.6, n2.add(0.3))), stone, groove);   // 縫隙：深色＋苔
  stone = mix(stone, moss.mul(1.1), smoothstep(0.62, 0.98, d).mul(smoothstep(0.1, 0.6, n2.add(n3.mul(0.5)))).mul(0.75)); // 外緣長苔
  // 中央徽記與符文環
  const runeBand = smoothstep(0.565, 0.575, d).mul(smoothstep(0.625, 0.615, d));
  const ticks = smoothstep(0.55, 0.9, sin(th.mul(PI2).mul(36))).mul(smoothstep(0.58, 0.6, d)).mul(smoothstep(0.61, 0.6, d));
  const star = smoothstep(0.17, 0.165, d.mul(float(1).add(abs(sin(th.mul(PI2).mul(4))).mul(0.6)))).mul(smoothstep(0.03, 0.045, d));
  const glow = runeBand.mul(0.35).add(ticks.mul(0.9)).add(star.mul(0.25));
  const plaza = smoothstep(1.0, 0.955, d.add(n2.mul(0.035)));
  stone = mix(stone, color('#e9b85a'), star.mul(0.9));
  stone = mix(stone, color('#8fd8e8'), runeBand.mul(0.5));
  m.colorNode = mix(gc, stone, plaza);
  m.roughnessNode = mix(float(0.95), float(0.72), plaza);
  const pulse = sin(time.mul(1.4)).mul(0.25).add(0.75);
  m.emissiveNode = mix(color('#59e3ff'), color('#ffcf7a'), smoothstep(0.3, 0.0, d)).mul(glow).mul(plaza).mul(pulse).mul(1.6);
  const o = new THREE.Mesh(g, m); o.position.set(CX, 0, CZ); o.receiveShadow = true; return o;
}
const inPlaza = (x: number, z: number, k = 1) => Math.hypot((x - CX) / 7.6, (z - CZ) / 4.9) < k;

// ---------- 草：一叢 4 片葉，實例化；風吹與被主角撥開 ----------
function grass(count: number, avoid: (x: number, z: number) => boolean) {
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const a = b * 1.26 + 0.3, ox = Math.cos(a * 2.3) * 0.09, oz = Math.sin(a * 2.3) * 0.09, w = 0.045, H = [0, 0.5, 1];
    const pos: number[] = [], u: number[] = [];
    for (let i = 0; i < 2; i++) {
      const y0 = H[i], y1 = H[i + 1], w0 = w * (1 - y0), w1 = w * (1 - y1);
      const P = (y: number, ww: number, s: number) => [ox + Math.cos(a) * ww * s, y, oz + Math.sin(a) * ww * s];
      const v = [P(y0, w0, -1), P(y0, w0, 1), P(y1, w1, 1), P(y0, w0, -1), P(y1, w1, 1), P(y1, w1, -1)];
      for (const q of v) pos.push(...q);
      u.push(0, y0, 1, y0, 1, y1, 0, y0, 1, y1, 0, y1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.computeVertexNormals(); blades.push(g);
  }
  const geo = mergeGeometries(blades);
  const r = rng(7), mats: THREE.Matrix4[] = [], tp: number[] = [], tint: number[] = [];
  let tries = 0;
  while (mats.length < count && tries++ < count * 6) {
    const x = -3 + r() * 33, z = -2 + r() * 20;
    if (inPlaza(x, z, 0.96)) continue;
    if (inPlaza(x, z, 1.08) && r() > 0.35) continue; // 土徑稀疏
    if (avoid(x, z)) continue;
    const s = 0.32 + r() * 0.36 * (inPlaza(x, z, 1.4) ? 0.6 : 1);
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(s, s * (0.8 + r() * 0.6), s)));
    tp.push(x, z);
    const f = r(); tint.push(...(f < 0.06 ? [1.5, 0.95, 1.2] : f < 0.12 ? [1.4, 1.3, 0.7] : [0.9 + r() * 0.2, 1, 0.85 + r() * 0.2])); // 少數葉尖帶粉、帶黃
  }
  const tpA = new THREE.InstancedBufferAttribute(new Float32Array(tp), 2), tiA = new THREE.InstancedBufferAttribute(new Float32Array(tint), 3);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const P: any = instancedBufferAttribute(tpA), TI: any = instancedBufferAttribute(tiA);
  const k = uv().y.mul(uv().y);
  const wind = sin(time.mul(1.6).add(P.x.mul(0.45)).add(P.y.mul(0.25))).mul(0.5).add(sin(time.mul(3.7).add(P.x.mul(1.3))).mul(0.15));
  const away = P.sub(playerXZ), dd = length(away), push = smoothstep(1.1, 0.2, dd).mul(0.55);
  const dir = away.div(max(dd, 0.001));
  m.positionNode = positionLocal.add(vec3(wind.mul(0.16).add(dir.x.mul(push)), push.mul(-0.35).mul(k), wind.mul(0.06).add(dir.y.mul(push))).mul(k));
  const base = color('#1f5a44'), tip = color('#b9e874').mul(TI);
  m.colorNode = mix(base, tip, pow(uv().y, 1.3)).mul(float(0.72).add(uv().y.mul(0.35)));
  m.normalNode = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize(); // 草當成一片柔和的面受光
  // 較便宜的版本：Lambert 光照（草幾乎沒有高光，外觀差異極小），同樣的風吹、顏色與陰影
  const lam = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  lam.positionNode = m.positionNode; lam.colorNode = m.colorNode; lam.normalNode = m.normalNode;
  const im = new THREE.InstancedMesh(geo, m, mats.length); mats.forEach((x, i) => im.setMatrixAt(i, x));
  im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false; im.userData.mats = { std: m, lam };
  return im;
}

// ---------- 小花（發一點光，黃昏時像星點） ----------
function flowers(avoid: (x: number, z: number) => boolean) {
  const r = rng(21), parts: THREE.BufferGeometry[] = [];
  const cols = ['#ff8ec7', '#fff2a8', '#9fd8ff', '#ffffff', '#ffb36b'];
  for (let i = 0; i < 70; i++) {
    const cx = -2 + r() * 31, cz = -1 + r() * 18; if (inPlaza(cx, cz, 1.02) || avoid(cx, cz)) { i--; if (r() < 0.02) break; continue; }
    const c = C(cols[Math.floor(r() * cols.length)]);
    for (let j = 0; j < 6; j++) {
      const x = cx + (r() - 0.5) * 1.6, z = cz + (r() - 0.5) * 1.2, y = 0.18 + r() * 0.28, s = 0.06 + r() * 0.05;
      const stem = new THREE.CylinderGeometry(0.008, 0.012, y, 3); stem.translate(x, y / 2, z); paint(stem, (_, __, cc) => cc.set('#3d7a4a')); parts.push(clean(stem));
      const pet = new THREE.CircleGeometry(s, 5); pet.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.6); pet.translate(x, y, z); paint(pet, (p, _, cc) => cc.copy(lerpC(c, C('#fff7d6'), 0.0))); parts.push(clean(pet));
      const ctr = new THREE.SphereGeometry(s * 0.35, 5, 3); ctr.translate(x, y + 0.01, z); paint(ctr, (_, __, cc) => cc.set('#ffd34a')); parts.push(clean(ctr));
    }
  }
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  m.emissiveNode = attribute('color', 'vec3').mul(0.35) as any;
  const o = new THREE.Mesh(mergeGeometries(parts), m); o.receiveShadow = true; return o;
}

// ---------- 苔岩（扭曲的球體，平面著色＝手工雕刻感；頂部長苔） ----------
function rock(seed: number, sx: number, sy: number, sz: number) {
  const g = smoothed(new THREE.IcosahedronGeometry(1, 5));
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + fbm(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4) * 0.38 + vnoise(v.x * 6 + seed, v.y * 6, v.z * 6) * 0.03;
    v.multiplyScalar(k); v.set(v.x * sx, Math.max(v.y * sy, -0.25 * sy), v.z * sz);
    // 層理：水平的切面
    v.y = Math.round(v.y / (0.4 * sy)) * (0.4 * sy) * 0.14 + v.y * 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); const x = g;
  const top = C('#5f9f62'), top2 = C('#9fd07a'), s1 = C('#9a93b6'), s2 = C('#e2d8cc'), dark = C('#4b4466');
  paint(x, (p, n, c) => {
    const f = fbm(p.x * 0.8 + seed, p.y * 0.8, p.z * 0.8);
    const stone = lerpC(lerpC(dark, s1, (p.y / sy + 0.3) * 1.2), s2, 0.3 + f * 0.6);
    const mossK = Math.max(0, Math.min(1, (n.y - 0.55 + f * 0.25) * 3.5));
    c.copy(lerpC(stone, lerpC(top, top2, 0.5 + f), mossK));
  });
  return clean(x);
}

// ---------- 巨型蘑菇（夢幻感的主角：發光菌褶、斑點） ----------
function bigMushroom(seed: number, h: number, capC: string, gillC: string, lean: number) {
  const r = rng(seed), stemPts: THREE.Vector2[] = [], R = h * 0.42;
  for (let i = 0; i <= 10; i++) { const t = i / 10; stemPts.push(new THREE.Vector2(h * (0.075 + 0.05 * Math.pow(1 - t, 3) + 0.01 * Math.sin(t * 9)), t * h * 0.82)); }
  const stem = new THREE.LatheGeometry(stemPts, 14);
  paint(stem, (p, _, c) => c.copy(lerpC(C('#e9dccb'), C('#fff6ea'), p.y / h + h3(p.x, p.y, p.z) * 0.1)));
  const capPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI * 0.5; capPts.push(new THREE.Vector2(Math.cos(a) * R * (1 + 0.08 * Math.sin(t * 3)), h * 0.78 + Math.sin(a) * R * 0.62)); }
  capPts.reverse();
  const cap = new THREE.LatheGeometry(capPts, 28);
  const cc = C(capC), ctop = lerpC(cc, C('#ffffff'), 0.28), crim = lerpC(cc, C('#2a1840'), 0.25);
  paint(cap, (p, _, c) => { const t = (p.y - h * 0.78) / (R * 0.62); c.copy(lerpC(crim, ctop, Math.pow(Math.max(0, t), 0.8))); });
  const gills = new THREE.ConeGeometry(R * 0.99, R * 0.22, 28, 1, true); gills.rotateX(Math.PI); gills.translate(0, h * 0.78 + R * 0.11 - 0.02, 0);
  paint(gills, (_, __, c) => c.set(gillC));
  const spots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.28, t = 0.25 + r() * 0.6, rr = Math.cos(t * Math.PI * 0.5) * R, y = h * 0.78 + Math.sin(t * Math.PI * 0.5) * R * 0.62;
    const s = new THREE.SphereGeometry(R * (0.07 + r() * 0.06), 8, 4); s.scale(1, 0.35, 1);
    s.lookAt(new THREE.Vector3(Math.cos(a) * rr, y - h * 0.6, Math.sin(a) * rr).normalize()); s.rotateX(Math.PI / 2); s.translate(Math.cos(a) * rr * 1.01, y + 0.02, Math.sin(a) * rr * 1.01);
    paint(s, (_, __, c) => c.set('#fffaf0')); spots.push(clean(s));
  }
  const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(lean * 0.7, r() * 6.28, lean));
  const body = mergeGeometries([clean(stem), clean(cap), ...spots]).applyMatrix4(tilt);
  const glow = clean(gills).applyMatrix4(tilt);
  const top = new THREE.Vector3(0, h * 0.74, 0).applyMatrix4(tilt);
  return { body, glow, top };
}

// ---------- 遺跡石柱 ----------
function column(seed: number, h: number, broken: boolean) {
  const g = new THREE.CylinderGeometry(0.4, 0.46, h, 16, 8, false); g.translate(0, h / 2 + 0.25, 0);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z);
    const fl = rr > 0.05 ? 1 - 0.07 * Math.max(0, Math.cos(a * 8)) : 1; let y = v.y;
    if (broken && y > h * 0.9) y = h * (0.78 + 0.22 * (0.5 + 0.5 * Math.sin(a * 3 + seed))) + 0.25;
    pos.setXYZ(i, v.x * fl, y, v.z * fl);
  }
  const base = new THREE.BoxGeometry(1.15, 0.28, 1.15); base.translate(0, 0.14, 0);
  const cap = new THREE.BoxGeometry(1.05, 0.22, 1.05); cap.translate(0, h + 0.36, 0);
  const parts = [g.toNonIndexed(), base.toNonIndexed(), ...(broken ? [] : [cap.toNonIndexed()])];
  const x = mergeGeometries(parts.map((p) => { p.deleteAttribute('normal'); p.deleteAttribute('uv'); return p; })); x.computeVertexNormals();
  paint(x, (p, n, c) => {
    const f = fbm(p.x * 2 + seed, p.y * 2, p.z * 2);
    const stone = lerpC(C('#cfc4b4'), C('#efe6d6'), 0.5 + f * 0.6);
    const moss = Math.max(0, Math.min(1, (n.y - 0.4) * 3 + f * 0.4)) + Math.max(0, (0.6 - p.y) * 0.8 + f * 0.5);
    c.copy(lerpC(stone, lerpC(C('#5f9a4f'), C('#a6cf62'), 0.5 + f), Math.min(1, moss)));
  });
  return clean(x);
}

// ---------- 樹（背景層次） ----------
function tree(seed: number, h: number, leafA: string, leafB: string) {
  const r = rng(seed), bend = (r() - 0.5) * 0.25;
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, h * 0.6, 8, 6); trunk.translate(0, h * 0.3, 0);
  const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + bend * y * y); }
  trunk.computeVertexNormals(); paint(trunk, (p, _, c) => c.copy(lerpC(C('#5b4636'), C('#8a6a4e'), p.y / h)));
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const s = h * (0.22 + r() * 0.14), g = smoothed(new THREE.IcosahedronGeometry(s, 3)), pp = g.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < pp.count; k++) { v.fromBufferAttribute(pp, k); v.multiplyScalar(1 + fbm(v.x * 2 + seed + i, v.y * 2, v.z * 2) * 0.25); pp.setXYZ(k, v.x, v.y * 0.8, v.z); }
    g.computeVertexNormals();
    g.translate((r() - 0.5) * h * 0.4 + bend * h * h * 0.36, h * (0.62 + r() * 0.3), (r() - 0.5) * h * 0.4);
    leaves.push(clean(g));
  }
  const lg = mergeGeometries(leaves); const A = C(leafA), B = C(leafB);
  paint(lg, (p, n, c) => c.copy(lerpC(A, B, (p.y / h - 0.45) * 1.6 + n.y * 0.35 + fbm(p.x * 1.5, p.y * 1.5, p.z * 1.5) * 0.3)));
  return mergeGeometries([clean(trunk), lg]);
}

// ---------- 灌木（前景層次） ----------
function bush(seed: number, s: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = smoothed(new THREE.IcosahedronGeometry(s * (0.55 + r() * 0.35), 3)), pp = g.attributes.position, v = new THREE.Vector3();
    for (let k = 0; k < pp.count; k++) { v.fromBufferAttribute(pp, k); v.multiplyScalar(1 + fbm(v.x * 3 + seed + i, v.y * 3, v.z * 3) * 0.22); pp.setXYZ(k, v.x, Math.max(v.y * 0.8, -0.05), v.z); }
    g.computeVertexNormals(); g.translate((r() - 0.5) * s, s * 0.45 + r() * s * 0.25, (r() - 0.5) * s * 0.8); parts.push(clean(g));
  }
  const g = mergeGeometries(parts), hasF = r() < 0.5, fc = C(['#ff9ec9', '#fff0a0', '#b8d8ff'][Math.floor(r() * 3)]);
  paint(g, (p, n, c) => { const f = fbm(p.x * 4, p.y * 4, p.z * 4); c.copy(lerpC(C('#2f6e4e'), C('#8fcf6a'), p.y / (s * 1.3) + n.y * 0.3 + f * 0.3)); if (hasF && n.y > 0.3 && f > 0.25) c.copy(fc); });
  return g;
}

// ---------- 晶簇 ----------
function crystals(seed: number, n: number, s: number) {
  const r = rng(seed), out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.16 * s, (0.5 + r() * 0.7) * s, 0.16 * s); g.translate(0, 0.35 * s, 0);
    g.rotateZ((r() - 0.5) * 0.9); g.rotateX((r() - 0.5) * 0.9); g.translate((r() - 0.5) * 0.5 * s, 0, (r() - 0.5) * 0.5 * s);
    out.push(clean(g));
  }
  return mergeGeometries(out);
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));

export function buildEnv(scene: THREE.Scene, grassCount: number, solid: (x: number, z: number) => boolean): Env {
  const group = new THREE.Group(); scene.add(group);
  group.add(ground());

  // 天空：黃昏漸層（不受霧影響）
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
  const sy = positionLocal.normalize().y;
  (sky.material as any).colorNode = mix(mix(color('#ffcfb0'), color('#f4a3c0'), smoothstep(-0.05, 0.12, sy)), color('#6d7fe0'), smoothstep(0.1, 0.6, sy));
  sky.position.set(CX, 0, CZ); sky.renderOrder = -1; group.add(sky);

  const r = rng(99);
  const rocks: THREE.BufferGeometry[] = [], cols: THREE.BufferGeometry[] = [], trees: THREE.BufferGeometry[] = [];
  const mushBody: THREE.BufferGeometry[] = [], mushGlow: THREE.BufferGeometry[] = [], crystA: THREE.BufferGeometry[] = [], crystB: THREE.BufferGeometry[] = [];
  const occupied: [number, number, number][] = [];
  const addRock = (x: number, z: number, s: number, hy = 1) => { rocks.push(at(rock(x * 3.1 + z, s * (0.9 + r() * 0.5), s * hy * (0.6 + r() * 0.5), s * (0.8 + r() * 0.4)), x, 0, z, r() * 6)); occupied.push([x, z, s * 0.9]); };
  // 北側岩壁（主要背景），左右兩側岩石，南側只放低矮的前景石
  for (let x = -2; x <= 29; x += 1.6 + r() * 0.8) { addRock(x, -0.4 - r() * 1.2, 1.3 + r() * 1.2, 1.4); if (r() < 0.6) addRock(x + 0.8, -2.2 - r(), 1.8 + r() * 1.4, 1.6); }
  for (let z = 0.5; z <= 15; z += 1.5 + r() * 0.8) { addRock(-0.2 - r() * 0.8, z, 1.1 + r() * 0.9, 1.2); addRock(27.2 + r() * 0.8, z, 1.1 + r() * 0.9, 1.2); }
  const bushes: THREE.BufferGeometry[] = [];
  for (let x = -1; x <= 28; x += 1.2 + r() * 2.2) {
    const z = 15.4 + r() * 1.4;
    if (r() < 0.35) addRock(x, z + 0.4, 0.35 + r() * 0.5, 0.6);
    else { bushes.push(at(bush(x * 5 + z, 0.5 + r() * 0.45), x, 0, z, r() * 6)); occupied.push([x, z, 0.6]); }
  }
  for (const [x, z] of [[2.5, 2.2], [24.6, 2.6], [1.8, 6.8], [25.6, 12.4], [11.2, 0.9], [17.4, 1.1]]) { bushes.push(at(bush(x * 7 + z, 0.55 + r() * 0.3), x, 0, z, r() * 6)); occupied.push([x, z, 0.6]); }
  // 遺跡：模擬層的 4 根柱子（第 4、22 格），加上散落的石塊
  for (const [x, z, h, b] of [[4.5, 3.5, 2.6, false], [22.5, 3.5, 1.9, true], [4.5, 11.5, 1.6, true], [22.5, 11.5, 2.6, false]] as [number, number, number, boolean][]) {
    cols.push(at(column(x + z, h, b), x, 0, z, r() * 6)); occupied.push([x, z, 0.8]);
    for (let i = 0; i < 2; i++) { const bx = new THREE.BoxGeometry(0.5 + r() * 0.3, 0.3, 0.4 + r() * 0.3); bx.rotateY(r() * 3); bx.rotateZ((r() - 0.5) * 0.4); const px = x + (r() - 0.5) * 2.2, pz = z + (r() > 0.5 ? 1 : -1) * (0.9 + r() * 0.4);
      const g = bx.toNonIndexed(); g.computeVertexNormals(); paint(g, (p, n, c) => c.copy(n.y > 0.6 ? C('#8fbf5e') : C('#d9cfbf'))); cols.push(at(clean(g), px, 0.12, pz)); }
  }
  // 北側拱門（視覺焦點）＋傳送門
  for (const sx of [-1, 1]) cols.push(at(column(7 + sx, 3.6, false), CX + sx * 2.35, 0, -0.55));
  const arch = new THREE.TorusGeometry(2.35, 0.34, 10, 24, Math.PI); arch.translate(0, 4.3, 0);
  const ag = arch.toNonIndexed(); ag.computeVertexNormals(); paint(ag, (p, n, c) => c.copy(lerpC(C('#d8ccb8'), C('#8fbf5e'), n.y > 0.5 ? 0.7 : 0.1)));
  cols.push(at(clean(ag), CX, 0, -0.55));
  // 巨型蘑菇
  const mspec: [number, number, number, string, string, number][] = [
    [-0.5, 1.2, 5.6, '#e0569b', '#7ff6ff', 0.12], [2.2, -1.6, 4.0, '#2bb3c4', '#ffd36b', -0.1], [26.8, 0.8, 5.0, '#f08a3a', '#b39bff', -0.14], [24.6, -1.8, 3.4, '#e0569b', '#7ff6ff', 0.1],
    [28.8, 9.8, 4.4, '#7b62e8', '#ffe08a', -0.12], [-1.8, 10.5, 3.8, '#2bb3c4', '#ff9bd1', 0.12], [9.2, -2.6, 3.2, '#f08a3a', '#7ff6ff', 0.05], [18.6, -2.4, 3.8, '#7b62e8', '#9cffd6', -0.05],
  ];
  const lights: Env['lights'] = [];
  mspec.forEach(([x, z, h, cc, gc, lean], i) => {
    const mm = bigMushroom(i * 13 + 5, h, cc, gc, lean); at(mm.body, x, 0, z); at(mm.glow, x, 0, z); mushBody.push(mm.body); mushGlow.push(mm.glow);
    if (i < 3) { const l = new THREE.PointLight(gc, 0, 9, 1.6); l.position.set(x + mm.top.x, mm.top.y - 0.3, z + mm.top.z); group.add(l); lights.push({ l, base: 10, f: i * 1.7 }); }
    occupied.push([x, z, 1.2]);
  });
  // 小蘑菇叢（發光）
  for (let i = 0; i < 26; i++) {
    const o = occupied[Math.floor(r() * occupied.length)]; const a = r() * 6.28, d = o[2] + 0.3 + r() * 0.6, x = o[0] + Math.cos(a) * d, z = o[1] + Math.sin(a) * d;
    if (inPlaza(x, z, 1.05) || solid(x, z)) continue;
    const pal = [['#ff7fbf', '#bff8ff'], ['#59d6e6', '#fff0a8'], ['#ffb06b', '#d6c4ff']][i % 3];
    const mm = bigMushroom(200 + i, 0.35 + r() * 0.5, pal[0], pal[1], (r() - 0.5) * 0.5); at(mm.body, x, 0, z); at(mm.glow, x, 0, z); mushBody.push(mm.body); mushGlow.push(mm.glow);
  }
  // 晶簇
  for (const [x, z, s, k] of [[1.6, 0.9, 1.2, 0], [25.6, 1.4, 1.0, 1], [0.8, 13.6, 0.9, 1], [26.4, 13.2, 1.1, 0], [16.6, -0.6, 0.8, 0], [10.2, -0.4, 0.7, 1]] as number[][]) {
    const g = at(crystals(x * 7 + z, 6, s), x, 0, z); (k ? crystB : crystA).push(g);
  }
  { const l = new THREE.PointLight('#b88cff', 0, 8, 1.6); l.position.set(CX, 2.6, 0.4); group.add(l); lights.push({ l, base: 12, f: 9 }); }
  // 遠景樹
  const tspec: [number, number, number, string, string][] = [
    [-4, -4, 7, '#2f7a6a', '#a5e07a'], [5, -5.5, 8, '#2f6f78', '#8fd6a0'], [13, -6.5, 9, '#c95f9a', '#ffd0e6'], [21, -5.5, 8, '#2f7a6a', '#c7ec7a'], [30, -4, 7.5, '#5a5ac8', '#c8b8ff'],
    [-5, 6, 6.5, '#2f7a6a', '#b0e07a'], [32, 7, 7, '#c95f9a', '#ffd0e6'], [-4.5, 15, 5.5, '#2f6f78', '#9fe0a0'], [31.5, 15.5, 6, '#2f7a6a', '#c7ec7a'],
  ];
  tspec.forEach(([x, z, h, a, b], i) => trees.push(at(tree(i * 31 + 3, h, a, b), x, 0, z, i)));

  const vc = (o: any = {}) => new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o });
  const rockM = vc({ roughness: 0.9 });
  const mk = (gs: THREE.BufferGeometry[], m: THREE.Material, cast = true) => { if (!gs.length) return; const o = new THREE.Mesh(mergeGeometries(gs), m); o.castShadow = cast; o.receiveShadow = true; group.add(o); return o; };
  mk(rocks, rockM); mk(cols, vc({ roughness: 0.8 }));
  const bushM = vc({ roughness: 0.85 }); (bushM as any).emissiveNode = (attribute('color', 'vec3') as any).mul(0.1); mk(bushes, bushM);
  const treeM = vc({ roughness: 0.9 }); (treeM as any).emissiveNode = (attribute('color', 'vec3') as any).mul(0.12); mk(trees, treeM);
  const bodyM = vc({ roughness: 0.55 }); bodyM.emissiveNode = (attribute('color', 'vec3') as any).mul(0.18).add(rim('#ffd9f0', 0.25)); mk(mushBody, bodyM);
  const glowM = new THREE.MeshBasicNodeMaterial({ vertexColors: true, side: THREE.DoubleSide }); glowM.colorNode = (attribute('color', 'vec3') as any).mul(sin(time.mul(1.3)).mul(0.2).add(1.35)); mk(mushGlow, glowM, false);
  const cm = (c: string) => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }); m.colorNode = color(c); m.emissiveNode = color(c).mul(float(0.55).add(sin(time.mul(2).add(positionWorld.y.mul(3))).mul(0.2))); return m; };
  mk(crystA, cm('#69f0ff')); mk(crystB, cm('#c08bff'));
  group.add(flowers((x, z) => solid(x, z) || occupied.some(([ox, oz, rr]) => Math.hypot(x - ox, z - oz) < rr)));

  // 傳送門（旋轉的光渦）
  const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const pq = uv().sub(0.5), pr = length(pq).mul(2), pa = atan(pq.y, pq.x);
  const swirl = sin(pa.mul(5).add(pr.mul(9)).sub(time.mul(2.2))).mul(0.5).add(0.5);
  pm.colorNode = mix(color('#7a5cff'), color('#7ff6ff'), swirl).mul(smoothstep(1.0, 0.55, pr)).mul(swirl.mul(0.6).add(0.5)).mul(1.4);
  const portal = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), pm); portal.position.set(CX, 2.3, -0.6); group.add(portal);

  // 水池（模擬層：泥沼格＝會減速的淺水）
  const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0, transparent: true, opacity: 0.9 });
  const wp = positionWorld, wn = mx_noise_float(vec3(wp.x.mul(1.6), time.mul(0.35), wp.z.mul(1.6))), wn2 = mx_noise_float(vec3(wp.x.mul(3.4).add(time.mul(0.25)), time.mul(0.5), wp.z.mul(3.4)));
  const caust = clamp(pow(float(1).sub(abs(wn)), 8).add(pow(float(1).sub(abs(wn2)), 12).mul(0.6)), 0, 1);
  const fres = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2);
  wm.colorNode = mix(color('#1a6f9a'), color('#8fe8f8'), caust.mul(0.7)).add(color('#ffc0d8').mul(fres.mul(0.25)));
  wm.emissiveNode = color('#2aa7c4').mul(caust.mul(0.6).add(0.08));
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), wm); pond.scale.set(2.3, 1, 1.45); pond.position.set(8, 0.05, 12.2); pond.receiveShadow = true; group.add(pond);
  const rimG = new THREE.RingGeometry(0.96, 1.12, 40).rotateX(-Math.PI / 2); const rimM = new THREE.MeshStandardNodeMaterial({ color: '#b9b0c9', roughness: 0.9 });
  const pr2 = new THREE.Mesh(rimG, rimM); pr2.scale.copy(pond.scale); pr2.position.set(8, 0.06, 12.2); pr2.receiveShadow = true; group.add(pr2);

  // 從樹冠灑下的光柱（體積光近似：交叉的加法混合面）
  const shaftM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const sv = uv().y, sn = mx_noise_float(vec3(uv().x.mul(6), sv.mul(1.5).sub(time.mul(0.12)), 0)).mul(0.5).add(0.5);
  shaftM.colorNode = color('#ffe6b8').mul(smoothstep(0.0, 0.35, sv)).mul(smoothstep(1.0, 0.55, sv)).mul(smoothstep(0.0, 0.3, uv().x)).mul(smoothstep(1.0, 0.7, uv().x)).mul(sn.mul(0.6).add(0.4)).mul(0.09);
  for (const [x, z, w] of [[6.5, 4.5, 2.2], [20.5, 9.5, 2.6], [16.2, 2.5, 1.6]] as number[][]) {
    for (const ry of [0, Math.PI / 2]) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, 14), shaftM); sh.position.set(x - 3.2, 6.5, z - 2.6); sh.rotation.set(0, ry + 0.6, 0); sh.rotateX(-0.42); sh.renderOrder = 9; group.add(sh); }
  }
  const g = grass(grassCount, (x, z) => solid(x, z) || occupied.some(([ox, oz, rr]) => Math.hypot(x - ox, z - oz) < rr * 0.8) || Math.hypot((x - 8) / 2.4, (z - 12.2) / 1.55) < 1);
  group.add(g);

  return {
    group, grass: g, lights, portal,
    update(t) { for (const L of lights) L.l.intensity = L.base * (0.85 + 0.15 * Math.sin(t * 1.3 + L.f)); void min; },
  };
}
export const ENV_MISC = { cos, vec2 };
