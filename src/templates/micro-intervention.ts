import type { El, Panel, Params, Stat, Template, Vec } from '~/engine/types';
import {
  ELASTICITY_SLOPES,
  G,
  P,
  area,
  curve,
  dragHandle,
  elasticityOptions,
  eqPoint,
  fmt,
  measure,
  money,
  num,
  panel,
  point,
  sd,
  sdLine,
  select,
  slider,
  text,
  textInput,
  tick,
  toggle,
  when,
} from './kit';

const TOPIC = 'Government intervention';

/** Lower boundary for producer-surplus areas: the supply curve, never below the x-axis. */
const floor0 = (c: Vec[], x0: number, x1: number): Vec[] => G.fn((x) => Math.max(0, G.yAt(c, x)), x0, x1, 80);

/** x-position for a vertical "tax/subsidy per unit" marker, clear of the equilibrium guides. */
function markerX(upper: Vec[], lower: Vec[], qa: number, qb: number): number {
  const right = Math.max(qa, qb);
  for (const x of [right + 1.6, right + 1.2, right + 0.8]) {
    if (G.yAt(upper, x) <= 9.3 && G.yAt(lower, x) >= 0.6 && x <= 9) return x;
  }
  return Math.min(qa, qb) * 0.55;
}

const slopes = (p: Params) => ({
  dSlope: ELASTICITY_SLOPES[P.s(p, 'dEl', 'normal')]?.d ?? -0.8,
  sSlope: ELASTICITY_SLOPES[P.s(p, 'sEl', 'normal')]?.s ?? 0.8,
});

const elasticityControls = [
  select('dEl', 'Demand', elasticityOptions, 'normal', { group: 'Shape' }),
  select('sEl', 'Supply', elasticityOptions, 'normal', { group: 'Shape' }),
];

// ---------------------------------------------------------------------------
// Indirect taxes

interface TaxOpts {
  id?: string;
  title?: string;
  mode: 'specific' | 'advalorem';
  /** per-unit tax (specific) or rate in % (ad valorem) */
  amount: number;
  dSlope: number;
  sSlope: number;
  revenue: boolean;
  incidence: boolean;
  dwl: boolean;
  marker: boolean;
  compact?: boolean;
  handle?: boolean;
}

function taxPanel(o: TaxOpts): Panel {
  const d = sdLine([5, 5], o.dSlope);
  const s = sdLine([5, 5], o.sSlope);
  const rate = o.amount / 100;
  const st =
    o.mode === 'specific'
      ? sdLine([5, 5 + o.amount], o.sSlope, { yLo: Math.min(0.9 + o.amount, 9) })
      : G.mapY(s, (y) => y * (1 + rate));
  const [qe, pe] = G.meet(d, s);
  const [qt, pc] = G.meet(d, st);
  const pp = o.mode === 'specific' ? pc - o.amount : pc / (1 + rate);
  const els: El[] = [];
  if (o.incidence) {
    els.push(
      area('consumer', G.rect(0, pe, qt, pc), 'cs', 'Consumer burden', 'Tax paid by consumers'),
      area('producer', G.rect(0, pp, qt, pe), 'ps', 'Producer burden', 'Tax paid by producers'),
    );
  } else if (o.revenue) {
    els.push(area('revenue', G.rect(0, pp, qt, pc), 'gov', 'Tax revenue', 'Government tax revenue'));
  }
  if (o.dwl) els.push(area('dwl', [[qt, pc], [qe, pe], [qt, pp]], 'dwl', 'WL', 'Welfare (deadweight) loss'));
  els.push(
    curve('d', d, 'D', { role: 'demand' }),
    // steep supply curves both end at the top edge: put the labels either side
    curve('s', s, 'S', { role: 'supply', ...(o.sSlope > 1.2 ? { labelDir: 'ne' as const } : {}) }),
    curve('stax', st, o.mode === 'specific' ? 'S + tax' : `S + ${fmt(o.amount, 0)}% tax`, {
      role: 'supply',
      ...(o.sSlope > 1.2 ? { labelDir: 'nw' as const } : {}),
    }),
    eqPoint('e1', [qe, pe], 'Q_e', 'P_e'),
    eqPoint('e2', [qt, pc], 'Q_t', 'P_c'),
    point('pp', [qt, pp], { yLabel: 'P_p' }),
  );
  const xm = markerX(st, s, qe, qt);
  if (o.marker) els.push(measure('tax', [xm, G.yAt(s, xm)], [xm, G.yAt(st, xm)], 'tax', { labelDir: 'e' }));
  const handleAt: Vec = [xm, G.yAt(st, xm)];
  return panel({
    id: o.id ?? 'main',
    title: o.title,
    width: o.compact ? 380 : undefined,
    height: o.compact ? 330 : undefined,
    elements: els,
    handles: o.handle
      ? [
          o.mode === 'specific'
            ? dragHandle('h-tax', handleAt, 'y', 'tax', o.amount, { min: 0.5, max: 4, hint: 'Drag to change the tax per unit' })
            : dragHandle('h-rate', handleAt, 'y', 'rate', o.amount, {
                min: 10,
                max: 100,
                scale: 100 / Math.max(0.5, G.yAt(s, xm)),
                hint: 'Drag to change the tax rate',
              }),
        ]
      : [],
  });
}

const taxToggles = [
  toggle('revenue', 'Shade tax revenue', true),
  toggle('incidence', 'Split the tax into consumer and producer burden', false),
  toggle('dwl', 'Shade welfare loss', true),
  toggle('marker', 'Mark the tax per unit', true),
];

const specificTax: Template = {
  id: 'indirect-tax-specific',
  name: 'Specific (per-unit) indirect tax',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A per-unit tax shifts supply up by the amount of the tax: consumers pay more, producers receive less, the government earns revenue and there is a welfare loss.',
  keywords: ['indirect tax', 'specific tax', 'per unit tax', 'excise', 'tax incidence', 'tax revenue', 'welfare loss', 'deadweight loss', 'consumer price', 'producer price'],
  caption: 'Effect of a specific indirect tax',
  controls: [slider('tax', 'Tax per unit', 0.5, 4, 0.1, 2, { group: 'Tax' }), ...taxToggles, ...elasticityControls],
  build: (p) => ({
    panels: [
      taxPanel({
        mode: 'specific',
        amount: P.n(p, 'tax', 2),
        ...slopes(p),
        revenue: P.b(p, 'revenue'),
        incidence: P.b(p, 'incidence'),
        dwl: P.b(p, 'dwl'),
        marker: P.b(p, 'marker'),
        handle: true,
      }),
    ],
  }),
};

const adValoremTax: Template = {
  id: 'indirect-tax-ad-valorem',
  name: 'Ad valorem (percentage) indirect tax',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A percentage tax (e.g. VAT/GST) pivots the supply curve upwards: the tax per unit grows as the price rises.',
  keywords: ['ad valorem tax', 'percentage tax', 'VAT', 'GST', 'sales tax', 'indirect tax', 'pivot', 'tax incidence', 'welfare loss'],
  caption: 'Effect of an ad valorem tax',
  controls: [slider('rate', 'Tax rate (%)', 10, 100, 5, 40, { group: 'Tax' }), ...taxToggles, ...elasticityControls],
  build: (p) => ({
    panels: [
      taxPanel({
        mode: 'advalorem',
        amount: P.n(p, 'rate', 40),
        ...slopes(p),
        revenue: P.b(p, 'revenue'),
        incidence: P.b(p, 'incidence'),
        dwl: P.b(p, 'dwl'),
        marker: P.b(p, 'marker'),
        handle: true,
      }),
    ],
  }),
};

const taxIncidence: Template = {
  id: 'tax-incidence-elasticity',
  name: 'Tax incidence and elasticity (comparison)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'The burden of an indirect tax falls mostly on whichever side of the market is more price inelastic.',
  keywords: ['tax incidence', 'tax burden', 'elasticity', 'inelastic demand', 'elastic demand', 'consumer burden', 'producer burden', 'indirect tax'],
  caption: 'Tax incidence depends on price elasticity',
  controls: [
    select('compare', 'Compare', [
      { value: 'demand', label: 'Inelastic vs elastic demand' },
      { value: 'supply', label: 'Inelastic vs elastic supply' },
    ], 'demand'),
    slider('tax', 'Tax per unit', 0.5, 3, 0.1, 2, { group: 'Tax' }),
    toggle('incidence', 'Split the tax into consumer and producer burden', true),
    toggle('revenue', 'Shade tax revenue', true, { show: (p) => !p.incidence }),
    toggle('dwl', 'Shade welfare loss', true),
    toggle('marker', 'Mark the tax per unit', false),
  ],
  build: (p) => {
    const byDemand = P.s(p, 'compare') !== 'supply';
    const common = {
      mode: 'specific' as const,
      amount: P.n(p, 'tax', 2),
      revenue: P.b(p, 'revenue'),
      incidence: P.b(p, 'incidence'),
      dwl: P.b(p, 'dwl'),
      marker: P.b(p, 'marker'),
      compact: true,
    };
    const inel = ELASTICITY_SLOPES.inelastic;
    const el = ELASTICITY_SLOPES.elastic;
    return {
      panels: [
        taxPanel({
          ...common,
          id: 'inelastic',
          title: byDemand ? 'Inelastic demand' : 'Inelastic supply',
          dSlope: byDemand ? inel.d : -0.8,
          sSlope: byDemand ? 0.8 : inel.s,
        }),
        taxPanel({
          ...common,
          id: 'elastic',
          title: byDemand ? 'Elastic demand' : 'Elastic supply',
          dSlope: byDemand ? el.d : -0.8,
          sSlope: byDemand ? 0.8 : el.s,
        }),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Subsidy

const subsidy: Template = {
  id: 'subsidy',
  name: 'Subsidy to producers',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A per-unit subsidy shifts supply down by the subsidy: consumers pay less, producers receive more, output rises and the government pays the subsidy on every unit.',
  keywords: ['subsidy', 'government spending', 'producer subsidy', 'consumer price', 'over-allocation', 'welfare loss', 'opportunity cost'],
  caption: 'Effect of a subsidy',
  controls: [
    slider('sub', 'Subsidy per unit', 0.5, 3, 0.1, 1.8, { group: 'Subsidy' }),
    toggle('spending', 'Shade government spending', true),
    toggle('gains', 'Show consumer and producer gains', false),
    toggle('dwl', 'Shade welfare loss', true),
    toggle('marker', 'Mark the subsidy per unit', true),
    ...elasticityControls,
  ],
  build: (p) => {
    const { dSlope, sSlope } = slopes(p);
    const sub = P.n(p, 'sub', 1.8);
    const d = sdLine([5, 5], dSlope);
    const s = sdLine([5, 5], sSlope);
    const ss = sdLine([5, 5 - sub], sSlope, { yLo: 0.5 });
    const [qe, pe] = G.meet(d, s);
    const [qs, pc] = G.meet(d, ss);
    const pp = pc + sub;
    const gains = P.b(p, 'gains');
    const els: El[] = [];
    if (gains) {
      els.push(
        area('csgain', [[0, pe], [qe, pe], [qs, pc], [0, pc]], 'cs', 'CS gain', 'Gain in consumer surplus'),
        area('psgain', [[0, pp], [qs, pp], [qe, pe], [0, pe]], 'ps', 'PS gain', 'Gain in producer surplus'),
      );
    } else if (P.b(p, 'spending')) {
      els.push(area('spending', G.rect(0, pc, qs, pp), 'gov', 'Subsidy cost', 'Government spending on the subsidy'));
    }
    if (P.b(p, 'dwl')) els.push(area('dwl', [[qe, pe], [qs, pp], [qs, pc]], 'dwl', 'WL', 'Welfare loss (over-allocation)'));
    const xm = markerX(s, ss, qe, qs);
    els.push(
      curve('d', d, 'D', { role: 'demand' }),
      curve('s', s, 'S', { role: 'supply' }),
      curve('ssub', ss, 'S − subsidy', { role: 'supply' }),
      eqPoint('e1', [qe, pe], 'Q_e', 'P_e'),
      eqPoint('e2', [qs, pc], 'Q_{sb}', 'P_c'),
      point('pp', [qs, pp], { yLabel: 'P_p' }),
      ...when(P.b(p, 'marker'), measure('subsidy', [xm, G.yAt(ss, xm)], [xm, G.yAt(s, xm)], 'subsidy', { labelDir: 'e' })),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [
            dragHandle('h-sub', [xm, G.yAt(ss, xm)], 'y', 'sub', sub, {
              min: 0.5,
              max: 3,
              scale: -1,
              hint: 'Drag to change the subsidy per unit',
            }),
          ],
        }),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Price controls

const priceCeiling: Template = {
  id: 'price-ceiling',
  name: 'Price ceiling (maximum price)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A maximum price set below equilibrium creates a shortage (excess demand), a welfare loss and the conditions for a parallel (black) market.',
  keywords: ['price ceiling', 'maximum price', 'rent control', 'shortage', 'excess demand', 'parallel market', 'black market', 'rationing', 'welfare loss'],
  caption: 'Effect of a maximum price',
  controls: [
    slider('pmax', 'Maximum price', 1.5, 4.6, 0.1, 3.4, { group: 'Policy' }),
    toggle('shortage', 'Mark the shortage', true),
    toggle('dwl', 'Shade welfare loss', true),
    toggle('welfare', 'Shade consumer and producer surplus after the ceiling', false),
    toggle('parallel', 'Show the parallel (black) market price', false),
    ...sdShape(),
  ],
  build: (p) => {
    const { D, S } = sd(p);
    const d = D();
    const s = S();
    const [qe, pe] = G.meet(d, s);
    const pm = Math.min(P.n(p, 'pmax', 3.4), pe - 0.2);
    const qs = G.xAt(s, pm);
    const qd = G.xAt(d, pm);
    const pb = G.yAt(d, qs);
    const els: El[] = [];
    if (P.b(p, 'welfare')) {
      els.push(
        area('cs', G.between(d, G.hline(pm, 0, qs), 0, qs), 'cs', 'CS', 'Consumer surplus'),
        area('ps', G.between(G.hline(pm, 0, qs), floor0(s, 0, qs), 0, qs), 'ps', 'PS', 'Producer surplus'),
      );
    }
    if (P.b(p, 'dwl')) els.push(area('dwl', [[qs, pb], [qe, pe], [qs, pm]], 'dwl', 'WL', 'Welfare loss'));
    els.push(
      curve('d', d, 'D', { role: 'demand' }),
      curve('s', s, 'S', { role: 'supply' }),
      curve('ceiling', G.hline(pm, 0, lineEnd(qs, qd)), 'Price ceiling', { role: 'policy' }),
      tick('pmax', 'y', pm, 'P_{max}'),
      eqPoint('e', [qe, pe], 'Q_e', 'P_e'),
      point('qs', [qs, pm], { xLabel: 'Q_s' }),
      point('qd', [qd, pm], { xLabel: 'Q_d' }),
      ...when(P.b(p, 'shortage'), measure('shortage', [qs, pm - 0.5], [qd, pm - 0.5], 'shortage', { labelDir: 's' })),
      ...when(P.b(p, 'parallel'), point('pb', [qs, pb], { yLabel: 'P_{pm}', label: 'parallel market', labelDir: 'ne' })),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [dragHandle('h-pmax', [lineEnd(qs, qd) - 0.4, pm], 'y', 'pmax', pm, { min: 1.5, max: 4.6, hint: 'Drag to move the price ceiling' })],
        }),
      ],
    };
  },
};

const priceFloor: Template = {
  id: 'price-floor',
  name: 'Price floor (minimum price)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A minimum price set above equilibrium creates a surplus (excess supply); the government may buy the surplus, at a cost to taxpayers.',
  keywords: ['price floor', 'minimum price', 'price support', 'agriculture', 'surplus', 'excess supply', 'government purchase', 'welfare loss'],
  caption: 'Effect of a minimum price',
  controls: [
    slider('pmin', 'Minimum price', 5.4, 8.6, 0.1, 6.6, { group: 'Policy' }),
    toggle('surplus', 'Mark the surplus', true),
    toggle('buy', 'Government buys the surplus', false),
    toggle('dwl', 'Shade welfare loss', true, { show: (p) => !p.buy }),
    toggle('welfare', 'Shade consumer and producer surplus after the floor', false),
    ...sdShape(),
  ],
  build: (p) => {
    const { D, S } = sd(p);
    const d = D();
    const s = S();
    const [qe, pe] = G.meet(d, s);
    const pm = Math.max(P.n(p, 'pmin', 6.6), pe + 0.2);
    const qd = G.xAt(d, pm);
    const qs = G.xAt(s, pm);
    const buy = P.b(p, 'buy');
    const els: El[] = [];
    if (buy) els.push(area('spend', G.rect(qd, 0, qs, pm), 'gov', 'Gov. spending', 'Government purchase of the surplus'));
    if (P.b(p, 'welfare')) {
      const sold = buy ? qs : qd;
      els.push(
        area('cs', G.between(d, G.hline(pm, 0, qd), 0, qd), 'cs', 'CS', 'Consumer surplus'),
        area('ps', G.between(G.hline(pm, 0, sold), floor0(s, 0, sold), 0, sold), 'ps', 'PS', 'Producer surplus'),
      );
    }
    if (P.b(p, 'dwl') && !buy) els.push(area('dwl', [[qd, pm], [qe, pe], [qd, G.yAt(s, qd)]], 'dwl', 'WL', 'Welfare loss'));
    els.push(
      curve('d', d, 'D', { role: 'demand' }),
      curve('s', s, 'S', { role: 'supply' }),
      curve('floor', G.hline(pm, 0, lineEnd(qs, qd)), 'Price floor', { role: 'policy' }),
      tick('pmin', 'y', pm, 'P_{min}'),
      eqPoint('e', [qe, pe], 'Q_e', 'P_e'),
      point('qd', [qd, pm], { xLabel: 'Q_d' }),
      point('qs', [qs, pm], { xLabel: 'Q_s' }),
      ...when(P.b(p, 'surplus'), measure('surplus', [qd, pm + 0.5], [qs, pm + 0.5], 'surplus', { labelDir: 'n' })),
    );
    return {
      panels: [
        panel({
          elements: els,
          handles: [dragHandle('h-pmin', [lineEnd(qs, qd) - 0.4, pm], 'y', 'pmin', pm, { min: 5.4, max: 8.6, hint: 'Drag to move the price floor' })],
        }),
      ],
    };
  },
};

/** End of a horizontal policy line: past both key quantities, but leaving room for its label. */
function lineEnd(qa: number, qb: number, base = 8.2): number {
  return Math.min(9.6, Math.max(base, qa + 0.6, qb + 0.6));
}

function sdShape(d = 'Demand steepness', s = 'Supply steepness') {
  return [
    slider('dSlope', d, 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
    slider('sSlope', s, 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ];
}

const minimumWage: Template = {
  id: 'minimum-wage',
  name: 'Minimum wage (labour market)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A minimum wage above the equilibrium wage raises pay for those employed but creates unemployment: the quantity of labour supplied exceeds the quantity demanded.',
  keywords: ['minimum wage', 'labour market', 'unemployment', 'wage rate', 'excess supply of labour', 'price floor', 'real wage unemployment'],
  caption: 'Effect of a minimum wage',
  controls: [
    slider('wmin', 'Minimum wage', 5.4, 8.6, 0.1, 6.8, { group: 'Policy' }),
    toggle('unemployment', 'Mark the unemployment', true),
    toggle('dwl', 'Shade welfare loss', false),
    ...sdShape('Labour demand steepness', 'Labour supply steepness'),
  ],
  build: (p) => {
    const { D, S } = sd(p);
    const d = D();
    const s = S();
    const [qe, we] = G.meet(d, s);
    const wm = Math.max(P.n(p, 'wmin', 6.8), we + 0.2);
    const qd = G.xAt(d, wm);
    const qs = G.xAt(s, wm);
    return {
      panels: [
        panel({
          xLabel: 'Quantity of labour',
          yLabel: 'Wage rate',
          elements: [
            ...when(P.b(p, 'dwl'), area('dwl', [[qd, wm], [qe, we], [qd, G.yAt(s, qd)]], 'dwl', 'WL', 'Welfare loss')),
            curve('d', d, 'D_L', { role: 'demand' }),
            curve('s', s, 'S_L', { role: 'supply' }),
            curve('wmin', G.hline(wm, 0, lineEnd(qs, qd, 7.6)), 'Minimum wage', { role: 'policy' }),
            tick('wminTick', 'y', wm, 'W_{min}'),
            eqPoint('e', [qe, we], 'Q_e', 'W_e'),
            point('qd', [qd, wm], { xLabel: 'Q_d' }),
            point('qs', [qs, wm], { xLabel: 'Q_s' }),
            ...when(
              P.b(p, 'unemployment'),
              measure('unemp', [qd, wm + 0.5], [qs, wm + 0.5], 'unemployment', { labelDir: 'n' }),
            ),
          ],
          handles: [dragHandle('h-wmin', [lineEnd(qs, qd, 7.6) - 0.4, wm], 'y', 'wmin', wm, { min: 5.4, max: 8.6, hint: 'Drag to move the minimum wage' })],
        }),
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// HL: linear demand and supply functions with numbers

function niceMax(v: number): number {
  const ticks = G.niceTicks(0, v, 5);
  const last = ticks[ticks.length - 1];
  if (last >= v - 1e-9) return last;
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : v;
  return last + step;
}

const linearFunctions: Template = {
  id: 'linear-demand-supply',
  name: 'Linear demand and supply functions (numeric)',
  unit: 'micro',
  topic: 'Linear functions (HL)',
  hl: true,
  description:
    'Plot Qd = a − bP and Qs = c + dP from real numbers, find equilibrium, and calculate surplus, tax revenue, subsidy cost, shortages and welfare loss.',
  keywords: ['linear demand function', 'linear supply function', 'Qd = a - bP', 'Qs = c + dP', 'HL', 'paper 3', 'calculate', 'equilibrium', 'consumer surplus', 'tax revenue', 'welfare loss', 'quantitative'],
  caption: 'Linear demand and supply',
  controls: [
    num('a', 'Demand: a (in Qd = a − bP)', 120, { group: 'Functions', step: 1 }),
    num('b', 'Demand: b', 10, { group: 'Functions', step: 0.5, min: 0.01 }),
    num('c', 'Supply: c (in Qs = c + dP)', -30, { group: 'Functions', step: 1 }),
    num('d', 'Supply: d', 20, { group: 'Functions', step: 0.5, min: 0.01 }),
    select('policy', 'Intervention', [
      { value: 'none', label: 'None' },
      { value: 'tax', label: 'Per-unit tax' },
      { value: 'subsidy', label: 'Per-unit subsidy' },
      { value: 'max', label: 'Maximum price' },
      { value: 'min', label: 'Minimum price' },
    ], 'none', { group: 'Intervention' }),
    num('amount', 'Tax / subsidy per unit', 1.5, {
      group: 'Intervention',
      step: 0.1,
      min: 0,
      show: (p) => p.policy === 'tax' || p.policy === 'subsidy',
    }),
    num('pmax', 'Maximum price', 4, { group: 'Intervention', step: 0.1, show: (p) => p.policy === 'max' }),
    num('pmin', 'Minimum price', 6, { group: 'Intervention', step: 0.1, show: (p) => p.policy === 'min' }),
    toggle('policyAreas', 'Shade revenue / cost and welfare loss', true),
    toggle('surplus', 'Shade consumer and producer surplus', false),
    select('axisMode', 'Axis labels', [
      { value: 'values', label: 'Values at the key points' },
      { value: 'ticks', label: 'Numeric scale + symbols' },
    ], 'values'),
    textInput('cur', 'Currency symbol', '$'),
  ],
  build: (p) => {
    const a = P.n(p, 'a', 120);
    const b = P.n(p, 'b', 10);
    const c = P.n(p, 'c', -30);
    const dd = P.n(p, 'd', 20);
    const cur = P.s(p, 'cur', '$');
    const valuesMode = P.s(p, 'axisMode', 'values') !== 'ticks';
    const policy = P.s(p, 'policy', 'none');
    const pe = (a - c) / (b + dd);
    const qe = a - b * pe;
    const yLabel = `Price (${cur})`;

    if (!(b > 0 && dd > 0 && pe > 0 && qe > 0 && a > 0)) {
      return {
        panels: [
          panel({
            yLabel,
            elements: [text('err', [5, 5], 'No positive equilibrium:\ncheck that a, b, d > 0 and a > c', { muted: true })],
          }),
        ],
        stats: [{ label: 'Error', value: 'No positive equilibrium for these functions' }],
      };
    }

    const amount = Math.max(0, P.n(p, 'amount', 1.5));
    const pDem = (q: number) => (a - q) / b;
    /** Supply drawn as price as a function of quantity, shifted vertically by k. */
    const supplyLine = (k: number, yTop: number): Vec[] => {
      const p0 = -c / dd + k;
      const start: Vec = p0 >= 0 ? [0, p0] : [c - dd * k, 0];
      const qEnd = Math.min(c + dd * (yTop - k), xMax * 0.88);
      return [start, [qEnd, (qEnd - c) / dd + k]];
    };

    const yMax = niceMax(Math.max(a / b, policy === 'min' ? P.n(p, 'pmin', 6) : 0) * 1.08);
    const xMax = niceMax(Math.max(a, qe * 1.4) * 1.04);
    const yTop = yMax * 1.5;
    const dLine: Vec[] = [[0, a / b], [a, 0]];
    const sLine = supplyLine(0, yTop);
    // long version of S for areas that extrapolate below the axis
    const sExt: Vec[] = [[-xMax, (-xMax - c) / dd], [xMax * 2, (xMax * 2 - c) / dd]];
    const sFloor = (x0: number, x1: number) => G.fn((q) => Math.max(0, (q - c) / dd), x0, x1, 60);
    const area2 = (poly: Vec[]) => G.polygonArea(poly);

    const P$ = (v: number) => money(v, cur);
    const Q = (v: number) => fmt(v, 2);
    const yl = (name: string, v: number) => (valuesMode ? P$(v) : name);
    const xl = (name: string, v: number) => (valuesMode ? Q(v) : name);
    const dy = yMax * 0.045;

    const csBefore = area2(G.between(dLine, G.hline(pe, 0, qe), 0, qe));
    const psBefore = area2(G.between(G.hline(pe, 0, qe), sFloor(0, qe), 0, qe));
    const stats: Stat[] = [
      { label: 'Equilibrium price', value: P$(pe) },
      { label: 'Equilibrium quantity', value: Q(qe) },
      { label: 'Consumer surplus (free market)', value: P$(csBefore) },
      { label: 'Producer surplus (free market)', value: P$(psBefore) },
    ];

    const els: El[] = [];
    const areasFirst: El[] = [];
    const showPolicy = P.b(p, 'policyAreas');
    const showSurplus = P.b(p, 'surplus');
    els.push(
      curve('d', dLine, 'D', { role: 'demand', labelAt: [a * 0.9, pDem(a * 0.9)], labelDir: 'ne' }),
      curve('s', sLine, 'S', { role: 'supply' }),
      eqPoint('e', [qe, pe], xl('Q_e', qe), yl('P_e', pe)),
    );

    let csAfter = csBefore;
    let psAfter = psBefore;
    if (policy === 'tax' || policy === 'subsidy') {
      const tax = policy === 'tax';
      const k = tax ? amount : -amount;
      const pc = (a - c + dd * k) / (b + dd);
      const q1 = a - b * pc;
      const pp = pc - k;
      if (q1 <= 0 || pc <= 0) {
        stats.push({ label: 'Note', value: 'The tax/subsidy is too large for a positive quantity' });
      } else {
        els.push(
          curve('s2', supplyLine(k, yTop), tax ? 'S + tax' : 'S − subsidy', { role: 'supply' }),
          eqPoint('e2', [q1, pc], xl(tax ? 'Q_t' : 'Q_{sb}', q1), yl('P_c', pc)),
          point('pp', [q1, pp], { yLabel: yl('P_p', pp) }),
        );
        csAfter = area2(G.between(dLine, G.hline(pc, 0, q1), 0, q1));
        psAfter = area2(G.between(G.hline(pp, 0, q1), sFloor(0, q1), 0, q1));
        const flow = amount * q1;
        const dwlPoly: Vec[] = tax ? [[q1, pc], [qe, pe], [q1, pp]] : [[qe, pe], [q1, pp], [q1, pc]];
        if (showPolicy) {
          areasFirst.push(
            area('gov', G.rect(0, Math.min(pc, pp), q1, Math.max(pc, pp)), 'gov', tax ? 'Tax revenue' : 'Subsidy cost', tax ? 'Government tax revenue' : 'Government spending on the subsidy'),
            area('dwl', dwlPoly, 'dwl', 'WL', 'Welfare loss'),
          );
        }
        stats.push(
          { label: 'Price paid by consumers (Pc)', value: P$(pc) },
          { label: 'Price received by producers (Pp)', value: P$(pp) },
          { label: 'Quantity traded', value: Q(q1) },
          { label: tax ? 'Tax revenue' : 'Government spending', value: P$(flow) },
        );
        if (tax) {
          stats.push(
            { label: 'Tax paid by consumers', value: `${P$((pc - pe) * q1)} (${fmt(((pc - pe) / amount) * 100, 1)}%)` },
            { label: 'Tax paid by producers', value: `${P$((pe - pp) * q1)} (${fmt(((pe - pp) / amount) * 100, 1)}%)` },
          );
        } else {
          stats.push(
            { label: 'Consumer gain per unit', value: P$(pe - pc) },
            { label: 'Producer gain per unit', value: P$(pp - pe) },
          );
        }
        stats.push(
          { label: 'Consumer surplus (after)', value: P$(csAfter) },
          { label: 'Producer surplus (after)', value: P$(psAfter) },
          { label: 'Welfare loss', value: P$(area2(dwlPoly)) },
        );
        if (showSurplus) {
          areasFirst.push(
            area('cs', G.between(dLine, G.hline(pc, 0, q1), 0, q1), 'cs', 'CS', 'Consumer surplus'),
            area('ps', G.between(G.hline(pp, 0, q1), sFloor(0, q1), 0, q1), 'ps', 'PS', 'Producer surplus'),
          );
        }
      }
    } else if (policy === 'max' || policy === 'min') {
      const isMax = policy === 'max';
      const pr = isMax ? P.n(p, 'pmax', 4) : P.n(p, 'pmin', 6);
      const binding = isMax ? pr < pe : pr > pe;
      els.push(
        curve('control', G.hline(pr, 0, xMax * 0.92), isMax ? 'Max price' : 'Min price', { role: 'policy' }),
        tick('ctl', 'y', pr, yl(isMax ? 'P_{max}' : 'P_{min}', pr)),
      );
      if (!binding) {
        stats.push({ label: 'Note', value: `Not binding: the ${isMax ? 'maximum' : 'minimum'} price is ${isMax ? 'above' : 'below'} equilibrium` });
      } else {
        const qd = Math.max(0, a - b * pr);
        const qs = Math.max(0, c + dd * pr);
        const traded = Math.min(qd, qs);
        els.push(point('qd', [qd, pr], { xLabel: xl('Q_d', qd) }), point('qs', [qs, pr], { xLabel: xl('Q_s', qs) }));
        els.push(
          measure('gap', [Math.min(qd, qs), pr + (isMax ? -dy : dy)], [Math.max(qd, qs), pr + (isMax ? -dy : dy)], isMax ? 'shortage' : 'surplus', {
            labelDir: isMax ? 's' : 'n',
          }),
        );
        const dwlPoly = G.between(dLine, sExt, traded, qe);
        csAfter = area2(G.between(dLine, G.hline(pr, 0, traded), 0, traded));
        psAfter = area2(G.between(G.hline(pr, 0, traded), sFloor(0, traded), 0, traded));
        if (showPolicy) areasFirst.push(area('dwl', dwlPoly, 'dwl', 'WL', 'Welfare loss'));
        if (showSurplus) {
          areasFirst.push(
            area('cs', G.between(dLine, G.hline(pr, 0, traded), 0, traded), 'cs', 'CS', 'Consumer surplus'),
            area('ps', G.between(G.hline(pr, 0, traded), sFloor(0, traded), 0, traded), 'ps', 'PS', 'Producer surplus'),
          );
        }
        stats.push(
          { label: 'Quantity demanded', value: Q(qd) },
          { label: 'Quantity supplied', value: Q(qs) },
          { label: isMax ? 'Shortage' : 'Surplus', value: Q(Math.abs(qd - qs)) },
          { label: 'Consumer surplus (after)', value: P$(csAfter) },
          { label: 'Producer surplus (after)', value: P$(psAfter) },
          { label: 'Welfare loss', value: P$(area2(dwlPoly)) },
        );
        if (!isMax) stats.push({ label: 'Cost if government buys the surplus', value: P$(pr * (qs - qd)) });
      }
    } else if (showSurplus) {
      areasFirst.push(
        area('cs', G.between(dLine, G.hline(pe, 0, qe), 0, qe), 'cs', 'CS', 'Consumer surplus'),
        area('ps', G.between(G.hline(pe, 0, qe), sFloor(0, qe), 0, qe), 'ps', 'PS', 'Producer surplus'),
      );
    }

    // numeric ticks, minus any that would sit on top of a labelled key point
    const keys = (axis: 0 | 1) =>
      els.flatMap((e) => (e.kind === 'point' ? [e.at[axis]] : e.kind === 'tick' && (e.axis === 'x') === (axis === 0) ? [e.value] : []));
    const ticks = (max: number, axis: 0 | 1, f: (v: number) => string) =>
      G.niceTicks(0, max, 5)
        .filter((v) => v > 0 && keys(axis).every((k) => Math.abs(k - v) > max * 0.05))
        .map((v) => ({ value: v, label: f(v) }));
    return {
      panels: [
        panel({
          yLabel,
          xMax,
          yMax,
          xTicks: valuesMode ? undefined : ticks(xMax, 0, (v) => fmt(v, 2)),
          yTicks: valuesMode ? undefined : ticks(yMax, 1, (v) => fmt(v, 2)),
          elements: [...areasFirst, ...els],
        }),
      ],
      stats,
    };
  },
};

export const microInterventionTemplates: Template[] = [
  specificTax,
  adValoremTax,
  taxIncidence,
  subsidy,
  priceCeiling,
  priceFloor,
  minimumWage,
  linearFunctions,
];
