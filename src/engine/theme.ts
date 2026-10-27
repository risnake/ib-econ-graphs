import type { AreaRole, CurveRole, FontChoice, GraphStyle, PaletteChoice } from './types';

/**
 * Colours come from a validated categorical palette (CVD-safe adjacent pairs).
 * Every curve is also direct-labelled, so colour is never the only cue — and
 * the "mono" palette swaps fills for hatching for black-and-white printing.
 */
const HUE = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#c98500',
  magenta: '#d55181',
  green: '#008300',
  violet: '#6250d6',
  red: '#e34948',
  ink: '#0b0b0b',
  inkSoft: '#52514e',
  muted: '#898781',
} as const;

export const INK = HUE.ink;
export const INK_SOFT = HUE.inkSoft;
export const MUTED = HUE.muted;

const COLOR_CURVES: Record<CurveRole, string> = {
  demand: HUE.blue,
  supply: HUE.orange,
  social: HUE.green,
  mc: HUE.red,
  mr: HUE.violet,
  atc: HUE.aqua,
  avc: HUE.yellow,
  afc: HUE.magenta,
  'long-run': HUE.inkSoft,
  policy: HUE.violet,
  world: HUE.inkSoft,
  neutral: HUE.ink,
  alt: HUE.magenta,
};

const AREA_FILLS: Record<AreaRole, string> = {
  cs: HUE.blue,
  ps: HUE.orange,
  dwl: HUE.inkSoft,
  gov: HUE.violet,
  profit: HUE.green,
  loss: HUE.red,
  gain: HUE.aqua,
  cost: '#eda100',
  neutral: HUE.muted,
  alt: '#e87ba4',
};

export function curveColor(role: CurveRole | undefined, palette: PaletteChoice): string {
  if (palette !== 'color') return HUE.ink;
  return COLOR_CURVES[role ?? 'neutral'];
}

export function areaColor(role: AreaRole, palette: PaletteChoice): string {
  if (palette === 'mono') return HUE.ink;
  return AREA_FILLS[role];
}

/** Hatch pattern spec per area role for the mono palette. */
export const HATCH: Record<AreaRole, { angle: number; gap: number; cross?: boolean; dots?: boolean }> = {
  cs: { angle: 45, gap: 6 },
  ps: { angle: -45, gap: 6 },
  dwl: { angle: 45, gap: 5, cross: true },
  gov: { angle: 0, gap: 5, dots: true },
  profit: { angle: 0, gap: 5 },
  loss: { angle: 90, gap: 5 },
  gain: { angle: 45, gap: 3.5 },
  cost: { angle: 0, gap: 7, dots: true },
  neutral: { angle: 30, gap: 8 },
  alt: { angle: 0, gap: 6, cross: true },
};

export const FONT_STACK: Record<FontChoice, string> = {
  sans: "Inter, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  hand: "Kalam, 'Comic Sans MS', 'Segoe Print', cursive",
};

/** Families for the vector-PDF exporter, which only ships the standard 14 fonts. */
export const PDF_FONT: Record<FontChoice, string> = {
  sans: 'helvetica',
  serif: 'times',
  hand: 'helvetica',
};

export const DEFAULT_STYLE: GraphStyle = {
  font: 'sans',
  fontScale: 1,
  strokeScale: 1,
  palette: 'color',
  areaOpacity: 0.3,
  background: 'white',
  axisArrows: false,
  axisLabels: 'end',
  showOrigin: true,
  dots: true,
  areaLabels: 'inside',
  showTitle: false,
};
