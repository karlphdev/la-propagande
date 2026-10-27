import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { pbr, model } from './assets';
import { TRENCH, ZONE_LEN, groundHeight, surfaceHeight, trenchDepth, trenchSlope, trenchX, rng } from './zones';
import { SECTION_COUNT } from '../scroll';

const Z0 = -TRENCH.zone * ZONE_LEN;
/** Partie creusée de la zone, rampes exclues : là où vivent étais, caillebotis et sacs. */
const DUG_START = Z0 - TRENCH.ramp * 0.6;
const DUG_END = Z0 - ZONE_LEN + TRENCH.ramp * 0.6;

const dummy = new THREE.Object3D();
const qTilt = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

/** Oriente `dummy` le long de la tranchée à z, puis l'incline autour de son axe long. */
function alongTrench(x: number, y: number, z: number, tilt = 0, yaw = 0) {
  dummy.position.set(x, y, z);
  dummy.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-1, trenchSlope(z)) + yaw);
  dummy.quaternion.multiply(qTilt.setFromAxisAngle(X, tilt));
  dummy.updateMatrix();
  return dummy.matrix;
}

/** Variation de teinte par instance : terre, humidité, usure ; rien n'est neuf ici. */
const tint = new THREE.Color();
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], vary = 0.35) {
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
 * Sol de tout le parcours : une bande qui suit le tracé de la tranchée,
 * avec des colonnes serrées sur les parois et lâches au loin.
 */
function ground(mat: THREE.Material) {
  const near = [0, 0.45, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.45, 1.7, 2.0, 2.4, 2.9, 3.6, 4.5];
  const cols = [...near];
  for (let d = 5.2; d <= 26; d += 0.7) cols.push(d);
  const across = [...cols.slice(1).reverse().map((d) => -d), ...cols];
  // Pas fin là où la tranchée est creusée, plus lâche ailleurs.
  const zs: number[] = [];
  for (let z = 0; z > -ZONE_LEN * SECTION_COUNT; z -= trenchDepth(z) > 0 || trenchDepth(z - 0.6) > 0 ? 0.3 : 0.6) zs.push(z);
  zs.push(-ZONE_LEN * SECTION_COUNT);
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

/** Bande de boue mouillée au fond de la tranchée : elle reflète la fusée éclairante. */
function floorMud(mat: THREE.Material) {
  const pts: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const half = TRENCH.floorHalf + 0.05;
  let row = 0;
  for (let z = Z0; z >= Z0 - ZONE_LEN; z -= 0.3, row++) {
    const xc = trenchX(z);
    for (const s of [-1, 0, 1]) {
      const x = xc + s * half;
      pts.push(x, groundHeight(xc + s * (half - 0.15), z) + 0.015, z);
      uv.push(x, z);
    }
    if (row > 0) {
      const a = (row - 1) * 3;
      index.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export async function buildTrench(scene: THREE.Scene) {
  const rand = rng(1917);
  const soil = pbr('brown_mud_rocks_01', 2.6, { color: '#5d4f43', normalScale: new THREE.Vector2(0.55, 0.55) });
  const mud = pbr('brown_mud_02', 2.2, { roughness: 0.72, color: '#3f3932', normalScale: new THREE.Vector2(0.5, 0.5) });
  const wood = pbr('weathered_planks', 1.6, { color: '#5f574d' });
  const hessian = pbr('hessian_230', 0.6, { color: '#5a4e41' });

  scene.add(ground(soil), floorMud(mud));

  const { floorHalf, topHalf, depth } = TRENCH;
  const wallTilt = Math.atan((topHalf - floorHalf) / depth);

  // Caillebotis : lattes en travers du fond, certaines manquantes ou enfoncées dans la boue.
  const slats: THREE.Matrix4[] = [];
  for (let z = DUG_START; z > DUG_END; z -= 0.21) {
    if (rand() < 0.14) continue;
    const xc = trenchX(z);
    slats.push(alongTrench(xc, groundHeight(xc, z) + 0.045 - rand() * 0.06, z, (rand() - 0.5) * 0.12, Math.PI / 2 + (rand() - 0.5) * 0.12).clone());
  }
  scene.add(instanced(new THREE.BoxGeometry(1.5, 0.035, 0.13), wood, slats));

  // Étayage : poteaux et planches plaqués contre les deux parois.
  const posts: THREE.Matrix4[] = [];
  const planks: THREE.Matrix4[] = [];
  for (let z = DUG_START; z > DUG_END; z -= 1.7) {
    for (const side of [-1, 1]) {
      const xc = trenchX(z);
      const base = groundHeight(xc, z);
      if (rand() > 0.12) {
        const lean = -side * wallTilt + (rand() - 0.5) * 0.08;
        posts.push(alongTrench(xc + side * (floorHalf + (topHalf - floorHalf) * 0.5 - 0.06), base + depth * 0.5 + 0.1, z, lean).clone());
      }
      // Planches surtout en bas de paroi, beaucoup arrachées ou affaissées.
      const rowsHere = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < rowsHere; k++) {
        if (rand() < 0.3) continue;
        const f = (k * 0.27 + 0.12) / depth;
        if (f > 0.98) break;
        const zz = z - 0.85 + (rand() - 0.5) * 0.06;
        const xx = trenchX(zz) + side * (floorHalf + (topHalf - floorHalf) * f - 0.03);
        alongTrench(xx, groundHeight(trenchX(zz), zz) + f * depth - rand() * 0.06, zz, -side * wallTilt + (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);
        dummy.rotateZ((rand() - 0.5) * 0.12);
        dummy.scale.set(0.55 + rand() * 0.45, 1, 1);
        dummy.updateMatrix();
        planks.push(dummy.matrix.clone());
        dummy.scale.set(1, 1, 1);
      }
    }
  }
  scene.add(instanced(new THREE.BoxGeometry(0.13, depth + 0.5, 0.13), wood, posts));
  scene.add(instanced(new THREE.BoxGeometry(1.72, 0.24, 0.035), wood, planks));

  // Sacs de sable : parapet côté ennemi (3 rangs), parados à l'arrière (2 rangs).
  const bags: THREE.Matrix4[] = [];
  for (const [side, layers] of [[1, 3], [-1, 2]] as const) {
    for (let layer = 0; layer < layers; layer++) {
      for (let z = DUG_START - (layer % 2) * 0.31; z > DUG_END; z -= 0.62) {
        if (rand() < 0.06) continue;
        const x = trenchX(z) + side * (topHalf + 0.28 + layer * 0.05);
        const y = groundHeight(x, z) + 0.09 + layer * 0.19;
        alongTrench(x, y, z, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.25);
        dummy.scale.set(1 + (rand() - 0.5) * 0.2, 0.8 + rand() * 0.35, 1 + (rand() - 0.5) * 0.2);
        dummy.updateMatrix();
        bags.push(dummy.matrix.clone());
        dummy.scale.set(1, 1, 1);
      }
    }
  }
  // Quelques sacs éventrés tombés au fond.
  for (let i = 0; i < 9; i++) {
    const z = DUG_START - rand() * (DUG_START - DUG_END);
    const x = trenchX(z) + (rand() - 0.5) * 1.3;
    alongTrench(x, groundHeight(x, z) + 0.02, z, (rand() - 0.5) * 0.3, rand() * Math.PI);
    dummy.scale.set(1.1, 0.55, 1.15);
    dummy.updateMatrix();
    bags.push(dummy.matrix.clone());
    dummy.scale.set(1, 1, 1);
  }
  scene.add(instanced(new RoundedBoxGeometry(0.6, 0.2, 0.34, 3, 0.08), hessian, bags));

  scene.add(barbedWire(rand, wood));
  await props(scene, rand);
}

/** Réseau de barbelés côté ennemi : piquets, fils tendus et rouleaux concertina. */
function barbedWire(rand: () => number, wood: THREE.Material) {
  const group = new THREE.Group();
  const seg: number[] = [];
  const pickets: THREE.Matrix4[] = [];
  const offset = 7.5;
  let prev: THREE.Vector3[] | null = null;
  for (let z = Z0 - 4; z > Z0 - ZONE_LEN + 4; z -= 3.1) {
    const x = trenchX(z) + offset + (rand() - 0.5) * 1.2;
    const y = groundHeight(x, z);
    const lean = (rand() - 0.5) * 0.35;
    dummy.position.set(x, y + 0.6, z);
    dummy.rotation.set(lean, 0, (rand() - 0.5) * 0.3);
    dummy.updateMatrix();
    pickets.push(dummy.matrix.clone());
    const tops = [0.35, 0.75, 1.1].map((h) => new THREE.Vector3(x + Math.sin(lean) * h, y + h, z));
    if (prev && rand() > 0.15) {
      for (let s = 0; s < 3; s++) {
        // Fil affaissé entre deux piquets, en 6 segments.
        for (let i = 0; i < 6; i++) {
          const a = i / 6, b = (i + 1) / 6;
          const p = (t: number) => new THREE.Vector3().lerpVectors(prev![s], tops[s], t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.12, 0));
          seg.push(...p(a).toArray(), ...p(b).toArray());
        }
      }
    }
    prev = tops;
  }
  // Concertina : hélice irrégulière posée au sol devant les piquets.
  for (let z = Z0 - 3; z > Z0 - ZONE_LEN + 3; z -= 0.08) {
    const t = (z / 0.32) * Math.PI * 2;
    const r = 0.42 + (rand() - 0.5) * 0.05;
    const at = (zz: number, tt: number) => {
      const x = trenchX(zz) + offset - 1.4 + Math.cos(tt) * r;
      return [x, groundHeight(x, zz) + 0.4 + Math.sin(tt) * r * 0.9, zz];
    };
    if (rand() > 0.03) seg.push(...at(z, t), ...at(z - 0.08, ((z - 0.08) / 0.32) * Math.PI * 2));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#3a332c' })));
  group.add(instanced(new THREE.BoxGeometry(0.07, 1.3, 0.07), wood, pickets));
  return group;
}

/**
 * Objets abandonnés, placés à la main le long du parcours : la violence se lit dans ce qui reste.
 * t : avancement dans la zone (0 → 1) ; side : -1 paroi arrière, 0 fond, 1 parapet.
 */
const PROPS: { id: string; t: number; side: number; y?: number; rot: [number, number, number]; scale?: number }[] = [
  { id: 'wooden_ladder', t: 0.14, side: 1, rot: [-0.32, 0, 0] },
  { id: 'bolt_action_rifle_7_62', t: 0.2, side: -1, y: 0.55, rot: [0.25, 1.4, 1.25] },
  { id: 'old_gas_mask', t: 0.27, side: 0, rot: [-1.2, 0.6, 0] },
  { id: 'ammo_box', t: 0.33, side: -0.6, rot: [0, 0.3, 0] },
  { id: 'wooden_military_crate', t: 0.35, side: -0.7, rot: [0, -0.2, 0.05] },
  { id: 'ammo_box', t: 0.36, side: -0.65, y: 0.0, rot: [0, 1.2, 0.4] },
  { id: 'rusted_spade_01', t: 0.45, side: 0.6, y: 0.35, rot: [0.4, 0.8, 0.5] },
  { id: 'metal_jerrycan_green', t: 0.53, side: -0.6, rot: [0, 2.1, 0] },
  { id: 'stick_grenade', t: 0.58, side: 0.2, y: 0.03, rot: [0, 0.4, Math.PI / 2] },
  { id: 'old_gas_mask', t: 0.66, side: 0.5, rot: [-1.6, -0.9, 0.3] },
  { id: 'wooden_ladder', t: 0.74, side: 1, rot: [-0.3, 0.05, 0.08] },
  { id: 'bolt_action_rifle_7_62', t: 0.81, side: 0.1, y: 0.06, rot: [Math.PI / 2, 0, 2.6] },
];

async function props(scene: THREE.Scene, rand: () => number) {
  const span = DUG_START - DUG_END;
  await Promise.all(PROPS.map(async (p) => {
    const obj = await model(p.id);
    const z = DUG_START - p.t * span;
    const xc = trenchX(z);
    const x = xc + p.side * (TRENCH.floorHalf - 0.15);
    obj.position.set(x, groundHeight(x, z) + (p.y ?? 0), z);
    obj.rotation.set(p.rot[0], p.rot[1] + Math.atan2(-1, trenchSlope(z)) + Math.PI / 2, p.rot[2], 'YXZ');
    obj.scale.setScalar(p.scale ?? 1);
    scene.add(obj);
  }));

  // Arbres morts en silhouette au-dessus du parapet, jusque dans la zone d'entrée.
  const trees = ['dead_tree_trunk', 'dead_tree_trunk_02'];
  await Promise.all(Array.from({ length: 14 }, async (_, i) => {
    const obj = await model(trees[i % 2]);
    const z = Z0 + 30 - rand() * (ZONE_LEN + 30);
    const x = trenchX(z) + (rand() < 0.5 ? -1 : 1) * (5 + rand() * 14);
    obj.position.set(x, groundHeight(x, z) - 0.3, z);
    obj.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
    obj.scale.setScalar(1 + rand() * 0.6);
    scene.add(obj);
  }));
}
