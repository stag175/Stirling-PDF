import { describe, expect, it } from "vitest";

import {
  adjustPixel,
  ChannelAdjustments,
} from "@app/components/tools/adjustContrast/adjustPixelUtils";

const identity: ChannelAdjustments = {
  contrast: 1,
  brightness: 1,
  saturation: 1,
  redMul: 1,
  greenMul: 1,
  blueMul: 1,
};

describe("adjustPixel", () => {
  it("identity leaves grayscale endpoints unchanged", () => {
    expect(adjustPixel(0, 0, 0, identity)).toEqual([0, 0, 0]);
    expect(adjustPixel(128, 128, 128, identity)).toEqual([128, 128, 128]);
    expect(adjustPixel(255, 255, 255, identity)).toEqual([255, 255, 255]);
  });

  it("identity round-trips a colour losslessly", () => {
    // Hand-traced through the HSL conversion: (200,100,50) maps back to itself.
    expect(adjustPixel(200, 100, 50, identity)).toEqual([200, 100, 50]);
  });

  it("contrast 0 collapses every channel to mid-gray 128", () => {
    expect(adjustPixel(200, 100, 50, { ...identity, contrast: 0 })).toEqual([
      128, 128, 128,
    ]);
  });

  it("brightness 0 produces black", () => {
    expect(adjustPixel(200, 100, 50, { ...identity, brightness: 0 })).toEqual([
      0, 0, 0,
    ]);
  });

  it("zeroing a channel multiplier removes that channel (red -> black)", () => {
    expect(adjustPixel(255, 0, 0, { ...identity, redMul: 0 })).toEqual([0, 0, 0]);
  });

  it("saturation 0 desaturates to the HSL lightness gray", () => {
    // l = (max+min)/2 = (200+50)/(2*255) -> *255 = 125 exactly
    expect(adjustPixel(200, 100, 50, { ...identity, saturation: 0 })).toEqual([
      125, 125, 125,
    ]);
  });

  it("clamps high values at 255 (brightness 2x on a bright pixel)", () => {
    expect(adjustPixel(200, 200, 200, { ...identity, brightness: 2 })).toEqual([
      255, 255, 255,
    ]);
  });

  it("clamps low values at 0 (high contrast on a dark pixel)", () => {
    // (50-128)*2 + 128 = -28 -> clamp 0
    expect(adjustPixel(50, 50, 50, { ...identity, contrast: 2 })).toEqual([
      0, 0, 0,
    ]);
  });
});
