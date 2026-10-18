// One Euro filter: suppresses point jitter without adding lag on fast motion
export class OneEuro {
  constructor() { this.x = null; this.dx = 0; this.t = null; }
  static alpha(te, cutoff) { return 1 / (1 + 1 / (2 * Math.PI * cutoff) / te); }
  reset() { this.x = null; }
  filter(v, t, minCutoff, beta) {
    if (this.x === null) { this.x = v; this.dx = 0; this.t = t; return v; }
    const te = Math.max(t - this.t, 1e-3);
    this.t = t;
    const dx = (v - this.x) / te;
    this.dx += OneEuro.alpha(te, 1) * (dx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(te, cutoff) * (v - this.x);
    return this.x;
  }
}

/** A set of `count` independent filters (one per coordinate) and a function that resets them all at once. */
export function createFilters(count) {
  const filters = Array.from({ length: count }, () => new OneEuro());
  return { filters, reset() { for (const f of filters) f.reset(); } };
}
