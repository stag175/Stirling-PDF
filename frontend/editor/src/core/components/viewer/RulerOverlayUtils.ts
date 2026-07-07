// Pure helpers for RulerOverlay: geometry math, unit formatting, and scale
// resolution. Everything here is a deterministic function of its inputs — no
// React, DOM, I/O, or state mutation — so it can be unit-tested in isolation.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/**
 * A point anchored to a specific PDF page in PDF-unit space.
 * x and y are in PDF points (1/72 inch) relative to the page's top-left corner.
 *
 * This is the only truly zoom-invariant representation. Screen positions are
 * recovered at render time via getBoundingClientRect on the page element, so
 * scroll, zoom, and fixed page margins are all handled by the browser — we never
 * have to track them ourselves.
 */
export interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

export interface MeasureScale {
  /** real_world_value = pdf_points * factor */
  factor: number;
  /** e.g. "ft", "m" */
  unit: string;
  /** Human-readable ratio from PDF, e.g. "1 in = 10 ft" */
  ratioLabel: string;
}

export interface ViewportScale {
  /** BBox in PDF user space (bottom-left origin). null = entire page. */
  bbox: [number, number, number, number] | null;
  scale: MeasureScale;
}

export interface PageScaleInfo {
  viewports: ViewportScale[];
  /** Page height in PDF points — used to flip screen-y (top=0) to PDF-y (bottom=0). */
  pageHeight: number;
}

export type PageMeasureScales = Map<number, PageScaleInfo>;

// ─── Math ─────────────────────────────────────────────────────────────────────

export function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function perpUnit(a: Point, b: Point): { nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

/** Angle from horizontal 0°–90°. Computed from screen-space points (same angle as PDF space). */
export function angleDeg(a: Point, b: Point): number {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * (180 / Math.PI);
}

export function formatDist(pts: number): string {
  const mm = (pts / 72) * 25.4;
  if (mm < 100) return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 1000).toFixed(2)} m`;
}

export function formatInches(pts: number): string {
  const inches = pts / 72;
  if (inches < 12) return `${inches.toFixed(2)} in`;
  return `${(inches / 12).toFixed(2)} ft`;
}

/**
 * Given the start/end PagePoints of a measurement, find the scale from the
 * viewport whose BBox contains the midpoint. Falls back to the first viewport
 * if none contains it (handles whole-page viewports with bbox=null).
 */
export function pickScale(
  start: PagePoint,
  end: PagePoint,
  pageMeasureScales: PageMeasureScales,
): MeasureScale | null {
  if (start.pageIndex !== end.pageIndex) return null;
  const info = pageMeasureScales.get(start.pageIndex);
  if (!info?.viewports.length) return null;

  // Midpoint in screen-space page coords (x left→right, y top→bottom, PDF points)
  const mx = (start.x + end.x) / 2;
  // Flip y: screen y=0 is page top; PDF user space y=0 is page bottom
  const my = info.pageHeight - (start.y + end.y) / 2;

  for (const { bbox, scale } of info.viewports) {
    if (!bbox) return scale; // whole-page viewport
    const [x0, y0, x1, y1] = bbox;
    if (
      mx >= Math.min(x0, x1) &&
      mx <= Math.max(x0, x1) &&
      my >= Math.min(y0, y1) &&
      my <= Math.max(y0, y1)
    ) {
      return scale;
    }
  }
  return null;
}

export function formatScaled(pts: number, scale: MeasureScale): string {
  const val = pts * scale.factor;
  if (val >= 1000) return `${val.toFixed(0)} ${scale.unit}`;
  if (val >= 100) return `${val.toFixed(1)} ${scale.unit}`;
  if (val >= 10) return `${val.toFixed(2)} ${scale.unit}`;
  return `${val.toFixed(3)} ${scale.unit}`;
}

// Conversion factors to metres for known units
const TO_METRES: Record<string, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  km: 1000,
  ft: 0.3048,
  in: 0.0254,
  yd: 0.9144,
  mi: 1609.344,
};

export function isImperialUnit(unit: string): boolean {
  return ["ft", "in", "yd", "mi"].includes(unit.toLowerCase().trim());
}

export function formatMetricFromMetres(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 1) return `${m.toFixed(1)} m`;
  if (m >= 0.1) return `${(m * 100).toFixed(1)} cm`;
  return `${(m * 1000).toFixed(1)} mm`;
}

export function formatImperialFromFeet(ft: number): string {
  if (ft >= 1) return `${ft.toFixed(2)} ft`;
  return `${(ft * 12).toFixed(2)} in`;
}

/**
 * Returns the scaled real-world value in the *other* unit system, or null if
 * the unit is not a recognised metric/imperial unit.
 * e.g. 72 pts, scale {factor:0.138889, unit:"ft"} → "3.048 m"
 *      72 pts, scale {factor:0.352778, unit:"m"}  → "1.157 ft" (approx)
 */
export function scaledCross(pts: number, scale: MeasureScale): string | null {
  const toM = TO_METRES[scale.unit.toLowerCase().trim()];
  if (!toM) return null;
  const metres = pts * scale.factor * toM;
  return isImperialUnit(scale.unit)
    ? formatMetricFromMetres(metres)
    : formatImperialFromFeet(metres / 0.3048);
}
