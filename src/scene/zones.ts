import * as THREE from 'three';

/** Longueur d'une zone en mètres. La zone i s'étend de z = -i·L à z = -(i+1)·L ; la caméra avance vers -z. */
export const ZONE_LEN = 120;
export const ZONES = 5;

/** Zones du parcours, dans l'ordre. */
export const Z = { entrance: 0, trench: 1, city: 2, field: 3, screens: 4 } as const;
export const zoneStart = (i: number) => -i * ZONE_LEN;

export const TRENCH = {
  zone: Z.trench,
  depth: 2.4,
  /** Demi-largeur au fond et en haut des parois : parois légèrement évasées. */
  floorHalf: 0.9,
  topHalf: 1.3,
  /** Rampe d'entrée et de sortie, en mètres. */
  ramp: 14,
};

/** Demi-largeur de la rue de Beyrouth : les façades commencent juste après le trottoir. */
export const STREET_HALF = 6.5;

const smooth = THREE.MathUtils.smootherstep;

/** Poids 0 → 1 → 0 d'une zone, avec un fondu de `ramp` mètres à chaque bout. */
export function inZone(z: number, zone: number, ramp: number) {
  const start = zoneStart(zone);
  return Math.min(smooth(start - z, 0, ramp), smooth(z - (start - ZONE_LEN), 0, ramp));
}

/**
 * Tracé de la tranchée en créneaux arrondis : alternance de « baies » droites et de « traverses »,
 * comme les vraies tranchées de 14-18. Hors de la tranchée, le chemin redevient droit.
 */
export function trenchX(z: number) {
  const s = Math.sin((z * Math.PI * 2) / 30);
  const zig = (2 * Math.tanh(1.1 * s)) / Math.tanh(1.1);
  const start = zoneStart(Z.trench);
  return zig * smooth(start - z, -10, 6) * smooth(z - (start - ZONE_LEN), -10, 6);
}

/** Pente du tracé dx/dz (différence finie) : oriente tout ce qui longe la tranchée. */
export const trenchSlope = (z: number) => (trenchX(z + 0.05) - trenchX(z - 0.05)) / 0.1;

/** Profondeur de la tranchée à z (0 hors de la zone 1, rampes aux extrémités). */
export const trenchDepth = (z: number) => TRENCH.depth * inZone(z, Z.trench, TRENCH.ramp);

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

/** Relief de chaque zone : bosselé dehors, plat dans la rue, labouré par les obus dans le no man's land. */
const RELIEF = [0.9, 1.1, 0.1, 1.4, 0.7];
const CRATER_COUNT = [10, 14, 0, 48, 8];

function relief(z: number) {
  const f = -z / ZONE_LEN;
  const k = THREE.MathUtils.clamp(Math.floor(f), 0, ZONES - 1);
  const t = smooth(f - k, 1 - 10 / ZONE_LEN, 1);
  return THREE.MathUtils.lerp(RELIEF[k], RELIEF[(k + 1) % ZONES], t);
}

/** Cratères d'obus : cuvette et bourrelet, jamais sur le chemin lui-même. */
const CRATERS: { x: number; z: number; r: number }[] = [];
{
  const rand = rng(7);
  CRATER_COUNT.forEach((n, zone) => {
    for (let i = 0; i < n; i++) {
      const z = zoneStart(zone) - 6 - rand() * (ZONE_LEN - 12);
      const side = rand() < 0.5 ? -1 : 1;
      const r = 1.6 + rand() * (zone === Z.field ? 4 : 2.8);
      // Dans le no man's land, les obus tombent aussi sur le chemin : on descend dans les entonnoirs.
      const gap = zone === Z.field ? rand() * 12 : r + 2.6 + rand() * 14;
      CRATERS.push({ x: trenchX(z) + side * gap, z, r });
    }
  });
}

export function surfaceHeight(x: number, z: number) {
  let h = (fbm(x * 0.18, z * 0.18) - 0.5) * relief(z);
  for (const c of CRATERS) {
    const dz = z - c.z;
    if (dz > c.r * 1.6 || dz < -c.r * 1.6) continue;
    const q = Math.hypot(x - c.x, dz) / c.r;
    if (q < 1) h -= 0.45 * c.r * (1 - q * q);
    h += 0.12 * c.r * Math.exp(-(((q - 1) / 0.25) ** 2));
  }
  // Gravats effondrés au pied des façades de la rue.
  const city = inZone(z, Z.city, 8);
  if (city > 0) {
    const pile = Math.max(0, fbm(x * 0.35 + 3, z * 0.22) - 0.42) * 4.2;
    h += city * pile * Math.exp(-(((Math.abs(x) - STREET_HALF - 0.5) / 2.4) ** 2));
  }
  return h;
}

/** Hauteur du sol : terrain, déblais en parapet de part et d'autre, tranchée creusée. */
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

/** Sol sur l'axe du chemin, là où marche la caméra. */
export const floorY = (z: number) => groundHeight(trenchX(z), z);
