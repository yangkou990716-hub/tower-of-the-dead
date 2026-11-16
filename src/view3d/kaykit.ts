// glTF 資產包載入：依 manifest.ts 的清單下載、解析，提供「實例化」與「複製」兩種用法。
// 檔名 kaykit.ts 是歷史原因；內容與素材來源無關，換任何 glTF 素材都走這裡。
import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DIR, modelFiles } from './manifest';

/** 與 vite.config.ts 的 runtimeCaching cacheName 相同。 */
export const MODEL_CACHE = 'tower-models';

export interface Kay {
  /** 同一模型大量擺放（地板、牆）：每個子網格一個 InstancedMesh。 */
  inst(key: string, ms: THREE.Matrix4[], cast: boolean, recv: boolean): THREE.InstancedMesh[];
  /** 靜態模型的複本（共用幾何與材質）。 */
  clone(key: string): THREE.Object3D;
  /** 原始 glTF（角色要用 SkeletonUtils.clone 與動畫）。 */
  gltf(key: string): GLTF;
  has(key: string): boolean;
  bytes: number; ms: number;
}

export async function loadKay(base: string, onProg: (done: number, total: number) => void): Promise<Kay> {
  const t0 = performance.now(), loader = new GLTFLoader(), all = modelFiles();
  const ext = (window as any).__KAY_EXT || '.glb'; // 某些靜態主機不接受 .glb，可改副檔名
  let done = 0, bytes = 0;
  const got: Record<string, GLTF> = {};
  await Promise.all(all.map(async (k) => {
    const url = `${base}${DIR}${k}${ext}`, res = await fetch(url); if (!res.ok) throw new Error(`${k}: HTTP ${res.status}`);
    // 第一次造訪時 Service Worker 還沒接管頁面，這次下載不會經過它的執行期快取 → 自己寫進同一個快取，之後才能離線
    if (typeof caches !== 'undefined') { const copy = res.clone(); caches.open(MODEL_CACHE).then(async (c) => { if (!(await c.match(url))) await c.put(url, copy); }).catch(() => {}); }
    const buf = await res.arrayBuffer(); bytes += buf.byteLength;
    got[k] = await loader.parseAsync(buf, `${base}${DIR}`);
    onProg(++done, all.length);
  }));
  for (const k of all) {
    const anim = got[k].animations.length > 0;
    got[k].scene.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; if (anim) o.frustumCulled = false; else o.userData.shared = true; });
  }
  const get = (k: string) => { const g = got[k]; if (!g) throw new Error('清單外的模型：' + k); return g; };
  return {
    bytes, ms: performance.now() - t0,
    gltf: get, has: (k) => !!got[k],
    inst(key, ms, cast, recv) {
      if (!ms.length) return [];
      const sc = get(key).scene; sc.updateMatrixWorld(true); const out: THREE.InstancedMesh[] = [];
      sc.traverse((o: any) => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, ms.length), tmp = new THREE.Matrix4();
        ms.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
        im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = recv; im.computeBoundingSphere(); out.push(im);
      });
      return out;
    },
    clone(key) { return get(key).scene.clone(true); },
  };
}
