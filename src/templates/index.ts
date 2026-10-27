import type { Params, Template, UnitId } from '~/engine/types';
import { introTemplates } from './intro';
import { microSD } from './micro-sd';
import { microElasticityTemplates } from './micro-elasticity';
import { microInterventionTemplates } from './micro-intervention';
import { microFailureTemplates } from './micro-failure';
import { microFirmTemplates } from './micro-firm';
import { macroTemplates } from './macro';
import { globalTemplates } from './global';
import { customTemplates } from './custom';

export const UNITS: { id: UnitId; name: string; short: string }[] = [
  { id: 'intro', name: 'Unit 1 · Introduction to economics', short: 'Intro' },
  { id: 'micro', name: 'Unit 2 · Microeconomics', short: 'Micro' },
  { id: 'macro', name: 'Unit 3 · Macroeconomics', short: 'Macro' },
  { id: 'global', name: 'Unit 4 · The global economy', short: 'Global' },
  { id: 'custom', name: 'Build your own', short: 'Custom' },
];

export const TEMPLATES: Template[] = [
  ...introTemplates,
  ...microSD,
  ...microElasticityTemplates,
  ...microInterventionTemplates,
  ...microFailureTemplates,
  ...microFirmTemplates,
  ...macroTemplates,
  ...globalTemplates,
  ...customTemplates,
];

const byId = new Map<string, Template>();
for (const t of TEMPLATES) {
  if (byId.has(t.id)) throw new Error(`Duplicate template id: ${t.id}`);
  byId.set(t.id, t);
}

export const getTemplate = (id: string): Template | undefined => byId.get(id);

export function defaultParams(t: Template): Params {
  const p: Params = {};
  for (const c of t.controls) p[c.key] = c.default;
  return p;
}

/** Templates grouped by unit, then topic (preserving declaration order). */
export function groupedTemplates() {
  return UNITS.map((u) => {
    const topics = new Map<string, Template[]>();
    for (const t of TEMPLATES) {
      if (t.unit !== u.id) continue;
      if (!topics.has(t.topic)) topics.set(t.topic, []);
      topics.get(t.topic)!.push(t);
    }
    return { unit: u, topics: [...topics.entries()].map(([topic, items]) => ({ topic, items })) };
  }).filter((g) => g.topics.length > 0);
}
