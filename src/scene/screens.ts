import * as THREE from 'three';
import { model } from './assets';
import { dummy } from './common';
import { Z, ZONE_LEN, groundHeight, rng, zoneStart } from './zones';

const Z0 = zoneStart(Z.screens);
const CHANNELS = 4;

/** Neige analogique : un petit canvas de bruit redessiné 15 fois par seconde, partagé par tous les écrans. */
class Static {
  readonly canvas = document.createElement('canvas');
  readonly textures: THREE.CanvasTexture[] = [];
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private acc = 0;

  constructor() {
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(160, 120);
    // Chaque « chaîne » lit une autre moitié du canvas : les écrans voisins ne sont pas synchrones.
    for (let i = 0; i < CHANNELS; i++) {
      const t = new THREE.CanvasTexture(this.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(0.5, 0.5);
      t.offset.set((i % 2) * 0.5, Math.floor(i / 2) * 0.5);
      this.textures.push(t);
    }
    this.draw(0);
  }

  private draw(t: number) {
    const d = this.img.data;
    // Barre de défilement verticale, comme une image qui décroche.
    const bar = Math.floor((t * 40) % 120);
    for (let y = 0; y < 120; y++) {
      const roll = Math.abs(y - bar) < 6 ? 0.45 : 1;
      for (let x = 0; x < 160; x++) {
        const v = Math.random() * 235 * roll;
        const i = (y * 160 + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    for (const tex of this.textures) tex.needsUpdate = true;
  }

  update(dt: number, t: number) {
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    this.draw(t);
  }
}

/** Premier maillage d'un modèle, transformation comprise : base d'un InstancedMesh. */
async function meshOf(id: string) {
  const root = await model(id);
  root.updateMatrixWorld(true);
  let found: THREE.Mesh | undefined;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  const geo = found!.geometry.clone().applyMatrix4(found!.matrixWorld);
  geo.computeBoundingBox();
  return { geo, mat: found!.material as THREE.Material };
}

/**
 * Le mur d'écrans : un couloir de téléviseurs cathodiques empilés qui ne diffusent que de la neige.
 * La propagande a tout recouvert ; au bout, l'image blanchit et le parcours recommence.
 */
export async function buildScreens(scene: THREE.Scene) {
  const rand = rng(1984);
  const sets = await Promise.all(['television_02', 'Television_01'].map(meshOf));
  const noise = new Static();

  const placements = sets.map(() => [] as THREE.Matrix4[]);
  const screens = Array.from({ length: CHANNELS }, () => [] as THREE.Matrix4[]);
  const screenGeo = new THREE.PlaneGeometry(1, 1);

  /** Une pile de téléviseurs à (x, z), tournée vers `face` (angle autour de y). */
  const pile = (x: number, z: number, face: number, height: number) => {
    let y = groundHeight(x, z) - 0.05;
    for (let k = 0; k < height; k++) {
      const s = Math.floor(rand() * sets.length);
      const box = sets[s].geo.boundingBox!;
      const size = box.getSize(new THREE.Vector3());
      const yaw = face + (rand() - 0.5) * 0.5;
      const ox = (rand() - 0.5) * 0.12, oz = (rand() - 0.5) * 0.12;
      dummy.position.set(x + ox, y - box.min.y, z + oz);
      dummy.rotation.set(0, yaw, (rand() - 0.5) * 0.06);
      dummy.updateMatrix();
      placements[s].push(dummy.matrix.clone());
      // Écran : un plan collé sur la face avant (+z du modèle), un peu plus petit que le boîtier.
      if (rand() > 0.12) {
        const screen = new THREE.Matrix4().compose(
          new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + size.y * 0.55, box.max.z + 0.004),
          new THREE.Quaternion(),
          new THREE.Vector3(size.x * 0.68, size.y * 0.6, 1),
        );
        screens[Math.floor(rand() * CHANNELS)].push(dummy.matrix.clone().multiply(screen));
      }
      y += size.y;
    }
  };

  // Le couloir : des piles des deux côtés, de plus en plus hautes et serrées.
  for (let z = Z0 - 8; z > Z0 - ZONE_LEN + 6; z -= 0.75 + rand() * 0.6) {
    const t = (Z0 - z) / ZONE_LEN;
    for (const side of [-1, 1]) {
      if (rand() < 0.25 - t * 0.2) continue;
      const x = side * (2.6 - t * 1.1 + rand() * 0.6);
      pile(x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1 + Math.floor(rand() * (2 + t * 7)));
    }
  }
  // Le fond : un mur d'écrans en travers du chemin, face à la caméra.
  for (let x = -2.6; x <= 2.6; x += 0.5) pile(x, Z0 - ZONE_LEN + 3 + (rand() - 0.5) * 0.3, 0, 7 + Math.floor(rand() * 4));

  sets.forEach((set, s) => {
    const mesh = new THREE.InstancedMesh(set.geo, set.mat, placements[s].length);
    placements[s].forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  });
  noise.textures.forEach((tex, c) => {
    const mesh = new THREE.InstancedMesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex, color: '#b9c0c4' }), screens[c].length);
    screens[c].forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    scene.add(mesh);
  });

  // La lumière froide des écrans, qui vacille avec la neige.
  const glow = new THREE.PointLight('#c9d6e0', 0, 26, 1.4);
  scene.add(glow);
  return {
    update(dt: number, t: number, cam: THREE.Vector3) {
      noise.update(dt, t);
      const near = THREE.MathUtils.clamp(1 - Math.abs(cam.z - (Z0 - ZONE_LEN / 2)) / (ZONE_LEN * 0.6), 0, 1);
      glow.position.set(cam.x, cam.y + 1.2, cam.z - 4);
      glow.intensity = near * (14 + Math.random() * 6);
    },
  };
}
