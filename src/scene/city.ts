import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { model, pbr, put } from './assets';
import { dummy, instanced } from './common';
import { STREET_HALF, Z, ZONE_LEN, groundHeight, rng, zoneStart } from './zones';

const Z0 = zoneStart(Z.city);
const MODULE = 3;
const FLOOR = 3;

/** Variantes du kit Poly Haven : fenêtre de l'étage 1, des étages courants, et du dernier étage. */
const WINDOWS = ['centered_large', 'centered_small', 'centered_double', 'offset_small'];
const DOORS = ['centered_large_01', 'centered_small_01', 'centered_small_02'];

/**
 * Rue de Beyrouth en ruines : immeubles assemblés depuis le kit de façades CC0, hauteurs déchiquetées,
 * modules arrachés, vitres soufflées. Tout est fusionné par matériau : une poignée d'appels de rendu.
 */
export async function buildCity(scene: THREE.Scene) {
  const rand = rng(1975);
  const kit = await model('modular_urban_apartments_facade');
  const proto = new Map<string, THREE.Mesh[]>();
  kit.updateMatrixWorld(true);
  kit.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Un module à plusieurs matériaux devient un groupe au nom du module ; sinon c'est le maillage lui-même.
    const owner = m.parent && m.parent !== kit ? m.parent : m;
    const local = new THREE.Matrix4().copy(owner.matrixWorld).invert().multiply(m.matrixWorld);
    const geo = m.geometry.clone().applyMatrix4(local);
    const mesh = new THREE.Mesh(geo, m.material);
    proto.set(owner.name, [...(proto.get(owner.name) ?? []), mesh]);
  });

  // Géométries à fusionner, par matériau. Les vitres sont soufflées : jamais ajoutées.
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (name: string, m: THREE.Matrix4) => {
    for (const part of proto.get(name) ?? []) {
      const mat = part.material as THREE.MeshStandardMaterial;
      if (mat.name.endsWith('glass')) continue;
      const list = byMat.get(mat) ?? [];
      list.push(part.geometry.clone().applyMatrix4(m));
      // Les modules n'ont pas tous les mêmes attributs : on ne garde que ceux que tous partagent.
      const g = list[list.length - 1];
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      byMat.set(mat, list);
    }
  };

  const shells: THREE.Matrix4[] = [];
  const slabs: THREE.Matrix4[] = [];
  for (const side of [-1, 1]) {
    let z = Z0 - 6 - rand() * 3;
    while (z > Z0 - ZONE_LEN + 14) {
      const cols = 3 + Math.floor(rand() * 4);
      const floors = 4 + Math.floor(rand() * 4);
      const win = WINDOWS[Math.floor(rand() * WINDOWS.length)];
      const x = side * (STREET_HALF + 1.2 + rand() * 0.8);
      // Le module fait face à +z et s'étend vers -x depuis son origine : on le tourne vers la rue.
      const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      for (let c = 0; c < cols; c++) {
        const zc = z - c * MODULE;
        const oz = side > 0 ? zc : zc - MODULE;
        const base = groundHeight(x, zc - MODULE / 2) - 0.4;
        // Colonne effondrée plus ou moins haut : la silhouette se déchire.
        const standing = Math.max(1, floors - Math.floor(rand() ** 1.6 * floors));
        for (let f = 0; f < standing; f++) {
          // Volume intérieur calciné, étage par étage ; derrière un trou d'obus il recule et laisse voir la dalle.
          const hole = f > 0 && rand() < 0.16;
          const back = hole ? 2.6 : 0.05;
          dummy.position.set(x + side * (back + 5), base + f * FLOOR + FLOOR / 2, zc - MODULE / 2);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(10, FLOOR, MODULE);
          dummy.updateMatrix();
          shells.push(dummy.matrix.clone());
          if (hole) {
            dummy.position.set(x + side * 1.4, base + f * FLOOR + 0.12, zc - MODULE / 2 + (rand() - 0.5) * 0.4);
            dummy.rotation.set((rand() - 0.5) * 0.15, 0, side * (0.05 + rand() * 0.25));
            dummy.scale.set(2.9, 0.24, MODULE * (0.6 + rand() * 0.4));
            dummy.updateMatrix();
            slabs.push(dummy.matrix.clone());
          }
          dummy.scale.set(1, 1, 1);
          if (hole) continue;
          dummy.position.set(x, base + f * FLOOR, oz);
          dummy.rotation.set(0, yaw, 0);
          dummy.updateMatrix();
          if (f === 0) {
            const door = rand() < 0.45 ? DOORS[Math.floor(rand() * DOORS.length)] : null;
            add(door ? `wall_door_${door}` : 'wall_standard_standard_01', dummy.matrix);
            if (door && rand() < 0.5) add(`door_${door}`, dummy.matrix);
          } else {
            const v = f === standing - 1 && standing === floors ? '03' : f === 1 ? '01' : '02';
            add(`wall_window_${win}_${v}`, dummy.matrix);
            // Châssis arrachés une fois sur trois.
            if (rand() < 0.66) add(`window_${win}_${v}`, dummy.matrix);
          }
        }
        if (standing === floors) {
          dummy.position.set(x, base + standing * FLOOR, oz);
          dummy.updateMatrix();
          add('cornice_standard_standard_01', dummy.matrix);
          add('crown_standard_standard_01', dummy.matrix);
        }
      }
      z -= cols * MODULE + (rand() < 0.35 ? 3 + rand() * 5 : 0);
    }
  }

  // Façades : plâtre et modénatures salis par la suie, plus sombres que neufs.
  for (const [mat, geos] of byMat) {
    const m = (mat as THREE.MeshStandardMaterial).clone();
    m.color.setRGB(0.4, 0.38, 0.36);
    const flat = geos.some((g) => !g.index) ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
    const merged = mergeGeometries(flat);
    if (!merged) throw new Error(`Fusion impossible pour ${mat.name}`);
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const soot = new THREE.MeshStandardMaterial({ color: '#0e0d0c', roughness: 1 });
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), soot, shells, 0));
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), pbr('rubble', 1.5, { color: '#4a4744' }), slabs, 0.3));

  scene.add(rubble(rand), cables(rand));
  await props(scene, rand);

  // Foyers d'incendie dans les gravats et derrière quelques fenêtres : la seule chaleur de la rue.
  const fires = [[0.18, 7.8, 0.4], [0.41, -8.2, 3.6], [0.57, -6.4, 0.3], [0.83, 8.4, 6.8]].map(([t, x, y]) => {
    const z = Z0 - t * ZONE_LEN;
    const light = new THREE.PointLight('#ff7a2e', 0, 18, 1.6);
    light.position.set(x, groundHeight(x, z) + y + 0.6, z);
    scene.add(light);
    return light;
  });
  return {
    update(t: number) {
      fires.forEach((l, i) => (l.intensity = 22 * (0.75 + 0.25 * Math.sin(t * 9 + i * 2) * Math.sin(t * 13.7 + i))));
    },
  };
}

/** Blocs de béton éclatés, au pied des façades et jusque sur la chaussée. */
function rubble(rand: () => number) {
  const mat = pbr('rubble', 1.2, { color: '#6e6a64' });
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 900; i++) {
    const z = Z0 - 4 - rand() * (ZONE_LEN - 8);
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (STREET_HALF + 1 - rand() ** 0.6 * 6.5);
    // Beaucoup d'éclats, peu de gros blocs ; plats comme des morceaux de dalle.
    const s = 0.06 + rand() ** 4 * 0.55;
    dummy.position.set(x, groundHeight(x, z) - s * 0.12, z);
    dummy.rotation.set((rand() - 0.5) * 0.9, rand() * 6.3, (rand() - 0.5) * 0.9);
    dummy.scale.set(s * (1 + rand() * 1.5), s * (0.25 + rand() * 0.4), s * (1 + rand()));
    dummy.updateMatrix();
    mats.push(dummy.matrix.clone());
  }
  dummy.scale.set(1, 1, 1);
  return instanced(new THREE.BoxGeometry(1, 1, 1), mat, mats, 0.4);
}

/** Câbles électriques tombés en travers de la rue, d'une façade à l'autre. */
function cables(rand: () => number) {
  const seg: number[] = [];
  for (let i = 0; i < 16; i++) {
    const z = Z0 - 8 - rand() * (ZONE_LEN - 20);
    const za = z + (rand() - 0.5) * 6, zb = z + (rand() - 0.5) * 6;
    const ya = 4 + rand() * 6, yb = 3 + rand() * 6;
    const sag = 1.5 + rand() * 3;
    const xa = -STREET_HALF - 1.2, xb = STREET_HALF + 1.2;
    let prev: number[] | null = null;
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const p = [xa + (xb - xa) * t, ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag, za + (zb - za) * t];
      if (prev) seg.push(...prev, ...p);
      prev = p;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#141210' }));
}

/** La vie interrompue : chaises de café renversées, un fauteuil roulant au milieu de la rue. */
async function props(scene: THREE.Scene, rand: () => number) {
  const at = (t: number, x: number): THREE.Vector3Tuple => {
    const z = Z0 - t * ZONE_LEN;
    return [x, groundHeight(x, z), z];
  };
  const jobs: Promise<unknown>[] = [
    put(scene, 'plastic_monobloc_chair_01', at(0.2, -3.2), [0, 0.6, 0]),
    put(scene, 'plastic_monobloc_chair_01', at(0.21, -2.4), [Math.PI / 2, 2.2, 0]),
    put(scene, 'plastic_monobloc_chair_01', at(0.23, -3.9), [0.2, -1, Math.PI / 2]),
    put(scene, 'metal_trash_can', at(0.3, 4.1), [Math.PI / 2, 0.8, 0]),
    put(scene, 'trashbag', at(0.31, 4.7), [0, 1, 0]),
    put(scene, 'trashbag', at(0.32, 5.2), [0, 2.5, 0.2]),
    put(scene, 'old_tyre', at(0.44, -1.8), [Math.PI / 2, 0, 0.1]),
    put(scene, 'concrete_road_barrier', at(0.5, 3.1), [0, 0.35, 0]),
    put(scene, 'concrete_road_barrier_02', at(0.52, -3.4), [0, -0.5, 0.15]),
    put(scene, 'wheelchair_01', at(0.6, 0.9), [0, 2.6, 0]),
    put(scene, 'trashbag', at(0.74, -4.4), [0, 0.3, 0]),
    put(scene, 'old_tyre', at(0.8, 2.6), [0, 0, 0]),
    put(scene, 'plastic_monobloc_chair_01', at(0.86, 1.4), [Math.PI / 2, 0.3, 0.4]),
  ];
  for (let i = 0; i < 6; i++) jobs.push(put(scene, 'trashbag', at(rand(), (rand() < 0.5 ? -1 : 1) * (4 + rand() * 2)), [0, rand() * 6, 0], 0.8 + rand() * 0.4));
  await Promise.all(jobs);
}
