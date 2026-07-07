import { describe, it, expect } from "vitest";
import { truncateCenter, removeEmojis } from "@app/utils/textUtils";

describe("truncateCenter", () => {
  it("1) returns text unchanged when length is below maxLength", () => {
    expect(truncateCenter("short.pdf", 25)).toBe("short.pdf");
  });

  it("2) returns text unchanged when length exactly equals maxLength (boundary)", () => {
    const text = "a".repeat(25);
    expect(truncateCenter(text, 25)).toBe(text);
    expect(truncateCenter(text, 25)).toHaveLength(25);
  });

  it("3) truncates from the centre once length exceeds maxLength (boundary +1)", () => {
    // length 26, maxLength 25 -> charsToShow = 22, front = 11, back = 11
    const text = "a".repeat(26);
    const result = truncateCenter(text, 25);
    expect(result).toBe("a".repeat(11) + "..." + "a".repeat(11));
    expect(result).toHaveLength(25);
  });

  it("4) preserves the start and end around the ellipsis", () => {
    // "very-long-filename.pdf" length 22, maxLength 12
    // charsToShow = 9, front = ceil(4.5) = 5, back = floor(4.5) = 4
    const result = truncateCenter("very-long-filename.pdf", 12);
    expect(result).toBe("very-....pdf");
    expect(result).toHaveLength(12);
  });

  it("5) front gets the extra character when charsToShow is odd", () => {
    // maxLength 10 -> charsToShow = 7, front = ceil(3.5) = 4, back = floor(3.5) = 3
    const result = truncateCenter("0123456789ABCDEF", 10);
    expect(result).toBe("0123" + "..." + "DEF");
    expect(result).toHaveLength(10);
  });

  it("6) splits evenly when charsToShow is even", () => {
    // maxLength 9 -> charsToShow = 6, front = 3, back = 3
    const result = truncateCenter("0123456789ABCDEF", 9);
    expect(result).toBe("012" + "..." + "DEF");
    expect(result).toHaveLength(9);
  });

  it("7) uses the default maxLength of 25 when omitted", () => {
    const short = "a".repeat(25);
    expect(truncateCenter(short)).toBe(short);
    const long = "a".repeat(30);
    expect(truncateCenter(long)).toBe("a".repeat(11) + "..." + "a".repeat(11));
    expect(truncateCenter(long)).toHaveLength(25);
  });

  it("8) handles an empty string", () => {
    expect(truncateCenter("", 25)).toBe("");
    expect(truncateCenter("")).toBe("");
  });

  it("9) keeps only the ellipsis when charsToShow is zero (maxLength 3)", () => {
    // charsToShow = 0, front = 0, back = 0 -> just the ellipsis
    expect(truncateCenter("abcdef", 3)).toBe("...");
  });

  it("10) produces a result longer than maxLength when maxLength < ellipsis length", () => {
    // maxLength 2 -> charsToShow = -1, front = ceil(-0.5) = 0, back = floor(-0.5) = -1
    // substring(0, 0) = "", substring(length - (-1)) = substring(length + 1) = ""
    // documents the underflow branch: output is just the ellipsis
    const result = truncateCenter("abcdef", 2);
    expect(result).toBe("...");
  });

  it("11) is a no-op for whitespace-only strings within the limit", () => {
    expect(truncateCenter("   ", 25)).toBe("   ");
  });

  it("12) truncates a realistic long filename deterministically", () => {
    // length 41, maxLength 20 -> charsToShow = 17, front = 9, back = 8
    const name = "annual-financial-report-2026-final.pdf"; // length 38
    const result = truncateCenter(name, 20);
    const front = name.substring(0, 9);
    const back = name.substring(name.length - 8);
    expect(result).toBe(front + "..." + back);
    expect(result).toHaveLength(20);
  });
});

describe("removeEmojis", () => {
  it("13) strips a basic smiley from the 1F600-1F64F range", () => {
    expect(removeEmojis("Hello \u{1F600} World")).toBe("Hello  World");
  });

  it("14) strips a symbol/pictograph from the 1F300-1F5FF range", () => {
    // U+1F4A9 (pile of poo) is within this range
    expect(removeEmojis("file\u{1F4A9}name")).toBe("filename");
  });

  it("15) strips a transport emoji from the 1F680-1F6FF range", () => {
    // U+1F680 (rocket)
    expect(removeEmojis("launch \u{1F680}")).toBe("launch ");
  });

  it("16) strips regional indicator symbols from the 1F1E0-1F1FF range", () => {
    // U+1F1FA U+1F1F8 forms the US flag; both are in range
    expect(removeEmojis("US\u{1F1FA}\u{1F1F8}flag")).toBe("USflag");
  });

  it("17) strips misc symbols from the 2600-26FF range", () => {
    // U+2600 (black sun with rays)
    expect(removeEmojis("sun\u{2600}shine")).toBe("sunshine");
  });

  it("18) strips dingbats from the 2700-27BF range", () => {
    // U+2705 (white heavy check mark)
    expect(removeEmojis("done\u{2705}")).toBe("done");
  });

  it("19) removes multiple emojis across different ranges in one pass", () => {
    const input = "a\u{1F600}b\u{1F4A9}c\u{1F680}d\u{2600}e\u{2705}f";
    expect(removeEmojis(input)).toBe("abcdef");
  });

  it("20) leaves plain ASCII text untouched", () => {
    const text = "The quick brown fox jumps over 13 lazy dogs!";
    expect(removeEmojis(text)).toBe(text);
  });

  it("21) returns an empty string for empty input", () => {
    expect(removeEmojis("")).toBe("");
  });

  it("22) returns an empty string when input is only emojis", () => {
    expect(removeEmojis("\u{1F600}\u{1F4A9}\u{1F680}")).toBe("");
  });

  it("23) preserves non-emoji unicode characters outside the configured ranges", () => {
    // Accented letters, CJK and arrows (U+2192) are outside the emoji ranges
    const text = "café 中文 → end";
    expect(removeEmojis(text)).toBe(text);
  });

  it("24) leaves codepoints just below a range boundary intact", () => {
    // U+25FF is one below the 2600 range start, U+1F2FF is one below 1F300
    const text = "x◿y\u{1F2FF}z";
    expect(removeEmojis(text)).toBe(text);
  });

  it("25) removes codepoints exactly on the range boundaries", () => {
    // U+2600 (start) and U+26FF (end) of the misc-symbols range
    expect(removeEmojis("a\u{2600}b\u{26FF}c")).toBe("abc");
  });

  it("26) does not mutate the original string reference semantics", () => {
    const input = "ok \u{1F600}";
    const output = removeEmojis(input);
    expect(input).toBe("ok \u{1F600}");
    expect(output).toBe("ok ");
  });
});
