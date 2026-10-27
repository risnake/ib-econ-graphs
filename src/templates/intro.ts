import type { El, Template, Vec } from '~/engine/types';
import {
  G,
  P,
  arrow,
  curve,
  dragHandle,
  measure,
  panel,
  point,
  select,
  shiftArrow,
  slider,
  text,
  textInput,
  toggle,
  when,
} from './kit';

const TOPIC = 'Production possibilities';

const goods = [
  textInput('xGood', 'Good on x-axis', 'Consumer goods', { group: 'Labels' }),
  textInput('yGood', 'Good on y-axis', 'Capital goods', { group: 'Labels' }),
];

const shapeSelect = select(
  'shape',
  'Shape',
  [
    { value: 'concave', label: 'Concave (increasing opportunity cost)' },
    { value: 'straight', label: 'Straight line (constant opportunity cost)' },
  ],
  'concave',
);

/** PPC with intercepts a (x-axis) and b (y-axis). Concave = quarter ellipse. */
function ppc(a: number, b: number, straight: boolean): Vec[] {
  if (straight) return [[0, b], [a, 0]];
  return G.param((t) => a * Math.sin(t), (t) => b * Math.cos(t), 0, Math.PI / 2, 120);
}

/** Point on the PPC a fraction t of the way from the y-intercept to the x-intercept. */
function ppcAt(a: number, b: number, straight: boolean, t: number, scale = 1): Vec {
  if (straight) return [a * t * scale, b * (1 - t) * scale];
  const th = (t * Math.PI) / 2;
  return [a * Math.sin(th) * scale, b * Math.cos(th) * scale];
}

/**
 * Label placement for a pair of PPCs: away from the intercept they share when
 * the shift is biased, outside the outer curve and inside the inner one.
 */
function ppcLabel(a: number, b: number, straight: boolean, bias: string, outer: boolean) {
  if (bias === 'x') return { labelAt: ppcAt(a, b, straight, 0.9), labelDir: outer ? ('e' as const) : ('w' as const) };
  if (bias === 'y') return { labelAt: ppcAt(a, b, straight, 0.1), labelDir: outer ? ('n' as const) : ('s' as const) };
  const t = outer ? 0.1 : straight ? 0.3 : 0.15;
  return { labelAt: ppcAt(a, b, straight, t), labelDir: outer ? ('ne' as const) : ('sw' as const) };
}

const axes = (p: Parameters<Template['build']>[0]) => ({
  xLabel: P.s(p, 'xGood', 'Consumer goods'),
  yLabel: P.s(p, 'yGood', 'Capital goods'),
});

const ppcBasic: Template = {
  id: 'ppc-basic',
  name: 'Production possibilities curve (PPC)',
  unit: 'intro',
  topic: TOPIC,
  description:
    'The maximum combinations of two goods an economy can produce with all resources fully and efficiently employed, with attainable, inefficient and unattainable points.',
  keywords: ['PPC', 'PPF', 'production possibilities frontier', 'scarcity', 'choice', 'efficiency', 'unemployment', 'unattainable'],
  caption: 'Production possibilities curve',
  controls: [
    shapeSelect,
    toggle('onCurve', 'Points on the curve (A, B)', true),
    toggle('inside', 'Point inside the curve (C)', true),
    toggle('outside', 'Point outside the curve (D)', true),
    toggle('notes', 'Annotate points', true),
    ...goods,
  ],
  build: (p) => {
    const straight = P.s(p, 'shape') === 'straight';
    const a = 8.4;
    const b = 8.4;
    const c = ppc(a, b, straight);
    const notes = P.b(p, 'notes');
    const A = ppcAt(a, b, straight, 0.28);
    const B = ppcAt(a, b, straight, 0.68);
    const C = ppcAt(a, b, straight, 0.5, 0.58);
    const D = ppcAt(a, b, straight, 0.5, straight ? 1.4 : 1.2);
    const els: El[] = [
      curve('ppc', c, 'PPC', { role: 'neutral', labelAt: ppcAt(a, b, straight, 0.88), labelDir: 'ne' }),
      ...when(
        P.b(p, 'onCurve'),
        point('a', A, { label: 'A', labelDir: 'ne' }),
        point('b', B, { label: 'B', labelDir: 'ne' }),
      ),
      ...when(P.b(p, 'inside'), point('c', C, { label: 'C', labelDir: 'sw' })),
      ...when(P.b(p, 'outside'), point('d', D, { label: 'D', labelDir: 'ne' })),
      ...when(
        notes && P.b(p, 'inside'),
        text('c-note', [C[0] - 0.3, C[1] - 1.1], 'Inefficient:\nunemployed resources', { anchor: 'end', muted: true, size: 0.78 }),
      ),
      ...when(
        notes && P.b(p, 'outside'),
        text('d-note', [D[0] + 0.35, D[1] + 0.95], 'Unattainable', { anchor: 'start', muted: true, size: 0.78 }),
      ),
      ...when(
        notes && P.b(p, 'onCurve'),
        text('ab-note', [A[0] + 0.45, A[1] + 0.95], 'Efficient (on the PPC)', { anchor: 'start', muted: true, size: 0.78 }),
      ),
    ];
    return { panels: [panel({ ...axes(p), elements: els })] };
  },
};

const ppcShift: Template = {
  id: 'ppc-shift',
  name: 'Shift of the PPC (economic growth or decline)',
  unit: 'intro',
  topic: TOPIC,
  description:
    'An outward shift shows an increase in production possibilities (more or better resources, technology); an inward shift shows a loss of productive capacity.',
  keywords: ['economic growth', 'PPC shift', 'outward shift', 'inward shift', 'potential output', 'technology', 'natural disaster'],
  caption: 'A shift of the production possibilities curve',
  controls: [
    select('dir', 'Direction', [
      { value: 'out', label: 'Outward (growth)' },
      { value: 'in', label: 'Inward (decline)' },
    ], 'out'),
    select('bias', 'Affects', [
      { value: 'both', label: 'Both goods' },
      { value: 'x', label: 'Only the x-axis good' },
      { value: 'y', label: 'Only the y-axis good' },
    ], 'both'),
    shapeSelect,
    slider('size', 'Size of shift', 0.8, 3, 0.1, 2, { group: 'Shape' }),
    ...goods,
  ],
  build: (p) => {
    const straight = P.s(p, 'shape') === 'straight';
    const out = P.s(p, 'dir') !== 'in';
    const bias = P.s(p, 'bias', 'both');
    const size = P.n(p, 'size', 2);
    const small = 9 - size - 0.4;
    const big = small + size;
    const [a1, b1] = out ? [small, small] : [big, big];
    const a2 = bias === 'y' ? a1 : out ? big : small;
    const b2 = bias === 'x' ? b1 : out ? big : small;
    const c1 = ppc(a1, b1, straight);
    const c2 = ppc(a2, b2, straight);
    const t = bias === 'x' ? 0.82 : bias === 'y' ? 0.18 : 0.5;
    const grow = out ? 1 : -1;
    return {
      panels: [
        panel({
          ...axes(p),
          elements: [
            curve('ppc1', c1, 'PPC_1', { role: 'neutral', ...ppcLabel(a1, b1, straight, bias, !out) }),
            curve('ppc2', c2, 'PPC_2', { role: 'neutral', ...ppcLabel(a2, b2, straight, bias, out) }),
            shiftArrow('shift', c1, c2, { mode: 'perp', t, gap: 0.22 }),
          ],
          handles: [
            dragHandle('h-size', ppcAt(a2, b2, straight, 0.5), 'x', 'size', size, {
              min: 0.8,
              max: 3,
              scale: grow * 1.4,
              hint: 'Drag to change the size of the shift',
            }),
          ],
        }),
      ],
    };
  },
};

const ppcOpportunityCost: Template = {
  id: 'ppc-opportunity-cost',
  name: 'PPC and opportunity cost',
  unit: 'intro',
  topic: TOPIC,
  description:
    'Moving along the PPC, each extra unit of one good costs increasing amounts of the other (concave PPC) because resources are not equally suited to both uses.',
  keywords: ['opportunity cost', 'increasing opportunity cost', 'constant opportunity cost', 'trade-off', 'PPC'],
  caption: 'Opportunity cost along the PPC',
  controls: [
    shapeSelect,
    toggle('guides', 'Guides to the axes', true),
    toggle('steps', 'Show ΔX and ΔY steps', true),
    toggle('note', 'Annotate', true),
    ...goods,
  ],
  build: (p) => {
    const straight = P.s(p, 'shape') === 'straight';
    const a = 8.6;
    const b = 8.6;
    const c = ppc(a, b, straight);
    const xs = [3, 5.2, 7.4];
    const pts = xs.map((x) => G.at(c, x));
    const names = ['A', 'B', 'C'];
    const guides = P.b(p, 'guides');
    const els: El[] = [
      curve('ppc', c, 'PPC', { role: 'neutral', labelAt: ppcAt(a, b, straight, 0.94), labelDir: 'ne' }),
    ];
    pts.forEach((pt, i) =>
      els.push(
        point(names[i].toLowerCase(), pt, {
          label: names[i],
          labelDir: 'sw',
          xLabel: guides ? `X_${i + 1}` : undefined,
          yLabel: guides ? `Y_${i + 1}` : undefined,
        }),
      ),
    );
    if (P.b(p, 'steps')) {
      for (let i = 0; i < 2; i++) {
        const from = pts[i];
        const to = pts[i + 1];
        const corner: Vec = [to[0], from[1]];
        els.push(
          measure(`dx${i + 1}`, from, corner, 'ΔX', { labelDir: 'n' }),
          measure(`dy${i + 1}`, corner, to, `ΔY_${i + 1}`, { labelDir: 'e' }),
        );
      }
    }
    if (P.b(p, 'note')) {
      els.push(
        text(
          'note',
          [9.9, 9.3],
          straight ? 'Equal ΔX costs equal ΔY:\nconstant opportunity cost' : 'Equal ΔX costs ever larger ΔY:\nincreasing opportunity cost',
          { anchor: 'end', muted: true, size: 0.78 },
        ),
      );
    }
    return { panels: [panel({ ...axes(p), elements: els })] };
  },
};

const actualPotential: Template = {
  id: 'ppc-actual-potential-growth',
  name: 'Actual vs potential economic growth (PPC)',
  unit: 'intro',
  topic: TOPIC,
  description:
    'Actual growth is a movement from inside the PPC towards it (using unemployed resources); potential growth is an outward shift of the PPC.',
  keywords: ['actual growth', 'potential growth', 'unemployment', 'PPC', 'economic growth', 'output gap'],
  caption: 'Actual and potential economic growth',
  controls: [
    select('mode', 'Show', [
      { value: 'actual', label: 'Actual growth (move towards the PPC)' },
      { value: 'potential', label: 'Potential growth (PPC shifts out)' },
      { value: 'both', label: 'Both' },
    ], 'both'),
    toggle('notes', 'Annotate', true),
    shapeSelect,
    ...goods,
  ],
  build: (p) => {
    const straight = P.s(p, 'shape') === 'straight';
    const mode = P.s(p, 'mode', 'both');
    const notes = P.b(p, 'notes');
    const r1 = 6.6;
    const r2 = 8.8;
    const c1 = ppc(mode === 'actual' ? r2 : r1, mode === 'actual' ? r2 : r1, straight);
    const c2 = ppc(r2, r2, straight);
    const t = 0.45;
    const els: El[] = [];
    if (mode === 'actual') {
      const A = ppcAt(r2, r2, straight, t, 0.62);
      const B = ppcAt(r2, r2, straight, t);
      els.push(
        curve('ppc', c2, 'PPC', { role: 'neutral', labelAt: ppcAt(r2, r2, straight, 0.9), labelDir: 'ne' }),
        point('a', A, { label: 'A', labelDir: 'sw' }),
        point('b', B, { label: 'B', labelDir: 'ne' }),
        arrow('move', G.lerp(A, B, 0.12), G.lerp(A, B, 0.88)),
        ...when(notes, text('n1', [A[0] + 0.2, A[1] - 1.3], 'Actual growth: unemployed\nresources brought into use', { anchor: 'start', muted: true, size: 0.78 })),
      );
    } else {
      els.push(
        curve('ppc1', c1, 'PPC_1', { role: 'neutral', ...ppcLabel(r1, r1, straight, 'both', false) }),
        curve('ppc2', c2, 'PPC_2', { role: 'neutral', ...ppcLabel(r2, r2, straight, 'both', true) }),
      );
      if (mode === 'potential') {
        els.push(
          shiftArrow('shift', c1, c2, { mode: 'perp', t: 0.5, gap: 0.22 }),
          ...when(notes, text('n2', [0.6, 1.2], 'Potential growth: increase in the\nquantity or quality of resources', { anchor: 'start', muted: true, size: 0.78 })),
        );
      } else {
        const A = ppcAt(r1, r1, straight, t, 0.72);
        const B = ppcAt(r2, r2, straight, t);
        els.push(
          shiftArrow('shift', c1, c2, { mode: 'perp', t: 0.18, gap: 0.22 }),
          point('a', A, { label: 'A', labelDir: 'sw' }),
          point('b', B, { label: 'B', labelDir: 'ne' }),
          arrow('move', G.lerp(A, B, 0.1), G.lerp(A, B, 0.9)),
          ...when(
            notes,
            text('n3', [0.6, 1.2], 'A → B: actual growth (A to PPC_1)\nplus potential growth (PPC_1 to PPC_2)', { anchor: 'start', muted: true, size: 0.78 }),
          ),
        );
      }
    }
    return { panels: [panel({ ...axes(p), elements: els })] };
  },
};

export const introTemplates: Template[] = [ppcBasic, ppcShift, ppcOpportunityCost, actualPotential];
