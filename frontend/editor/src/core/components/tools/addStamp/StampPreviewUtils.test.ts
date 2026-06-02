import { describe, expect, it } from "vitest";

import {
  getAlphabetPreviewScale,
  getDefaultFontSizeForAlphabet,
  getFirstSelectedPage,
  getFontFamily,
} from "@app/components/tools/addStamp/StampPreviewUtils";

describe("getFirstSelectedPage", () => {
  it.each<[string, number]>([
    ["", 1], // empty -> default
    ["5", 5], // single page
    ["3,7", 3], // first CSV part
    ["3-5", 3], // range -> low bound
    ["10-20", 10],
    ["3 - 5", 3], // spaces around the dash are allowed by the range regex
    [" 5 ", 5], // surrounding whitespace trimmed
    [" , ,4", 4], // empty parts filtered out
    ["abc,6", 6], // first invalid part skipped, first valid used
    ["abc", 1], // no valid number -> default
    ["0", 1], // 0 is not > 0 -> skipped -> default
    ["-3", 1], // negative not matched (range needs leading digit) -> default
    ["0-5", 1], // range low 0 fails > 0, "0-5" not a plain int -> default
  ])("parses %j -> %i", (input, expected) => {
    expect(getFirstSelectedPage(input)).toBe(expected);
  });
});

describe("getFontFamily", () => {
  it("maps known alphabets to their font stacks", () => {
    expect(getFontFamily("arabic")).toContain("Noto Sans Arabic");
    expect(getFontFamily("japanese")).toContain("Noto Sans JP");
    expect(getFontFamily("thai")).toContain("Noto Sans Thai");
  });

  it("falls back to the roman/default stack for roman and unknown alphabets", () => {
    const fallback = "Noto Sans, Arial, Helvetica, sans-serif";
    expect(getFontFamily("roman")).toBe(fallback);
    expect(getFontFamily("klingon")).toBe(fallback);
  });
});

describe("getAlphabetPreviewScale", () => {
  it("returns the per-alphabet scale", () => {
    expect(getAlphabetPreviewScale("arabic")).toBeCloseTo(1.2);
    expect(getAlphabetPreviewScale("roman")).toBeCloseTo(1.0 / 1.18);
  });

  it("falls back to 1.0 for an unknown alphabet", () => {
    expect(getAlphabetPreviewScale("klingon")).toBe(1.0);
  });
});

describe("getDefaultFontSizeForAlphabet", () => {
  it("returns the per-alphabet default font size", () => {
    expect(getDefaultFontSizeForAlphabet("roman")).toBe(80);
    expect(getDefaultFontSizeForAlphabet("chinese")).toBe(30); // intentionally smaller
  });

  it("falls back to 80 for an unknown alphabet", () => {
    expect(getDefaultFontSizeForAlphabet("klingon")).toBe(80);
  });
});
