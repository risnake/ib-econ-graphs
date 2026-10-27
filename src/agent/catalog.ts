/** Machine-readable descriptions of the templates, for the API and agent docs. */
import type { Control, Template } from '~/engine/types';
import { TEMPLATES, UNITS, defaultParams } from '~/templates';
import { collectLabels } from '~/lib/scene';
import { axisKey, elKey } from '~/engine/GraphSVG';

export interface ParamSchema {
  key: string;
  label: string;
  type: 'boolean' | 'enum' | 'number' | 'string';
  default: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  help?: string;
}

const unitName = (id: string) => UNITS.find((u) => u.id === id)?.name ?? id;

export function paramSchema(c: Control): ParamSchema {
  const base = { key: c.key, label: c.label, default: c.default, group: c.group, help: c.help };
  switch (c.type) {
    case 'toggle':
      return { ...base, type: 'boolean' };
    case 'select':
      return { ...base, type: 'enum', options: c.options };
    case 'slider':
      return { ...base, type: 'number', min: c.min, max: c.max, step: c.step };
    case 'number':
      return { ...base, type: 'number', min: c.min, max: c.max, step: c.step };
    case 'text':
      return { ...base, type: 'string' };
  }
}

export function templateSummary(t: Template, origin: string) {
  return {
    id: t.id,
    name: t.name,
    unit: t.unit,
    unitName: unitName(t.unit),
    topic: t.topic,
    hl: !!t.hl,
    description: t.description,
    keywords: t.keywords ?? [],
    schemaUrl: `${origin}/api/v1/templates/${t.id}`,
    previewUrl: `${origin}/thumbs/${t.id}.svg`,
    editorUrl: `${origin}/graph/${t.id}/`,
  };
}

/** Full schema: params, panels, label keys and element keys (for the default params). */
export function templateSchema(t: Template, origin: string) {
  const params = defaultParams(t);
  const scene = t.build(params);
  const elements: { key: string; kind: string; label?: string }[] = [];
  for (const p of scene.panels) {
    for (const el of p.elements) {
      const label = el.kind === 'text' ? el.text : el.kind === 'tick' ? el.label : el.label;
      elements.push({ key: elKey(p.id, el.id), kind: el.kind, ...(label ? { label } : {}) });
    }
  }
  return {
    ...templateSummary(t, origin),
    params: t.controls.map(paramSchema),
    defaults: params,
    panels: scene.panels.map((p) => ({
      id: p.id,
      title: p.title ?? null,
      xLabel: p.xLabel,
      yLabel: p.yLabel,
      xRange: [p.xMin ?? 0, p.xMax],
      yRange: [p.yMin ?? 0, p.yMax],
      axisKeys: { x: axisKey(p.id, 'x'), y: axisKey(p.id, 'y') },
    })),
    labels: collectLabels(scene).map((l) => ({ key: l.key, default: l.text, hint: l.hint, panel: l.panelId })),
    elements,
    stats: scene.stats ?? null,
    example: { template: t.id, params },
  };
}

export const allTemplates = () => TEMPLATES;
