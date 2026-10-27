import type { El, Panel, Stat, Template, Vec } from '~/engine/types';
import {
  BOX,
  G,
  P,
  alongArrow,
  area,
  arrow,
  curve,
  dragHandle,
  eqPoint,
  fmt,
  guide,
  measure,
  panel,
  point,
  sdLine,
  select,
  shiftArrow,
  slider,
  text,
  textInput,
  tick,
  toggle,
  when,
} from './kit';

// ---------------------------------------------------------------------------
// Shared macro geometry

const AXES = { xLabel: 'Real GDP', yLabel: 'Average price level' };
const LABOUR_AXES = { xLabel: 'Quantity of labour', yLabel: 'Real wage rate' };

const mpanel = (elements: El[], o: Partial<Panel> = {}): Panel => panel({ ...AXES, ...o, elements });
const lpanel = (elements: El[], o: Partial<Panel> = {}): Panel => panel({ ...LABOUR_AXES, ...o, elements });

/** Aggregate demand through a point (straight, IB-style). */
const adLine = (x: number, y: number, slope = -0.8) => sdLine([x, y], slope);
/** Short-run aggregate supply through a point. */
const srasLine = (x: number, y: number, slope = 0.8) => sdLine([x, y], slope);
/** Vertical long-run aggregate supply at potential output. */
const lrasLine = (x: number) => G.vline(x, 0, 9.3);

/** Keynesian AS: horizontal (spare capacity) → curving (bottlenecks) → vertical at Yfe. */
interface KAS {
  p0: number;
  x1: number;
  yfe: number;
  h: number;
}
const KAS0: KAS = { p0: 3, x1: 3.5, yfe: 7.5, h: 3 };

function keynesAS(k: KAS = KAS0, x0 = 0.3, top = 9.4): Vec[] {
  const arc = G.param(
    (t) => k.x1 + (k.yfe - k.x1) * Math.sin(t),
    (t) => k.p0 + k.h * (1 - Math.cos(t)),
    0,
    Math.PI / 2,
    90,
  );
  return [[x0, k.p0], ...arc, [k.yfe, top]];
}

/** Point on the curved section of a Keynesian AS, `f` ∈ [0,1] from the kink to Yfe. */
function kasAt(k: KAS, f: number): Vec {
  const t = (f * Math.PI) / 2;
  return [k.x1 + (k.yfe - k.x1) * Math.sin(t), k.p0 + k.h * (1 - Math.cos(t))];
}

/**
 * shiftArrow that retries other positions until a horizontal arrow actually
 * reaches curve b (a left shift can otherwise miss b near the top of the box).
 */
function shift(id: string, a: Vec[], b: Vec[], o: Parameters<typeof shiftArrow>[3] = {}) {
  const t0 = o?.t ?? 0.3;
  const tries = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4]
    .map((d) => t0 + d)
    .filter((t) => t >= 0.08 && t <= 0.92);
  const vb = G.clipPolyline(b, BOX)[0] ?? b;
  for (const t of tries) {
    const arr = shiftArrow(id, a, b, { ...o, t });
    if ((o?.mode ?? 'h') !== 'h') return arr;
    if (G.intersections(G.hline(arr.from[1], -50, 50), vb).length) return arr;
  }
  return shiftArrow(id, a, b, o);
}

const TOPIC_ACTIVITY = 'Economic activity';
const TOPIC_ADAS = 'AD/AS model';
const TOPIC_INFL = 'Inflation & deflation';
const TOPIC_UNEMP = 'Unemployment';
const TOPIC_PHILLIPS = 'Phillips curve (HL)';
const TOPIC_POLICY = 'Monetary & fiscal policy';
const TOPIC_GROWTH = 'Supply-side policies & growth';
const TOPIC_INEQ = 'Inequality';

const incDec = (inc = 'Increase', dec = 'Decrease') => [
  { value: 'inc', label: inc },
  { value: 'dec', label: dec },
];

// ---------------------------------------------------------------------------
// Economic activity

const businessCycle: Template = {
  id: 'business-cycle',
  name: 'Business cycle',
  unit: 'macro',
  topic: TOPIC_ACTIVITY,
  description:
    'Actual real GDP fluctuates around the long-term growth trend (potential output), moving through expansions, peaks, recessions and troughs.',
  keywords: ['business cycle', 'trade cycle', 'output gap', 'peak', 'trough', 'recession', 'expansion', 'potential output', 'trend growth'],
  caption: 'The business cycle',
  controls: [
    toggle('turning', 'Label peaks and troughs', true),
    toggle('phases', 'Label expansion and recession', true),
    toggle('gaps', 'Shade output gaps', false),
    slider('amp', 'Size of fluctuations', 0.4, 1.6, 0.05, 1, { group: 'Shape' }),
    slider('period', 'Cycle length', 3, 6, 0.1, 4.2, { group: 'Shape' }),
    slider('growth', 'Trend growth rate', 0, 0.8, 0.05, 0.5, { group: 'Shape' }),
  ],
  build: (p) => {
    const A = P.n(p, 'amp', 1);
    const T = P.n(p, 'period', 4.2);
    const g = P.n(p, 'growth', 0.5);
    const x0 = 0.6; // cycle phase origin (start of an expansion, on trend)
    const xs = 0.3;
    const xe = 8.4;
    const b0 = 5 - g * 4.4;
    const trend = (x: number) => b0 + g * x;
    const actual = (x: number) => trend(x) + A * Math.sin((2 * Math.PI * (x - x0)) / T);
    const trendC = G.fn(trend, xs, xe, 2);
    const actualC = G.fn(actual, xs, xe, 320);

    const els: El[] = [];
    if (P.b(p, 'gaps')) {
      const cuts = [xs];
      for (let k = -2; k < 20; k++) {
        const x = x0 + (k * T) / 2;
        if (x > xs + 1e-6 && x < xe - 1e-6) cuts.push(x);
      }
      cuts.push(xe);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const mid = (a + b) / 2;
        const positive = actual(mid) > trend(mid);
        const wide = b - a > 0.8;
        els.push(
          positive
            ? area(`gap${i}`, G.between(actualC, trendC, a, b), 'ps', wide ? '+' : undefined, 'Positive output gap (inflationary gap)')
            : area(`gap${i}`, G.between(trendC, actualC, a, b), 'cs', wide ? '−' : undefined, 'Negative output gap (recessionary gap)'),
        );
      }
    }

    const endAbove = actual(xe) >= trend(xe);
    els.push(
      curve('trend', trendC, 'Long-term trend', { role: 'long-run', labelDir: endAbove ? 'se' : 'ne' }),
      curve('actual', actualC, 'Actual output', { role: 'demand', labelDir: endAbove ? 'ne' : 'se' }),
    );

    // turning points
    const peaks: number[] = [];
    const troughs: number[] = [];
    for (let k = -1; k < 10; k++) {
      const xp = x0 + T / 4 + k * T;
      const xt = x0 + (3 * T) / 4 + k * T;
      const rp = G.argmin((x) => -actual(x), xp - T / 4, xp + T / 4);
      const rt = G.argmin(actual, xt - T / 4, xt + T / 4);
      if (rp > xs + 0.25 && rp < xe - 0.25) peaks.push(rp);
      if (rt > xs + 0.25 && rt < xe - 0.25) troughs.push(rt);
    }
    if (P.b(p, 'turning')) {
      peaks.forEach((x, i) => els.push(point(`peak${i}`, [x, actual(x)], { label: 'Peak', labelDir: 'n' })));
      troughs.forEach((x, i) => els.push(point(`trough${i}`, [x, actual(x)], { label: 'Trough', labelDir: 's' })));
    }
    if (P.b(p, 'phases')) {
      const pk = peaks[0];
      const tr = troughs.find((x) => x > pk);
      if (pk !== undefined && tr !== undefined) {
        const q = pk + 0.25 * (tr - pk);
        els.push(text('recession', [q + 0.3, actual(q) + 0.4], 'Recession', { anchor: 'start', italic: true }));
      }
      const tr0 = troughs[0];
      const pk1 = peaks.find((x) => x > tr0);
      if (tr0 !== undefined && pk1 !== undefined) {
        const q = tr0 + 0.25 * (pk1 - tr0);
        els.push(text('expansion', [q + 0.35, actual(q) - 0.45], 'Expansion', { anchor: 'start', italic: true }));
      }
    }

    return {
      panels: [panel({ xLabel: 'Time', yLabel: 'Real GDP', elements: els })],
    };
  },
};

// ---------------------------------------------------------------------------
// AD/AS model

const adCurve: Template = {
  id: 'ad-curve',
  name: 'Aggregate demand (AD) curve',
  unit: 'macro',
  topic: TOPIC_ADAS,
  description:
    'AD slopes downward. A change in the average price level is a movement along AD; a change in C, I, G or (X − M) shifts the whole curve.',
  keywords: ['aggregate demand', 'AD', 'C + I + G + (X − M)', 'wealth effect', 'interest rate effect', 'trade effect', 'shift', 'movement along'],
  caption: 'Aggregate demand',
  controls: [
    select('mode', 'Show', [
      { value: 'move', label: 'Movement along AD (price level change)' },
      { value: 'inc', label: 'Increase in AD (shift right)' },
      { value: 'dec', label: 'Decrease in AD (shift left)' },
    ], 'inc'),
    slider('shift', 'Shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape', show: (p) => P.s(p, 'mode') !== 'move' }),
  ],
  build: (p) => {
    const mode = P.s(p, 'mode', 'inc');
    if (mode === 'move') {
      const ad = adLine(5, 5);
      const a = G.atY(ad, 7);
      const b = G.atY(ad, 3.5);
      return {
        panels: [
          mpanel([
            curve('ad', ad, 'AD', { role: 'demand' }),
            eqPoint('a', a, 'Y_1', 'PL_1', { label: 'A', labelDir: 'ne' }),
            eqPoint('b', b, 'Y_2', 'PL_2', { label: 'B', labelDir: 'ne' }),
            alongArrow('move', ad, 0.3, 0.65, 0.45),
          ]),
        ],
      };
    }
    const inc = mode === 'inc';
    const s = P.n(p, 'shift', 2);
    const ad1 = adLine(5 + (inc ? -s / 2 : s / 2), 5);
    const ad2 = adLine(5 + (inc ? s / 2 : -s / 2), 5);
    return {
      panels: [
        mpanel(
          [
            curve('ad1', ad1, 'AD_1', { role: 'demand' }),
            curve('ad2', ad2, 'AD_2', { role: 'demand' }),
            shift('shift', ad1, ad2, { t: 0.32 }),
            eqPoint('y1', G.atY(ad1, 5), 'Y_1', 'PL', { dot: true }),
            eqPoint('y2', G.atY(ad2, 5), 'Y_2', '', { dot: true }),
          ],
          {
            handles: [
              dragHandle('h-shift', G.pointAt(ad2, 0.6), 'x', 'shift', s, {
                min: 0.5,
                max: 3.5,
                scale: inc ? 2 : -2,
                hint: 'Drag to change the size of the shift',
              }),
            ],
          },
        ),
      ],
    };
  },
};

const srasShift: Template = {
  id: 'sras-shift',
  name: 'Shift in short-run aggregate supply (SRAS)',
  unit: 'macro',
  topic: TOPIC_ADAS,
  description:
    'A change in costs of production (wages, raw materials, energy), business taxes or subsidies shifts SRAS, changing the price level and real output.',
  keywords: ['SRAS', 'short-run aggregate supply', 'costs of production', 'supply shock', 'wages', 'oil prices'],
  caption: 'A change in short-run aggregate supply',
  controls: [
    select('dir', 'Change in SRAS', incDec('Increase (shift right)', 'Decrease (shift left)'), 'dec'),
    toggle('pointLabels', 'Label points E₁ and E₂', false),
    slider('shift', 'Shift size', 0.5, 3, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const inc = P.s(p, 'dir') === 'inc';
    const s = P.n(p, 'shift', 1.8) * (inc ? 1 : -1);
    const ad = adLine(5, 5);
    const s1 = srasLine(5, 5);
    const s2 = srasLine(5 + s, 5);
    const pl = P.b(p, 'pointLabels');
    return {
      panels: [
        mpanel(
          [
            curve('ad', ad, 'AD', { role: 'demand' }),
            curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
            curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
            shift('shift', s1, s2, { t: 0.75 }),
            eqPoint('e1', G.meet(ad, s1), 'Y_1', 'PL_1', { label: pl ? 'E_1' : undefined, labelDir: inc ? 'w' : 'e' }),
            eqPoint('e2', G.meet(ad, s2), 'Y_2', 'PL_2', { label: pl ? 'E_2' : undefined, labelDir: inc ? 'e' : 'w' }),
          ],
          {
            handles: [
              dragHandle('h-shift', G.pointAt(s2, 0.85), 'x', 'shift', Math.abs(s), {
                min: 0.5,
                max: 3,
                scale: inc ? 1 : -1,
                hint: 'Drag to change the size of the shift',
              }),
            ],
          },
        ),
      ],
    };
  },
};

const lrEquilibrium: Template = {
  id: 'ad-as-long-run-equilibrium',
  name: 'Long-run equilibrium (new classical / monetarist)',
  unit: 'macro',
  topic: TOPIC_ADAS,
  description:
    'In the new classical model the economy is in long-run equilibrium where AD and SRAS intersect on the vertical LRAS at potential output (Yp).',
  keywords: ['LRAS', 'long-run aggregate supply', 'monetarist', 'new classical', 'potential output', 'full employment', 'long-run equilibrium'],
  caption: 'Long-run macroeconomic equilibrium',
  controls: [toggle('pointLabel', 'Label equilibrium point (E)', false)],
  build: (p) => {
    const e: Vec = [5, 5];
    return {
      panels: [
        mpanel([
          curve('lras', lrasLine(5), 'LRAS', { role: 'long-run' }),
          curve('ad', adLine(5, 5), 'AD', { role: 'demand' }),
          curve('sras', srasLine(5, 5), 'SRAS', { role: 'supply' }),
          eqPoint('e', e, 'Y_p', 'PL_e', { label: P.b(p, 'pointLabel') ? 'E' : undefined, labelDir: 'e' }),
        ]),
      ],
    };
  },
};

/** AD lines for the three Keynesian ranges. */
function keynesADs(k: KAS) {
  const flatE: Vec = [k.x1 * 0.35, k.p0];
  const midE = kasAt(k, 0.55);
  const vertE: Vec = [k.yfe, k.p0 + k.h + 1.7];
  return {
    flat: { e: flatE, ad: adLine(flatE[0], flatE[1]) },
    mid: { e: midE, ad: adLine(midE[0], midE[1]) },
    vert: { e: vertE, ad: adLine(vertE[0], vertE[1]) },
  };
}

const keynesianAS: Template = {
  id: 'keynesian-as',
  name: 'Keynesian aggregate supply curve',
  unit: 'macro',
  topic: TOPIC_ADAS,
  description:
    'The Keynesian AS curve is horizontal when there is spare capacity, slopes upward as bottlenecks appear, and becomes vertical at full-employment output (Yfe).',
  keywords: ['Keynesian AS', 'spare capacity', 'full employment', 'Yfe', 'deflationary gap', 'bottlenecks', 'three ranges'],
  caption: 'The Keynesian aggregate supply curve',
  controls: [
    select('ad', 'Show AD', [
      { value: 'none', label: 'No AD curve' },
      { value: 'flat', label: 'In the horizontal range' },
      { value: 'mid', label: 'In the upward-sloping range' },
      { value: 'vert', label: 'In the vertical range' },
      { value: 'all', label: 'All three ranges' },
    ], 'all'),
    toggle('ranges', 'Label the three ranges', true),
  ],
  build: (p) => {
    const k = KAS0;
    const as = keynesAS(k);
    const which = P.s(p, 'ad', 'all');
    const ads = keynesADs(k);
    const els: El[] = [];
    const show = (key: 'flat' | 'mid' | 'vert', i: number, many: boolean) => {
      const { e, ad } = ads[key];
      const n = many ? `_${i}` : '';
      els.push(
        curve(`ad-${key}`, ad, `AD${n}`, { role: 'demand' }),
        eqPoint(`e-${key}`, e, key === 'vert' ? 'Y_{fe}' : `Y${n || '_1'}`, `PL${n || '_1'}`),
      );
    };
    if (which === 'all') {
      show('flat', 1, true);
      show('mid', 2, true);
      show('vert', 3, true);
    } else if (which !== 'none') {
      show(which as 'flat' | 'mid' | 'vert', 1, false);
    }
    if (which !== 'vert' && which !== 'all') els.push(tick('yfe', 'x', k.yfe, 'Y_{fe}'));
    if (P.b(p, 'ranges')) {
      const y = 0.45;
      els.push(
        text('r1', [(ads.flat.e[0] + k.x1) / 2, y], 'spare capacity', { italic: true, muted: true, size: 0.8 }),
        text('r2', [(k.x1 + k.yfe) / 2, y], 'bottlenecks', { italic: true, muted: true, size: 0.8 }),
        text('r3', [k.yfe + 0.25, y], 'full capacity', { italic: true, muted: true, size: 0.8, anchor: 'start' }),
      );
    }
    els.push(curve('as', as, 'AS', { role: 'supply' }));
    return { panels: [mpanel(els)] };
  },
};

const keynesianADIncrease: Template = {
  id: 'keynesian-ad-increase',
  name: 'Increase in AD in the Keynesian model',
  unit: 'macro',
  topic: TOPIC_ADAS,
  description:
    'The effect of higher AD depends on where the economy is: output rises with no inflation in the horizontal range, both rise in the upward range, and only the price level rises at Yfe.',
  keywords: ['Keynesian', 'increase in AD', 'spare capacity', 'inflation', 'full employment', 'Yfe'],
  caption: 'An increase in AD in the Keynesian model',
  controls: [
    select('range', 'Where AD increases', [
      { value: 'flat', label: 'Horizontal range (spare capacity)' },
      { value: 'mid', label: 'Upward-sloping range' },
      { value: 'vert', label: 'Vertical range (full employment)' },
    ], 'mid'),
    slider('shift', 'Shift size', 0.6, 2.5, 0.1, 1.4, { group: 'Shape' }),
  ],
  build: (p) => {
    const k = KAS0;
    const as = keynesAS(k);
    const range = P.s(p, 'range', 'mid');
    const s = P.n(p, 'shift', 1.4);
    const start: Vec =
      range === 'flat' ? [k.x1 * 0.4, k.p0] : range === 'mid' ? kasAt(k, 0.3) : [k.yfe, k.p0 + k.h + 0.6];
    const ad1 = adLine(start[0], start[1]);
    const ad2 = adLine(start[0] + s, start[1]);
    const e1 = G.meet(ad1, as);
    const e2 = G.meet(ad2, as);
    const sameP = Math.abs(e2[1] - e1[1]) < 0.02;
    const sameY = Math.abs(e2[0] - e1[0]) < 0.02;
    return {
      panels: [
        mpanel(
          [
            curve('as', as, 'AS', { role: 'supply' }),
            curve('ad1', ad1, 'AD_1', { role: 'demand' }),
            curve('ad2', ad2, 'AD_2', { role: 'demand' }),
            shift('shift', ad1, ad2, { t: 0.25 }),
            eqPoint('e1', e1, sameY ? 'Y_{fe}' : 'Y_1', sameP ? 'PL_1 = PL_2' : 'PL_1'),
            eqPoint('e2', e2, sameY ? '' : 'Y_2', sameP ? '' : 'PL_2'),
            ...when(range !== 'vert', tick('yfe', 'x', k.yfe, 'Y_{fe}')),
          ],
          {
            handles: [
              dragHandle('h-shift', G.pointAt(ad2, 0.2), 'x', 'shift', s, {
                min: 0.6,
                max: 2.5,
                hint: 'Drag to change the size of the AD increase',
              }),
            ],
          },
        ),
      ],
    };
  },
};

type GapResponse = 'none' | 'self' | 'policy';
const responseOptions = [
  { value: 'none', label: 'No adjustment shown' },
  { value: 'self', label: 'Long-run self-correction (SRAS shifts)' },
  { value: 'policy', label: 'Policy response (AD shifts)' },
];

function ncGap(kind: 'recessionary' | 'inflationary'): Template {
  const rec = kind === 'recessionary';
  return {
    id: rec ? 'recessionary-gap-nc' : 'inflationary-gap-nc',
    name: rec ? 'Recessionary (deflationary) gap — new classical' : 'Inflationary gap — new classical',
    unit: 'macro',
    topic: TOPIC_ADAS,
    description: rec
      ? 'Short-run equilibrium below potential output. In the long run, falling wages shift SRAS right back to Yp; alternatively expansionary policy shifts AD right.'
      : 'Short-run equilibrium beyond potential output. In the long run, rising wages shift SRAS left back to Yp; alternatively contractionary policy shifts AD left.',
    keywords: rec
      ? ['recessionary gap', 'deflationary gap', 'negative output gap', 'self-correction', 'new classical', 'monetarist', 'unemployment']
      : ['inflationary gap', 'positive output gap', 'overheating', 'self-correction', 'new classical', 'monetarist', 'wage-price'],
    caption: rec ? 'A recessionary gap (new classical model)' : 'An inflationary gap (new classical model)',
    controls: [
      select('response', 'Adjustment', responseOptions, 'none'),
      toggle('gap', 'Show the output gap', true),
      slider('size', 'Size of the gap', 0.8, 3, 0.1, 2, { group: 'Shape' }),
    ],
    build: (p) => {
      const size = P.n(p, 'size', 2);
      const resp = P.s(p, 'response', 'none') as GapResponse;
      const yp = rec ? 6.3 : 4.2;
      const y1 = rec ? yp - size : yp + size;
      const e1: Vec = [y1, rec ? 4.4 : 5.6];
      const ad1 = adLine(e1[0], e1[1]);
      const s1 = srasLine(e1[0], e1[1]);
      const els: El[] = [curve('lras', lrasLine(yp), 'LRAS', { role: 'long-run' })];
      if (resp === 'self') {
        const e2: Vec = [yp, G.yAt(ad1, yp)];
        const s2 = srasLine(e2[0], e2[1]);
        els.push(
          curve('ad', ad1, 'AD', { role: 'demand' }),
          curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
          curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
          shift('shift', s1, s2, { t: 0.78 }),
          eqPoint('e1', e1, 'Y_1', 'PL_1'),
          eqPoint('e2', e2, 'Y_p', 'PL_2'),
        );
      } else if (resp === 'policy') {
        const e2: Vec = [yp, G.yAt(s1, yp)];
        const ad2 = adLine(e2[0], e2[1]);
        els.push(
          curve('ad1', ad1, 'AD_1', { role: 'demand' }),
          curve('ad2', ad2, 'AD_2', { role: 'demand' }),
          curve('sras', s1, 'SRAS', { role: 'supply' }),
          shift('shift', ad1, ad2, { t: 0.22 }),
          eqPoint('e1', e1, 'Y_1', 'PL_1'),
          eqPoint('e2', e2, 'Y_p', 'PL_2'),
        );
      } else {
        els.push(
          curve('ad', ad1, 'AD', { role: 'demand' }),
          curve('sras', s1, 'SRAS', { role: 'supply' }),
          eqPoint('e1', e1, 'Y_1', 'PL_1'),
          tick('yp', 'x', yp, 'Y_p'),
        );
      }
      if (P.b(p, 'gap')) {
        els.push(measure('gap', [Math.min(y1, yp), 0.5], [Math.max(y1, yp), 0.5], rec ? 'recessionary gap' : 'inflationary gap'));
      }
      return { panels: [mpanel(els)] };
    },
  };
}

function keynesianGap(kind: 'recessionary' | 'inflationary'): Template {
  const rec = kind === 'recessionary';
  return {
    id: rec ? 'recessionary-gap-keynesian' : 'inflationary-gap-keynesian',
    name: rec ? 'Recessionary (deflationary) gap — Keynesian' : 'Inflationary gap — Keynesian',
    unit: 'macro',
    topic: TOPIC_ADAS,
    description: rec
      ? 'AD intersects the Keynesian AS below full-employment output; with sticky wages the economy can remain stuck there unless AD increases.'
      : 'AD rises beyond the level needed for full employment; output cannot rise past Yfe so the excess demand only raises the price level.',
    keywords: rec
      ? ['recessionary gap', 'deflationary gap', 'Keynesian', 'spare capacity', 'demand-deficient unemployment', 'Yfe']
      : ['inflationary gap', 'Keynesian', 'full employment', 'demand-pull inflation', 'Yfe', 'excess demand'],
    caption: rec ? 'A recessionary gap (Keynesian model)' : 'An inflationary gap (Keynesian model)',
    controls: rec
      ? [
          select('pos', 'Equilibrium in', [
            { value: 'flat', label: 'Horizontal range' },
            { value: 'mid', label: 'Upward-sloping range' },
          ], 'flat'),
          toggle('policy', 'Show AD increase to full employment', false),
          toggle('gap', 'Show the recessionary gap', true),
        ]
      : [toggle('gap', 'Show the inflationary gap', true), slider('size', 'Excess demand', 0.8, 2.4, 0.1, 1.8, { group: 'Shape' })],
    build: (p) => {
      if (rec) {
        const k = KAS0;
        const as = keynesAS(k);
        const e1: Vec = P.s(p, 'pos') === 'mid' ? kasAt(k, 0.35) : [k.x1 * 0.55, k.p0];
        const adK = (x: number, y: number) => sdLine([x, y], -0.8, { yLo: k.p0 - 0.9 });
        const ad1 = adK(e1[0], e1[1]);
        const kink: Vec = [k.yfe, k.p0 + k.h];
        const policy = P.b(p, 'policy');
        const els: El[] = [
          curve('as', as, 'AS', { role: 'supply' }),
          curve('ad1', ad1, policy ? 'AD_1' : 'AD', { role: 'demand' }),
          eqPoint('e1', e1, 'Y_1', policy ? 'PL_1' : 'PL'),
        ];
        if (policy) {
          const ad2 = adK(kink[0], kink[1]);
          els.push(
            curve('ad2', ad2, 'AD_2', { role: 'demand' }),
            shift('shift', ad1, ad2, { t: 0.2 }),
            eqPoint('e2', kink, 'Y_{fe}', 'PL_2'),
          );
        } else {
          els.push(tick('yfe', 'x', k.yfe, 'Y_{fe}'));
        }
        if (P.b(p, 'gap')) els.push(measure('gap', [e1[0], 0.5], [k.yfe, 0.5], 'recessionary gap'));
        return { panels: [mpanel(els)] };
      }
      const k: KAS = { p0: 2.6, x1: 2.8, yfe: 6.4, h: 2.8 };
      const as = keynesAS(k);
      const size = P.n(p, 'size', 1.8);
      const kink: Vec = [k.yfe, k.p0 + k.h];
      const ad1 = adLine(kink[0], kink[1]);
      const ad2 = adLine(kink[0] + size, kink[1]);
      const e2 = G.meet(ad2, as);
      const els: El[] = [
        curve('as', as, 'AS', { role: 'supply' }),
        curve('ad1', ad1, 'AD_1', { role: 'demand' }),
        curve('ad2', ad2, 'AD_2', { role: 'demand' }),
        shift('shift', ad1, ad2, { t: 0.2 }),
        eqPoint('e1', kink, 'Y_{fe}', 'PL_1'),
        eqPoint('e2', e2, '', 'PL_2'),
      ];
      if (P.b(p, 'gap')) {
        const target: Vec = [kink[0] + size, kink[1]];
        els.push(
          guide('pl1-ext', kink, target),
          point('target', target, { dot: true }),
          measure('gap', [kink[0], kink[1] - 0.45], [target[0], kink[1] - 0.45], 'inflationary gap', { labelDir: 's' }),
        );
      }
      return { panels: [mpanel(els)] };
    },
  };
}

// ---------------------------------------------------------------------------
// Inflation & deflation

const demandPull: Template = {
  id: 'demand-pull-inflation',
  name: 'Demand-pull inflation',
  unit: 'macro',
  topic: TOPIC_INFL,
  description: 'An increase in AD pulls up the average price level (and, in the short run, real GDP).',
  keywords: ['demand-pull inflation', 'inflation', 'increase in AD', 'excess demand', 'overheating'],
  caption: 'Demand-pull inflation',
  controls: [
    select('model', 'Model', [
      { value: 'nc', label: 'New classical (SRAS)' },
      { value: 'keynesian', label: 'Keynesian AS' },
    ], 'nc'),
    toggle('lras', 'Show LRAS', false, { show: (p) => P.s(p, 'model') !== 'keynesian' }),
    slider('shift', 'Size of AD increase', 0.8, 3, 0.1, 2, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 2);
    if (P.s(p, 'model') === 'keynesian') {
      const k = KAS0;
      const as = keynesAS(k);
      const start = kasAt(k, 0.45);
      const ad1 = adLine(start[0], start[1]);
      const ad2 = adLine(start[0] + s, start[1]);
      return {
        panels: [
          mpanel([
            curve('as', as, 'AS', { role: 'supply' }),
            curve('ad1', ad1, 'AD_1', { role: 'demand' }),
            curve('ad2', ad2, 'AD_2', { role: 'demand' }),
            shift('shift', ad1, ad2, { t: 0.22 }),
            eqPoint('e1', G.meet(ad1, as), 'Y_1', 'PL_1'),
            eqPoint('e2', G.meet(ad2, as), 'Y_2', 'PL_2'),
          ]),
        ],
      };
    }
    const ad1 = adLine(5 - s / 2, 5);
    const ad2 = adLine(5 + s / 2, 5);
    const sr = srasLine(5, 5);
    const e1 = G.meet(ad1, sr);
    return {
      panels: [
        mpanel([
          ...when(P.b(p, 'lras'), curve('lras', lrasLine(e1[0]), 'LRAS', { role: 'long-run' })),
          curve('ad1', ad1, 'AD_1', { role: 'demand' }),
          curve('ad2', ad2, 'AD_2', { role: 'demand' }),
          curve('sras', sr, 'SRAS', { role: 'supply' }),
          shift('shift', ad1, ad2, { t: 0.25 }),
          eqPoint('e1', e1, P.b(p, 'lras') ? 'Y_p' : 'Y_1', 'PL_1'),
          eqPoint('e2', G.meet(ad2, sr), 'Y_2', 'PL_2'),
        ]),
      ],
    };
  },
};

const costPush: Template = {
  id: 'cost-push-inflation',
  name: 'Cost-push inflation (stagflation)',
  unit: 'macro',
  topic: TOPIC_INFL,
  description:
    'Higher costs of production (e.g. oil prices, wages) shift SRAS left: the price level rises while real GDP falls — stagflation.',
  keywords: ['cost-push inflation', 'stagflation', 'supply shock', 'SRAS decrease', 'oil prices', 'wage-price spiral'],
  caption: 'Cost-push inflation',
  controls: [
    toggle('lras', 'Show LRAS', true),
    slider('shift', 'Size of SRAS decrease', 0.8, 3, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 1.8);
    const ad = adLine(5, 5);
    const s1 = srasLine(5, 5);
    const s2 = srasLine(5 - s, 5);
    const lras = P.b(p, 'lras');
    return {
      panels: [
        mpanel([
          ...when(lras, curve('lras', lrasLine(5), 'LRAS', { role: 'long-run' })),
          curve('ad', ad, 'AD', { role: 'demand' }),
          curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
          curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
          shift('shift', s1, s2, { t: 0.78 }),
          eqPoint('e1', G.meet(ad, s1), lras ? 'Y_p' : 'Y_1', 'PL_1'),
          eqPoint('e2', G.meet(ad, s2), 'Y_2', 'PL_2'),
        ]),
      ],
    };
  },
};

const deflation: Template = {
  id: 'deflation',
  name: 'Deflation: "good" vs "bad"',
  unit: 'macro',
  topic: TOPIC_INFL,
  description:
    '"Good" deflation comes from rising aggregate supply (output rises); "bad" deflation comes from falling aggregate demand (output and employment fall).',
  keywords: ['deflation', 'good deflation', 'bad deflation', 'falling price level', 'productivity', 'fall in AD', 'deflationary spiral'],
  caption: 'Deflation',
  controls: [
    select('type', 'Type of deflation', [
      { value: 'good', label: '"Good" — increase in AS' },
      { value: 'bad', label: '"Bad" — decrease in AD' },
    ], 'good'),
    toggle('lras', 'Show LRAS', true),
    slider('shift', 'Shift size', 1, 3, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 1.8);
    const good = P.s(p, 'type') !== 'bad';
    const lras = P.b(p, 'lras');
    const e1: Vec = [good ? 4 : 5.5, 5.2];
    const ad1 = adLine(e1[0], e1[1]);
    const s1 = srasLine(e1[0], e1[1]);
    if (good) {
      const e2: Vec = [e1[0] + s, G.yAt(ad1, e1[0] + s)];
      const s2 = srasLine(e2[0], e2[1]);
      return {
        panels: [
          mpanel([
            ...when(
              lras,
              curve('lras1', lrasLine(e1[0]), 'LRAS_1', { role: 'long-run' }),
              curve('lras2', lrasLine(e2[0]), 'LRAS_2', { role: 'long-run' }),
            ),
            curve('ad', ad1, 'AD', { role: 'demand' }),
            curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
            curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
            shift('shift', s1, s2, { t: 0.78 }),
            eqPoint('e1', e1, 'Y_1', 'PL_1'),
            eqPoint('e2', e2, 'Y_2', 'PL_2'),
          ]),
        ],
      };
    }
    const ad2 = adLine(e1[0] - s, e1[1]);
    return {
      panels: [
        mpanel([
          ...when(lras, curve('lras', lrasLine(e1[0]), 'LRAS', { role: 'long-run' })),
          curve('ad1', ad1, 'AD_1', { role: 'demand' }),
          curve('ad2', ad2, 'AD_2', { role: 'demand' }),
          curve('sras', s1, 'SRAS', { role: 'supply' }),
          shift('shift', ad1, ad2, { t: 0.3 }),
          eqPoint('e1', e1, lras ? 'Y_p' : 'Y_1', 'PL_1'),
          eqPoint('e2', G.meet(ad2, s1), 'Y_2', 'PL_2'),
        ]),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Unemployment (labour markets)

const naturalRate: Template = {
  id: 'natural-rate-unemployment',
  name: 'Natural rate of unemployment',
  unit: 'macro',
  topic: TOPIC_UNEMP,
  description:
    'At the equilibrium real wage some of the labour force is still unemployed (frictional, structural and seasonal): the gap between the labour force (LF) and those willing and able to work at that wage (ASL).',
  keywords: ['natural rate of unemployment', 'NRU', 'labour force', 'ASL', 'ADL', 'frictional', 'structural', 'seasonal', 'full employment'],
  caption: 'The natural rate of unemployment',
  controls: [toggle('nru', 'Show the natural rate of unemployment', true)],
  build: (p) => {
    const adl = sdLine([5, 5], -0.9);
    const asl = sdLine([5, 5], 1.4);
    const lf = sdLine([7.9, 5], 3);
    const we = G.meet(adl, asl);
    const nf = G.atY(lf, we[1]);
    return {
      panels: [
        lpanel([
          curve('adl', adl, 'AD_L', { role: 'demand' }),
          curve('asl', asl, 'AS_L', { role: 'supply' }),
          curve('lf', lf, 'LF', { role: 'long-run' }),
          eqPoint('e', we, 'Q_e', 'W_e'),
          point('f', nf, { xLabel: 'Q_{LF}' }),
          guide('wline', we, nf),
          ...when(
            P.b(p, 'nru'),
            measure('nru', [we[0], we[1] + 0.5], [nf[0], we[1] + 0.5], 'NRU', { labelDir: 'n' }),
          ),
        ]),
      ],
    };
  },
};

const demandDeficient: Template = {
  id: 'demand-deficient-unemployment',
  name: 'Demand-deficient (cyclical) unemployment',
  unit: 'macro',
  topic: TOPIC_UNEMP,
  description:
    'A fall in AD reduces real GDP below potential; firms need fewer workers and, with sticky wages, the demand for labour falls below the supply of labour.',
  keywords: ['demand-deficient unemployment', 'cyclical unemployment', 'Keynesian unemployment', 'recession', 'sticky wages', 'fall in AD'],
  caption: 'Demand-deficient (cyclical) unemployment',
  controls: [
    select('view', 'Show', [
      { value: 'adas', label: 'AD/AS diagram' },
      { value: 'labour', label: 'Labour market (sticky wages)' },
      { value: 'both', label: 'Both side by side' },
    ], 'both'),
    slider('shift', 'Fall in demand', 0.8, 2.6, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const view = P.s(p, 'view', 'both');
    const s = P.n(p, 'shift', 1.8);
    const panels: Panel[] = [];
    if (view !== 'labour') {
      const ad1 = adLine(5.5, 5);
      const ad2 = adLine(5.5 - s, 5);
      const sr = srasLine(5.5, 5);
      panels.push(
        mpanel(
          [
            curve('lras', lrasLine(5.5), 'LRAS', { role: 'long-run' }),
            curve('ad1', ad1, 'AD_1', { role: 'demand' }),
            curve('ad2', ad2, 'AD_2', { role: 'demand' }),
            curve('sras', sr, 'SRAS', { role: 'supply' }),
            shift('shift', ad1, ad2, { t: 0.3 }),
            eqPoint('e1', [5.5, 5], 'Y_p', 'PL_1'),
            eqPoint('e2', G.meet(ad2, sr), 'Y_2', 'PL_2'),
          ],
          { id: 'adas', title: view === 'both' ? 'Economy (AD/AS)' : undefined },
        ),
      );
    }
    if (view !== 'adas') {
      const asl = sdLine([5.5, 5], 1);
      const adl1 = sdLine([5.5, 5], -0.9);
      const adl2 = sdLine([5.5 - s, 5], -0.9);
      const q2 = G.atY(adl2, 5);
      panels.push(
        lpanel(
          [
            curve('asl', asl, 'AS_L', { role: 'supply' }),
            curve('adl1', adl1, 'AD_{L1}', { role: 'demand' }),
            curve('adl2', adl2, 'AD_{L2}', { role: 'demand' }),
            shift('shift', adl1, adl2, { t: 0.3 }),
            eqPoint('e1', [5.5, 5], 'Q_1', 'W_1'),
            point('q2', q2, { xLabel: 'Q_2' }),
            measure('u', [q2[0], 5.5], [5.5, 5.5], 'unemployment', { labelDir: 'n' }),
          ],
          { id: 'labour', title: view === 'both' ? 'Labour market' : undefined },
        ),
      );
    }
    return { panels, layout: 'row' };
  },
};

const realWage: Template = {
  id: 'real-wage-unemployment',
  name: 'Real-wage (classical) unemployment',
  unit: 'macro',
  topic: TOPIC_UNEMP,
  description:
    'If the real wage is held above equilibrium (e.g. by a minimum wage or trade unions), the quantity of labour supplied exceeds the quantity demanded.',
  keywords: ['real-wage unemployment', 'classical unemployment', 'disequilibrium unemployment', 'minimum wage', 'trade unions', 'excess supply of labour'],
  caption: 'Real-wage (classical) unemployment',
  controls: [
    toggle('eq', 'Show the equilibrium wage', true),
    slider('wage', 'Wage above equilibrium', 0.8, 3.5, 0.1, 2, { group: 'Shape' }),
  ],
  build: (p) => {
    const w = P.n(p, 'wage', 2);
    const adl = sdLine([5, 5], -0.9);
    const asl = sdLine([5, 5], 1);
    const w1 = 5 + w;
    const qd = G.atY(adl, w1);
    const qs = G.atY(asl, w1);
    return {
      panels: [
        lpanel(
          [
            curve('adl', adl, 'AD_L', { role: 'demand' }),
            curve('asl', asl, 'AS_L', { role: 'supply' }),
            ...when(P.b(p, 'eq'), eqPoint('e', [5, 5], 'Q_e', 'W_e')),
            guide('wline', [0, w1], [qs[0] + 0.5, w1]),
            tick('w1', 'y', w1, 'W_1'),
            point('qd', qd, { xLabel: 'Q_d' }),
            point('qs', qs, { xLabel: 'Q_s' }),
            measure('u', [qd[0], w1 + 0.5], [qs[0], w1 + 0.5], 'unemployment', { labelDir: 'n' }),
          ],
          {
            handles: [
              dragHandle('h-wage', [qs[0] + 0.5, w1], 'y', 'wage', w, { min: 0.8, max: 3.5, hint: 'Drag to change the real wage' }),
            ],
          },
        ),
      ],
    };
  },
};

const structural: Template = {
  id: 'structural-unemployment',
  name: 'Structural unemployment',
  unit: 'macro',
  topic: TOPIC_UNEMP,
  description:
    'Demand for labour falls in a declining industry. Workers who lack the skills (or mobility) to move into growing industries become structurally unemployed.',
  keywords: ['structural unemployment', 'declining industry', 'occupational immobility', 'geographical immobility', 'skills mismatch', 'labour market'],
  caption: 'Structural unemployment',
  controls: [
    select('view', 'Show', [
      { value: 'declining', label: 'Declining industry only' },
      { value: 'both', label: 'Declining and growing industries' },
    ], 'declining'),
    toggle('sticky', 'Wages do not fall (show unemployment)', true),
    slider('shift', 'Fall in labour demand', 0.8, 2.6, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 1.8);
    const both = P.s(p, 'view') === 'both';
    const sticky = P.b(p, 'sticky');
    const asl = sdLine([5.5, 5], 1);
    const adl1 = sdLine([5.5, 5], -0.9);
    const adl2 = sdLine([5.5 - s, 5], -0.9);
    const els: El[] = [
      curve('asl', asl, 'AS_L', { role: 'supply' }),
      curve('adl1', adl1, 'AD_{L1}', { role: 'demand' }),
      curve('adl2', adl2, 'AD_{L2}', { role: 'demand' }),
      shift('shift', adl1, adl2, { t: 0.3 }),
      eqPoint('e1', [5.5, 5], 'Q_1', 'W_1'),
    ];
    if (sticky) {
      const q2 = G.atY(adl2, 5);
      els.push(
        point('q2', q2, { xLabel: 'Q_2' }),
        measure('u', [q2[0], 5.5], [5.5, 5.5], 'structural unemployment', { labelDir: 'n' }),
      );
    } else {
      els.push(eqPoint('e2', G.meet(adl2, asl), 'Q_2', 'W_2'));
    }
    const panels: Panel[] = [lpanel(els, { id: 'declining', title: both ? 'Declining industry' : undefined })];
    if (both) {
      const gasl = sdLine([4.5, 5], 2.2);
      const gadl1 = sdLine([4.5, 5], -0.9);
      const gadl2 = sdLine([4.5 + s, 5], -0.9);
      panels.push(
        lpanel(
          [
            curve('asl', gasl, 'AS_L', { role: 'supply' }),
            curve('adl1', gadl1, 'AD_{L1}', { role: 'demand' }),
            curve('adl2', gadl2, 'AD_{L2}', { role: 'demand' }),
            shift('shift', gadl1, gadl2, { t: 0.3 }),
            eqPoint('e1', [4.5, 5], 'Q_1', 'W_1'),
            eqPoint('e2', G.meet(gadl2, gasl), 'Q_2', 'W_2'),
          ],
          { id: 'growing', title: 'Growing industry' },
        ),
      );
    }
    return { panels, layout: 'row' };
  },
};

// ---------------------------------------------------------------------------
// Phillips curve (HL)

const PHILLIPS_AXES = { xLabel: 'Unemployment rate (%)', yLabel: 'Inflation rate (%)' };
/** Convex short-run Phillips curve, shifted vertically by `dy`. */
const srpc = (dy = 0, k = 8) => G.fn((u) => k / u + dy, 0.6, 9.4, 220).filter(([, y]) => y <= 9.5 && y >= 0.2);

const shortRunPhillips: Template = {
  id: 'short-run-phillips-curve',
  name: 'Short-run Phillips curve',
  unit: 'macro',
  topic: TOPIC_PHILLIPS,
  hl: true,
  description:
    'The SRPC shows a short-run trade-off: lower unemployment comes with higher inflation. A supply shock shifts the SRPC outward (stagflation).',
  keywords: ['Phillips curve', 'SRPC', 'trade-off', 'inflation', 'unemployment', 'stagflation', 'supply shock'],
  caption: 'The short-run Phillips curve',
  controls: [
    select('move', 'Movement along the SRPC', [
      { value: 'none', label: 'None' },
      { value: 'expansion', label: 'Increase in AD (A → B)' },
      { value: 'contraction', label: 'Decrease in AD (B → A)' },
    ], 'expansion'),
    toggle('shift', 'Show SRPC shift (supply shock)', false),
  ],
  build: (p) => {
    const move = P.s(p, 'move', 'expansion');
    const shifted = P.b(p, 'shift');
    const c1 = srpc(0);
    const els: El[] = [curve('srpc1', c1, shifted ? 'SRPC_1' : 'SRPC', { role: 'demand' })];
    if (shifted) {
      const c2 = srpc(2);
      els.push(curve('srpc2', c2, 'SRPC_2', { role: 'demand' }), shift('shift', c1, c2, { t: 0.62, mode: 'perp' }));
    }
    if (move !== 'none') {
      const a: Vec = [5.5, 8 / 5.5];
      const b: Vec = [2.6, 8 / 2.6];
      const [from, to] = move === 'expansion' ? [a, b] : [b, a];
      els.push(
        eqPoint('a', a, 'U_1', 'π_1', { label: 'A', labelDir: 'ne' }),
        eqPoint('b', b, 'U_2', 'π_2', { label: 'B', labelDir: 'ne' }),
        arrow('move', [from[0] + (move === 'expansion' ? 0.1 : 0.35), from[1] + 0.55], [to[0] + (move === 'expansion' ? 0.35 : 0.1), to[1] + 0.55], {
          bend: move === 'expansion' ? -0.15 : 0.15,
        }),
      );
    }
    return { panels: [panel({ ...PHILLIPS_AXES, elements: els })] };
  },
};

const longRunPhillips: Template = {
  id: 'long-run-phillips-curve',
  name: 'Long-run Phillips curve (expectations)',
  unit: 'macro',
  topic: TOPIC_PHILLIPS,
  hl: true,
  description:
    'Reducing unemployment below the natural rate (A → B) raises inflation; as expectations adjust the SRPC shifts up and unemployment returns to the NRU at higher inflation (B → C). The LRPC is vertical at the NRU.',
  keywords: ['long-run Phillips curve', 'LRPC', 'NRU', 'natural rate of unemployment', 'expectations-augmented', 'adaptive expectations', 'accelerating inflation', 'monetarist'],
  caption: 'The long-run Phillips curve',
  controls: [
    toggle('path', 'Show the adjustment path A → B → C', true),
    toggle('repeat', 'Repeat the attempt (C → D → E)', false),
  ],
  build: (p) => {
    const nru = 5.2;
    const u1 = 3;
    const pi1 = 1.8;
    const k = 6;
    const base = pi1 - k / nru;
    const f1 = (u: number) => k / u + base;
    const d = f1(u1) - pi1; // vertical shift per round of expectations adjustment
    const repeat = P.b(p, 'repeat');
    const path = P.b(p, 'path');
    const c1 = srpc(base, k);
    const c2 = srpc(base + d, k);
    const A: Vec = [nru, pi1];
    const B: Vec = [u1, pi1 + d];
    const C: Vec = [nru, pi1 + d];
    const els: El[] = [
      curve('lrpc', G.vline(nru, 0, 9.3), 'LRPC', { role: 'long-run' }),
      curve('srpc1', c1, 'SRPC_1', { role: 'demand' }),
      curve('srpc2', c2, 'SRPC_2', { role: 'demand' }),
      eqPoint('a', A, 'NRU', 'π_1', { label: path ? 'A' : undefined, labelDir: 'e' }),
      point('b', B, { xLabel: 'U_1', label: path ? 'B' : undefined, labelDir: 'sw' }),
      point('c', C, { yLabel: 'π_2', label: path ? 'C' : undefined, labelDir: 'e' }),
    ];
    if (path) {
      els.push(
        arrow('ab', [A[0] - 0.3, A[1] + 0.25], [B[0] + 0.35, B[1] - 0.2], { bend: -0.12 }),
        arrow('bc', [B[0] + 0.3, B[1] + 0.3], [C[0] - 0.3, C[1] + 0.3]),
      );
    }
    if (repeat) {
      const D: Vec = [u1, pi1 + 2 * d];
      const E: Vec = [nru, pi1 + 2 * d];
      els.push(
        curve('srpc3', srpc(base + 2 * d, k), 'SRPC_3', { role: 'demand' }),
        point('d', D, { label: path ? 'D' : undefined, labelDir: 'sw' }),
        point('e', E, { yLabel: 'π_3', label: path ? 'E' : undefined, labelDir: 'e' }),
      );
      if (path) {
        els.push(
          arrow('cd', [C[0] - 0.3, C[1] + 0.25], [D[0] + 0.35, D[1] - 0.2], { bend: -0.12 }),
          arrow('de', [D[0] + 0.3, D[1] + 0.3], [E[0] - 0.3, E[1] + 0.3]),
        );
      }
    }
    return { panels: [panel({ ...PHILLIPS_AXES, elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Monetary & fiscal policy

const moneyMarket: Template = {
  id: 'money-market',
  name: 'Money market (interest rate determination)',
  unit: 'macro',
  topic: TOPIC_POLICY,
  description:
    'The central bank fixes the money supply (vertical Sm). Equilibrium interest rate is where it meets money demand; increasing the money supply lowers the interest rate.',
  keywords: ['money market', 'money supply', 'money demand', 'interest rate', 'central bank', 'monetary policy', 'open market operations'],
  caption: 'Equilibrium in the money market',
  controls: [
    select('change', 'Monetary policy', [
      { value: 'none', label: 'No change' },
      { value: 'exp', label: 'Expansionary (money supply increases)' },
      { value: 'con', label: 'Contractionary (money supply decreases)' },
    ], 'exp'),
    slider('shift', 'Change in money supply', 0.8, 2.5, 0.1, 1.6, { group: 'Shape', show: (p) => P.s(p, 'change') !== 'none' }),
  ],
  build: (p) => {
    const change = P.s(p, 'change', 'exp');
    const s = P.n(p, 'shift', 1.6);
    const dm = sdLine([5, 5], -0.95, { yLo: 0.8 });
    const m1 = 5;
    const sm1 = G.vline(m1, 0, 9.3);
    const els: El[] = [curve('dm', dm, 'D_m', { role: 'demand' })];
    if (change === 'none') {
      els.push(curve('sm', sm1, 'S_m', { role: 'supply' }), eqPoint('e', G.meet(dm, sm1), 'M', 'i_e'));
    } else {
      const m2 = m1 + (change === 'exp' ? s : -s);
      const sm2 = G.vline(m2, 0, 9.3);
      els.push(
        curve('sm1', sm1, 'S_{m1}', { role: 'supply' }),
        curve('sm2', sm2, 'S_{m2}', { role: 'supply' }),
        arrow('shift', [m1 + (m2 > m1 ? 0.15 : -0.15), 8.2], [m2 + (m2 > m1 ? -0.15 : 0.15), 8.2]),
        eqPoint('e1', G.meet(dm, sm1), 'M_1', 'i_1'),
        eqPoint('e2', G.meet(dm, sm2), 'M_2', 'i_2'),
      );
    }
    return {
      panels: [panel({ xLabel: 'Quantity of money', yLabel: 'Interest rate', elements: els })],
    };
  },
};

const POLICY_NOTES: Record<string, { exp: boolean; note: string }> = {
  'exp-fiscal': { exp: true, note: '↑G and/or ↓T' },
  'exp-monetary': { exp: true, note: '↓ interest rates' },
  'con-fiscal': { exp: false, note: '↓G and/or ↑T' },
  'con-monetary': { exp: false, note: '↑ interest rates' },
};

const adPolicy: Template = {
  id: 'ad-policy-shift',
  name: 'Fiscal or monetary policy shifting AD',
  unit: 'macro',
  topic: TOPIC_POLICY,
  description:
    'Expansionary fiscal or monetary policy shifts AD right to close a recessionary gap; contractionary policy shifts AD left to close an inflationary gap.',
  keywords: ['expansionary fiscal policy', 'contractionary fiscal policy', 'expansionary monetary policy', 'contractionary monetary policy', 'demand-side policy', 'government spending', 'taxation', 'interest rates'],
  caption: 'Demand-side policy',
  controls: [
    select('policy', 'Policy', [
      { value: 'exp-fiscal', label: 'Expansionary fiscal policy' },
      { value: 'exp-monetary', label: 'Expansionary monetary policy' },
      { value: 'con-fiscal', label: 'Contractionary fiscal policy' },
      { value: 'con-monetary', label: 'Contractionary monetary policy' },
    ], 'exp-fiscal'),
    toggle('lras', 'Show LRAS (closing an output gap)', true),
    toggle('note', 'Annotate the policy tool', true),
    slider('shift', 'Size of AD shift', 0.8, 3, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const pol = POLICY_NOTES[P.s(p, 'policy', 'exp-fiscal')] ?? POLICY_NOTES['exp-fiscal'];
    const s = P.n(p, 'shift', 1.8);
    const lras = P.b(p, 'lras');
    const e1: Vec = [pol.exp ? 4 : 6, pol.exp ? 4.6 : 5.6];
    const ad1 = adLine(e1[0], e1[1]);
    const sr = srasLine(e1[0], e1[1]);
    const ad2 = adLine(e1[0] + (pol.exp ? s : -s), e1[1]);
    const e2 = G.meet(ad2, sr);
    const arr = shift('shift', ad1, ad2, { t: 0.22 });
    return {
      panels: [
        mpanel([
          ...when(lras, curve('lras', lrasLine(e2[0]), 'LRAS', { role: 'long-run' })),
          curve('ad1', ad1, 'AD_1', { role: 'demand' }),
          curve('ad2', ad2, 'AD_2', { role: 'demand' }),
          curve('sras', sr, 'SRAS', { role: 'supply' }),
          arr,
          ...when(P.b(p, 'note'), text('note', [(arr.from[0] + arr.to[0]) / 2, arr.from[1] + 0.5], pol.note, { size: 0.85 })),
          eqPoint('e1', e1, 'Y_1', 'PL_1'),
          eqPoint('e2', e2, lras ? 'Y_p' : 'Y_2', 'PL_2'),
        ]),
      ],
    };
  },
};

const multiplier: Template = {
  id: 'keynesian-multiplier',
  name: 'Keynesian multiplier',
  unit: 'macro',
  topic: TOPIC_POLICY,
  hl: true,
  description:
    'An injection (e.g. ΔG) shifts AD by the initial amount, then successive rounds of induced spending shift it further: the final change in real GDP is k × ΔG, where k = 1/(1 − MPC).',
  keywords: ['multiplier', 'Keynesian multiplier', 'MPC', 'marginal propensity to consume', 'injection', 'induced spending', 'k = 1/MPW'],
  caption: 'The Keynesian multiplier',
  controls: [
    slider('mpc', 'Marginal propensity to consume (MPC)', 0.2, 0.8, 0.05, 0.6),
    slider('inj', 'Initial injection, ΔG ($bn)', 5, 20, 1, 12),
    toggle('measures', 'Label initial injection and multiplier effect', true),
  ],
  build: (p) => {
    const mpc = P.n(p, 'mpc', 0.6);
    const inj = P.n(p, 'inj', 12);
    const k = 1 / (1 - mpc);
    const scale = 0.12; // data units per $bn
    const kas: KAS = { p0: 4.4, x1: 7.6, yfe: 9.3, h: 2.2 };
    const as = keynesAS(kas);
    const y1 = 1.6;
    const ad1 = adLine(y1, kas.p0);
    const ad2 = adLine(y1 + inj * scale, kas.p0);
    const ad3 = adLine(y1 + inj * scale * k, kas.p0);
    const e1 = G.meet(ad1, as);
    const e2 = G.meet(ad2, as);
    const e3 = G.meet(ad3, as);
    const my = kas.p0 - 0.7;
    const stats: Stat[] = [
      { label: 'MPC', value: fmt(mpc, 2) },
      { label: 'Multiplier, k = 1 / (1 − MPC)', value: fmt(k, 2) },
      { label: 'Initial injection, ΔG', value: `$${fmt(inj, 1)}bn` },
      { label: 'Final change in AD (k × ΔG)', value: `$${fmt(k * inj, 1)}bn` },
    ];
    return {
      panels: [
        mpanel([
          curve('as', as, 'AS', { role: 'supply' }),
          curve('ad1', ad1, 'AD_1', { role: 'demand' }),
          curve('ad2', ad2, 'AD_2', { role: 'demand', dash: true }),
          curve('ad3', ad3, 'AD_3', { role: 'demand' }),
          eqPoint('e1', e1, 'Y_1', 'PL'),
          eqPoint('e2', e2, 'Y_2', ''),
          eqPoint('e3', e3, 'Y_3', ''),
          ...when(
            P.b(p, 'measures'),
            measure('m1', [e1[0], my], [e2[0], my], 'ΔG', { labelDir: 's' }),
            measure('m2', [e2[0], my], [e3[0], my], 'multiplier effect', { labelDir: 's' }),
          ),
        ]),
      ],
      stats,
    };
  },
};

const crowdingOut: Template = {
  id: 'crowding-out',
  name: 'Crowding out (loanable funds)',
  unit: 'macro',
  topic: TOPIC_POLICY,
  description:
    'Government borrowing to fund a deficit raises demand for loanable funds, pushing up the real interest rate and reducing (crowding out) private investment.',
  keywords: ['crowding out', 'loanable funds', 'budget deficit', 'government borrowing', 'interest rate', 'private investment', 'fiscal policy'],
  caption: 'Crowding out',
  controls: [
    select('view', 'Show', [
      { value: 'funds', label: 'Loanable funds market' },
      { value: 'both', label: 'Loanable funds + AD/AS' },
    ], 'funds'),
    slider('shift', 'Government borrowing', 0.8, 3, 0.1, 2, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 2);
    const both = P.s(p, 'view') === 'both';
    const slf = sdLine([5, 5], 0.8);
    const dlf1 = sdLine([5, 5], -0.8);
    const dlf2 = sdLine([5 + s, 5], -0.8);
    const e2 = G.meet(dlf2, slf);
    const qp = G.atY(dlf1, e2[1]);
    const panels: Panel[] = [
      panel({
        id: 'funds',
        title: both ? 'Loanable funds market' : undefined,
        xLabel: 'Quantity of loanable funds',
        yLabel: 'Real interest rate',
        elements: [
          curve('slf', slf, 'S_{LF}', { role: 'supply' }),
          curve('dlf1', dlf1, 'D_{LF1}', { role: 'demand' }),
          curve('dlf2', dlf2, 'D_{LF2}', { role: 'demand' }),
          shift('shift', dlf1, dlf2, { t: 0.25 }),
          eqPoint('e1', [5, 5], 'Q_1', 'r_1'),
          eqPoint('e2', e2, 'Q_2', 'r_2'),
          point('qp', qp, { xLabel: 'Q_p' }),
          guide('r2line', qp, e2),
          measure('crowd', [qp[0], e2[1] + 0.55], [5, e2[1] + 0.55], 'crowding out', { labelDir: 'n' }),
        ],
      }),
    ];
    if (both) {
      const sr = srasLine(4, 4.6);
      const ad1 = adLine(4, 4.6);
      const ad2 = adLine(4 + s * 1.4, 4.6);
      const ad3 = adLine(4 + s * 0.75, 4.6);
      panels.push(
        mpanel(
          [
            curve('sras', sr, 'SRAS', { role: 'supply' }),
            curve('ad1', ad1, 'AD_1', { role: 'demand' }),
            curve('ad2', ad2, 'AD_2', { role: 'demand', dash: true }),
            curve('ad3', ad3, 'AD_3', { role: 'demand' }),
            shift('shift', ad1, ad3, { t: 0.2 }),
            shift('back', ad2, ad3, { t: 0.5 }),
            eqPoint('e1', [4, 4.6], 'Y_1', 'PL_1'),
            eqPoint('e3', G.meet(ad3, sr), 'Y_3', 'PL_3'),
            point('e2', G.meet(ad2, sr), { xLabel: 'Y_2' }),
          ],
          { id: 'adas', title: 'AD/AS' },
        ),
      );
    }
    return { panels, layout: 'row' };
  },
};

// ---------------------------------------------------------------------------
// Supply-side policies & growth

const growthAdas: Template = {
  id: 'economic-growth-adas',
  name: 'Economic growth (AD/AS)',
  unit: 'macro',
  topic: TOPIC_GROWTH,
  description:
    'Long-term growth is an increase in potential output: LRAS (or the Keynesian AS) shifts right. If AD grows in step, real GDP rises without inflation.',
  keywords: ['economic growth', 'LRAS shift', 'potential output', 'productive capacity', 'long-term growth', 'actual growth'],
  caption: 'Economic growth',
  controls: [
    select('model', 'Model', [
      { value: 'nc', label: 'New classical (LRAS)' },
      { value: 'keynesian', label: 'Keynesian AS' },
    ], 'nc'),
    toggle('ad', 'AD also increases', true),
    slider('shift', 'Growth in potential output', 1, 3, 0.1, 2, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 2);
    const withAD = P.b(p, 'ad');
    if (P.s(p, 'model') === 'keynesian') {
      const k1: KAS = { p0: 3, x1: 2.8, yfe: 6.2, h: 2.8 };
      const k2: KAS = { ...k1, x1: k1.x1 + s, yfe: k1.yfe + s };
      const as1 = keynesAS(k1);
      const as2 = keynesAS(k2);
      const start = kasAt(k1, 0.5);
      const ad1 = adLine(start[0], start[1]);
      const ad2 = withAD ? adLine(start[0] + s, start[1]) : ad1;
      return {
        panels: [
          mpanel([
            curve('as1', as1, 'AS_1', { role: 'supply' }),
            curve('as2', as2, 'AS_2', { role: 'supply' }),
            shift('shift', as1, as2, { t: 0.93 }),
            curve('ad1', ad1, withAD ? 'AD_1' : 'AD', { role: 'demand' }),
            ...when(withAD, curve('ad2', ad2, 'AD_2', { role: 'demand' })),
            eqPoint('e1', G.meet(ad1, as1), 'Y_1', withAD ? 'PL' : 'PL_1'),
            eqPoint('e2', G.meet(ad2, as2), 'Y_2', withAD ? '' : 'PL_2'),
          ]),
        ],
      };
    }
    const y1 = 4;
    const y2 = y1 + s;
    const e1: Vec = [y1, 5];
    const ad1 = adLine(e1[0], e1[1]);
    const s1 = srasLine(e1[0], e1[1]);
    const ad2 = withAD ? adLine(y2, 5) : ad1;
    const e2: Vec = withAD ? [y2, 5] : [y2, G.yAt(ad1, y2)];
    const s2 = srasLine(e2[0], e2[1]);
    return {
      panels: [
        mpanel([
          curve('lras1', lrasLine(y1), 'LRAS_1', { role: 'long-run' }),
          curve('lras2', lrasLine(y2), 'LRAS_2', { role: 'long-run' }),
          arrow('shift', [y1 + 0.15, 8.6], [y2 - 0.15, 8.6]),
          curve('ad1', ad1, withAD ? 'AD_1' : 'AD', { role: 'demand' }),
          ...when(withAD, curve('ad2', ad2, 'AD_2', { role: 'demand' })),
          curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
          curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
          eqPoint('e1', e1, 'Y_1', withAD ? 'PL' : 'PL_1'),
          eqPoint('e2', e2, 'Y_2', withAD ? '' : 'PL_2'),
        ]),
      ],
    };
  },
};

const supplySide: Template = {
  id: 'supply-side-policy',
  name: 'Supply-side policies',
  unit: 'macro',
  topic: TOPIC_GROWTH,
  description:
    'Market-based and interventionist supply-side policies raise productive capacity: LRAS shifts right, increasing potential output and putting downward pressure on the price level.',
  keywords: ['supply-side policies', 'market-based', 'interventionist', 'LRAS', 'productivity', 'deregulation', 'education', 'infrastructure', 'labour market reform'],
  caption: 'The effect of supply-side policies',
  controls: [
    select('model', 'Model', [
      { value: 'nc', label: 'New classical (LRAS)' },
      { value: 'keynesian', label: 'Keynesian AS' },
    ], 'nc'),
    slider('shift', 'Increase in potential output', 1, 3, 0.1, 1.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const s = P.n(p, 'shift', 1.8);
    if (P.s(p, 'model') === 'keynesian') {
      const k1: KAS = { p0: 3.6, x1: 2.6, yfe: 5.8, h: 2.6 };
      const k2: KAS = { ...k1, x1: k1.x1 + s, yfe: k1.yfe + s };
      const as1 = keynesAS(k1);
      const as2 = keynesAS(k2);
      const ad = adLine(k1.yfe, k1.p0 + k1.h + 0.4);
      return {
        panels: [
          mpanel([
            curve('as1', as1, 'AS_1', { role: 'supply' }),
            curve('as2', as2, 'AS_2', { role: 'supply' }),
            shift('shift', as1, as2, { t: 0.93 }),
            curve('ad', ad, 'AD', { role: 'demand' }),
            eqPoint('e1', G.meet(ad, as1), 'Y_1', 'PL_1'),
            eqPoint('e2', G.meet(ad, as2), 'Y_2', 'PL_2'),
          ]),
        ],
      };
    }
    const e1: Vec = [4, 5.6];
    const ad = adLine(e1[0], e1[1]);
    const s1 = srasLine(e1[0], e1[1]);
    const y2 = e1[0] + s;
    const e2: Vec = [y2, G.yAt(ad, y2)];
    const s2 = srasLine(e2[0], e2[1]);
    return {
      panels: [
        mpanel([
          curve('lras1', lrasLine(e1[0]), 'LRAS_1', { role: 'long-run' }),
          curve('lras2', lrasLine(y2), 'LRAS_2', { role: 'long-run' }),
          arrow('shift', [e1[0] + 0.15, 8.6], [y2 - 0.15, 8.6]),
          curve('ad', ad, 'AD', { role: 'demand' }),
          curve('sras1', s1, 'SRAS_1', { role: 'supply' }),
          curve('sras2', s2, 'SRAS_2', { role: 'supply' }),
          eqPoint('e1', e1, 'Y_1', 'PL_1'),
          eqPoint('e2', e2, 'Y_2', 'PL_2'),
        ]),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Inequality

/** Parse "5, 10, 15, 22, 48" into ascending income shares that sum to 100. */
function parseShares(src: string, fallback: number[]): number[] {
  const vals = src
    .split(/[\s,;]+/)
    .map((s) => Number(s.replace('%', '')))
    .filter((v) => Number.isFinite(v) && v >= 0);
  const use = vals.length >= 2 && vals.some((v) => v > 0) ? vals : fallback;
  const total = use.reduce((a, b) => a + b, 0);
  return use.map((v) => (v / total) * 100).sort((a, b) => a - b);
}

/** Cumulative Lorenz points (0–100 on both axes) and the Gini coefficient. */
function lorenz(shares: number[]) {
  const n = shares.length;
  const pts: Vec[] = [[0, 0]];
  let cum = 0;
  shares.forEach((s, i) => {
    cum += s;
    pts.push([((i + 1) / n) * 100, Math.min(100, cum)]);
  });
  // area under the Lorenz curve (trapezoids), as a fraction of the unit square
  let b = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    b += ((pts[i + 1][0] - pts[i][0]) / 100) * ((pts[i][1] + pts[i + 1][1]) / 200);
  }
  return { pts, gini: 1 - 2 * b };
}

/**
 * Cubic Hermite interpolation through increasing, convex data that is itself
 * guaranteed convex and monotone — a smooth Lorenz curve with no wiggles that
 * still passes exactly through every data point.
 */
function convexSpline(pts: Vec[], samples = 24): Vec[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const m: number[] = new Array(n).fill(0);
  m[0] = Math.max(0, d[0] - (d[1] - d[0]) / 2);
  for (let k = 0; k < n - 1; k++) {
    // keeps f'' ≥ 0 at both ends of segment k: 2m_k + m_{k+1} ≤ 3d_k ≤ m_k + 2m_{k+1}
    const lo = (3 * d[k] - m[k]) / 2;
    const last = k + 1 === n - 1;
    const hi = Math.min(3 * d[k] - 2 * m[k], last ? Infinity : d[k + 1]);
    const target = last ? d[k] + (d[k] - (k > 0 ? d[k - 1] : d[k])) / 2 : (d[k] + d[k + 1]) / 2;
    m[k + 1] = Math.min(hi, Math.max(lo, target));
  }
  const out: Vec[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = x1 - x0;
    for (let j = 0; j < samples; j++) {
      const t = j / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        x0 + t * h,
        (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1],
      ]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

const lorenzCurve: Template = {
  id: 'lorenz-curve',
  name: 'Lorenz curve and Gini coefficient',
  unit: 'macro',
  topic: TOPIC_INEQ,
  description:
    'Plot real income-share data as a Lorenz curve. The Gini coefficient is the area between the line of equality and the Lorenz curve (A) divided by the total area under the line of equality (A + B).',
  keywords: ['Lorenz curve', 'Gini coefficient', 'income inequality', 'income distribution', 'quintile', 'decile', 'redistribution', 'line of equality'],
  caption: 'Lorenz curve',
  controls: [
    textInput('data1', 'Income shares, poorest → richest (%)', '5, 10, 15, 22, 48', {
      help: 'Quintile or decile shares separated by commas. They are rescaled to total 100%.',
    }),
    textInput('name1', 'Name of curve', 'Lorenz curve'),
    toggle('second', 'Add a second Lorenz curve', false),
    textInput('data2', 'Second curve income shares (%)', '7, 12, 17, 23, 41', { show: (p) => P.b(p, 'second') }),
    textInput('name2', 'Name of second curve', 'After taxes and transfers', { show: (p) => P.b(p, 'second') }),
    toggle('shade', 'Shade areas A and B', true),
    toggle('key', 'Show a key (instead of labels on the curves)', true),
    toggle('smooth', 'Smooth curve', true),
    toggle('points', 'Mark data points', false),
  ],
  build: (p) => {
    const s1 = parseShares(P.s(p, 'data1'), [5, 10, 15, 22, 48]);
    const L1 = lorenz(s1);
    const smooth = P.b(p, 'smooth');
    const shape = (pts: Vec[]) => (smooth && pts.length >= 3 ? convexSpline(pts, 30) : pts);
    const key = P.b(p, 'key');
    const name1 = P.s(p, 'name1', 'Lorenz curve');
    const name2 = P.s(p, 'name2', 'After taxes and transfers');
    const second = P.b(p, 'second');
    const c1 = shape(L1.pts);
    const eq: Vec[] = [
      [0, 0],
      [100, 100],
    ];
    const els: El[] = [];
    if (P.b(p, 'shade')) {
      els.push(
        area('a', [...G.sliceX(eq, 0, 100), ...G.sliceX(c1, 0, 100).reverse()], 'dwl', 'A', 'Area A (between equality line and Lorenz curve)', {
          labelPos: [56, 46],
        }),
        area('b', [...G.sliceX(c1, 0, 100), [100, 0]], 'cs', 'B', 'Area B (under the Lorenz curve)', { labelPos: [72, 18] }),
      );
    }
    els.push(
      curve('equality', eq, key ? undefined : 'Line of perfect equality', { role: 'long-run', labelAt: [57, 57], labelDir: 'nw' }),
      curve('lorenz1', c1, key ? undefined : name1, { role: 'demand', labelAt: [64, G.yAt(c1, 64)], labelDir: 'se' }),
    );
    if (key) {
      const entries: { id: string; label: string; role: 'long-run' | 'demand' | 'supply'; dash?: boolean }[] = [
        { id: 'equality', label: 'Line of perfect equality', role: 'long-run' },
        { id: 'lorenz1', label: name1, role: 'demand' },
        ...(second ? [{ id: 'lorenz2', label: name2, role: 'supply' as const, dash: true }] : []),
      ];
      entries.forEach((e, i) => {
        const y = 94 - i * 7;
        els.push(
          curve(`key-${e.id}`, [[3, y], [11, y]], undefined, { role: e.role, dash: e.dash }),
          text(`key-${e.id}-text`, [13, y], e.label, { anchor: 'start', size: 0.85 }),
        );
      });
    }
    if (P.b(p, 'points')) {
      L1.pts.slice(1, -1).forEach((pt, i) => els.push(point(`p1-${i}`, pt)));
    }
    const stats: Stat[] = [
      { label: `Gini — ${name1}`, value: fmt(L1.gini, 3) },
      { label: 'Share of poorest group', value: `${fmt(s1[0], 1)}%` },
      { label: 'Share of richest group', value: `${fmt(s1[s1.length - 1], 1)}%` },
    ];
    if (second) {
      const s2 = parseShares(P.s(p, 'data2'), [7, 12, 17, 23, 41]);
      const L2 = lorenz(s2);
      const c2 = shape(L2.pts);
      els.push(
        curve('lorenz2', c2, key ? undefined : name2, {
          role: 'supply',
          dash: true,
          labelAt: [46, G.yAt(c2, 46)],
          labelDir: 'nw',
        }),
      );
      if (P.b(p, 'points')) L2.pts.slice(1, -1).forEach((pt, i) => els.push(point(`p2-${i}`, pt)));
      stats.push({ label: `Gini — ${name2}`, value: fmt(L2.gini, 3) });
    }
    const ticks = [0, 20, 40, 60, 80, 100].map((v) => ({ value: v, label: String(v) }));
    return {
      panels: [
        panel({
          xLabel: 'Cumulative % of population',
          yLabel: 'Cumulative % of income',
          xMax: 100,
          yMax: 100,
          width: 400,
          height: 400,
          xTicks: ticks.slice(1),
          yTicks: ticks.slice(1),
          elements: els,
        }),
      ],
      stats,
    };
  },
};

export const macroTemplates: Template[] = [
  businessCycle,
  adCurve,
  srasShift,
  lrEquilibrium,
  keynesianAS,
  keynesianADIncrease,
  ncGap('recessionary'),
  ncGap('inflationary'),
  keynesianGap('recessionary'),
  keynesianGap('inflationary'),
  demandPull,
  costPush,
  deflation,
  naturalRate,
  demandDeficient,
  realWage,
  structural,
  shortRunPhillips,
  longRunPhillips,
  moneyMarket,
  adPolicy,
  multiplier,
  crowdingOut,
  growthAdas,
  supplySide,
  lorenzCurve,
];

