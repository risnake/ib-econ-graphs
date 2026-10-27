/**
 * Agent-facing documentation, generated from the live template registry so it
 * can never drift from the API. One source feeds /llms.txt, /llms-full.txt,
 * the Claude skill, the OpenAPI spec and the human /docs/api/ page.
 */
import type { Template } from '~/engine/types';
import { TEMPLATES, UNITS, groupedTemplates } from '~/templates';
import { paramSchema, templateSchema } from './catalog';
import { LIMITS } from './spec';

const F = '```';

export const SITE_NAME = 'Econ Graph Studio';
export const SKILL_NAME = 'ib-econ-graphs';

const hl = (t: Template) => (t.hl ? ' (HL)' : '');

/** One line per template, grouped by unit and topic. */
export function templateIndex(origin: string, links = true): string {
  const out: string[] = [];
  for (const { unit, topics } of groupedTemplates()) {
    out.push(`### ${unit.name}`);
    for (const { topic, items } of topics) {
      out.push('', `**${topic}**`, '');
      for (const t of items) {
        const id = links ? `[\`${t.id}\`](${origin}/api/v1/templates/${t.id})` : `\`${t.id}\``;
        out.push(`- ${id} — ${t.name}${hl(t)}: ${t.description}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}

/** Example specs used in the docs (kept here so tests can render them). */
export function guideExamples() {
  const example = {
    template: 'tariff',
    params: { lettering: 'letters' },
    title: 'Figure 1: Effect of a tariff on steel imports',
    labels: { 'main.d': 'D_{steel}' },
    style: { palette: 'color', areaLabels: 'inside' },
  };
  // A subsidy drawn by hand on blank axes; intersections computed exactly.
  const d = (x: number) => 9 - (7.5 / 9) * x;
  const s1 = (x: number) => 1.5 + (7 / 9) * x;
  const s2 = (x: number) => s1(x) - 1;
  const r = (n: number) => Math.round(n * 100) / 100;
  const q1 = 7.5 / (7.5 / 9 + 7 / 9);
  const q2 = 8.5 / (7.5 / 9 + 7 / 9);
  const custom = {
    template: 'blank-axes',
    params: { axes: 'pq' },
    title: 'Figure 2: A subsidy on electric cars',
    annotations: [
      { kind: 'line', points: [[0, 9], [9, d(9)]].map(([x, y]) => [r(x), r(y)]), label: 'D', role: 'demand' },
      { kind: 'line', points: [[0, 1.5], [9, r(s1(9))]], label: 'S_1', role: 'supply' },
      { kind: 'line', points: [[0, 0.5], [9, r(s2(9))]], label: 'S_2 = S_1 − subsidy', role: 'supply', dashed: true },
      { kind: 'point', at: [r(q1), r(d(q1))], xLabel: 'Q_1', yLabel: 'P_1' },
      { kind: 'point', at: [r(q2), r(d(q2))], xLabel: 'Q_2', yLabel: 'P_2' },
      { kind: 'arrow', from: [7.5, r(s1(7.5) - 0.12)], to: [7.5, r(s2(7.5) + 0.12)], label: 'subsidy' },
      { kind: 'area', points: [[0, 9], [0, r(d(q1))], [r(q1), r(d(q1))]], role: 'cs', label: 'CS' },
    ],
  };
  const skill = { template: 'indirect-tax-specific', params: { dEl: 'inelastic' }, title: 'Figure 1: Sugar tax' };
  return { example, custom, skill };
}

/** The full API guide (markdown). `origin` is the site's absolute origin. */
export function apiGuide(origin: string): string {
  const { example, custom } = guideExamples();
  return `# ${SITE_NAME} API

Create IB Economics diagrams (SL and HL) from JSON. The API returns a crisp **SVG** plus an **edit link** that opens the exact same graph in the web editor, where a person can adjust it and export PNG, SVG or PDF.

- Base URL: \`${origin}/api/v1\`
- No API key. CORS is enabled. Responses are deterministic, so cache freely.
- ${TEMPLATES.length} templates covering all four units of the IB Economics syllabus, plus \`blank-axes\` for anything custom.

## Quick start

${F}bash
# 1. Find a template (or browse the index at the end of this guide)
curl -s "${origin}/api/v1/templates?q=tariff"

# 2. Read its schema: params (types, options, ranges, defaults) and label keys
curl -s "${origin}/api/v1/templates/tariff"

# 3. Render it
curl -s "${origin}/api/v1/render" \\
  -H "content-type: application/json" \\
  -d '${JSON.stringify(example)}'
${F}

The render response is JSON:

${F}json
{
  "template": { "id": "tariff", "name": "Tariff" },
  "svg": "<?xml …><svg …>…</svg>",
  "width": 590, "height": 520,
  "editUrl": "${origin}/graph/tariff/#g=…",
  "svgUrl": "${origin}/api/v1/render.svg?spec=…",
  "labels": [{ "key": "main.d", "text": "D_{steel}", "hint": "Curve", "panel": "main" }],
  "stats": null,
  "warnings": []
}
${F}

- **\`editUrl\`** — give this to the person. It opens the graph in the editor, ready to tweak and export (PNG up to 4×, SVG, PDF, copy-to-clipboard).
- **\`svgUrl\`** — a stable GET URL for the image; usable in Markdown (\`![Figure 1](svgUrl)\`) or HTML \`<img>\`.
- **\`svg\`** — the image itself; save it as \`figure-1.svg\`.
- **\`warnings\`** — anything ignored or adjusted (unknown params, clamped numbers, unknown label keys). Read them and retry if needed.

For the image only, ask for SVG directly: \`POST /api/v1/render?format=svg\` or \`POST /api/v1/render.svg\`.

### One-line GET form

Every param can go in the query string, which makes embeddable image URLs easy:

${F}text
${origin}/api/v1/render/market-equilibrium.svg?pointLabel=true&style.palette=mono&title=Figure%201
${origin}/api/v1/render/demand-shift.svg?dir=dec&shift=2.5&label.d1=D_1
${origin}/api/v1/render/tariff.json?lettering=letters
${F}

Reserved query keys: \`title\`, \`style.<option>\`, \`label.<key>\`, \`hide=<key>,<key>\`, \`fonts=embed\`. Everything else is a template param. For the full spec in a GET request, use \`/api/v1/render.svg?spec=<URL-encoded JSON>\`.

## Recommended workflow for AI agents

1. **Choose a template** from the index below (or \`GET /api/v1/templates?q=<words>\`). Prefer a specific template over \`blank-axes\`: templates compute intersections, welfare areas and cost curves correctly.
2. **Read the schema** (\`GET /api/v1/templates/{id}\`) to learn its \`params\` and \`labels\` keys. Labels depend on params (toggles add elements), so the render response also lists the labels actually drawn.
3. **Render** with \`POST /api/v1/render\`. Check \`warnings\`.
4. **Deliver**: share \`editUrl\` with the person (best: they can fine-tune and export), and/or save the SVG.
5. **Need a PNG?** The API returns SVG only. Convert locally (\`rsvg-convert -z 3 in.svg -o out.png\`, \`cairosvg\`, Inkscape, or a headless browser), or let the person open \`editUrl\` and use **Export → PNG**.

IB conventions worth following: label every curve (D, S, MSC, AD, SRAS…), label both axes, use subscripts for moved equilibria (P₁ → P₂), and give each figure a numbered title (\`"title": "Figure 1: …"\`).

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | \`/api/v1\` | API index and links |
| GET | \`/api/v1/templates\` | All templates. Filters: \`?q=words\`, \`?unit=intro|micro|macro|global|custom\`, \`?hl=true\` |
| GET | \`/api/v1/templates/{id}\` | One template's schema: params, defaults, panels, label keys, element keys, example |
| POST | \`/api/v1/render\` | Render a graph spec. \`?format=json\` (default) or \`svg\`; also \`/render.svg\`, \`/render.json\` |
| GET | \`/api/v1/render.svg?spec=…\` | Render a spec passed in the URL (JSON, base64url JSON, or the value inside a returned \`svgUrl\`) |
| GET | \`/api/v1/render/{id}.svg\` | Render from query params (\`.json\` also works) |
| GET | \`/openapi.json\` | OpenAPI 3.1 description |
| GET | \`/llms-full.txt\` | This guide plus every template's full parameter reference |
| GET | \`/skill/SKILL.md\` | A Claude skill for this API (\`/skill/${SKILL_NAME}.zip\` to upload) |

## Graph spec

${F}jsonc
{
  "template": "tariff",               // required — a template id
  "params": { "lettering": "letters" }, // template options; see the template's schema
  "title": "Figure 1: …",             // optional; shown above the graph when set
  "labels": { "main.d": "D_{steel}" }, // replace any label's text by key
  "hidden": ["main.q3:x"],            // hide elements or labels by key
  "colors": { "main.s": "#008300" },  // recolour curves, areas, arrows, points
  "dashed": { "main.s": true },       // dash a curve or arrow
  "offsets": { "main.d": [8, -6] },   // nudge a label by [dx, dy] pixels
  "annotations": [ … ],               // draw extra lines, points, shading, arrows, text
  "style": { "palette": "mono" },     // look and feel, see below
  "format": "json",                   // "json" (default) or "svg"
  "embedFonts": false                 // true = embed the web font in the SVG (bigger file)
}
${F}

### Keys for labels, hidden, colors, dashed and offsets

Keys come from the template schema (\`labels[].key\` and \`elements[].key\`):

- \`panel.element\` — a curve, area, arrow, point or text, e.g. \`main.d1\`
- \`panel.element:x\` / \`panel.element:y\` — a point's guide line and its axis label, e.g. \`main.e1:x\` (Q₁)
- \`panel:x\` / \`panel:y\` — axis titles; \`panel:title\` — a panel title; \`panel:origin\` — the "0"

In single-panel diagrams the panel prefix is optional: \`"d1"\` means \`"main.d1"\`. Multi-panel templates (e.g. \`perfect-competition-short-run\` has \`industry\` and \`firm\`) need the full key.

### Label text

Plain text with a tiny markup: \`P_1\` → P₁, \`P_{max}\` → P with subscript "max", \`x^2\` → superscript, \`\\n\` → new line. Example: \`"S_1 = MPC"\`, \`"P_{w} + t"\`.

### Annotations (draw anything)

Coordinates are **data coordinates** of the panel: by default x and y both run 0–10 with the origin at the bottom-left (each panel's \`xRange\`/\`yRange\` is in the schema; Lorenz curves use 0–100).

| kind | fields |
| --- | --- |
| \`line\` / \`curve\` | \`points\`: 2 points = straight line, 3+ = smooth curve through them; \`label\`; \`role\` (colour: demand, supply, social, mc, mr, atc, avc, afc, long-run, policy, world, neutral); \`dashed\` |
| \`point\` | \`at\`; \`label\`; \`xLabel\` / \`yLabel\` draw dashed guides to the axes with those labels |
| \`area\` / \`shading\` | \`points\` (polygon, 3+); \`role\`: cs, ps, dwl, gov, profit, loss, gain, cost, neutral; \`label\` |
| \`arrow\` | \`from\`, \`to\`; \`label\` |
| \`text\` | \`at\`, \`text\` |

All kinds accept \`panel\` (default: the first panel) and \`color\` (\`#rrggbb\`). Up to ${LIMITS.annotations} annotations.

### Custom diagrams

For a diagram with no template, use \`blank-axes\` (\`params.axes\`: pq, macro, firm, labour, money, fx, phillips, ppc, time; \`params.numeric: true\` with \`xMax\`/\`yMax\` for a numbered scale) and draw it with annotations:

${F}json
${JSON.stringify(custom, null, 2)}
${F}

Compute intersection coordinates yourself so points and guides land exactly on the crossing.

### Style

| option | values (default first) |
| --- | --- |
| \`palette\` | \`color\`, \`classic\` (black curves, coloured shading), \`mono\` (black and white, hatched areas — for printing) |
| \`font\` | \`sans\`, \`serif\`, \`hand\` |
| \`fontScale\` | 1 (0.6–2) |
| \`strokeScale\` | 1 (0.5–3) |
| \`areaLabels\` | \`inside\`, \`legend\`, \`both\`, \`none\` |
| \`axisLabels\` | \`end\` (textbook), \`center\` |
| \`areaOpacity\` | 0.3 (0.05–1) |
| \`background\` | \`white\`, \`transparent\` |
| \`showTitle\` | false (true automatically when \`title\` is given) |
| \`axisArrows\`, \`showOrigin\`, \`dots\` | false, true, true |

## Errors

Errors are JSON with an HTTP status: \`{ "error": { "code": "unknown_template", "message": "No template \\"tarrif\\". Did you mean: tariff, …?", "suggestions": [ … ] } }\`. Invalid enum values list the allowed options. Problems that can be worked around (unknown params or keys, out-of-range numbers) are returned as \`warnings\` instead of errors.

## Limits

Request bodies up to ${LIMITS.bodyBytes / 1000} KB, text fields up to ${LIMITS.text} characters, ${LIMITS.annotations} annotations. The service is free; please cache results and avoid bulk generation.

## Template index

${templateIndex(origin)}`;
}

/** Per-template parameter reference (for llms-full.txt). */
export function templateReference(origin: string): string {
  const out: string[] = ['# Template reference', ''];
  for (const t of TEMPLATES) {
    const s = templateSchema(t, origin);
    out.push(`## \`${t.id}\` — ${t.name}${hl(t)}`, '', t.description, '');
    out.push(`Unit: ${s.unitName} · Topic: ${t.topic} · Preview: ${s.previewUrl}`, '');
    if (t.controls.length) {
      out.push('Params:', '');
      for (const c of t.controls) {
        const p = paramSchema(c);
        const range =
          p.type === 'enum'
            ? ` — one of ${p.options!.map((o) => `\`${o.value}\` (${o.label})`).join(', ')}`
            : p.type === 'number' && (p.min !== undefined || p.max !== undefined)
              ? ` — ${p.min ?? '−∞'} to ${p.max ?? '∞'}`
              : '';
        out.push(`- \`${p.key}\` (${p.type}, default \`${JSON.stringify(p.default)}\`): ${p.label}${range}${p.help ? `. ${p.help}` : ''}`);
      }
      out.push('');
    }
    out.push(`Panels: ${s.panels.map((p) => `\`${p.id}\`${p.title ? ` (${p.title})` : ''}`).join(', ')}`, '');
    out.push('Label keys (default params): ' + s.labels.map((l) => `\`${l.key}\`="${l.default}"`).join(', '), '');
  }
  return out.join('\n');
}

/** /llms.txt — the short, discoverable entry point (https://llmstxt.org). */
export function llmsTxt(origin: string): string {
  return `# ${SITE_NAME}

> Free web app and public JSON API for drawing IB Economics diagrams (SL and HL): demand and supply, elasticity, taxes and subsidies, externalities, theory of the firm, AD/AS, unemployment, Phillips curves, Lorenz curves, trade protection, exchange rates and more. POST a JSON spec, get back an SVG and an edit link that opens the graph in the editor for exporting PNG/PDF.

- API base: ${origin}/api/v1 — no key needed, CORS enabled.
- Fastest path: \`POST ${origin}/api/v1/render\` with \`{"template": "<id>", "params": {…}}\`, then give the person the returned \`editUrl\`.
- Image URL form: \`${origin}/api/v1/render/<id>.svg?<param>=<value>\`.

## Docs

- [Full API guide + every template's params](${origin}/llms-full.txt): read this before building a spec
- [OpenAPI spec](${origin}/openapi.json)
- [Claude skill (SKILL.md)](${origin}/skill/SKILL.md): install to use this API from Claude Code or claude.ai
- [Human-readable docs](${origin}/docs/api/)

## Templates

${templateIndex(origin)}`;
}

export function llmsFullTxt(origin: string): string {
  return `${apiGuide(origin)}\n\n${templateReference(origin)}`;
}

/** A Claude Agent Skill that teaches Claude to use this API. */
export function skillMd(origin: string): string {
  const units = UNITS.filter((u) => u.id !== 'custom')
    .map((u) => u.name.replace(/^Unit \d · /, ''))
    .join(', ');
  return `---
name: ${SKILL_NAME}
description: Draw IB Economics diagrams (supply and demand, elasticity, taxes, subsidies, price controls, externalities, cost and revenue curves, market structures, AD/AS, Phillips curve, Lorenz curve, tariffs, quotas, exchange rates, J-curve, PPC) as SVG images with an editable link, using the ${SITE_NAME} API. Use whenever someone needs an economics graph or diagram, especially for an IB Economics internal assessment (IA), notes, worksheets or revision.
---

# ${SITE_NAME}

Use the public API at \`${origin}/api/v1\` (no key) to produce correctly drawn IB Economics diagrams covering ${units}. Every render returns an SVG and an \`editUrl\` that opens the graph in the web editor, where the person can fine-tune it and export PNG, SVG or PDF.

## Workflow

1. **Pick a template** from the index below, or search: \`curl -s "${origin}/api/v1/templates?q=price+ceiling"\`. Prefer a specific template over \`blank-axes\` — templates compute intersections, welfare-loss triangles and cost curves correctly.
2. **Read its schema** to see params (types, allowed values, ranges, defaults) and label keys: \`curl -s ${origin}/api/v1/templates/<id>\`.
3. **Render**:
   ${F}bash
   curl -s ${origin}/api/v1/render -H "content-type: application/json" \\
     -d '${JSON.stringify(guideExamples().skill)}'
   ${F}
   Check \`warnings\` in the response; fix and re-render if something was ignored.
4. **Deliver**: give the person the \`editUrl\` (they can adjust and export) and, if they need a file, save \`svg\` as \`figure-1.svg\`. For PNG, convert locally (\`rsvg-convert -z 3 figure-1.svg -o figure-1.png\`, cairosvg, or a headless browser) or tell them to use Export → PNG in the editor.

## Spec cheat sheet

${F}jsonc
{
  "template": "<id>",                    // required
  "params": { … },                       // template options (see schema)
  "title": "Figure 1: …",                // shown above the graph
  "labels": { "d1": "D_{coffee}" },      // rename labels by key (panel prefix optional for 1-panel graphs)
  "hidden": ["e1:x"], "colors": { "s": "#008300" }, "dashed": { "s2": true },
  "annotations": [ { "kind": "line", "points": [[1,9],[9,1]], "label": "D_2" },
                   { "kind": "point", "at": [5,5], "xLabel": "Q_1", "yLabel": "P_1" },
                   { "kind": "area", "points": [[0,9],[0,5],[5,5]], "role": "cs", "label": "CS" },
                   { "kind": "arrow", "from": [6,8], "to": [7.5,8] },
                   { "kind": "text", "at": [8,9], "text": "note" } ],
  "style": { "palette": "color|classic|mono", "font": "sans|serif|hand", "areaLabels": "inside|legend|both|none" }
}
${F}

- Label markup: \`P_1\` → P₁, \`P_{max}\`, \`x^2\`, \`\\n\` for a new line.
- Annotation coordinates are data coordinates (default 0–10 on both axes, origin bottom-left).
- Quick image URL: \`${origin}/api/v1/render/<id>.svg?<param>=<value>&style.palette=mono\`.
- Full reference (every template's params and label keys): ${origin}/llms-full.txt

## IB diagram conventions

Label both axes and every curve; show the original and new equilibria with dashed guides (P₁/Q₁ → P₂/Q₂); shade and name welfare areas; number figures ("Figure 1: …"). Use \`style.palette: "mono"\` when the work will be printed in black and white.

## Template index

${templateIndex(origin, false)}`;
}

/** OpenAPI 3.1 description of the API. */
export function openApi(origin: string) {
  const ids = TEMPLATES.map((t) => t.id);
  const xy = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };
  const spec = {
    type: 'object',
    required: ['template'],
    properties: {
      template: { type: 'string', enum: ids, description: 'Template id' },
      params: { type: 'object', additionalProperties: true, description: 'Template options; see GET /api/v1/templates/{id}' },
      title: { type: 'string', maxLength: LIMITS.text },
      labels: { type: 'object', additionalProperties: { type: 'string' }, description: 'Label text overrides by key' },
      hidden: { type: 'array', items: { type: 'string' } },
      colors: { type: 'object', additionalProperties: { type: 'string' } },
      dashed: { type: 'object', additionalProperties: { type: 'boolean' } },
      offsets: { type: 'object', additionalProperties: xy, description: 'Label nudges in pixels [dx, dy]' },
      annotations: {
        type: 'array',
        maxItems: LIMITS.annotations,
        items: {
          type: 'object',
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['line', 'curve', 'point', 'area', 'shading', 'arrow', 'text'] },
            points: { type: 'array', items: xy },
            at: xy,
            from: xy,
            to: xy,
            label: { type: 'string' },
            text: { type: 'string' },
            xLabel: { type: 'string' },
            yLabel: { type: 'string' },
            role: { type: 'string' },
            dashed: { type: 'boolean' },
            color: { type: 'string' },
            panel: { type: 'string' },
          },
        },
      },
      style: {
        type: 'object',
        properties: {
          palette: { enum: ['color', 'classic', 'mono'] },
          font: { enum: ['sans', 'serif', 'hand'] },
          fontScale: { type: 'number', minimum: 0.6, maximum: 2 },
          strokeScale: { type: 'number', minimum: 0.5, maximum: 3 },
          areaLabels: { enum: ['inside', 'legend', 'both', 'none'] },
          axisLabels: { enum: ['end', 'center'] },
          areaOpacity: { type: 'number', minimum: 0.05, maximum: 1 },
          background: { enum: ['white', 'transparent'] },
          showTitle: { type: 'boolean' },
          axisArrows: { type: 'boolean' },
          showOrigin: { type: 'boolean' },
          dots: { type: 'boolean' },
        },
      },
      format: { enum: ['json', 'svg'] },
      embedFonts: { type: 'boolean' },
    },
  };
  const renderJson = {
    type: 'object',
    properties: {
      template: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      svg: { type: 'string' },
      width: { type: 'number' },
      height: { type: 'number' },
      editUrl: { type: 'string', format: 'uri' },
      svgUrl: { type: 'string', format: 'uri' },
      labels: { type: 'array', items: { type: 'object' } },
      stats: { type: ['array', 'null'] },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
  const error = { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } };
  const errors = {
    '400': { description: 'Invalid spec', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    '404': { description: 'Unknown template', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: `${SITE_NAME} API`,
      version: '1.0.0',
      description: `Create IB Economics diagrams from JSON. Guide: ${origin}/llms-full.txt`,
    },
    servers: [{ url: origin }],
    paths: {
      '/api/v1/templates': {
        get: {
          operationId: 'listTemplates',
          summary: 'List diagram templates',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search words' },
            { name: 'unit', in: 'query', schema: { enum: UNITS.map((u) => u.id) } },
            { name: 'hl', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': { description: 'Templates', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/api/v1/templates/{id}': {
        get: {
          operationId: 'getTemplate',
          summary: "A template's params, panels and label keys",
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ids } }],
          responses: { '200': { description: 'Template schema', content: { 'application/json': { schema: { type: 'object' } } } }, ...errors },
        },
      },
      '/api/v1/render': {
        post: {
          operationId: 'renderGraph',
          summary: 'Render a graph spec to SVG + edit link',
          parameters: [{ name: 'format', in: 'query', schema: { enum: ['json', 'svg'], default: 'json' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GraphSpec' } } } },
          responses: {
            '200': {
              description: 'Rendered graph',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/RenderResult' } },
                'image/svg+xml': { schema: { type: 'string' } },
              },
            },
            ...errors,
          },
        },
      },
      '/api/v1/render.svg': {
        get: {
          operationId: 'renderGraphSvgFromSpec',
          summary: 'Render a spec passed in the URL',
          parameters: [{ name: 'spec', in: 'query', required: true, schema: { type: 'string' }, description: 'URL-encoded JSON, base64url JSON, or the value from svgUrl' }],
          responses: { '200': { description: 'SVG image', content: { 'image/svg+xml': { schema: { type: 'string' } } } }, ...errors },
        },
      },
      '/api/v1/render/{id}.svg': {
        get: {
          operationId: 'renderGraphSvgFromQuery',
          summary: 'Render from query params (title, style.*, label.*, hide, and template params)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ids } }],
          responses: { '200': { description: 'SVG image', content: { 'image/svg+xml': { schema: { type: 'string' } } } }, ...errors },
        },
      },
    },
    components: { schemas: { GraphSpec: spec, RenderResult: renderJson, Error: error } },
  };
}
