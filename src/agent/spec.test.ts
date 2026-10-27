import { describe, expect, it } from 'vitest';
import { decompressFromEncodedURIComponent } from 'lz-string';
import { TEMPLATES } from '~/templates';
import {
  SpecError,
  decodeSpecParam,
  editUrl,
  prepareSpec,
  renderPrepared,
  specFromQuery,
  specUrl,
  suggestTemplates,
} from './spec';
import { templateSchema } from './catalog';

const render = (spec: unknown) => {
  const p = prepareSpec(spec);
  return { p, r: renderPrepared(p) };
};

const errorOf = (fn: () => unknown): SpecError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof SpecError) return e;
    throw e;
  }
  throw new Error('expected a SpecError');
};

describe('graph spec', () => {
  it('renders every template with its defaults', () => {
    for (const t of TEMPLATES) {
      const { r, p } = render({ template: t.id });
      expect(p.warnings, t.id).toEqual([]);
      expect(r.svg.startsWith('<?xml'), t.id).toBe(true);
      expect(r.svg).toContain('<svg');
      expect(r.width).toBeGreaterThan(100);
    }
  });

  it('stays well inside the Workers CPU budget', () => {
    // warm up, then time every template once
    render({ template: 'tariff' });
    let worst = 0;
    let worstId = '';
    for (const t of TEMPLATES) {
      const t0 = performance.now();
      render({ template: t.id });
      const ms = performance.now() - t0;
      if (ms > worst) {
        worst = ms;
        worstId = t.id;
      }
    }
    console.log(`slowest render: ${worstId} ${worst.toFixed(2)}ms`);
    expect(worst).toBeLessThan(25);
  });

  it('suggests templates for unknown ids', () => {
    const e = errorOf(() => prepareSpec({ template: 'tarrif quota' }));
    expect(e.status).toBe(404);
    expect(e.details.suggestions).toContain('import-quota');
    expect(suggestTemplates('monopoly')[0]).toMatch(/monopoly/);
  });

  it('rejects invalid enum params with the allowed options', () => {
    const e = errorOf(() => prepareSpec({ template: 'demand-shift', params: { dir: 'sideways' } }));
    expect(e.status).toBe(400);
    expect(e.message).toContain('inc');
  });

  it('clamps out-of-range numbers and coerces strings', () => {
    const p = prepareSpec({ template: 'demand-shift', params: { shift: 99, guides: 'false' } });
    expect(p.doc.params.shift).toBe(3.5);
    expect(p.doc.params.guides).toBe(false);
    expect(p.warnings.join(' ')).toContain('outside');
  });

  it('warns about unknown params, fields and keys instead of failing', () => {
    const p = prepareSpec({ template: 'market-equilibrium', params: { nope: 1 }, labels: { zzz: 'x' }, extra: 1 });
    expect(p.warnings.length).toBe(3);
  });

  it('applies label overrides, including single-panel shorthand keys', () => {
    const { r } = render({ template: 'market-equilibrium', labels: { d: 'D_{world}', 'main:x': 'Quantity of coffee' } });
    expect(r.svg).toContain('world');
    expect(r.svg).toContain('Quantity of coffee');
    expect(r.labels.find((l) => l.key === 'main.d')?.text).toBe('D_{world}');
  });

  it('hides and recolours elements', () => {
    const { r } = render({ template: 'market-equilibrium', hidden: ['e:x'], colors: { s: '#123456' } });
    expect(r.svg).toContain('#123456');
    expect(r.svg).not.toContain('>Q<');
  });

  it('draws annotations, so blank axes can become any diagram', () => {
    const { r, p } = render({
      template: 'blank-axes',
      title: 'Figure 1: Custom diagram',
      annotations: [
        { kind: 'line', points: [[1, 9], [9, 1]], label: 'D', role: 'demand' },
        { kind: 'line', points: [[1, 1], [9, 9]], label: 'S', role: 'supply', dashed: true },
        { kind: 'point', at: [5, 5], label: 'E', xLabel: 'Q_e', yLabel: 'P_e' },
        { kind: 'area', points: [[0, 9], [0, 5], [5, 5]], role: 'cs', label: 'CS' },
        { kind: 'arrow', from: [6, 8], to: [7.5, 8], label: 'shift' },
        { kind: 'text', at: [8, 9], text: 'note', color: '#e34948' },
      ],
    });
    expect(p.warnings).toEqual([]);
    expect(p.style.showTitle).toBe(true);
    for (const s of ['Figure 1: Custom diagram', 'CS', 'shift', 'note', '#e34948']) expect(r.svg).toContain(s);
  });

  it('rejects malformed annotations clearly', () => {
    expect(errorOf(() => prepareSpec({ template: 'blank-axes', annotations: [{ kind: 'line', points: [[1, 2]] }] })).message).toContain(
      'at least 2',
    );
    expect(errorOf(() => prepareSpec({ template: 'blank-axes', annotations: [{ kind: 'blob' }] })).code).toBe('invalid_annotation');
  });

  it('validates style values', () => {
    const p = prepareSpec({ template: 'tariff', style: { palette: 'mono', fontScale: 9, font: 'comic' } });
    expect(p.style.palette).toBe('mono');
    expect(p.style.fontScale).toBe(2);
    expect(p.style.font).toBe('sans');
    expect(p.warnings.join(' ')).toContain('style.font');
  });

  it('builds edit links in the editor share format', () => {
    const p = prepareSpec({ template: 'tariff', params: { lettering: 'letters' } });
    const url = editUrl('https://x.test', p);
    expect(url.startsWith('https://x.test/graph/tariff/#g=')).toBe(true);
    const decoded = JSON.parse(decompressFromEncodedURIComponent(url.split('#g=')[1])!);
    expect(decoded.doc.params.lettering).toBe('letters');
    expect(decoded.style.palette).toBe('color');
  });

  it('decodes spec query values in every supported encoding', () => {
    const spec = { template: 'subsidy', params: { cost: true } };
    const json = JSON.stringify(spec);
    expect(decodeSpecParam(json)).toEqual(spec);
    expect(decodeSpecParam(specUrl('', spec).split('spec=')[1])).toEqual(spec);
    const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeSpecParam(b64)).toEqual(spec);
  });

  it('reads the query-string form', () => {
    const q = new URLSearchParams('dir=dec&shift=2.5&style.palette=mono&label.d1=D_a&title=Fig%201&hide=q1:x,q2:x');
    expect(specFromQuery('demand-shift', q)).toEqual({
      template: 'demand-shift',
      title: 'Fig 1',
      hidden: ['q1:x', 'q2:x'],
      params: { dir: 'dec', shift: '2.5' },
      style: { palette: 'mono' },
      labels: { d1: 'D_a' },
    });
  });

  it('exposes a schema for every template', () => {
    for (const t of TEMPLATES) {
      const s = templateSchema(t, 'https://x.test');
      expect(s.params.length).toBe(t.controls.length);
      expect(s.panels.length).toBeGreaterThan(0);
    }
  });
});
