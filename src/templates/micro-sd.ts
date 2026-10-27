import type { El, Params, Template } from '~/engine/types';
import {
  G,
  P,
  alongArrow,
  area,
  curve,
  dragHandle,
  eqPoint,
  guide,
  measure,
  panel,
  point,
  select,
  sd,
  shapeControls,
  shiftArrow,
  slider,
  tick,
  toggle,
  when,
} from './kit';

const TOPIC = 'Demand & supply';

const shape = shapeControls();

const positionControls = [
  slider('dPos', 'Demand position', -3, 3, 0.1, 0, { group: 'Shape' }),
  slider('sPos', 'Supply position', -3, 3, 0.1, 0, { group: 'Shape' }),
];

/** D and S at the user's chosen positions, with handles to drag them directly. */
function positioned(p: Params) {
  const { D, S } = sd(p);
  const dPos = P.n(p, 'dPos', 0);
  const sPos = P.n(p, 'sPos', 0);
  const d = D(dPos);
  const s = S(sPos);
  const handles = [
    dragHandle('h-d', G.pointAt(d, 0.12), 'x', 'dPos', dPos, { min: -3, max: 3, hint: 'Drag to shift demand' }),
    dragHandle('h-s', G.pointAt(s, 0.88), 'x', 'sPos', sPos, { min: -3, max: 3, hint: 'Drag to shift supply' }),
  ];
  return { d, s, handles };
}

const demandCurve: Template = {
  id: 'demand-curve',
  name: 'Demand curve (law of demand)',
  unit: 'micro',
  topic: TOPIC,
  description: 'A downward-sloping demand curve showing a movement along the curve after a price change.',
  keywords: ['law of demand', 'movement along', 'extension', 'contraction', 'quantity demanded'],
  caption: 'The law of demand',
  controls: [
    select('dir', 'Price change', [
      { value: 'fall', label: 'Price falls (extension)' },
      { value: 'rise', label: 'Price rises (contraction)' },
    ], 'fall'),
    toggle('points', 'Label points A and B', true),
    slider('dSlope', 'Demand steepness', 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const { D } = sd(p);
    const d = D();
    const fall = P.s(p, 'dir') !== 'rise';
    const a = G.atY(d, 7);
    const b = G.atY(d, 3.5);
    const [from, to] = fall ? [a, b] : [b, a];
    const labels = P.b(p, 'points');
    return {
      panels: [
        panel({
          elements: [
            curve('d', d, 'D', { role: 'demand' }),
            eqPoint('a', from, 'Q_1', 'P_1', { label: labels ? 'A' : undefined, labelDir: 'ne' }),
            eqPoint('b', to, 'Q_2', 'P_2', { label: labels ? 'B' : undefined, labelDir: 'ne' }),
            alongArrow('move', d, G.clamp(fall ? 0.3 : 0.65, 0, 1), fall ? 0.65 : 0.3, 0.45),
          ],
        }),
      ],
    };
  },
};

const demandShift: Template = {
  id: 'demand-shift',
  name: 'Shift in demand',
  unit: 'micro',
  topic: TOPIC,
  description: 'An increase or decrease in demand caused by a non-price determinant, shifting the whole curve.',
  keywords: ['increase in demand', 'decrease in demand', 'determinants', 'income', 'tastes', 'shift'],
  caption: 'A change in demand',
  controls: [
    select('dir', 'Change', [
      { value: 'inc', label: 'Increase (shift right)' },
      { value: 'dec', label: 'Decrease (shift left)' },
    ], 'inc'),
    toggle('guides', 'Show quantity change at a given price', true),
    slider('shift', 'Shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape' }),
    slider('dSlope', 'Demand steepness', 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const inc = P.s(p, 'dir') !== 'dec';
    const s = P.n(p, 'shift', 2);
    const { D } = sd(p);
    const d1 = inc ? D(-s / 2) : D(s / 2);
    const d2 = inc ? D(s / 2) : D(-s / 2);
    const price = 5;
    return {
      panels: [
        panel({
          elements: [
            curve('d1', d1, 'D_1', { role: 'demand' }),
            curve('d2', d2, 'D_2', { role: 'demand' }),
            shiftArrow('shift', d1, d2, { t: 0.32 }),
            ...when(
              P.b(p, 'guides'),
              eqPoint('q1', G.atY(d1, price), 'Q_1', 'P', { dot: true }),
              eqPoint('q2', G.atY(d2, price), 'Q_2', '', { dot: true }),
            ),
          ],
          handles: [
            dragHandle('h-shift', G.pointAt(d2, 0.6), 'x', 'shift', s, {
              min: 0.5,
              max: 3.5,
              scale: inc ? 2 : -2,
              hint: 'Drag to change the size of the shift',
            }),
          ],
        }),
      ],
    };
  },
};

const supplyCurve: Template = {
  id: 'supply-curve',
  name: 'Supply curve (law of supply)',
  unit: 'micro',
  topic: TOPIC,
  description: 'An upward-sloping supply curve showing a movement along the curve after a price change.',
  keywords: ['law of supply', 'movement along', 'quantity supplied', 'extension', 'contraction'],
  caption: 'The law of supply',
  controls: [
    select('dir', 'Price change', [
      { value: 'rise', label: 'Price rises (extension)' },
      { value: 'fall', label: 'Price falls (contraction)' },
    ], 'rise'),
    toggle('points', 'Label points A and B', true),
    slider('sSlope', 'Supply steepness', 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const { S } = sd(p);
    const s = S();
    const rise = P.s(p, 'dir') !== 'fall';
    const a = G.atY(s, 3.5);
    const b = G.atY(s, 7);
    const [from, to] = rise ? [a, b] : [b, a];
    const labels = P.b(p, 'points');
    return {
      panels: [
        panel({
          elements: [
            curve('s', s, 'S', { role: 'supply' }),
            eqPoint('a', from, 'Q_1', 'P_1', { label: labels ? 'A' : undefined, labelDir: 'nw' }),
            eqPoint('b', to, 'Q_2', 'P_2', { label: labels ? 'B' : undefined, labelDir: 'nw' }),
            alongArrow('move', s, rise ? 0.35 : 0.68, rise ? 0.68 : 0.35, -0.45),
          ],
        }),
      ],
    };
  },
};

const supplyShift: Template = {
  id: 'supply-shift',
  name: 'Shift in supply',
  unit: 'micro',
  topic: TOPIC,
  description: 'An increase or decrease in supply caused by a non-price determinant (costs, technology, taxes...).',
  keywords: ['increase in supply', 'decrease in supply', 'costs of production', 'technology', 'shift'],
  caption: 'A change in supply',
  controls: [
    select('dir', 'Change', [
      { value: 'inc', label: 'Increase (shift right)' },
      { value: 'dec', label: 'Decrease (shift left)' },
    ], 'inc'),
    toggle('guides', 'Show quantity change at a given price', true),
    slider('shift', 'Shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape' }),
    slider('sSlope', 'Supply steepness', 0.3, 2.5, 0.05, 0.8, { group: 'Shape' }),
  ],
  build: (p) => {
    const inc = P.s(p, 'dir') !== 'dec';
    const s = P.n(p, 'shift', 2);
    const { S } = sd(p);
    const s1 = inc ? S(-s / 2) : S(s / 2);
    const s2 = inc ? S(s / 2) : S(-s / 2);
    const price = 5;
    return {
      panels: [
        panel({
          elements: [
            curve('s1', s1, 'S_1', { role: 'supply' }),
            curve('s2', s2, 'S_2', { role: 'supply' }),
            shiftArrow('shift', s1, s2, { t: 0.62 }),
            ...when(
              P.b(p, 'guides'),
              eqPoint('q1', G.atY(s1, price), 'Q_1', 'P', { dot: true }),
              eqPoint('q2', G.atY(s2, price), 'Q_2', '', { dot: true }),
            ),
          ],
          handles: [
            dragHandle('h-shift', G.pointAt(s2, 0.4), 'x', 'shift', s, {
              min: 0.5,
              max: 3.5,
              scale: inc ? 2 : -2,
              hint: 'Drag to change the size of the shift',
            }),
          ],
        }),
      ],
    };
  },
};

const equilibrium: Template = {
  id: 'market-equilibrium',
  name: 'Market equilibrium',
  unit: 'micro',
  topic: TOPIC,
  description: 'Demand and supply intersect at the market-clearing price and quantity.',
  keywords: ['equilibrium', 'market clearing', 'price mechanism', 'demand and supply'],
  caption: 'Market equilibrium',
  controls: [toggle('pointLabel', 'Label equilibrium point (E)', false), ...shape, ...positionControls],
  build: (p) => {
    const { d, s, handles } = positioned(p);
    const e = G.meet(d, s);
    return {
      panels: [
        panel({
          elements: [
            curve('d', d, 'D', { role: 'demand' }),
            curve('s', s, 'S', { role: 'supply' }),
            eqPoint('e', e, 'Q_e', 'P_e', { label: P.b(p, 'pointLabel') ? 'E' : undefined, labelDir: 'e' }),
          ],
          handles,
        }),
      ],
    };
  },
};

function changeTemplate(kind: 'demand' | 'supply'): Template {
  const isD = kind === 'demand';
  return {
    id: isD ? 'demand-change-equilibrium' : 'supply-change-equilibrium',
    name: isD ? 'Change in demand → new equilibrium' : 'Change in supply → new equilibrium',
    unit: 'micro',
    topic: TOPIC,
    description: isD
      ? 'A shift in demand creates excess demand/supply at the old price, moving the market to a new equilibrium.'
      : 'A shift in supply creates excess demand/supply at the old price, moving the market to a new equilibrium.',
    keywords: isD
      ? ['increase in demand', 'decrease in demand', 'new equilibrium', 'price mechanism', 'signalling', 'rationing']
      : ['increase in supply', 'decrease in supply', 'new equilibrium', 'price mechanism', 'incentive'],
    caption: isD ? 'Effect of a change in demand' : 'Effect of a change in supply',
    controls: [
      select('dir', 'Change', [
        { value: 'inc', label: 'Increase' },
        { value: 'dec', label: 'Decrease' },
      ], 'inc'),
      toggle('excess', isD ? 'Show excess demand/supply at the old price' : 'Show excess demand/supply at the old price', false),
      toggle('pointLabels', 'Label points E₁ and E₂', false),
      slider('shift', 'Shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape' }),
      ...shape,
    ],
    build: (p) => {
      const inc = P.s(p, 'dir') !== 'dec';
      const amt = P.n(p, 'shift', 2) * (inc ? 1 : -1);
      const { D, S } = sd(p);
      const d1 = D(0);
      const s1 = S(0);
      const d2 = isD ? D(amt) : d1;
      const s2 = isD ? s1 : S(amt);
      const e1 = G.meet(d1, s1);
      const e2 = G.meet(d2, s2);
      const pl = P.b(p, 'pointLabels');
      const els = [
        curve(isD ? 'd1' : 'd', d1, isD ? 'D_1' : 'D', { role: 'demand' }),
        ...when(isD, curve('d2', d2, 'D_2', { role: 'demand' })),
        curve(isD ? 's' : 's1', s1, isD ? 'S' : 'S_1', { role: 'supply' }),
        ...when(!isD, curve('s2', s2, 'S_2', { role: 'supply' })),
        shiftArrow('shift', isD ? d1 : s1, isD ? d2 : s2, { t: isD ? 0.25 : 0.7 }),
        eqPoint('e1', e1, 'Q_1', 'P_1', { label: pl ? 'E_1' : undefined, labelDir: 'w' }),
        eqPoint('e2', e2, 'Q_2', 'P_2', { label: pl ? 'E_2' : undefined, labelDir: 'e' }),
      ];
      if (P.b(p, 'excess')) {
        // at the old price P1, the new curve gives a different quantity
        const other = isD ? G.atY(d2, e1[1]) : G.atY(s2, e1[1]);
        const shortage = isD ? inc : !inc;
        els.push(
          point('x', other, { dot: false }),
          measure('gap', [Math.min(e1[0], other[0]), e1[1] - 0.45], [Math.max(e1[0], other[0]), e1[1] - 0.45], shortage ? 'excess demand' : 'excess supply', {
            labelDir: 's',
          }),
        );
      }
      return {
        panels: [
          panel({
            elements: els,
            handles: [
              dragHandle('h-shift', G.pointAt(isD ? d2 : s2, isD ? 0.15 : 0.85), 'x', 'shift', Math.abs(amt), {
                min: 0.5,
                max: 3.5,
                scale: inc ? 1 : -1,
                hint: 'Drag to change the size of the shift',
              }),
            ],
          }),
        ],
      };
    },
  };
}

const bothShift: Template = {
  id: 'demand-supply-both-shift',
  name: 'Simultaneous shifts in demand and supply',
  unit: 'micro',
  topic: TOPIC,
  description: 'Both curves shift at once; the effect on price or quantity depends on the relative size of the shifts.',
  keywords: ['simultaneous', 'both shift', 'indeterminate', 'demand and supply change'],
  caption: 'Simultaneous changes in demand and supply',
  controls: [
    select('d', 'Demand', [
      { value: 'inc', label: 'Increases' },
      { value: 'dec', label: 'Decreases' },
    ], 'inc'),
    select('s', 'Supply', [
      { value: 'inc', label: 'Increases' },
      { value: 'dec', label: 'Decreases' },
    ], 'inc'),
    slider('dShift', 'Demand shift size', 0.5, 3.5, 0.1, 2, { group: 'Shape' }),
    slider('sShift', 'Supply shift size', 0.5, 3.5, 0.1, 1.2, { group: 'Shape' }),
    ...shape,
  ],
  build: (p) => {
    const dAmt = P.n(p, 'dShift', 2) * (P.s(p, 'd') === 'dec' ? -1 : 1);
    const sAmt = P.n(p, 'sShift', 1.2) * (P.s(p, 's') === 'dec' ? -1 : 1);
    const { D, S } = sd(p);
    const d1 = D(0);
    const d2 = D(dAmt);
    const s1 = S(0);
    const s2 = S(sAmt);
    return {
      panels: [
        panel({
          elements: [
            curve('d1', d1, 'D_1', { role: 'demand' }),
            curve('d2', d2, 'D_2', { role: 'demand' }),
            curve('s1', s1, 'S_1', { role: 'supply' }),
            curve('s2', s2, 'S_2', { role: 'supply' }),
            shiftArrow('dshift', d1, d2, { t: 0.2 }),
            shiftArrow('sshift', s1, s2, { t: 0.8 }),
            eqPoint('e1', G.meet(d1, s1), 'Q_1', 'P_1'),
            eqPoint('e2', G.meet(d2, s2), 'Q_2', 'P_2'),
          ],
        }),
      ],
    };
  },
};

const excess: Template = {
  id: 'excess-demand-supply',
  name: 'Excess demand and excess supply',
  unit: 'micro',
  topic: TOPIC,
  description: 'At a price above equilibrium there is a surplus; below it there is a shortage.',
  keywords: ['shortage', 'surplus', 'disequilibrium', 'excess demand', 'excess supply'],
  caption: 'Disequilibrium in a market',
  controls: [
    select('case', 'Price is', [
      { value: 'above', label: 'Above equilibrium (excess supply)' },
      { value: 'below', label: 'Below equilibrium (excess demand)' },
      { value: 'both', label: 'Show both' },
    ], 'above'),
    toggle('eq', 'Show equilibrium', true),
    ...shape,
    ...positionControls,
  ],
  build: (p) => {
    const { d, s, handles } = positioned(p);
    const e = G.meet(d, s);
    const mode = P.s(p, 'case', 'above');
    const els: El[] = [curve('d', d, 'D', { role: 'demand' }), curve('s', s, 'S', { role: 'supply' })];
    if (P.b(p, 'eq')) els.push(eqPoint('e', e, 'Q_e', 'P_e'));
    const add = (id: string, price: number, high: boolean) => {
      const qd = G.atY(d, price);
      const qs = G.atY(s, price);
      const lo = Math.min(qd[0], qs[0]);
      const hi = Math.max(qd[0], qs[0]);
      els.push(
        point(`${id}d`, qd, { xLabel: high ? 'Q_d' : "Q_d'" }),
        point(`${id}s`, qs, { xLabel: high ? 'Q_s' : "Q_s'" }),
        guide(`${id}line`, [0, price], [hi + 0.6, price]),
        measure(`${id}gap`, [lo, price + (high ? 0.5 : -0.5)], [hi, price + (high ? 0.5 : -0.5)], high ? 'excess supply' : 'excess demand', {
          labelDir: high ? 'n' : 's',
        }),
      );
      els.push(tick(`${id}p`, 'y', price, high ? 'P_1' : 'P_2'));
    };
    if (mode === 'above' || mode === 'both') add('hi', e[1] + 2, true);
    if (mode === 'below' || mode === 'both') add('lo', e[1] - 2, false);
    return { panels: [panel({ elements: els, handles })] };
  },
};

const surplus: Template = {
  id: 'consumer-producer-surplus',
  name: 'Consumer and producer surplus',
  unit: 'micro',
  topic: TOPIC,
  description: 'Consumer surplus (above price, below demand) and producer surplus (below price, above supply) at equilibrium.',
  keywords: ['consumer surplus', 'producer surplus', 'social surplus', 'community surplus', 'welfare'],
  caption: 'Consumer and producer surplus',
  controls: [
    toggle('cs', 'Shade consumer surplus', true),
    toggle('ps', 'Shade producer surplus', true),
    ...shape,
    ...positionControls,
  ],
  build: (p) => {
    const { d, s, handles } = positioned(p);
    const e = G.meet(d, s);
    const pe = G.hline(e[1], 0, e[0]);
    return {
      panels: [
        panel({
          elements: [
            ...when(P.b(p, 'cs'), area('cs', G.between(d, pe, 0, e[0]), 'cs', 'CS', 'Consumer surplus')),
            ...when(P.b(p, 'ps'), area('ps', G.between(pe, s, 0, e[0]), 'ps', 'PS', 'Producer surplus')),
            curve('d', d, 'D', { role: 'demand' }),
            curve('s', s, 'S', { role: 'supply' }),
            eqPoint('e', e, 'Q_e', 'P_e'),
          ],
          handles,
        }),
      ],
    };
  },
};

const allocative: Template = {
  id: 'allocative-efficiency',
  name: 'Allocative efficiency (MSB = MSC)',
  unit: 'micro',
  topic: TOPIC,
  description: 'Social surplus is maximised where marginal social benefit equals marginal social cost.',
  keywords: ['allocative efficiency', 'MSB', 'MSC', 'social surplus', 'competitive market'],
  caption: 'Allocative efficiency: MSB = MSC',
  controls: [toggle('surplus', 'Shade social surplus', true), ...shape, ...positionControls],
  build: (p) => {
    const { d, s, handles } = positioned(p);
    const e = G.meet(d, s);
    const pe = G.hline(e[1], 0, e[0]);
    return {
      panels: [
        panel({
          elements: [
            ...when(
              P.b(p, 'surplus'),
              area('cs', G.between(d, pe, 0, e[0]), 'cs', 'CS', 'Consumer surplus'),
              area('ps', G.between(pe, s, 0, e[0]), 'ps', 'PS', 'Producer surplus'),
            ),
            curve('d', d, 'D = MSB', { role: 'demand' }),
            curve('s', s, 'S = MSC', { role: 'supply' }),
            eqPoint('e', e, 'Q*', 'P*'),
          ],
          handles,
        }),
      ],
    };
  },
};

export const microSD: Template[] = [
  demandCurve,
  demandShift,
  supplyCurve,
  supplyShift,
  equilibrium,
  changeTemplate('demand'),
  changeTemplate('supply'),
  bothShift,
  excess,
  surplus,
  allocative,
];
