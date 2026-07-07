import { describe, expect, it } from "vitest";

import { computeTextSignatureDimensions } from "@app/utils/signaturePreviewUtils";

// Ratios (from signConstants): HORIZONTAL_PADDING_RATIO = 0.8, VERTICAL_PADDING_RATIO = 0.6.
// paddingX = round(fontSize * 0.8), paddingY = round(fontSize * 0.6),
// width = max(1, textWidth + 2*paddingX), height = max(1, ceil(fontSize + 2*paddingY)).
describe("computeTextSignatureDimensions", () => {
  it("computes padding and dimensions for the default font size (16)", () => {
    // paddingX = round(12.8) = 13, paddingY = round(9.6) = 10
    // width = 100 + 26 = 126, height = ceil(16 + 20) = 36
    expect(computeTextSignatureDimensions(100, 16)).toEqual({
      paddingX: 13,
      paddingY: 10,
      width: 126,
      height: 36,
    });
  });

  it("adds padding on both horizontal sides", () => {
    // fontSize 10 -> paddingX = round(8) = 8 -> width = textWidth + 16
    const { paddingX, width } = computeTextSignatureDimensions(50, 10);
    expect(paddingX).toBe(8);
    expect(width).toBe(50 + 8 * 2);
  });

  it("rounds padding to the nearest pixel", () => {
    // fontSize 3 -> paddingX = round(2.4) = 2, paddingY = round(1.8) = 2
    // height = ceil(3 + 4) = 7
    expect(computeTextSignatureDimensions(0, 3)).toEqual({
      paddingX: 2,
      paddingY: 2,
      width: 4, // max(1, 0 + 4)
      height: 7,
    });
  });

  it("ceils the height for fractional font sizes", () => {
    // fontSize 16.5 -> paddingY = round(9.9) = 10 -> height = ceil(16.5 + 20) = 37
    expect(computeTextSignatureDimensions(10, 16.5).height).toBe(37);
  });

  it("clamps width and height to a 1px minimum (degenerate font size 0)", () => {
    // fontSize 0 -> paddingX = paddingY = 0 -> width = max(1, 0) = 1, height = max(1, 0) = 1
    expect(computeTextSignatureDimensions(0, 0)).toEqual({
      paddingX: 0,
      paddingY: 0,
      width: 1,
      height: 1,
    });
  });

  it("does not clamp when the measured text already exceeds 1px", () => {
    const { width } = computeTextSignatureDimensions(5, 0);
    expect(width).toBe(5); // paddingX 0 -> max(1, 5) = 5
  });
});
