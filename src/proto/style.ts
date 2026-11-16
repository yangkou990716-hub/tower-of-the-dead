// 美術風格：只換材質與後處理，渲染器、光源、畫質分級沿用 main.ts。
//  toon：手繪質感 3D（MeshToonNodeMaterial 三段色階＋世界座標筆觸雜訊＋反向外殼描邊＋紙紋）
//  hd2d：3D 場景保留 PBR，角色即時烘焙成像素 sprite（1px 描邊），加景深與強泛光
// 參考：three.js 官方（MIT）ToonOutlinePassNode、DepthOfFieldNode、webgpu_postprocessing_pixel 範例。
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, vec4, float, max, mix, color, positionWorld, mx_noise_float, smoothstep, screenUV, screenSize, fract, sin, dot, length, luminance, uniform } from 'three/tsl';

export type Style = 'toon' | 'hd2d';
export const STYLE_NAME: Record<Style, string> = { toon: '手繪 3D', hd2d: 'HD-2D' };

// ---------- 手繪材質 ----------
const gradient = (() => {
  const d = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]); // 三段：暗部不死黑
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
function brush(base: any) {
  const p = positionWorld;
  const n1 = mx_noise_float(p.mul(vec3(1.6, 3.2, 0.7))), n2 = mx_noise_float(p.mul(vec3(7.0, 2.0, 7.0)));
  const k = float(1).add(n1.mul(0.08)).add(n2.mul(0.045));             // 拉長的雜訊＝筆刷方向
  const ao = mix(float(0.82), float(1.06), smoothstep(0.0, 1.4, p.y));  // 手繪的「底暗頂亮」
  const cool = mix(vec3(0.92, 0.97, 1.08), vec3(1.0), smoothstep(0.0, 0.8, p.y)); // 低處偏冷色
  return base.mul(k).mul(ao).mul(cool);
}
const toonCache = new Map<THREE.Material, THREE.Material>();
function toonOf(m: any): THREE.Material | null {
  if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) || m.transparent) return null; // 透明（水、苔蘚貼片）保留原材質
  let t = toonCache.get(m); if (t) return t;
  const map = m.map as THREE.Texture | null;
  const base: any = map ? texture(map, uv()).rgb.mul(color(m.color)) : color(m.color);
  const tm = new THREE.MeshToonNodeMaterial({ gradientMap: gradient, side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors });
  tm.colorNode = brush(base);
  if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) tm.emissiveNode = color(m.emissive).mul(m.emissiveIntensity ?? 1);
  toonCache.set(m, tm); return tm;
}
/** 把物件底下的材質換成指定風格（已換過的跳過，每幀呼叫也便宜） */
export function styleTree(root: THREE.Object3D, s: Style) {
  root.traverse((o: any) => {
    if (!o.isMesh || o.userData.st === s) return;
    if (!o.userData.orig) o.userData.orig = o.material;
    const t = s === 'toon' && !Array.isArray(o.userData.orig) ? toonOf(o.userData.orig) : null;
    o.material = t || o.userData.orig; o.userData.st = s;
  });
}

// ---------- 後處理 ----------
const hash2 = (p: any) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
const vig = (c: any, k: number) => c.mul(float(1).sub(smoothstep(0.35, 0.95, length(screenUV.sub(0.5))).mul(k)));
export function toonGrade(c: any) {
  const px = screenUV.mul(screenSize);
  let o: any = vec3(c.rgb).add(hash2(px.div(2).floor()).sub(0.5).mul(0.025)).add(hash2(px.div(9).floor()).sub(0.5).mul(0.02)); // 紙紋
  o = mix(vec3(luminance(o)), o, 1.12).mul(vec3(1.03, 1.0, 0.96));
  return vec4(vig(o, 0.25), 1);
}
export function hd2dGrade(c: any) {
  let o: any = vec3(c.rgb); o = mix(vec3(luminance(o)), o, 1.15).mul(vec3(1.04, 1.0, 0.95));
  return vec4(vig(o, 0.4), 1);
}
export const focus = uniform(17);

// ---------- HD-2D：角色即時烘焙成像素 sprite ----------
const sScene = new THREE.Scene();
sScene.add(new THREE.HemisphereLight('#ffffff', '#c8b8a0', 2.3));
{ const d = new THREE.DirectionalLight('#fff4e0', 2.6); d.position.set(-2, 4, 5); sScene.add(d); }
const sCam = new THREE.OrthographicCamera(-1, 1, 1.6, -0.4, 0.1, 40);
interface Spr { rt: THREE.RenderTarget; mesh: THREE.Mesh; seen: number; }
const sprites = new Map<THREE.Object3D, Spr>();
let frameNo = 0, res = 80;
export function setSpriteRes(r: number) { res = r; }

function mkSprite(scene: THREE.Scene): Spr {
  const rt = new THREE.RenderTarget(res, res, { depthBuffer: true });
  rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter; rt.texture.generateMipmaps = false;
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const tx = texture(rt.texture, uv()), px = 1 / res;
  const nb = max(max(texture(rt.texture, uv().add(vec2(px, 0))).a, texture(rt.texture, uv().sub(vec2(px, 0))).a), max(texture(rt.texture, uv().add(vec2(0, px))).a, texture(rt.texture, uv().sub(vec2(0, px))).a));
  m.colorNode = vec4(tx.rgb.mul(tx.a).add(color('#2a1b30').mul(float(1).sub(tx.a))), max(tx.a, nb)); // 1px 深色外框
  m.alphaTest = 0.5; m.emissiveNode = tx.rgb.mul(0.3).mul(tx.a);
  const g = new THREE.PlaneGeometry(2, 2); g.translate(0, 0.6, 0);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; scene.add(mesh);
  return { rt, mesh, seen: 0 };
}
const fwd = new THREE.Vector3();
/** chars：角色群組（第一個子物件是模型）。烘焙後把模型隱藏，主畫面只看到 sprite。回傳要還原的模型。 */
export function bakeSprites(r: THREE.WebGPURenderer, scene: THREE.Scene, cam: THREE.Camera, chars: THREE.Object3D[]) {
  frameNo++;
  const hidden: THREE.Object3D[] = [], prev = r.getRenderTarget();
  cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  for (const g of chars) {
    const model = g.children[0]; if (!model) continue;
    let s = sprites.get(g); if (!s) { s = mkSprite(scene); sprites.set(g, s); }
    if (s.rt.width !== res) s.rt.setSize(res, res);
    s.seen = frameNo;
    const k = model.scale.x / 0.48;
    const par = model.parent!, pos = model.position.clone(), rot = g.rotation.y;
    sScene.add(model); model.position.set(0, 0, 0); model.rotation.y = rot; model.updateMatrixWorld(true);
    sCam.left = -k; sCam.right = k; sCam.top = 1.6 * k; sCam.bottom = -0.4 * k; sCam.updateProjectionMatrix();
    sCam.position.copy(fwd).multiplyScalar(-12).setY(12 * Math.tan(0.38)); sCam.lookAt(0, 0.6 * k, 0);
    r.setRenderTarget(s.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sScene, sCam);
    par.add(model); model.position.copy(pos); model.rotation.y = 0; model.visible = false; hidden.push(model);
    s.mesh.visible = true; s.mesh.position.set(g.position.x, g.position.y, g.position.z); s.mesh.scale.setScalar(k * 1.25); s.mesh.quaternion.copy(cam.quaternion);
  }
  for (const [g, s] of sprites) if (s.seen !== frameNo) { s.mesh.visible = false; if (frameNo - s.seen > 300) { scene.remove(s.mesh); s.rt.dispose(); sprites.delete(g); } }
  r.setRenderTarget(prev);
  return hidden;
}
export function hideSprites() { for (const s of sprites.values()) s.mesh.visible = false; }
