// Télécharge les assets CC0 de Poly Haven dans assets-src/ (ignoré par git), puis écrit
// les versions web compressées dans public/assets. Idempotent : saute ce qui existe déjà.
//   node scripts/fetch-assets.mjs
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import sharp from 'sharp';

const MODELS = [
  // Tranchée
  'old_gas_mask', 'bolt_action_rifle_7_62', 'ammo_box', 'wooden_military_crate', 'wooden_ladder',
  'rusted_spade_01', 'metal_jerrycan_green', 'stick_grenade', 'dead_tree_trunk', 'dead_tree_trunk_02',
  // Entrée et ville
  'concrete_road_barrier', 'concrete_road_barrier_02', 'modular_urban_apartments_facade', 'portable_searchlight',
  'old_tyre', 'trashbag', 'plastic_monobloc_chair_01', 'wheelchair_01', 'metal_trash_can',
  // No man's land et écrans
  'rusted_wheel_rim_01', 'barrel_03', 'old_military_crate', 'television_02', 'Television_01',
];
/** Modèles vus de près ou en grand : textures gardées plus nettes. */
const SHARP = new Set(['modular_urban_apartments_facade', 'concrete_road_barrier', 'concrete_road_barrier_02', 'television_02', 'Television_01']);
const KIT = new Set(['modular_urban_apartments_facade']);
const TEXTURES = ['brown_mud_02', 'brown_mud_rocks_01', 'weathered_planks', 'hessian_230', 'damaged_concrete_floor', 'rubble', 'burned_ground_01'];
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };
const HDRI = 'mud_road_puresky';
const BRAND = { 'lp-logo-red.png': 400, 'lp-text-logo-cropped.png': 900 };

const exists = (p) => access(p).then(() => true, () => false);
async function get(url, out) {
  if (await exists(out)) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('↓', out);
  return true;
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const id of MODELS) {
  const out = `public/assets/models/${id}.glb`;
  if (await exists(out)) continue;
  const g = (await files(id)).gltf['1k'].gltf;
  const src = `assets-src/models/${id}/${id}.gltf`;
  await get(g.url, src);
  for (const [rel, f] of Object.entries(g.include)) await get(f.url, `assets-src/models/${id}/${rel}`);
  await mkdir('public/assets/models', { recursive: true });
  execFileSync('npx', ['gltf-transform', 'optimize', src, out, '--compress', 'meshopt', '--texture-compress', 'webp',
    '--texture-size', SHARP.has(id) ? '1024' : '512', '--simplify', 'false',
    // Le kit de façades est assemblé module par module à l'exécution : on garde ses nœuds nommés.
    ...(KIT.has(id) ? ['--join', 'false', '--flatten', 'false', '--instance', 'false', '--compress', 'draco'] : [])], { stdio: 'ignore' });
  console.log('→', out);
}

for (const id of TEXTURES) {
  if (await exists(`public/assets/textures/${id}/arm.webp`)) continue;
  const f = await files(id);
  for (const [k, short] of Object.entries(MAPS)) {
    const src = `assets-src/textures/${id}/${short}.jpg`;
    await get(f[k]['1k'].jpg.url, src);
    await mkdir(`public/assets/textures/${id}`, { recursive: true });
    await sharp(src).webp({ quality: 72 }).toFile(`public/assets/textures/${id}/${short}.webp`);
  }
}

await mkdir('public/assets/hdri', { recursive: true });
await get((await files(HDRI)).hdri['1k'].hdr.url, `public/assets/hdri/${HDRI}.hdr`);

for (const [b, size] of Object.entries(BRAND)) {
  const src = `assets-src/brand/${b}`;
  if (await get(`https://www.lapropagande.net/images/${b}`, src)) {
    await mkdir('public/brand', { recursive: true });
    await sharp(src).resize({ width: size, height: size, fit: 'inside' }).png().toFile(`public/brand/${b}`);
  }
}
