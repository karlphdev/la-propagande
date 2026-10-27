/** Compteur de session façon caméra de surveillance, repris du site actuel. */
export class Hud {
  private el = document.querySelector<HTMLElement>('.hud__session')!;
  private last = -1;

  update(t: number) {
    const s = Math.floor(t);
    if (s === this.last) return;
    this.last = s;
    const p = (n: number) => String(n).padStart(2, '0');
    this.el.textContent = `SESSION ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }
}
