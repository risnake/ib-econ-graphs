import { useId, useRef, type ReactNode, type Ref } from 'react';
import type {
  AreaEl,
  CurveEl,
  Dir,
  El,
  GraphStyle,
  Handle,
  LineEl,
  Overrides,
  Panel,
  Scene,
  Vec,
} from './types';
import { clipPolygon, clipPolyline, isFiniteVec, polygonCentroid, type Box } from './geometry';
import { areaColor, curveColor, FONT_STACK, HATCH, INK, INK_SOFT, MUTED } from './theme';
import { measureRich, parseRich, SUB_SCALE } from './richtext';

// ---------------------------------------------------------------------------
// Public API

export interface Interaction {
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /** Label dragged to a new offset (px). `done` is true on release. */
  onLabelDrag?: (key: string, dx: number, dy: number, done: boolean) => void;
  /** A handle was dragged to `pos` (data coords of its panel). `done` on release. */
  onHandleDrag?: (handle: Handle, pos: Vec, done: boolean) => void;
}

export interface GraphSVGProps {
  scene: Scene;
  style: GraphStyle;
  overrides?: Overrides;
  title?: string;
  interaction?: Interaction;
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
  /** Accessible description. */
  ariaLabel?: string;
}

/** Stable override key for an element (or one of its parts). */
export const elKey = (panelId: string, elId: string, part?: string) =>
  `${panelId}.${elId}${part ? `:${part}` : ''}`;
export const axisKey = (panelId: string, axis: 'x' | 'y' | 'title' | 'origin') => `${panelId}:${axis}`;

// ---------------------------------------------------------------------------
// Layout

const DEFAULT_W = 460;
const DEFAULT_H = 380;
const PANEL_GAP = 36;

interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface PanelLayout {
  panel: Panel;
  x: number;
  y: number;
  w: number;
  h: number;
  m: Margins;
  boxW: number;
  boxH: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  px: (x: number) => number;
  py: (y: number) => number;
  inv: (px: number, py: number) => Vec;
  dataBox: Box;
}

export interface LegendItem {
  key: string;
  role: AreaEl['role'];
  text: string;
  color?: string;
}

export interface SceneLayout {
  width: number;
  height: number;
  fs: number;
  panels: PanelLayout[];
  titleH: number;
  legend: { items: LegendItem[]; y: number; rows: { x: number; item: LegendItem }[][] };
}

function labelText(ov: Overrides | undefined, key: string, fallback: string | undefined): string {
  const o = ov?.[key];
  if (o?.label !== undefined) return o.label;
  return fallback ?? '';
}

export function layoutScene(
  scene: Scene,
  style: GraphStyle,
  overrides: Overrides | undefined,
  title: string | undefined,
): SceneLayout {
  const fs = 15 * style.fontScale;
  const center = style.axisLabels === 'center';
  const titleH = style.showTitle && title ? fs * 2.6 : 0;
  const layout = scene.layout ?? 'row';

  const panels: PanelLayout[] = [];
  let cursorX = 0;
  let cursorY = titleH;
  for (const panel of scene.panels) {
    const w = panel.width ?? DEFAULT_W;
    const h = panel.height ?? DEFAULT_H;
    // left margin sized to the widest y-side label
    let yLabelW = fs * 1.2;
    for (const el of panel.elements) {
      let t: string | undefined;
      if (el.kind === 'point' && el.yLabel) t = labelText(overrides, elKey(panel.id, el.id, 'y'), el.yLabel);
      if (el.kind === 'tick' && el.axis === 'y') t = labelText(overrides, elKey(panel.id, el.id), el.label);
      if (t) yLabelW = Math.max(yLabelW, measureRich(t, fs).width);
    }
    for (const t of panel.yTicks ?? []) yLabelW = Math.max(yLabelW, measureRich(t.label, fs * 0.85).width);
    const m: Margins = {
      l: Math.max(fs * 2.4, yLabelW + fs * 0.9) + (center ? fs * 1.7 : 0),
      r: fs * 3.6,
      t: (center ? fs * 1.1 : fs * 2.3) + (panel.title ? fs * 1.9 : 0),
      b: fs * 3.4,
    };
    const xMin = panel.xMin ?? 0;
    const yMin = panel.yMin ?? 0;
    const xMax = panel.xMax;
    const yMax = panel.yMax;
    const px = (x: number) => m.l + ((x - xMin) / (xMax - xMin)) * w;
    m.r = Math.max(m.r, rightOverflow(panel, overrides, px, m.l + w, fs, { x0: xMin, y0: yMin, x1: xMax, y1: yMax }) + fs * 0.6);
    const py = (y: number) => m.t + h - ((y - yMin) / (yMax - yMin)) * h;
    const inv = (X: number, Y: number): Vec => [
      xMin + ((X - m.l) / w) * (xMax - xMin),
      yMin + ((m.t + h - Y) / h) * (yMax - yMin),
    ];
    const pl: PanelLayout = {
      panel,
      x: cursorX,
      y: cursorY,
      w,
      h,
      m,
      boxW: w + m.l + m.r,
      boxH: h + m.t + m.b,
      xMin,
      xMax,
      yMin,
      yMax,
      px,
      py,
      inv,
      dataBox: { x0: xMin, y0: yMin, x1: xMax, y1: yMax },
    };
    panels.push(pl);
    if (layout === 'row') cursorX += pl.boxW + PANEL_GAP;
    else cursorY += pl.boxH + PANEL_GAP * 0.5;
  }
  // align panel heights in a row (bottom-align plots of different heights)
  let width: number;
  let height: number;
  if (layout === 'row') {
    const maxBox = Math.max(...panels.map((p) => p.boxH));
    for (const p of panels) {
      const extra = maxBox - p.boxH;
      p.y += extra;
    }
    width = panels.reduce((s, p) => s + p.boxW, 0) + PANEL_GAP * (panels.length - 1);
    height = titleH + maxBox;
  } else {
    width = Math.max(...panels.map((p) => p.boxW));
    for (const p of panels) p.x = (width - p.boxW) / 2;
    height = cursorY - PANEL_GAP * 0.5;
  }

  // legend
  const items: LegendItem[] = [];
  // Areas labelled with bare letters (a, b, c…) always get a key, even in "inside" mode.
  const lettered = (pl: PanelLayout, el: AreaEl) =>
    !!el.legend && /^[A-Za-z][0-9′']?$/.test((overrides?.[elKey(pl.panel.id, el.id)]?.label ?? el.label ?? '').trim());
  const autoKey =
    style.areaLabels === 'inside' &&
    panels.some((pl) => pl.panel.elements.some((el) => el.kind === 'area' && lettered(pl, el)));
  if (style.areaLabels === 'legend' || style.areaLabels === 'both' || autoKey) {
    const seen = new Set<string>();
    for (const pl of panels) {
      for (const el of pl.panel.elements) {
        if (el.kind !== 'area') continue;
        if (autoKey && !lettered(pl, el)) continue;
        const key = elKey(pl.panel.id, el.id);
        if (overrides?.[key]?.hidden) continue;
        const text = overrides?.[key]?.legend ?? el.legend ?? overrides?.[key]?.label ?? el.label;
        if (!text) continue;
        const sig = `${el.role}|${text}|${overrides?.[key]?.color ?? ''}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        items.push({ key, role: el.role, text, color: overrides?.[key]?.color });
      }
    }
  }
  const rows: { x: number; item: LegendItem }[][] = [];
  const legendY = height + fs * 0.6;
  if (items.length) {
    const sw = fs * 0.95;
    const gap = fs * 1.4;
    let row: { x: number; item: LegendItem }[] = [];
    let x = 0;
    const maxW = width - fs * 2;
    for (const item of items) {
      const iw = sw + fs * 0.45 + measureRich(item.text, fs * 0.85).width;
      if (row.length && x + iw > maxW) {
        rows.push(row);
        row = [];
        x = 0;
      }
      row.push({ x, item });
      x += iw + gap;
    }
    rows.push(row);
    height = legendY + rows.length * fs * 1.6 + fs * 0.4;
  }

  return { width, height, fs, panels, titleH, legend: { items, y: legendY, rows } };
}

/**
 * How far (px) labels at the right-hand ends of curves, and labels placed to the
 * right of points, reach past the plot's right edge — so the margin can grow to fit.
 */
function rightOverflow(
  panel: Panel,
  overrides: Overrides | undefined,
  px: (x: number) => number,
  plotRight: number,
  fs: number,
  box: Box,
): number {
  let over = 0;
  for (const el of panel.elements) {
    const o = overrides?.[elKey(panel.id, el.id)];
    if (o?.hidden) continue;
    if (el.kind === 'curve') {
      const text = labelText(overrides, elKey(panel.id, el.id), el.label);
      if (!text || el.labelAt !== undefined && el.labelAt !== 'end') continue;
      const runs = clipPolyline(el.points.filter(isFiniteVec), box);
      const last = runs[runs.length - 1];
      if (!last) continue;
      const end = last[last.length - 1];
      const prev = last[Math.max(0, last.length - 2)];
      const goingRight = end[0] >= prev[0] - 1e-9;
      const width = measureRich(text, fs).width;
      const reach = px(end[0]) + (o?.dx ?? 0) + (goingRight ? fs * 0.45 + width : width / 2);
      over = Math.max(over, reach - plotRight);
    } else if (el.kind === 'point' && el.label) {
      const dir = el.labelDir ?? 'e';
      if (dir !== 'e' && dir !== 'ne' && dir !== 'se') continue;
      const text = labelText(overrides, elKey(panel.id, el.id), el.label);
      const reach = px(el.at[0]) + fs * 0.55 + measureRich(text, fs).width + (o?.dx ?? 0);
      over = Math.max(over, reach - plotRight);
    }
  }
  return over;
}

// ---------------------------------------------------------------------------
// Label collision (1D spreading along an axis)

interface AxisLabel {
  key: string;
  text: string;
  pos: number; // px along the axis
  size: number; // extent along the axis
  /** perpendicular position */
  other: number;
}

function spread(labels: AxisLabel[], gap: number) {
  const sorted = labels.slice().sort((a, b) => a.pos - b.pos);
  type Cluster = { items: AxisLabel[]; desired: number[] };
  let clusters: Cluster[] = sorted.map((l) => ({ items: [l], desired: [l.pos] }));
  const extent = (c: Cluster) => c.items.reduce((s, l) => s + l.size, 0) + gap * (c.items.length - 1);
  const place = (c: Cluster) => {
    const total = extent(c);
    const centre = c.desired.reduce((s, d) => s + d, 0) / c.desired.length;
    let p = centre - total / 2;
    for (const l of c.items) {
      l.pos = p + l.size / 2;
      p += l.size + gap;
    }
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    clusters.forEach(place);
    const merged: Cluster[] = [];
    for (const c of clusters) {
      const prev = merged[merged.length - 1];
      if (prev) {
        const a = prev.items[prev.items.length - 1];
        const b = c.items[0];
        if (b.pos - b.size / 2 < a.pos + a.size / 2 + gap - 0.01) {
          prev.items.push(...c.items);
          prev.desired.push(...c.desired);
          changed = true;
          continue;
        }
      }
      merged.push(c);
    }
    clusters = merged;
  }
  clusters.forEach(place);
}

// ---------------------------------------------------------------------------
// Rendering helpers

type Pt = [number, number];

const pathD = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('');

function arrowHead(tip: Pt, dir: Pt, len: number): string {
  const [ux, uy] = dir;
  const nx = -uy;
  const ny = ux;
  const w = len * 0.42;
  const b1: Pt = [tip[0] - ux * len + nx * w, tip[1] - uy * len + ny * w];
  const notch: Pt = [tip[0] - ux * len * 0.72, tip[1] - uy * len * 0.72];
  const b2: Pt = [tip[0] - ux * len - nx * w, tip[1] - uy * len - ny * w];
  return [tip, b1, notch, b2].map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

/** Colour `hex` at `opacity` over white, as an opaque hex (for halos on shaded areas). */
function blend(hex: string, opacity: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return '#ffffff';
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * opacity + 255 * (1 - opacity));
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const unit = (dx: number, dy: number): Pt => {
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
};

interface LabelSpec {
  key: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  size?: number;
  weight?: number;
  italic?: boolean;
  fill?: string;
  /**
   * Vertical alignment of (x,y): first-line baseline (default), middle of the
   * text block, or last-line baseline (multi-line labels that sit above an anchor).
   */
  valign?: 'baseline' | 'middle' | 'bottom';
  draggable?: boolean;
  /** rotate around (x,y), degrees */
  rotate?: number;
  /** Halo colour override (labels on shaded areas use the blended fill colour). */
  halo?: string | null;
}

function dirOffset(dir: Dir, fs: number, d = fs * 0.55): { dx: number; dy: number; anchor: LabelSpec['anchor'] } {
  const k = d * 0.75;
  switch (dir) {
    case 'n':
      return { dx: 0, dy: -d, anchor: 'middle' };
    case 's':
      return { dx: 0, dy: d + fs * 0.75, anchor: 'middle' };
    case 'e':
      return { dx: d, dy: fs * 0.35, anchor: 'start' };
    case 'w':
      return { dx: -d, dy: fs * 0.35, anchor: 'end' };
    case 'ne':
      return { dx: k, dy: -k, anchor: 'start' };
    case 'nw':
      return { dx: -k, dy: -k, anchor: 'end' };
    case 'se':
      return { dx: k, dy: k + fs * 0.7, anchor: 'start' };
    case 'sw':
      return { dx: -k, dy: k + fs * 0.7, anchor: 'end' };
    case 'c':
    default:
      return { dx: 0, dy: fs * 0.35, anchor: 'middle' };
  }
}

function RichText({
  spec,
  fs,
  halo,
  selected,
  onPointerDown,
}: {
  spec: LabelSpec;
  fs: number;
  halo: string | null;
  selected: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGTextElement>) => void;
}) {
  const size = fs * (spec.size ?? 1);
  const lines = parseRich(spec.text);
  const lh = size * 1.18;
  let y = spec.y;
  if (spec.valign === 'middle') y = spec.y + size * 0.35 - ((lines.length - 1) * lh) / 2;
  else if (spec.valign === 'bottom') y = spec.y - (lines.length - 1) * lh;
  const children: ReactNode[] = [];
  let shift = 0;
  lines.forEach((line, li) => {
    if (line.length === 0 && li > 0) {
      children.push(
        <tspan key={`${li}-e`} x={spec.x} dy={lh - shift}>
          {'​'}
        </tspan>,
      );
      shift = 0;
      return;
    }
    line.forEach((run, ri) => {
      const target = run.sub ? size * 0.3 : run.sup ? -size * 0.4 : 0;
      let dy = target - shift;
      const newLine = ri === 0 && li > 0;
      if (newLine) dy += lh;
      shift = target;
      children.push(
        <tspan
          key={`${li}-${ri}`}
          x={newLine ? spec.x : undefined}
          dy={Math.abs(dy) > 1e-6 ? Number(dy.toFixed(2)) : undefined}
          fontSize={run.sub || run.sup ? Number((size * SUB_SCALE).toFixed(2)) : undefined}
        >
          {run.text}
        </tspan>,
      );
    });
  });
  const m = selected ? measureRich(spec.text, size) : null;
  const boxX = m
    ? spec.anchor === 'start'
      ? spec.x
      : spec.anchor === 'end'
        ? spec.x - m.width
        : spec.x - m.width / 2
    : 0;
  return (
    <g transform={spec.rotate ? `rotate(${spec.rotate} ${spec.x} ${spec.y})` : undefined}>
      {m && (
        <rect
          data-ui="1"
          x={boxX - 4}
          y={y - size * 0.95}
          width={m.width + 8}
          height={size * 1.3 + (m.lines - 1) * lh}
          rx={4}
          fill="rgba(42,120,214,0.10)"
          stroke="#2a78d6"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
      <text
        x={spec.x}
        y={y}
        fontSize={Number(size.toFixed(2))}
        textAnchor={spec.anchor}
        fontWeight={spec.weight}
        fontStyle={spec.italic ? 'italic' : undefined}
        fill={spec.fill ?? INK}
        stroke={halo ?? undefined}
        strokeWidth={halo ? Number((size * 0.26).toFixed(2)) : undefined}
        strokeLinejoin={halo ? 'round' : undefined}
        paintOrder={halo ? 'stroke' : undefined}
        data-key={spec.key}
        data-halo={halo ? '1' : undefined}
        style={onPointerDown ? { cursor: 'move', userSelect: 'none' } : undefined}
        onPointerDown={onPointerDown}
      >
        {children}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component

export function GraphSVG({
  scene,
  style,
  overrides,
  title,
  interaction,
  svgRef,
  className,
  ariaLabel,
}: GraphSVGProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const L = layoutScene(scene, style, overrides, title);
  const { fs } = L;
  const sw = style.strokeScale;
  const halo = style.background === 'white' ? '#ffffff' : null;
  const ov = (key: string) => overrides?.[key];
  const interactive = !!interaction;
  const sel = interaction?.selectedKey ?? null;
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    dx0: number;
    dy0: number;
    scale: number;
    moved: boolean;
  } | null>(null);

  // --- pointer plumbing ---------------------------------------------------
  const svgScale = (el: SVGElement) => {
    const svg = el.ownerSVGElement ?? (el as SVGSVGElement);
    const ctm = svg.getScreenCTM();
    return ctm ? ctm.a : 1;
  };

  const startLabelDrag = (key: string) => (e: React.PointerEvent<SVGElement>) => {
    if (!interaction) return;
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const o = ov(key);
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      dx0: o?.dx ?? 0,
      dy0: o?.dy ?? 0,
      scale: svgScale(target),
      moved: false,
    };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const ddx = (ev.clientX - d.startX) / d.scale;
      const ddy = (ev.clientY - d.startY) / d.scale;
      if (!d.moved && Math.hypot(ddx, ddy) < 2) return;
      d.moved = true;
      interaction.onLabelDrag?.(d.key, d.dx0 + ddx, d.dy0 + ddy, false);
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      dragRef.current = null;
      if (!d) return;
      if (d.moved) {
        interaction.onLabelDrag?.(
          d.key,
          d.dx0 + (ev.clientX - d.startX) / d.scale,
          d.dy0 + (ev.clientY - d.startY) / d.scale,
          true,
        );
      }
      interaction.onSelect?.(d.key);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const startHandleDrag = (pl: PanelLayout, handle: Handle) => (e: React.PointerEvent<SVGElement>) => {
    if (!interaction) return;
    e.stopPropagation();
    const target = e.currentTarget;
    const svg = (target as SVGElement).ownerSVGElement;
    if (!svg) return;
    target.setPointerCapture(e.pointerId);
    const toData = (ev: PointerEvent | React.PointerEvent): Vec => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return handle.at;
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
      const v = pl.inv(p.x - pl.x, p.y - pl.y);
      return [
        handle.axis === 'y' ? handle.at[0] : v[0],
        handle.axis === 'x' ? handle.at[1] : v[1],
      ];
    };
    const move = (ev: PointerEvent) => interaction.onHandleDrag?.(handle, toData(ev), false);
    const up = (ev: PointerEvent) => {
      interaction.onHandleDrag?.(handle, toData(ev), true);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const select = (key: string) => (e: React.PointerEvent) => {
    if (!interaction) return;
    e.stopPropagation();
    interaction.onSelect?.(key);
  };

  // --- defs: hatch patterns (mono palette) ------------------------------
  const patternId = (role: AreaEl['role']) => `${uid}-h-${role}`;
  const usedRoles = new Set<AreaEl['role']>();
  if (style.palette === 'mono') {
    for (const pl of L.panels) for (const el of pl.panel.elements) if (el.kind === 'area') usedRoles.add(el.role);
    for (const it of L.legend.items) usedRoles.add(it.role);
  }
  const areaFill = (role: AreaEl['role'], color?: string) =>
    color ? color : style.palette === 'mono' ? `url(#${patternId(role)})` : areaColor(role, style.palette);
  const areaOpacity = (color?: string) => (style.palette === 'mono' && !color ? 1 : style.areaOpacity);

  // --- render a panel -----------------------------------------------------
  const renderPanel = (pl: PanelLayout) => {
    const { panel, px, py, m, w, h } = pl;
    const toPx = (p: Vec): Pt => [px(p[0]), py(p[1])];
    const fill: ReactNode[] = [];
    const guides: ReactNode[] = [];
    const curves: ReactNode[] = [];
    const lines: ReactNode[] = [];
    const dots: ReactNode[] = [];
    const ui: ReactNode[] = [];
    const labels: LabelSpec[] = [];
    const xAxisLabels: AxisLabel[] = [];
    const yAxisLabels: AxisLabel[] = [];

    const axisY = py(Math.max(pl.yMin, Math.min(0, pl.yMax)));
    const axisX = px(pl.xMin);
    const cw = 2.3 * sw; // curve width

    const visible = (el: El) => !ov(elKey(panel.id, el.id))?.hidden;

    for (const el of panel.elements) {
      if (!visible(el)) continue;
      const key = elKey(panel.id, el.id);
      const o = ov(key);
      switch (el.kind) {
        case 'area': {
          const poly = clipPolygon(el.polygon, pl.dataBox);
          if (poly.length < 3) break;
          const pts = poly.map(toPx);
          fill.push(
            <polygon
              key={key}
              points={pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
              fill={areaFill(el.role, o?.color)}
              fillOpacity={areaOpacity(o?.color)}
              stroke="none"
              onPointerDown={interactive ? select(key) : undefined}
              style={interactive ? { cursor: 'pointer' } : undefined}
            />,
          );
          if (sel === key) {
            ui.push(
              <polygon
                key={`${key}-sel`}
                data-ui="1"
                points={pts.map((p) => `${p[0]},${p[1]}`).join(' ')}
                fill="none"
                stroke="#2a78d6"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />,
            );
          }
          if ((style.areaLabels === 'inside' || style.areaLabels === 'both') && el.label) {
            const c = el.labelPos ? toPx(el.labelPos) : toPx(polygonCentroid(poly));
            labels.push({
              key,
              text: labelText(overrides, key, el.label),
              x: c[0] + (o?.dx ?? 0),
              y: c[1] + (o?.dy ?? 0),
              anchor: 'middle',
              valign: 'middle',
              size: 0.82,
              weight: 600,
              halo: halo && style.palette !== 'mono' ? blend(o?.color ?? areaColor(el.role, style.palette), areaOpacity(o?.color)) : halo,
              draggable: true,
            });
          }
          break;
        }
        case 'curve': {
          const runs = clipPolyline(el.points.filter(isFiniteVec), pl.dataBox);
          if (!runs.length) break;
          const color = o?.color ?? curveColor(el.role, style.palette);
          const dash = o?.dash ?? el.dash;
          const d = runs.map((r) => pathD(r.map(toPx))).join('');
          if (sel === key) {
            ui.push(
              <path
                key={`${key}-sel`}
                data-ui="1"
                d={d}
                fill="none"
                stroke="#2a78d6"
                strokeOpacity={0.25}
                strokeWidth={cw + 9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />,
            );
          }
          curves.push(
            <path
              key={key}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={Number((cw * (el.weight ?? 1)).toFixed(2))}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash ? `${7 * sw} ${5 * sw}` : undefined}
              opacity={el.faded ? 0.45 : undefined}
            />,
          );
          if (interactive) {
            ui.push(
              <path
                key={`${key}-hit`}
                data-ui="1"
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: 'pointer' }}
                onPointerDown={select(key)}
              />,
            );
          }
          const text = labelText(overrides, key, el.label);
          if (text) {
            const spec = curveLabel(el, runs.map((r) => r.map(toPx)), toPx, fs);
            labels.push({
              key,
              text,
              ...spec,
              x: spec.x + (o?.dx ?? 0),
              y: spec.y + (o?.dy ?? 0),
              draggable: true,
            });
          }
          break;
        }
        case 'point': {
          if (!isFiniteVec(el.at)) break;
          const p = toPx(el.at);
          const inside =
            el.at[0] >= pl.xMin - 1e-6 &&
            el.at[0] <= pl.xMax + 1e-6 &&
            el.at[1] >= pl.yMin - 1e-6 &&
            el.at[1] <= pl.yMax + 1e-6;
          if (!inside) break;
          const gx = elKey(panel.id, el.id, 'x');
          const gy = elKey(panel.id, el.id, 'y');
          if (el.xLabel !== undefined && !ov(gx)?.hidden) {
            guides.push(
              <line
                key={gx}
                x1={p[0]}
                y1={p[1]}
                x2={p[0]}
                y2={axisY}
                stroke={INK_SOFT}
                strokeWidth={1.1 * sw}
                strokeDasharray={`${4 * sw} ${3.5 * sw}`}
              />,
            );
            const t = labelText(overrides, gx, el.xLabel);
            if (t) xAxisLabels.push({ key: gx, text: t, pos: p[0], size: measureRich(t, fs).width, other: axisY });
          }
          if (el.yLabel !== undefined && !ov(gy)?.hidden) {
            guides.push(
              <line
                key={gy}
                x1={p[0]}
                y1={p[1]}
                x2={axisX}
                y2={p[1]}
                stroke={INK_SOFT}
                strokeWidth={1.1 * sw}
                strokeDasharray={`${4 * sw} ${3.5 * sw}`}
              />,
            );
            const t = labelText(overrides, gy, el.yLabel);
            if (t) yAxisLabels.push({ key: gy, text: t, pos: p[1], size: fs * 1.2, other: axisX });
          }
          if (el.dot !== false && style.dots) {
            dots.push(
              <circle key={key} cx={p[0]} cy={p[1]} r={3.6 * Math.sqrt(sw)} fill={o?.color ?? INK} />,
            );
          }
          if (interactive) {
            ui.push(
              <circle
                key={`${key}-hit`}
                data-ui="1"
                cx={p[0]}
                cy={p[1]}
                r={9}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onPointerDown={select(key)}
              />,
            );
          }
          if (sel === key) {
            ui.push(
              <circle key={`${key}-sel`} data-ui="1" cx={p[0]} cy={p[1]} r={8} fill="none" stroke="#2a78d6" strokeWidth={1.5} />,
            );
          }
          const t = labelText(overrides, key, el.label);
          if (t) {
            const dir = el.labelDir ?? 'e';
            const off = dirOffset(dir, fs);
            labels.push({
              key,
              text: t,
              x: p[0] + off.dx + (o?.dx ?? 0),
              y: p[1] + off.dy + (o?.dy ?? 0),
              anchor: off.anchor,
              valign: dir === 'n' || dir === 'ne' || dir === 'nw' ? 'bottom' : undefined,
              fill: o?.color ?? INK,
              draggable: true,
            });
          }
          break;
        }
        case 'line': {
          if (!isFiniteVec(el.from) || !isFiniteVec(el.to)) break;
          lines.push(renderLine(el, key, o?.color, o?.dash));
          if (interactive) {
            const a = toPx(el.from);
            const b = toPx(el.to);
            ui.push(
              <line
                key={`${key}-hit`}
                data-ui="1"
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'pointer' }}
                onPointerDown={select(key)}
              />,
            );
          }
          if (sel === key) {
            const a = toPx(el.from);
            const b = toPx(el.to);
            ui.push(
              <line
                key={`${key}-sel`}
                data-ui="1"
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="#2a78d6"
                strokeOpacity={0.25}
                strokeWidth={10}
                strokeLinecap="round"
              />,
            );
          }
          const t = labelText(overrides, key, el.label);
          if (t) {
            const mid: Vec = el.labelPos ?? [(el.from[0] + el.to[0]) / 2, (el.from[1] + el.to[1]) / 2];
            const p = toPx(mid);
            const dir = el.labelDir ?? (el.labelPos ? 'c' : 'n');
            const off = dirOffset(dir, fs, fs * 0.45);
            labels.push({
              key,
              text: t,
              x: p[0] + off.dx + (o?.dx ?? 0),
              y: p[1] + off.dy + (o?.dy ?? 0),
              anchor: off.anchor,
              valign: dir === 'n' || dir === 'ne' || dir === 'nw' ? 'bottom' : dir === 'c' ? 'middle' : undefined,
              size: el.variant === 'measure' ? 0.85 : 1,
              fill: o?.color ?? INK,
              draggable: true,
            });
          }
          break;
        }
        case 'text': {
          const p = toPx(el.at);
          labels.push({
            key,
            text: labelText(overrides, key, el.text),
            x: p[0] + (o?.dx ?? 0),
            y: p[1] + (o?.dy ?? 0),
            anchor: el.anchor ?? 'middle',
            valign: 'middle',
            size: el.size ?? 0.9,
            italic: el.italic,
            fill: o?.color ?? (el.muted ? INK_SOFT : INK),
            draggable: true,
          });
          break;
        }
        case 'tick': {
          const t = labelText(overrides, key, el.label);
          if (el.axis === 'x') {
            const X = px(el.value);
            guides.push(<line key={key} x1={X} y1={axisY} x2={X} y2={axisY + 5} stroke={INK} strokeWidth={1.4 * sw} />);
            if (t) xAxisLabels.push({ key, text: t, pos: X, size: measureRich(t, fs).width, other: axisY });
          } else {
            const Y = py(el.value);
            guides.push(<line key={key} x1={axisX - 5} y1={Y} x2={axisX} y2={Y} stroke={INK} strokeWidth={1.4 * sw} />);
            if (t) yAxisLabels.push({ key, text: t, pos: Y, size: fs * 1.2, other: axisX });
          }
          break;
        }
      }
    }

    function renderLine(el: LineEl, key: string, colorOv?: string, dashOv?: boolean) {
      const a = toPx(el.from);
      const b = toPx(el.to);
      const variant = el.variant ?? 'plain';
      const heads = el.heads ?? (variant === 'shift' ? 'end' : variant === 'measure' ? 'both' : 'none');
      const color =
        colorOv ??
        (variant === 'guide'
          ? INK_SOFT
          : el.role
            ? curveColor(el.role, style.palette)
            : variant === 'shift'
              ? INK_SOFT
              : INK);
      const width = (variant === 'shift' ? 1.9 : variant === 'guide' ? 1.1 : variant === 'measure' ? 1.2 : 1.6) * sw;
      const dash = dashOv ?? (el.dash || variant === 'guide');
      const head = (variant === 'shift' ? 10 : 8) * Math.sqrt(sw);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d: string;
      let dirEnd: Pt;
      let dirStart: Pt;
      if (el.bend) {
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
        const c: Pt = [mx - uy * el.bend * len, my + ux * el.bend * len];
        dirEnd = unit(b[0] - c[0], b[1] - c[1]);
        dirStart = unit(a[0] - c[0], a[1] - c[1]);
        const a2: Pt = heads === 'both' ? [a[0] - dirStart[0] * head * 0.6, a[1] - dirStart[1] * head * 0.6] : a;
        const b2: Pt = heads !== 'none' ? [b[0] - dirEnd[0] * head * 0.6, b[1] - dirEnd[1] * head * 0.6] : b;
        d = `M${a2[0].toFixed(2)} ${a2[1].toFixed(2)}Q${c[0].toFixed(2)} ${c[1].toFixed(2)} ${b2[0].toFixed(2)} ${b2[1].toFixed(2)}`;
      } else {
        dirEnd = unit(b[0] - a[0], b[1] - a[1]);
        dirStart = [-dirEnd[0], -dirEnd[1]];
        const a2: Pt = heads === 'both' ? [a[0] + dirEnd[0] * head * 0.6, a[1] + dirEnd[1] * head * 0.6] : a;
        const b2: Pt = heads !== 'none' ? [b[0] - dirEnd[0] * head * 0.6, b[1] - dirEnd[1] * head * 0.6] : b;
        d = pathD([a2, b2]);
      }
      return (
        <g key={key}>
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={Number(width.toFixed(2))}
            strokeLinecap={variant === 'guide' ? 'butt' : 'round'}
            strokeDasharray={dash ? `${4 * sw} ${3.5 * sw}` : undefined}
          />
          {heads !== 'none' && <polygon points={arrowHead(b, dirEnd, head)} fill={color} />}
          {heads === 'both' && <polygon points={arrowHead(a, dirStart, head)} fill={color} />}
        </g>
      );
    }

    // --- axes ---------------------------------------------------------------
    const axisW = 1.6 * sw;
    const top = m.t;
    const right = m.l + w;
    const arrowLen = style.axisArrows ? 9 : 0;
    const axes: ReactNode[] = [
      <line
        key="yaxis"
        x1={axisX}
        y1={m.t + h}
        x2={axisX}
        y2={top - arrowLen * 0.4}
        stroke={INK}
        strokeWidth={axisW}
        strokeLinecap="square"
      />,
      <line
        key="xaxis"
        x1={axisX}
        y1={axisY}
        x2={right + arrowLen * 0.4}
        y2={axisY}
        stroke={INK}
        strokeWidth={axisW}
        strokeLinecap="square"
      />,
    ];
    if (style.axisArrows) {
      axes.push(<polygon key="ya" points={arrowHead([axisX, top - arrowLen], [0, -1], arrowLen)} fill={INK} />);
      axes.push(<polygon key="xa" points={arrowHead([right + arrowLen, axisY], [1, 0], arrowLen)} fill={INK} />);
    }
    // numeric ticks
    for (const t of panel.xTicks ?? []) {
      const X = px(t.value);
      axes.push(<line key={`xt${t.value}`} x1={X} y1={axisY} x2={X} y2={axisY + 5} stroke={INK} strokeWidth={1.2 * sw} />);
      if (t.label) xAxisLabels.push({ key: `${panel.id}:xt${t.value}`, text: t.label, pos: X, size: measureRich(t.label, fs * 0.85).width, other: -1 });
    }
    for (const t of panel.yTicks ?? []) {
      const Y = py(t.value);
      axes.push(<line key={`yt${t.value}`} x1={axisX - 5} y1={Y} x2={axisX} y2={Y} stroke={INK} strokeWidth={1.2 * sw} />);
      if (t.label) yAxisLabels.push({ key: `${panel.id}:yt${t.value}`, text: t.label, pos: Y, size: fs * 0.95, other: -1 });
    }

    // axis tick/guide labels with collision spreading
    spread(xAxisLabels, fs * 0.35);
    spread(yAxisLabels, fs * 0.08);
    for (const l of xAxisLabels) {
      const numeric = l.other === -1;
      const o = numeric ? undefined : ov(l.key);
      labels.push({
        key: l.key,
        text: l.text,
        x: l.pos + (o?.dx ?? 0),
        y: axisY + fs * (numeric ? 1.25 : 1.35) + (o?.dy ?? 0),
        anchor: 'middle',
        size: numeric ? 0.85 : 1,
        fill: numeric ? INK_SOFT : INK,
        draggable: !numeric,
      });
    }
    for (const l of yAxisLabels) {
      const numeric = l.other === -1;
      const o = numeric ? undefined : ov(l.key);
      labels.push({
        key: l.key,
        text: l.text,
        x: axisX - fs * 0.45 + (o?.dx ?? 0),
        y: l.pos + fs * 0.35 + (o?.dy ?? 0),
        anchor: 'end',
        size: numeric ? 0.85 : 1,
        fill: numeric ? INK_SOFT : INK,
        draggable: !numeric,
      });
    }

    // axis titles
    const xk = axisKey(panel.id, 'x');
    const yk = axisKey(panel.id, 'y');
    const xTitle = labelText(overrides, xk, panel.xLabel);
    const yTitle = labelText(overrides, yk, panel.yLabel);
    if (style.axisLabels === 'center') {
      if (xTitle && !ov(xk)?.hidden)
        labels.push({
          key: xk,
          text: xTitle,
          x: m.l + w / 2 + (ov(xk)?.dx ?? 0),
          y: m.t + h + fs * 2.75 + (ov(xk)?.dy ?? 0),
          anchor: 'middle',
          weight: 500,
          draggable: true,
        });
      if (yTitle && !ov(yk)?.hidden)
        labels.push({
          key: yk,
          text: yTitle,
          x: fs * 1.1 + (ov(yk)?.dx ?? 0),
          y: m.t + h / 2 + (ov(yk)?.dy ?? 0),
          anchor: 'middle',
          weight: 500,
          rotate: -90,
          draggable: true,
        });
    } else {
      if (xTitle && !ov(xk)?.hidden)
        labels.push({
          key: xk,
          text: xTitle,
          x: right + arrowLen + (ov(xk)?.dx ?? 0),
          // with a negative region the axis runs mid-plot: keep the title below the plot
          y: (pl.yMin < 0 ? m.t + h + fs * 1.9 : axisY + fs * 2.7) + (ov(xk)?.dy ?? 0),
          anchor: 'end',
          weight: 500,
          draggable: true,
        });
      if (yTitle && !ov(yk)?.hidden) {
        const tw = measureRich(yTitle, fs).width;
        const x = Math.max(axisX - tw / 2, 4);
        labels.push({
          key: yk,
          text: yTitle,
          x: x + (ov(yk)?.dx ?? 0),
          y: top - arrowLen - fs * 0.7 + (ov(yk)?.dy ?? 0),
          anchor: 'start',
          weight: 500,
          draggable: true,
        });
      }
    }
    const ok = axisKey(panel.id, 'origin');
    const originText = labelText(overrides, ok, panel.origin === false ? '' : (panel.origin ?? '0'));
    if (style.showOrigin && originText && !ov(ok)?.hidden && pl.yMin >= 0) {
      labels.push({
        key: ok,
        text: originText,
        x: axisX - fs * 0.4 + (ov(ok)?.dx ?? 0),
        y: axisY + fs * 1.15 + (ov(ok)?.dy ?? 0),
        anchor: 'end',
        size: 0.9,
        draggable: true,
      });
    }
    const tk = axisKey(panel.id, 'title');
    const pTitle = labelText(overrides, tk, panel.title);
    if (pTitle && !ov(tk)?.hidden) {
      labels.push({
        key: tk,
        text: pTitle,
        x: m.l + w / 2 + (ov(tk)?.dx ?? 0),
        y: fs * 1.2 + (ov(tk)?.dy ?? 0),
        anchor: 'middle',
        weight: 600,
        size: 1.02,
        draggable: true,
      });
    }

    // handles
    if (interactive && interaction?.onHandleDrag) {
      for (const hd of panel.handles ?? []) {
        if (!isFiniteVec(hd.at)) continue;
        const p = toPx(hd.at);
        const cursor = hd.axis === 'x' ? 'ew-resize' : hd.axis === 'y' ? 'ns-resize' : 'move';
        ui.push(
          <g key={`h-${hd.id}`} data-ui="1" style={{ cursor }} onPointerDown={startHandleDrag(pl, hd)}>
            <circle cx={p[0]} cy={p[1]} r={14} fill="transparent" />
            <circle cx={p[0]} cy={p[1]} r={6.5} fill="#ffffff" stroke="#2a78d6" strokeWidth={2} />
            <circle cx={p[0]} cy={p[1]} r={2.2} fill="#2a78d6" />
            {hd.hint && <title>{hd.hint}</title>}
          </g>,
        );
      }
    }

    // part-level hide overrides (axis titles, guide labels...)
    const shown = labels.filter((l) => !ov(l.key)?.hidden);

    return (
      <g key={panel.id} transform={`translate(${pl.x.toFixed(2)} ${pl.y.toFixed(2)})`}>
        <g>{fill}</g>
        <g>{guides}</g>
        <g>{axes}</g>
        <g>{curves}</g>
        <g>{lines}</g>
        <g>{dots}</g>
        <g data-ui="1">{ui}</g>
        <g>
          {shown.map((l) => (
            <RichText
              key={`lbl-${l.key}`}
              spec={l}
              fs={fs}
              halo={l.halo !== undefined ? l.halo : halo}
              selected={sel === l.key}
              onPointerDown={interactive && l.draggable ? startLabelDrag(l.key) : undefined}
            />
          ))}
        </g>
      </g>
    );
  };

  // --- defs ------------------------------------------------------------------
  const defs: ReactNode[] = [];
  for (const role of usedRoles) {
    const hsp = HATCH[role];
    const g = hsp.gap;
    defs.push(
      <pattern
        key={role}
        id={patternId(role)}
        patternUnits="userSpaceOnUse"
        width={g}
        height={g}
        patternTransform={hsp.angle ? `rotate(${hsp.angle})` : undefined}
      >
        {hsp.dots ? (
          <circle cx={g / 2} cy={g / 2} r={0.95} fill={INK} />
        ) : (
          <>
            <line x1={0} y1={0} x2={0} y2={g} stroke={INK} strokeWidth={0.9} />
            {hsp.cross && <line x1={0} y1={0} x2={g} y2={0} stroke={INK} strokeWidth={0.9} />}
          </>
        )}
      </pattern>,
    );
  }

  const W = Math.ceil(L.width);
  const H = Math.ceil(L.height);
  const sw2 = fs * 0.95;
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className}
      fontFamily={FONT_STACK[style.font]}
      role="img"
      aria-label={ariaLabel ?? title ?? 'Economics diagram'}
      onPointerDown={interactive ? () => interaction?.onSelect?.(null) : undefined}
      style={{ overflow: 'visible' }}
    >
      {defs.length > 0 && <defs>{defs}</defs>}
      {style.background === 'white' && <rect data-bg="1" x={0} y={0} width={W} height={H} fill="#ffffff" />}
      {L.titleH > 0 && title && (
        <RichText
          spec={{
            key: 'doc:title',
            text: title,
            x: W / 2,
            y: fs * 1.55,
            anchor: 'middle',
            weight: 650,
            size: 1.12,
          }}
          fs={fs}
          halo={null}
          selected={false}
        />
      )}
      {L.panels.map(renderPanel)}
      {L.legend.rows.map((row, ri) => {
        const rowW = row.length
          ? row[row.length - 1].x + sw2 + fs * 0.45 + measureRich(row[row.length - 1].item.text, fs * 0.85).width
          : 0;
        const x0 = (W - rowW) / 2;
        const y = L.legend.y + ri * fs * 1.6;
        return (
          <g key={`legend-${ri}`}>
            {row.map(({ x, item }) => (
              <g key={item.key}>
                <rect
                  x={x0 + x}
                  y={y}
                  width={sw2}
                  height={sw2}
                  rx={2}
                  fill={areaFill(item.role, item.color)}
                  fillOpacity={style.palette === 'mono' && !item.color ? 1 : Math.min(1, style.areaOpacity + 0.15)}
                  stroke={MUTED}
                  strokeWidth={0.8}
                />
                <RichText
                  spec={{
                    key: `legend:${item.key}`,
                    text: item.text,
                    x: x0 + x + sw2 + fs * 0.45,
                    y: y + sw2 * 0.82,
                    anchor: 'start',
                    size: 0.85,
                  }}
                  fs={fs}
                  halo={null}
                  selected={false}
                />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------

const upward = (d: Dir) => d === 'n' || d === 'ne' || d === 'nw';

function curveLabel(
  el: CurveEl,
  runs: Pt[][],
  toPx: (p: Vec) => Pt,
  fs: number,
): Pick<LabelSpec, 'x' | 'y' | 'anchor' | 'valign'> {
  if (Array.isArray(el.labelAt)) {
    const p = toPx(el.labelAt as Vec);
    const dir = el.labelDir ?? 'c';
    const off = dirOffset(dir, fs);
    return { x: p[0] + off.dx, y: p[1] + off.dy, anchor: off.anchor, valign: upward(dir) ? 'bottom' : dir === 'c' ? 'middle' : undefined };
  }
  const atStart = el.labelAt === 'start';
  const run = atStart ? runs[0] : runs[runs.length - 1];
  const pts = atStart ? run.slice().reverse() : run;
  const p = pts[pts.length - 1];
  let q = pts[pts.length - 2] ?? p;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > 16) {
      q = pts[i];
      break;
    }
  }
  if (el.labelDir) {
    const off = dirOffset(el.labelDir, fs);
    return { x: p[0] + off.dx, y: p[1] + off.dy, anchor: off.anchor, valign: upward(el.labelDir) ? 'bottom' : undefined };
  }
  const [ux, uy] = unit(p[0] - q[0], p[1] - q[1]);
  const off = fs * 0.45;
  const x = p[0] + ux * off;
  let y = p[1] + uy * off;
  const anchor: LabelSpec['anchor'] = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle';
  let valign: LabelSpec['valign'];
  if (uy > 0.35) y += fs * 0.75;
  else if (uy < -0.35) {
    y -= fs * 0.1;
    valign = 'bottom';
  } else {
    valign = 'middle';
  }
  return { x, y, anchor, valign };
}

export { DEFAULT_W, DEFAULT_H };
