import type { El, Params, Stat, Template, Vec } from '~/engine/types';
import {
  G,
  P,
  area,
  arrow,
  curve,
  dragHandle,
  eqPoint,
  fmt,
  measure,
  panel,
  point,
  sd,
  select,
  shapeControls,
  shiftArrow,
  slider,
  text,
  textInput,
  tick,
  toggle,
  when,
} from './kit';

const TRADE = 'International trade';
const PROTECT = 'Trade protection';
const FX = 'Exchange rates';
const BOP = 'Balance of payments';

const shape = shapeControls();

// ---------------------------------------------------------------------------
// Shared helpers

const letteringControl = select(
  'lettering',
  'Area labels',
  [
    { value: 'words', label: 'Words (e.g. "Tariff revenue")' },
    { value: 'letters', label: 'Letters (a, b, c, d) + key' },
  ],
  'words',
);

/** Area label/legend pair honouring the words/letters control. */
function lab(p: Params, letter: string, word: string, legend: string) {
  const letters = P.s(p, 'lettering', 'words') === 'letters';
  return { label: letters ? letter : word, legend: letters ? `${letter}: ${legend}` : legend };
}

/** Domestic market (D/S through (5,5)) with clamped quantity lookups. */
function domestic(p: Params) {
  const { D, S } = sd(p);
  const d = D();
  const s = S();
  const e = G.meet(d, s);
  const qd = (price: number) => Math.max(0, G.xAt(d, price));
  const qs = (price: number) => Math.max(0, G.xAt(s, price));
  return { d, s, e, qd, qs };
}

/**
 * Region between two price levels to the left of an upward-sloping supply curve
 * (the producer-surplus band). Handles a supply curve whose intercept lies inside the band.
 */
function leftOfSupply(s: Vec[], lo: number, hi: number): Vec[] {
  const xLo = G.xAt(s, lo);
  const xHi = Math.max(0, G.xAt(s, hi));
  const pts: Vec[] = [];
  if (xLo >= 0) pts.push([0, lo], [xLo, lo]);
  else pts.push([0, G.clamp(G.yAt(s, 0), lo, hi)]);
  pts.push([xHi, hi], [0, hi]);
  return pts;
}

/** Region between two price levels to the left of a downward-sloping demand curve. */
function leftOfDemand(d: Vec[], lo: number, hi: number): Vec[] {
  return [
    [0, lo],
    [Math.max(0, G.xAt(d, lo)), lo],
    [Math.max(0, G.xAt(d, hi)), hi],
    [0, hi],
  ];
}

const worldLine = (id: string, price: number, label: string, role: 'world' | 'policy' = 'world') =>
  curve(id, G.hline(price, 0, 9.6), label, { role });

const domesticCurves = (d: Vec[], s: Vec[]): El[] => [
  curve('d', d, 'D_{dom}', { role: 'demand' }),
  curve('s', s, 'S_{dom}', { role: 'supply' }),
];

/** Two stacked brackets below a price line, e.g. imports before/after protection. */
function stackedBrackets(
  id: string,
  price: number,
  first: [number, number, string],
  second?: [number, number, string],
): El[] {
  const out: El[] = [measure(`${id}1`, [first[0], price - 0.45], [first[1], price - 0.45], first[2], { labelDir: 's' })];
  if (second && second[1] - second[0] > 0.05) {
    out.push(measure(`${id}2`, [second[0], price - 1.35], [second[1], price - 1.35], second[2], { labelDir: 's' }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// International trade

const freeTradeImporting: Template = {
  id: 'free-trade-importing',
  name: 'Free trade: importing country',
  unit: 'global',
  topic: TRADE,
  description:
    'When the world price is below the domestic equilibrium price, the country imports the difference between domestic demand and domestic supply. Consumers gain more than producers lose.',
  keywords: ['free trade', 'imports', 'world price', 'gains from trade', 'consumer surplus', 'small country'],
  caption: 'Free trade in an importing country',
  controls: [
    select(
      'shade',
      'Shading',
      [
        { value: 'gains', label: 'Welfare changes from trade' },
        { value: 'surplus', label: 'Consumer and producer surplus' },
        { value: 'none', label: 'None' },
      ],
      'gains',
    ),
    letteringControl,
    toggle('imports', 'Show imports', true),
    slider('pw', 'World price', 1.5, 4.6, 0.05, 2.6, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.min(P.n(p, 'pw', 2.6), e[1] - 0.2);
    const q1 = qs(pw);
    const q2 = qd(pw);
    const shade = P.s(p, 'shade', 'gains');
    const els: El[] = [];
    if (shade === 'gains') {
      const a = lab(p, 'a', 'Transfer to\nconsumers', 'Surplus transferred from domestic producers to consumers');
      const b = lab(p, 'b', 'Net\ngain', 'Net gain in social surplus from free trade');
      els.push(
        area('wa', leftOfSupply(s, pw, e[1]), 'ps', a.label, a.legend),
        area('wb', [[q1, pw], [q2, pw], e], 'gain', b.label, b.legend),
      );
    } else if (shade === 'surplus') {
      els.push(
        area('cs', G.between(d, G.hline(pw, 0, q2), 0, q2), 'cs', 'CS', 'Consumer surplus with free trade'),
        area('ps', leftOfSupply(s, 0, pw), 'ps', 'PS', 'Producer surplus with free trade'),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      worldLine('sw', pw, 'S_w'),
      tick('pw', 'y', pw, 'P_w'),
      eqPoint('e', e, 'Q_e', 'P_e'),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      ...when(P.b(p, 'imports'), ...stackedBrackets('imp', pw, [q1, q2, 'imports'])),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [dragHandle('h-pw', [9, pw], 'y', 'pw', pw, { min: 1.5, max: 4.6, hint: 'Drag to change the world price' })],
        }),
      ],
    };
  },
};

const freeTradeExporting: Template = {
  id: 'free-trade-exporting',
  name: 'Free trade: exporting country',
  unit: 'global',
  topic: TRADE,
  description:
    'When the world price is above the domestic equilibrium price, domestic producers sell more and the surplus is exported. Producers gain more than consumers lose.',
  keywords: ['free trade', 'exports', 'world price', 'gains from trade', 'producer surplus'],
  caption: 'Free trade in an exporting country',
  controls: [
    select(
      'shade',
      'Shading',
      [
        { value: 'gains', label: 'Welfare changes from trade' },
        { value: 'surplus', label: 'Consumer and producer surplus' },
        { value: 'none', label: 'None' },
      ],
      'gains',
    ),
    letteringControl,
    toggle('exports', 'Show exports', true),
    slider('pw', 'World price', 5.4, 8.4, 0.05, 6.6, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.max(P.n(p, 'pw', 6.6), e[1] + 0.2);
    const q1 = qd(pw);
    const q2 = qs(pw);
    const shade = P.s(p, 'shade', 'gains');
    const els: El[] = [];
    if (shade === 'gains') {
      const a = lab(p, 'a', 'Transfer to\nproducers', 'Surplus transferred from domestic consumers to producers');
      const b = lab(p, 'b', 'Net\ngain', 'Net gain in social surplus from free trade');
      els.push(
        area('wa', leftOfDemand(d, e[1], pw), 'cs', a.label, a.legend),
        area('wb', [[q1, pw], [q2, pw], e], 'gain', b.label, b.legend),
      );
    } else if (shade === 'surplus') {
      els.push(
        area('cs', G.between(d, G.hline(pw, 0, q1), 0, q1), 'cs', 'CS', 'Consumer surplus with free trade'),
        area('ps', leftOfSupply(s, 0, pw), 'ps', 'PS', 'Producer surplus with free trade'),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      worldLine('sw', pw, ''),
      tick('pw', 'y', pw, 'P_w'),
      eqPoint('e', e, 'Q_e', 'P_e'),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      ...when(
        P.b(p, 'exports'),
        measure('exp', [q1, pw + 0.5], [q2, pw + 0.5], 'exports', { labelDir: 'n' }),
      ),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [dragHandle('h-pw', [9, pw], 'y', 'pw', pw, { min: 5.4, max: 8.4, hint: 'Drag to change the world price' })],
        }),
      ],
    };
  },
};

const comparativeAdvantage: Template = {
  id: 'comparative-advantage',
  name: 'Comparative advantage (PPCs)',
  unit: 'global',
  topic: TRADE,
  hl: true,
  description:
    'Two countries with straight-line PPCs and different opportunity costs. The country with the lower opportunity cost of a good has the comparative advantage in it; trade at terms between the two opportunity costs lets both consume beyond their PPCs.',
  keywords: ['comparative advantage', 'absolute advantage', 'opportunity cost', 'specialisation', 'terms of trade', 'PPC', 'Ricardo'],
  caption: 'Comparative advantage and the gains from specialisation',
  controls: [
    textInput('countryA', 'Country A name', 'Country A'),
    textInput('countryB', 'Country B name', 'Country B'),
    textInput('goodX', 'Good on x-axis', 'Good X'),
    textInput('goodY', 'Good on y-axis', 'Good Y'),
    select(
      'layout',
      'Layout',
      [
        { value: 'one', label: 'Both PPCs on one diagram' },
        { value: 'two', label: 'Side by side' },
      ],
      'one',
    ),
    toggle('values', 'Show intercept values', true),
    toggle('trade', 'Show trading possibilities', false),
    slider('aX', 'A: maximum of x-axis good', 2, 9.5, 0.5, 8, { group: 'Production' }),
    slider('aY', 'A: maximum of y-axis good', 2, 9.5, 0.5, 4, { group: 'Production' }),
    slider('bX', 'B: maximum of x-axis good', 2, 9.5, 0.5, 3, { group: 'Production' }),
    slider('bY', 'B: maximum of y-axis good', 2, 9.5, 0.5, 6, { group: 'Production' }),
    slider('tot', 'Terms of trade (units of y-axis good per x-axis good)', 0.2, 4, 0.05, 1, {
      group: 'Production',
      show: (p) => P.b(p, 'trade'),
    }),
  ],
  build: (p) => {
    const A = P.s(p, 'countryA', 'Country A') || 'Country A';
    const B = P.s(p, 'countryB', 'Country B') || 'Country B';
    const gx = P.s(p, 'goodX', 'Good X') || 'Good X';
    const gy = P.s(p, 'goodY', 'Good Y') || 'Good Y';
    const aX = P.n(p, 'aX', 8);
    const aY = P.n(p, 'aY', 4);
    const bX = P.n(p, 'bX', 3);
    const bY = P.n(p, 'bY', 6);
    const tot = P.n(p, 'tot', 1);
    const ocA = aY / aX; // units of Y given up per X in A
    const ocB = bY / bX;
    const v = (n: number) => fmt(n * 10, 1);
    // Who specialises in X: the lower opportunity cost of X.
    const aInX = ocA <= ocB;
    const showValues = P.b(p, 'values');
    // label each PPC on the part of it furthest from where the two PPCs cross
    const ppc = (id: string, maxX: number, maxY: number, name: string, otherMaxY: number): El[] => [
      curve(id, [[0, maxY], [maxX, 0]], name, {
        role: id === 'a' ? 'demand' : 'supply',
        labelAt: G.lerp([0, maxY], [maxX, 0], maxY >= otherMaxY ? 0.2 : 0.72),
        labelDir: 'ne',
      }),
      ...when(showValues, tick(`${id}x`, 'x', maxX, v(maxX)), tick(`${id}y`, 'y', maxY, v(maxY))),
    ];
    const tradeLine = (id: string, maxX: number, maxY: number, inX: boolean, name: string, role: 'demand' | 'supply'): El[] => {
      if (!P.b(p, 'trade')) return [];
      // specialise completely, then trade along the terms-of-trade line
      const pts: Vec[] = inX ? [[maxX, 0], [0, maxX * tot]] : [[0, maxY], [maxY / tot, 0]];
      return [curve(id, pts, `${name} with trade`, { role, dash: true, labelAt: G.lerp(pts[0], pts[1], 0.5), labelDir: 'ne' })];
    };
    const valid = tot > Math.min(ocA, ocB) && tot < Math.max(ocA, ocB);
    const stats: Stat[] = [
      { label: `Opportunity cost of 1 ${gx} in ${A}`, value: `${fmt(ocA)} ${gy}` },
      { label: `Opportunity cost of 1 ${gx} in ${B}`, value: `${fmt(ocB)} ${gy}` },
      { label: `Opportunity cost of 1 ${gy} in ${A}`, value: `${fmt(1 / ocA)} ${gx}` },
      { label: `Opportunity cost of 1 ${gy} in ${B}`, value: `${fmt(1 / ocB)} ${gx}` },
      {
        label: `Comparative advantage in ${gx}`,
        value: ocA === ocB ? 'Neither (equal opportunity costs)' : aInX ? A : B,
      },
      {
        label: `Comparative advantage in ${gy}`,
        value: ocA === ocB ? 'Neither (equal opportunity costs)' : aInX ? B : A,
      },
      {
        label: `Absolute advantage in ${gx}`,
        value: aX === bX ? 'Neither' : aX > bX ? A : B,
      },
      {
        label: `Absolute advantage in ${gy}`,
        value: aY === bY ? 'Neither' : aY > bY ? A : B,
      },
    ];
    if (P.b(p, 'trade')) {
      stats.push({
        label: 'Terms of trade',
        value: valid
          ? `1 ${gx} = ${fmt(tot)} ${gy} (mutually beneficial)`
          : `1 ${gx} = ${fmt(tot)} ${gy} — outside ${fmt(Math.min(ocA, ocB))}–${fmt(Math.max(ocA, ocB))}, one country loses`,
      });
    }
    if (P.s(p, 'layout') === 'two') {
      const mk = (id: string, name: string, maxX: number, maxY: number, inX: boolean) =>
        panel({
          id,
          title: name,
          xLabel: gx,
          yLabel: gy,
          width: 340,
          height: 320,
          elements: [
            ...ppc(id === 'pa' ? 'a' : 'b', maxX, maxY, 'PPC', 0),
            ...tradeLine(`${id}-t`, maxX, maxY, inX, 'with', id === 'pa' ? 'demand' : 'supply'),
          ],
        });
      return { panels: [mk('pa', A, aX, aY, aInX), mk('pb', B, bX, bY, !aInX)], stats };
    }
    return {
      panels: [
        panel({
          xLabel: gx,
          yLabel: gy,
          elements: [
            ...ppc('a', aX, aY, A, bY),
            ...ppc('b', bX, bY, B, aY),
            ...tradeLine('at', aX, aY, aInX, A, 'demand'),
            ...tradeLine('bt', bX, bY, !aInX, B, 'supply'),
          ],
        }),
      ],
      stats,
    };
  },
};

// ---------------------------------------------------------------------------
// Trade protection

const tariff: Template = {
  id: 'tariff',
  name: 'Tariff',
  unit: 'global',
  topic: PROTECT,
  description:
    'A tariff raises the domestic price from P_w to P_w + t. Domestic production rises, consumption falls, imports shrink, the government collects revenue and two welfare-loss triangles appear.',
  keywords: ['tariff', 'import tax', 'protectionism', 'tariff revenue', 'welfare loss', 'deadweight loss', 'trade protection'],
  caption: 'The effects of a tariff',
  controls: [
    toggle('areas', 'Shade welfare effects', true),
    letteringControl,
    toggle('imports', 'Show imports before and after', false),
    toggle('domestic', 'Show domestic equilibrium', false),
    slider('pw', 'World price', 1.5, 4.5, 0.05, 2.6, { group: 'Shape' }),
    slider('tariff', 'Tariff per unit', 0.3, 2.5, 0.05, 1.3, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.min(P.n(p, 'pw', 2.6), e[1] - 0.3);
    // keep the tariff non-prohibitive so Q3 < Q4 stays readable
    const pt = Math.min(pw + P.n(p, 'tariff', 1.3), e[1] - 0.15);
    const q1 = qs(pw);
    const q2 = qd(pw);
    const q3 = qs(pt);
    const q4 = qd(pt);
    const els: El[] = [];
    if (P.b(p, 'areas')) {
      const a = lab(p, 'a', 'PS gain', 'Gain in producer surplus');
      const b = lab(p, 'b', 'DWL', 'Welfare loss (inefficient domestic production)');
      const c = lab(p, 'c', 'Tariff\nrevenue', 'Government tariff revenue');
      const dd = lab(p, 'd', 'DWL', 'Welfare loss (lost consumption)');
      els.push(
        area('wa', leftOfSupply(s, pw, pt), 'ps', a.label, a.legend),
        area('wb', [[q1, pw], [q3, pw], [q3, pt]], 'dwl', b.label, b.legend),
        area('wc', G.rect(q3, pw, q4, pt), 'gov', c.label, c.legend),
        area('wd', [[q4, pw], [q2, pw], [q4, pt]], 'dwl', dd.label, dd.legend),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      worldLine('sw', pw, 'S_w'),
      worldLine('swt', pt, 'S_w + tariff', 'policy'),
      tick('pw', 'y', pw, 'P_w'),
      tick('pt', 'y', pt, 'P_w + t'),
      ...when(P.b(p, 'domestic'), eqPoint('e', e, 'Q_e', 'P_e')),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      point('q3', [q3, pt], { xLabel: 'Q_3' }),
      point('q4', [q4, pt], { xLabel: 'Q_4' }),
      ...when(
        P.b(p, 'imports'),
        ...stackedBrackets('imp', pw, [q1, q2, 'imports before tariff'], [q3, q4, 'imports after tariff']),
      ),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [
            dragHandle('h-t', [8.9, pt], 'y', 'tariff', pt - pw, { min: 0.3, max: 2.5, hint: 'Drag to change the tariff' }),
            dragHandle('h-pw', [9.4, pw], 'y', 'pw', pw, { min: 1.5, max: 4.5, hint: 'Drag to change the world price' }),
          ],
        }),
      ],
    };
  },
};

const quota: Template = {
  id: 'import-quota',
  name: 'Import quota',
  unit: 'global',
  topic: PROTECT,
  description:
    'A quota limits imports to a fixed quantity, shifting domestic supply to S_dom + quota above the world price. The domestic price rises to P_q; holders of import licences/foreign exporters earn quota rent instead of the government earning revenue.',
  keywords: ['quota', 'import quota', 'quota rent', 'protectionism', 'welfare loss', 'trade protection'],
  caption: 'The effects of an import quota',
  controls: [
    toggle('areas', 'Shade welfare effects', true),
    letteringControl,
    toggle('imports', 'Show imports before and after', false),
    slider('pw', 'World price', 1.5, 4.2, 0.05, 2.6, { group: 'Shape' }),
    slider('quota', 'Quota size', 0.5, 5, 0.1, 2.5, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.min(P.n(p, 'pw', 2.6), e[1] - 0.3);
    const q1 = qs(pw);
    const q2 = qd(pw);
    const qa = Math.min(P.n(p, 'quota', 2.5), Math.max(0.1, (q2 - q1) * 0.8));
    // S_dom + quota: the domestic supply curve shifted right by the quota, above P_w
    const shifted = G.shiftX(s, qa);
    const xStart = G.xAt(shifted, pw);
    const xEnd = Math.min(shifted[shifted.length - 1][0], 8.3);
    const sq = G.sliceX(shifted, xStart, Math.max(xEnd, xStart + 0.1));
    const pq = Math.min(G.meet(sq, d)[1], e[1]);
    const q3 = qs(pq);
    const q4 = qd(pq);
    const els: El[] = [];
    if (P.b(p, 'areas')) {
      const a = lab(p, 'a', 'PS gain', 'Gain in producer surplus');
      const b = lab(p, 'b', 'DWL', 'Welfare loss (inefficient domestic production)');
      const c = lab(p, 'c', 'Quota\nrent', 'Quota rent (to foreign exporters / licence holders)');
      const dd = lab(p, 'd', 'DWL', 'Welfare loss (lost consumption)');
      els.push(
        area('wa', leftOfSupply(s, pw, pq), 'ps', a.label, a.legend),
        area('wb', [[q1, pw], [q3, pw], [q3, pq]], 'dwl', b.label, b.legend),
        area('wc', G.rect(q3, pw, q4, pq), 'alt', c.label, c.legend),
        area('wd', [[q4, pw], [q2, pw], [q4, pq]], 'dwl', dd.label, dd.legend),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      curve('sq', sq, 'S_{dom} + quota', { role: 'supply' }),
      worldLine('sw', pw, 'S_w'),
      tick('pw', 'y', pw, 'P_w'),
      eqPoint('pq', [q4, pq], 'Q_4', 'P_q'),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      point('q3', [q3, pq], { xLabel: 'Q_3' }),
      ...when(
        P.b(p, 'imports'),
        ...stackedBrackets('imp', pw, [q1, q2, 'imports before quota'], [q3, q4, 'imports = quota']),
      ),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [
            dragHandle('h-q', G.pointAt(sq, 0.55), 'x', 'quota', qa, { min: 0.5, max: 5, hint: 'Drag to change the quota' }),
          ],
        }),
      ],
    };
  },
};

const productionSubsidy: Template = {
  id: 'production-subsidy-trade',
  name: 'Production subsidy (trade protection)',
  unit: 'global',
  topic: PROTECT,
  description:
    'A subsidy to domestic producers shifts domestic supply down by the subsidy. The price stays at P_w, so consumers are unaffected, but domestic output rises, imports fall, and the government pays the subsidy on every unit produced.',
  keywords: ['production subsidy', 'domestic subsidy', 'protectionism', 'imports', 'welfare loss', 'government cost'],
  caption: 'A production subsidy to domestic producers',
  controls: [
    toggle('areas', 'Shade welfare effects', true),
    letteringControl,
    toggle('imports', 'Show imports before and after', false),
    slider('pw', 'World price', 1.5, 4.2, 0.05, 2.6, { group: 'Shape' }),
    slider('sub', 'Subsidy per unit', 0.3, 2.5, 0.05, 1.3, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.min(P.n(p, 'pw', 2.6), e[1] - 0.3);
    const sub = P.n(p, 'sub', 1.3);
    const s2raw = G.shiftY(s, -sub);
    const s2 = G.sliceX(s2raw, Math.max(0, G.xAt(s2raw, 0.9)), 8.1);
    const q1 = qs(pw);
    const q2 = qd(pw);
    const q3 = Math.min(Math.max(0, G.xAt(s2, pw)), q2);
    const pp = G.yAt(s, q3); // price received by producers = P_w + subsidy
    const els: El[] = [];
    if (P.b(p, 'areas')) {
      const a = lab(p, 'a', 'PS gain', 'Gain in producer surplus (part of the subsidy)');
      const b = lab(p, 'b', 'DWL', 'Welfare loss (part of the subsidy); a + b = cost to government');
      els.push(
        area('wa', leftOfSupply(s, pw, pp), 'ps', a.label, a.legend),
        area('wb', [[q1, pw], [q3, pw], [q3, pp]], 'dwl', b.label, b.legend),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      curve('s2', s2, 'S_{dom} + subsidy', { role: 'supply' }),
      shiftArrow('shift', s, s2, { t: 0.8, mode: 'v' }),
      worldLine('sw', pw, 'S_w'),
      tick('pw', 'y', pw, 'P_w'),
      eqPoint('pp', [q3, pp], 'Q_3', 'P_w + s', { dot: false }),
      point('q3', [q3, pw]),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      ...when(
        P.b(p, 'imports'),
        ...stackedBrackets('imp', pw, [q1, q2, 'imports before subsidy'], [q3, q2, 'imports after subsidy']),
      ),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [
            dragHandle('h-s', G.pointAt(s2, 0.75), 'y', 'sub', sub, { min: 0.3, max: 2.5, scale: -1, hint: 'Drag to change the subsidy' }),
          ],
        }),
      ],
    };
  },
};

const exportSubsidy: Template = {
  id: 'export-subsidy',
  name: 'Export subsidy',
  unit: 'global',
  topic: PROTECT,
  hl: true,
  description:
    'A per-unit subsidy on exports means producers will only sell at home for P_w + s, so the domestic price rises. Production and exports increase, domestic consumption falls, and the government pays the subsidy on every unit exported.',
  keywords: ['export subsidy', 'exports', 'protectionism', 'welfare loss', 'government cost', 'dumping'],
  caption: 'The effects of an export subsidy',
  controls: [
    toggle('areas', 'Shade welfare effects', true),
    letteringControl,
    toggle('exports', 'Show exports before and after', false),
    toggle('domestic', 'Show domestic equilibrium', false),
    slider('pw', 'World price', 5.4, 7.6, 0.05, 6.2, { group: 'Shape' }),
    slider('sub', 'Subsidy per unit exported', 0.3, 2, 0.05, 1.2, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const { d, s, e, qd, qs } = domestic(p);
    const pw = Math.max(P.n(p, 'pw', 6.2), e[1] + 0.2);
    const pt = Math.min(pw + P.n(p, 'sub', 1.2), 9.3);
    const q1 = qd(pw);
    const q2 = qs(pw);
    const q3 = qd(pt);
    const q4 = qs(pt);
    const els: El[] = [];
    if (P.b(p, 'areas')) {
      const a = lab(p, 'a', 'Transfer', 'Transfer from consumers to producers');
      const b = lab(p, 'b', 'DWL', 'Welfare loss (lost consumption)');
      const c = lab(p, 'c', 'Subsidy to\nproducers', 'Subsidy paid to producers');
      const dd = lab(p, 'd', 'DWL', 'Welfare loss (inefficient production); b + c + d = cost to government');
      els.push(
        area('wa', G.rect(0, pw, q3, pt), 'cs', a.label, a.legend),
        area('wb', [[q3, pt], [q3, pw], [q1, pw]], 'dwl', b.label, b.legend),
        area('wc', [[q3, pt], [q4, pt], [q2, pw], [q1, pw]], 'gov', c.label, c.legend),
        area('wd', [[q2, pw], [q4, pw], [q4, pt]], 'dwl', dd.label, dd.legend),
      );
    }
    els.push(
      ...domesticCurves(d, s),
      worldLine('pwl', pw, ''),
      worldLine('ptl', pt, '', 'policy'),
      tick('pw', 'y', pw, 'P_w'),
      tick('pt', 'y', pt, 'P_w + s'),
      ...when(P.b(p, 'domestic'), eqPoint('e', e, 'Q_e', 'P_e')),
      point('q1', [q1, pw], { xLabel: 'Q_1' }),
      point('q2', [q2, pw], { xLabel: 'Q_2' }),
      point('q3', [q3, pt], { xLabel: 'Q_3' }),
      point('q4', [q4, pt], { xLabel: 'Q_4' }),
      ...when(
        P.b(p, 'exports'),
        measure('exp2', [q3, pt + 0.45], [q4, pt + 0.45], 'exports after subsidy', { labelDir: 'n' }),
        measure('exp1', [q1, pw - 0.45], [q2, pw - 0.45], 'exports before subsidy', { labelDir: 's' }),
      ),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [dragHandle('h-s', [8.9, pt], 'y', 'sub', pt - pw, { min: 0.3, max: 2, hint: 'Drag to change the subsidy' })],
        }),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Exchange rates

const currencyControls = [
  textInput('cur', 'Currency', '£', { group: 'Currency' }),
  textInput('other', 'Priced in', 'US$', { group: 'Currency' }),
];

function currency(p: Params) {
  const cur = P.s(p, 'cur', '£') || '£';
  const other = P.s(p, 'other', 'US$') || 'US$';
  return {
    cur,
    other,
    xLabel: `Quantity of ${cur}`,
    yLabel: `Price of ${cur} (in ${other})`,
    D: (n = '') => `D_{${cur}${n}}`,
    S: (n = '') => `S_{${cur}${n}}`,
  };
}

const floatingRate: Template = {
  id: 'floating-exchange-rate',
  name: 'Floating exchange rate',
  unit: 'global',
  topic: FX,
  description:
    'The exchange rate is set by the demand for and supply of a currency on the foreign exchange market. A rise in demand or fall in supply appreciates the currency; a fall in demand or rise in supply depreciates it.',
  keywords: ['exchange rate', 'floating', 'appreciation', 'depreciation', 'foreign exchange market', 'currency demand', 'currency supply'],
  caption: 'A change in a floating exchange rate',
  controls: [
    select(
      'cause',
      'Change',
      [
        { value: 'dinc', label: 'Demand for the currency rises (appreciation)' },
        { value: 'ddec', label: 'Demand for the currency falls (depreciation)' },
        { value: 'sinc', label: 'Supply of the currency rises (depreciation)' },
        { value: 'sdec', label: 'Supply of the currency falls (appreciation)' },
        { value: 'none', label: 'No change (equilibrium only)' },
      ],
      'dinc',
    ),
    toggle('note', 'Label appreciation / depreciation', true),
    ...currencyControls,
    slider('shift', 'Shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const c = currency(p);
    const cause = P.s(p, 'cause', 'dinc');
    const amt = P.n(p, 'shift', 2);
    const { D, S } = sd(p);
    const d1 = D(0);
    const s1 = S(0);
    const e1 = G.meet(d1, s1);
    if (cause === 'none') {
      return {
        panels: [
          panel({
            xLabel: c.xLabel,
            yLabel: c.yLabel,
            elements: [
              curve('d1', d1, c.D(), { role: 'demand' }),
              curve('s1', s1, c.S(), { role: 'supply' }),
              eqPoint('e1', e1, 'Q_e', 'ER_e'),
            ],
          }),
        ],
      };
    }
    const isD = cause === 'dinc' || cause === 'ddec';
    const sign = cause === 'dinc' || cause === 'sinc' ? 1 : -1;
    const d2 = isD ? D(sign * amt) : d1;
    const s2 = isD ? s1 : S(sign * amt);
    const e2 = G.meet(d2, s2);
    const appreciates = e2[1] > e1[1];
    const els: El[] = [
      curve('d1', d1, isD ? c.D('1') : c.D(), { role: 'demand' }),
      ...when(isD, curve('d2', d2, c.D('2'), { role: 'demand' })),
      curve('s1', s1, isD ? c.S() : c.S('1'), { role: 'supply' }),
      ...when(!isD, curve('s2', s2, c.S('2'), { role: 'supply' })),
      shiftArrow('shift', isD ? d1 : s1, isD ? d2 : s2, { t: isD ? 0.25 : 0.72 }),
      eqPoint('e1', e1, 'Q_1', 'ER_1'),
      eqPoint('e2', e2, 'Q_2', 'ER_2'),
    ];
    if (P.b(p, 'note')) {
      els.push(
        arrow('note', [0.55, e1[1]], [0.55, e2[1]], {
          label: appreciates ? 'appreciation' : 'depreciation',
          labelDir: 'e',
          labelPos: [0.55, (e1[1] + e2[1]) / 2],
        }),
      );
    }
    return {
      panels: [
        panel({
          xLabel: c.xLabel,
          yLabel: c.yLabel,
          elements: els,
          handles: [
            dragHandle('h-shift', G.pointAt(isD ? d2 : s2, isD ? 0.15 : 0.85), 'x', 'shift', amt, {
              min: 0.5,
              max: 3.5,
              scale: sign,
              hint: 'Drag to change the size of the shift',
            }),
          ],
        }),
      ],
    };
  },
};

const fixedRate: Template = {
  id: 'fixed-exchange-rate',
  name: 'Fixed exchange rate (central bank intervention)',
  unit: 'global',
  topic: FX,
  description:
    'To hold a peg, the central bank removes any excess supply or demand at the fixed rate: it buys its own currency (using foreign reserves) when there is downward pressure, and sells its own currency when there is upward pressure.',
  keywords: ['fixed exchange rate', 'peg', 'central bank', 'intervention', 'foreign currency reserves', 'devaluation', 'revaluation'],
  caption: 'Maintaining a fixed exchange rate',
  controls: [
    select(
      'pressure',
      'Pressure on the currency',
      [
        { value: 'down', label: 'Downward (supply rises) → central bank buys its currency' },
        { value: 'up', label: 'Upward (demand rises) → central bank sells its currency' },
      ],
      'down',
    ),
    toggle('intervene', 'Show central bank intervention', true),
    toggle('free', 'Show where a free-floating rate would go', false),
    ...currencyControls,
    slider('shift', 'Size of the pressure', 0.8, 3.5, 0.1, 2, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const c = currency(p);
    const down = P.s(p, 'pressure', 'down') !== 'up';
    const amt = P.n(p, 'shift', 2);
    const { D, S } = sd(p);
    const d1 = D(0);
    const s1 = S(0);
    const peg = 5;
    // the market shock
    const d2 = down ? d1 : D(amt);
    const s2 = down ? S(amt) : s1;
    const qD = G.xAt(d2, peg);
    const qS = G.xAt(s2, peg);
    const free = G.meet(d2, s2);
    const intervene = P.b(p, 'intervene');
    const els: El[] = [
      curve('peg', G.hline(peg, 0, 9.6), 'fixed rate', { role: 'policy', dash: true }),
      tick('pegt', 'y', peg, 'ER_{fixed}'),
      curve('d1', d1, down ? c.D('1') : c.D('1'), { role: 'demand' }),
      ...when(!down, curve('d2', d2, c.D('2'), { role: 'demand' })),
      curve('s1', s1, c.S('1'), { role: 'supply' }),
      ...when(down, curve('s2', s2, c.S('2'), { role: 'supply' })),
      shiftArrow('shock', down ? s1 : d1, down ? s2 : d2, { t: down ? 0.75 : 0.22 }),
      point('qd', [qD, peg], { xLabel: down ? 'Q_1' : 'Q_2' }),
      point('qs', [qS, peg], { xLabel: down ? 'Q_2' : 'Q_1' }),
      measure('gap', [Math.min(qD, qS), peg + 0.55], [Math.max(qD, qS), peg + 0.55], down ? `excess supply of ${c.cur}` : `excess demand for ${c.cur}`, {
        labelDir: 'n',
      }),
    ];
    if (intervene) {
      if (down) {
        // central bank buys its own currency: demand shifts right to restore the peg
        const d3 = D(amt);
        els.push(
          curve('d3', d3, c.D('2'), { role: 'demand', dash: true }),
          shiftArrow('cb', d1, d3, { t: 0.2, label: `CB buys ${c.cur}`, role: 'policy' }),
        );
      } else {
        const s3 = S(amt);
        els.push(
          curve('s3', s3, c.S('2'), { role: 'supply', dash: true }),
          shiftArrow('cb', s1, s3, { t: 0.75, label: `CB sells ${c.cur}`, role: 'policy' }),
        );
      }
    }
    if (P.b(p, 'free')) {
      els.push(point('free', free, { yLabel: 'ER_2', label: 'free market', labelDir: down ? 'se' : 'nw' }));
    }
    return {
      panels: [panel({ xLabel: c.xLabel, yLabel: c.yLabel, elements: els })],
    };
  },
};

const managedRate: Template = {
  id: 'managed-exchange-rate',
  name: 'Managed exchange rate (intervention band)',
  unit: 'global',
  topic: FX,
  description:
    'In a managed float the currency moves freely within a band; the central bank intervenes only when market forces would push the rate beyond the upper or lower limit.',
  keywords: ['managed float', 'managed exchange rate', 'dirty float', 'band', 'central bank', 'intervention'],
  caption: 'A managed exchange rate',
  controls: [
    select(
      'scenario',
      'Scenario',
      [
        { value: 'up', label: 'Demand rises above the upper limit → CB sells' },
        { value: 'down', label: 'Supply rises below the lower limit → CB buys' },
        { value: 'within', label: 'Change stays within the band' },
      ],
      'up',
    ),
    toggle('intervene', 'Show central bank intervention', true),
    ...currencyControls,
    slider('band', 'Band half-width', 0.6, 2, 0.1, 1, { group: 'Shape' }),
    slider('shift', 'Size of the shift', 0.5, 4, 0.1, 3.5, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const c = currency(p);
    const scenario = P.s(p, 'scenario', 'up');
    const band = P.n(p, 'band', 1);
    const amt = P.n(p, 'shift', 3.5);
    const { D, S } = sd(p);
    const target = 5;
    const upper = target + band;
    const lower = target - band;
    const d1 = D(0);
    const s1 = S(0);
    const e1 = G.meet(d1, s1);
    const down = scenario === 'down';
    const within = scenario === 'within';
    const d2 = down ? d1 : D(within ? Math.min(amt, 1.2) : amt);
    const s2 = down ? S(amt) : s1;
    const e2 = G.meet(d2, s2);
    const breaches = !within && (e2[1] > upper + 1e-6 || e2[1] < lower - 1e-6);
    const limit = e2[1] > upper ? upper : lower;
    const els: El[] = [
      // band lines stop short of the curve-label column on the right
      curve('upper', G.hline(upper, 0, 9), '', { role: 'policy', dash: true }),
      curve('lower', G.hline(lower, 0, 9), '', { role: 'policy', dash: true }),
      tick('ut', 'y', upper, 'ER_{max}'),
      tick('lt', 'y', lower, 'ER_{min}'),
      text('utext', [0.2, upper + 0.3], 'upper limit', { anchor: 'start', size: 0.78, muted: true }),
      text('ltext', [0.2, lower + 0.3], 'lower limit', { anchor: 'start', size: 0.78, muted: true }),
      curve('d1', d1, down ? c.D() : c.D('1'), { role: 'demand' }),
      ...when(!down, curve('d2', d2, c.D('2'), { role: 'demand' })),
      curve('s1', s1, down ? c.S('1') : c.S(), { role: 'supply' }),
      ...when(down, curve('s2', s2, c.S('2'), { role: 'supply' })),
      shiftArrow('shift', down ? s1 : d1, down ? s2 : d2, { t: down ? 0.75 : 0.22 }),
    ];
    if (!breaches) {
      els.push(eqPoint('e1', e1, 'Q_1', 'ER_1'), eqPoint('e2', e2, 'Q_2', 'ER_2'));
    } else {
      const qD = G.xAt(d2, limit);
      const qS = G.xAt(s2, limit);
      const gap = Math.abs(qD - qS);
      els.push(
        point('e1', e1),
        point('qd', [qD, limit], { xLabel: 'Q_d' }),
        point('qs', [qS, limit], { xLabel: 'Q_s' }),
        measure(
          'gap',
          [Math.min(qD, qS), limit + (down ? -0.5 : 0.5)],
          [Math.max(qD, qS), limit + (down ? -0.5 : 0.5)],
          down ? `excess supply of ${c.cur}` : `excess demand for ${c.cur}`,
          { labelDir: down ? 's' : 'n' },
        ),
      );
      if (P.b(p, 'intervene')) {
        if (down) {
          const d3 = D(gap);
          els.push(
            curve('d3', d3, c.D('2'), { role: 'demand', dash: true }),
            shiftArrow('cb', d1, d3, { t: 0.15, label: `CB buys ${c.cur}`, role: 'policy' }),
          );
        } else {
          const s3 = S(gap);
          els.push(
            curve('s3', s3, c.S('2'), { role: 'supply', dash: true }),
            shiftArrow('cb', s1, s3, { t: 0.25, label: `CB sells ${c.cur}`, role: 'policy' }),
          );
        }
      }
    }
    return { panels: [panel({ xLabel: c.xLabel, yLabel: c.yLabel, elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Balance of payments

const jCurve: Template = {
  id: 'j-curve',
  name: 'J-curve',
  unit: 'global',
  topic: BOP,
  hl: true,
  description:
    'After a depreciation the current account first worsens, because import and export volumes respond slowly (demand is price-inelastic in the short run), then improves once the Marshall–Lerner condition holds.',
  keywords: ['J-curve', 'depreciation', 'devaluation', 'current account', 'Marshall-Lerner', 'balance of payments', 'time lag'],
  caption: 'The J-curve effect',
  controls: [
    toggle('phases', 'Label short-run and long-run phases', true),
    toggle('ml', 'Add Marshall–Lerner note', false),
    textInput('event', 'Event at t₀', 'Depreciation'),
    slider('initial', 'Initial current account deficit', 0, 2.5, 0.1, 1.2, { group: 'Shape' }),
    slider('depth', 'Short-run worsening', 0.5, 2.5, 0.1, 1.8, { group: 'Shape' }),
    slider('t0', 'Time of depreciation', 1, 4, 0.1, 2, { group: 'Shape' }),
  ],
  build: (p) => {
    const b = -P.n(p, 'initial', 1.2);
    const depth = P.n(p, 'depth', 1.8);
    const t0 = P.n(p, 't0', 2);
    const trough: Vec = [t0 + 1.3, b - depth];
    const pts: Vec[] = [
      [0.25, b],
      [t0, b],
      trough,
      [t0 + 3.2, b - depth * 0.35],
      [t0 + 4.6, 0.6],
      [9.4, 3.2],
    ];
    const jc = G.spline(pts);
    const cross = G.intersections(jc, G.hline(0, 0, 10)).filter((q) => q[0] > trough[0]);
    const event = P.s(p, 'event', 'Depreciation') || 'Depreciation';
    const els: El[] = [
      curve('j', jc, 'J-curve', { role: 'neutral', weight: 1.1 }),
      point('t0', [t0, b], { xLabel: 't_0', dot: true }),
      text('event', [t0, 1.4], event, { size: 0.85 }),
      arrow('eventArrow', [t0, 1.0], [t0, 0.15], { variant: 'plain' }),
      text('surplus', [0.2, 4.3], 'Surplus (+)', { anchor: 'start', muted: true, size: 0.8 }),
      text('deficit', [0.2, -4.3], 'Deficit (−)', { anchor: 'start', muted: true, size: 0.8 }),
    ];
    if (P.b(p, 'phases')) {
      els.push(
        text('sr', [trough[0], trough[1] - 0.7], 'deficit worsens\n(short run)', { size: 0.78, muted: true }),
        text('lr', [t0 + 4.2, 3.3], 'current account\nimproves (long run)', { size: 0.78, muted: true, anchor: 'end' }),
      );
    }
    if (cross[0]) els.push(point('cross', cross[0], { dot: false }));
    if (P.b(p, 'ml')) {
      els.push(
        text('mlnote', [9.6, -3.4], 'Improvement once the Marshall–Lerner\ncondition holds: PED_X + PED_M > 1', {
          anchor: 'end',
          size: 0.75,
          italic: true,
        }),
      );
    }
    return {
      panels: [
        panel({
          xLabel: 'Time',
          yLabel: 'Current account balance',
          yMin: -5,
          yMax: 5,
          origin: false,
          elements: els,
        }),
      ],
    };
  },
};

export const globalTemplates: Template[] = [
  freeTradeImporting,
  freeTradeExporting,
  comparativeAdvantage,
  tariff,
  quota,
  productionSubsidy,
  exportSubsidy,
  floatingRate,
  fixedRate,
  managedRate,
  jCurve,
];
