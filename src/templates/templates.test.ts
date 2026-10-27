import { describe, expect, it } from 'vitest';
import type { El, Params, Template } from '~/engine/types';
import { TEMPLATES, defaultParams } from '.';

/** Default params plus every select option and all-toggles on/off. */
function variants(t: Template): Params[] {
  const base = defaultParams(t);
  const out: Params[] = [base];
  for (const c of t.controls) {
    if (c.type === 'select') for (const o of c.options) out.push({ ...base, [c.key]: o.value });
    if (c.type === 'slider') {
      out.push({ ...base, [c.key]: c.min });
      out.push({ ...base, [c.key]: c.max });
    }
  }
  const toggles = t.controls.filter((c) => c.type === 'toggle');
  out.push({ ...base, ...Object.fromEntries(toggles.map((c) => [c.key, true])) });
  out.push({ ...base, ...Object.fromEntries(toggles.map((c) => [c.key, false])) });
  return out;
}

const finite = (n: number) => Number.isFinite(n);

function checkEl(el: El): string | null {
  switch (el.kind) {
    case 'curve':
      if (el.points.length < 2) return `${el.id}: curve has <2 points`;
      if (!el.points.every((p) => finite(p[0]) && finite(p[1]))) return `${el.id}: non-finite curve point`;
      return null;
    case 'area':
      if (!el.polygon.every((p) => finite(p[0]) && finite(p[1]))) return `${el.id}: non-finite area vertex`;
      return null;
    case 'point':
      return finite(el.at[0]) && finite(el.at[1]) ? null : `${el.id}: non-finite point`;
    case 'line':
      return [el.from, el.to].every((p) => finite(p[0]) && finite(p[1])) ? null : `${el.id}: non-finite line`;
    case 'text':
      return finite(el.at[0]) && finite(el.at[1]) ? null : `${el.id}: non-finite text`;
    case 'tick':
      return finite(el.value) ? null : `${el.id}: non-finite tick`;
  }
}

describe('templates', () => {
  it('have unique ids and required metadata', () => {
    const ids = new Set<string>();
    for (const t of TEMPLATES) {
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(10);
      const keys = t.controls.map((c) => c.key);
      expect(new Set(keys).size, `${t.id} duplicate control keys`).toBe(keys.length);
    }
  });

  for (const t of TEMPLATES) {
    it(`${t.id} builds cleanly for all variants`, () => {
      for (const params of variants(t)) {
        const scene = t.build(params);
        expect(scene.panels.length).toBeGreaterThan(0);
        const panelIds = scene.panels.map((p) => p.id);
        expect(new Set(panelIds).size).toBe(panelIds.length);
        for (const panel of scene.panels) {
          const elIds = panel.elements.map((e) => e.id);
          const dupes = elIds.filter((id, i) => elIds.indexOf(id) !== i);
          expect(dupes, `${t.id} duplicate element ids ${JSON.stringify(params)}`).toEqual([]);
          const problems = panel.elements.map(checkEl).filter(Boolean);
          expect(problems, `${t.id} ${JSON.stringify(params)}`).toEqual([]);
          for (const h of panel.handles ?? []) {
            const out = h.apply(h.at);
            for (const v of Object.values(out)) if (typeof v === 'number') expect(finite(v)).toBe(true);
          }
        }
      }
    });
  }
});
