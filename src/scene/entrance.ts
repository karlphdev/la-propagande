import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr, put, texture } from './assets';
import { dummy, instanced } from './common';
import { Z, groundHeight, rng, zoneStart } from './zones';

const Z0 = zoneStart(Z.entrance);
/** Le mur du sigle, une dizaine de mètres devant la caméra au premier écran. */
const SIGIL_Z = Z0 - 21;

/**
 * Entrée : un point de contrôle dans la nuit. Murs anti-souffle en béton, comme à Beyrouth ou Bagdad,
 * et le sigle de la marque peint au pochoir sur le premier d'entre eux.
 */
export async function buildEntrance(scene: THREE.Scene) {
  const rand = rng(2019);
  const concrete = pbr('damaged_concrete_floor', 2.2, { color: '#8a857d' });

  // Mur en T : semelle + dalle, une seule géométrie.
  const base = new THREE.BoxGeometry(1.25, 0.45, 1.7).translate(0, 0.22, 0);
  const slab = new THREE.BoxGeometry(1.25, 3.4, 0.28).translate(0, 1.9, 0);
  const tWall = mergeGeometries([base, slab]);

  const walls: THREE.Matrix4[] = [];
  const wall = (x: number, z: number, yaw: number, lean = 0) => {
    dummy.position.set(x, groundHeight(x, z) - 0.15, z);
    dummy.rotation.set(lean, yaw, (rand() - 0.5) * 0.04);
    dummy.updateMatrix();
    walls.push(dummy.matrix.clone());
  };
  // Le mur du sigle, face à la caméra au premier écran.
  wall(2.2, SIGIL_Z, -0.25);
  // Deux rangées qui forment une chicane, avec des dalles manquantes ou basculées.
  for (const side of [-1, 1]) {
    for (let z = Z0 - 26; z > Z0 - 54; z -= 1.3) {
      if (rand() < 0.15) continue;
      const tipped = rand() < 0.08 ? side * 0.25 : 0;
      wall(side * (3.4 + rand() * 0.15), z, side > 0 ? Math.PI / 2 : -Math.PI / 2, tipped);
    }
  }
  scene.add(instanced(tWall, concrete, walls, 0.3));

  // Sigle au pochoir, plaqué sur la dalle (peinture mate, éclairée par la nuit comme le béton).
  const sigil = new THREE.Mesh(
    // Le PNG a de larges marges transparentes : le sigle visible fait ~0,9 m, la largeur de la dalle.
    new THREE.PlaneGeometry(2.2, 1.55),
    new THREE.MeshStandardMaterial({
      map: texture('brand/lp-logo-red.png'), transparent: true, alphaTest: 0.3, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2,
    }),
  );
  (sigil.material as THREE.MeshStandardMaterial).map!.colorSpace = THREE.SRGBColorSpace;
  sigil.position.set(2.2 + Math.sin(-0.25) * 0.15, groundHeight(2.2, SIGIL_Z) + 2.1, SIGIL_Z + Math.cos(-0.25) * 0.15);
  sigil.rotation.y = -0.25;
  sigil.receiveShadow = true;
  scene.add(sigil);

  // Projecteur de chantier posé au sol, tourné vers le mur : c'est lui qui révèle le sigle au premier écran.
  const lamp = new THREE.Vector3(0.2, groundHeight(0.2, SIGIL_Z + 6.5), SIGIL_Z + 6.5);
  const beam = new THREE.SpotLight('#ffd9a8', 160, 20, 0.42, 0.6, 1.4);
  beam.position.set(lamp.x, lamp.y + 0.55, lamp.z);
  beam.target.position.set(2.2, groundHeight(2.2, SIGIL_Z) + 2, SIGIL_Z);
  scene.add(beam, beam.target);

  await Promise.all([
    put(scene, 'portable_searchlight', [lamp.x, lamp.y, lamp.z], [0, Math.atan2(2, -6.5) + Math.PI, 0]),
    put(scene, 'old_tyre', [-1.6, groundHeight(-1.6, Z0 - 16), Z0 - 16], [0, 0.4, 0]),
    put(scene, 'barrel_03', [-2.4, groundHeight(-2.4, Z0 - 24), Z0 - 24], [Math.PI / 2, 1.1, 0]),
    put(scene, 'metal_jerrycan_green', [1.9, groundHeight(1.9, Z0 - 31), Z0 - 31], [0, 2.4, 0]),
    put(scene, 'concrete_road_barrier', [-1.5, groundHeight(-1.5, Z0 - 52), Z0 - 52], [0, 0.2, 0]),
    put(scene, 'concrete_road_barrier_02', [1.8, groundHeight(1.8, Z0 - 56), Z0 - 56], [0, -0.3, 0]),
  ]);
}
