import { describe, it, expect } from "vitest";
import { validatePageNumbers } from "@app/utils/pageSelection";

describe("validatePageNumbers", () => {
  describe("empty / whitespace-only input", () => {
    const emptyCases = ["", " ", "   ", "\t", "\n", " \t \n "];
    it.each(emptyCases)("returns false for empty/whitespace %j", (input) => {
      expect(validatePageNumbers(input)).toBe(false);
    });
  });

  describe("'all' token", () => {
    const validAll = ["all", "ALL", "All", "aLl"];
    it.each(validAll)("accepts case-insensitive 'all': %j", (input) => {
      expect(validatePageNumbers(input)).toBe(true);
    });

    it("accepts 'all' with surrounding whitespace (trimmed)", () => {
      expect(validatePageNumbers("  all  ")).toBe(true);
    });

    it("rejects 'all' embedded with other text", () => {
      expect(validatePageNumbers("allpages")).toBe(false);
      expect(validatePageNumbers("all1")).toBe(false);
    });
  });

  describe("single page numbers", () => {
    const validSingles = ["1", "5", "10", "99", "100", "123456"];
    it.each(validSingles)("accepts positive integer %j", (input) => {
      expect(validatePageNumbers(input)).toBe(true);
    });

    it("rejects zero", () => {
      expect(validatePageNumbers("0")).toBe(false);
    });

    it("rejects numbers with leading zeros", () => {
      // singlePageRegex requires [1-9] first char, so "01" fails all branches
      expect(validatePageNumbers("01")).toBe(false);
      expect(validatePageNumbers("007")).toBe(false);
    });

    it("rejects negative numbers", () => {
      expect(validatePageNumbers("-1")).toBe(false);
    });

    it("rejects decimals", () => {
      expect(validatePageNumbers("1.5")).toBe(false);
    });

    it("rejects non-numeric tokens", () => {
      expect(validatePageNumbers("abc")).toBe(false);
      expect(validatePageNumbers("x")).toBe(false);
    });
  });

  describe("ranges", () => {
    const validRanges = ["1-5", "10-20", "1-1", "100-200"];
    it.each(validRanges)("accepts closed range %j", (input) => {
      expect(validatePageNumbers(input)).toBe(true);
    });

    const validOpenRanges = ["10-", "1-", "999-"];
    it.each(validOpenRanges)("accepts open-ended range %j", (input) => {
      expect(validatePageNumbers(input)).toBe(true);
    });

    it("rejects range starting at 0", () => {
      // "0-5": "0" fails single, range requires [1-9] start, math requires an 'n'
      expect(validatePageNumbers("0-5")).toBe(false);
    });

    it("rejects open range starting at 0", () => {
      expect(validatePageNumbers("0-")).toBe(false);
    });

    it("rejects range with leading zero in start", () => {
      expect(validatePageNumbers("01-5")).toBe(false);
    });

    it("rejects range with leading zero in end", () => {
      // "1-05": end portion does not match [1-9]\d* and there is no 'n' for math
      expect(validatePageNumbers("1-05")).toBe(false);
    });

    it("rejects a bare dash", () => {
      expect(validatePageNumbers("-")).toBe(false);
    });

    it("rejects reversed open range (leading dash form)", () => {
      expect(validatePageNumbers("-5")).toBe(false);
    });
  });

  describe("math 'n' expressions", () => {
    const validMath = [
      "n",
      "2n",
      "2n+1",
      "3n-1",
      "n+1",
      "2*n",
      "(n+1)",
      "2n + 1",
      "n*2",
      "n/2",
      "2*(n+1)",
    ];
    it.each(validMath)("accepts math expression %j", (input) => {
      expect(validatePageNumbers(input)).toBe(true);
    });

    it("requires an 'n' in math expressions (pure arithmetic without n is not a math token)", () => {
      // "2+1" has no 'n', is not a single page, range, or 'all' -> false
      expect(validatePageNumbers("2+1")).toBe(false);
      expect(validatePageNumbers("2*3")).toBe(false);
    });

    it("rejects math expressions containing disallowed characters", () => {
      expect(validatePageNumbers("n%2")).toBe(false);
      expect(validatePageNumbers("n^2")).toBe(false);
      expect(validatePageNumbers("2nx")).toBe(false);
    });
  });

  describe("comma-separated lists", () => {
    it("accepts a list of valid single pages", () => {
      expect(validatePageNumbers("1,2,3")).toBe(true);
    });

    it("accepts a mixed list of singles, ranges, open ranges, and math", () => {
      expect(validatePageNumbers("1,3-5,10-,2n+1,all")).toBe(true);
    });

    it("normalizes spaces around commas", () => {
      expect(validatePageNumbers("1 , 2 , 3")).toBe(true);
      expect(validatePageNumbers(" 1,  5-7 ,  10- ")).toBe(true);
    });

    it("rejects the whole list if any single part is invalid", () => {
      expect(validatePageNumbers("1,2,abc")).toBe(false);
      expect(validatePageNumbers("1,0,3")).toBe(false);
      expect(validatePageNumbers("1-5,foo")).toBe(false);
    });

    it("rejects lists with empty parts (trailing comma)", () => {
      expect(validatePageNumbers("1,2,")).toBe(false);
    });

    it("rejects lists with empty parts (leading comma)", () => {
      expect(validatePageNumbers(",1,2")).toBe(false);
    });

    it("rejects lists with consecutive commas", () => {
      expect(validatePageNumbers("1,,2")).toBe(false);
    });
  });

  describe("whitespace handling inside tokens", () => {
    it("strips internal whitespace so split numbers merge (per normalization)", () => {
      // "1 2" -> spaces removed -> "12" which is a valid single page
      expect(validatePageNumbers("1 2")).toBe(true);
    });

    it("strips whitespace inside a range", () => {
      // "1 - 5" -> "1-5"
      expect(validatePageNumbers("1 - 5")).toBe(true);
    });
  });
});
