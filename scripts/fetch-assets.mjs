// Télécharge les assets CC0 de Poly Haven (1k) dans public/assets. Idempotent : saute ce qui existe.
//   node scripts/fetch-assets.mjs
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const MODELS = [
  'old_gas_mask', 'bolt_action_rifle_7_62', 'ammo_box', 'wooden_military_crate', 'wooden_ladder',
  'rusted_spade_01', 'metal_jerrycan_green', 'stick_grenade', 'dead_tree_trunk', 'dead_tree_trunk_02',
];
const TEXTURES = ['brown_mud_02', 'brown_mud_rocks_01', 'weathered_planks', 'hessian_230'];
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };
const HDRI = 'mud_road_puresky';
const BRAND = ['lp-logo-red.png', 'lp-text-logo-cropped.png'];

const exists = (p) => access(p).then(() => true, () => false);
async function get(url, out) {
  if (await exists(out)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('↓', out);
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const id of MODELS) {
  const g = (await files(id)).gltf['1k'].gltf;
  await get(g.url, `public/assets/models/${id}/${id}.gltf`);
  for (const [rel, f] of Object.entries(g.include)) await get(f.url, `public/assets/models/${id}/${rel}`);
}
for (const id of TEXTURES) {
  const f = await files(id);
  for (const [k, short] of Object.entries(MAPS)) await get(f[k]['1k'].jpg.url, `public/assets/textures/${id}/${short}.jpg`);
}
await get((await files(HDRI)).hdri['1k'].hdr.url, `public/assets/hdri/${HDRI}.hdr`);
for (const b of BRAND) await get(`https://www.lapropagande.net/images/${b}`, `public/brand/${b}`);

// Les props restent petits à l'écran : textures ramenées à 512 px (sips, macOS) pour tenir le budget de poids.
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
for (const f of globSync('public/assets/models/*/textures/*_1k.jpg')) {
  const w = Number(/pixelWidth: (\d+)/.exec(execFileSync('sips', ['-g', 'pixelWidth', f], { encoding: 'utf8' }))?.[1]);
  if (w > 512) execFileSync('sips', ['-Z', '512', '-s', 'formatOptions', '70', f], { stdio: 'ignore' });
}
for (const [b, size] of [['lp-logo-red.png', 400], ['lp-text-logo-cropped.png', 900]]) {
  execFileSync('sips', ['-Z', String(size), `public/brand/${b}`], { stdio: 'ignore' });
}
