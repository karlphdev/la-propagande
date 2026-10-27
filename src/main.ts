import './styles.css';
import * as THREE from 'three';
import { InfiniteScroll, SECTION_COUNT } from './scroll';
import { Spring } from './scene/spring';
import { ZONE_LEN, floorY, trenchX } from './scene/zones';
import { buildTrench } from './scene/trench';
import { manager, hdri } from './scene/assets';
import { Flare } from './fx/flare';
import { Grain } from './fx/grain';
import { Hud } from './ui/hud';
import { device, hasWebGL2 } from './device';

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const loaderEl = document.querySelector<HTMLElement>('.loader')!;
const countEl = document.querySelector<HTMLElement>('.loader__count')!;

if (!hasWebGL2()) {
  // shortcut: pas encore d'image de secours, prévue à l'étape 4.
  loaderEl.textContent = 'WebGL2 indisponible';
  throw new Error('WebGL2 indisponible');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, device.lite ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const shadows = !device.lite;
renderer.shadowMap.enabled = shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Nuit couverte : le brouillard avale tout au-delà de quelques dizaines de mètres.
const night = new THREE.Color('#15181b');
const scene = new THREE.Scene();
scene.background = night;
scene.fog = new THREE.FogExp2(night, 0.055);
scene.add(new THREE.HemisphereLight('#3a4350', '#120f0c', 0.55));
const moon = new THREE.DirectionalLight('#7f8ea3', 0.25);
moon.position.set(-30, 40, 10);
scene.add(moon);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 220);
const flare = new Flare(scene, shadows);

manager.onProgress = (_, loaded, total) => (countEl.textContent = String(Math.round((loaded / total) * 100)).padStart(3, '0'));
const [env] = await Promise.all([hdri('mud_road_puresky'), buildTrench(scene)]);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(env).texture;
scene.environmentIntensity = 0.08;
env.dispose();

let stats: { begin(): void; end(): void; dom: HTMLElement } | undefined;
if (device.debug) {
  const { default: Stats } = await import('three/examples/jsm/libs/stats.module.js');
  stats = new Stats();
  document.body.appendChild(stats.dom);
}

await renderer.compileAsync(scene, camera);
countEl.textContent = '100';
loaderEl.classList.add('is-done');

const scroll = new InfiniteScroll(device.coarse);
const grain = new Grain(device.reducedMotion);
const hud = new Hud();
// ?s=1.3 : ouvre directement à un point du parcours (débogage, captures).
const start = Number(new URLSearchParams(location.search).get('s'));
if (start) scroll.lenis.scrollTo((start / SECTION_COUNT) * scroll.lenis.limit, { immediate: true });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// Regard libre à la souris, avec inertie : on tourne la tête dans la tranchée.
const yaw = new Spring(0, 30, 10);
const pitch = new Spring(0, 30, 10);
addEventListener('pointermove', (e) => {
  if (device.reducedMotion || e.pointerType !== 'mouse') return;
  yaw.target = -(e.clientX / innerWidth - 0.5) * 0.7;
  pitch.target = -(e.clientY / innerHeight - 0.5) * 0.3;
});

/** Axe lissé de la tranchée : moyenne sur quelques mètres, la caméra coupe les virages comme un marcheur. */
const pathX = (z: number) => (trenchX(z - 1.5) + trenchX(z) + trenchX(z + 1.5)) / 3;
const look = new THREE.Vector3();
const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop((timeMs) => {
  stats?.begin();
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();
  scroll.update(timeMs);

  const loop = ZONE_LEN * SECTION_COUNT;
  const z = -(((scroll.position * ZONE_LEN) % loop) + loop) % loop;
  // Pas de marche : léger balancement proportionnel à la distance parcourue.
  const bob = device.reducedMotion ? 0 : Math.sin(z * 2.4) * 0.025;
  camera.position.set(pathX(z), floorY(z) + 1.62 + bob, z);
  look.set(pathX(z - 7), floorY(z - 7) + 1.45, z - 7);
  camera.lookAt(look);
  camera.rotateY(yaw.update(dt));
  camera.rotateX(pitch.update(dt));

  flare.update(dt, t, camera.position);
  grain.update(dt, scroll.velocity);
  hud.update(t);
  renderer.render(scene, camera);
  stats?.end();
});
