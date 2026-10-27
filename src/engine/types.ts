/**
 * Core scene model.
 *
 * A template's `build(params)` returns a Scene: one or more panels, each with
 * axes and a list of elements positioned in *data* coordinates (by default a
 * 0–10 × 0–10 box). The renderer maps data → pixels, clips, places labels and
 * applies the user's style + overrides.
 */

export type Vec = readonly [number, number];

/** Semantic colour roles for curves. Themes map these to actual colours. */
export type CurveRole =
  | 'demand'
  | 'supply'
  | 'social'
  | 'mc'
  | 'mr'
  | 'atc'
  | 'avc'
  | 'afc'
  | 'long-run'
  | 'policy'
  | 'world'
  | 'neutral'
  | 'alt';

/** Semantic fill roles for shaded areas. */
export type AreaRole =
  | 'cs'
  | 'ps'
  | 'dwl'
  | 'gov'
  | 'profit'
  | 'loss'
  | 'gain'
  | 'cost'
  | 'neutral'
  | 'alt';

/** Compass direction used for label placement relative to an anchor. */
export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'c';

export interface CurveEl {
  kind: 'curve';
  id: string;
  /** Polyline in data coordinates (already sampled). */
  points: Vec[];
  label?: string;
  /** Where the label sits: visible end (default), start, or an explicit data position. */
  labelAt?: 'end' | 'start' | Vec;
  labelDir?: Dir;
  role?: CurveRole;
  dash?: boolean;
  /** Stroke width multiplier. */
  weight?: number;
  /** Drawn lighter, e.g. the original curve before a shift. */
  faded?: boolean;
}

export interface PointEl {
  kind: 'point';
  id: string;
  at: Vec;
  label?: string;
  labelDir?: Dir;
  /** Draw a dot (default true). */
  dot?: boolean;
  /** Dashed guide to the x-axis, labelled with this text ('' = guide without label). */
  xLabel?: string;
  /** Dashed guide to the y-axis, labelled with this text ('' = guide without label). */
  yLabel?: string;
}

export interface LineEl {
  kind: 'line';
  id: string;
  from: Vec;
  to: Vec;
  /** Arrowheads. */
  heads?: 'none' | 'end' | 'both';
  /**
   * plain   – solid ink line
   * guide   – thin dashed helper line
   * shift   – bold coloured arrow showing a curve shift / movement
   * measure – thin double-headed bracket (e.g. "shortage")
   */
  variant?: 'plain' | 'guide' | 'shift' | 'measure';
  role?: CurveRole;
  dash?: boolean;
  label?: string;
  labelDir?: Dir;
  /** Explicit label position (data coords). Defaults to the midpoint. */
  labelPos?: Vec;
  /** Bend for a curved arrow, as a fraction of its length (+ve bends left). */
  bend?: number;
}

export interface AreaEl {
  kind: 'area';
  id: string;
  polygon: Vec[];
  role: AreaRole;
  /** Short label drawn inside the area (e.g. "CS", "A"). */
  label?: string;
  labelPos?: Vec;
  /** Longer description for the legend (e.g. "Consumer surplus"). */
  legend?: string;
}

export interface TextEl {
  kind: 'text';
  id: string;
  at: Vec;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Font size multiplier. */
  size?: number;
  italic?: boolean;
  muted?: boolean;
}

/** A labelled mark on an axis with no guide line. */
export interface TickEl {
  kind: 'tick';
  id: string;
  axis: 'x' | 'y';
  value: number;
  label: string;
}

export type El = CurveEl | PointEl | LineEl | AreaEl | TextEl | TickEl;

export interface AxisTick {
  value: number;
  label: string;
}

export type Params = Record<string, number | boolean | string>;

/** A draggable control point on the canvas, bound to template params. */
export interface Handle {
  id: string;
  at: Vec;
  /** Which directions the handle can move (affects cursor + hint). */
  axis?: 'x' | 'y' | 'xy';
  /** Given the dragged position in data coords, return params to merge. */
  apply: (pos: Vec) => Params;
  hint?: string;
}

export interface Panel {
  id: string;
  title?: string;
  xLabel: string;
  yLabel: string;
  xMin?: number;
  xMax: number;
  yMin?: number;
  yMax: number;
  /** Plot area size in px (excluding margins). */
  width?: number;
  height?: number;
  xTicks?: AxisTick[];
  yTicks?: AxisTick[];
  /** Origin label; defaults to "0". `false` hides it. */
  origin?: string | false;
  elements: El[];
  handles?: Handle[];
}

export interface Stat {
  label: string;
  value: string;
}

export interface Scene {
  panels: Panel[];
  layout?: 'row' | 'column';
  /** Computed values shown in the inspector (numeric templates). */
  stats?: Stat[];
}

// ---------------------------------------------------------------------------
// Templates

export type UnitId = 'intro' | 'micro' | 'macro' | 'global' | 'custom';

interface ControlBase {
  key: string;
  label: string;
  group?: string;
  help?: string;
  /** Hide the control unless this returns true. */
  show?: (p: Params) => boolean;
}

export type Control =
  | (ControlBase & { type: 'toggle'; default: boolean })
  | (ControlBase & {
      type: 'select';
      default: string;
      options: { value: string; label: string }[];
    })
  | (ControlBase & {
      type: 'slider';
      default: number;
      min: number;
      max: number;
      step: number;
    })
  | (ControlBase & {
      type: 'number';
      default: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (ControlBase & { type: 'text'; default: string; placeholder?: string });

export interface Template {
  id: string;
  name: string;
  unit: UnitId;
  topic: string;
  hl?: boolean;
  description: string;
  keywords?: string[];
  /** Default figure title (used when the title is shown). */
  caption?: string;
  controls: Control[];
  build: (p: Params) => Scene;
}

// ---------------------------------------------------------------------------
// User customisation layered on top of a template

export interface ElementOverride {
  hidden?: boolean;
  label?: string;
  /** Legend text for areas. */
  legend?: string;
  color?: string;
  dash?: boolean;
  /** Label offset in px (from dragging). */
  dx?: number;
  dy?: number;
}

export type Overrides = Record<string, ElementOverride>;

export type FontChoice = 'sans' | 'serif' | 'hand';
export type PaletteChoice = 'color' | 'classic' | 'mono';
export type AreaLabelMode = 'inside' | 'legend' | 'both' | 'none';

export interface GraphStyle {
  font: FontChoice;
  fontScale: number;
  strokeScale: number;
  palette: PaletteChoice;
  areaOpacity: number;
  background: 'white' | 'transparent';
  axisArrows: boolean;
  /** Axis titles at the axis ends (textbook) or centred along the axes. */
  axisLabels: 'end' | 'center';
  showOrigin: boolean;
  dots: boolean;
  areaLabels: AreaLabelMode;
  showTitle: boolean;
}

/** Something the user draws on top of a template (or on blank axes). */
export type Extra =
  | { kind: 'text'; id: string; panel: string; at: Vec; text: string }
  | { kind: 'arrow'; id: string; panel: string; from: Vec; to: Vec; label?: string }
  | {
      kind: 'curve';
      id: string;
      panel: string;
      /** Control points; 2 = straight line, 3+ = smooth curve through them. */
      points: Vec[];
      label?: string;
      role?: CurveRole;
    }
  | {
      kind: 'point';
      id: string;
      panel: string;
      at: Vec;
      label?: string;
      /** Axis labels for dashed guides; undefined = no guide. */
      xLabel?: string;
      yLabel?: string;
    }
  | { kind: 'area'; id: string; panel: string; points: Vec[]; role: AreaRole; label?: string };

/** Everything needed to reproduce one graph. Serialisable. */
export interface GraphDoc {
  v: 1;
  templateId: string;
  params: Params;
  overrides: Overrides;
  extras: Extra[];
  title: string;
}
