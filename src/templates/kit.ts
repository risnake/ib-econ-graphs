/**
 * Building blocks shared by all templates. Keeps individual templates short,
 * consistent (same default geometry, same labelling conventions) and correct
 * (cost curves come from real cost functions, MR from the demand function...).
 */
import type {
  AreaEl,
  AreaRole,
  Control,
  CurveEl,
  CurveRole,
  El,
  Handle,
  LineEl,
  Panel,
  Params,
  PointEl,
  TextEl,
  TickEl,
  Vec,
} from '~/engine/types';
import * as G from '~/engine/geometry';

export { G };

/** Default plot box (data units). */
export const BOX = { x0: 0, y0: 0, x1: 10, y1: 10 };

// ---------------------------------------------------------------------------
// Element factories

export function panel(p: Partial<Panel> & { elements: El[] }): Panel {
  return {
    id: 'main',
    xLabel: 'Quantity',
    yLabel: 'Price',
    xMax: 10,
    yMax: 10,
    ...p,
    elements: p.elements.filter(Boolean),
  };
}

export const curve = (
  id: string,
  points: Vec[],
  label?: string,
  o: Partial<Omit<CurveEl, 'kind' | 'id' | 'points' | 'label'>> = {},
): CurveEl => ({ kind: 'curve', id, points, label, ...o });

export const point = (id: string, at: Vec, o: Partial<Omit<PointEl, 'kind' | 'id' | 'at'>> = {}): PointEl => ({
  kind: 'point',
  id,
  at,
  ...o,
});

/** A point with dashed guides to both axes. */
export const eqPoint = (
  id: string,
  at: Vec,
  xLabel: string,
  yLabel: string,
  o: Partial<Omit<PointEl, 'kind' | 'id' | 'at' | 'xLabel' | 'yLabel'>> = {},
): PointEl => ({ kind: 'point', id, at, xLabel, yLabel, ...o });

export const area = (
  id: string,
  polygon: Vec[],
  role: AreaRole,
  label?: string,
  legend?: string,
  o: Partial<Omit<AreaEl, 'kind' | 'id' | 'polygon' | 'role'>> = {},
): AreaEl => ({ kind: 'area', id, polygon, role, label, legend, ...o });

export const arrow = (id: string, from: Vec, to: Vec, o: Partial<Omit<LineEl, 'kind' | 'id' | 'from' | 'to'>> = {}): LineEl => ({
  kind: 'line',
  id,
  from,
  to,
  variant: 'shift',
  ...o,
});

export const measure = (
  id: string,
  from: Vec,
  to: Vec,
  label?: string,
  o: Partial<Omit<LineEl, 'kind' | 'id' | 'from' | 'to'>> = {},
): LineEl => ({ kind: 'line', id, from, to, variant: 'measure', label, ...o });

export const guide = (id: string, from: Vec, to: Vec, o: Partial<Omit<LineEl, 'kind' | 'id' | 'from' | 'to'>> = {}): LineEl => ({
  kind: 'line',
  id,
  from,
  to,
  variant: 'guide',
  ...o,
});

export const segment = (id: string, from: Vec, to: Vec, o: Partial<Omit<LineEl, 'kind' | 'id' | 'from' | 'to'>> = {}): LineEl => ({
  kind: 'line',
  id,
  from,
  to,
  variant: 'plain',
  ...o,
});

export const text = (id: string, at: Vec, t: string, o: Partial<Omit<TextEl, 'kind' | 'id' | 'at' | 'text'>> = {}): TextEl => ({
  kind: 'text',
  id,
  at,
  text: t,
  ...o,
});

export const tick = (id: string, axis: 'x' | 'y', value: number, label: string): TickEl => ({
  kind: 'tick',
  id,
  axis,
  value,
  label,
});

/** Filter helper so templates can write `when(cond, el)` inside element arrays. */
export function when<T>(cond: unknown, ...els: T[]): T[] {
  return cond ? els : [];
}

// ---------------------------------------------------------------------------
// Supply & demand geometry

export interface LineOpts {
  xLo?: number;
  xHi?: number;
  yLo?: number;
  yHi?: number;
}

/**
 * Straight curve through `anchor` with `slope`, trimmed so it stays inside a
 * comfortable drawing window (doesn't crash into the axes or the box edge).
 */
export function sdLine(anchor: Vec, slope: number, o: LineOpts = {}): Vec[] {
  // yHi is the box top so shading clipped at the box edge always meets the line.
  const { xLo = 0, xHi = 9.2, yLo = 0.9, yHi = 10 } = o;
  if (!Number.isFinite(slope) || Math.abs(slope) > 1e6) return G.vline(anchor[0], yLo, yHi);
  if (Math.abs(slope) < 1e-9) return G.hline(anchor[1], xLo, xHi);
  const xAtY = (y: number) => anchor[0] + (y - anchor[1]) / slope;
  const a = xAtY(yLo);
  const b = xAtY(yHi);
  const x0 = Math.max(xLo, Math.min(a, b));
  const x1 = Math.min(xHi, Math.max(a, b));
  return G.lineX(anchor, slope, x0, x1);
}

/**
 * Demand/supply pair driven by the shared "Shape" sliders (dSlope, sSlope).
 * D(shift)/S(shift) return the curve shifted horizontally from the (5,5) anchor.
 */
export function sd(p: Params, dShift = 0, sShift = 0) {
  const dSlope = -P.n(p, 'dSlope', 0.8);
  const sSlope = P.n(p, 'sSlope', 0.8);
  const D = (shift = dShift) => sdLine([D0[0] + shift, D0[1]], dSlope);
  const S = (shift = sShift) => sdLine([D0[0] + shift, D0[1]], sSlope);
  return { D, S, dSlope, sSlope };
}

/** The standard pair of "Shape" sliders used with `sd()`. */
export const shapeControls = (dDefault = 0.8, sDefault = 0.8): Control[] => [
  slider('dSlope', 'Demand steepness', 0.3, 2.5, 0.05, dDefault, { group: 'Shape' }),
  slider('sSlope', 'Supply steepness', 0.3, 2.5, 0.05, sDefault, { group: 'Shape' }),
];

/** Default demand: through (5,5), slope -0.8. */
export const D0: Vec = [5, 5];
export const DEMAND_SLOPE = -0.8;
export const SUPPLY_SLOPE = 0.8;

/** Slope presets used by "elasticity" selects. */
export const ELASTICITY_SLOPES: Record<string, { d: number; s: number }> = {
  elastic: { d: -0.4, s: 0.4 },
  normal: { d: -0.8, s: 0.8 },
  inelastic: { d: -1.9, s: 1.9 },
};

export const elasticityOptions = [
  { value: 'elastic', label: 'Relatively elastic' },
  { value: 'normal', label: 'Standard' },
  { value: 'inelastic', label: 'Relatively inelastic' },
];

/**
 * Arrow showing a shift from curve a to curve b.
 *  - 'h': horizontal (demand/supply shifts: change at every price)
 *  - 'v': vertical (cost shifts, taxes)
 *  - 'perp': perpendicular to a
 * `t` is the position along a's visible length.
 */
export function shiftArrow(
  id: string,
  a: Vec[],
  b: Vec[],
  o: { t?: number; mode?: 'h' | 'v' | 'perp'; gap?: number; box?: G.Box; label?: string; role?: CurveRole } = {},
): LineEl {
  const { t = 0.3, mode = 'h', gap = 0.28, box = BOX } = o;
  const vis = G.clipPolyline(a, box)[0] ?? a;
  const visB = G.clipPolyline(b, box)[0] ?? b;

  const attempt = (tt: number, target: Vec[]): LineEl | null => {
    const p = G.pointAt(vis, tt);
    let dir: Vec;
    if (mode === 'h') dir = [1, 0];
    else if (mode === 'v') dir = [0, 1];
    else {
      const q = G.pointAt(vis, Math.min(1, tt + 0.02));
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      dir = [-(q[1] - p[1]) / d, (q[0] - p[0]) / d];
    }
    const ray: Vec[] = [
      [p[0] - dir[0] * 40, p[1] - dir[1] * 40],
      [p[0] + dir[0] * 40, p[1] + dir[1] * 40],
    ];
    const hits = G.intersections(ray, target);
    if (!hits.length) return null;
    let q = hits[0];
    for (const h of hits) {
      if (Math.hypot(h[0] - p[0], h[1] - p[1]) < Math.hypot(q[0] - p[0], q[1] - p[1])) q = h;
    }
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const g = Math.min(gap, len * 0.25);
    const ux = (q[0] - p[0]) / (len || 1);
    const uy = (q[1] - p[1]) / (len || 1);
    return arrow(id, [p[0] + ux * g, p[1] + uy * g], [q[0] - ux * g, q[1] - uy * g], {
      label: o.label,
      role: o.role,
    });
  };

  // Prefer a spot where the arrow lands on the *visible* part of b; nudge t if it misses.
  for (const d of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4]) {
    const tt = t + d;
    if (tt < 0.05 || tt > 0.95) continue;
    const r = attempt(tt, visB);
    if (r) return r;
  }
  const p = G.pointAt(vis, t);
  return attempt(t, b) ?? arrow(id, p, [p[0] + (mode === 'v' ? 0 : 1), p[1] + (mode === 'v' ? 1 : 0)], { label: o.label, role: o.role });
}

/** Short arrow drawn alongside a curve, showing movement along it from t0 to t1. */
export function alongArrow(id: string, c: Vec[], t0: number, t1: number, offset = 0.35): LineEl {
  const a = G.pointAt(c, t0);
  const b = G.pointAt(c, t1);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / d;
  const ny = (b[0] - a[0]) / d;
  return arrow(id, [a[0] + nx * offset, a[1] + ny * offset], [b[0] + nx * offset, b[1] + ny * offset]);
}

// ---------------------------------------------------------------------------
// Theory of the firm: cost curves derived from a real cost function so that
// MC cuts AVC and ATC exactly at their minimum points.

export interface CostModel {
  /** fixed cost */
  F: number;
  avc: (q: number) => number;
  mc: (q: number) => number;
  atc: (q: number) => number;
  afc: (q: number) => number;
  minAVC: Vec;
  minATC: Vec;
  minMC: Vec;
  /** Output where MC = p on the rising part of MC. */
  qAtMC: (p: number) => number;
}

/**
 * AVC(q) = k + c·(q − m)²  ⇒  TVC = q·AVC,  MC = AVC + q·AVC′.
 * Defaults put min AVC ≈ (4, 3) and min ATC ≈ (5.3, 4.3) on a 10×10 grid.
 */
export function costModel({ F = 6, k = 3, c = 0.1, m = 4 }: { F?: number; k?: number; c?: number; m?: number } = {}): CostModel {
  const avc = (q: number) => k + c * (q - m) ** 2;
  const mc = (q: number) => avc(q) + 2 * c * q * (q - m);
  const atc = (q: number) => avc(q) + F / q;
  const afc = (q: number) => F / q;
  const qMinATC = G.argmin(atc, 0.2, 20);
  const qMinMC = (2 * m) / 3;
  return {
    F,
    avc,
    mc,
    atc,
    afc,
    minAVC: [m, k],
    minATC: [qMinATC, atc(qMinATC)],
    minMC: [qMinMC, mc(qMinMC)],
    qAtMC: (p: number) => G.solve((q) => mc(q) - p, qMinMC, 30),
  };
}

/** Sample a cost curve, trimmed to the box (with a little headroom). */
export function costCurve(f: (q: number) => number, q0 = 0.4, q1 = 10, yMax = 10.5): Vec[] {
  return G.fn(f, q0, q1, 200).filter(([, y]) => y <= yMax && y >= -0.5);
}

/** Linear demand P = A − B·q and its marginal revenue. */
export function linearDemand(A: number, B: number) {
  return {
    A,
    B,
    p: (q: number) => A - B * q,
    mr: (q: number) => A - 2 * B * q,
    q: (p: number) => (A - p) / B,
  };
}

// ---------------------------------------------------------------------------
// Controls

export const toggle = (key: string, label: string, def: boolean, o: Partial<Control> = {}): Control =>
  ({ type: 'toggle', key, label, default: def, ...o }) as Control;

export const select = (
  key: string,
  label: string,
  options: { value: string; label: string }[],
  def: string,
  o: Partial<Control> = {},
): Control => ({ type: 'select', key, label, options, default: def, ...o }) as Control;

export const slider = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number,
  o: Partial<Control> = {},
): Control => ({ type: 'slider', key, label, min, max, step, default: def, ...o }) as Control;

export const num = (key: string, label: string, def: number, o: Partial<Control> = {}): Control =>
  ({ type: 'number', key, label, default: def, ...o }) as Control;

export const textInput = (key: string, label: string, def: string, o: Partial<Control> = {}): Control =>
  ({ type: 'text', key, label, default: def, ...o }) as Control;

/** Typed param accessors. */
export const P = {
  n: (p: Params, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : Number(p[k] ?? d) || d),
  b: (p: Params, k: string) => p[k] === true || p[k] === 'true',
  s: (p: Params, k: string, d = '') => (p[k] === undefined ? d : String(p[k])),
};

/** Handle that drags a param horizontally/vertically. */
export function dragHandle(
  id: string,
  at: Vec,
  axis: 'x' | 'y',
  key: string,
  base: number,
  o: { min?: number; max?: number; scale?: number; hint?: string } = {},
): Handle {
  const { min = -Infinity, max = Infinity, scale = 1 } = o;
  return {
    id,
    at,
    axis,
    hint: o.hint,
    apply: (pos) => {
      const delta = (axis === 'x' ? pos[0] - at[0] : pos[1] - at[1]) * scale;
      const v = G.clamp(base + delta, min, max);
      return { [key]: Math.round(v * 100) / 100 };
    },
  };
}

// ---------------------------------------------------------------------------
// Number formatting for numeric templates

export function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '–';
  const r = Number(n.toFixed(dp));
  return r.toLocaleString('en-US', { maximumFractionDigits: dp });
}

export const money = (n: number, sym = '$', dp = 2) => `${n < 0 ? '−' : ''}${sym}${fmt(Math.abs(n), dp)}`;
