import type { Template } from '~/engine/types';
import { G, P, num, panel, select, toggle } from './kit';

const AXES: Record<string, { label: string; x: string; y: string }> = {
  pq: { label: 'Price / Quantity', x: 'Quantity', y: 'Price' },
  macro: { label: 'Price level / Real GDP', x: 'Real GDP', y: 'Average price level' },
  firm: { label: 'Costs, revenue / Output', x: 'Output', y: 'Costs, revenue' },
  labour: { label: 'Wage / Quantity of labour', x: 'Quantity of labour', y: 'Wage rate' },
  money: { label: 'Interest rate / Quantity of money', x: 'Quantity of money', y: 'Interest rate' },
  fx: { label: 'Exchange rate / Quantity of currency', x: 'Quantity of currency', y: 'Exchange rate' },
  phillips: { label: 'Inflation / Unemployment', x: 'Unemployment rate (%)', y: 'Inflation rate (%)' },
  ppc: { label: 'Good Y / Good X (PPC)', x: 'Good X', y: 'Good Y' },
  time: { label: 'Real GDP / Time', x: 'Time', y: 'Real GDP' },
};

const blank: Template = {
  id: 'blank-axes',
  name: 'Blank axes — draw your own',
  unit: 'custom',
  topic: 'Build your own',
  description:
    'Empty axes for any diagram not in the library. Use “Draw your own” to add lines, curves, points with guides, shading, arrows and text.',
  keywords: ['custom', 'blank', 'empty', 'freeform', 'draw', 'own diagram', 'axes'],
  caption: 'Figure 1',
  controls: [
    select(
      'axes',
      'Axis titles',
      Object.entries(AXES).map(([value, a]) => ({ value, label: a.label })),
      'pq',
      { help: 'Rename them freely in the Labels tab.' },
    ),
    toggle('numeric', 'Numbered scale', false),
    num('xMax', 'Horizontal axis maximum', 10, { min: 1, step: 1, show: (p) => P.b(p, 'numeric') }),
    num('yMax', 'Vertical axis maximum', 10, { min: 1, step: 1, show: (p) => P.b(p, 'numeric') }),
  ],
  build: (p) => {
    const a = AXES[P.s(p, 'axes', 'pq')] ?? AXES.pq;
    const numeric = P.b(p, 'numeric');
    const xMax = numeric ? Math.max(1, P.n(p, 'xMax', 10)) : 10;
    const yMax = numeric ? Math.max(1, P.n(p, 'yMax', 10)) : 10;
    const ticks = (max: number) =>
      G.niceTicks(0, max, 5)
        .filter((v) => v > 0)
        .map((value) => ({ value, label: String(value) }));
    return {
      panels: [
        panel({
          xLabel: a.x,
          yLabel: a.y,
          xMax,
          yMax,
          xTicks: numeric ? ticks(xMax) : undefined,
          yTicks: numeric ? ticks(yMax) : undefined,
          elements: [],
        }),
      ],
    };
  },
};

export const customTemplates: Template[] = [blank];
