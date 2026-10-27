import type { CurveEl, CurveRole, El, Panel, Template, Vec } from '~/engine/types';
import {
  G,
  P,
  area,
  costCurve,
  costModel,
  curve,
  eqPoint,
  linearDemand,
  measure,
  panel,
  point,
  sdLine,
  select,
  shiftArrow,
  slider,
  text,
  tick,
  toggle,
  when,
  type CostModel,
} from './kit';

const T_COST = 'Costs & revenues (HL)';
const T_PC = 'Perfect competition (HL)';
const T_MON = 'Monopoly (HL)';
const T_IMP = 'Imperfect competition (HL)';

/** Firm panel: "Costs, revenue" against "Output". */
const firmPanel = (p: Partial<Panel> & { elements: El[] }): Panel =>
  panel({ xLabel: 'Output', yLabel: 'Costs, revenue', ...p });

/** Horizontal line whose label sits inside the plot, above its right end. */
function hLine(id: string, y: number, label: string, role: CurveRole, x0 = 0, x1 = 9.8): CurveEl {
  return curve(id, G.hline(y, x0, x1), label, { role, labelAt: [x1, y], labelDir: 'nw' });
}

/** The standard family of short-run cost curves. */
function costEls(
  cm: CostModel,
  o: { mc?: boolean; atc?: boolean; avc?: boolean; afc?: boolean; q1?: number } = {},
): El[] {
  const { mc = true, atc = true, avc = false, afc = false, q1 = 9.3 } = o;
  return [
    ...when(afc, curve('afc', costCurve(cm.afc, 0.6, q1), 'AFC', { role: 'afc' })),
    ...when(avc, curve('avc', costCurve(cm.avc, 0.3, q1), 'AVC', { role: 'avc' })),
    ...when(atc, curve('atc', costCurve(cm.atc, 0.5, q1), 'ATC', { role: 'atc' })),
    ...when(mc, curve('mc', costCurve(cm.mc, 0.3, 10), 'MC', { role: 'mc' })),
  ];
}

/**
 * Cost model for firms with market power: MC bottoms out early (q = 2) so the
 * MC = MR intersection always sits on the clearly rising part of MC.
 */
const powerCosts = (F = 6) => costModel({ F, k: 3, c: 0.12, m: 3 });

/** Profit (or loss) rectangle between price and ATC up to output q. */
function profitRect(id: string, q: number, price: number, cost: number, label = true) {
  const profit = price >= cost;
  return area(
    id,
    G.rect(0, Math.min(price, cost), q, Math.max(price, cost)),
    profit ? 'profit' : 'loss',
    label ? (profit ? 'Abnormal profit' : 'Loss') : undefined,
    profit ? 'Abnormal (economic) profit' : 'Economic loss',
  );
}

/** Linear AR curve trimmed to the plot, plus its MR (stopping above the axis unless `mrTo` is given). */
function arMr(A: number, B: number, mrTo?: number) {
  const d = linearDemand(A, B);
  const q0 = Math.max(0, (A - 10) / B);
  const ar = G.lineX([0, A], -B, q0, Math.min(9.5, (A - 1.1) / B));
  const mr = G.lineX([0, A], -2 * B, Math.max(0, (A - 9.7) / (2 * B)), mrTo ?? (A - 0.9) / (2 * B));
  return { d, ar, mr };
}

/** AR and MR curves with labels to the right of their lower ends. */
function arMrEls(ar: Vec[], mr: Vec[], arLabel = 'D = AR', mrLabel = 'MR'): El[] {
  return [
    curve('ar', ar, arLabel, { role: 'demand', labelDir: 'e' }),
    curve('mr', mr, mrLabel, { role: 'mr', labelDir: 'e' }),
  ];
}

/** Constant marginal (= average) cost line, labelled just outside the plot. */
function mcLine(y: number, x1 = 9.4): CurveEl {
  return curve('mc', G.hline(y, 0, x1), 'MC = AC', { role: 'mc', labelAt: [x1, y], labelDir: 'e' });
}

/** Firm's horizontal price line, labelled just outside the plot on the right. */
function priceLine(id: string, y: number, label = 'P = MR\n= AR'): CurveEl {
  return curve(id, G.hline(y, 0, 9.4), label, { role: 'demand', labelAt: [9.4, y], labelDir: 'e' });
}

/** Profit-maximising (MC = MR) outcome for linear demand P = A − Bq. */
function mcEqualsMr(cm: CostModel, A: number, B: number) {
  const d = linearDemand(A, B);
  const q = G.solve((x) => cm.mc(x) - d.mr(x), cm.minMC[0], 25);
  return { d, q, p: d.p(q), c: cm.atc(q) };
}

/** Demand intercept A that makes (P − ATC) at the MC = MR output equal `margin`. */
function demandForMargin(cm: CostModel, B: number, margin: number): number {
  const f = (A: number) => {
    const o = mcEqualsMr(cm, A, B);
    return Number.isFinite(o.q) ? o.p - o.c - margin : -100;
  };
  const A = G.solve(f, 2, 40);
  return Number.isFinite(A) ? A : 10;
}

// ---------------------------------------------------------------------------
// Costs & revenues

const productCurves: Template = {
  id: 'product-curves',
  name: 'Total, average and marginal product',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'In the short run, total product rises at an increasing then decreasing rate. Marginal product peaks first (diminishing marginal returns set in), cuts average product at its maximum and is zero where total product is maximised.',
  keywords: ['law of diminishing marginal returns', 'total product', 'average product', 'marginal product', 'short run', 'variable factor', 'TP', 'AP', 'MP'],
  caption: 'Total, average and marginal product',
  controls: [
    toggle('guides', 'Show key levels of labour', true),
    toggle('dmr', 'Mark diminishing marginal returns', true),
    toggle('negMP', 'Extend MP below zero', false),
  ],
  build: (p) => {
    const a = 0.42;
    const b = 0.035;
    const tp = (L: number) => a * L * L - b * L ** 3;
    const mp = (L: number) => 2 * a * L - 3 * b * L * L;
    const ap = (L: number) => a * L - b * L * L;
    const L1 = a / (3 * b); // MP max (inflection of TP)
    const L2 = a / (2 * b); // AP max, MP = AP
    const L3 = (2 * a) / (3 * b); // TP max, MP = 0
    const guides = P.b(p, 'guides');
    const neg = P.b(p, 'negMP');
    const mpMax = mp(L1);
    const top = panel({
      id: 'tp',
      xLabel: 'Labour (L)',
      yLabel: 'Total product',
      yMax: 10,
      height: 250,
      origin: '0',
      elements: [
        curve('tp', G.fn(tp, 0, 9.4), 'TP', { role: 'demand' }),
        ...when(
          guides,
          point('l1', [L1, tp(L1)], { xLabel: 'L_1' }),
          point('l2', [L2, tp(L2)], { xLabel: 'L_2' }),
          point('l3', [L3, tp(L3)], { xLabel: 'L_3', label: 'TP max', labelDir: 'n' }),
        ),
      ],
    });
    const bottom = panel({
      id: 'apmp',
      xLabel: 'Labour (L)',
      yLabel: 'AP, MP',
      yMin: neg ? -0.9 : 0,
      yMax: 2.2,
      height: 250,
      elements: [
        curve('ap', G.fn(ap, 0.05, 9.6), 'AP', { role: 'atc' }),
        curve('mp', G.fn(mp, 0.05, neg ? 9.15 : L3), 'MP', {
          role: 'mc',
          labelAt: neg ? 'end' : [7.35, mp(7.35)],
          labelDir: neg ? undefined : 'e',
        }),
        ...when(
          guides,
          point('l1', [L1, mpMax], { xLabel: 'L_1' }),
          point('l2', [L2, ap(L2)], { xLabel: 'L_2', label: 'MP = AP', labelDir: 'ne' }),
          point('l3', [L3, 0], { xLabel: 'L_3' }),
        ),
        ...when(
          P.b(p, 'dmr'),
          measure('dmr', [L1, mpMax + 0.22], [L1 + 3.1, mpMax + 0.22], 'diminishing marginal returns', {
            heads: 'end',
            labelDir: 'n',
          }),
        ),
      ],
    });
    return { panels: [top, bottom], layout: 'column' };
  },
};

const shortRunCosts: Template = {
  id: 'short-run-costs',
  name: 'Short-run cost curves',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'Marginal cost cuts average variable cost and average total cost at their minimum points; the vertical gap between ATC and AVC is average fixed cost, which falls as output rises.',
  keywords: ['marginal cost', 'average total cost', 'average variable cost', 'average fixed cost', 'MC', 'ATC', 'AVC', 'AFC', 'short run costs'],
  caption: 'Short-run cost curves',
  controls: [
    toggle('mc', 'Marginal cost (MC)', true, { group: 'Curves' }),
    toggle('atc', 'Average total cost (ATC)', true, { group: 'Curves' }),
    toggle('avc', 'Average variable cost (AVC)', true, { group: 'Curves' }),
    toggle('afc', 'Average fixed cost (AFC)', false, { group: 'Curves' }),
    toggle('minima', 'Mark where MC cuts AVC and ATC', true),
    toggle('gap', 'Show AFC as the gap between ATC and AVC', false),
    slider('F', 'Fixed costs', 2, 10, 0.5, 6, { group: 'Shape' }),
  ],
  build: (p) => {
    const cm = costModel({ F: P.n(p, 'F', 6) });
    const showAtc = P.b(p, 'atc');
    const showAvc = P.b(p, 'avc');
    const els: El[] = costEls(cm, { mc: P.b(p, 'mc'), atc: showAtc, avc: showAvc, afc: P.b(p, 'afc') });
    if (P.b(p, 'minima') && P.b(p, 'mc')) {
      if (showAvc) els.push(point('minavc', cm.minAVC));
      if (showAtc) els.push(point('minatc', cm.minATC));
    }
    if (P.b(p, 'gap') && showAtc && showAvc) {
      const q = 8;
      els.push(measure('gap', [q, cm.avc(q)], [q, cm.atc(q)], 'AFC', { labelDir: 'e' }));
    }
    return { panels: [firmPanel({ yLabel: 'Costs', elements: els })] };
  },
};

const longRunAC: Template = {
  id: 'long-run-average-cost',
  name: 'Long-run average cost (economies of scale)',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'The LRAC curve falls with economies of scale, may be flat with constant returns to scale, and rises with diseconomies of scale. The lowest output at which LRAC is minimised is the minimum efficient scale.',
  keywords: ['economies of scale', 'diseconomies of scale', 'constant returns to scale', 'LRAC', 'minimum efficient scale', 'MES', 'envelope curve', 'SRAC'],
  caption: 'Long-run average cost',
  controls: [
    select('shape', 'Shape', [
      { value: 'u', label: 'U-shaped' },
      { value: 'flat', label: 'With constant returns to scale' },
    ], 'u'),
    toggle('regions', 'Label economies / diseconomies of scale', true),
    toggle('mes', 'Mark minimum efficient scale', true),
    toggle('srac', 'Show short-run average cost curves (envelope)', false),
  ],
  build: (p) => {
    const flat = P.s(p, 'shape') === 'flat';
    const L = flat
      ? (q: number) => 3.4 + (q < 4 ? 0.4 * (4 - q) ** 2 : 0) + (q > 7 ? 0.35 * (q - 7) ** 2 : 0)
      : (q: number) => 3 + 0.15 * (q - 5.5) ** 2 + 2 / q;
    const qEnd = 9.6;
    const mes = flat ? 4 : G.argmin(L, 1, 9);
    const els: El[] = [curve('lrac', costCurve(L, 0.6, qEnd), 'LRAC', { role: 'atc', weight: 1.15 })];
    if (P.b(p, 'srac')) {
      // SRAC_i = LRAC + a parabola: always on/above LRAC and tangent to it at q_i
      const qs = flat ? [1.9, 4.1, 5.7, 7.8] : [2.1, 3.7, mes, 7.6];
      qs.forEach((qi, i) => {
        const f = (q: number) => L(q) + 0.9 * (q - qi) ** 2;
        els.push(
          curve(`srac${i + 1}`, costCurve(f, Math.max(0.6, qi - 1.25), Math.min(10, qi + 1.25), 9.8), `SRAC_${i + 1}`, {
            role: 'neutral',
            weight: 0.7,
          }),
        );
      });
    }
    if (P.b(p, 'regions')) {
      const y = 1.1;
      const regions: [number, number, string][] = flat
        ? [
            [0.6, 4, 'economies of scale'],
            [4, 7, 'constant returns'],
            [7, qEnd, 'diseconomies'],
          ]
        : [
            [0.6, mes, 'economies of scale'],
            [mes, qEnd, 'diseconomies of scale'],
          ];
      regions.forEach(([a, b, label], i) => els.push(measure(`region${i}`, [a, y], [b, y], label, { labelDir: 'n' })));
    }
    if (P.b(p, 'mes')) {
      els.push(point('mes', [mes, L(mes)], { xLabel: 'Q_{MES}', label: 'MES', labelDir: 'n' }));
      if (flat) els.push(point('crs-end', [7, L(7)], { xLabel: '', dot: false }));
    }
    return { panels: [firmPanel({ yLabel: 'Average costs', elements: els })] };
  },
};

const revenuePC: Template = {
  id: 'revenue-perfect-competition',
  name: 'Revenue curves in perfect competition',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'A price-taking firm faces a perfectly elastic demand curve at the market price, so price = marginal revenue = average revenue and total revenue rises in a straight line.',
  keywords: ['price taker', 'perfectly elastic demand', 'average revenue', 'marginal revenue', 'total revenue', 'P = MR = AR'],
  caption: 'Revenue curves of a perfectly competitive firm',
  controls: [
    select('view', 'Show', [
      { value: 'firm', label: 'Firm only' },
      { value: 'industry', label: 'Industry and firm' },
      { value: 'tr', label: 'AR/MR with total revenue' },
    ], 'firm'),
    slider('price', 'Market price', 2, 8, 0.1, 5, { group: 'Shape' }),
  ],
  build: (p) => {
    const price = P.n(p, 'price', 5);
    const view = P.s(p, 'view', 'firm');
    const firm = firmPanel({
      id: 'firm',
      title: view === 'industry' ? 'Firm' : undefined,
      yLabel: 'Price, revenue',
      width: view === 'industry' ? 380 : undefined,
      height: view === 'tr' ? 250 : view === 'industry' ? 340 : undefined,
      elements: [hLine('ar', price, 'D = AR = MR', 'demand'), tick('p', 'y', price, 'P_e')],
    });
    if (view === 'industry') {
      const d = sdLine([5, price], -0.8);
      const s = sdLine([5, price], 0.8);
      const industry = panel({
        id: 'industry',
        title: 'Industry',
        width: 380,
        height: 340,
        elements: [
          curve('d', d, 'D', { role: 'demand' }),
          curve('s', s, 'S', { role: 'supply' }),
          eqPoint('e', G.meet(d, s), 'Q_e', 'P_e'),
          guideAcross('across', price),
        ],
      });
      return { panels: [industry, firm] };
    }
    if (view === 'tr') {
      const tr = panel({
        id: 'tr',
        xLabel: 'Output',
        yLabel: 'Total revenue',
        yMax: 85,
        height: 250,
        elements: [curve('tr', G.lineX([0, 0], price, 0, 9.6), 'TR', { role: 'demand' })],
      });
      return { panels: [tr, firm], layout: 'column' };
    }
    return { panels: [firm] };
  },
};

/** Dashed price line continuing to the right edge of the industry panel. */
function guideAcross(id: string, y: number): El {
  return { kind: 'line', id, from: [5, y], to: [10, y], variant: 'guide' };
}

const revenueImperfect: Template = {
  id: 'revenue-imperfect-competition',
  name: 'Revenue curves in imperfect competition',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'With a downward-sloping demand (AR) curve, MR falls twice as fast. Demand is price elastic where MR > 0 and inelastic where MR < 0; total revenue is maximised where MR = 0 (unit elasticity).',
  keywords: ['average revenue', 'marginal revenue', 'total revenue', 'price elasticity', 'unit elastic', 'revenue maximisation', 'price maker'],
  caption: 'Revenue curves of a firm with market power',
  controls: [
    toggle('tr', 'Show total revenue panel', true),
    toggle('ped', 'Label elastic and inelastic ranges', true),
    toggle('negMR', 'Extend MR below zero', false),
  ],
  build: (p) => {
    const A = 10;
    const B = 1;
    const showTr = P.b(p, 'tr');
    const neg = P.b(p, 'negMR');
    const qMid = A / (2 * B);
    const { ar, mr } = arMr(A, B, neg ? 7.4 : qMid);
    const els: El[] = [
      curve('ar', ar, 'D = AR', { role: 'demand', labelDir: 'e' }),
      curve('mr', mr, 'MR', neg ? { role: 'mr' } : { role: 'mr', labelAt: [4.2, A - 2 * B * 4.2], labelDir: 'w' }),
      eqPoint('unit', [qMid, A / 2], 'Q_1', 'P_1', { label: P.b(p, 'ped') ? 'PED = 1' : undefined, labelDir: 'ne' }),
      point('mr0', [qMid, 0]),
    ];
    if (P.b(p, 'ped')) {
      els.push(
        text('elastic', [2.6, 8.9], 'PED > 1 (elastic)', { anchor: 'start' }),
        text('inelastic', [7.3, 3.6], 'PED < 1 (inelastic)', { anchor: 'start' }),
      );
    }
    const armr = firmPanel({
      id: 'armr',
      yLabel: 'Price, revenue',
      yMin: neg ? -4.5 : 0,
      yMax: 10,
      height: showTr ? 300 : undefined,
      elements: els,
    });
    if (!showTr) return { panels: [armr] };
    const tr = (q: number) => A * q - B * q * q;
    const trPanel = panel({
      id: 'tr',
      xLabel: 'Output',
      yLabel: 'Total revenue',
      yMax: 28,
      height: 230,
      elements: [
        curve('tr', G.fn(tr, 0, 9.6), 'TR', { role: 'demand', labelAt: [7.4, tr(7.4)], labelDir: 'ne' }),
        point('trmax', [qMid, tr(qMid)], { xLabel: 'Q_1', label: 'TR max', labelDir: 'n' }),
      ],
    });
    return { panels: [trPanel, armr], layout: 'column' };
  },
};

const profitMax: Template = {
  id: 'profit-maximisation',
  name: 'Profit maximisation (MC = MR)',
  unit: 'micro',
  topic: T_COST,
  hl: true,
  description:
    'A firm maximises profit at the output where marginal cost equals marginal revenue (with MC rising). Below that output MR > MC, so producing more adds to profit; above it MC > MR.',
  keywords: ['profit maximisation', 'MC = MR', 'marginal analysis', 'abnormal profit', 'revenue maximisation', 'MR = 0'],
  caption: 'Profit maximisation where MC = MR',
  controls: [
    select('market', 'Market', [
      { value: 'imperfect', label: 'Imperfect competition' },
      { value: 'perfect', label: 'Perfect competition' },
    ], 'imperfect'),
    toggle('atc', 'Show ATC and profit', true),
    toggle('zones', 'Annotate MR > MC and MC > MR', true),
    toggle('revmax', 'Also show revenue maximisation (MR = 0)', false, {
      show: (p) => p.market !== 'perfect',
    }),
  ],
  build: (p) => {
    const cm = powerCosts();
    const perfect = P.s(p, 'market') === 'perfect';
    const showAtc = P.b(p, 'atc');
    const els: El[] = [];
    let q: number;
    let price: number;
    if (perfect) {
      price = 6;
      q = cm.qAtMC(price);
      els.push(priceLine('ar', price));
    } else {
      const o = mcEqualsMr(cm, 10, 1);
      q = o.q;
      price = o.p;
      const revmax = P.b(p, 'revmax');
      const { ar, mr } = arMr(10, 1, revmax ? 5 : undefined);
      els.push(
        curve('ar', ar, 'D = AR', { role: 'demand', labelDir: 'e' }),
        curve('mr', mr, 'MR', revmax ? { role: 'mr', labelAt: [4.4, 1.2], labelDir: 'w' } : { role: 'mr', labelDir: 'e' }),
      );
    }
    const c = cm.atc(q);
    if (showAtc) els.unshift(profitRect('profit', q, price, c));
    els.push(...costEls(cm, { atc: showAtc }));
    if (perfect) {
      els.push(eqPoint('pm', [q, price], 'Q_{pm}', 'P'));
    } else {
      els.push(point('mcmr', [q, cm.mc(q)]), eqPoint('pm', [q, price], 'Q_{pm}', 'P_{pm}'));
    }
    if (showAtc) els.push(point('c', [q, c], { yLabel: 'C', dot: false }));
    if (P.b(p, 'zones')) {
      els.push(
        text('lo', [Math.max(1.4, q - 1.9), 2], 'MR > MC:\nincrease output'),
        text('hi', [Math.min(8.6, q + 2.7), 2], 'MC > MR:\nreduce output'),
      );
    }
    if (!perfect && P.b(p, 'revmax')) {
      els.push(point('mr0', [5, 0]), eqPoint('rm', [5, 5], 'Q_{rm}', 'P_{rm}'));
    }
    return { panels: [firmPanel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Perfect competition

/** Firm price in each perfect-competition case, given the cost model. */
function pcPrice(cm: CostModel, c: string): number {
  if (c === 'normal') return cm.minATC[1];
  if (c === 'loss') return (cm.minAVC[1] + cm.minATC[1]) / 2 + 0.05;
  return 5.3;
}

const pcShortRun: Template = {
  id: 'perfect-competition-short-run',
  name: 'Perfect competition: short-run equilibrium',
  unit: 'micro',
  topic: T_PC,
  hl: true,
  description:
    'The industry sets the price; the price-taking firm produces where MC = MR and may earn abnormal profit, normal profit or a loss in the short run.',
  keywords: ['perfect competition', 'price taker', 'abnormal profit', 'economic profit', 'loss', 'normal profit', 'short run', 'industry and firm'],
  caption: 'Perfectly competitive firm in the short run',
  controls: [
    select('case', 'Outcome', [
      { value: 'profit', label: 'Abnormal profit' },
      { value: 'normal', label: 'Normal profit' },
      { value: 'loss', label: 'Loss' },
    ], 'profit'),
    toggle('shade', 'Shade profit / loss', true),
    toggle('avc', 'Show AVC', true),
  ],
  build: (p) => {
    const cm = costModel();
    const kase = P.s(p, 'case', 'profit');
    const price = pcPrice(cm, kase);
    const q = kase === 'normal' ? cm.minATC[0] : cm.qAtMC(price);
    const c = cm.atc(q);
    const d = sdLine([5, price], -0.8);
    const s = sdLine([5, price], 0.8);
    const industry = panel({
      id: 'industry',
      title: 'Industry',
      width: 380,
      height: 360,
      elements: [
        curve('d', d, 'D', { role: 'demand' }),
        curve('s', s, 'S', { role: 'supply' }),
        eqPoint('e', G.meet(d, s), 'Q_e', 'P_e'),
        guideAcross('across', price),
      ],
    });
    const firmEls: El[] = [
      ...when(P.b(p, 'shade') && kase !== 'normal', profitRect('profit', q, price, c)),
      priceLine('ar', price),
      ...costEls(cm, { avc: P.b(p, 'avc') }),
      tick('pe', 'y', price, 'P_e'),
      point('mcmr', [q, price], { xLabel: 'q_e' }),
      ...when(kase !== 'normal', point('c', [q, c], { yLabel: 'ATC', dot: false })),
    ];
    const firm = firmPanel({ id: 'firm', title: 'Firm', width: 380, height: 360, elements: firmEls });
    return { panels: [industry, firm] };
  },
};

const pcLongRun: Template = {
  id: 'perfect-competition-long-run',
  name: 'Perfect competition: long-run adjustment',
  unit: 'micro',
  topic: T_PC,
  hl: true,
  description:
    'Abnormal profit attracts entry (losses cause exit), shifting industry supply until price returns to minimum ATC and every firm earns normal profit.',
  keywords: ['long run equilibrium', 'entry', 'exit', 'normal profit', 'barriers to entry', 'productive efficiency', 'allocative efficiency'],
  caption: 'Long-run adjustment in perfect competition',
  controls: [
    select('dir', 'Starting point', [
      { value: 'entry', label: 'Abnormal profit → entry' },
      { value: 'exit', label: 'Loss → exit' },
    ], 'entry'),
    toggle('shade', 'Shade initial profit / loss', true),
    toggle('avc', 'Show AVC', false),
  ],
  build: (p) => {
    const cm = costModel();
    const entry = P.s(p, 'dir') !== 'exit';
    // starting prices far enough from min ATC that the two MR = AR labels don't collide
    const p1 = entry ? pcPrice(cm, 'profit') : cm.minAVC[1] + 0.3;
    const p2 = cm.minATC[1];
    const q1 = cm.qAtMC(p1);
    const q2 = cm.minATC[0];
    const d = sdLine([5, 5], -0.8);
    const s1 = sdLine([G.xAt(d, p1), p1], 1.1);
    const s2 = sdLine([G.xAt(d, p2), p2], 1.1);
    const industry = panel({
      id: 'industry',
      title: 'Industry',
      width: 380,
      height: 360,
      elements: [
        curve('d', d, 'D', { role: 'demand' }),
        curve('s1', s1, 'S_1', { role: 'supply' }),
        curve('s2', s2, 'S_2', { role: 'supply' }),
        shiftArrow('shift', s1, s2, { t: 0.86 }),
        eqPoint('e1', G.meet(d, s1), 'Q_1', 'P_1'),
        eqPoint('e2', G.meet(d, s2), 'Q_2', 'P_2'),
      ],
    });
    const c1 = cm.atc(q1);
    const firm = firmPanel({
      id: 'firm',
      title: 'Firm',
      width: 380,
      height: 360,
      elements: [
        ...when(P.b(p, 'shade'), profitRect('profit', q1, p1, c1, false)),
        priceLine('mr1', p1, 'MR_1\n= AR_1'),
        priceLine('mr2', p2, 'MR_2\n= AR_2'),
        ...costEls(cm, { avc: P.b(p, 'avc') }),
        tick('p1', 'y', p1, 'P_1'),
        tick('p2', 'y', p2, 'P_2'),
        point('q1', [q1, p1], { xLabel: 'q_1' }),
        point('q2', [q2, p2], { xLabel: 'q_2' }),
      ],
    });
    return { panels: [industry, firm] };
  },
};

const shutDown: Template = {
  id: 'shut-down-break-even',
  name: 'Shut-down and break-even prices',
  unit: 'micro',
  topic: T_PC,
  hl: true,
  description:
    'The short-run shut-down price is minimum AVC; the break-even price is minimum ATC. The firm’s short-run supply curve is its MC curve above AVC; in the long run it is MC above ATC.',
  keywords: ['shut-down price', 'break-even price', 'short run supply curve', 'minimum AVC', 'minimum ATC', 'perfect competition'],
  caption: 'Shut-down and break-even prices',
  controls: [
    select('highlight', 'Highlight the firm’s supply curve', [
      { value: 'sr', label: 'Short run (MC above AVC)' },
      { value: 'lr', label: 'Long run (MC above ATC)' },
      { value: 'none', label: 'None' },
    ], 'sr'),
    toggle('labels', 'Label shut-down and break-even points', true),
    toggle('prices', 'Show the two prices on the axis', true),
  ],
  build: (p) => {
    const cm = costModel();
    const hl = P.s(p, 'highlight', 'sr');
    const labels = P.b(p, 'labels');
    const prices = P.b(p, 'prices');
    const els: El[] = [...costEls(cm, { avc: true })];
    if (hl !== 'none') {
      const from = hl === 'sr' ? cm.minAVC[0] : cm.minATC[0];
      const yLabel = 8.4;
      els.push(
        curve('supply', costCurve(cm.mc, from, 10, 10.5), hl === 'sr' ? 'short-run supply' : 'long-run supply', {
          role: 'supply',
          weight: 2.3,
          labelAt: [cm.qAtMC(yLabel), yLabel],
          labelDir: 'w',
        }),
      );
    }
    els.push(
      point('sd', cm.minAVC, {
        yLabel: prices ? 'P_{SD}' : undefined,
        label: labels ? 'shut-down point' : undefined,
        labelDir: 's',
      }),
      point('be', cm.minATC, {
        yLabel: prices ? 'P_{BE}' : undefined,
        label: labels ? 'break-even point' : undefined,
        labelDir: 'se',
      }),
    );
    return { panels: [firmPanel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Monopoly

const MARGINS: Record<string, number> = { profit: 1.8, normal: 0, loss: -0.8 };

const monopolyProfit: Template = {
  id: 'monopoly-profit',
  name: 'Monopoly: profit maximisation',
  unit: 'micro',
  topic: T_MON,
  hl: true,
  description:
    'A monopolist produces where MC = MR and charges the price on the demand (AR) curve above that output. Barriers to entry let abnormal profit persist in the long run; a monopoly can also make normal profit or a loss.',
  keywords: ['monopoly', 'abnormal profit', 'MC = MR', 'barriers to entry', 'price maker', 'loss', 'cartel', 'collusive oligopoly'],
  caption: 'Profit maximisation by a monopolist',
  controls: [
    select('case', 'Outcome', [
      { value: 'profit', label: 'Abnormal profit' },
      { value: 'normal', label: 'Normal profit' },
      { value: 'loss', label: 'Loss' },
    ], 'profit'),
    toggle('shade', 'Shade profit / loss', true),
    toggle('avc', 'Show AVC', false),
    toggle('cartel', 'Label as a collusive oligopoly (cartel)', false),
  ],
  build: (p) => {
    const kase = P.s(p, 'case', 'profit');
    // a loss-making monopoly: high fixed costs push ATC above demand
    const cm = powerCosts(kase === 'loss' ? 10 : 6);
    const B = kase === 'normal' ? 0.6 : 1;
    const A = demandForMargin(cm, B, MARGINS[kase] ?? 1.8);
    const o = mcEqualsMr(cm, A, B);
    const { ar, mr } = arMr(A, B);
    const cartel = P.b(p, 'cartel');
    const sub = cartel ? 'c' : 'm';
    return {
      panels: [
        firmPanel({
          title: cartel ? 'Cartel (industry)' : undefined,
          elements: [
            ...when(P.b(p, 'shade') && kase !== 'normal', profitRect('profit', o.q, o.p, o.c)),
            ...arMrEls(ar, mr),
            ...costEls(cm, { avc: P.b(p, 'avc') }),
            point('mcmr', [o.q, cm.mc(o.q)]),
            eqPoint('pm', [o.q, o.p], `Q_${sub}`, `P_${sub}`),
            ...when(kase !== 'normal', point('c', [o.q, o.c], { yLabel: 'C', dot: false })),
          ],
        }),
      ],
    };
  },
};

const monopolyWelfare: Template = {
  id: 'monopoly-welfare-loss',
  name: 'Monopoly vs perfect competition (welfare loss)',
  unit: 'micro',
  topic: T_MON,
  hl: true,
  description:
    'Compared with a competitive industry (P = MC), a monopoly restricts output and raises price, creating a deadweight welfare loss and transferring consumer surplus to the producer.',
  keywords: ['welfare loss', 'deadweight loss', 'allocative inefficiency', 'monopoly', 'perfect competition', 'consumer surplus', 'producer surplus', 'P > MC'],
  caption: 'Welfare loss under monopoly',
  controls: [
    select('mc', 'Marginal cost', [
      { value: 'rising', label: 'Rising MC' },
      { value: 'constant', label: 'Constant MC (= AC)' },
    ], 'rising'),
    toggle('dwl', 'Shade welfare loss', true),
    toggle('surplus', 'Shade consumer and producer surplus', false),
    toggle('pc', 'Show competitive outcome (P = MC)', true),
  ],
  build: (p) => {
    const constant = P.s(p, 'mc') === 'constant';
    const d = linearDemand(10, 1);
    const mcF = constant ? () => 3 : (q: number) => 1 + 0.6 * q;
    const mcLine = constant ? G.hline(3, 0, 9.8) : G.lineX([0, 1], 0.6, 0, 9.6);
    const qm = G.solve((q) => mcF(q) - d.mr(q), 0, 10);
    const pm = d.p(qm);
    const qc = G.solve((q) => mcF(q) - d.p(q), 0, 10);
    const pc = d.p(qc);
    const { ar, mr } = arMr(10, 1);
    const showPc = P.b(p, 'pc');
    const priceLine = G.hline(pm, 0, qm);
    const els: El[] = [
      ...when(
        P.b(p, 'surplus'),
        area('cs', G.between(ar, priceLine, 0, qm), 'cs', 'CS', 'Consumer surplus'),
        area('ps', G.between(priceLine, mcLine, 0, qm), 'ps', 'PS', 'Producer surplus'),
      ),
      ...when(
        P.b(p, 'dwl'),
        area('dwl', [[qm, pm], [qc, pc], [qm, mcF(qm)]], 'dwl', 'DWL', 'Deadweight (welfare) loss'),
      ),
      ...arMrEls(ar, mr),
      constant
        ? curve('mc', mcLine, 'MC = AC', { role: 'mc', labelAt: [9.8, 3], labelDir: 'nw' })
        : curve('mc', mcLine, 'MC', { role: 'mc' }),
      point('mcmr', [qm, mcF(qm)]),
      eqPoint('m', [qm, pm], 'Q_m', 'P_m'),
      ...when(showPc, eqPoint('pc', [qc, pc], 'Q_{pc}', 'P_{pc}')),
    ];
    return { panels: [firmPanel({ elements: els })] };
  },
};

const revenueMax: Template = {
  id: 'monopoly-revenue-maximisation',
  name: 'Revenue maximisation vs profit maximisation',
  unit: 'micro',
  topic: T_MON,
  hl: true,
  description:
    'A profit maximiser produces where MC = MR; a revenue maximiser produces more, at a lower price, where MR = 0 (the unit-elastic point of the demand curve).',
  keywords: ['revenue maximisation', 'MR = 0', 'profit maximisation', 'alternative goals of firms', 'unit elastic', 'monopoly'],
  caption: 'Revenue maximisation compared with profit maximisation',
  controls: [
    toggle('atc', 'Show ATC', true),
    toggle('profit', 'Shade profit at the profit-maximising output', false),
  ],
  build: (p) => {
    const cm = powerCosts();
    const o = mcEqualsMr(cm, 10, 1);
    const { ar, mr } = arMr(10, 1, 5);
    const showAtc = P.b(p, 'atc');
    return {
      panels: [
        firmPanel({
          elements: [
            ...when(showAtc && P.b(p, 'profit'), profitRect('profit', o.q, o.p, o.c)),
            curve('ar', ar, 'D = AR', { role: 'demand', labelDir: 'e' }),
            curve('mr', mr, 'MR', { role: 'mr', labelAt: [4.4, 1.2], labelDir: 'w' }),
            ...costEls(cm, { atc: showAtc }),
            point('mcmr', [o.q, cm.mc(o.q)]),
            eqPoint('pm', [o.q, o.p], 'Q_{pm}', 'P_{pm}'),
            point('mr0', [5, 0]),
            eqPoint('rm', [5, 5], 'Q_{rm}', 'P_{rm}'),
          ],
        }),
      ],
    };
  },
};

const naturalMonopoly: Template = {
  id: 'natural-monopoly',
  name: 'Natural monopoly and regulation',
  unit: 'micro',
  topic: T_MON,
  hl: true,
  description:
    'Huge economies of scale mean LRAC is still falling where it meets market demand, so one firm can supply the market most cheaply. Regulators may set P = AC (fair return, normal profit) or P = MC (allocatively efficient, but a loss that needs a subsidy).',
  keywords: ['natural monopoly', 'economies of scale', 'regulation', 'marginal cost pricing', 'average cost pricing', 'fair return', 'subsidy', 'LRAC'],
  caption: 'Natural monopoly',
  controls: [
    select('reg', 'Pricing', [
      { value: 'none', label: 'Unregulated (MC = MR)' },
      { value: 'ac', label: 'Regulated: P = AC (fair return)' },
      { value: 'mc', label: 'Regulated: P = MC (socially optimal)' },
      { value: 'all', label: 'Compare all three' },
    ], 'none'),
    toggle('shade', 'Shade profit / loss', true),
  ],
  build: (p) => {
    const reg = P.s(p, 'reg', 'none');
    // TC = 2q + 12q/(q + 1)  ⇒  LRAC falls throughout and LRMC lies below it
    const lrac = (q: number) => 2 + 12 / (q + 1);
    const lrmc = (q: number) => 2 + 12 / (q + 1) ** 2;
    const d = linearDemand(10, 1);
    const qm = G.solve((q) => lrmc(q) - d.mr(q), 0.5, 10);
    const qac = G.solve((q) => d.p(q) - lrac(q), 3, 10.5);
    const qmc = G.solve((q) => d.p(q) - lrmc(q), 3, 10.5);
    const shade = P.b(p, 'shade') && reg !== 'all';
    const { ar, mr } = arMr(10, 1);
    const els: El[] = [];
    if (shade && reg === 'none') els.push(profitRect('profit', qm, d.p(qm), lrac(qm)));
    if (shade && reg === 'mc') {
      els.push(
        area('loss', G.rect(0, d.p(qmc), qmc, lrac(qmc)), 'loss', 'Loss', 'Loss (subsidy required)'),
      );
    }
    els.push(
      ...arMrEls(ar, mr),
      curve('lrac', costCurve(lrac, 0.4, 9.8), 'LRAC', { role: 'atc' }),
      curve('lrmc', costCurve(lrmc, 0.4, 9.8), 'LRMC', { role: 'mc' }),
    );
    if (reg === 'none' || reg === 'all') {
      els.push(point('mcmr', [qm, lrmc(qm)]), eqPoint('m', [qm, d.p(qm)], 'Q_m', 'P_m'));
      if (reg === 'none') els.push(point('c', [qm, lrac(qm)], { yLabel: 'C', dot: false }));
    }
    if (reg === 'ac' || reg === 'all') els.push(eqPoint('ac', [qac, d.p(qac)], 'Q_{AC}', 'P_{AC}', { label: 'P = AC', labelDir: 'ne' }));
    if (reg === 'mc' || reg === 'all') {
      els.push(eqPoint('mc', [qmc, d.p(qmc)], 'Q_{MC}', 'P_{MC}', { label: 'P = MC', labelDir: 'sw' }));
      if (reg === 'mc') els.push(point('cmc', [qmc, lrac(qmc)], { yLabel: 'C', dot: false }));
    }
    return { panels: [firmPanel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Imperfect competition

const monoCompSR: Template = {
  id: 'monopolistic-competition-short-run',
  name: 'Monopolistic competition: short run',
  unit: 'micro',
  topic: T_IMP,
  hl: true,
  description:
    'Product differentiation gives each firm a relatively elastic, downward-sloping demand curve. Producing where MC = MR, a firm can earn abnormal profit or make a loss in the short run.',
  keywords: ['monopolistic competition', 'product differentiation', 'short run', 'abnormal profit', 'loss', 'MC = MR'],
  caption: 'Monopolistic competition in the short run',
  controls: [
    select('case', 'Outcome', [
      { value: 'profit', label: 'Abnormal profit' },
      { value: 'loss', label: 'Loss' },
    ], 'profit'),
    toggle('shade', 'Shade profit / loss', true),
  ],
  build: (p) => {
    const cm = powerCosts();
    const loss = P.s(p, 'case') === 'loss';
    const B = 0.55;
    const A = demandForMargin(cm, B, loss ? -0.6 : 1.2);
    const o = mcEqualsMr(cm, A, B);
    const { ar, mr } = arMr(A, B);
    return {
      panels: [
        firmPanel({
          elements: [
            ...when(P.b(p, 'shade'), profitRect('profit', o.q, o.p, o.c)),
            ...arMrEls(ar, mr),
            ...costEls(cm),
            point('mcmr', [o.q, cm.mc(o.q)]),
            eqPoint('e', [o.q, o.p], 'Q_1', 'P_1'),
            point('c', [o.q, o.c], { yLabel: 'C_1', dot: false }),
          ],
        }),
      ],
    };
  },
};

const monoCompLR: Template = {
  id: 'monopolistic-competition-long-run',
  name: 'Monopolistic competition: long run',
  unit: 'micro',
  topic: T_IMP,
  hl: true,
  description:
    'Free entry and exit shift each firm’s demand until it is tangent to ATC: only normal profit is earned. Output is below the level of minimum ATC (excess capacity), and P > MC.',
  keywords: ['monopolistic competition', 'long run', 'normal profit', 'tangency', 'excess capacity', 'productive inefficiency', 'allocative inefficiency'],
  caption: 'Monopolistic competition in the long run',
  controls: [
    toggle('excess', 'Mark excess capacity', true),
    toggle('pmc', 'Show P > MC', false),
  ],
  build: (p) => {
    const cm = powerCosts();
    const B = 0.55;
    const A = demandForMargin(cm, B, 0);
    const o = mcEqualsMr(cm, A, B);
    const { ar, mr } = arMr(A, B);
    const [qMin, cMin] = cm.minATC;
    const els: El[] = [
      ...arMrEls(ar, mr),
      ...costEls(cm),
      point('mcmr', [o.q, cm.mc(o.q)], P.b(p, 'pmc') ? { yLabel: 'MC' } : {}),
      eqPoint('e', [o.q, o.p], 'Q_{LR}', 'P_{LR}'),
    ];
    if (P.b(p, 'excess')) {
      els.push(
        point('minatc', [qMin, cMin], { xLabel: 'Q_{min ATC}' }),
        measure('excess', [o.q, 0.75], [qMin, 0.75], 'excess capacity', { labelDir: 'n' }),
      );
    }
    return { panels: [firmPanel({ elements: els })] };
  },
};

const kinked: Template = {
  id: 'kinked-demand',
  name: 'Kinked demand curve (oligopoly)',
  unit: 'micro',
  topic: T_IMP,
  hl: true,
  description:
    'Rivals match price cuts but ignore price rises, so demand is elastic above the current price and inelastic below it. The kink creates a gap in MR, so MC can change within the gap without changing price or output (price rigidity).',
  keywords: ['kinked demand curve', 'oligopoly', 'non-collusive', 'price rigidity', 'sticky prices', 'interdependence', 'MR discontinuity'],
  caption: 'The kinked demand curve model',
  controls: [
    toggle('mc2', 'Show a second MC curve within the gap', true),
    toggle('ext', 'Show the “matched” and “unmatched” demand curves', false),
    toggle('notes', 'Annotate rivals’ reactions', true),
  ],
  build: (p) => {
    const qk = 5;
    const pk = 6;
    const bUp = 0.25; // elastic segment slope
    const bLo = 0.75; // inelastic segment slope
    const aUp = pk + bUp * qk;
    const aLo = pk + bLo * qk;
    const upper = G.lineX([0, aUp], -bUp, 0, qk);
    const lower = G.lineX([0, aLo], -bLo, qk, (aLo - 0.8) / bLo);
    const mrUpTop = aUp - 2 * bUp * qk;
    const mrLoTop = aLo - 2 * bLo * qk;
    const mrUpper = G.lineX([0, aUp], -2 * bUp, 0, qk);
    const mrLower = G.lineX([0, aLo], -2 * bLo, qk, (aLo - 0.9) / (2 * bLo));
    const base = costModel();
    const mcAt = (shift: number) => (q: number) => base.mc(q) + shift;
    const target1 = mrLoTop + (mrUpTop - mrLoTop) * 0.3;
    const target2 = mrLoTop + (mrUpTop - mrLoTop) * 0.75;
    const s1 = target1 - base.mc(qk);
    const s2 = target2 - base.mc(qk);
    const showMc2 = P.b(p, 'mc2');
    const els: El[] = [];
    if (P.b(p, 'ext')) {
      els.push(
        curve('upExt', G.lineX([0, aUp], -bUp, qk, 9.6), undefined, { role: 'demand', dash: true, faded: true }),
        curve('loExt', G.lineX([0, aLo], -bLo, (aLo - 9.6) / bLo, qk), undefined, { role: 'demand', dash: true, faded: true }),
      );
    }
    els.push(
      curve('ar', [...upper, ...lower.slice(1)], 'D = AR', { role: 'demand' }),
      curve('mrUp', mrUpper, undefined, { role: 'mr' }),
      { kind: 'line', id: 'gap', from: [qk, mrUpTop], to: [qk, mrLoTop], variant: 'plain', dash: true, role: 'mr' },
      curve('mrLo', mrLower, 'MR', { role: 'mr', labelDir: 'e' }),
      // only the rising part of MC is relevant here
      curve('mc1', costCurve(mcAt(s1), base.minMC[0], 10), showMc2 ? 'MC_1' : 'MC', {
        role: 'mc',
        labelAt: [G.solve((q) => mcAt(s1)(q) - 8.6, base.minMC[0], 12), 8.6],
        labelDir: 'e',
      }),
      ...when(
        showMc2,
        curve('mc2', costCurve(mcAt(s2), base.minMC[0], 10), 'MC_2', {
          role: 'mc',
          labelAt: [G.solve((q) => mcAt(s2)(q) - 8.6, base.minMC[0], 12), 8.6],
          labelDir: 'w',
        }),
      ),
      eqPoint('k', [qk, pk], 'Q_e', 'P_e'),
    );
    if (P.b(p, 'notes')) {
      els.push(
        text('above', [2.2, aUp + 0.75], 'price rise not matched:\nelastic demand', { anchor: 'middle' }),
        text('below', [8.1, 3.6], 'price cut matched:\ninelastic demand', { anchor: 'middle' }),
      );
    }
    return { panels: [firmPanel({ elements: els })] };
  },
};

const priceDiscrimination: Template = {
  id: 'price-discrimination',
  name: 'Third-degree price discrimination',
  unit: 'micro',
  topic: T_IMP,
  hl: true,
  description:
    'A firm with market power separates customers into markets with different price elasticities and sets MR = MC in each: the higher price is charged in the market with the more inelastic demand.',
  keywords: ['price discrimination', 'third degree', 'separate markets', 'price elasticity of demand', 'MR = MC', 'market power'],
  caption: 'Third-degree price discrimination',
  controls: [
    toggle('shade', 'Shade profit in each market', true),
    toggle('combined', 'Add the combined market panel', false),
    slider('mc', 'Marginal cost', 1.5, 4.5, 0.1, 3, { group: 'Shape' }),
  ],
  build: (p) => {
    const mcv = P.n(p, 'mc', 3);
    const markets = [
      { id: 'a', title: 'Market A (inelastic demand)', A: 10, B: 1.2 },
      { id: 'b', title: 'Market B (elastic demand)', A: 6.2, B: 0.3 },
    ];
    const combined = P.b(p, 'combined');
    const w = combined ? 320 : 380;
    const h = combined ? 320 : 340;
    const panels: Panel[] = markets.map((m) => {
      const d = linearDemand(m.A, m.B);
      const q = (m.A - mcv) / (2 * m.B);
      const price = d.p(q);
      const ar = G.lineX([0, m.A], -m.B, Math.max(0, (m.A - 10) / m.B), Math.min(8.2, (m.A - 1.1) / m.B));
      const mr = G.lineX([0, m.A], -2 * m.B, Math.max(0, (m.A - 10) / (2 * m.B)), (m.A - 0.9) / (2 * m.B));
      const tag = m.id.toUpperCase();
      return firmPanel({
        id: m.id,
        title: m.title,
        xLabel: 'Quantity',
        yLabel: 'Price, costs',
        width: w,
        height: h,
        elements: [
          ...when(P.b(p, 'shade'), area('profit', G.rect(0, mcv, q, price), 'profit', undefined, 'Profit')),
          ...arMrEls(ar, mr, `D_${tag} = AR_${tag}`, `MR_${tag}`),
          mcLine(mcv),
          point('mcmr', [q, mcv]),
          eqPoint('e', [q, price], `Q_${tag}`, `P_${tag}`),
        ],
      });
    });
    if (combined) {
      // horizontal sums of the two demand and MR curves (kinked where market B starts)
      const sumQ = (f: (m: (typeof markets)[number], y: number) => number) => (y: number) =>
        markets.reduce((s, m) => s + Math.max(0, f(m, y)), 0);
      const qD = sumQ((m, y) => (m.A - y) / m.B);
      const qMR = sumQ((m, y) => (m.A - y) / (2 * m.B));
      const ys = G.fn((y) => y, 9.6, 0.6, 120).map(([y]) => y);
      const dT: Vec[] = ys.filter((y) => y >= 2.3).map((y) => [qD(y), y]);
      const mrT: Vec[] = ys.filter((y) => y >= 0.9).map((y) => [qMR(y), y]);
      const qT = qMR(mcv);
      panels.push(
        firmPanel({
          id: 'total',
          title: 'Combined market',
          xLabel: 'Quantity',
          xMax: 20,
          yLabel: 'Price, costs',
          width: w,
          height: h,
          elements: [
            curve('d', dT, 'D_T', { role: 'demand', labelDir: 'e' }),
            curve('mr', mrT, 'MR_T', { role: 'mr', labelDir: 'e' }),
            mcLine(mcv, 18.8),
            point('t', [qT, mcv], { xLabel: 'Q_A + Q_B' }),
          ],
        }),
      );
    }
    return { panels };
  },
};

export const microFirmTemplates: Template[] = [
  productCurves,
  shortRunCosts,
  longRunAC,
  revenuePC,
  revenueImperfect,
  profitMax,
  pcShortRun,
  pcLongRun,
  shutDown,
  monopolyProfit,
  monopolyWelfare,
  revenueMax,
  naturalMonopoly,
  monoCompSR,
  monoCompLR,
  kinked,
  priceDiscrimination,
];
