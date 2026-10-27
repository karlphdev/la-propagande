import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

export const SECTION_COUNT = 5;

/**
 * Scroll infini : la piste fait SECTION_COUNT sections + un écran, Lenis boucle à la limite.
 * Tout le visuel dérive de `animatedScroll` (non borné), donc le rebouclage est invisible.
 */
export class InfiniteScroll {
  readonly lenis: Lenis;
  private track: HTMLElement;
  /** Position continue en « sections » (une zone du champ de bataille par unité), non bornée. */
  position = 0;
  velocity = 0;

  constructor(touch: boolean) {
    this.track = document.querySelector<HTMLElement>('.track')!;
    this.track.style.height = `calc(${SECTION_COUNT * 400 + 100}dvh)`;
    this.lenis = new Lenis({
      infinite: true,
      lerp: 0.08,
      // Lenis exige syncTouch en mode infini sur écran tactile.
      syncTouch: touch,
      syncTouchLerp: 0.06,
      touchMultiplier: 1.2,
    });
  }

  update(timeMs: number) {
    this.lenis.raf(timeMs);
    const limit = this.lenis.limit || 1;
    this.position = (this.lenis.animatedScroll / limit) * SECTION_COUNT;
    this.velocity = this.lenis.velocity / innerHeight;
  }

  /** Section courante, bornée à [0, SECTION_COUNT). */
  get index() {
    return modulo(Math.round(this.position), SECTION_COUNT);
  }
}

export const modulo = (n: number, d: number) => ((n % d) + d) % d;
