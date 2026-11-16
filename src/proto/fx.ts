// 粒子：CPU 模擬 + 單一 InstancedMesh（1 個 draw call）。顏色可超過 1 → 進 Bloom。
import * as THREE from 'three/webgpu';
import { T } from '../sim/util';

const MAX = 1500;
export class Fx {
  mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX * 3); private pv = new Float32Array(MAX * 3); private life = new Float32Array(MAX); private ml = new Float32Array(MAX);
  private sz = new Float32Array(MAX); private grav = new Float32Array(MAX); private drag = new Float32Array(MAX); private col = new Float32Array(MAX * 3);
  private n = 0; private m = new THREE.Matrix4(); private c = new THREE.Color();
  scale = 1; // 畫質比例
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.setColorAt(0, this.c.set(0xffffff));
  }
  get alive() { return this.n; }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.ColorRepresentation, k = 1, grav = 0, drag = 1) {
    if (this.n >= MAX * Math.min(1, this.scale + 0.05)) return;
    const i = this.n++; this.c.set(color).multiplyScalar(k);
    this.px[i * 3] = x; this.px[i * 3 + 1] = y; this.px[i * 3 + 2] = z; this.pv[i * 3] = vx; this.pv[i * 3 + 1] = vy; this.pv[i * 3 + 2] = vz;
    this.life[i] = this.ml[i] = life; this.sz[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
  }
  /** 隨機機率依畫質縮放：rate 為「高」畫質下每秒顆數。 */
  rate(r: number, dt: number) { const v = r * this.scale * dt; return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0); }
  burst(x: number, y: number, z: number, n: number, color: THREE.ColorRepresentation, sp = 3, life = 0.5, size = 0.05, k = 3, grav = -6) {
    const c = Math.max(1, Math.round(n * this.scale));
    for (let i = 0; i < c; i++) { const a = Math.random() * 6.283, u = Math.random() * 2 - 1, s = sp * (0.4 + Math.random() * 0.6), r = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s * 0.8 + 0.5, Math.sin(a) * r * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, k, grav, 2.5); }
  }
  /** 把模擬事件轉成特效。 */
  onEvents(evs: any[]) {
    for (const e of evs) {
      const x = (e.x ?? 0) / T, z = (e.y ?? 0) / T;
      switch (e.k) {
        case 'hitfx': this.burst(x, 0.5, z, 18, e.col || '#ffe0a0', 4.5, 0.35, 0.045, 5); break;
        case 'die': this.burst(x, 0.4, z, e.boss ? 120 : 40, e.c2 || '#e6ffb8', 3.5, 0.9, 0.06, 3, -3); break;
        case 'parry': this.burst(x, 0.7, z, 50, '#bfe8ff', 6, 0.4, 0.05, 6); break;
        case 'phit': this.burst(x, 0.6, z, 20, '#ff5040', 3.5, 0.4, 0.05, 4); break;
        case 'boom': this.burst(x, 0.2, z, 40, e.col || '#ffb86b', ((e.r || 60) / T) * 3, 0.5, 0.06, 3, -2); break;
        case 'dodge': case 'pdodge': this.burst(x, 0.1, z, 14, '#c9d6e0', 1.5, 0.45, 0.04, 0.6, 1); break;
        case 'gold': this.burst(x, 0.5, z, 10, '#ffd36b', 2, 0.4, 0.035, 4); break;
        case 'healfx': this.burst(x, 0.4, z, 24, '#8fffb0', 1.6, 0.9, 0.04, 3, 2.5); break;
      }
    }
  }
  update(dt: number) {
    let j = 0; const m = this.m, im = this.mesh;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt; if (this.life[i] <= 0) continue;
      if (j !== i) { for (let k = 0; k < 3; k++) { this.px[j * 3 + k] = this.px[i * 3 + k]; this.pv[j * 3 + k] = this.pv[i * 3 + k]; this.col[j * 3 + k] = this.col[i * 3 + k]; }
        this.life[j] = this.life[i]; this.ml[j] = this.ml[i]; this.sz[j] = this.sz[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i]; }
      const d = Math.exp(-this.drag[j] * dt);
      this.pv[j * 3] *= d; this.pv[j * 3 + 2] *= d; this.pv[j * 3 + 1] = this.pv[j * 3 + 1] * d + this.grav[j] * dt;
      this.px[j * 3] += this.pv[j * 3] * dt; this.px[j * 3 + 1] = Math.max(0.02, this.px[j * 3 + 1] + this.pv[j * 3 + 1] * dt); this.px[j * 3 + 2] += this.pv[j * 3 + 2] * dt;
      const k = this.life[j] / this.ml[j], s = this.sz[j] * Math.min(1, k * 3);
      m.makeScale(s, s, s).setPosition(this.px[j * 3], this.px[j * 3 + 1], this.px[j * 3 + 2]); im.setMatrixAt(j, m);
      const f = Math.min(1, k * 2); this.c.setRGB(this.col[j * 3] * f, this.col[j * 3 + 1] * f, this.col[j * 3 + 2] * f); im.setColorAt(j, this.c);
      j++;
    }
    this.n = j; im.count = j; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
}
