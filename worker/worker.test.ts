import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import worker, { type Env } from './index';
import { guideExamples } from '~/agent/guide';
import { prepareSpec } from '~/agent/spec';
import { TEMPLATES } from '~/templates';

const ORIGIN = 'https://graphs.test';

const env: Env = {
  ASSETS: {
    async fetch(input) {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/fonts/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(`asset:${new URL(url).pathname}`, { status: 200 });
    },
  },
};

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('worker API', () => {
  it('serves an index with links to the docs', async () => {
    const r = await call('/api/v1');
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const body = await r.json();
    expect(body.docs.guide).toBe(`${ORIGIN}/llms-full.txt`);
    expect(body.templates).toBe(TEMPLATES.length);
  });

  it('lists and filters templates', async () => {
    const all = await (await call('/api/v1/templates')).json();
    expect(all.count).toBe(TEMPLATES.length);
    const tax = await (await call('/api/v1/templates?q=tax')).json();
    expect(tax.templates.map((t: { id: string }) => t.id)).toContain('indirect-tax-specific');
    const hl = await (await call('/api/v1/templates?hl=true')).json();
    expect(hl.templates.every((t: { hl: boolean }) => t.hl)).toBe(true);
    const macro = await (await call('/api/v1/templates?unit=macro')).json();
    expect(macro.templates.every((t: { unit: string }) => t.unit === 'macro')).toBe(true);
  });

  it('returns a schema, or suggestions for a typo', async () => {
    const ok = await (await call('/api/v1/templates/tariff')).json();
    expect(ok.params.find((p: { key: string }) => p.key === 'lettering').options.length).toBe(2);
    expect(ok.labels.some((l: { key: string }) => l.key === 'main.d')).toBe(true);
    const bad = await call('/api/v1/templates/tarif');
    expect(bad.status).toBe(404);
    expect((await bad.json()).error.suggestions).toContain('tariff');
  });

  it('renders JSON with an SVG, an edit link and a GET url', async () => {
    const r = await post('/api/v1/render', { template: 'tariff', params: { lettering: 'letters' } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.svg).toContain('<svg');
    expect(body.editUrl).toMatch(new RegExp(`^${ORIGIN}/graph/tariff/#g=`));
    expect(body.warnings).toEqual([]);
    // the GET url re-renders the same graph
    const again = await call(body.svgUrl.replace(ORIGIN, ''));
    expect(again.headers.get('content-type')).toContain('image/svg+xml');
    expect(await again.text()).toBe(body.svg);
  });

  it('renders raw SVG with safe headers', async () => {
    for (const r of [await post('/api/v1/render.svg', { template: 'subsidy' }), await post('/api/v1/render?format=svg', { template: 'subsidy' })]) {
      expect(r.headers.get('content-type')).toContain('image/svg+xml');
      expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect((await r.text()).startsWith('<?xml')).toBe(true);
    }
  });

  it('renders from query params', async () => {
    const r = await call('/api/v1/render/demand-shift.svg?dir=dec&style.palette=mono&label.d1=D_{before}&title=Fig%201');
    expect(r.status).toBe(200);
    const svg = await r.text();
    expect(svg).toContain('before');
    expect(svg).toContain('Fig 1');
    const j = await (await call('/api/v1/render/demand-shift.json?dir=dec')).json();
    expect(j.template.id).toBe('demand-shift');
  });

  it('embeds fonts when asked', async () => {
    const r = await post('/api/v1/render.svg', { template: 'subsidy', embedFonts: true });
    expect(await r.text()).toContain('@font-face');
  });

  it('reports errors as JSON with useful messages', async () => {
    const unknown = await post('/api/v1/render', { template: 'nope' });
    expect(unknown.status).toBe(404);
    const badEnum = await post('/api/v1/render', { template: 'demand-shift', params: { dir: 'up' } });
    expect(badEnum.status).toBe(400);
    expect((await badEnum.json()).error.message).toContain('inc, dec');
    const badJson = await call('/api/v1/render', { method: 'POST', body: '{nope' });
    expect((await badJson.json()).error.code).toBe('invalid_json');
    const tooBig = await call('/api/v1/render', { method: 'POST', body: 'x'.repeat(200_000) });
    expect(tooBig.status).toBe(413);
    expect((await call('/api/v1/render')).status).toBe(400);
    expect((await call('/api/v1/nothing')).status).toBe(404);
    expect((await call('/api/v1/templates', { method: 'POST' })).status).toBe(405);
  });

  it('answers CORS preflight', async () => {
    const r = await call('/api/v1/render', { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('serves the agent docs with absolute URLs for this origin', async () => {
    const llms = await call('/llms.txt');
    expect(llms.headers.get('content-type')).toContain('text/markdown');
    const short = await llms.text();
    expect(short.startsWith('# Econ Graph Studio')).toBe(true);
    expect(short).toContain(`${ORIGIN}/llms-full.txt`);
    const full = await (await call('/llms-full.txt')).text();
    for (const t of TEMPLATES) expect(full).toContain(`\`${t.id}\``);
    const api = await (await call('/openapi.json')).json();
    expect(api.openapi).toBe('3.1.0');
    expect(api.servers[0].url).toBe(ORIGIN);
    const skill = await (await call('/skill/SKILL.md')).text();
    expect(skill.startsWith('---\nname: ib-econ-graphs\ndescription: ')).toBe(true);
    const zip = unzipSync(new Uint8Array(await (await call('/skill/ib-econ-graphs.zip')).arrayBuffer()));
    expect(strFromU8(zip['ib-econ-graphs/SKILL.md'])).toBe(skill);
  });

  it('passes everything else through to the static assets', async () => {
    expect(await (await call('/graph/tariff/')).text()).toBe('asset:/graph/tariff/');
  });

  it('documents examples that render without warnings', () => {
    for (const spec of Object.values(guideExamples())) expect(prepareSpec(spec).warnings).toEqual([]);
  });
});
