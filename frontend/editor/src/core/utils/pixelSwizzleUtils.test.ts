import { describe, expect, it } from "vitest";

import { rgbaToBgra } from "@app/utils/pixelSwizzleUtils";

describe("rgbaToBgra", () => {
  it("swaps red and blue while keeping green and alpha in place (single pixel)", () => {
    const out = rgbaToBgra(new Uint8Array([10, 20, 30, 40]));
    expect(Array.from(out)).toEqual([30, 20, 10, 40]);
  });

  it("processes multiple pixels independently", () => {
    const out = rgbaToBgra(new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]));
    expect(Array.from(out)).toEqual([30, 20, 10, 40, 70, 60, 50, 80]);
  });

  it("preserves a fully-opaque / fully-transparent alpha channel", () => {
    const out = rgbaToBgra(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 0]));
    expect(Array.from(out)).toEqual([3, 2, 1, 255, 6, 5, 4, 0]);
  });

  it("accepts a Uint8ClampedArray (canvas ImageData) input", () => {
    const out = rgbaToBgra(new Uint8ClampedArray([100, 110, 120, 130]));
    expect(Array.from(out)).toEqual([120, 110, 100, 130]);
  });

  it("returns an empty array for empty input and a fresh array (not the input)", () => {
    const input = new Uint8Array([]);
    const out = rgbaToBgra(input);
    expect(out.length).toBe(0);

    const src = new Uint8Array([9, 8, 7, 6]);
    const result = rgbaToBgra(src);
    expect(result).not.toBe(src); // distinct buffer
    expect(Array.from(src)).toEqual([9, 8, 7, 6]); // source untouched
  });

  it("output length matches input length", () => {
    expect(rgbaToBgra(new Uint8Array(12)).length).toBe(12);
  });
});
