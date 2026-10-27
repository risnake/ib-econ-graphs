import type { El, Params, Template, Vec } from '~/engine/types';
import {
  G,
  P,
  area,
  curve,
  dragHandle,
  eqPoint,
  measure,
  panel,
  point,
  sdLine,
  select,
  shapeControls,
  shiftArrow,
  slider,
  toggle,
} from './kit';

const TOPIC = 'Market failure';

type ExtKind = 'neg-prod' | 'neg-cons' | 'pos-prod' | 'pos-cons';

interface ExtSpec {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  caption: string;
  policies: { value: string; label: string }[];
}

const SPECS: Record<ExtKind, ExtSpec> = {
  'neg-prod': {
    id: 'negative-production-externality',
    name: 'Negative production externality',
    description:
      'Production imposes external costs on third parties (e.g. pollution), so MSC lies above MPC and the free market over-produces: Q_m > Q*, creating a welfare loss.',
    keywords: ['negative externality', 'production externality', 'external cost', 'pollution', 'MSC', 'MPC', 'overproduction', 'over-allocation', 'welfare loss', 'Pigouvian tax', 'carbon tax'],
    caption: 'Negative production externality',
    policies: [
      { value: 'none', label: 'None' },
      { value: 'tax', label: 'Pigouvian (carbon) tax' },
      { value: 'regulation', label: 'Regulation: output limited to Q*' },
    ],
  },
  'neg-cons': {
    id: 'negative-consumption-externality',
    name: 'Negative consumption externality',
    description:
      'Consumption imposes external costs on others (e.g. smoking, alcohol), so MSB lies below MPB and the free market over-consumes: Q_m > Q*, creating a welfare loss.',
    keywords: ['negative externality', 'consumption externality', 'demerit good', 'external cost', 'MSB', 'MPB', 'overconsumption', 'over-allocation', 'welfare loss', 'indirect tax', 'sin tax', 'education'],
    caption: 'Negative consumption externality',
    policies: [
      { value: 'none', label: 'None' },
      { value: 'tax', label: 'Indirect tax' },
      { value: 'education', label: 'Education / negative advertising' },
    ],
  },
  'pos-prod': {
    id: 'positive-production-externality',
    name: 'Positive production externality',
    description:
      'Production creates external benefits for third parties (e.g. worker training, R&D spillovers), so MSC lies below MPC and the free market under-produces: Q_m < Q*.',
    keywords: ['positive externality', 'production externality', 'external benefit', 'MSC', 'MPC', 'underproduction', 'under-allocation', 'welfare loss', 'subsidy', 'training', 'research and development'],
    caption: 'Positive production externality',
    policies: [
      { value: 'none', label: 'None' },
      { value: 'subsidy', label: 'Subsidy to producers' },
    ],
  },
  'pos-cons': {
    id: 'positive-consumption-externality',
    name: 'Positive consumption externality',
    description:
      'Consumption creates external benefits for others (e.g. education, vaccinations), so MSB lies above MPB and the free market under-consumes: Q_m < Q*.',
    keywords: ['positive externality', 'consumption externality', 'merit good', 'external benefit', 'MSB', 'MPB', 'underconsumption', 'under-allocation', 'welfare loss', 'subsidy', 'vaccination', 'education', 'positive advertising'],
    caption: 'Positive consumption externality',
    policies: [
      { value: 'none', label: 'None' },
      { value: 'subsidy', label: 'Subsidy' },
      { value: 'advertising', label: 'Positive advertising / education' },
    ],
  },
};

/** Private curves end early so the long labels ("D = MPB = MSB") fit beside them. */
const X_HI = 7.8;

function buildExternality(kind: ExtKind, p: Params) {
  const production = kind.endsWith('prod');
  const negative = kind.startsWith('neg');
  const ext = P.n(p, 'ext', 2);
  const parallel = P.s(p, 'shape', 'parallel') !== 'diverging';
  const dS = -P.n(p, 'dSlope', 0.8);
  const sS = P.n(p, 'sSlope', 0.8);
  const policy = P.s(p, 'policy', 'none');

  const mpb = sdLine([5, 5], dS, { xHi: X_HI });
  const mpc = sdLine([5, 5], sS, { xHi: X_HI });
  // the social curve: vertical gap `ext` at the market quantity (5), either parallel or
  // diverging from the private curve's intercept
  let social: Vec[];
  if (production) {
    const sign = negative ? 1 : -1;
    const slope = parallel ? sS : Math.max(0.12, sS + (sign * ext) / 5);
    social = sdLine([5, 5 + sign * ext], slope, { xHi: X_HI, yLo: 0.6 });
  } else {
    const sign = negative ? -1 : 1;
    const slope = parallel ? dS : Math.min(-0.12, dS + (sign * ext) / 5);
    social = sdLine([5, 5 + sign * ext], slope, { xHi: X_HI, yLo: 0.6 });
  }
  const msb = production ? mpb : social;
  const msc = production ? social : mpc;
  const [qm, pm] = G.meet(mpb, mpc);
  const [qo, po] = G.meet(msb, msc);

  const labels: Record<ExtKind, { d: string; s: string; social: string }> = {
    'neg-prod': { d: 'D = MPB = MSB', s: 'S = MPC', social: 'MSC' },
    'neg-cons': { d: 'D = MPB', s: 'S = MPC = MSC', social: 'MSB' },
    'pos-prod': { d: 'D = MPB = MSB', s: 'S = MPC', social: 'MSC' },
    'pos-cons': { d: 'D = MPB', s: 'S = MPC = MSC', social: 'MSB' },
  };
  const lab = { ...labels[kind] };
  const els: El[] = [];
  const policyEls: El[] = [];

  // --- policies ---------------------------------------------------------
  const privateCurve = production ? mpc : mpb;
  if (policy === 'tax' && kind === 'neg-prod') {
    if (parallel) lab.social = 'MSC = MPC + tax';
    else {
      const t = po - G.yAt(mpc, qo);
      policyEls.push(curve('taxed', sdLine([5, 5 + t], sS, { xHi: X_HI }), 'MPC + tax', { role: 'policy', dash: true }));
    }
    policyEls.push(shiftArrow('policyShift', mpc, social, { mode: 'v', t: 0.12, label: 'tax' }));
  } else if (policy === 'regulation' && kind === 'neg-prod') {
    policyEls.push(curve('quota', G.vline(qo, 0.4, 9.3), 'Regulation', { role: 'policy' }));
  } else if (policy === 'tax' && kind === 'neg-cons') {
    const t = G.yAt(mpb, qo) - G.yAt(mpc, qo);
    const taxed = sdLine([5, 5 + t], sS, { xHi: X_HI });
    policyEls.push(
      curve('taxed', taxed, 'S + tax', { role: 'policy' }),
      shiftArrow('policyShift', mpc, taxed, { mode: 'v', t: 0.15 }),
      point('pc', [qo, G.yAt(mpb, qo)], { yLabel: 'P_c' }),
    );
  } else if (policy === 'education' && kind === 'neg-cons') {
    lab.social = 'MSB = MPB_2';
    policyEls.push(shiftArrow('policyShift', mpb, social, { mode: 'h', t: 0.3 }));
  } else if (policy === 'subsidy' && kind === 'pos-prod') {
    if (parallel) lab.social = 'MSC =\nMPC − subsidy';
    else {
      const s = G.yAt(mpc, qo) - po;
      policyEls.push(curve('subsidised', sdLine([5, 5 - s], sS, { xHi: X_HI, yLo: 0.6 }), 'MPC − subsidy', { role: 'policy', dash: true }));
    }
    policyEls.push(shiftArrow('policyShift', mpc, social, { mode: 'v', t: 0.85 }));
  } else if (policy === 'subsidy' && kind === 'pos-cons') {
    const s = G.yAt(mpc, qo) - G.yAt(mpb, qo);
    const sub = sdLine([5, 5 - s], sS, { xHi: X_HI, yLo: 0.6 });
    policyEls.push(
      curve('subsidised', sub, 'S − subsidy', { role: 'policy' }),
      shiftArrow('policyShift', mpc, sub, { mode: 'v', t: 0.85 }),
      point('pc', [qo, G.yAt(mpb, qo)], { yLabel: 'P_c' }),
    );
  } else if (policy === 'advertising' && kind === 'pos-cons') {
    lab.social = 'MSB = MPB_2';
    policyEls.push(shiftArrow('policyShift', mpb, social, { mode: 'h', t: 0.25 }));
  }

  // --- welfare loss: between MSB and MSC from Q* to Q_m --------------------
  if (P.b(p, 'dwl')) {
    els.push(
      area('dwl', [[qo, po], [qm, G.yAt(msc, qm)], [qm, G.yAt(msb, qm)]], 'dwl', 'WL', 'Welfare loss'),
    );
  }

  // --- external cost / benefit marker ---------------------------------------
  // just past Q_m for external costs (clear of the curve-end labels), left of Q_m for benefits
  let xm = negative ? qm + 0.9 : qm - 1.6;
  if (negative) {
    while (xm > qm + 0.5 && Math.max(G.yAt(social, xm), G.yAt(privateCurve, xm)) > 9.3) xm -= 0.1;
  } else {
    const start = Math.max(social[0][0], privateCurve[0][0]);
    xm = Math.max(xm, start + 0.4);
  }
  const yPriv = G.yAt(privateCurve, xm);
  const ySoc = G.yAt(social, xm);
  // the advertising arrow runs through the marker's spot, and closes the same gap anyway
  const markerClash = policy === 'advertising';
  if (P.b(p, 'marker') && !markerClash) {
    els.push(
      measure('external', [xm, Math.min(yPriv, ySoc)], [xm, Math.max(yPriv, ySoc)], negative ? 'external\ncost' : 'external benefit', {
        labelDir: negative ? 'e' : 'w',
      }),
    );
  }

  els.push(
    curve('d', mpb, lab.d, { role: 'demand' }),
    curve('s', mpc, lab.s, { role: 'supply' }),
    curve('social', social, lab.social, { role: 'social' }),
    ...policyEls,
    eqPoint('market', [qm, pm], 'Q_m', 'P_m'),
    eqPoint('optimum', [qo, po], 'Q*', 'P*'),
  );

  const grow = production ? (negative ? 1 : -1) : negative ? -1 : 1;
  return {
    panels: [
      panel({
        elements: els,
        handles: [
          dragHandle('h-ext', [xm, ySoc], 'y', 'ext', ext, {
            min: 0.6,
            max: 3.5,
            scale: grow,
            hint: 'Drag to change the size of the externality',
          }),
        ],
      }),
    ],
  };
}

function externalityTemplate(kind: ExtKind): Template {
  const spec = SPECS[kind];
  const negative = kind.startsWith('neg');
  return {
    id: spec.id,
    name: spec.name,
    unit: 'micro',
    topic: TOPIC,
    description: spec.description,
    keywords: spec.keywords,
    caption: spec.caption,
    controls: [
      select('policy', 'Government response', spec.policies, 'none'),
      toggle('dwl', 'Shade welfare loss', true),
      toggle('marker', negative ? 'Mark the external cost' : 'Mark the external benefit', true),
      select('shape', 'Social curve', [
        { value: 'parallel', label: 'Parallel (constant externality per unit)' },
        { value: 'diverging', label: 'Diverging (externality grows with output)' },
      ], 'parallel', { group: 'Shape' }),
      slider('ext', negative ? 'Size of external cost' : 'Size of external benefit', 0.6, 3.5, 0.1, 2, { group: 'Shape' }),
      ...shapeControls(),
    ],
    build: (p) => buildExternality(kind, p),
  };
}

// ---------------------------------------------------------------------------
// Tradable permits

const permits: Template = {
  id: 'tradable-permits',
  name: 'Tradable permits (cap and trade)',
  unit: 'micro',
  topic: TOPIC,
  description:
    'The government caps pollution with a fixed (vertical) supply of permits; the permit price is set by demand. Rising demand or a tighter cap raises the price, increasing the incentive to cut emissions.',
  keywords: ['tradable permits', 'cap and trade', 'emissions trading', 'pollution permits', 'carbon market', 'ETS', 'negative externality', 'market-based policy'],
  caption: 'Market for tradable pollution permits',
  controls: [
    select('mode', 'Show', [
      { value: 'basic', label: 'Permit market' },
      { value: 'demand', label: 'Demand for permits increases' },
      { value: 'cut', label: 'Government reduces the number of permits' },
    ], 'demand'),
    slider('size', 'Size of change', 0.8, 2.6, 0.1, 1.8, { group: 'Shape' }),
    slider('dSlope', 'Demand steepness', 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const mode = P.s(p, 'mode', 'demand');
    const size = P.n(p, 'size', 1.8);
    const dS = -P.n(p, 'dSlope', 0.8);
    const q1 = 5;
    const d1 = sdLine([5, 4], dS);
    const s1 = G.vline(q1, 0, 9.4);
    const els: El[] = [];
    const [, p1] = G.meet(d1, s1);
    if (mode === 'demand') {
      const d2 = sdLine([5 + size, 4], dS);
      const [, p2] = G.meet(d2, s1);
      els.push(
        curve('d1', d1, 'D_1', { role: 'demand' }),
        curve('d2', d2, 'D_2', { role: 'demand' }),
        curve('s', s1, 'S_{permits}', { role: 'supply' }),
        shiftArrow('shift', d1, d2, { t: 0.82 }),
        eqPoint('e1', [q1, p1], 'Q_1', 'P_1'),
        eqPoint('e2', [q1, p2], '', 'P_2'),
      );
    } else if (mode === 'cut') {
      const q2 = q1 - size;
      const s2 = G.vline(q2, 0, 9.4);
      const [, p2] = G.meet(d1, s2);
      els.push(
        curve('d', d1, 'D', { role: 'demand' }),
        curve('s1', s1, 'S_1', { role: 'supply' }),
        curve('s2', s2, 'S_2', { role: 'supply' }),
        shiftArrow('shift', s1, s2, { t: 0.9 }),
        eqPoint('e1', [q1, p1], 'Q_1', 'P_1'),
        eqPoint('e2', [q2, p2], 'Q_2', 'P_2'),
      );
    } else {
      els.push(
        curve('d', d1, 'D', { role: 'demand' }),
        curve('s', s1, 'S_{permits}', { role: 'supply' }),
        eqPoint('e', [q1, p1], 'Q_1', 'P_1'),
      );
    }
    return {
      panels: [panel({ xLabel: 'Quantity of permits', yLabel: 'Price of permits', elements: els })],
    };
  },
};

export const microFailureTemplates: Template[] = [
  externalityTemplate('neg-prod'),
  externalityTemplate('neg-cons'),
  externalityTemplate('pos-prod'),
  externalityTemplate('pos-cons'),
  permits,
];

