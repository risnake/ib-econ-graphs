/**
 * The public graph spec: a small JSON format that AI agents (and anyone else)
 * can send to the API to produce a diagram. This module validates a spec,
 * turns it into the same GraphDoc + GraphStyle the editor uses, and renders it
 * to SVG. It runs in the Cloudflare Worker and in tests (no DOM needed).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type {
  AreaRole,
  Control,
  CurveRole,
  Extra,
  GraphDoc,
  GraphStyle,
  Overrides,
  Params,
  Scene,
  Stat,
  Template,
  Vec,
} from '~/engine/types';
import { GraphSVG, axisKey, elKey, layoutScene } from '~/engine/GraphSVG';
import { DEFAULT_STYLE } from '~/engine/theme';
import { TEMPLATES, defaultParams, getTemplate } from '~/templates';
import { EXTRA_PREFIX, collectLabels, withExtras } from '~/lib/scene';

// ---------------------------------------------------------------------------
// Spec types (documented in the agent guide)

type XY = [number, number];

export type AnnotationSpec =
  | { kind: 'text'; text: string; at: XY; panel?: string; color?: string }
  | { kind: 'arrow'; from: XY; to: XY; label?: string; panel?: string; color?: string }
  | { kind: 'line' | 'curve'; points: XY[]; label?: string; role?: CurveRole; panel?: string; color?: string; dashed?: boolean }
  | { kind: 'point'; at: XY; label?: string; xLabel?: string; yLabel?: string; panel?: string; color?: string }
  | { kind: 'area' | 'shading'; points: XY[]; role?: AreaRole; label?: string; panel?: string; color?: string };

export interface GraphSpec {
  template: string;
  params?: Record<string, unknown>;
  title?: string;
  labels?: Record<string, string>;
  hidden?: string[];
  colors?: Record<string, string>;
  dashed?: Record<string, boolean>;
  offsets?: Record<string, XY>;
  annotations?: AnnotationSpec[];
  style?: Partial<GraphStyle>;
}

export class SpecError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Prepared {
  template: Template;
  doc: GraphDoc;
  style: GraphStyle;
  warnings: string[];
}

export const LIMITS = {
  annotations: 100,
  text: 200,
  bodyBytes: 100_000,
} as const;

const CURVE_ROLES: CurveRole[] = ['demand', 'supply', 'social', 'mc', 'mr', 'atc', 'avc', 'afc', 'long-run', 'policy', 'world', 'neutral', 'alt'];
const AREA_ROLES: AreaRole[] = ['cs', 'ps', 'dwl', 'gov', 'profit', 'loss', 'gain', 'cost', 'neutral', 'alt'];

const STYLE_ENUMS: Partial<Record<keyof GraphStyle, readonly string[]>> = {
  font: ['sans', 'serif', 'hand'],
  palette: ['color', 'classic', 'mono'],
  background: ['white', 'transparent'],
  areaLabels: ['inside', 'legend', 'both', 'none'],
  axisLabels: ['end', 'center'],
};
const STYLE_RANGES: Partial<Record<keyof GraphStyle, [number, number]>> = {
  fontScale: [0.6, 2],
  strokeScale: [0.5, 3],
  areaOpacity: [0.05, 1],
};
const STYLE_BOOLS: (keyof GraphStyle)[] = ['axisArrows', 'showOrigin', 'dots', 'showTitle'];

// ---------------------------------------------------------------------------
// Helpers

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i;

function text(v: unknown, field: string, warnings: string[]): string {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  if (s.length > LIMITS.text) {
    warnings.push(`${field} was longer than ${LIMITS.text} characters and was cut.`);
    return s.slice(0, LIMITS.text);
  }
  return s;
}

function xy(v: unknown, field: string): Vec {
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return [v[0] as number, v[1] as number];
  }
  throw new SpecError(400, 'invalid_annotation', `${field} must be an [x, y] pair of numbers in data coordinates.`);
}

/** Template ids that look like `query`, best first. */
export function suggestTemplates(query: string, n = 5): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return TEMPLATES.map((t) => {
    const hay = `${t.id} ${t.name} ${(t.keywords ?? []).join(' ')}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? (t.id.includes(w) ? 2 : 1) : 0), 0);
    return { id: t.id, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((r) => r.id);
}

function coerceParam(c: Control, raw: unknown, warnings: string[]): Params[string] | undefined {
  switch (c.type) {
    case 'toggle': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(s)) return true;
      if (['false', '0', 'no', 'off'].includes(s)) return false;
      warnings.push(`params.${c.key} must be true or false; kept the default (${c.default}).`);
      return undefined;
    }
    case 'select': {
      const s = String(raw);
      if (c.options.some((o) => o.value === s)) return s;
      throw new SpecError(400, 'invalid_param', `params.${c.key} must be one of: ${c.options.map((o) => o.value).join(', ')}.`, {
        param: c.key,
        options: c.options,
      });
    }
    case 'slider':
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        warnings.push(`params.${c.key} must be a number; kept the default (${c.default}).`);
        return undefined;
      }
      const lo = c.min ?? -Infinity;
      const hi = c.max ?? Infinity;
      if (n < lo || n > hi) {
        const clamped = Math.min(hi, Math.max(lo, n));
        warnings.push(`params.${c.key} = ${n} is outside ${lo}–${hi}; used ${clamped}.`);
        return clamped;
      }
      return n;
    }
    case 'text':
      return text(raw, `params.${c.key}`, warnings);
  }
}

/** Every key the spec may target: labels, element keys and their parts. */
function knownKeys(scene: Scene): { labels: Set<string>; elements: Set<string> } {
  const labels = new Set(collectLabels(scene).map((l) => l.key));
  const elements = new Set<string>();
  for (const p of scene.panels) {
    for (const part of ['x', 'y', 'title', 'origin'] as const) elements.add(axisKey(p.id, part));
    for (const el of p.elements) {
      elements.add(elKey(p.id, el.id));
      if (el.kind === 'point') {
        elements.add(elKey(p.id, el.id, 'x'));
        elements.add(elKey(p.id, el.id, 'y'));
      }
    }
  }
  for (const k of labels) elements.add(k);
  return { labels, elements };
}

// ---------------------------------------------------------------------------
// Validation: spec → doc + style

export function prepareSpec(input: unknown): Prepared {
  if (!isObj(input)) throw new SpecError(400, 'invalid_spec', 'The request body must be a JSON object with at least a "template" field.');
  const warnings: string[] = [];
  const id = typeof input.template === 'string' ? input.template.trim() : '';
  if (!id) throw new SpecError(400, 'missing_template', 'Missing "template". List templates at /api/v1/templates.');
  const template = getTemplate(id);
  if (!template) {
    const suggestions = suggestTemplates(id);
    throw new SpecError(404, 'unknown_template', `No template "${id}".${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ''}`, {
      suggestions,
    });
  }

  for (const k of Object.keys(input)) {
    if (!['template', 'params', 'title', 'labels', 'hidden', 'colors', 'dashed', 'offsets', 'annotations', 'style', 'format', 'embedFonts'].includes(k)) {
      warnings.push(`Ignored unknown field "${k}".`);
    }
  }

  // params
  const params = defaultParams(template);
  if (input.params !== undefined) {
    if (!isObj(input.params)) throw new SpecError(400, 'invalid_params', '"params" must be an object of { paramKey: value }.');
    for (const [k, raw] of Object.entries(input.params)) {
      const c = template.controls.find((x) => x.key === k);
      if (!c) {
        warnings.push(`Ignored unknown param "${k}". Valid params: ${template.controls.map((x) => x.key).join(', ') || '(none)'}.`);
        continue;
      }
      const v = coerceParam(c, raw, warnings);
      if (v !== undefined) params[k] = v;
    }
  }

  const scene = template.build(params);
  const known = knownKeys(scene);
  const single = scene.panels.length === 1 ? scene.panels[0].id : null;
  const overrides: Overrides = {};
  const ov = (key: string) => (overrides[key] ??= {});
  /** Accept "d" as shorthand for "main.d" in single-panel diagrams. */
  const resolve = (key: string, kind: 'labels' | 'elements', field: string): string | null => {
    const pool = kind === 'labels' ? known.labels : known.elements;
    const raw = key.trim();
    const k = !pool.has(raw) && single && !raw.includes('.') ? `${single}.${raw}` : raw;
    if (pool.has(k) || k.includes(`.${EXTRA_PREFIX}`)) return k;
    const sample = [...pool].slice(0, 30).join(', ');
    warnings.push(`${field}: unknown key "${key}". Valid keys for these params: ${sample}${pool.size > 30 ? ', …' : ''}.`);
    return null;
  };

  if (input.labels !== undefined) {
    if (!isObj(input.labels)) throw new SpecError(400, 'invalid_labels', '"labels" must be an object of { labelKey: "new text" }.');
    for (const [k, v] of Object.entries(input.labels)) {
      const key = resolve(k, 'labels', 'labels');
      if (key) ov(key).label = text(v, `labels.${k}`, warnings);
    }
  }
  if (input.hidden !== undefined) {
    if (!Array.isArray(input.hidden)) throw new SpecError(400, 'invalid_hidden', '"hidden" must be an array of keys.');
    for (const k of input.hidden) {
      const key = resolve(String(k), 'elements', 'hidden');
      if (key) ov(key).hidden = true;
    }
  }
  if (input.colors !== undefined) {
    if (!isObj(input.colors)) throw new SpecError(400, 'invalid_colors', '"colors" must be an object of { elementKey: "#rrggbb" }.');
    for (const [k, v] of Object.entries(input.colors)) {
      if (typeof v !== 'string' || !COLOR_RE.test(v)) {
        warnings.push(`colors.${k}: "${String(v)}" is not a colour like "#2a78d6" or "black"; ignored.`);
        continue;
      }
      const key = resolve(k, 'elements', 'colors');
      if (key) ov(key).color = v;
    }
  }
  if (input.dashed !== undefined) {
    if (!isObj(input.dashed)) throw new SpecError(400, 'invalid_dashed', '"dashed" must be an object of { elementKey: true }.');
    for (const [k, v] of Object.entries(input.dashed)) {
      const key = resolve(k, 'elements', 'dashed');
      if (key) ov(key).dash = v === true;
    }
  }
  if (input.offsets !== undefined) {
    if (!isObj(input.offsets)) throw new SpecError(400, 'invalid_offsets', '"offsets" must be an object of { labelKey: [dx, dy] } in pixels.');
    for (const [k, v] of Object.entries(input.offsets)) {
      const key = resolve(k, 'labels', 'offsets');
      if (!key) continue;
      const [dx, dy] = xy(v, `offsets.${k}`);
      ov(key).dx = Math.max(-400, Math.min(400, dx));
      ov(key).dy = Math.max(-400, Math.min(400, dy));
    }
  }

  // annotations → editor "extras"
  const extras: Extra[] = [];
  if (input.annotations !== undefined) {
    if (!Array.isArray(input.annotations)) throw new SpecError(400, 'invalid_annotations', '"annotations" must be an array.');
    if (input.annotations.length > LIMITS.annotations) {
      throw new SpecError(400, 'too_many_annotations', `At most ${LIMITS.annotations} annotations are allowed.`);
    }
    input.annotations.forEach((a, i) => {
      const field = `annotations[${i}]`;
      if (!isObj(a)) throw new SpecError(400, 'invalid_annotation', `${field} must be an object with a "kind".`);
      const panelIds = scene.panels.map((p) => p.id);
      const panel = a.panel === undefined ? panelIds[0] : String(a.panel);
      if (!panelIds.includes(panel)) {
        throw new SpecError(400, 'invalid_annotation', `${field}.panel "${panel}" does not exist. Panels: ${panelIds.join(', ')}.`);
      }
      const id = `a${i + 1}`;
      const key = `${panel}.${EXTRA_PREFIX}${id}`;
      const points = (min: number) => {
        if (!Array.isArray(a.points) || a.points.length < min) {
          throw new SpecError(400, 'invalid_annotation', `${field}.points needs at least ${min} [x, y] pairs.`);
        }
        return a.points.slice(0, 50).map((p, j) => xy(p, `${field}.points[${j}]`));
      };
      switch (a.kind) {
        case 'text':
          extras.push({ kind: 'text', id, panel, at: xy(a.at, `${field}.at`), text: text(a.text, `${field}.text`, warnings) });
          break;
        case 'arrow':
          extras.push({
            kind: 'arrow',
            id,
            panel,
            from: xy(a.from, `${field}.from`),
            to: xy(a.to, `${field}.to`),
            label: a.label === undefined ? undefined : text(a.label, `${field}.label`, warnings),
          });
          break;
        case 'line':
        case 'curve': {
          const role = a.role === undefined ? undefined : (String(a.role) as CurveRole);
          if (role && !CURVE_ROLES.includes(role)) warnings.push(`${field}.role must be one of ${CURVE_ROLES.join(', ')}; ignored.`);
          extras.push({
            kind: 'curve',
            id,
            panel,
            points: points(2),
            label: a.label === undefined ? undefined : text(a.label, `${field}.label`, warnings),
            role: role && CURVE_ROLES.includes(role) ? role : undefined,
          });
          if (a.dashed === true) ov(key).dash = true;
          break;
        }
        case 'point':
          extras.push({
            kind: 'point',
            id,
            panel,
            at: xy(a.at, `${field}.at`),
            label: a.label === undefined ? undefined : text(a.label, `${field}.label`, warnings),
            xLabel: a.xLabel === undefined ? undefined : text(a.xLabel, `${field}.xLabel`, warnings),
            yLabel: a.yLabel === undefined ? undefined : text(a.yLabel, `${field}.yLabel`, warnings),
          });
          break;
        case 'area':
        case 'shading': {
          const role = (a.role === undefined ? 'neutral' : String(a.role)) as AreaRole;
          if (!AREA_ROLES.includes(role)) {
            throw new SpecError(400, 'invalid_annotation', `${field}.role must be one of: ${AREA_ROLES.join(', ')}.`);
          }
          extras.push({
            kind: 'area',
            id,
            panel,
            points: points(3),
            role,
            label: a.label === undefined ? undefined : text(a.label, `${field}.label`, warnings),
          });
          break;
        }
        default:
          throw new SpecError(400, 'invalid_annotation', `${field}.kind must be one of: text, arrow, line, curve, point, area.`);
      }
      if (typeof a.color === 'string') {
        if (COLOR_RE.test(a.color)) ov(key).color = a.color;
        else warnings.push(`${field}.color "${a.color}" is not a valid colour; ignored.`);
      }
    });
  }

  // style
  const style: GraphStyle = { ...DEFAULT_STYLE };
  if (input.style !== undefined) {
    if (!isObj(input.style)) throw new SpecError(400, 'invalid_style', '"style" must be an object.');
    for (const [k, v] of Object.entries(input.style)) {
      const key = k as keyof GraphStyle;
      if (STYLE_ENUMS[key]) {
        if (STYLE_ENUMS[key]!.includes(String(v))) (style as unknown as Record<string, unknown>)[key] = String(v);
        else warnings.push(`style.${k} must be one of: ${STYLE_ENUMS[key]!.join(', ')}; ignored.`);
      } else if (STYLE_RANGES[key]) {
        const n = Number(v);
        const [lo, hi] = STYLE_RANGES[key]!;
        if (Number.isFinite(n)) (style as unknown as Record<string, unknown>)[key] = Math.min(hi, Math.max(lo, n));
        else warnings.push(`style.${k} must be a number between ${lo} and ${hi}; ignored.`);
      } else if (STYLE_BOOLS.includes(key)) {
        (style as unknown as Record<string, unknown>)[key] = v === true || v === 'true';
      } else {
        warnings.push(`Ignored unknown style option "${k}".`);
      }
    }
  }

  const title = input.title === undefined ? (template.caption ?? template.name) : text(input.title, 'title', warnings);
  // An explicit title is shown unless the caller set style.showTitle themselves.
  if (input.title !== undefined && !(isObj(input.style) && 'showTitle' in input.style)) style.showTitle = true;

  return {
    template,
    doc: { v: 1, templateId: template.id, params, overrides, extras, title },
    style,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Rendering

export interface Rendered {
  svg: string;
  width: number;
  height: number;
  stats?: Stat[];
  /** The label keys in this render and their current text (after overrides). */
  labels: { key: string; text: string; hint: string; panel: string }[];
}

export function renderPrepared(p: Prepared, opts: { fontCss?: string } = {}): Rendered {
  const base = p.template.build(p.doc.params);
  const scene = withExtras(base, p.doc.extras, null);
  const L = layoutScene(scene, p.style, p.doc.overrides, p.doc.title);
  let markup = renderToStaticMarkup(
    createElement(GraphSVG, {
      scene,
      style: p.style,
      overrides: p.doc.overrides,
      title: p.doc.title,
      ariaLabel: p.doc.title || p.template.name,
    }),
  );
  markup = markup.replace(' style="overflow:visible"', '');
  if (opts.fontCss) markup = markup.replace(/^(<svg[^>]*>)/, `$1<style>${opts.fontCss}</style>`);
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`,
    width: Math.ceil(L.width),
    height: Math.ceil(L.height),
    stats: base.stats,
    labels: collectLabels(base).map((l) => ({
      key: l.key,
      text: p.doc.overrides[l.key]?.label ?? l.text,
      hint: l.hint,
      panel: l.panelId,
    })),
  };
}

// ---------------------------------------------------------------------------
// URLs

/** Opens the graph in the editor, fully editable (same format as share links). */
export function editUrl(origin: string, p: Prepared): string {
  const payload = compressToEncodedURIComponent(JSON.stringify({ doc: p.doc, style: p.style }));
  return `${origin}/graph/${p.template.id}/#g=${payload}`;
}

/** A GET URL that re-renders this exact spec (embeddable as an image). */
export function specUrl(origin: string, spec: unknown, ext: 'svg' | 'json' = 'svg'): string {
  return `${origin}/api/v1/render.${ext}?spec=${compressToEncodedURIComponent(JSON.stringify(spec))}`;
}

/** Decode a `spec` query value: raw JSON, lz-string (as produced by specUrl), or base64url JSON. */
export function decodeSpecParam(value: string): unknown {
  const v = value.trim();
  if (v.startsWith('{')) return JSON.parse(v);
  const lz = decompressFromEncodedURIComponent(v);
  if (lz && lz.trim().startsWith('{')) return JSON.parse(lz);
  try {
    const b64 = v.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    if (json.trim().startsWith('{')) return JSON.parse(json);
  } catch {
    /* fall through */
  }
  throw new SpecError(400, 'invalid_spec_param', 'Could not decode "spec": send URL-encoded JSON, base64url JSON, or the value from a specUrl.');
}

/**
 * Query-string form: /api/v1/render/{template}.svg?param=value&style.palette=mono&label.d=D_1&title=…&hide=a,b
 */
export function specFromQuery(templateId: string, q: URLSearchParams): GraphSpec {
  const spec: GraphSpec & Record<string, unknown> = { template: templateId };
  const params: Record<string, unknown> = {};
  const style: Record<string, unknown> = {};
  const labels: Record<string, string> = {};
  for (const [k, v] of q) {
    if (k === 'title') spec.title = v;
    else if (k === 'hide' || k === 'hidden') spec.hidden = [...(spec.hidden ?? []), ...v.split(',').map((s) => s.trim()).filter(Boolean)];
    else if (k === 'embedFonts' || k === 'fonts') spec.embedFonts = v === 'true' || v === 'embed' || v === '1';
    else if (k.startsWith('style.')) style[k.slice(6)] = v;
    else if (k.startsWith('label.')) labels[k.slice(6)] = v;
    else if (k === 'spec' || k === 'format') continue;
    else params[k] = v;
  }
  if (Object.keys(params).length) spec.params = params;
  if (Object.keys(style).length) spec.style = style as Partial<GraphStyle>;
  if (Object.keys(labels).length) spec.labels = labels;
  return spec;
}
