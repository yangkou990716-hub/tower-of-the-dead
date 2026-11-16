// KayKit CC0 模型載入（Dungeon Remastered、Character Pack Adventures）。
import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export const KAY_PIECES = ['floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_dirt_small_A', 'wall', 'wall_doorway',
  'pillar', 'column', 'barrel_large', 'box_small', 'chest'];

export interface Kay {
  inst(key: string, ms: THREE.Matrix4[], cast: boolean, recv: boolean): THREE.InstancedMesh[];
  clone(key: string): THREE.Object3D;
  knight: GLTF;
  bytes: number; ms: number;
}

export async function loadKay(base: string, onProg: (done: number, total: number) => void): Promise<Kay> {
  const t0 = performance.now(), loader = new GLTFLoader(), all = [...KAY_PIECES, 'Knight'];
  let done = 0, bytes = 0;
  const got: Record<string, GLTF> = {};
  await Promise.all(all.map(async (k) => {
    const buf = await (await fetch(`${base}models/kaykit/${k}.glb`)).arrayBuffer(); bytes += buf.byteLength;
    got[k] = await loader.parseAsync(buf, `${base}models/kaykit/`);
    onProg(++done, all.length);
  }));
  for (const k of KAY_PIECES) got[k].scene.traverse((o: any) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.shared = true; } });
  got.Knight.scene.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return {
    knight: got.Knight, bytes, ms: performance.now() - t0,
    inst(key, ms, cast, recv) {
      if (!ms.length) return [];
      const sc = got[key].scene; sc.updateMatrixWorld(true); const out: THREE.InstancedMesh[] = [];
      sc.traverse((o: any) => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, ms.length), tmp = new THREE.Matrix4();
        ms.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
        im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = recv; im.computeBoundingSphere(); out.push(im);
      });
      return out;
    },
    clone(key) { return got[key].scene.clone(true); },
  };
}
