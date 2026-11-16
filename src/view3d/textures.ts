// 程序化貼圖：全部用 canvas 即時產生，不需要圖檔。
import * as THREE from 'three/webgpu';

const rand = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

function canvas(n: number) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, srgb: boolean, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
/** 高度圖 → 法線貼圖（Sobel）。 */
function normalFrom(h: Float32Array, n: number, k: number) {
  const [c, g] = canvas(n), im = g.createImageData(n, n), at = (x: number, y: number) => h[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    im.data[i] = (-dx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return tex(c, false);
}
/** 平滑雜訊（數層 value noise 疊加，可無縫平鋪）。 */
function noise(n: number, seed: number, oct = 4) {
  const r = rand(seed), out = new Float32Array(n * n);
  for (let o = 0; o < oct; o++) {
    const g = 4 << o, grid = new Float32Array(g * g).map(() => r()), amp = 1 / (1 << o);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const s = (a: number, b: number) => grid[(b % g) * g + (a % g)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      out[y * n + x] += amp * ((s(x0, y0) * (1 - sx) + s(x0 + 1, y0) * sx) * (1 - sy) + (s(x0, y0 + 1) * (1 - sx) + s(x0 + 1, y0 + 1) * sx) * sy);
    }
  }
  return out;
}

export interface StoneSet { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture; }
/** 石板：每張貼圖 = 2×2 塊石板，帶縫隙、裂痕與苔斑。 */
export function stoneTex(base: string, grout: string, moss: string, seed = 1, slabs = 2): StoneSet {
  const n = 256, nz = noise(n, seed, 5), h = new Float32Array(n * n), r = rand(seed + 9);
  const [c, g] = canvas(n), im = g.createImageData(n, n);
  const b = new THREE.Color(base), gr = new THREE.Color(grout), ms = new THREE.Color(moss), tint: number[] = [];
  for (let i = 0; i < slabs * slabs; i++) tint.push(0.82 + r() * 0.3);
  const mz = noise(n, seed + 3, 4);
  const [rc, rg] = canvas(n), rim = rg.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cs = n / slabs, lx = x % cs, ly = y % cs, e = Math.min(lx, ly, cs - 1 - lx, cs - 1 - ly);
    const edge = Math.min(1, e / 5), k = nz[y * n + x], slab = Math.floor(y / cs) * slabs + Math.floor(x / cs);
    h[y * n + x] = edge * (0.75 + k * 0.25);
    const mossK = Math.max(0, Math.min(1, (mz[y * n + x] - 0.95) * 4)) * (1 - edge * 0.5);
    const col = b.clone().multiplyScalar(tint[slab] * (0.8 + k * 0.35)).lerp(gr, 1 - edge).lerp(ms, mossK * 0.85);
    const i = (y * n + x) * 4;
    im.data[i] = col.r * 255; im.data[i + 1] = col.g * 255; im.data[i + 2] = col.b * 255; im.data[i + 3] = 255;
    const ro = (0.75 + k * 0.2 + (1 - edge) * 0.05 - mossK * 0.1) * 255;
    rim.data[i] = rim.data[i + 1] = rim.data[i + 2] = ro; rim.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); rg.putImageData(rim, 0, 0);
  return { map: tex(c, true), normal: normalFrom(h, n, 3), rough: tex(rc, false) };
}
/** 苔蘚：柔軟的綠色雜訊，帶透明邊。 */
export function mossTex(col: string, seed = 5) {
  const n = 128, nz = noise(n, seed, 4), [c, g] = canvas(n), im = g.createImageData(n, n), cc = new THREE.Color(col);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = nz[y * n + x], i = (y * n + x) * 4, d = Math.hypot(x / n - 0.5, y / n - 0.5) * 2;
    const a = Math.max(0, Math.min(1, (k * 1.3 - d * 0.9) * 2.2));
    im.data[i] = cc.r * 255 * (0.7 + k * 0.5); im.data[i + 1] = cc.g * 255 * (0.7 + k * 0.5); im.data[i + 2] = cc.b * 255 * (0.7 + k * 0.4); im.data[i + 3] = a * 255;
  }
  g.putImageData(im, 0, 0); return tex(c, true, false);
}
/** 液面用的流動法線。 */
export function rippleNormal(seed = 7) { const n = 128; return normalFrom(noise(n, seed, 3), n, 1.2); }
/** 柔邊圓形（霧片、假影、光暈）。 */
export function softDisc(inner = 0, alpha = 1) {
  const n = 64, [c, g] = canvas(n), gr = g.createRadialGradient(n / 2, n / 2, n * inner / 2, n / 2, n / 2, n / 2);
  // alphaMap 讀的是綠色通道 → 畫成不透明的灰階
  const v = Math.round(alpha * 255); gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n); g.fillStyle = gr; g.fillRect(0, 0, n, n); return tex(c, false, false);
}
/** 金屬：細刮痕。 */
export function metalTex(seed = 11) {
  const n = 128, nz = noise(n, seed, 3), [c, g] = canvas(n), im = g.createImageData(n, n), r = rand(seed);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = (y * n + x) * 4, v = (0.35 + nz[y * n + x] * 0.3) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); g.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 40; i++) { g.beginPath(); const x = r() * n, y = r() * n, a = r() * 6.28, l = 5 + r() * 25; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  return tex(c, false);
}
