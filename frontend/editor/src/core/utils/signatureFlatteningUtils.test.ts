import { describe, expect, it } from "vitest";

import { resolveSignaturePdfRect } from "@app/utils/signatureFlatteningUtils";

describe("resolveSignaturePdfRect", () => {
  it("uses origin.{x,y} and size.{width,height} when present and flips the y-axis", () => {
    // pageHeight 1000, top-left (10, 20), size 100x50 -> pdfY = 1000 - 20 - 50 = 930
    expect(
      resolveSignaturePdfRect(
        { origin: { x: 10, y: 20 }, size: { width: 100, height: 50 } },
        1000,
      ),
    ).toEqual({ pdfX: 10, pdfY: 930, width: 100, height: 50 });
  });

  it("falls back to flat x/y and width/height keys", () => {
    // pdfY = 500 - 100 - 40 = 360
    expect(
      resolveSignaturePdfRect({ x: 5, y: 100, width: 30, height: 40 }, 500),
    ).toEqual({ pdfX: 5, pdfY: 360, width: 30, height: 40 });
  });

  it("falls back to left/top keys", () => {
    // pdfY = 200 - 10 - 50 (default height) = 140
    expect(resolveSignaturePdfRect({ left: 7, top: 10 }, 200)).toEqual({
      pdfX: 7,
      pdfY: 140,
      width: 100, // default
      height: 50, // default
    });
  });

  it("applies the 100x50 size defaults and 0 position default for an empty rect", () => {
    // originalX/Y default to 0; pdfY = 300 - 0 - 50 = 250
    expect(resolveSignaturePdfRect({}, 300)).toEqual({
      pdfX: 0,
      pdfY: 250,
      width: 100,
      height: 50,
    });
  });

  it("prefers origin/size over the flat keys when both exist", () => {
    expect(
      resolveSignaturePdfRect(
        {
          origin: { x: 1, y: 2 },
          size: { width: 3, height: 4 },
          x: 99,
          y: 99,
          width: 99,
          height: 99,
        },
        100,
      ),
    ).toEqual({ pdfX: 1, pdfY: 100 - 2 - 4, width: 3, height: 4 });
  });

  it("treats a literal 0 width/height as falsy and uses the default (|| semantics)", () => {
    // size.width 0 -> || rect.width (absent) -> || 100; size.height 0 -> 50
    const r = resolveSignaturePdfRect(
      { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } },
      100,
    );
    expect(r.width).toBe(100);
    expect(r.height).toBe(50);
    expect(r.pdfY).toBe(100 - 0 - 50); // 50
  });

  it("leaves pdfX equal to the resolved x (no horizontal flip)", () => {
    expect(resolveSignaturePdfRect({ x: 42, y: 0 }, 1000).pdfX).toBe(42);
  });
});
