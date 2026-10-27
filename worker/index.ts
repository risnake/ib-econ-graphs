/**
 * Cloudflare Worker: the public graph API and agent docs. Everything else is
 * served straight from the static assets (see `run_worker_first` in
 * wrangler.jsonc), so this code only runs for the routes below.
 */
import { strToU8, zipSync } from 'fflate';
import { TEMPLATES, getTemplate } from '~/templates';
import {
  LIMITS,
  SpecError,
  decodeSpecParam,
  editUrl,
  prepareSpec,
  renderPrepared,
  specFromQuery,
  specUrl,
  suggestTemplates,
} from '~/agent/spec';
import { templateSchema, templateSummary } from '~/agent/catalog';
import { SITE_NAME, SKILL_NAME, llmsFullTxt, llmsTxt, openApi, skillMd } from '~/agent/guide';

export interface Env {
  ASSETS: { fetch(input: Request | string): Promise<Response> };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const CACHE = 'public, max-age=3600';

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

function text(body: string, type: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, ...CORS, 'Cache-Control': CACHE, ...extra } });
}

function fail(status: number, code: string, message: string, details: Record<string, unknown> = {}): Response {
  return json({ error: { code, message, ...details, docs: '/llms-full.txt' } }, status);
}

// SVGs are images: never let them run script, even if opened directly.
const SVG_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:",
  'X-Content-Type-Options': 'nosniff',
};

// ---------------------------------------------------------------------------
// Fonts (optional embedding), loaded once per isolate from the static assets.

const FONT_FILES: Record<string, [number, string][]> = {
  sans: [
    [400, 'inter-400'],
    [500, 'inter-500'],
    [600, 'inter-600'],
  ],
  serif: [
    [400, 'source-serif-4-400'],
    [600, 'source-serif-4-600'],
  ],
  hand: [
    [400, 'kalam-400'],
    [700, 'kalam-700'],
  ],
};
const FAMILY: Record<string, string> = { sans: 'Inter', serif: 'Source Serif 4', hand: 'Kalam' };
const fontCss = new Map<string, Promise<string>>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function loadFontCss(font: string, env: Env, origin: string): Promise<string> {
  let p = fontCss.get(font);
  if (!p) {
    p = Promise.all(
      (FONT_FILES[font] ?? FONT_FILES.sans).map(async ([weight, file]) => {
        const res = await env.ASSETS.fetch(`${origin}/fonts/${file}.woff2`);
        if (!res.ok) throw new Error(`font ${file} missing`);
        return `@font-face{font-family:'${FAMILY[font] ?? 'Inter'}';font-weight:${weight};src:url(data:font/woff2;base64,${toBase64(await res.arrayBuffer())}) format('woff2');}`;
      }),
    ).then((r) => r.join(''));
    p.catch(() => fontCss.delete(font));
    fontCss.set(font, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Rendering

async function render(spec: unknown, format: 'json' | 'svg', origin: string, env: Env, cacheable: boolean): Promise<Response> {
  const prepared = prepareSpec(spec);
  const embed = !!(spec as { embedFonts?: unknown })?.embedFonts;
  const css = embed ? await loadFontCss(prepared.style.font, env, origin).catch(() => undefined) : undefined;
  const out = renderPrepared(prepared, { fontCss: css });
  const cache = cacheable ? { 'Cache-Control': CACHE } : { 'Cache-Control': 'no-store' };
  if (format === 'svg') {
    return new Response(out.svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Disposition': `inline; filename="${prepared.template.id}.svg"`,
        ...(prepared.warnings.length ? { 'X-Warnings': encodeURIComponent(prepared.warnings.join(' | ')).slice(0, 2000) } : {}),
        ...SVG_HEADERS,
        ...CORS,
        ...cache,
      },
    });
  }
  return json(
    {
      template: { id: prepared.template.id, name: prepared.template.name },
      svg: out.svg,
      width: out.width,
      height: out.height,
      editUrl: editUrl(origin, prepared),
      svgUrl: specUrl(origin, spec),
      labels: out.labels,
      stats: out.stats ?? null,
      warnings: prepared.warnings,
    },
    200,
    cache,
  );
}

function pickFormat(path: string, url: URL, body?: unknown): 'json' | 'svg' | null {
  if (path.endsWith('.svg')) return 'svg';
  if (path.endsWith('.json')) return 'json';
  const f = url.searchParams.get('format') ?? (body as { format?: unknown })?.format;
  if (f === undefined || f === null || f === '') return 'json';
  return f === 'svg' || f === 'json' ? f : null;
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > LIMITS.bodyBytes) throw new SpecError(413, 'too_large', `Request body is over ${LIMITS.bodyBytes / 1000} KB.`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new SpecError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
}

// ---------------------------------------------------------------------------
// Router

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // Agent docs
  if (method === 'GET' || method === 'HEAD') {
    switch (path) {
      case '/llms.txt':
        return text(llmsTxt(origin), 'text/markdown');
      case '/llms-full.txt':
        return text(llmsFullTxt(origin), 'text/markdown');
      case '/openapi.json':
        return json(openApi(origin), 200, { 'Cache-Control': CACHE });
      case '/skill/SKILL.md':
        return text(skillMd(origin), 'text/markdown');
      case `/skill/${SKILL_NAME}.zip`: {
        const zip = zipSync({ [`${SKILL_NAME}/SKILL.md`]: strToU8(skillMd(origin)) });
        return new Response(zip, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${SKILL_NAME}.zip"`,
            'Cache-Control': CACHE,
            ...CORS,
          },
        });
      }
    }
  }

  if (!path.startsWith('/api')) return env.ASSETS.fetch(request);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // API index
  if (path === '/api' || path === '/api/v1') {
    return json({
      name: `${SITE_NAME} API`,
      version: 'v1',
      description: 'Create IB Economics diagrams from JSON: get an SVG plus a link that opens the graph in the editor.',
      docs: { guide: `${origin}/llms-full.txt`, short: `${origin}/llms.txt`, openapi: `${origin}/openapi.json`, skill: `${origin}/skill/SKILL.md`, html: `${origin}/docs/api/` },
      endpoints: {
        templates: `GET ${origin}/api/v1/templates`,
        template: `GET ${origin}/api/v1/templates/{id}`,
        render: `POST ${origin}/api/v1/render`,
        renderSvg: `GET ${origin}/api/v1/render/{id}.svg?param=value`,
      },
      templates: TEMPLATES.length,
    });
  }

  if (path === '/api/v1/templates') {
    if (method !== 'GET' && method !== 'HEAD') return fail(405, 'method_not_allowed', 'Use GET.');
    const q = url.searchParams.get('q')?.trim().toLowerCase();
    const unit = url.searchParams.get('unit');
    const hlOnly = url.searchParams.get('hl');
    let list = TEMPLATES;
    if (unit) list = list.filter((t) => t.unit === unit);
    if (hlOnly === 'true') list = list.filter((t) => t.hl);
    if (hlOnly === 'false') list = list.filter((t) => !t.hl);
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter((t) => {
        const hay = [t.id, t.name, t.topic, t.description, ...(t.keywords ?? [])].join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    return json({ count: list.length, templates: list.map((t) => templateSummary(t, origin)) }, 200, { 'Cache-Control': CACHE });
  }

  const tm = path.match(/^\/api\/v1\/templates\/([a-z0-9-]+)$/);
  if (tm) {
    const t = getTemplate(tm[1]);
    if (!t) {
      const suggestions = suggestTemplates(tm[1]);
      return fail(404, 'unknown_template', `No template "${tm[1]}".`, { suggestions });
    }
    return json(templateSchema(t, origin), 200, { 'Cache-Control': CACHE });
  }

  // POST /api/v1/render(.svg|.json)
  if (/^\/api\/v1\/render(\.svg|\.json)?$/.test(path)) {
    if (method === 'POST') {
      const body = await readJson(request);
      const format = pickFormat(path, url, body);
      if (!format) return fail(400, 'invalid_format', 'format must be "json" or "svg".');
      return render(body, format, origin, env, false);
    }
    if (method === 'GET' || method === 'HEAD') {
      const raw = url.searchParams.get('spec');
      if (!raw) {
        return fail(400, 'missing_spec', 'GET /api/v1/render needs ?spec=<json>. Or use /api/v1/render/{template}.svg?param=value, or POST a JSON body.');
      }
      // GET exists for embeddable image URLs, so it defaults to SVG.
      const format = path.endsWith('.json') || (!path.endsWith('.svg') && url.searchParams.get('format') === 'json') ? 'json' : 'svg';
      return render(decodeSpecParam(raw), format, origin, env, true);
    }
    return fail(405, 'method_not_allowed', 'Use POST with a JSON body, or GET with ?spec=.');
  }

  // GET /api/v1/render/{id}.svg|.json?param=…
  const rm = path.match(/^\/api\/v1\/render\/([a-z0-9-]+)(\.svg|\.json)?$/);
  if (rm) {
    if (method !== 'GET' && method !== 'HEAD') return fail(405, 'method_not_allowed', 'Use GET (or POST /api/v1/render).');
    const spec = specFromQuery(rm[1], url.searchParams);
    return render(spec, rm[2] === '.json' ? 'json' : 'svg', origin, env, true);
  }

  return fail(404, 'not_found', `No API route ${method} ${path}. See ${origin}/api/v1.`);
}

// Warm up the render path at start-up (start-up time is not billed per request).
try {
  renderPrepared(prepareSpec({ template: 'market-equilibrium' }));
} catch {
  /* never block start-up */
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof SpecError) return fail(e.status, e.code, e.message, e.details);
      console.error(e);
      return fail(500, 'internal_error', 'Something went wrong rendering this graph. Please report the spec that caused it.');
    }
  },
};
