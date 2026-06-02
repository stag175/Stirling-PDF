import { describe, expect, it } from "vitest";

import { calculateScaleFromFileSize } from "@app/utils/thumbnailScaleUtils";

const MB = 1024 * 1024;

describe("calculateScaleFromFileSize", () => {
  it("uses full quality below 10 MB", () => {
    expect(calculateScaleFromFileSize(0)).toBe(1.0);
    expect(calculateScaleFromFileSize(5 * MB)).toBe(1.0);
    expect(calculateScaleFromFileSize(10 * MB - 1)).toBe(1.0);
  });

  it("steps down through the size tiers", () => {
    expect(calculateScaleFromFileSize(30 * MB)).toBe(0.8);
    expect(calculateScaleFromFileSize(100 * MB)).toBe(0.6);
    expect(calculateScaleFromFileSize(300 * MB)).toBe(0.4);
    expect(calculateScaleFromFileSize(800 * MB)).toBe(0.3);
  });

  it("tier boundaries are exclusive lower-bounds (strict <)", () => {
    // exactly at a threshold falls into the next (smaller-scale) tier
    expect(calculateScaleFromFileSize(10 * MB)).toBe(0.8);
    expect(calculateScaleFromFileSize(50 * MB)).toBe(0.6);
    expect(calculateScaleFromFileSize(200 * MB)).toBe(0.4);
    expect(calculateScaleFromFileSize(500 * MB)).toBe(0.3);
  });

  it("is monotonically non-increasing as size grows", () => {
    const sizes = [0, 5, 10, 49, 50, 199, 200, 499, 500, 1000].map((m) => m * MB);
    let prev = Infinity;
    for (const size of sizes) {
      const scale = calculateScaleFromFileSize(size);
      expect(scale).toBeLessThanOrEqual(prev);
      expect(scale).toBeGreaterThan(0);
      prev = scale;
    }
  });
});
