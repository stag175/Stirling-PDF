/**
 * Pure font-fitting math, lifted out of {@link ./textFit.ts}'s DOM/observer-coupled
 * `adjustFontSizeToFit`. These helpers contain the off-by-one tolerances and clamps that
 * are easy to get wrong, so they are unit-tested in isolation; `textFit.ts` only handles
 * the element measurement/mutation and observer wiring.
 */

export type FitOptionsInput = {
  /** Max font size to start from. Defaults to the element's computed font size. */
  maxFontSizePx?: number;
  /** Minimum scale relative to max size (like React Native's minimumFontScale). Default 0.7 */
  minFontScale?: number;
  /** Step as a fraction of max size used while shrinking. Default 0.05 (5%). */
  stepScale?: number;
  /** Limit the number of lines to fit. If omitted, only width is considered for multi-line. */
  maxLines?: number;
  /** If true, force single-line fitting (uses nowrap). Default false. */
  singleLine?: boolean;
};

export type ResolvedFitParams = {
  baseFontPx: number;
  minFontPx: number;
  stepPx: number;
  singleLine: boolean;
  maxLines?: number;
};

/**
 * Resolve the concrete shrink parameters from caller options plus the element's computed
 * font size. `minFontScale` is clamped to >= 0.1, `stepScale` to >= 0.005, and the resulting
 * pixel step to >= 0.5px so the loop always makes forward progress. Pure.
 */
export function resolveFitParams(
  options: FitOptionsInput,
  computedFontSizePx: number,
): ResolvedFitParams {
  const baseFontPx = options.maxFontSizePx ?? computedFontSizePx;
  const minScale = Math.max(0.1, options.minFontScale ?? 0.7);
  const stepScale = Math.max(0.005, options.stepScale ?? 0.05);
  return {
    baseFontPx,
    minFontPx: baseFontPx * minScale,
    stepPx: Math.max(0.5, baseFontPx * stepScale),
    singleLine: options.singleLine ?? false,
    maxLines: options.maxLines,
  };
}

/**
 * Height threshold for an optional line-count limit. Returns +Infinity when unlimited
 * (no/zero/negative maxLines). When the measured line height is unusable (0 or NaN) it
 * falls back to `baseFontPx * 1.2`. A small epsilon is added to absorb sub-pixel rounding. Pure.
 */
export function computeMaxHeight(
  maxLines: number | undefined,
  lineHeightPx: number,
  baseFontPx: number,
): number {
  if (typeof maxLines === "number" && maxLines > 0) {
    const lineHeight = lineHeightPx || baseFontPx * 1.2;
    return lineHeight * maxLines + 0.1;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Whether the content fits both the available width and the height threshold, each with a
 * 1px tolerance to mirror the original measurement loop. Pure.
 */
export function contentFits(
  scrollWidth: number,
  clientWidth: number,
  scrollHeight: number,
  maxHeight: number,
): boolean {
  return scrollWidth <= clientWidth + 1 && scrollHeight <= maxHeight + 1;
}

/** Next font size while shrinking, clamped at the minimum so it never undershoots. Pure. */
export function nextFontSize(
  current: number,
  minFontPx: number,
  stepPx: number,
): number {
  return Math.max(minFontPx, current - stepPx);
}

/**
 * Whether the shrink loop should stop: either the content already fits, or we have reached
 * (or dropped below) the minimum font size. Pure.
 */
export function shouldStopShrinking(
  fits: boolean,
  current: number,
  minFontPx: number,
): boolean {
  return fits || current <= minFontPx;
}
