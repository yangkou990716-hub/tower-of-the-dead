// 角色：Quaternius（CC0）模型＋自訂材質（邊緣光、受擊閃白、暗部偏紫）＋由模擬狀態驅動的動畫。
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { color, uniform, mix, float, uv, smoothstep, length } from 'three/tsl';
import { rim } from './env';
import { T } from '../sim/util';

const MATS = new Map<string, THREE.Material>(), WHITE = new THREE.Color(1, 1, 1);
const SRC: Record<string, { scene: THREE.Group; anims: Record<string, THREE.AnimationClip> }> = {};
export async function loadChars(base: string, onP: (f: number) => void) {
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const names = ['rogue', 'mushroom_king', 'mushroom_imp']; let n = 0;
  await Promise.all(names.map(async (k) => {
    const g = await L.loadAsync(`${base}showcase/models/${k}${(window as any).__MODEL_EXT || '.glb'}`);
    const anims: Record<string, THREE.AnimationClip> = {};
    for (const c of g.animations) { const nm = c.name.replace(/^CharacterArmature\|/, ''); if (!anims[nm]) anims[nm] = c; }
    SRC[k] = { scene: g.scene, anims }; onP(++n / names.length);
  }));
}

const LOOK: Record<string, { m: string; h: number; rim: string; rimK: number; lift: number }> = {
  player: { m: 'rogue', h: 1.25, rim: '#ffe2b0', rimK: 0.55, lift: 0.08 },
  matriarch: { m: 'mushroom_king', h: 2.6, rim: '#ff9ad8', rimK: 0.6, lift: 0.3 },
  slime: { m: 'mushroom_imp', h: 0.7, rim: '#bff8ff', rimK: 0.6, lift: 0.2 },
};

export class Actor {
  root = new THREE.Group(); model: THREE.Object3D; mixer: THREE.AnimationMixer; cur: THREE.AnimationAction | null = null; curName = '';
  flash = { value: 0 }; tint = { value: new THREE.Color(1, 1, 1) }; dead = 0; lantern: THREE.Object3D | null = null; clips: Record<string, THREE.AnimationClip>;
  lock = 0; scale = 1; prevState = ''; prevT = 0;
  constructor(public kind: string) {
    const L = LOOK[kind] || LOOK.slime, src = SRC[L.m];
    this.model = skClone(src.scene); this.clips = src.anims;
    // 模型是量化壓縮＋骨架縮放 100 倍，包圍盒不可靠 → 用骨骼的世界座標量身高
    src.scene.updateMatrixWorld(true); const bb = new THREE.Box3(), v = new THREE.Vector3();
    src.scene.traverse((o: any) => { if (o.isBone) bb.expandByPoint(o.getWorldPosition(v)); });
    const hh = Math.max(0.01, bb.max.y - bb.min.y);
    this.scale = L.h / hh; this.model.scale.setScalar(this.scale);
    // 同一種角色共用材質（不會每生一隻怪就重新編譯著色器）；閃白與泛紅用逐物件 uniform
    this.model.traverse((o: any) => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.act = this;
      const old = o.material as any, key = kind + '|' + old.uuid; let m = MATS.get(key);
      if (!m) {
        const nm = new THREE.MeshStandardNodeMaterial({ roughness: Math.min(0.75, old.roughness ?? 0.6), metalness: Math.min(0.3, old.metalness ?? 0), map: old.map || null, side: old.side });
        const base: any = color(old.color ?? new THREE.Color(1, 1, 1));
        const fl = uniform(0).onObjectUpdate(({ object }: any) => object.userData.act?.flash.value ?? 0);
        const ti = uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }: any) => object.userData.act?.tint.value ?? WHITE);
        nm.colorNode = base.mul(ti);
        nm.emissiveNode = rim(L.rim, L.rimK).add(base.mul(L.lift)).add(color('#ffffff').mul(fl).mul(1.6));
        m = nm; MATS.set(key, m);
      }
      o.material = m;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.root.add(this.model);
    // 貼地柔影（陰影關掉時也有接地感）
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    bm.colorNode = color('#2a1f3a'); bm.opacityNode = float(1).sub(smoothstep(0.2, 1.0, length(uv().sub(0.5)).mul(2))).mul(0.5);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(L.h * 0.32, 20).rotateX(-Math.PI / 2), bm); blob.position.y = 0.04; this.root.add(blob);
    if (kind === 'player') this.addLantern();
  }
  private addLantern() {
    let hand: THREE.Object3D | null = null;
    this.model.traverse((o) => { if (!hand && /(hand|fist|wrist).*(l\b|left|\.l|_l)/i.test(o.name)) hand = o; });
    const lan = new THREE.Group();
    const frame = new THREE.MeshStandardNodeMaterial({ color: '#7a5631', roughness: 0.4, metalness: 0.8 });
    const glass = new THREE.MeshBasicNodeMaterial(); glass.colorNode = color('#ffcf7a').mul(3.2);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 6, 1, true), frame); cage.material.side = THREE.DoubleSide;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glass);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 6), frame); top.position.y = 0.14;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 10), frame); ring.position.y = 0.2;
    lan.add(cage, core, top, ring);
    if (hand) { const hb = hand as THREE.Object3D; this.model.updateMatrixWorld(true); const ws = hb.getWorldScale(new THREE.Vector3()).x || 1; hb.add(lan); lan.scale.setScalar(1 / ws); lan.position.set(0, -0.22 / ws, 0); }
    else { lan.position.set(-0.35, 0.75, 0.1); this.root.add(lan); }
    this.lantern = core;
  }
  play(name: string, o: { once?: boolean; fade?: number; ts?: number; restart?: boolean; at?: number; hold?: boolean } = {}) {
    const clip = this.clips[name]; if (!clip) return false;
    if (this.curName === name && !o.restart && !(o.once && !o.hold && this.cur && !this.cur.isRunning())) { if (this.cur && o.ts !== undefined) this.cur.timeScale = o.ts; return true; }
    const a = this.mixer.clipAction(clip);
    a.reset(); a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!o.once;
    a.timeScale = o.ts ?? 1; if (o.at) a.time = o.at * clip.duration;
    a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, o.fade ?? 0.12, false);
    a.play(); this.cur = a; this.curName = name; return true;
  }
  dur(n: string) { return this.clips[n]?.duration || 1; }
  set(x: number, y: number, a: number) { this.root.position.set(x / T, 0, y / T); this.model.rotation.y = Math.PI / 2 - a; }
}
export { mix };
