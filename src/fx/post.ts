import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Passe « choc » : flash blanc, aberration chromatique, tranches décalées et trame rouge de la marque.
 * Elle ne s'active que pendant une transition ou une explosion ; au repos elle ne fait qu'un vignettage.
 */
const ShockShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShock: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uRed: { value: new THREE.Color('#a3000b') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uShock, uFlash, uTime;
    uniform vec3 uRed;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // Tranches horizontales qui décrochent, redessinées 24 fois par seconde.
      float frame = floor(uTime * 24.0);
      float band = floor(uv.y * 90.0 + hash(vec2(frame, 7.0)) * 40.0);
      float tear = step(1.0 - uShock * 0.28, hash(vec2(band, frame)));
      uv.x += tear * (hash(vec2(frame, band)) - 0.5) * 0.2 * uShock;
      // Aberration chromatique radiale.
      vec2 dir = (uv - 0.5) * uShock * 0.035;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + dir).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir).b
      );
      // Trame rouge : la marque imprime sa couleur sur les tranches arrachées.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, uRed * (0.25 + luma * 3.0), tear * 0.75);
      col += uFlash;
      // Vignettage permanent, plus serré pendant le choc.
      float v = smoothstep(0.95, 0.25 - uShock * 0.1, length(vUv - 0.5));
      gl_FragColor = vec4(col * mix(0.55, 1.0, v), 1.0);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private shock: ShaderPass;
  private bloom?: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, lite: boolean) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // Halo des fusées, des feux et des écrans ; coupé sur mobile, trop coûteux.
    if (!lite) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.55, 0.97);
      this.composer.addPass(this.bloom);
    }
    this.shock = new ShaderPass(ShockShader);
    this.composer.addPass(this.shock);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
  }

  render(t: number, shock: number, flash: number) {
    const u = this.shock.uniforms;
    u.uTime.value = t;
    u.uShock.value = shock;
    u.uFlash.value = flash;
    this.composer.render();
  }
}
