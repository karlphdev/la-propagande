import * as THREE from 'three';
import { Z, ZONE_LEN, ZONES, groundHeight, trenchX, zoneStart } from '../scene/zones';

/** Frontières entre zones (la boucle 4 → 0 a déjà son fondu blanc) et obus du no man's land. */
const BORDERS = Array.from({ length: ZONES - 1 }, (_, i) => zoneStart(i + 1));
const SHELLS = [0.28, 0.55, 0.8].map((t) => zoneStart(Z.field) - t * ZONE_LEN);

/**
 * Chocs : chaque passage de frontière déchire l'image (glitch rouge, flash, secousse),
 * chaque obus du no man's land tombe devant la caméra. Déclenchés par le passage, dans les deux sens.
 */
export class Shock {
  shock = 0;
  flash = 0;
  shake = 0;
  private prevZ = NaN;
  private blast = new THREE.PointLight('#ff8a3d', 0, 60, 1.2);
  readonly shakeOffset = new THREE.Vector3();

  constructor(scene: THREE.Scene, private enabled: boolean, private onBlast: (p: THREE.Vector3) => void) {
    scene.add(this.blast);
  }

  update(dt: number, t: number, z: number) {
    const crossed = (b: number) => (this.prevZ - b) * (z - b) < 0 && Math.abs(z - this.prevZ) < 40;
    if (this.enabled && !Number.isNaN(this.prevZ)) {
      if (BORDERS.some(crossed)) this.hit(1, 0.55, 0.12);
      const shell = SHELLS.find(crossed);
      if (shell !== undefined) this.explode(shell, z > this.prevZ ? 1 : -1);
    }
    this.prevZ = z;

    // Décroissances exponentielles : coup sec, retour lent.
    this.shock *= Math.exp(-dt * 3.2);
    this.flash *= Math.exp(-dt * 9);
    this.shake *= Math.exp(-dt * 4);
    this.blast.intensity *= Math.exp(-dt * 2.6);
    const s = this.shake;
    this.shakeOffset.set(Math.sin(t * 61) * s, Math.sin(t * 47 + 1) * s, 0);
  }

  private hit(shock: number, flash: number, shake: number) {
    this.shock = Math.max(this.shock, shock);
    this.flash = Math.max(this.flash, flash);
    this.shake = Math.max(this.shake, shake);
  }

  /** L'obus tombe devant, en avant dans le sens de la marche, un peu sur le côté. */
  private explode(z: number, backward: number) {
    const ez = z + 16 * (backward > 0 ? 1 : -1);
    const ex = trenchX(ez) + (Math.sin(z) > 0 ? 7 : -7);
    const p = new THREE.Vector3(ex, groundHeight(ex, ez), ez);
    this.blast.position.copy(p).y += 2;
    this.blast.intensity = 900;
    this.hit(0.4, 0.35, 0.28);
    this.onBlast(p);
  }
}
