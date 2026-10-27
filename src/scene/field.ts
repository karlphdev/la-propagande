import * as THREE from 'three';
import { put } from './assets';
import { dummy, instanced } from './common';
import { pbr } from './assets';
import { Z, ZONE_LEN, groundHeight, rng, zoneStart } from './zones';

const Z0 = zoneStart(Z.field);

/**
 * No man's land : terre brûlée criblée de cratères (le relief vient de zones.ts),
 * arbres hachés par la mitraille, piquets de barbelés arrachés, ce qui reste des hommes.
 */
export async function buildField(scene: THREE.Scene) {
  const rand = rng(1916);
  const wood = pbr('weathered_planks', 1.6, { color: '#3b352f' });

  // Piquets isolés ou en grappes, penchés dans tous les sens, quelques fils encore tendus.
  const pickets: THREE.Matrix4[] = [];
  const seg: number[] = [];
  for (let i = 0; i < 110; i++) {
    const z = Z0 - 4 - rand() * (ZONE_LEN - 8);
    const x = (rand() < 0.5 ? -1 : 1) * (1.2 + rand() ** 1.5 * 16);
    const y = groundHeight(x, z);
    const lean = (rand() - 0.5) * 1.1;
    dummy.position.set(x, y + 0.5, z);
    dummy.rotation.set(lean, rand() * 3, (rand() - 0.5) * 0.8);
    dummy.updateMatrix();
    pickets.push(dummy.matrix.clone());
    if (rand() < 0.5) {
      const tx = x + (rand() - 0.5) * 5, tz = z + (rand() - 0.5) * 5;
      seg.push(x, y + 0.8, z, tx, groundHeight(tx, tz) + 0.05, tz);
    }
  }
  scene.add(instanced(new THREE.BoxGeometry(0.07, 1.2, 0.07), wood, pickets));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#2c2621' })));

  const spot = (t: number, x: number, lift = 0): THREE.Vector3Tuple => {
    const z = Z0 - t * ZONE_LEN;
    return [x, groundHeight(x, z) + lift, z];
  };
  const jobs: Promise<unknown>[] = [
    put(scene, 'rusted_wheel_rim_01', spot(0.08, -2.2), [1.4, 0.3, 0]),
    put(scene, 'barrel_03', spot(0.15, 3.1), [Math.PI / 2, 0.6, 0]),
    put(scene, 'old_military_crate', spot(0.22, -1.8, -0.1), [0.2, 1.2, 0.15]),
    put(scene, 'old_gas_mask', spot(0.3, 1.1), [-1.3, 2.2, 0]),
    put(scene, 'bolt_action_rifle_7_62', spot(0.31, 1.7, 0.04), [Math.PI / 2, 0, 0.6]),
    put(scene, 'old_tyre', spot(0.42, -3.6), [0.3, 0, 0]),
    put(scene, 'metal_jerrycan_green', spot(0.5, 2.4), [Math.PI / 2, 0.9, 0]),
    put(scene, 'rusted_spade_01', spot(0.57, -1.3, 0.3), [0.6, 0.4, 0.9]),
    put(scene, 'barrel_03', spot(0.64, -4.2), [0, 0, 0.1]),
    put(scene, 'stick_grenade', spot(0.7, 0.8, 0.03), [0, 1.9, Math.PI / 2]),
    put(scene, 'rusted_wheel_rim_01', spot(0.78, 3.4), [0, 0.8, 0]),
    put(scene, 'old_gas_mask', spot(0.86, -0.9), [-1.5, 0.4, 0.4]),
  ];
  // Arbres hachés : troncs nus, souvent couchés.
  const trees = ['dead_tree_trunk', 'dead_tree_trunk_02'];
  for (let i = 0; i < 26; i++) {
    const t = rand();
    const x = (rand() < 0.5 ? -1 : 1) * (1.8 + rand() ** 1.4 * 18);
    const fallen = rand() < 0.35;
    jobs.push(put(scene, trees[i % 2], spot(t, x, -0.4), [fallen ? 1.3 : (rand() - 0.5) * 0.4, rand() * 6.3, (rand() - 0.5) * 0.4], 0.8 + rand() * 0.7));
  }
  await Promise.all(jobs);
}
