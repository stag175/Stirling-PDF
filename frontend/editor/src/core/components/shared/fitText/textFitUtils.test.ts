import { describe, expect, it } from "vitest";

import {
  computeMaxHeight,
  contentFits,
  nextFontSize,
  resolveFitParams,
  shouldStopShrinking,
} from "@app/components/shared/fitText/textFitUtils";

describe("resolveFitParams", () => {
  it("applies defaults relative to the computed font size", () => {
    const p = resolveFitParams({}, 16);
    expect(p.baseFontPx).toBe(16);
    expect(p.minFontPx).toBeCloseTo(16 * 0.7); // default minFontScale 0.7 -> 11.2
    expect(p.stepPx).toBeCloseTo(16 * 0.05); // default stepScale 0.05 -> 0.8
    expect(p.singleLine).toBe(false);
    expect(p.maxLines).toBeUndefined();
  });

  it("prefers an explicit maxFontSizePx over the computed size", () => {
    const p = resolveFitParams({ maxFontSizePx: 40 }, 16);
    expect(p.baseFontPx).toBe(40);
    expect(p.minFontPx).toBeCloseTo(40 * 0.7);
    expect(p.stepPx).toBeCloseTo(40 * 0.05); // 2
  });

  it("clamps minFontScale up to the 0.1 floor", () => {
    const p = resolveFitParams({ minFontScale: 0.01 }, 100);
    expect(p.minFontPx).toBeCloseTo(100 * 0.1); // clamped to 0.1 -> 10, not 1
  });

  it("clamps stepScale up to the 0.005 floor", () => {
    const p = resolveFitParams({ stepScale: 0.0001 }, 1000);
    // 1000 * 0.005 = 5 (clamped scale), not 1000 * 0.0001 = 0.1
    expect(p.stepPx).toBeCloseTo(5);
  });

  it("clamps the pixel step up to the 0.5px floor for tiny base sizes", () => {
    // base 4, default stepScale 0.05 -> 0.2px, below the 0.5px floor
    const p = resolveFitParams({}, 4);
    expect(p.stepPx).toBe(0.5);
  });

  it("passes through singleLine and maxLines", () => {
    const p = resolveFitParams({ singleLine: true, maxLines: 3 }, 16);
    expect(p.singleLine).toBe(true);
    expect(p.maxLines).toBe(3);
  });
});

describe("computeMaxHeight", () => {
  it("is unlimited (+Infinity) when maxLines is undefined", () => {
    expect(computeMaxHeight(undefined, 20, 16)).toBe(Number.POSITIVE_INFINITY);
  });

  it("is unlimited when maxLines is zero or negative", () => {
    expect(computeMaxHeight(0, 20, 16)).toBe(Number.POSITIVE_INFINITY);
    expect(computeMaxHeight(-2, 20, 16)).toBe(Number.POSITIVE_INFINITY);
  });

  it("multiplies a usable line height by the line count plus an epsilon", () => {
    expect(computeMaxHeight(2, 20, 16)).toBeCloseTo(40.1);
  });

  it("falls back to baseFontPx * 1.2 when line height is NaN", () => {
    // 16 * 1.2 = 19.2 per line * 2 lines + 0.1 epsilon
    expect(computeMaxHeight(2, Number.NaN, 16)).toBeCloseTo(19.2 * 2 + 0.1);
  });

  it("falls back when line height is zero", () => {
    expect(computeMaxHeight(1, 0, 10)).toBeCloseTo(10 * 1.2 + 0.1);
  });
});

describe("contentFits", () => {
  it("fits when width and height are within their 1px tolerance", () => {
    // scrollWidth exactly clientWidth + 1 still counts as fitting
    expect(contentFits(101, 100, 50, 50)).toBe(true);
  });

  it("does not fit when width exceeds the tolerance", () => {
    expect(contentFits(102, 100, 10, 100)).toBe(false);
  });

  it("does not fit when height exceeds the tolerance", () => {
    expect(contentFits(10, 100, 102, 100)).toBe(false);
  });

  it("always fits on height when maxHeight is +Infinity", () => {
    expect(contentFits(50, 100, 9999, Number.POSITIVE_INFINITY)).toBe(true);
  });
});

describe("nextFontSize", () => {
  it("decrements by the step when above the minimum", () => {
    expect(nextFontSize(16, 10, 0.8)).toBeCloseTo(15.2);
  });

  it("clamps at the minimum instead of undershooting", () => {
    expect(nextFontSize(10.3, 10, 0.8)).toBe(10);
  });
});

describe("shouldStopShrinking", () => {
  it("stops immediately when the content already fits", () => {
    expect(shouldStopShrinking(true, 16, 10)).toBe(true);
  });

  it("stops when at or below the minimum even if it does not fit", () => {
    expect(shouldStopShrinking(false, 10, 10)).toBe(true);
    expect(shouldStopShrinking(false, 9.5, 10)).toBe(true);
  });

  it("keeps shrinking when it neither fits nor has reached the minimum", () => {
    expect(shouldStopShrinking(false, 16, 10)).toBe(false);
  });
});
