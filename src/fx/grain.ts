/**
 * Grain de film : une tuile de bruit générée une fois, décalée au hasard 24 fois par seconde
 * sur un calque fixe sans interaction. Aucun asset, presque aucun coût par frame.
 */
const TILE = 256;

export class Grain {
  private el: HTMLElement;
  private acc = 0;

  constructor(private reducedMotion: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'grain';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.el);

    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(TILE, TILE);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  }

  /** velocity : vitesse de scroll en écrans/s ; le grain s'épaissit quand on scrolle vite. */
  update(dt: number, velocity: number) {
    this.el.style.opacity = (0.07 + Math.min(Math.abs(velocity), 3) * 0.025).toFixed(3);
    if (this.reducedMotion) return;
    this.acc += dt;
    if (this.acc < 1 / 24) return;
    this.acc = 0;
    this.el.style.backgroundPosition = `${Math.floor(Math.random() * TILE)}px ${Math.floor(Math.random() * TILE)}px`;
  }
}
