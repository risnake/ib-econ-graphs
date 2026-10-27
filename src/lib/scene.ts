import type { El, Extra, Panel, Scene, Vec } from '~/engine/types';
import * as G from '~/engine/geometry';
import { axisKey, elKey } from '~/engine/GraphSVG';

export interface LabelEntry {
  key: string;
  panelId: string;
  panelTitle?: string;
  /** What the label belongs to, for the inspector. */
  hint: string;
  text: string;
}

const KIND_HINT: Record<El['kind'], string> = {
  curve: 'Curve',
  point: 'Point',
  area: 'Shaded area',
  line: 'Arrow / line',
  text: 'Text',
  tick: 'Axis mark',
};

/** Every editable piece of text in a scene, in reading order. */
export function collectLabels(scene: Scene): LabelEntry[] {
  const out: LabelEntry[] = [];
  for (const panel of scene.panels) {
    const base = { panelId: panel.id, panelTitle: panel.title };
    if (panel.title) out.push({ ...base, key: axisKey(panel.id, 'title'), hint: 'Panel title', text: panel.title });
    out.push({ ...base, key: axisKey(panel.id, 'y'), hint: 'Vertical axis', text: panel.yLabel });
    out.push({ ...base, key: axisKey(panel.id, 'x'), hint: 'Horizontal axis', text: panel.xLabel });
    for (const el of panel.elements) {
      const key = elKey(panel.id, el.id);
      switch (el.kind) {
        case 'curve':
        case 'area':
        case 'line':
          if (el.label) out.push({ ...base, key, hint: KIND_HINT[el.kind], text: el.label });
          break;
        case 'point':
          if (el.label) out.push({ ...base, key, hint: 'Point', text: el.label });
          if (el.yLabel) out.push({ ...base, key: elKey(panel.id, el.id, 'y'), hint: 'Vertical-axis value', text: el.yLabel });
          if (el.xLabel) out.push({ ...base, key: elKey(panel.id, el.id, 'x'), hint: 'Horizontal-axis value', text: el.xLabel });
          break;
        case 'text':
          if (!el.id.startsWith('extra-')) out.push({ ...base, key, hint: 'Text', text: el.text });
          break;
        case 'tick':
          out.push({ ...base, key, hint: 'Axis mark', text: el.label });
          break;
      }
    }
  }
  return out;
}

export const EXTRA_PREFIX = 'extra-';

/** Curve through the user's control points: straight for 2, smooth (Catmull–Rom) for 3+. */
export function extraCurvePoints(points: Vec[]): Vec[] {
  if (points.length < 3) return points;
  const xs = points.map((p) => p[0]);
  const monotone = xs.every((x, i) => i === 0 || x > xs[i - 1]);
  return monotone ? G.spline(points, 30) : G.catmull(points, 30);
}

/**
 * Layer the user's drawn elements onto the template scene. Handles for an
 * element are only shown while it is selected (arrows always show theirs).
 */
export function withExtras(scene: Scene, extras: Extra[], selectedKey?: string | null): Scene {
  if (!extras.length) return scene;
  const panels: Panel[] = scene.panels.map((p) => ({ ...p, elements: [...p.elements], handles: [...(p.handles ?? [])] }));
  for (const x of extras) {
    const panel = panels.find((p) => p.id === x.panel) ?? panels[0];
    const id = `${EXTRA_PREFIX}${x.id}`;
    const selected = selectedKey?.startsWith(`${panel.id}.${id}`) ?? false;
    const handle = (part: string, at: Vec, hint: string) =>
      panel.handles!.push({ id: `extra:${x.id}:${part}`, at, axis: 'xy', apply: () => ({}), hint });
    switch (x.kind) {
      case 'text':
        panel.elements.push({ kind: 'text', id, at: x.at, text: x.text, size: 0.95 });
        if (selected) handle('at', x.at, 'Drag to move');
        break;
      case 'arrow':
        panel.elements.push({ kind: 'line', id, from: x.from, to: x.to, variant: 'shift', label: x.label });
        handle('from', x.from, 'Drag to move the arrow tail');
        handle('to', x.to, 'Drag to move the arrow head');
        break;
      case 'curve':
        panel.elements.push({
          kind: 'curve',
          id,
          points: extraCurvePoints(x.points),
          label: x.label,
          role: x.role ?? 'neutral',
        });
        if (selected) x.points.forEach((p, i) => handle(String(i), p, 'Drag to reshape'));
        break;
      case 'point':
        panel.elements.push({ kind: 'point', id, at: x.at, label: x.label, labelDir: 'ne', xLabel: x.xLabel, yLabel: x.yLabel });
        if (selected) handle('at', x.at, 'Drag to move — snaps to intersections');
        break;
      case 'area':
        // drawn first so it sits beneath the curves
        panel.elements.unshift({ kind: 'area', id, polygon: x.points, role: x.role, label: x.label });
        if (selected) x.points.forEach((p, i) => handle(String(i), p, 'Drag to reshape — snaps to intersections'));
        break;
    }
  }
  return { ...scene, panels };
}

/** Points worth snapping to in a panel: intersections between curves, and point elements. */
export function snapTargets(panel: Panel, ignoreId?: string): Vec[] {
  const curves = panel.elements.filter(
    (e): e is Extract<El, { kind: 'curve' }> => e.kind === 'curve' && e.id !== ignoreId,
  );
  const out: Vec[] = [];
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) out.push(...G.intersections(curves[i].points, curves[j].points));
  }
  for (const e of panel.elements) if (e.kind === 'point' && e.id !== ignoreId) out.push(e.at);
  return out;
}

export function snap(p: Vec, targets: Vec[], panel: Panel): Vec {
  const rx = (panel.xMax - (panel.xMin ?? 0)) * 0.025;
  const ry = (panel.yMax - (panel.yMin ?? 0)) * 0.025;
  let best: Vec | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const dx = Math.abs(t[0] - p[0]) / rx;
    const dy = Math.abs(t[1] - p[1]) / ry;
    if (dx <= 1 && dy <= 1 && dx + dy < bestD) {
      best = t;
      bestD = dx + dy;
    }
  }
  return best ?? p;
}

export interface Found {
  panel: Panel;
  el?: El;
  part?: string;
  /** Extra annotation id if the selection is a user annotation. */
  extraId?: string;
}

/** Resolve an override key back to its element. */
export function findByKey(scene: Scene, key: string): Found | null {
  const axis = key.match(/^([^.:]+):(x|y|title|origin)$/);
  if (axis) {
    const panel = scene.panels.find((p) => p.id === axis[1]);
    return panel ? { panel, part: axis[2] } : null;
  }
  const m = key.match(/^([^.]+)\.([^:]+)(?::(.+))?$/);
  if (!m) return null;
  const panel = scene.panels.find((p) => p.id === m[1]);
  if (!panel) return null;
  const el = panel.elements.find((e) => e.id === m[2]);
  if (!el) return null;
  const extraId = el.id.startsWith(EXTRA_PREFIX) ? el.id.slice(EXTRA_PREFIX.length) : undefined;
  return { panel, el, part: m[3], extraId };
}

/** Default text for a key (before overrides). */
export function defaultLabel(scene: Scene, key: string): string {
  const f = findByKey(scene, key);
  if (!f) return '';
  if (!f.el) {
    if (f.part === 'x') return f.panel.xLabel;
    if (f.part === 'y') return f.panel.yLabel;
    if (f.part === 'title') return f.panel.title ?? '';
    return f.panel.origin === false ? '' : (f.panel.origin ?? '0');
  }
  const el = f.el;
  if (el.kind === 'point') return f.part === 'x' ? (el.xLabel ?? '') : f.part === 'y' ? (el.yLabel ?? '') : (el.label ?? '');
  if (el.kind === 'text') return el.text;
  if (el.kind === 'tick') return el.label;
  return el.label ?? '';
}
