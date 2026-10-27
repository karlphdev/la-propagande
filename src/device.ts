const mq = (q: string) => window.matchMedia(q).matches;

export const device = {
  coarse: mq('(pointer: coarse)'),
  small: mq('(max-width: 767px)'),
  reducedMotion: mq('(prefers-reduced-motion: reduce)'),
  get lite() {
    return this.coarse || this.small;
  },
  debug: new URLSearchParams(location.search).has('debug'),
  wire: new URLSearchParams(location.search).has('wire'),
};

export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
