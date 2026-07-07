import { RefObject, useEffect } from "react";

import {
  computeMaxHeight,
  contentFits,
  type FitOptionsInput,
  nextFontSize,
  resolveFitParams,
  shouldStopShrinking,
} from "@app/components/shared/fitText/textFitUtils";

export type AdjustFontSizeOptions = FitOptionsInput;

/**
 * Imperative util: progressively reduces font-size until content fits within the element
 * (width and optional line count). Returns a cleanup that disconnects observers.
 */
export function adjustFontSizeToFit(
  element: HTMLElement,
  options: AdjustFontSizeOptions = {},
): () => void {
  if (!element) return () => {};

  const computed = window.getComputedStyle(element);
  const { baseFontPx, minFontPx, stepPx, singleLine, maxLines } =
    resolveFitParams(options, parseFloat(computed.fontSize || "16"));

  // Ensure measurement is consistent
  if (singleLine) {
    element.style.whiteSpace = "nowrap";
  }
  // Never split within words; only allow natural breaks (spaces) or explicit soft breaks
  element.style.wordBreak = "keep-all";
  element.style.overflowWrap = "normal";
  // Disable automatic hyphenation to avoid mid-word breaks; use only manual opportunities
  element.style.setProperty("hyphens", "manual");
  element.style.overflow = "visible";

  const fit = () => {
    // Reset to largest before measuring
    element.style.fontSize = `${baseFontPx}px`;

    // Calculate target height threshold for line limit
    let maxHeight = Number.POSITIVE_INFINITY;
    if (typeof maxLines === "number" && maxLines > 0) {
      const cs = window.getComputedStyle(element);
      maxHeight = computeMaxHeight(maxLines, parseFloat(cs.lineHeight), baseFontPx);
    }

    let current = baseFontPx;
    // Guard against excessive loops
    let iterations = 0;
    while (iterations < 200) {
      const fits = contentFits(
        element.scrollWidth,
        element.clientWidth,
        element.scrollHeight,
        maxHeight,
      );
      if (shouldStopShrinking(fits, current, minFontPx)) break;
      current = nextFontSize(current, minFontPx, stepPx);
      element.style.fontSize = `${current}px`;
      iterations += 1;
    }
  };

  // Defer to next frame to ensure layout is ready
  const raf = requestAnimationFrame(fit);

  const ro = new ResizeObserver(() => fit());
  ro.observe(element);
  if (element.parentElement) ro.observe(element.parentElement);

  const mo = new MutationObserver(() => fit());
  mo.observe(element, { characterData: true, childList: true, subtree: true });

  return () => {
    cancelAnimationFrame(raf);
    try {
      ro.disconnect();
    } catch {
      /* Ignore errors */
    }
    try {
      mo.disconnect();
    } catch {
      /* Ignore errors */
    }
  };
}

/** React hook wrapper for convenience */
export function useAdjustFontSizeToFit(
  ref: RefObject<HTMLElement | null>,
  options: AdjustFontSizeOptions = {},
) {
  useEffect(() => {
    if (!ref.current) return;
    const cleanup = adjustFontSizeToFit(ref.current, options);
    return cleanup;
  }, [
    ref,
    options.maxFontSizePx,
    options.minFontScale,
    options.stepScale,
    options.maxLines,
    options.singleLine,
  ]);
}
