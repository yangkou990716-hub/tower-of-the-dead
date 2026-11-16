// 用 sim 的 buildRoom() 格子資料生成 3D 房間。兩條資產路線：程序化 / KayKit。
// 座標：模擬 (x, y) 像素 → 3D (x / T, 0, y / T)，1 單位 = 1 格。
import * as THREE from 'three/webgpu';
import { RW, RH } from '../sim/util';
import { stoneTex, mossTex, rippleNormal, metalTex, softDisc } from './textures';
import type { Kay } from './kaykit';

export type Route = 'proc' | 'kaykit';
export interface LightSrc { x: number; y: number; z: number; col: THREE.Color; int: number; dist: number; flicker: number; on: () => boolean; prio: number; }
export interface Brazier { x: number; z: number; lit: boolean; fire: THREE.Object3D; hit: THREE.Mesh; src: LightSrc; }
export interface RoomView {
  group: THREE.Group; braziers: Brazier[]; lights: LightSrc[]; doors: THREE.Object3D[];
  update(t: number, dt: number, locked: boolean): void; dispose(): void;
}

const PUD: { tex: THREE.DataTexture | null; mat: THREE.MeshPhysicalMaterial | null } = { tex: null, mat: null };
let MIST: THREE.MeshBasicMaterial | null = null;
const hsh = (a: number, b: number, c = 0, d = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519 + d * 3266489917) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };

// ---------- 共用材質（≥5 種：石、苔、金屬、發光、液體，另有木、火） ----------
let M: any = null;
export function mats(pal: any) {
  if (M) return M;
  const floor = stoneTex(pal.floor[0], pal.grout, pal.moss, 3, 2);
  const wall = stoneTex(pal.wallFace, pal.wallFace2, pal.moss, 8, 2);
  const ripple = rippleNormal();
  const metal = metalTex();
  M = {
    floor: new THREE.MeshStandardMaterial({ map: floor.map, normalMap: floor.normal, roughnessMap: floor.rough, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.4, 1.4) }),
    wall: new THREE.MeshStandardMaterial({ map: wall.map, normalMap: wall.normal, roughnessMap: wall.rough, roughness: 1, color: '#cfd8d0' }),
    wallTop: new THREE.MeshStandardMaterial({ color: pal.wallTop, roughness: 0.95, map: mossTex(pal.moss, 12) }),
    moss: new THREE.MeshStandardMaterial({ color: '#8a9a88', map: mossTex(pal.moss, 4), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8a8f96', metalness: 1, roughness: 0.38, roughnessMap: metal }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.9, roughness: 0.5, roughnessMap: metal }),
    wood: new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.85 }),
    glowCap: new THREE.MeshStandardMaterial({ color: '#1c3a36', emissive: pal.acc, emissiveIntensity: 2.4, roughness: 0.6 }),
    stem: new THREE.MeshStandardMaterial({ color: '#d8e6cf', emissive: '#2b6b5a', emissiveIntensity: 0.5, roughness: 0.8 }),
    liquid: new THREE.MeshPhysicalMaterial({ color: '#3b6a64', roughness: 0.05, metalness: 0.3, normalMap: ripple, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.7, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05 }),
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.6, 0.45), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    ember: new THREE.MeshStandardMaterial({ color: '#2a1a12', emissive: '#ff6a20', emissiveIntensity: 1.2, roughness: 0.9 }),
    shadow: new THREE.MeshBasicMaterial({ color: '#000', alphaMap: softDisc(0.2, 0.75), transparent: true, depthWrite: false, opacity: 0.8 }),
    lava: new THREE.MeshStandardMaterial({ color: '#3a0d02', emissive: '#ff5a10', emissiveIntensity: 2, roughness: 0.7 }),
    stone2: new THREE.MeshStandardMaterial({ map: wall.map, normalMap: wall.normal, roughness: 0.95, color: '#a6b2a8' }),
    ripple,
  };
  return M;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  pillar: new THREE.CylinderGeometry(0.36, 0.42, 1, 8),
  pillarBase: new THREE.CylinderGeometry(0.47, 0.5, 0.22, 8),
  stem: new THREE.CylinderGeometry(0.035, 0.05, 1, 6).translate(0, 0.5, 0),
  cap: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  bowl: new THREE.CylinderGeometry(0.32, 0.18, 0.22, 12, 1, true),
  bowlRim: new THREE.TorusGeometry(0.32, 0.04, 6, 16).rotateX(Math.PI / 2),
  leg: new THREE.CylinderGeometry(0.03, 0.04, 0.6, 5),
  flame: new THREE.ConeGeometry(0.17, 0.55, 8, 1, true).translate(0, 0.27, 0),
  coal: new THREE.IcosahedronGeometry(0.2, 0),
  bar: new THREE.CylinderGeometry(0.045, 0.045, 1, 6).translate(0, 0.5, 0),
  disc: new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2),
  spike: new THREE.ConeGeometry(0.08, 0.3, 4).translate(0, 0.15, 0),
};

function inst(geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cast = true, recv = true) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, ms.length)); im.count = ms.length;
  ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = recv;
  im.computeBoundingSphere(); return im;
}
const mtx = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

/** 一面牆在 3D 裡的高度：南牆（靠鏡頭）壓低，免得擋住視線。 */
export const wallH = (y: number) => (y === RH - 1 ? 0.45 : 2);

export function buildRoomView(room: any, route: Route, kay: Kay | null): RoomView {
  const g: number[][] = room.g, pal = room.biome.pal, m = mats(pal), seed = room.def.seed >>> 0;
  const group = new THREE.Group(), lights: LightSrc[] = [], braziers: Brazier[] = [], doors: THREE.Object3D[] = [];
  const disposables: THREE.InstancedMesh[] = [];
  const add = (o: THREE.Object3D) => { group.add(o); if ((o as any).isInstancedMesh) disposables.push(o as THREE.InstancedMesh); return o; };
  const free = (x: number, y: number) => g[y]?.[x] === 0;
  const useK = route === 'kaykit' && kay;

  // ---- 地板 ----
  if (useK) {
    const sets: Record<string, THREE.Matrix4[]> = { floor_tile_small: [], floor_tile_small_broken_A: [], floor_tile_small_weeds_A: [], floor_dirt_small_A: [] };
    for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
      const r = hsh(seed, x, y), k = r < 0.72 ? 'floor_tile_small' : r < 0.84 ? 'floor_tile_small_broken_A' : r < 0.93 ? 'floor_tile_small_weeds_A' : 'floor_dirt_small_A';
      sets[k].push(mtx(x + 0.5, 0, y + 0.5, 0.5, 0.5, 0.5, Math.floor(hsh(seed, y, x) * 4) * Math.PI / 2));
    }
    for (const k in sets) for (const im of kay.inst(k, sets[k], false, true)) add(im);
  } else {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW - 2, RH - 2).rotateX(-Math.PI / 2), m.floor);
    const uv = fl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (RW - 2) / 2, uv.getY(i) * (RH - 2) / 2);
    fl.position.set(RW / 2, 0, RH / 2); fl.receiveShadow = true; add(fl);
    // 苔斑：沿牆根與障礙物旁
    const ms: THREE.Matrix4[] = [];
    for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) if (free(x, y)) {
      const nearWall = x === 1 || y === 1 || x === RW - 2 || y === RH - 2 || g[y][x - 1] === 2 || g[y][x + 1] === 2 || g[y - 1][x] === 2 || g[y + 1][x] === 2;
      if (hsh(seed, x, y, 4) < (nearWall ? 0.22 : 0.02)) { const s = 0.9 + hsh(seed, x, y, 5) * 1.3; ms.push(mtx(x + 0.5, 0.012, y + 0.5, s, 1, s, hsh(seed, x, y, 6) * 6)); }
    }
    add(inst(G.plane, m.moss, ms, false, true));
  }

  // ---- 牆 ----
  if (useK) {
    const W: THREE.Matrix4[] = [], low: THREE.Matrix4[] = [];
    const seg = (cx: number, cz: number, len: number, ry: number, side: string) => {
      const sx = 0.5 * len / 2, m4 = mtx(cx, 0, cz, sx, side === 's' ? 0.11 : 0.5, 0.5, ry);
      (side === 's' ? low : W).push(m4);
    };
    for (const side of ['n', 's', 'w', 'e']) {
      const horiz = side === 'n' || side === 's', L = horiz ? RW : RH, fixed = side === 'n' ? 0.5 : side === 's' ? RH - 0.5 : side === 'w' ? 0.5 : RW - 0.5;
      const mid = horiz ? 13.5 : 7.5, door = !!room.def.doors[side], ry = horiz ? 0 : Math.PI / 2;
      const put = (c: number, len: number) => horiz ? seg(c, fixed, len, ry, side) : seg(fixed, c, len, ry, side);
      for (let c = 1; c < mid - 1.5; c += 2) put(c, 2);
      for (let c = L - 1; c > mid + 1.5; c -= 2) put(c, 2);
      if (!door) put(mid, 3);
      else {
        const dw = kay.clone('wall_doorway'); const s = 0.75;
        dw.scale.set(s, side === 's' ? 0.2 : s * 0.67, s); dw.rotation.y = ry;
        if (horiz) dw.position.set(mid, 0, fixed); else dw.position.set(fixed, 0, mid);
        const leaf = dw.getObjectByName('wall_doorway_door'); if (leaf) doors.push(leaf);
        add(dw);
      }
    }
    for (const im of kay.inst('wall', W, true, true)) add(im);
    for (const im of kay.inst('wall', low, true, true)) add(im);
    for (const [x, z] of [[0.5, 0.5], [RW - 0.5, 0.5]]) { const p = kay.clone('pillar'); p.position.set(x, 0, z); p.scale.set(0.5, 0.55, 0.5); add(p); }
  } else {
    const body: THREE.Matrix4[] = [], top: THREE.Matrix4[] = [], bars: THREE.Matrix4[] = [];
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (g[y][x] === 1) { const h = wallH(y); body.push(mtx(x + 0.5, h / 2, y + 0.5, 1, h, 1)); top.push(mtx(x + 0.5, h + 0.04, y + 0.5, 1.04, 0.08, 1.04)); }
      if (g[y][x] === 9) {
        const h = wallH(y) * 0.9, vert = x === 0 || x === RW - 1;
        for (let i = 0; i < 3; i++) { const o = (i - 1) * 0.3; bars.push(vert ? mtx(x + 0.5, 0, y + 0.5 + o, 1, h, 1) : mtx(x + 0.5 + o, 0, y + 0.5, 1, h, 1)); }
        top.push(mtx(x + 0.5, wallH(y) + 0.04, y + 0.5, 1.04, 0.08, 1.04));
        body.push(mtx(x + 0.5, wallH(y) - 0.15, y + 0.5, 1, 0.3, 1));
      }
    }
    add(inst(G.box, m.wall, body)); add(inst(G.box, m.wallTop, top));
    const gate = inst(G.bar, m.darkMetal, bars); add(gate); doors.push(gate);
  }

  // ---- 障礙物（柱、桶、箱）與地形 ----
  const obs: [number, number][] = [], puddle: [number, number][] = [], lava: THREE.Matrix4[] = [], spikes: THREE.Matrix4[] = [];
  for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
    const t = g[y][x];
    if (t === 2) obs.push([x, y]);
    else if (t === 6) puddle.push([x, y]);
    else if (t === 4) lava.push(mtx(x + 0.5, 0.02, y + 0.5));
    else if (t === 5) for (let i = 0; i < 4; i++) spikes.push(mtx(x + 0.3 + (i % 2) * 0.4, 0, y + 0.3 + (i >> 1) * 0.4));
  }
  if (useK) {
    const P: THREE.Matrix4[] = [], B: THREE.Matrix4[] = [], X: THREE.Matrix4[] = [];
    for (const [x, y] of obs) { const r = hsh(seed, x, y, 8); (r < 0.6 ? P : r < 0.8 ? B : X).push(r < 0.6 ? mtx(x + 0.5, 0, y + 0.5, 0.6, 0.4, 0.6) : mtx(x + 0.5, 0, y + 0.5, 0.45, 0.45, 0.45, r * 6)); }
    for (const im of [...kay.inst('pillar', P, true, true), ...kay.inst('barrel_large', B, true, true), ...kay.inst('box_small', X, true, true)]) add(im);
  } else {
    const P: THREE.Matrix4[] = [], PB: THREE.Matrix4[] = [];
    for (const [x, y] of obs) { const h = 1.6 + hsh(seed, x, y, 9) * 0.5; P.push(mtx(x + 0.5, h / 2, y + 0.5, 1, h, 1, hsh(seed, x, y) * 3)); PB.push(mtx(x + 0.5, 0.11, y + 0.5)); }
    add(inst(G.pillar, m.stone2, P)); add(inst(G.pillarBase, m.wallTop, PB));
  }
  if (lava.length) add(inst(G.plane, m.lava, lava, false, false));
  if (spikes.length) add(inst(G.spike, m.metal, spikes));

  // ---- 水窪：整間房一張平面，用格子遮罩當透明度 → 邊緣自然呈圓滑水塘 ----
  if (!puddle.length) { // 房間沒有泥沼時放兩攤裝飾水（只有畫面，不影響模擬）
    for (let k = 0; k < 2; k++) { const cx = 4 + Math.floor(hsh(seed, k, 21) * (RW - 8)), cy = 3 + Math.floor(hsh(seed, k, 22) * (RH - 6));
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 2; x <= cx + 1; x++) if (free(x, y) && hsh(seed, x, y, 23) < 0.8) puddle.push([x, y]); }
  }
  if (puddle.length) {
    const S = 4, data = new Uint8Array(RW * S * RH * S * 4);
    for (const [x, y] of puddle) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const o = (((y * S + j) * RW * S) + x * S + i) * 4; data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255; }
    // 模糊 → 圓滑邊
    const w = RW * S, h = RH * S, a = new Float32Array(w * h); for (let i = 0; i < w * h; i++) a[i] = data[i * 4];
    for (let pass = 0; pass < 3; pass++) { const b = a.slice(); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) a[y * w + x] = (b[y * w + x] * 2 + b[y * w + x - 1] + b[y * w + x + 1] + b[(y - 1) * w + x] + b[(y + 1) * w + x]) / 6; }
    for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, (a[i] - 90) * 2.2)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = data[i * 4 + 3] = v; }
    // 共用一張遮罩貼圖與一個材質（換房不產生新材質 → 不會重新編譯著色器）
    if (!PUD.tex) { PUD.tex = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h); PUD.tex.magFilter = THREE.LinearFilter; PUD.tex.minFilter = THREE.LinearFilter; PUD.tex.flipY = false; PUD.mat = m.liquid; PUD.mat.alphaMap = PUD.tex; }
    (PUD.tex.image.data as Uint8Array).set(data); PUD.tex.needsUpdate = true;
    const mat = PUD.mat!;
    // 只蓋住有水的範圍（減少整片透明平面的填充成本）
    let x0 = RW, x1 = 0, y0 = RH, y1 = 0; for (const [x, y] of puddle) { x0 = Math.min(x0, x - 1); x1 = Math.max(x1, x + 2); y0 = Math.min(y0, y - 1); y1 = Math.max(y1, y + 2); }
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateX(-Math.PI / 2); const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / RW, (pos.getZ(i) + (y0 + y1) / 2) / RH);
    const pm = new THREE.Mesh(geo, mat); pm.position.set((x0 + x1) / 2, 0.03, (y0 + y1) / 2); pm.receiveShadow = true; pm.renderOrder = 1; add(pm);
    (group as any).puddleMat = mat;
  }

  // ---- 發光植物（蕈菇叢） ----
  {
    const cand: [number, number][] = [];
    for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) if (free(x, y)) {
      const adj = g[y][x - 1] === 1 || g[y][x + 1] === 1 || g[y - 1][x] === 1 || g[y + 1][x] === 1 || g[y][x - 1] === 2 || g[y][x + 1] === 2 || g[y - 1][x] === 2 || g[y + 1][x] === 2;
      if (adj && g[y + 1][x] !== 9 && g[y - 1][x] !== 9 && g[y][x + 1] !== 9 && g[y][x - 1] !== 9 && y < RH - 2) cand.push([x, y]);
    }
    cand.sort((a, b) => hsh(seed, a[0], a[1], 30) - hsh(seed, b[0], b[1], 30));
    const stems: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
    cand.slice(0, 14).forEach(([x, y], ci) => {
      const n = 2 + Math.floor(hsh(seed, x, y, 31) * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + 0.25 + hsh(seed, x, i, 32) * 0.5, oz = y + 0.25 + hsh(seed, y, i, 33) * 0.5, h = 0.18 + hsh(seed, i, x + y, 34) * 0.38, r = 0.08 + h * 0.35;
        stems.push(mtx(ox, 0, oz, 1, h, 1)); caps.push(mtx(ox, h - 0.01, oz, r, r * 0.6, r));
      }
      if (ci < 4) lights.push({ x: x + 0.5, y: 0.5, z: y + 0.5, col: new THREE.Color(pal.acc), int: 2.2, dist: 3.2, flicker: 0.1, on: () => true, prio: 1 });
    });
    add(inst(G.stem, m.stem, stems, false, true)); add(inst(G.cap, m.glowCap, caps, true, false));
  }

  // ---- 火盆：四角；可點燃／熄滅 ----
  const corners: [number, number][] = [[1, 1], [RW - 2, 1], [1, RH - 2], [RW - 2, RH - 2]];
  const fires: THREE.Matrix4[] = [];
  for (const [cx, cy] of corners) {
    let bx = cx, by = cy; if (!free(bx, by)) continue;
    const x = bx + 0.5, z = by + 0.5, bz = new THREE.Group(); bz.position.set(x, 0, z);
    if (useK) { const c = kay.clone('column'); c.scale.setScalar(0.45); bz.add(c); }
    else for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(G.leg, m.darkMetal); const a = i * 2.09; l.position.set(Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17); l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); l.castShadow = true; bz.add(l); }
    const top = useK ? 0.63 : 0.6;
    const bowl = new THREE.Mesh(G.bowl, m.metal); bowl.position.y = top + 0.11; bowl.castShadow = true; bz.add(bowl);
    const rim = new THREE.Mesh(G.bowlRim, m.metal); rim.position.y = top + 0.22; bz.add(rim);
    const coal = new THREE.Mesh(G.coal, m.ember); coal.position.y = top + 0.16; coal.scale.set(1.2, 0.5, 1.2); bz.add(coal);
    const fire = new THREE.Group(); fire.position.y = top + 0.18;
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(G.flame, m.fire); f.position.set((i - 1) * 0.07, 0, (i % 2) * 0.05); f.scale.setScalar(1 - Math.abs(i - 1) * 0.3); fire.add(f); }
    bz.add(fire);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.6; bz.add(hit);
    add(bz);
    const b: Brazier = { x, z, lit: true, fire, hit, src: null as any };
    b.src = { x, y: top + 0.6, z, col: new THREE.Color('#ff9a4a'), int: 9, dist: 7, flicker: 0.35, on: () => b.lit, prio: 3 };
    (hit as any).brazier = b; lights.push(b.src); braziers.push(b); fires.push(new THREE.Matrix4());
  }

  // ---- 裝飾寶箱（起點房與寶物房以外由模擬的 chest 物件決定） ----
  if (room.def.type === 'start') {
    const spot = [[4, 2], [5, 2], [22, 2]].find(([x, y]) => free(x, y));
    if (spot) group.add(makeChest(useK ? kay : null, spot[0] + 0.5, spot[1] + 0.6, 0.15));
  }

  // ---- 地底暗光與霧片 ----
  const mistMat = MIST ||= new THREE.MeshBasicMaterial({ color: pal.acc, alphaMap: softDisc(0, 0.07), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mists: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const ms = new THREE.Mesh(G.plane, mistMat); ms.scale.set(6, 1, 4); ms.position.set(3 + hsh(seed, i, 40) * (RW - 6), 0.35 + i * 0.05, 2 + hsh(seed, i, 41) * (RH - 4)); ms.renderOrder = 2; group.add(ms); mists.push(ms); }

  let mistT = 0;
  return {
    group, braziers, lights, doors,
    update(t, dt, locked) {
      mistT += dt;
      for (let i = 0; i < mists.length; i++) { const ms = mists[i]; ms.position.x += Math.sin(mistT * 0.1 + i) * dt * 0.3; ms.position.z += Math.cos(mistT * 0.13 + i * 2) * dt * 0.2; }
      for (const b of braziers) {
        b.fire.visible = b.lit;
        if (b.lit) b.fire.children.forEach((f, i) => { const s = 0.85 + Math.sin(t * (9 + i * 3) + i * 7) * 0.12 + Math.sin(t * 23 + i) * 0.05; f.scale.set(s * (1 - Math.abs(i - 1) * 0.3), s * (1.1 - Math.abs(i - 1) * 0.3) + Math.sin(t * 13 + i) * 0.1, s); f.rotation.y = t * (1 + i); });
      }
      const pm = (group as any).puddleMat as THREE.MeshPhysicalMaterial | undefined;
      if (pm?.normalMap) { pm.normalMap.offset.set(t * 0.02, t * 0.013); }
      for (const d of doors) {
        if ((d as any).isInstancedMesh) d.scale.y += ((locked ? 1 : 0.02) - d.scale.y) * Math.min(1, dt * 8);
        else d.visible = locked;
      }
    },
    dispose() { for (const im of disposables) im.dispose(); group.traverse((o: any) => { if (o.isMesh && o.geometry && !Object.values(G).includes(o.geometry) && !o.isInstancedMesh && !o.userData.shared) o.geometry.dispose(); }); },
  };
}

/** 寶箱：程序化（木＋金屬箍）或 KayKit chest。 */
export function makeChest(kay: Kay | null, x: number, z: number, ry = 0) {
  const m = M; const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  if (kay) { const c = kay.clone('chest'); c.scale.setScalar(0.42); grp.add(c); return grp; }
  const body = new THREE.Mesh(G.box, m.wood); body.scale.set(0.7, 0.38, 0.46); body.position.y = 0.19; body.castShadow = body.receiveShadow = true; grp.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.7, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), m.wood); lid.position.y = 0.38; lid.castShadow = true; grp.add(lid);
  for (const ox of [-0.24, 0.24]) { const band = new THREE.Mesh(G.box, m.metal); band.scale.set(0.06, 0.4, 0.48); band.position.set(ox, 0.2, 0); grp.add(band); const b2 = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.025, 4, 10, Math.PI).rotateY(Math.PI / 2), m.metal); b2.position.set(ox, 0.38, 0); grp.add(b2); }
  const lock = new THREE.Mesh(G.box, m.metal); lock.scale.set(0.1, 0.12, 0.04); lock.position.set(0, 0.36, 0.24); grp.add(lock);
  return grp;
}
export { G as GEO };
