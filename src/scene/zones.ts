import * as THREE from 'three';

/** Longueur d'une zone en mètres. La zone i s'étend de z = -i·L à z = -(i+1)·L ; la caméra avance vers -z. */
export const ZONE_LEN = 120;

export const TRENCH = {
  zone: 1,
  depth: 2.4,
  /** Demi-largeur au fond et en haut des parois : parois légèrement évasées. */
  floorHalf: 0.9,
  topHalf: 1.3,
  /** Rampe d'entrée et de sortie, en mètres. */
  ramp: 14,
};

const smooth = THREE.MathUtils.smootherstep;

/**
 * Tracé de la tranchée en créneaux arrondis : alternance de « baies » droites et de « traverses »,
 * comme les vraies tranchées de 14-18 (un obus ne balaye jamais plus d'une baie).
 */
export function trenchX(z: number) {
  const s = Math.sin((z * Math.PI * 2) / 30);
  // Amplitude et raideur limitées : les traverses restent praticables et la caméra n'y frotte pas.
  return (2 * Math.tanh(1.1 * s)) / Math.tanh(1.1);
}

/** Pente du tracé dx/dz (différence finie) : oriente tout ce qui longe la tranchée. */
export const trenchSlope = (z: number) => (trenchX(z + 0.05) - trenchX(z - 0.05)) / 0.1;

/** Profondeur de la tranchée à z (0 hors de la zone 1, rampes aux extrémités). */
export function trenchDepth(z: number) {
  const start = -TRENCH.zone * ZONE_LEN;
  const end = start - ZONE_LEN;
  const inRamp = smooth(start - z, 0, TRENCH.ramp);
  const outRamp = smooth(z - end, 0, TRENCH.ramp);
  return TRENCH.depth * Math.min(inRamp, outRamp);
}

/** Bruit de valeur 2D lissé, déterministe : relief du sol sans asset. */
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.28 + noise(x * 5.1, y * 5.1) * 0.12;

/** Cratères d'obus : cuvette et bourrelet, jamais sur la tranchée elle-même. */
const CRATERS: { x: number; z: number; r: number }[] = [];
{
  const rand = rng(7);
  for (let i = 0; i < 70; i++) {
    const z = -rand() * ZONE_LEN * 5;
    const side = rand() < 0.5 ? -1 : 1;
    const r = 1.6 + rand() * 2.8;
    CRATERS.push({ x: trenchX(z) + side * (r + 3.5 + rand() * 14), z, r });
  }
}

export function surfaceHeight(x: number, z: number) {
  let h = (fbm(x * 0.18, z * 0.18) - 0.5) * 1.1;
  for (const c of CRATERS) {
    const dz = z - c.z;
    if (dz > c.r * 1.6 || dz < -c.r * 1.6) continue;
    const q = Math.hypot(x - c.x, dz) / c.r;
    if (q < 1) h -= 0.45 * c.r * (1 - q * q);
    h += 0.12 * c.r * Math.exp(-(((q - 1) / 0.25) ** 2));
  }
  return h;
}

/** Hauteur du sol : terrain bosselé, déblais en parapet de part et d'autre, tranchée creusée. */
export function groundHeight(x: number, z: number) {
  const D = trenchDepth(z);
  const d = Math.abs(x - trenchX(z));
  // Terre rejetée en bourrelet derrière les sacs de sable.
  const spoil = (D / TRENCH.depth) * 0.55 * Math.exp(-(((d - 2.3) / 0.9) ** 2));
  const surface = surfaceHeight(x, z) + spoil;
  if (D <= 0) return surface;
  // Paroi droite et talutée, comme une tranchée creusée à la pelle puis étayée.
  const wall = THREE.MathUtils.clamp((d - TRENCH.floorHalf) / (TRENCH.topHalf - TRENCH.floorHalf), 0, 1);
  // Parois irrégulières : un peu de bruit, plus fort près du haut.
  const rough = (fbm(x * 1.7 + 9, z * 1.7) - 0.5) * 0.12 * wall;
  // Le fond suit le terrain moins la profondeur : les rampes restent continues.
  return THREE.MathUtils.lerp(surface - D, surface, wall) + rough;
}

/** Fond de la tranchée sur l'axe, là où marche la caméra. */
export const floorY = (z: number) => groundHeight(trenchX(z), z);

/** Générateur pseudo-aléatoire reproductible : la même scène à chaque visite. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
