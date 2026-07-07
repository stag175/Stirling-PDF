/**
 * Unit tests for the Compare tool's pure operation utilities.
 *
 * The module under test imports `@app/services/pdfWorkerManager` at the top
 * level, which (transitively) loads the heavy pdf.js legacy build and spins up
 * a Web Worker via `import.meta.url`. We mock that service so importing the
 * module is side-effect-free and fully deterministic. We deliberately do NOT
 * exercise `extractContentFromPdf`, which is the only function that needs the
 * real pdf.js pipeline.
 */

import { describe, test, expect, vi } from "vitest";

// Mock the pdf worker manager BEFORE importing the module under test so the
// real pdf.js worker is never instantiated. The compare utilities we test
// never call into it, so empty stubs are sufficient.
vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn(),
    destroyDocument: vi.fn(),
  },
}));

import {
  aggregateTotals,
  appendWord,
  buildChanges,
  clamp,
  createSummaryFile,
  filterTokensForDiff,
  getWorkerErrorCode,
  measureTextWidth,
  type TokenMetadata,
} from "@app/hooks/tools/compare/operationUtils";
import { PARAGRAPH_SENTINEL } from "@app/types/compare";
import type { CompareDiffToken, CompareResultData } from "@app/types/compare";

// Minimal metadata factory keeping the tests readable.
const meta = (page: number, paragraph: number): TokenMetadata => ({
  page,
  paragraph,
  bbox: null,
});

// jsdom's File neither implements `.text()` nor faithfully round-trips
// `.arrayBuffer()` (setupTests.ts polyfills it to return fixed bytes). To read
// back exactly what `createSummaryFile` serialized, capture the body passed to
// the File constructor. The body is `[JSON.stringify(payload, null, 2)]`.
const captureSummaryJson = (
  build: () => File,
): { file: File; payload: Record<string, unknown> } => {
  const RealFile = globalThis.File;
  let capturedJson = "";
  const spy = vi
    .spyOn(globalThis, "File")
    .mockImplementation(
      (parts: BlobPart[], name: string, options?: FilePropertyBag) => {
        capturedJson = String(parts[0]);
        return new RealFile(parts, name, options);
      },
    );
  try {
    const file = build();
    return { file, payload: JSON.parse(capturedJson) };
  } finally {
    spy.mockRestore();
  }
};

describe("operationUtils", () => {
  describe("clamp", () => {
    test("returns the value unchanged when inside [0, 1]", () => {
      expect(clamp(0.5)).toBe(0.5);
    });

    test("clamps values above 1 down to 1", () => {
      expect(clamp(1.5)).toBe(1);
      expect(clamp(42)).toBe(1);
    });

    test("clamps values below 0 up to 0", () => {
      expect(clamp(-0.1)).toBe(0);
      expect(clamp(-100)).toBe(0);
    });

    test("preserves the exact boundaries", () => {
      expect(clamp(0)).toBe(0);
      expect(clamp(1)).toBe(1);
    });
  });

  describe("appendWord", () => {
    test("returns the word when there is no existing text (empty branch)", () => {
      expect(appendWord("", "hello")).toBe("hello");
    });

    test("joins two words with a single space", () => {
      expect(appendWord("hello", "world")).toBe("hello world");
    });

    test("concatenates trailing punctuation without a space", () => {
      expect(appendWord("hello", ".")).toBe("hello.");
      expect(appendWord("hello", ",")).toBe("hello,");
    });

    test("concatenates a leading apostrophe contraction without a space", () => {
      expect(appendWord("it", "'s")).toBe("it's");
    });
  });

  describe("measureTextWidth", () => {
    // jsdom does not provide a 2d canvas backend, so `measurementContext` is
    // null and the function takes its deterministic fallback path. These tests
    // exercise that fallback branch.
    test("returns 0 for an empty string", () => {
      expect(measureTextWidth("12px sans-serif", "")).toBe(0);
    });

    test("returns the default space width for a single space", () => {
      expect(measureTextWidth("12px sans-serif", " ")).toBeCloseTo(0.33);
    });

    test("returns one char-width unit per character for ordinary text", () => {
      expect(measureTextWidth("12px sans-serif", "abc")).toBe(3);
      expect(measureTextWidth("16px serif", "abcdef")).toBe(6);
    });
  });

  describe("getWorkerErrorCode", () => {
    test("extracts a recognised error code from an object", () => {
      expect(getWorkerErrorCode({ code: "EMPTY_TEXT" })).toBe("EMPTY_TEXT");
      expect(getWorkerErrorCode({ code: "TOO_LARGE" })).toBe("TOO_LARGE");
      expect(getWorkerErrorCode({ code: "TOO_DISSIMILAR" })).toBe(
        "TOO_DISSIMILAR",
      );
    });

    test("returns undefined when the object lacks a code property", () => {
      expect(getWorkerErrorCode({ message: "boom" })).toBeUndefined();
    });

    test("returns undefined for null", () => {
      expect(getWorkerErrorCode(null)).toBeUndefined();
    });

    test("returns undefined for non-object primitives", () => {
      expect(getWorkerErrorCode("EMPTY_TEXT")).toBeUndefined();
      expect(getWorkerErrorCode(42)).toBeUndefined();
      expect(getWorkerErrorCode(undefined)).toBeUndefined();
    });
  });

  describe("aggregateTotals", () => {
    test("counts added, removed and unchanged tokens independently", () => {
      const tokens: CompareDiffToken[] = [
        { type: "added", text: "a" },
        { type: "added", text: "b" },
        { type: "removed", text: "c" },
        { type: "unchanged", text: "d" },
        { type: "unchanged", text: "e" },
        { type: "unchanged", text: "f" },
      ];
      expect(aggregateTotals(tokens)).toEqual({
        added: 2,
        removed: 1,
        unchanged: 3,
      });
    });

    test("returns all-zero totals for an empty token list", () => {
      expect(aggregateTotals([])).toEqual({
        added: 0,
        removed: 0,
        unchanged: 0,
      });
    });

    test("ignores serialized paragraph-sentinel tokens", () => {
      const tokens: CompareDiffToken[] = [
        { type: "added", text: "PARA" },
        { type: "removed", text: "PARA" },
        { type: "added", text: "kept" },
      ];
      expect(aggregateTotals(tokens)).toEqual({
        added: 1,
        removed: 0,
        unchanged: 0,
      });
    });

    test("treats an unknown token type as unchanged (default branch)", () => {
      const tokens = [
        { type: "weird", text: "x" },
      ] as unknown as CompareDiffToken[];
      expect(aggregateTotals(tokens)).toEqual({
        added: 0,
        removed: 0,
        unchanged: 1,
      });
    });
  });

  describe("filterTokensForDiff", () => {
    test("drops paragraph sentinels and tokens containing 'PARA' or the PUA prefix", () => {
      const tokens = [
        "hello",
        PARAGRAPH_SENTINEL,
        "world",
        "PARA",
        "PARAGRAPH",
        "anything",
        "tail",
      ];
      const metadata: TokenMetadata[] = [
        meta(1, 1),
        meta(1, 1),
        meta(1, 1),
        meta(1, 2),
        meta(1, 2),
        meta(1, 2),
        meta(1, 3),
      ];

      const result = filterTokensForDiff(tokens, metadata);

      expect(result.tokens).toEqual(["hello", "world", "tail"]);
      expect(result.metadata).toEqual([meta(1, 1), meta(1, 1), meta(1, 3)]);
      // filteredToOriginal maps each kept token back to its original index.
      expect(result.filteredToOriginal).toEqual([0, 2, 6]);
    });

    test("keeps a kept token even when its metadata entry is missing", () => {
      // metadata shorter than tokens: the kept token at index 1 has no meta.
      const tokens = ["alpha", "beta"];
      const metadata: TokenMetadata[] = [meta(2, 5)];

      const result = filterTokensForDiff(tokens, metadata);

      expect(result.tokens).toEqual(["alpha", "beta"]);
      // Only the first kept token had metadata to push.
      expect(result.metadata).toEqual([meta(2, 5)]);
      expect(result.filteredToOriginal).toEqual([0, 1]);
    });

    test("returns empty structures when every token is a sentinel", () => {
      const tokens = [PARAGRAPH_SENTINEL, "PARA"];
      const metadata: TokenMetadata[] = [meta(1, 1), meta(1, 1)];

      const result = filterTokensForDiff(tokens, metadata);

      expect(result.tokens).toEqual([]);
      expect(result.metadata).toEqual([]);
      expect(result.filteredToOriginal).toEqual([]);
    });

    test("returns empty structures for empty input", () => {
      const result = filterTokensForDiff([], []);
      expect(result).toEqual({
        tokens: [],
        metadata: [],
        filteredToOriginal: [],
      });
    });
  });

  describe("buildChanges", () => {
    test("returns an empty array when there are no diff tokens", () => {
      expect(buildChanges([], [], [])).toEqual([]);
    });

    test("produces no changes when every token is unchanged", () => {
      const tokens: CompareDiffToken[] = [
        { type: "unchanged", text: "same" },
        { type: "unchanged", text: "again" },
      ];
      expect(buildChanges(tokens, [meta(1, 1), meta(1, 1)], [])).toEqual([]);
    });

    test("groups consecutive removed/added tokens into a single change", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "old" },
        { type: "removed", text: "stuff" },
        { type: "added", text: "new" },
        { type: "added", text: "stuff" },
      ];
      const baseMeta = [meta(1, 1), meta(1, 1)];
      const comparisonMeta = [meta(2, 1), meta(2, 1)];

      const changes = buildChanges(tokens, baseMeta, comparisonMeta);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        id: "change-0",
        base: { text: "old stuff", page: 1, paragraph: 1 },
        comparison: { text: "new stuff", page: 2, paragraph: 1 },
      });
    });

    test("flushes the active change when an unchanged token interrupts a run", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "first" },
        { type: "unchanged", text: "bridge" },
        { type: "added", text: "second" },
      ];
      const baseMeta = [meta(1, 1), meta(1, 1)];
      const comparisonMeta = [meta(1, 1), meta(1, 1)];

      const changes = buildChanges(tokens, baseMeta, comparisonMeta);

      // The unchanged token forces a flush, so the removal and the addition
      // land in two separate changes.
      expect(changes).toHaveLength(2);
      expect(changes[0]).toEqual({
        id: "change-0",
        base: { text: "first", page: 1, paragraph: 1 },
        comparison: null,
      });
      // Note: the id reflects the changes array length at construction time.
      expect(changes[1].comparison).toEqual({
        text: "second",
        page: 1,
        paragraph: 1,
      });
      expect(changes[1].base).toBeNull();
    });

    test("splits a removed run across a paragraph boundary", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "para1word1" },
        { type: "removed", text: "para1word2" },
        { type: "removed", text: "para2word1" },
      ];
      // First two tokens are paragraph 1, the third is paragraph 2.
      const baseMeta = [meta(1, 1), meta(1, 1), meta(1, 2)];

      const changes = buildChanges(tokens, baseMeta, []);

      expect(changes).toHaveLength(2);
      expect(changes[0].base).toEqual({
        text: "para1word1 para1word2",
        page: 1,
        paragraph: 1,
      });
      expect(changes[1].base).toEqual({
        text: "para2word1",
        page: 1,
        paragraph: 2,
      });
    });

    test("splits an added run across a paragraph boundary", () => {
      const tokens: CompareDiffToken[] = [
        { type: "added", text: "alpha" },
        { type: "added", text: "beta" },
        { type: "added", text: "gamma" },
      ];
      const comparisonMeta = [meta(3, 7), meta(3, 7), meta(3, 8)];

      const changes = buildChanges(tokens, [], comparisonMeta);

      expect(changes).toHaveLength(2);
      expect(changes[0].comparison).toEqual({
        text: "alpha beta",
        page: 3,
        paragraph: 7,
      });
      expect(changes[1].comparison).toEqual({
        text: "gamma",
        page: 3,
        paragraph: 8,
      });
    });

    test("appends within the same paragraph rather than splitting", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "one" },
        { type: "removed", text: "two" },
        { type: "removed", text: "three" },
      ];
      const baseMeta = [meta(1, 4), meta(1, 4), meta(1, 4)];

      const changes = buildChanges(tokens, baseMeta, []);

      expect(changes).toHaveLength(1);
      expect(changes[0].base).toEqual({
        text: "one two three",
        page: 1,
        paragraph: 4,
      });
    });

    test("backfills page/paragraph onto a side that began with null metadata", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "lead" },
        { type: "removed", text: "tail" },
      ];
      // First token has NO metadata (index out of range -> null), second one
      // carries page/paragraph that should be backfilled onto the side.
      const baseMeta = [meta(5, 9)];

      // baseIndex starts at 0; the first removed token reads baseMeta[0]
      // (page 5/para 9). To force the "began null" path we instead pass a
      // metadata array whose first entry is null-like by being absent.
      // Provide a leading gap via an explicit undefined slot.
      const sparse = [undefined as unknown as TokenMetadata, meta(5, 9)];

      const changes = buildChanges(tokens, sparse, []);

      expect(changes).toHaveLength(1);
      // First token: meta is undefined -> page/paragraph null on creation.
      // Second token: appended, and because page/paragraph were null they get
      // backfilled from meta(5, 9).
      expect(changes[0].base?.text).toBe("lead tail");
      expect(changes[0].base?.page).toBe(5);
      expect(changes[0].base?.paragraph).toBe(9);
      // baseMeta unused on purpose to document the sparse-array intent.
      expect(baseMeta).toHaveLength(1);
    });

    test("drops a change whose text trims to empty", () => {
      const tokens: CompareDiffToken[] = [{ type: "removed", text: "   " }];
      const baseMeta = [meta(1, 1)];

      // The only removed token is whitespace; after trim it is empty, so no
      // change is emitted.
      expect(buildChanges(tokens, baseMeta, [])).toEqual([]);
    });

    test("does not split when paragraph metadata is null on the incoming token", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "head" },
        { type: "removed", text: "next" },
      ];
      // Second token's metadata is missing -> paragraph null -> no split,
      // text is appended within the same change.
      const baseMeta = [meta(1, 1)];

      const changes = buildChanges(tokens, baseMeta, []);

      expect(changes).toHaveLength(1);
      expect(changes[0].base?.text).toBe("head next");
      expect(changes[0].base?.page).toBe(1);
      expect(changes[0].base?.paragraph).toBe(1);
    });

    test("handles mixed removed/added that share a single change with both sides", () => {
      const tokens: CompareDiffToken[] = [
        { type: "removed", text: "del1" },
        { type: "added", text: "add1" },
        { type: "removed", text: "del2" },
        { type: "added", text: "add2" },
      ];
      const baseMeta = [meta(1, 1), meta(1, 1)];
      const comparisonMeta = [meta(1, 1), meta(1, 1)];

      const changes = buildChanges(tokens, baseMeta, comparisonMeta);

      expect(changes).toHaveLength(1);
      expect(changes[0].base?.text).toBe("del1 del2");
      expect(changes[0].comparison?.text).toBe("add1 add2");
    });
  });

  describe("createSummaryFile", () => {
    const makeResult = (
      overrides: Partial<CompareResultData> = {},
    ): CompareResultData =>
      ({
        mode: "text",
        base: {
          fileId: "base-id",
          fileName: "base.pdf",
          highlightColor: "#FF3B30",
          wordCount: 100,
          pageSizes: [],
        },
        comparison: {
          fileId: "comp-id",
          fileName: "comparison.pdf",
          highlightColor: "#34C759",
          wordCount: 120,
          pageSizes: [],
        },
        totals: {
          added: 5,
          removed: 3,
          unchanged: 90,
          durationMs: 1234,
          // Fixed epoch instant -> deterministic ISO string / filename.
          processedAt: Date.UTC(2026, 0, 2, 3, 4, 5, 678),
        },
        tokens: [],
        tokenMetadata: { base: [], comparison: [] },
        filteredTokenData: { base: [], comparison: [] },
        sourceTokens: { base: [], comparison: [] },
        changes: [
          {
            id: "change-0",
            base: { text: "old", page: 1, paragraph: 1 },
            comparison: { text: "new", page: 1, paragraph: 1 },
          },
        ],
        warnings: ["a warning"],
        baseParagraphs: [],
        comparisonParagraphs: [],
        ...overrides,
      }) as CompareResultData;

    test("produces a JSON File with a timestamped filename and json mime type", () => {
      const file = createSummaryFile(makeResult());

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("application/json");
      // The ISO string has its ':' and '.' replaced with '-'.
      expect(file.name).toBe("compare-summary-2026-01-02T03-04-05-678Z.json");
    });

    test("serializes totals, filenames, changes and warnings into the payload", () => {
      const { payload } = captureSummaryJson(() =>
        createSummaryFile(makeResult()),
      );

      expect(payload.generatedAt).toBe("2026-01-02T03:04:05.678Z");
      expect(payload.base).toEqual({ name: "base.pdf", totalWords: 100 });
      expect(payload.comparison).toEqual({
        name: "comparison.pdf",
        totalWords: 120,
      });
      expect(payload.totals).toEqual({
        added: 5,
        removed: 3,
        unchanged: 90,
        durationMs: 1234,
      });
      expect(payload.changes).toEqual([
        {
          base: { text: "old", page: 1, paragraph: 1 },
          comparison: { text: "new", page: 1, paragraph: 1 },
        },
      ]);
      expect(payload.warnings).toEqual(["a warning"]);
    });

    test("handles an empty changes/warnings result", () => {
      const { payload } = captureSummaryJson(() =>
        createSummaryFile(makeResult({ changes: [], warnings: [] })),
      );

      expect(payload.changes).toEqual([]);
      expect(payload.warnings).toEqual([]);
    });
  });
});
