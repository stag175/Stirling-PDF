import { describe, it, expect } from "vitest";
import {
  shouldConcatWithoutSpace,
  appendWord,
  tokenize,
  diffWords,
  type LocalToken,
} from "@app/utils/textDiff";

// Compact representation of a token list, e.g. "u:a r:b a:x" where the
// first letter is the type (unchanged/removed/added) and the rest is the text.
const fmt = (tokens: LocalToken[]): string =>
  tokens.map((t) => `${t.type[0]}:${t.text}`).join(" ");

describe("textDiff", () => {
  describe("shouldConcatWithoutSpace", () => {
    it("returns true for leading sentence punctuation", () => {
      expect(shouldConcatWithoutSpace(".")).toBe(true);
      expect(shouldConcatWithoutSpace(",")).toBe(true);
      expect(shouldConcatWithoutSpace("!")).toBe(true);
      expect(shouldConcatWithoutSpace("?")).toBe(true);
      expect(shouldConcatWithoutSpace(";")).toBe(true);
      expect(shouldConcatWithoutSpace(":")).toBe(true);
    });

    it("returns true for leading closing brackets", () => {
      expect(shouldConcatWithoutSpace(")")).toBe(true);
      expect(shouldConcatWithoutSpace("]")).toBe(true);
      expect(shouldConcatWithoutSpace("}")).toBe(true);
    });

    it("only inspects the first character", () => {
      expect(shouldConcatWithoutSpace(".end")).toBe(true);
      expect(shouldConcatWithoutSpace(")more text")).toBe(true);
    });

    it("returns true for words starting with an apostrophe", () => {
      expect(shouldConcatWithoutSpace("'em")).toBe(true);
      expect(shouldConcatWithoutSpace("'tis")).toBe(true);
    });

    it("returns true for the explicit possessive token", () => {
      expect(shouldConcatWithoutSpace("'s")).toBe(true);
    });

    it("returns false for ordinary words", () => {
      expect(shouldConcatWithoutSpace("hello")).toBe(false);
      expect(shouldConcatWithoutSpace("world")).toBe(false);
    });

    it("returns false for opening brackets and other punctuation", () => {
      expect(shouldConcatWithoutSpace("(")).toBe(false);
      expect(shouldConcatWithoutSpace("[")).toBe(false);
      expect(shouldConcatWithoutSpace("{")).toBe(false);
      expect(shouldConcatWithoutSpace("-")).toBe(false);
      expect(shouldConcatWithoutSpace("&")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(shouldConcatWithoutSpace("")).toBe(false);
    });

    it("returns false when punctuation is not leading", () => {
      expect(shouldConcatWithoutSpace("end.")).toBe(false);
      expect(shouldConcatWithoutSpace("don't")).toBe(false);
    });
  });

  describe("appendWord", () => {
    it("returns the word unchanged when existing is empty", () => {
      expect(appendWord("", "hello")).toBe("hello");
    });

    it("treats other falsy existing values as empty", () => {
      // The guard is `if (!existing)`, so an empty accumulator just yields the word.
      expect(appendWord("", ".")).toBe(".");
    });

    it("joins two ordinary words with a single space", () => {
      expect(appendWord("hello", "world")).toBe("hello world");
    });

    it("concatenates without a space for leading punctuation", () => {
      expect(appendWord("hello", ".")).toBe("hello.");
      expect(appendWord("done", ",")).toBe("done,");
      expect(appendWord("wait", "!")).toBe("wait!");
    });

    it("concatenates without a space before closing brackets", () => {
      expect(appendWord("text", ")")).toBe("text)");
      expect(appendWord("item", "]")).toBe("item]");
    });

    it("concatenates without a space for apostrophe words", () => {
      expect(appendWord("it", "'s")).toBe("it's");
      expect(appendWord("them", "'em")).toBe("them'em");
    });

    it("can be used to rebuild a sentence by folding tokens", () => {
      const result = ["The", "cat", "sat", "."].reduce(
        (acc, word) => appendWord(acc, word),
        "",
      );
      expect(result).toBe("The cat sat.");
    });
  });

  describe("tokenize", () => {
    it("splits a simple sentence on single spaces", () => {
      expect(tokenize("the quick brown fox")).toEqual([
        "the",
        "quick",
        "brown",
        "fox",
      ]);
    });

    it("collapses runs of whitespace and ignores empty tokens", () => {
      expect(tokenize("a   b\t\nc")).toEqual(["a", "b", "c"]);
    });

    it("trims leading and trailing whitespace", () => {
      expect(tokenize("   padded text   ")).toEqual(["padded", "text"]);
    });

    it("returns an empty array for an empty string", () => {
      expect(tokenize("")).toEqual([]);
    });

    it("returns an empty array for whitespace-only input", () => {
      expect(tokenize("   \t \n ")).toEqual([]);
    });

    it("keeps punctuation attached to words (no semantic splitting)", () => {
      expect(tokenize("hello, world!")).toEqual(["hello,", "world!"]);
    });
  });

  describe("diffWords", () => {
    it("returns an empty array when both inputs are empty", () => {
      expect(diffWords([], [])).toEqual([]);
    });

    it("marks every word as added when the original is empty", () => {
      const tokens = diffWords([], ["x", "y"]);
      expect(tokens).toEqual([
        { type: "added", text: "x" },
        { type: "added", text: "y" },
      ]);
    });

    it("marks every word as removed when the new text is empty", () => {
      const tokens = diffWords(["x", "y"], []);
      expect(tokens).toEqual([
        { type: "removed", text: "x" },
        { type: "removed", text: "y" },
      ]);
    });

    it("marks identical inputs as fully unchanged", () => {
      const tokens = diffWords(["a", "b"], ["a", "b"]);
      expect(tokens).toEqual([
        { type: "unchanged", text: "a" },
        { type: "unchanged", text: "b" },
      ]);
      // Every token preserves the shared word value.
      expect(tokens.every((t) => t.type === "unchanged")).toBe(true);
    });

    it("represents a single-word substitution as removed-then-added", () => {
      // removed comes before added because the backtracking prefers the
      // `added` branch first and unshifts, so the removed word lands ahead.
      expect(fmt(diffWords(["a", "b", "c"], ["a", "x", "c"]))).toBe(
        "u:a r:b a:x u:c",
      );
    });

    it("detects a mid-sequence insertion", () => {
      expect(fmt(diffWords(["a", "c"], ["a", "b", "c"]))).toBe("u:a a:b u:c");
    });

    it("detects a mid-sequence deletion", () => {
      expect(fmt(diffWords(["a", "b", "c"], ["a", "c"]))).toBe("u:a r:b u:c");
    });

    it("detects a prefix insertion", () => {
      expect(fmt(diffWords(["b"], ["a", "b"]))).toBe("a:a u:b");
    });

    it("detects a suffix insertion", () => {
      expect(fmt(diffWords(["a"], ["a", "b"]))).toBe("u:a a:b");
    });

    it("orders all removals before all additions for fully disjoint inputs", () => {
      expect(fmt(diffWords(["a", "b"], ["c", "d"]))).toBe("r:a r:b a:c a:d");
    });

    it("handles duplicate words by keeping one and removing the extra", () => {
      expect(fmt(diffWords(["a", "a"], ["a"]))).toBe("r:a u:a");
    });

    it("produces a token list whose unchanged words equal the LCS in order", () => {
      const a = ["the", "quick", "brown", "fox"];
      const b = ["the", "slow", "brown", "cat"];
      const tokens = diffWords(a, b);
      const unchanged = tokens
        .filter((t) => t.type === "unchanged")
        .map((t) => t.text);
      expect(unchanged).toEqual(["the", "brown"]);
    });

    it("preserves all original words across unchanged+removed tokens", () => {
      const a = ["alpha", "beta", "gamma"];
      const b = ["alpha", "delta"];
      const tokens = diffWords(a, b);
      const fromOriginal = tokens
        .filter((t) => t.type === "unchanged" || t.type === "removed")
        .map((t) => t.text);
      expect(fromOriginal).toEqual(a);
    });

    it("preserves all new words across unchanged+added tokens", () => {
      const a = ["alpha", "beta", "gamma"];
      const b = ["alpha", "delta"];
      const tokens = diffWords(a, b);
      const fromNew = tokens
        .filter((t) => t.type === "unchanged" || t.type === "added")
        .map((t) => t.text);
      expect(fromNew).toEqual(b);
    });

    it("only ever emits the three known token types", () => {
      const tokens = diffWords(["one", "two", "three"], ["two", "four"]);
      const allowed = new Set(["unchanged", "removed", "added"]);
      expect(tokens.every((t) => allowed.has(t.type))).toBe(true);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("is deterministic across repeated invocations", () => {
      const a = ["a", "b", "c", "d", "e"];
      const b = ["a", "x", "c", "y", "e"];
      const first = diffWords(a, b);
      const second = diffWords(a, b);
      expect(first).toEqual(second);
    });

    it("does not mutate its input arrays", () => {
      const a = ["a", "b"];
      const b = ["a", "c"];
      const aCopy = [...a];
      const bCopy = [...b];
      diffWords(a, b);
      expect(a).toEqual(aCopy);
      expect(b).toEqual(bCopy);
    });

    it("round-trips with tokenize to diff plain strings", () => {
      const tokens = diffWords(
        tokenize("hello brave world"),
        tokenize("hello new world"),
      );
      expect(fmt(tokens)).toBe("u:hello r:brave a:new u:world");
    });
  });
});
