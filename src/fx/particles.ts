import * as THREE from 'three';
import { FIRES } from '../scene/city';
import { ZONE_LEN, ZONES, floorY, rng, trenchX } from '../scene/zones';

const LOOP = ZONE_LEN * ZONES;
/** Intensité de la pluie par zone : battante dehors, absente dans le couloir d'écrans. */
const RAIN = [1, 1, 0.45, 0.9, 0];
/** Densité de fumée par zone. */
const SMOKE = [0.2, 0.5, 1, 0.8, 0.35];

/** Valeur par zone, fondue sur 15 m autour des frontières. */
function byZone(values: number[], z: number) {
  const f = THREE.MathUtils.euclideanModulo(-z, LOOP) / ZONE_LEN;
  const k = Math.floor(f);
  const t = THREE.MathUtils.smoothstep(f - k, 1 - 15 / ZONE_LEN, 1);
  return THREE.MathUtils.lerp(values[k], values[(k + 1) % ZONES], t);
}

const wrap = (v: number, center: number, half: number) => center + THREE.MathUtils.euclideanModulo(v - center + half, half * 2) - half;

/** Pluie : traits ancrés dans le monde, recyclés dans une boîte autour de la caméra. */
class Rain {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private drops: Float32Array;
  private mat = new THREE.LineBasicMaterial({ color: '#8d969e', transparent: true, depthWrite: false });

  constructor(count: number, rand: () => number) {
    this.drops = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.drops.set([(rand() - 0.5) * 30, rand() * 16, -rand() * 40], i * 3);
    this.pos = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
  }

  update(dt: number, cam: THREE.Vector3) {
    const w = byZone(RAIN, cam.z);
    this.lines.visible = w > 0.02;
    if (!this.lines.visible) return;
    this.mat.opacity = 0.32 * w;
    const d = this.drops;
    for (let i = 0; i < d.length; i += 3) {
      d[i] += 2.2 * dt;
      d[i + 1] -= 14 * dt;
      const x = wrap(d[i], cam.x, 15), y = wrap(d[i + 1], cam.y + 5, 9), z = wrap(d[i + 2], cam.z - 14, 20);
      d[i] = x; d[i + 1] = y; d[i + 2] = z;
      this.pos.set([x, y, z, x - 0.08, y + 0.55, z], i * 2);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * Nuages de points (fumée, braises) rendus par un petit shader : taille en mètres, fondu par âge,
 * brouillard exponentiel identique à celui de la scène.
 */
function pointsMaterial(additive: boolean, soft: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uScale: { value: 1 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0 },
      uSoft: { value: soft },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      uniform float uScale;
      varying float vAlpha;
      varying vec3 vColor;
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * uScale / -mv.z;
        vAlpha = alpha;
        vColor = color;
        vDepth = -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform float uFogDensity, uSoft;
      varying float vAlpha;
      varying vec3 vColor;
      varying float vDepth;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = vAlpha * pow(max(0.0, 1.0 - r), uSoft);
        if (a < 0.003) discard;
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(mix(vColor, uFogColor, fog), a * (1.0 - fog * 0.6));
      }
    `,
  });
}

/** Un système de particules : graine, âge, durée de vie ; chaque type décide de sa trajectoire. */
class Cloud {
  readonly points: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  readonly n: number;
  readonly base: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly pos: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly color: Float32Array;

  constructor(n: number, additive: boolean, soft: number) {
    this.n = n;
    this.base = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.color = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.mat = pointsMaterial(additive, soft);
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  commit(fog: THREE.FogExp2, scale: number) {
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = true;
    this.mat.uniforms.uFogColor.value.copy(fog.color);
    this.mat.uniforms.uFogDensity.value = fog.density;
    this.mat.uniforms.uScale.value = scale;
  }
}

function glowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 40, 0, 32, 36, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Particles {
  private rain: Rain;
  private smoke: Cloud;
  private embers: Cloud;
  private flames: THREE.Sprite[] = [];
  private rand = rng(303);
  /** Fumée d'explosion : quelques bouffées réservées, déplacées sur le point d'impact. */
  private burstFrom = 0;

  constructor(scene: THREE.Scene, lite: boolean) {
    const r = this.rand;
    this.rain = new Rain(lite ? 700 : 1800, r);

    // Fumée : bouffées posées le long du parcours, qui montent et grossissent lentement.
    this.smoke = new Cloud(lite ? 90 : 180, false, 1.6);
    for (let i = 0; i < this.smoke.n; i++) {
      const z = -r() * LOOP;
      const near = FIRES[Math.floor(r() * FIRES.length)];
      // Un tiers de la fumée de la ville sort des foyers ; le reste dérive au ras du sol.
      const fromFire = r() < 0.35 && Math.abs(z - near.z) < ZONE_LEN;
      const p = fromFire ? near : new THREE.Vector3(trenchX(z) + (r() - 0.5) * 34, floorY(z) - 1, z);
      this.smoke.base.set([p.x, p.y, p.z], i * 3);
      this.smoke.life[i] = 14 + r() * 12;
      this.smoke.age[i] = r() * this.smoke.life[i];
      const warm = fromFire ? 1 : 0;
      this.smoke.color.set([0.16 + warm * 0.1, 0.15 + warm * 0.05, 0.14], i * 3);
    }
    this.burstFrom = this.smoke.n - 14;

    // Braises : arrachées aux foyers par la chaleur.
    this.embers = new Cloud(lite ? 120 : 360, true, 2.2);
    for (let i = 0; i < this.embers.n; i++) {
      const f = FIRES[i % FIRES.length];
      this.embers.base.set([f.x, f.y, f.z], i * 3);
      this.embers.life[i] = 2.5 + r() * 3;
      this.embers.age[i] = r() * this.embers.life[i];
      this.embers.color.set([1, 0.42 + r() * 0.25, 0.12], i * 3);
    }

    // Flammes : trois sprites additifs par foyer, le halo vient du bloom.
    const tex = glowTexture('rgba(255,220,150,1)', 'rgba(255,90,20,0.55)');
    for (const f of FIRES) {
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffc080' }));
        s.position.copy(f).add(new THREE.Vector3((k - 1) * 0.6, 0.7 + k * 0.15, (k - 1) * 0.3));
        this.flames.push(s);
        scene.add(s);
      }
    }
    scene.add(this.rain.lines, this.smoke.points, this.embers.points);
  }

  /** Une explosion à `p` : la fumée réservée y repart de zéro. */
  burst(p: THREE.Vector3) {
    const s = this.smoke;
    for (let i = this.burstFrom; i < s.n; i++) {
      s.base.set([p.x + (this.rand() - 0.5) * 3, p.y, p.z + (this.rand() - 0.5) * 3], i * 3);
      s.age[i] = 0;
      s.life[i] = 9 + this.rand() * 5;
      s.color.set([0.2, 0.17, 0.15], i * 3);
    }
  }

  update(dt: number, t: number, cam: THREE.Vector3, fog: THREE.FogExp2, scale: number) {
    this.rain.update(dt, cam);

    const s = this.smoke;
    const density = byZone(SMOKE, cam.z);
    for (let i = 0; i < s.n; i++) {
      s.age[i] = (s.age[i] + dt) % s.life[i];
      const k = s.age[i] / s.life[i];
      const b = i * 3;
      s.pos[b] = s.base[b] + Math.sin(t * 0.1 + i) * 2 + k * 6;
      s.pos[b + 1] = s.base[b + 1] + k * 9;
      s.pos[b + 2] = s.base[b + 2] - k * 2;
      s.size[i] = 5 + k * 12;
      s.alpha[i] = Math.sin(k * Math.PI) * 0.35 * (i >= this.burstFrom ? 1.6 : density);
    }
    s.commit(fog, scale);

    const e = this.embers;
    for (let i = 0; i < e.n; i++) {
      e.age[i] = (e.age[i] + dt) % e.life[i];
      const k = e.age[i] / e.life[i];
      const b = i * 3;
      const h = k * (3 + (i % 5));
      e.pos[b] = e.base[b] + Math.sin(t * 1.7 + i * 1.3) * 0.6 * k + (i % 7 - 3) * 0.15 * h;
      e.pos[b + 1] = e.base[b + 1] + h;
      e.pos[b + 2] = e.base[b + 2] + Math.cos(t * 1.3 + i) * 0.6 * k;
      e.size[i] = 0.09;
      e.alpha[i] = (1 - k) * (0.6 + 0.4 * Math.sin(t * 20 + i));
    }
    e.commit(fog, scale);

    this.flames.forEach((f, i) => {
      const flick = 0.75 + 0.25 * Math.sin(t * 11 + i * 1.7) * Math.sin(t * 7.3 + i);
      f.scale.set(2 * flick, 3 * flick, 1);
      f.material.opacity = flick;
    });
  }
}
