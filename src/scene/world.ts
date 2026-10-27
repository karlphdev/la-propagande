import * as THREE from 'three';
import { pbr } from './assets';
import { ground } from './common';
import { buildEntrance } from './entrance';
import { buildTrench } from './trench';
import { buildCity } from './city';
import { buildField } from './field';
import { buildScreens } from './screens';

/** Construit les cinq zones et renvoie ce qui s'anime d'une image à l'autre. */
export async function buildWorld(scene: THREE.Scene) {
  // Terre mate : sans carte de rugosité, les cailloux ne scintillent plus sous la fusée (et sous le bloom).
  const soil = pbr('brown_mud_rocks_01', 2.6, { color: '#5d4f43', normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1 });
  soil.roughnessMap = null;
  const grounds = [
    soil,
    soil,
    pbr('damaged_concrete_floor', 4, { color: '#6f6b65' }),
    pbr('burned_ground_01', 3, { color: '#1f1915' }),
    pbr('rubble', 2.5, { color: '#5a5550' }),
  ];
  grounds.forEach((mat, zone) => scene.add(ground(zone, mat)));

  const [, , city, , screens] = await Promise.all([
    buildEntrance(scene),
    buildTrench(scene),
    buildCity(scene),
    buildField(scene),
    buildScreens(scene),
  ]);
  return (dt: number, t: number, cam: THREE.Vector3) => {
    city.update(t);
    screens.update(dt, t, cam);
  };
}
