import { describe, expect, it } from "vitest";
import {
  buildFontFamilyName,
  buildFontLookupKeys,
  getFontFormatHint,
  getFontMimeType,
  normalizeFontFormat,
  normalizePageNumber,
} from "@app/tools/pdfTextEditor/pdfTextEditorFontUtils";
import type { PdfJsonFont } from "@app/tools/pdfTextEditor/pdfTextEditorTypes";

describe("normalizeFontFormat", () => {
  it("falls back to ttf for empty / missing input", () => {
    expect(normalizeFontFormat()).toBe("ttf");
    expect(normalizeFontFormat(null)).toBe("ttf");
    expect(normalizeFontFormat(undefined)).toBe("ttf");
    expect(normalizeFontFormat("")).toBe("ttf");
  });

  it("detects woff2 before woff (order matters)", () => {
    expect(normalizeFontFormat("woff2")).toBe("woff2");
    expect(normalizeFontFormat("font/woff2")).toBe("woff2");
    // A string containing both must resolve to the more specific woff2.
    expect(normalizeFontFormat("woff2 (was woff)")).toBe("woff2");
  });

  it("detects woff", () => {
    expect(normalizeFontFormat("woff")).toBe("woff");
    expect(normalizeFontFormat("application/font-woff")).toBe("woff");
  });

  it("maps otf and cff to otf", () => {
    expect(normalizeFontFormat("otf")).toBe("otf");
    expect(normalizeFontFormat("OpenType/OTF")).toBe("otf");
    expect(normalizeFontFormat("cff")).toBe("otf");
    expect(normalizeFontFormat("Type1C-CFF")).toBe("otf");
  });

  it("is case-insensitive", () => {
    expect(normalizeFontFormat("WOFF2")).toBe("woff2");
    expect(normalizeFontFormat("WoFf")).toBe("woff");
    expect(normalizeFontFormat("OTF")).toBe("otf");
  });

  it("falls back to ttf for unrecognised formats", () => {
    expect(normalizeFontFormat("truetype")).toBe("ttf");
    expect(normalizeFontFormat("something-else")).toBe("ttf");
  });
});

describe("getFontMimeType", () => {
  it("maps each canonical format to its MIME type", () => {
    expect(getFontMimeType("woff2")).toBe("font/woff2");
    expect(getFontMimeType("woff")).toBe("font/woff");
    expect(getFontMimeType("otf")).toBe("font/otf");
    expect(getFontMimeType("ttf")).toBe("font/ttf");
  });
});

describe("getFontFormatHint", () => {
  it("maps each canonical format to its @font-face hint", () => {
    expect(getFontFormatHint("woff2")).toBe("woff2");
    expect(getFontFormatHint("woff")).toBe("woff");
    expect(getFontFormatHint("otf")).toBe("opentype");
    expect(getFontFormatHint("ttf")).toBe("truetype");
  });

  it("round-trips a normalised format into a hint", () => {
    expect(getFontFormatHint(normalizeFontFormat("CFF"))).toBe("opentype");
    expect(getFontFormatHint(normalizeFontFormat("unknown"))).toBe("truetype");
  });
});

describe("buildFontFamilyName", () => {
  it("prefers a trimmed baseName", () => {
    expect(buildFontFamilyName({ baseName: "Helvetica" })).toBe(
      "pdf-font-Helvetica",
    );
    expect(buildFontFamilyName({ baseName: "  Arial  " })).toBe(
      "pdf-font-Arial",
    );
  });

  it("sanitises characters outside [a-zA-Z0-9_-]", () => {
    // PDF subset prefix like "ABCDEF+Times New Roman"
    expect(buildFontFamilyName({ baseName: "ABCDEF+Times New Roman" })).toBe(
      "pdf-font-ABCDEFTimesNewRoman",
    );
    expect(buildFontFamilyName({ baseName: "My_Font-1.2" })).toBe(
      "pdf-font-My_Font-12",
    );
  });

  it("falls back to uid then id then 'font'", () => {
    expect(buildFontFamilyName({ baseName: "", uid: "u-9" })).toBe(
      "pdf-font-u-9",
    );
    expect(buildFontFamilyName({ baseName: "   ", uid: "u-9" })).toBe(
      "pdf-font-u-9",
    );
    expect(buildFontFamilyName({ id: "F1" })).toBe("pdf-font-F1");
    expect(buildFontFamilyName({})).toBe("pdf-font-font");
  });

  it("treats null baseName as empty and uses uid", () => {
    expect(buildFontFamilyName({ baseName: null, uid: "abc" })).toBe(
      "pdf-font-abc",
    );
  });
});

describe("normalizePageNumber", () => {
  it("converts a zero-based index to a one-based number", () => {
    expect(normalizePageNumber(0)).toBe(1);
    expect(normalizePageNumber(4)).toBe(5);
  });

  it("returns null for missing or NaN input", () => {
    expect(normalizePageNumber(null)).toBeNull();
    expect(normalizePageNumber(undefined)).toBeNull();
    expect(normalizePageNumber(Number.NaN)).toBeNull();
  });

  it("treats negative indices literally (no clamping)", () => {
    expect(normalizePageNumber(-1)).toBe(0);
  });
});

describe("buildFontLookupKeys", () => {
  it("returns just the fontId when no page/font info is available", () => {
    expect(buildFontLookupKeys("F1", undefined, undefined)).toEqual(["F1"]);
    expect(buildFontLookupKeys("F1", null, null)).toEqual(["F1"]);
  });

  it("emits keys in most-to-least-specific order", () => {
    const font: PdfJsonFont = { id: "F1", uid: "uid-1", pageNumber: 2 };
    expect(buildFontLookupKeys("F1", font, 0)).toEqual([
      "1:F1", // pageNumber from index (0 -> 1) + fontId
      "uid-1", // font.uid
      "2:F1", // font.pageNumber + font.id
      "F1", // raw fontId
    ]);
  });

  it("de-duplicates while preserving first-seen order", () => {
    // font.uid duplicates the index-derived key; the raw fontId also collides.
    const font: PdfJsonFont = { id: "F1", uid: "1:F1", pageNumber: 0 };
    expect(buildFontLookupKeys("F1", font, 0)).toEqual(["1:F1", "0:F1", "F1"]);
  });

  it("omits the font.pageNumber key when pageNumber is null/undefined", () => {
    const font: PdfJsonFont = { id: "F1", uid: "uid-1", pageNumber: null };
    expect(buildFontLookupKeys("F1", font, undefined)).toEqual([
      "uid-1",
      "F1",
    ]);
  });

  it("includes the 0:F1 key when font.pageNumber is 0 (falsy but valid)", () => {
    const font: PdfJsonFont = { id: "F1", pageNumber: 0 };
    expect(buildFontLookupKeys("F1", font, undefined)).toEqual(["0:F1", "F1"]);
  });

  it("drops empty-string keys", () => {
    const font: PdfJsonFont = { id: "", uid: "", pageNumber: 3 };
    // uid is "" (dropped); font.id is "" so the "3:" key is not emitted; only fontId remains.
    expect(buildFontLookupKeys("F1", font, undefined)).toEqual(["F1"]);
  });
});
