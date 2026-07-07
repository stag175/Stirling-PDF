import { describe, expect, it } from "vitest";
import {
  buildSpokenText,
  clampHighlightWordIndex,
  collectSupportedLanguageCodes,
  findWordIndexAtCharIndex,
  mergeAdjacentTextItems,
  pickVoiceForLanguage,
  sortTextItemsByReadingOrder,
  type ReadAloudTextItem,
} from "@app/components/viewer/readAloudTextUtils";

// Minimal stand-in for SpeechSynthesisVoice — only `lang` is read by the utils.
const voice = (lang: string): SpeechSynthesisVoice =>
  ({ lang }) as SpeechSynthesisVoice;

// Build a ReadAloudTextItem with sane defaults; x/y set the [e, f] transform slots.
const item = (
  partial: Partial<ReadAloudTextItem> & { str: string },
): ReadAloudTextItem => ({
  transform: [1, 0, 0, 1, partial.transform?.[4] ?? 0, partial.transform?.[5] ?? 0],
  width: 10,
  height: 10,
  viewportTransform: [1, 0, 0, 1, 0, 0],
  ...partial,
});

const at = (str: string, x: number, y: number, width = 10): ReadAloudTextItem => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  width,
  height: 10,
  viewportTransform: [1, 0, 0, 1, 0, 0],
});

describe("pickVoiceForLanguage", () => {
  it("returns null when no voices are available", () => {
    expect(pickVoiceForLanguage([], "en-US")).toBeNull();
  });

  it("prefers an exact lang match", () => {
    const voices = [voice("en-US"), voice("es-ES"), voice("es-MX")];
    expect(pickVoiceForLanguage(voices, "es-ES")).toBe(voices[1]);
  });

  it("falls back to a base-language match when no exact match exists", () => {
    const voices = [voice("en-US"), voice("es-MX")];
    // requested es-ES -> first voice whose lang starts with "es"
    expect(pickVoiceForLanguage(voices, "es-ES")).toBe(voices[1]);
  });

  it("base-language match works for a bare code with no region", () => {
    const voices = [voice("fr-CA"), voice("de-DE")];
    expect(pickVoiceForLanguage(voices, "fr")).toBe(voices[0]);
  });

  it("falls back to any English voice when the language is unavailable", () => {
    const voices = [voice("de-DE"), voice("en-GB")];
    expect(pickVoiceForLanguage(voices, "ja-JP")).toBe(voices[1]);
  });

  it("falls back to the first voice when nothing else matches", () => {
    const voices = [voice("de-DE"), voice("fr-FR")];
    expect(pickVoiceForLanguage(voices, "ja-JP")).toBe(voices[0]);
  });

  it("does not treat 'en' base match as a generic-English fallback (exact wins ordering)", () => {
    // base match short-circuits before the English fallback branch
    const voices = [voice("en-AU"), voice("en-US")];
    expect(pickVoiceForLanguage(voices, "en-ZZ")).toBe(voices[0]);
  });
});

describe("collectSupportedLanguageCodes", () => {
  it("always includes the English fallback codes even with no voices", () => {
    const codes = collectSupportedLanguageCodes([]);
    expect(codes.has("en")).toBe(true);
    expect(codes.has("en-GB")).toBe(true);
    expect(codes.has("en-US")).toBe(true);
    expect(codes.size).toBe(3);
  });

  it("adds each voice's full lang and base lang", () => {
    const codes = collectSupportedLanguageCodes([voice("fr-CA"), voice("de-DE")]);
    expect(codes.has("fr-CA")).toBe(true);
    expect(codes.has("fr")).toBe(true);
    expect(codes.has("de-DE")).toBe(true);
    expect(codes.has("de")).toBe(true);
  });

  it("deduplicates overlapping language codes", () => {
    const codes = collectSupportedLanguageCodes([
      voice("en-US"),
      voice("en-GB"),
      voice("en-US"),
    ]);
    // en, en-GB, en-US — no duplicates despite repeats and fallback overlap
    expect(codes.size).toBe(3);
  });
});

describe("sortTextItemsByReadingOrder", () => {
  it("sorts top-to-bottom by descending PDF y", () => {
    const items = [at("bottom", 0, 100), at("top", 0, 300), at("mid", 0, 200)];
    expect(sortTextItemsByReadingOrder(items).map((i) => i.str)).toEqual([
      "top",
      "mid",
      "bottom",
    ]);
  });

  it("sorts left-to-right within the same line", () => {
    const items = [at("c", 300, 100), at("a", 0, 100), at("b", 150, 102)];
    expect(sortTextItemsByReadingOrder(items).map((i) => i.str)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("treats items within the 5px y threshold as the same line", () => {
    // y differs by exactly 5 -> still same line (uses > threshold), so x decides
    const items = [at("right", 50, 100), at("left", 10, 105)];
    expect(sortTextItemsByReadingOrder(items).map((i) => i.str)).toEqual([
      "left",
      "right",
    ]);
  });

  it("separates lines when y differs by more than the threshold", () => {
    const items = [at("lower-left", 0, 100), at("upper-right", 50, 110)];
    // y diff 10 > 5 -> upper (higher y) comes first regardless of x
    expect(sortTextItemsByReadingOrder(items).map((i) => i.str)).toEqual([
      "upper-right",
      "lower-left",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [at("b", 0, 100), at("a", 0, 200)];
    const snapshot = items.map((i) => i.str);
    sortTextItemsByReadingOrder(items);
    expect(items.map((i) => i.str)).toEqual(snapshot);
  });

  it("returns an empty array for empty input", () => {
    expect(sortTextItemsByReadingOrder([])).toEqual([]);
  });
});

describe("mergeAdjacentTextItems", () => {
  it("merges horizontally adjacent same-line characters into one word", () => {
    // "H" at x0 w10, "i" at x12 (gap 2 < 5) -> merged into "Hi"
    const merged = mergeAdjacentTextItems([
      at("H", 0, 100, 10),
      at("i", 12, 100, 8),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].str).toBe("Hi");
    // width grows by gap (2) + next width (8): 10 + 2 + 8 = 20
    expect(merged[0].width).toBe(20);
  });

  it("does not merge across a whitespace boundary item", () => {
    const merged = mergeAdjacentTextItems([
      at("a", 0, 100, 10),
      at(" ", 10, 100, 4),
      at("b", 14, 100, 10),
    ]);
    expect(merged.map((m) => m.str)).toEqual(["a", " ", "b"]);
  });

  it("does not merge when the horizontal gap is at or above the threshold", () => {
    // gap of exactly 5 is NOT merged (uses < threshold)
    const merged = mergeAdjacentTextItems([
      at("a", 0, 100, 10),
      at("b", 15, 100, 10),
    ]);
    expect(merged.map((m) => m.str)).toEqual(["a", "b"]);
  });

  it("does not merge items on different lines", () => {
    const merged = mergeAdjacentTextItems([
      at("a", 0, 100, 10),
      at("b", 12, 110, 10), // y diff 10 > 5 -> different line
    ]);
    expect(merged.map((m) => m.str)).toEqual(["a", "b"]);
  });

  it("does not mutate the input items", () => {
    const input = [at("H", 0, 100, 10), at("i", 12, 100, 8)];
    const originalStr = input[0].str;
    const originalWidth = input[0].width;
    mergeAdjacentTextItems(input);
    expect(input[0].str).toBe(originalStr);
    expect(input[0].width).toBe(originalWidth);
  });

  it("clamps negative gaps to zero when growing width", () => {
    // overlapping items: x of second is before end of first -> negative gap
    const merged = mergeAdjacentTextItems([
      at("a", 0, 100, 10),
      at("b", 5, 100, 10), // gap = 5 - (0 + 10) = -5
    ]);
    expect(merged).toHaveLength(1);
    // 10 + max(0, -5) + 10 = 20
    expect(merged[0].width).toBe(20);
  });

  it("returns an empty array for empty input", () => {
    expect(mergeAdjacentTextItems([])).toEqual([]);
  });

  it("preserves viewportTransform on merged and standalone items", () => {
    const merged = mergeAdjacentTextItems([
      item({ str: "x", viewportTransform: [2, 0, 0, 2, 5, 6] }),
    ]);
    expect(merged[0].viewportTransform).toEqual([2, 0, 0, 2, 5, 6]);
  });
});

describe("buildSpokenText", () => {
  it("joins item strings with single spaces", () => {
    expect(buildSpokenText([at("Hello", 0, 0), at("world", 0, 0)])).toBe(
      "Hello world",
    );
  });

  it("collapses runs of whitespace and trims", () => {
    expect(buildSpokenText([at("  a ", 0, 0), at("   ", 0, 0), at(" b ", 0, 0)])).toBe(
      "a b",
    );
  });

  it("returns an empty string for no items", () => {
    expect(buildSpokenText([])).toBe("");
  });

  it("returns an empty string when all items are whitespace", () => {
    expect(buildSpokenText([at("  ", 0, 0), at("\t", 0, 0)])).toBe("");
  });
});

describe("clampHighlightWordIndex", () => {
  it("returns the index unchanged when in range", () => {
    expect(clampHighlightWordIndex(2, 5)).toBe(2);
  });

  it("clamps to the last word index when over the count", () => {
    expect(clampHighlightWordIndex(10, 4)).toBe(3);
  });

  it("clamps negative requests to zero", () => {
    expect(clampHighlightWordIndex(-3, 4)).toBe(0);
  });

  it("returns 0 for an empty word list", () => {
    expect(clampHighlightWordIndex(5, 0)).toBe(0);
    expect(clampHighlightWordIndex(0, 0)).toBe(0);
  });

  it("returns 0 for a single-word list", () => {
    expect(clampHighlightWordIndex(7, 1)).toBe(0);
  });
});

describe("findWordIndexAtCharIndex", () => {
  const words = ["Hello", "brave", "world"]; // spoken: "Hello brave world"

  it("finds the first word at offset 0", () => {
    expect(findWordIndexAtCharIndex(words, 0)).toBe(0);
  });

  it("finds a word at an interior character", () => {
    // "Hello"=0..4, space=5, "brave"=6..10
    expect(findWordIndexAtCharIndex(words, 8)).toBe(1);
  });

  it("finds the word at its first character", () => {
    expect(findWordIndexAtCharIndex(words, 6)).toBe(1);
  });

  it("returns -1 when the offset lands on a separating space", () => {
    // index 5 is the space between word 0 and word 1
    expect(findWordIndexAtCharIndex(words, 5)).toBe(-1);
  });

  it("returns -1 when the offset is past the end", () => {
    // last word "world" occupies 12..16; 17 is beyond
    expect(findWordIndexAtCharIndex(words, 17)).toBe(-1);
  });

  it("finds the final word's last character", () => {
    // "world" -> 12..16, last char at index 16
    expect(findWordIndexAtCharIndex(words, 16)).toBe(2);
  });

  it("returns -1 for an empty word list", () => {
    expect(findWordIndexAtCharIndex([], 0)).toBe(-1);
  });
});
