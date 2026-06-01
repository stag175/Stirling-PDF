import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  minScoreForQuery,
  isFuzzyMatch,
  rankByFuzzy,
  normalizeForSearch,
  idToWords,
} from "@app/utils/fuzzySearch";

describe("fuzzySearch", () => {
  describe("normalizeForSearch", () => {
    it("lowercases, trims, and strips diacritics", () => {
      expect(normalizeForSearch("  Café  ")).toBe("cafe");
      expect(normalizeForSearch("ÀÉÎÕÜ")).toBe("aeiou");
      expect(normalizeForSearch("Hello World")).toBe("hello world");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(normalizeForSearch("   ")).toBe("");
      expect(normalizeForSearch("")).toBe("");
    });
  });

  describe("scoreMatch", () => {
    it("returns 0 when the normalized query is empty", () => {
      expect(scoreMatch("", "anything")).toBe(0);
      expect(scoreMatch("   ", "anything")).toBe(0);
    });

    it("scores an exact full match highest (pos 0, equal length)", () => {
      // pos = 0, target.length - query.length = 0 => 100 - 0 - 0
      expect(scoreMatch("add", "add")).toBe(100);
    });

    it("rewards a substring match at the start over a longer target", () => {
      // "add password" -> pos 0, len 12, query len 3 => 100 - 0 - 9
      expect(scoreMatch("add", "Add Password")).toBe(91);
    });

    it("penalizes substring matches that occur later in the target", () => {
      // "add password" -> indexOf("password") = 4, len 12, query len 8
      // => 100 - 4 - max(0, 12 - 8) = 100 - 4 - 4
      expect(scoreMatch("password", "Add Password")).toBe(92);
    });

    it("treats query and target diacritic-insensitively for substrings", () => {
      // normalizes to "cafe" included in "le cafe" at pos 3, len 7, query len 4
      // => 100 - 3 - max(0, 7 - 4) = 100 - 3 - 3
      expect(scoreMatch("Café", "Le Café")).toBe(94);
    });

    it("falls back to Levenshtein similarity for non-substring near matches", () => {
      // "aple" not a substring of "apple"; token "apple" does not include "aple".
      // distance = 1, maxLen = 5 => floor((1 - 1/5) * 60) = floor(48)
      expect(scoreMatch("aple", "apple")).toBe(48);
    });

    it("scores a completely dissimilar pair low via Levenshtein", () => {
      // "xyz" vs "abc": distance 3, maxLen 3 => floor((1 - 1) * 60) = 0
      expect(scoreMatch("xyz", "abc")).toBe(0);
    });

    it("scores partial Levenshtein overlap between 0 and the substring range", () => {
      // "cat" vs "car": distance 1, maxLen 3 => floor((1 - 1/3) * 60) = floor(40) = 40
      expect(scoreMatch("cat", "car")).toBe(40);
    });

    it("caps the Levenshtein target at 64 chars but uses full length for the ratio", () => {
      // Distance is measured against the first 64 chars (all "z"): edit distance
      // from "query" (len 5) to 64 "z" is 64. The ratio denominator uses the
      // full target length (200): floor((1 - 64/200) * 60) = floor(40.8) = 40.
      const longTarget = "z".repeat(200);
      expect(scoreMatch("query", longTarget)).toBe(40);
    });

    it("is symmetric-agnostic: substring direction matters", () => {
      // query longer than target cannot be a substring -> Levenshtein path
      // "password" vs "pass": distance 4, maxLen 8 => floor((1 - 4/8) * 60) = floor(30)
      expect(scoreMatch("password", "pass")).toBe(30);
    });
  });

  describe("minScoreForQuery", () => {
    it("returns 40 for queries of length <= 3", () => {
      expect(minScoreForQuery("a")).toBe(40);
      expect(minScoreForQuery("abc")).toBe(40);
    });

    it("returns 30 for queries of length 4 to 6", () => {
      expect(minScoreForQuery("abcd")).toBe(30);
      expect(minScoreForQuery("abcdef")).toBe(30);
    });

    it("returns 25 for queries longer than 6", () => {
      expect(minScoreForQuery("abcdefg")).toBe(25);
      expect(minScoreForQuery("a very long query string")).toBe(25);
    });

    it("uses the normalized length (diacritics stripped, trimmed)", () => {
      // "  Café  " normalizes to "cafe" (length 4) -> 30
      expect(minScoreForQuery("  Café  ")).toBe(30);
    });
  });

  describe("isFuzzyMatch", () => {
    it("returns true when the score meets the default threshold", () => {
      // "add" len 3 -> threshold 40; scoreMatch("add","Add Password") = 91
      expect(isFuzzyMatch("add", "Add Password")).toBe(true);
    });

    it("returns false when the score is below the default threshold", () => {
      // "xyz" len 3 -> threshold 40; scoreMatch("xyz","abc") = 0
      expect(isFuzzyMatch("xyz", "abc")).toBe(false);
    });

    it("honors an explicit minScore override of 0 (always matches non-empty query)", () => {
      expect(isFuzzyMatch("xyz", "abc", 0)).toBe(true);
    });

    it("honors an explicit minScore override that rejects a match", () => {
      // score 91 but require 95 -> false
      expect(isFuzzyMatch("add", "Add Password", 95)).toBe(false);
    });

    it("returns false for an empty query (score 0 below threshold)", () => {
      expect(isFuzzyMatch("", "anything")).toBe(false);
    });
  });

  describe("rankByFuzzy", () => {
    interface Tool {
      name: string;
      description: string;
    }

    const items: Tool[] = [
      { name: "Add Password", description: "Encrypt a PDF with a password" },
      { name: "Remove Password", description: "Decrypt a protected PDF" },
      { name: "Merge", description: "Combine multiple PDFs into one" },
    ];

    const getters: Array<(t: Tool) => string> = [
      (t) => t.name,
      (t) => t.description,
    ];

    it("returns only items above the threshold, sorted by descending score", () => {
      const ranked = rankByFuzzy(items, "password", getters);
      expect(ranked.length).toBe(2);
      expect(ranked[0].item.name).toBe("Add Password");
      expect(ranked.map((r) => r.item.name)).toEqual([
        "Add Password",
        "Remove Password",
      ]);
      // Scores must be in non-increasing order.
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    });

    it("records the matched text for the best-scoring getter", () => {
      const ranked = rankByFuzzy(items, "password", getters);
      // "password" appears in both name and description; whichever scores higher wins.
      expect(ranked[0].matchedText).toMatch(/[Pp]assword/);
    });

    it("returns an empty array when nothing exceeds the threshold", () => {
      const ranked = rankByFuzzy(items, "zzzzzzzz", getters);
      expect(ranked).toEqual([]);
    });

    it("skips empty/falsy getter values without throwing", () => {
      const sparse = [{ name: "", description: "Add Password" }];
      const ranked = rankByFuzzy(sparse, "password", [
        (t) => t.name,
        (t) => t.description,
      ]);
      expect(ranked.length).toBe(1);
      expect(ranked[0].matchedText).toBe("Add Password");
    });

    it("respects an explicit minScore override", () => {
      // High threshold filters out weaker matches.
      const ranked = rankByFuzzy(items, "password", getters, 95);
      expect(ranked).toEqual([]);
    });

    it("short-circuits once a near-perfect (>= 95) score is found", () => {
      // First getter yields an exact match (score 100 >= 95) so the second
      // getter is never consulted; matchedText is the exact value.
      const exact = [{ name: "merge", description: "merge" }];
      const ranked = rankByFuzzy(exact, "merge", [
        (t) => t.name,
        (t) => t.description,
      ]);
      expect(ranked.length).toBe(1);
      expect(ranked[0].score).toBe(100);
      expect(ranked[0].matchedText).toBe("merge");
    });

    it("returns an empty array for an empty item list", () => {
      const ranked = rankByFuzzy<Tool>([], "password", getters);
      expect(ranked).toEqual([]);
    });
  });

  describe("idToWords", () => {
    it("splits camelCase identifiers into words", () => {
      expect(idToWords("addPassword")).toBe("add password");
    });

    it("converts kebab-case to spaced words", () => {
      expect(idToWords("add-password")).toBe("add password");
    });

    it("converts snake_case to spaced words", () => {
      expect(idToWords("add_password")).toBe("add password");
    });

    it("converts dot.case to spaced words", () => {
      expect(idToWords("add.password")).toBe("add password");
    });

    it("collapses repeated separators into single spaces", () => {
      expect(idToWords("add__--..password")).toBe("add password");
    });

    it("handles digit-to-uppercase boundaries", () => {
      // "page2Scale" -> "2" is [a-z0-9], "S" is [A-Z] => split before S
      expect(idToWords("page2Scale")).toBe("page2 scale");
    });

    it("lowercases and strips diacritics via normalization", () => {
      // The camelCase split regex only matches ASCII [a-z0-9] before [A-Z], so an
      // accented uppercase letter is not treated as a word boundary; it is merely
      // lowercased and stripped during normalization.
      expect(idToWords("rotateÉFile")).toBe("rotateefile");
      // A plain ASCII camelCase boundary still splits and normalizes correctly.
      expect(idToWords("Rotaté File")).toBe("rotate file");
    });

    it("returns an empty string for empty input", () => {
      expect(idToWords("")).toBe("");
    });
  });
});
