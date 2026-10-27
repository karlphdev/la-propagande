import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;

export const manager = new THREE.LoadingManager();
const tex = new THREE.TextureLoader(manager);
// Meshopt pour les props ; Draco pour le kit de façades, dont on doit garder les repères de modules intacts.
const gltf = new GLTFLoader(manager)
  .setMeshoptDecoder(MeshoptDecoder)
  .setDRACOLoader(new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`));

/** Matériau PBR non métallique à partir d'une texture Poly Haven (diff / nor / arm), répétée tous les `metres` mètres. */
export function pbr(id: string, metres: number, params: THREE.MeshStandardMaterialParameters = {}) {
  const load = (name: string, srgb = false) => {
    const t = tex.load(`${BASE}textures/${id}/${name}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.setScalar(1 / metres);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm');
  return new THREE.MeshStandardMaterial({
    map: load('diff', true),
    normalMap: load('nor'),
    aoMap: arm,
    roughnessMap: arm,
    ...params,
  });
}

/** Modèle Poly Haven (glb compressé), chargé une fois puis cloné à chaque placement. */
const models = new Map<string, Promise<THREE.Object3D>>();
export function model(id: string) {
  if (!models.has(id)) {
    models.set(id, gltf.loadAsync(`${BASE}models/${id}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      return g.scene;
    }));
  }
  return models.get(id)!.then((m) => m.clone());
}

/** Pose un modèle dans la scène, le bas à pos.y : position, rotation (ordre YXZ : cap d'abord) et échelle. */
export async function put(parent: THREE.Object3D, id: string, pos: THREE.Vector3Tuple, rot: THREE.Vector3Tuple = [0, 0, 0], scale = 1) {
  const obj = await model(id);
  obj.position.set(...pos);
  obj.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
  obj.scale.setScalar(scale);
  // Les origines Poly Haven ne sont pas toutes au sol : on pose le bas du modèle à la hauteur demandée.
  obj.updateMatrixWorld(true);
  // Enfoncé de quelques centimètres : le maillage du sol interpole le relief et le gomme un peu.
  obj.position.y += pos[1] - new THREE.Box3().setFromObject(obj).min.y - 0.08;
  parent.add(obj);
  return obj;
}

export const texture = (path: string) => tex.load(`${import.meta.env.BASE_URL}${path}`);
export const hdri = (id: string) => new HDRLoader(manager).loadAsync(`${BASE}hdri/${id}.hdr`);
