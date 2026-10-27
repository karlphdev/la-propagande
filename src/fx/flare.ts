import * as THREE from 'three';
import { rng } from '../scene/zones';

const LIFE = 9;
const WHITE = new THREE.Color('#ffe9c8');
const RED = new THREE.Color('#ff2a1a');

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * Fusée éclairante : seule vraie source de lumière de la nuit. Elle monte, flotte, descend en dérivant
 * et fait tourner les ombres des étais. Une sur trois est rouge (la couleur de la marque).
 */
export class Flare {
  readonly light = new THREE.SpotLight(WHITE, 0, 0, Math.PI / 2.6, 0.9, 1.6);
  private sprite: THREE.Sprite;
  private age = LIFE;
  private count = 0;
  private rand = rng(42);
  private vel = new THREE.Vector3();

  constructor(scene: THREE.Scene, shadows: boolean) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: WHITE, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sprite.scale.setScalar(4);
    if (shadows) {
      this.light.castShadow = true;
      this.light.shadow.mapSize.set(2048, 2048);
      this.light.shadow.camera.near = 4;
      this.light.shadow.camera.far = 90;
      this.light.shadow.bias = -0.0004;
      this.light.shadow.normalBias = 0.05;
    }
    scene.add(this.light, this.light.target, this.sprite);
  }

  /** Lancée en avant de la caméra, un peu sur le côté. */
  private launch(cam: THREE.Vector3) {
    const r = this.rand;
    this.age = 0;
    this.count++;
    const color = this.count % 3 === 0 ? RED : WHITE;
    this.light.color.copy(color);
    (this.sprite.material as THREE.SpriteMaterial).color.copy(color);
    // Assez bas et loin pour que la fusée entre dans le cadre quand on regarde devant soi.
    this.light.position.set(cam.x + (r() - 0.5) * 20, 17 + r() * 6, cam.z - 26 - r() * 18);
    this.vel.set((r() - 0.5) * 1.2, -1.2, 0.6);
  }

  update(dt: number, t: number, cam: THREE.Vector3) {
    this.age += dt;
    if (this.age > LIFE) this.launch(cam);
    const a = this.age;
    this.light.position.addScaledVector(this.vel, dt);
    // Allumage brutal, scintillement du magnésium, extinction en fin de chute.
    const env = THREE.MathUtils.smoothstep(a, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(a, LIFE - 1.6, LIFE));
    const flicker = 0.82 + 0.18 * Math.sin(t * 37) * Math.sin(t * 23.3 + 1.7);
    this.light.intensity = 2600 * env * flicker;
    this.light.target.position.set(cam.x, 0, cam.z - 6);
    this.sprite.position.copy(this.light.position);
    this.sprite.material.opacity = env;
  }
}
