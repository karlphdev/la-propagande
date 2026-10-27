import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;

export const manager = new THREE.LoadingManager();
const tex = new THREE.TextureLoader(manager);
const gltf = new GLTFLoader(manager);

/** Matériau PBR non métallique à partir d'une texture Poly Haven (diff / nor / arm), répétée tous les `metres` mètres. */
export function pbr(id: string, metres: number, params: THREE.MeshStandardMaterialParameters = {}) {
  const load = (name: string, srgb = false) => {
    const t = tex.load(`${BASE}textures/${id}/${name}.jpg`);
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

/** Modèle Poly Haven, chargé une fois puis cloné à chaque placement. */
const models = new Map<string, Promise<THREE.Object3D>>();
export function model(id: string) {
  if (!models.has(id)) {
    models.set(id, gltf.loadAsync(`${BASE}models/${id}/${id}.gltf`).then((g) => {
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      return g.scene;
    }));
  }
  return models.get(id)!.then((m) => m.clone());
}

export const hdri = (id: string) => new HDRLoader(manager).loadAsync(`${BASE}hdri/${id}.hdr`);
