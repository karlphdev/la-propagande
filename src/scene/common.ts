import * as THREE from 'three';
import { ZONE_LEN, groundHeight, rng, surfaceHeight, trenchDepth, trenchX, zoneStart } from './zones';

export const dummy = new THREE.Object3D();

/** Variation de teinte par instance : terre, humidité, usure ; rien n'est neuf ici. */
const tint = new THREE.Color();
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], vary = 0.35) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  const r = rng(matrices.length);
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    const v = 1 - r() * vary;
    mesh.setColorAt(i, tint.setRGB(v, v * (0.94 + r() * 0.06), v * (0.88 + r() * 0.1)));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Sol d'une zone : une bande qui suit le chemin, avec des colonnes serrées sur les parois
 * de la tranchée et lâches au loin. Les zones voisines partagent leur rangée de bord.
 */
export function ground(zone: number, mat: THREE.Material) {
  const near = [0, 0.45, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.45, 1.7, 2.0, 2.4, 2.9, 3.6, 4.5];
  const cols = [...near];
  for (let d = 5.2; d <= 26; d += 0.7) cols.push(d);
  const across = [...cols.slice(1).reverse().map((d) => -d), ...cols];
  // Pas fin là où la tranchée est creusée, plus lâche ailleurs.
  const z0 = zoneStart(zone), z1 = z0 - ZONE_LEN;
  const zs: number[] = [];
  for (let z = z0; z > z1; z -= trenchDepth(z) > 0 || trenchDepth(z - 0.6) > 0 ? 0.3 : 0.6) zs.push(z);
  zs.push(z1);
  const rows = zs.length;
  const pos = new Float32Array(rows * across.length * 3);
  const uv = new Float32Array(rows * across.length * 2);
  let k = 0;
  for (const z of zs) {
    const xc = trenchX(z);
    const D = trenchDepth(z);
    for (const d of across) {
      const x = xc + d;
      const h = groundHeight(x, z);
      pos.set([x, h, z], k * 3);
      // Sur les parois, la hauteur parcourue s'ajoute à la distance : la texture ne s'étire pas.
      const drop = THREE.MathUtils.clamp(surfaceHeight(x, z) - h, 0, D);
      uv.set([x + Math.sign(d) * (D - drop), z], k * 2);
      k++;
    }
  }
  const index: number[] = [];
  const n = across.length;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const a = r * n + c, b = a + 1, cc = a + n, dd = cc + 1;
      index.push(a, b, cc, b, dd, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = mesh.castShadow = true;
  return mesh;
}

