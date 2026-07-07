import { describe, expect, it } from "vitest";
import type { PDFDocument, PDFPage } from "@app/types/pageEditor";
import {
  buildPageIdIndexMap,
  convertSplitPageIdsToIndexes,
} from "@app/components/pageEditor/utils/splitPositions";

// --- Deterministic fixtures -------------------------------------------------

function makePage(overrides: Partial<PDFPage> = {}): PDFPage {
  return {
    id: overrides.id ?? `page-${overrides.pageNumber ?? 1}`,
    pageNumber: overrides.pageNumber ?? 1,
    originalPageNumber:
      overrides.originalPageNumber ?? overrides.pageNumber ?? 1,
    thumbnail: overrides.thumbnail ?? null,
    rotation: overrides.rotation ?? 0,
    selected: overrides.selected ?? false,
    splitAfter: overrides.splitAfter ?? false,
    ...overrides,
  };
}

// Build a document whose page IDs are "page-1".."page-N" so the index map and
// split-conversion assertions stay readable and exact.
function makeDoc(pageCount: number): PDFDocument {
  const pages: PDFPage[] = [];
  for (let i = 1; i <= pageCount; i++) {
    pages.push(makePage({ id: `page-${i}`, pageNumber: i }));
  }
  return {
    id: "doc-1",
    name: "doc.pdf",
    file: new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" }),
    pages,
    totalPages: pageCount,
  };
}

describe("buildPageIdIndexMap", () => {
  it("returns an empty map for a null document (early-return guard)", () => {
    const map = buildPageIdIndexMap(null);

    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it("maps each page id to its zero-based index in order", () => {
    const doc = makeDoc(3);

    const map = buildPageIdIndexMap(doc);

    expect(map.size).toBe(3);
    expect(map.get("page-1")).toBe(0);
    expect(map.get("page-2")).toBe(1);
    expect(map.get("page-3")).toBe(2);
    // IDs not present in the document resolve to undefined.
    expect(map.get("missing")).toBeUndefined();
  });

  it("returns an empty (but valid) map for a document with no pages", () => {
    const doc = makeDoc(0);

    const map = buildPageIdIndexMap(doc);

    expect(map.size).toBe(0);
  });

  it("keeps the LAST index when duplicate ids exist (Map overwrite)", () => {
    const doc: PDFDocument = {
      id: "doc-dup",
      name: "dup.pdf",
      file: new File(["%PDF-1.4"], "dup.pdf", { type: "application/pdf" }),
      pages: [
        makePage({ id: "dup", pageNumber: 1 }),
        makePage({ id: "unique", pageNumber: 2 }),
        makePage({ id: "dup", pageNumber: 3 }),
      ],
      totalPages: 3,
    };

    const map = buildPageIdIndexMap(doc);

    // Two entries: the duplicate "dup" key is overwritten by its later index.
    expect(map.size).toBe(2);
    expect(map.get("dup")).toBe(2);
    expect(map.get("unique")).toBe(1);
  });
});

describe("convertSplitPageIdsToIndexes", () => {
  it("returns an empty set when the document is null", () => {
    const result = convertSplitPageIdsToIndexes(null, new Set(["page-1"]));

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns an empty set when splitPageIds is null/undefined", () => {
    const doc = makeDoc(3);

    // Exercises the `!splitPageIds` branch of the guard.
    const result = convertSplitPageIdsToIndexes(
      doc,
      null as unknown as Set<string>,
    );

    expect(result.size).toBe(0);
  });

  it("returns an empty set when the split id set is empty", () => {
    const doc = makeDoc(3);

    const result = convertSplitPageIdsToIndexes(doc, new Set<string>());

    expect(result.size).toBe(0);
  });

  it("converts matching split ids to their current indexes", () => {
    const doc = makeDoc(4);

    const result = convertSplitPageIdsToIndexes(
      doc,
      new Set(["page-1", "page-3"]),
    );

    // page-1 -> 0, page-3 -> 2; both precede the last page so both are kept.
    expect([...result].sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it("ignores split ids that are not present in the document", () => {
    const doc = makeDoc(4);

    const result = convertSplitPageIdsToIndexes(
      doc,
      new Set(["page-2", "ghost-page"]),
    );

    // Only the in-document, non-last id contributes an index.
    expect([...result]).toEqual([1]);
  });

  it("never emits an index for the last page (cannot split after it)", () => {
    const doc = makeDoc(3);

    // page-3 is the last page (index 2 === totalPages - 1) and must be dropped.
    const result = convertSplitPageIdsToIndexes(
      doc,
      new Set(["page-2", "page-3"]),
    );

    expect([...result]).toEqual([1]);
    expect(result.has(2)).toBe(false);
  });

  it("drops the only split id when it points at the last page", () => {
    const doc = makeDoc(2);

    const result = convertSplitPageIdsToIndexes(doc, new Set(["page-2"]));

    expect(result.size).toBe(0);
  });

  it("returns an empty set for a single-page document (no splittable index)", () => {
    const doc = makeDoc(1);

    // index 0 >= totalPages - 1 (0) triggers the last-page guard immediately.
    const result = convertSplitPageIdsToIndexes(doc, new Set(["page-1"]));

    expect(result.size).toBe(0);
  });

  it("keeps every splittable index when all but the last are requested", () => {
    const doc = makeDoc(5);

    const result = convertSplitPageIdsToIndexes(
      doc,
      new Set(["page-1", "page-2", "page-3", "page-4", "page-5"]),
    );

    // Indexes 0..3 are kept; index 4 (last page) is excluded by the guard.
    expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("returns an empty set when the document itself has no pages", () => {
    const doc = makeDoc(0);

    // totalPages - 1 === -1, so the forEach body never runs.
    const result = convertSplitPageIdsToIndexes(doc, new Set(["page-1"]));

    expect(result.size).toBe(0);
  });
});
