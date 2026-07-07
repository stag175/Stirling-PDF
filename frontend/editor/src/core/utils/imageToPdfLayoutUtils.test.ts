import { describe, expect, it } from "vitest";

import {
  calculateImagePlacement,
  PAGE_SIZES,
  resolvePageDimensions,
} from "@app/utils/imageToPdfLayoutUtils";

describe("resolvePageDimensions", () => {
  it("keep uses the image's own dimensions", () => {
    expect(resolvePageDimensions("keep", 300, 400)).toEqual({
      pageWidth: 300,
      pageHeight: 400,
    });
  });

  it("letter portrait image keeps portrait letter", () => {
    expect(resolvePageDimensions("letter", 400, 600)).toEqual({
      pageWidth: PAGE_SIZES.Letter[0],
      pageHeight: PAGE_SIZES.Letter[1],
    });
  });

  it("letter landscape image rotates the page to landscape", () => {
    expect(resolvePageDimensions("letter", 600, 400)).toEqual({
      pageWidth: PAGE_SIZES.Letter[1],
      pageHeight: PAGE_SIZES.Letter[0],
    });
  });

  it("A4 (default) portrait image stays portrait", () => {
    expect(resolvePageDimensions("A4", 400, 600)).toEqual({
      pageWidth: PAGE_SIZES.A4[0],
      pageHeight: PAGE_SIZES.A4[1],
    });
  });

  it("A4 landscape image rotates to landscape", () => {
    expect(resolvePageDimensions("A4", 600, 400)).toEqual({
      pageWidth: PAGE_SIZES.A4[1],
      pageHeight: PAGE_SIZES.A4[0],
    });
  });

  it("square image is treated as portrait (no swap)", () => {
    // imageIsLandscape = 500 > 500 = false; A4 page is portrait => no swap
    expect(resolvePageDimensions("A4", 500, 500)).toEqual({
      pageWidth: PAGE_SIZES.A4[0],
      pageHeight: PAGE_SIZES.A4[1],
    });
  });
});

describe("calculateImagePlacement", () => {
  it("stretchToFit fills the whole page", () => {
    expect(calculateImagePlacement(100, 200, 50, 50, true, "A4")).toEqual({
      drawX: 0,
      drawY: 0,
      drawWidth: 100,
      drawHeight: 200,
    });
  });

  it("keep fills the whole page regardless of stretch flag", () => {
    expect(calculateImagePlacement(300, 400, 300, 400, false, "keep")).toEqual({
      drawX: 0,
      drawY: 0,
      drawWidth: 300,
      drawHeight: 400,
    });
  });

  it("wide image on a portrait page letterboxes (centred vertically)", () => {
    // page 100x200 (portrait), image 200x100 (aspect 2) > pageAspect 0.5
    expect(calculateImagePlacement(100, 200, 200, 100, false, "A4")).toEqual({
      drawX: 0,
      drawY: 75, // (200 - 50) / 2
      drawWidth: 100,
      drawHeight: 50, // 100 / 2
    });
  });

  it("tall image on a landscape page pillarboxes (centred horizontally)", () => {
    // page 200x100 (landscape), image 100x200 (aspect 0.5) <= pageAspect 2
    expect(calculateImagePlacement(200, 100, 100, 200, false, "A4")).toEqual({
      drawX: 75, // (200 - 50) / 2
      drawY: 0,
      drawWidth: 50, // 100 * 0.5
      drawHeight: 100,
    });
  });

  it("matching aspect ratio fills exactly with no offset", () => {
    expect(calculateImagePlacement(100, 100, 50, 50, false, "A4")).toEqual({
      drawX: 0,
      drawY: 0,
      drawWidth: 100,
      drawHeight: 100,
    });
  });
});
