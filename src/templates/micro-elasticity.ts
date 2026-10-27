import type { El, Template, Vec } from '~/engine/types';
import {
  G,
  P,
  area,
  curve,
  eqPoint,
  panel,
  point,
  sdLine,
  select,
  shiftArrow,
  slider,
  text,
  toggle,
  when,
} from './kit';

const TOPIC = 'Elasticity';

// ---------------------------------------------------------------------------
// PED types

const PED_TYPES: Record<string, { label: string; value: string }> = {
  pe: { label: 'Perfectly elastic', value: 'PED = ∞' },
  pi: { label: 'Perfectly inelastic', value: 'PED = 0' },
  unit: { label: 'Unit elastic', value: 'PED = 1' },
  elastic: { label: 'Relatively elastic', value: 'PED > 1' },
  inelastic: { label: 'Relatively inelastic', value: 'PED < 1' },
};

/** Revenue lost / gained when price moves from (q1,p1) to (q2,p2). */
function revenueAreas(q1: number, p1: number, q2: number, p2: number): El[] {
  if (p2 < p1) {
    return [
      area('lost', G.rect(0, p2, q1, p1), 'loss', 'Lost', 'Revenue lost from the lower price'),
      area('gained', G.rect(q1, 0, q2, p2), 'gain', 'Gained', 'Revenue gained from the higher quantity'),
    ];
  }
  return [
    area('gained', G.rect(0, p1, q2, p2), 'gain', 'Gained', 'Revenue gained from the higher price'),
    area('lost', G.rect(q2, 0, q1, p1), 'loss', 'Lost', 'Revenue lost from the lower quantity'),
  ];
}

const pedTypes: Template = {
  id: 'ped-types',
  name: 'Price elasticity of demand: types',
  unit: 'micro',
  topic: TOPIC,
  description:
    'Demand curves for perfectly elastic, perfectly inelastic, unit elastic (rectangular hyperbola), relatively elastic and relatively inelastic demand.',
  keywords: ['PED', 'price elasticity of demand', 'perfectly elastic', 'perfectly inelastic', 'unit elastic', 'rectangular hyperbola', 'elastic', 'inelastic'],
  caption: 'Price elasticity of demand',
  controls: [
    select(
      'type',
      'Type',
      Object.entries(PED_TYPES).map(([value, t]) => ({ value, label: `${t.label} (${t.value})` })),
      'elastic',
    ),
    toggle('change', 'Show a price change', true),
    toggle('revenue', 'Show revenue lost and gained', false, { show: (p) => !['pe', 'pi'].includes(String(p.type)) }),
    toggle('value', 'Write the PED value on the curve', true),
  ],
  build: (p) => {
    const type = P.s(p, 'type', 'elastic');
    const info = PED_TYPES[type] ?? PED_TYPES.elastic;
    const label = P.b(p, 'value') ? `D (${info.value})` : 'D';
    const change = P.b(p, 'change');
    const els: El[] = [];
    let d: Vec[];
    let a: Vec | null = null;
    let b: Vec | null = null;
    switch (type) {
      case 'pe':
        d = G.hline(5, 0, 8.6);
        if (change) {
          els.push(eqPoint('a', [3, 5], 'Q_1', 'P'), point('b', [7, 5], { xLabel: 'Q_2' }));
        }
        break;
      case 'pi':
        d = G.vline(5, 0.9, 9.4);
        if (change) {
          els.push(eqPoint('a', [5, 7.5], 'Q', 'P_1'), point('b', [5, 3], { yLabel: 'P_2' }));
        }
        break;
      case 'unit': {
        const k = 20;
        d = G.fn((q) => k / q, k / 9.4, 8.6);
        a = [2.5, 8];
        b = [5, 4];
        break;
      }
      case 'inelastic':
        d = sdLine([5, 5], -2.2);
        a = G.atY(d, 7.2);
        b = G.atY(d, 2.8);
        break;
      default:
        d = sdLine([5, 5], -0.38, { xHi: 8.6 });
        a = G.atY(d, 5.76);
        b = G.atY(d, 4.24);
    }
    els.unshift(curve('d', d, label, { role: 'demand' }));
    if (a && b) {
      if (P.b(p, 'revenue') && change) els.unshift(...revenueAreas(a[0], a[1], b[0], b[1]));
      if (change) els.push(eqPoint('a', a, 'Q_1', 'P_1'), eqPoint('b', b, 'Q_2', 'P_2'));
    }
    return { panels: [panel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// PED along a linear demand curve (+ total revenue)

const pedLinear: Template = {
  id: 'ped-linear-demand',
  name: 'PED along a straight-line demand curve',
  unit: 'micro',
  topic: TOPIC,
  description:
    'PED falls as we move down a linear demand curve: elastic above the midpoint, unit elastic at the midpoint, inelastic below. Total revenue peaks where PED = 1.',
  keywords: ['PED', 'linear demand', 'midpoint', 'unit elastic', 'total revenue', 'TR', 'revenue maximisation', 'variable elasticity'],
  caption: 'PED varies along a linear demand curve',
  controls: [
    toggle('tr', 'Show total revenue curve below', true),
    toggle('segments', 'Label elastic / inelastic ranges', true),
    toggle('mid', 'Mark the midpoint (PED = 1)', true),
  ],
  build: (p) => {
    const A = 9;
    const qMax = 9;
    const price = (q: number) => A - (A / qMax) * q;
    const d: Vec[] = [
      [0, A],
      [qMax, 0],
    ];
    const qm = qMax / 2;
    const pm = price(qm);
    const showTR = P.b(p, 'tr');
    const els: El[] = [curve('d', d, 'D', { role: 'demand', labelAt: [8.1, price(8.1)], labelDir: 'ne' })];
    if (P.b(p, 'mid')) {
      els.push(eqPoint('mid', [qm, pm], 'Q_1', 'P_1', { label: 'PED = 1', labelDir: 'ne' }));
    }
    if (P.b(p, 'segments')) {
      els.push(
        text('el', [2.3, price(2.3) + 1.25], 'PED > 1\n(elastic)', { anchor: 'start' }),
        text('inel', [6.9, price(6.9) + 1.25], 'PED < 1\n(inelastic)', { anchor: 'start' }),
      );
    }
    const top = panel({ id: 'demand', elements: els, height: showTR ? 280 : 380 });
    if (!showTR) return { panels: [top] };
    const tr = G.fn((q) => price(q) * q, 0, qMax, 120);
    const trMax = price(qm) * qm;
    const yMax = Math.ceil((trMax * 1.25) / 5) * 5;
    const bottom = panel({
      id: 'revenue',
      xLabel: 'Quantity',
      yLabel: 'Total revenue',
      yMax,
      height: 220,
      elements: [
        curve('tr', tr, 'TR', { role: 'alt', labelAt: [qMax * 0.86, price(qMax * 0.86) * qMax * 0.86], labelDir: 'ne' }),
        eqPoint('trmax', [qm, trMax], 'Q_1', 'TR_{max}'),
        ...when(
          P.b(p, 'segments'),
          text('rising', [qm * 0.42, trMax * 0.42], 'TR rises\nas P falls', { anchor: 'middle', muted: true, size: 0.75 }),
          text('falling', [qm * 1.58, trMax * 0.42], 'TR falls\nas P falls', { anchor: 'middle', muted: true, size: 0.75 }),
        ),
      ],
    });
    return { panels: [top, bottom], layout: 'column' };
  },
};

// ---------------------------------------------------------------------------
// PED and total revenue

const pedRevenue: Template = {
  id: 'ped-total-revenue',
  name: 'PED and total revenue',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A price change on elastic demand moves total revenue the opposite way to price; on inelastic demand revenue moves the same way as price.',
  keywords: ['PED', 'total revenue', 'TR', 'elastic', 'inelastic', 'price change', 'revenue gained', 'revenue lost', 'firm pricing'],
  caption: 'Price elasticity of demand and total revenue',
  controls: [
    select('case', 'Demand', [
      { value: 'elastic', label: 'Elastic (PED > 1)' },
      { value: 'inelastic', label: 'Inelastic (PED < 1)' },
    ], 'elastic'),
    select('dir', 'Price change', [
      { value: 'fall', label: 'Price falls' },
      { value: 'rise', label: 'Price rises' },
    ], 'fall'),
    toggle('kept', 'Shade revenue unchanged', false),
    toggle('note', 'State the effect on total revenue', true),
  ],
  build: (p) => {
    const elastic = P.s(p, 'case') !== 'inelastic';
    const fall = P.s(p, 'dir') !== 'rise';
    const d = elastic ? sdLine([5, 5], -0.4, { xHi: 8.8 }) : sdLine([5, 5], -2);
    const delta = elastic ? 0.8 : 1.8;
    const hi = G.atY(d, 5 + delta);
    const lo = G.atY(d, 5 - delta);
    const [a, b] = fall ? [hi, lo] : [lo, hi];
    const trUp = elastic === fall;
    const els: El[] = [
      ...when(
        P.b(p, 'kept'),
        area('kept', G.rect(0, 0, Math.min(a[0], b[0]), Math.min(a[1], b[1])), 'neutral', '', 'Revenue unchanged'),
      ),
      ...revenueAreas(a[0], a[1], b[0], b[1]),
      curve('d', d, elastic ? 'D (PED > 1)' : 'D (PED < 1)', { role: 'demand' }),
      eqPoint('a', a, 'Q_1', 'P_1'),
      eqPoint('b', b, 'Q_2', 'P_2'),
      ...when(
        P.b(p, 'note'),
        text('note', [9.8, 9.4], `${fall ? 'Price falls' : 'Price rises'}: total revenue ${trUp ? 'rises' : 'falls'}\n(${trUp ? 'gain > loss' : 'loss > gain'})`, {
          anchor: 'end',
          muted: true,
          size: 0.8,
        }),
      ),
    ];
    return { panels: [panel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// PES types

const PES = {
  elastic: { name: 'Elastic (cuts the price axis)', value: 'PES > 1' },
  unit: { name: 'Unit elastic (through the origin)', value: 'PES = 1' },
  inelastic: { name: 'Inelastic (cuts the quantity axis)', value: 'PES < 1' },
  pe: { name: 'Perfectly elastic', value: 'PES = ∞' },
  pi: { name: 'Perfectly inelastic', value: 'PES = 0' },
} as const;

function pesLine(kind: keyof typeof PES): Vec[] {
  switch (kind) {
    case 'elastic':
      return G.lineX([5, 5], 0.6, 0, 8);
    case 'unit':
      return G.lineX([5, 5], 1, 0, 8.4);
    case 'inelastic':
      return G.lineX([5, 5], 2, 2.5, 7.3);
    case 'pe':
      return G.hline(5, 0, 8.4);
    case 'pi':
      return G.vline(5, 0.9, 9.4);
  }
}

const pesTypes: Template = {
  id: 'pes-types',
  name: 'Price elasticity of supply: types',
  unit: 'micro',
  topic: TOPIC,
  description:
    'A straight supply curve through the origin is unit elastic; one cutting the price axis is elastic; one cutting the quantity axis is inelastic. Plus the perfectly elastic and inelastic extremes.',
  keywords: ['PES', 'price elasticity of supply', 'elastic supply', 'inelastic supply', 'unit elastic', 'perfectly elastic', 'perfectly inelastic', 'origin'],
  caption: 'Price elasticity of supply',
  controls: [
    select(
      'type',
      'Type',
      [
        ...Object.entries(PES).map(([value, t]) => ({ value, label: `${t.name} (${t.value})` })),
        { value: 'compare', label: 'Compare elastic, unit and inelastic' },
      ],
      'compare',
    ),
    toggle('change', 'Show a price change', false, { show: (p) => p.type !== 'compare' }),
    toggle('value', 'Write the PES value on the curve', true),
  ],
  build: (p) => {
    const type = P.s(p, 'type', 'compare');
    const withValue = P.b(p, 'value');
    const els: El[] = [];
    if (type === 'compare') {
      (['elastic', 'unit', 'inelastic'] as const).forEach((k, i) => {
        els.push(curve(`s${i + 1}`, pesLine(k), withValue ? `S_${i + 1} (${PES[k].value})` : `S_${i + 1}`, { role: 'supply' }));
      });
      return { panels: [panel({ elements: els })] };
    }
    const kind = (type in PES ? type : 'unit') as keyof typeof PES;
    const s = pesLine(kind);
    els.push(curve('s', s, withValue ? `S (${PES[kind].value})` : 'S', { role: 'supply' }));
    if (P.b(p, 'change')) {
      if (kind === 'pe') els.push(eqPoint('a', [3, 5], 'Q_1', 'P'), point('b', [7, 5], { xLabel: 'Q_2' }));
      else if (kind === 'pi') els.push(eqPoint('a', [5, 3], 'Q', 'P_1'), point('b', [5, 7], { yLabel: 'P_2' }));
      else {
        els.push(eqPoint('a', G.atY(s, 4), 'Q_1', 'P_1'), eqPoint('b', G.atY(s, 7), 'Q_2', 'P_2'));
      }
    }
    return { panels: [panel({ elements: els })] };
  },
};

// ---------------------------------------------------------------------------
// Commodity price volatility

function volatilityPanel(
  id: string,
  title: string | undefined,
  slope: number,
  shock: 'supply' | 'demand',
  dir: number,
  size: number,
  compact: boolean,
) {
  const d1 = sdLine([5, 5], -slope);
  const s1 = sdLine([5, 5], slope);
  const d2 = shock === 'demand' ? sdLine([5 + dir * size, 5], -slope) : d1;
  const s2 = shock === 'supply' ? sdLine([5 + dir * size, 5], slope) : s1;
  const e1 = G.meet(d1, s1);
  const e2 = G.meet(d2, s2);
  // flat curves sit close together at their ends: push the two labels apart vertically
  const flat = slope < 1;
  const newAbove = shock === 'supply' ? dir < 0 : dir > 0;
  const split = (isNew: boolean) => (flat ? { labelDir: (isNew === newAbove ? 'ne' : 'se') as 'ne' | 'se' } : {});
  const els: El[] = [
    curve(shock === 'demand' ? 'd1' : 'd', d1, shock === 'demand' ? 'D_1' : 'D', {
      role: 'demand',
      ...(shock === 'demand' ? split(false) : {}),
    }),
    curve(shock === 'supply' ? 's1' : 's', s1, shock === 'supply' ? 'S_1' : 'S', {
      role: 'supply',
      ...(shock === 'supply' ? split(false) : {}),
    }),
    ...when(shock === 'demand', curve('d2', d2, 'D_2', { role: 'demand', ...split(true) })),
    ...when(shock === 'supply', curve('s2', s2, 'S_2', { role: 'supply', ...split(true) })),
    shiftArrow('shift', shock === 'supply' ? s1 : d1, shock === 'supply' ? s2 : d2, { t: shock === 'supply' ? 0.82 : 0.18 }),
    eqPoint('e1', e1, 'Q_1', 'P_1'),
    eqPoint('e2', e2, 'Q_2', 'P_2'),
  ];
  return panel({
    id,
    title,
    elements: els,
    width: compact ? 360 : undefined,
    height: compact ? 320 : undefined,
  });
}

const volatility: Template = {
  id: 'commodity-price-volatility',
  name: 'Commodity price volatility (inelastic D and S)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'Primary commodities have price-inelastic demand and supply, so supply shocks (harvests, weather) cause large price swings with small quantity changes.',
  keywords: ['commodity prices', 'price volatility', 'agriculture', 'inelastic supply', 'inelastic demand', 'primary products', 'harvest', 'PES', 'PED'],
  caption: 'Price volatility in commodity markets',
  controls: [
    select('shock', 'Shock', [
      { value: 'supply', label: 'Supply shock (harvest / weather)' },
      { value: 'demand', label: 'Demand shock (global demand)' },
    ], 'supply'),
    select('dir', 'Direction', [
      { value: 'dec', label: 'Decrease (e.g. bad harvest)' },
      { value: 'inc', label: 'Increase (e.g. good harvest)' },
    ], 'dec'),
    toggle('compare', 'Compare with a manufactured good (elastic D and S)', false),
    slider('size', 'Size of shock', 0.5, 2, 0.1, 1.2, { group: 'Shape' }),
  ],
  build: (p) => {
    const shock = P.s(p, 'shock') === 'demand' ? 'demand' : 'supply';
    const dir = P.s(p, 'dir') === 'inc' ? 1 : -1;
    const size = P.n(p, 'size', 1.2);
    if (!P.b(p, 'compare')) return { panels: [volatilityPanel('main', undefined, 2, shock, dir, size, false)] };
    return {
      panels: [
        volatilityPanel('commodity', 'Primary commodity', 2, shock, dir, size, true),
        volatilityPanel('manufactured', 'Manufactured good', 0.45, shock, dir, size, true),
      ],
    };
  },
};

export const microElasticityTemplates: Template[] = [pedTypes, pedLinear, pedRevenue, pesTypes, volatility];
