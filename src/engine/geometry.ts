import type { Vec } from './types';

/**
 * Geometry toolkit. Every curve is a polyline of data-space points, which keeps
 * intersections, slicing and clipping uniform for straight lines, splines and
 * arbitrary functions alike.
 */

const EPS = 1e-9;

export const isFiniteVec = (p: Vec | null | undefined): p is Vec =>
  !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// ---------------------------------------------------------------------------
// Construction

/** Straight line through `anchor` with `slope`, spanning x ∈ [x0, x1]. */
export function lineX(anchor: Vec, slope: number, x0: number, x1: number): Vec[] {
  const y = (x: number) => anchor[1] + slope * (x - anchor[0]);
  return [
    [x0, y(x0)],
    [x1, y(x1)],
  ];
}

/** Straight line through `anchor` with `slope`, spanning y ∈ [y0, y1]. */
export function lineY(anchor: Vec, slope: number, y0: number, y1: number): Vec[] {
  const x = (y: number) => anchor[0] + (y - anchor[1]) / slope;
  const pts: Vec[] = [
    [x(y0), y0],
    [x(y1), y1],
  ];
  return pts[0][0] <= pts[1][0] ? pts : [pts[1], pts[0]];
}

/** Line through two points, extended by `extend` (fraction of length) at each end. */
export function through(a: Vec, b: Vec, extendStart = 0, extendEnd = extendStart): Vec[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [
    [a[0] - dx * extendStart, a[1] - dy * extendStart],
    [b[0] + dx * extendEnd, b[1] + dy * extendEnd],
  ];
}

export const vline = (x: number, y0: number, y1: number): Vec[] => [
  [x, y0],
  [x, y1],
];

export const hline = (y: number, x0: number, x1: number): Vec[] => [
  [x0, y],
  [x1, y],
];

/** Sample y = f(x) on [x0, x1]. Non-finite samples are dropped. */
export function fn(f: (x: number) => number, x0: number, x1: number, n = 160): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

/** Sample a parametric curve. */
export function param(
  fx: (t: number) => number,
  fy: (t: number) => number,
  t0: number,
  t1: number,
  n = 160,
): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p: Vec = [fx(t), fy(t)];
    if (isFiniteVec(p)) out.push(p);
  }
  return out;
}

/**
 * Monotone cubic (Fritsch–Carlson) spline through points with increasing x.
 * Never overshoots, so it is ideal for PPCs, Lorenz curves, cost curves, etc.
 */
export function spline(pts: Vec[], samplesPerSeg = 24): Vec[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < EPS) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  const out: Vec[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = k / samplesPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        xs[i] + t * h,
        h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1],
      ]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/** Centripetal Catmull–Rom spline through arbitrary points (curves that turn back). */
export function catmull(pts: Vec[], samplesPerSeg = 24): Vec[] {
  if (pts.length < 3) return pts.slice();
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Vec[] = [];
  const knot = (a: Vec, b: Vec, t: number) =>
    t + Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-6);
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const t0 = 0;
    const t1 = knot(p0, p1, t0);
    const t2 = knot(p1, p2, t1);
    const t3 = knot(p2, p3, t2);
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / samplesPerSeg;
      const lerp = (a: Vec, b: Vec, ta: number, tb: number): Vec => {
        const w = tb - ta < EPS ? 0 : (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Transforms

export const shiftX = (c: Vec[], dx: number): Vec[] => c.map(([x, y]) => [x + dx, y] as Vec);
export const shiftY = (c: Vec[], dy: number): Vec[] => c.map(([x, y]) => [x, y + dy] as Vec);
export const mapY = (c: Vec[], f: (y: number, x: number) => number): Vec[] =>
  c.map(([x, y]) => [x, f(y, x)] as Vec);
export const mapX = (c: Vec[], f: (x: number, y: number) => number): Vec[] =>
  c.map(([x, y]) => [f(x, y), y] as Vec);

// ---------------------------------------------------------------------------
// Queries

interface Hit {
  p: Vec;
  /** Position along curve a (segment index + fraction). */
  s: number;
}

function segHit(a1: Vec, a2: Vec, b1: Vec, b2: Vec): { t: number; u: number } | null {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const qx = b1[0] - a1[0];
  const qy = b1[1] - a1[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t, u };
}

/** All intersections of two polylines, ordered along `a`. */
export function intersections(a: Vec[], b: Vec[]): Vec[] {
  const hits: Hit[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const h = segHit(a[i], a[i + 1], b[j], b[j + 1]);
      if (h) {
        const p: Vec = [
          a[i][0] + (a[i + 1][0] - a[i][0]) * h.t,
          a[i][1] + (a[i + 1][1] - a[i][1]) * h.t,
        ];
        if (!hits.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 1e-6)) {
          hits.push({ p, s: i + h.t });
        }
      }
    }
  }
  return hits.sort((x, y) => x.s - y.s).map((h) => h.p);
}

/** Intersection of the infinite lines through two segments. */
function lineLineIntersect(a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec | null {
  const rx = a2[0] - a1[0];
  const ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0];
  const sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((b1[0] - a1[0]) * sy - (b1[1] - a1[1]) * sx) / den;
  return [a1[0] + rx * t, a1[1] + ry * t];
}

/**
 * Where two curves meet. Picks the first (or last) intersection along `a`.
 * If they don't cross within their extents: straight lines are extended;
 * otherwise the point of closest approach is returned.
 */
export function meet(a: Vec[], b: Vec[], which: 'first' | 'last' = 'first'): Vec {
  const all = intersections(a, b);
  if (all.length) return which === 'first' ? all[0] : all[all.length - 1];
  if (a.length === 2 && b.length === 2) {
    const p = lineLineIntersect(a[0], a[1], b[0], b[1]);
    if (p) return p;
  }
  // closest approach between sample points
  let best: Vec = a[0];
  let bestD = Infinity;
  for (const p of a) {
    for (const q of b) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bestD) {
        bestD = d;
        best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }
  }
  return best;
}

/** y on the curve at x (linear interpolation; extrapolates beyond the ends). */
export function yAt(c: Vec[], x: number): number {
  if (c.length === 0) return NaN;
  if (c.length === 1) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = c[i];
    const [x1, y1] = c[i + 1];
    if ((x >= x0 - EPS && x <= x1 + EPS) || (x <= x0 + EPS && x >= x1 - EPS)) {
      if (Math.abs(x1 - x0) < EPS) return y0;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  // extrapolate from the nearer end
  const first = c[0][0];
  const last = c[c.length - 1][0];
  const [p0, p1] =
    Math.abs(x - first) < Math.abs(x - last) ? [c[0], c[1]] : [c[c.length - 2], c[c.length - 1]];
  if (Math.abs(p1[0] - p0[0]) < EPS) return p0[1];
  return p0[1] + ((p1[1] - p0[1]) * (x - p0[0])) / (p1[0] - p0[0]);
}

/** x on the curve at y (linear interpolation; extrapolates beyond the ends). */
export function xAt(c: Vec[], y: number): number {
  return yAt(
    c.map(([a, b]) => [b, a] as Vec),
    y,
  );
}

/** Point on the curve at x. */
export const at = (c: Vec[], x: number): Vec => [x, yAt(c, x)];
/** Point on the curve at y. */
export const atY = (c: Vec[], y: number): Vec => [xAt(c, y), y];

/** Portion of an x-monotone curve between x0 and x1, endpoints interpolated. */
export function sliceX(c: Vec[], x0: number, x1: number): Vec[] {
  const curve = c.length > 1 && c[0][0] > c[c.length - 1][0] ? c.slice().reverse() : c;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const out: Vec[] = [[lo, yAt(curve, lo)]];
  for (const p of curve) if (p[0] > lo + EPS && p[0] < hi - EPS) out.push(p);
  out.push([hi, yAt(curve, hi)]);
  return x0 <= x1 ? out : out.reverse();
}

/** Region between two x-monotone curves over [x0, x1]. */
export function between(upper: Vec[], lower: Vec[], x0: number, x1: number): Vec[] {
  return [...sliceX(upper, x0, x1), ...sliceX(lower, x0, x1).reverse()];
}

/** Region between a curve and the horizontal line y = base over [x0, x1]. */
export function under(c: Vec[], x0: number, x1: number, base = 0): Vec[] {
  return between(c, hline(base, x0, x1), x0, x1);
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Point a fraction `t` of the way along the curve's arc length. */
export function pointAt(c: Vec[], t: number): Vec {
  if (c.length < 2) return c[0] ?? [NaN, NaN];
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const l = Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]);
    lens.push(l);
    total += l;
  }
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const w = lens[i] < EPS ? 0 : target / lens[i];
      return [c[i][0] + (c[i + 1][0] - c[i][0]) * w, c[i][1] + (c[i + 1][1] - c[i][1]) * w];
    }
    target -= lens[i];
  }
  return c[c.length - 1];
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function polygonCentroid(poly: Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function polygonArea(poly: Vec[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

// ---------------------------------------------------------------------------
// Numerics

/** Root of f on [a, b] by bisection. Returns NaN if there is no sign change. */
export function solve(f: (x: number) => number, a: number, b: number, iters = 80): number {
  let fa = f(a);
  const fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return NaN;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  let lo = a;
  let hi = b;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (fa * fm < 0) hi = mid;
    else {
      lo = mid;
      fa = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Minimiser of a unimodal f on [a, b] (golden-section search). */
export function argmin(f: (x: number) => number, a: number, b: number, iters = 80): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = a;
  let hi = b;
  let c = hi - g * (hi - lo);
  let d = lo + g * (hi - lo);
  for (let i = 0; i < iters; i++) {
    if (f(c) < f(d)) hi = d;
    else lo = c;
    c = hi - g * (hi - lo);
    d = lo + g * (hi - lo);
  }
  return (lo + hi) / 2;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "Nice" tick values covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    out.push(Math.round(v / step) * step);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clipping (data space)

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function clipSegment(a: Vec, b: Vec, box: Box): [Vec, Vec] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box.x0, box.x1 - a[0], a[1] - box.y0, box.y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < -EPS) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
  }
  if (t0 > t1 + EPS) return null;
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Clip a polyline to a box; returns the visible runs. */
export function clipPolyline(pts: Vec[], box: Box): Vec[][] {
  const runs: Vec[][] = [];
  let cur: Vec[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = clipSegment(pts[i], pts[i + 1], box);
    if (!s) {
      if (cur.length) runs.push(cur);
      cur = [];
      continue;
    }
    const last = cur[cur.length - 1];
    if (last && Math.hypot(last[0] - s[0][0], last[1] - s[0][1]) < 1e-7) {
      cur.push(s[1]);
    } else {
      if (cur.length) runs.push(cur);
      cur = [s[0], s[1]];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

/** Sutherland–Hodgman polygon clip against an axis-aligned box. */
export function clipPolygon(poly: Vec[], box: Box): Vec[] {
  type Edge = { inside: (p: Vec) => boolean; cut: (a: Vec, b: Vec) => Vec };
  const cutX = (x: number) => (a: Vec, b: Vec): Vec => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const cutY = (y: number) => (a: Vec, b: Vec): Vec => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= box.x0 - EPS, cut: cutX(box.x0) },
    { inside: (p) => p[0] <= box.x1 + EPS, cut: cutX(box.x1) },
    { inside: (p) => p[1] >= box.y0 - EPS, cut: cutY(box.y0) },
    { inside: (p) => p[1] <= box.y1 + EPS, cut: cutY(box.y1) },
  ];
  let out = poly.filter(isFiniteVec);
  for (const e of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = e.inside(cur);
      const pi = e.inside(prev);
      if (ci) {
        if (!pi) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(e.cut(prev, cur));
      }
    }
  }
  return out;
}
