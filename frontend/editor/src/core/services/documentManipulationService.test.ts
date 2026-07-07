import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  DocumentManipulationService,
  documentManipulationService,
} from "@app/services/documentManipulationService";
import { PDFDocument, PDFPage } from "@app/types/pageEditor";

/**
 * Unit tests for DocumentManipulationService.
 *
 * The service reads its state straight from the live DOM via
 * `document.querySelector('[data-page-id="..."]')`, which jsdom (the configured
 * Vitest environment) provides. Each test builds a deterministic DOM via
 * `buildDOM(...)` so the rotation math, split segmentation, reset and
 * unsaved-changes branches are exercised without any network / worker deps.
 *
 * The only external module dependency, `convertSplitPageIdsToIndexes`, is pure
 * and deterministic (it maps page IDs -> indexes, excluding the last page), so
 * it is used as-is rather than mocked.
 */

let nextPageSeq = 0;

/**
 * Build a minimal PDFPage with sensible defaults that callers can override.
 */
function makePage(overrides: Partial<PDFPage> = {}): PDFPage {
  nextPageSeq += 1;
  return {
    id: `page-${nextPageSeq}`,
    pageNumber: nextPageSeq,
    originalPageNumber: nextPageSeq,
    thumbnail: null,
    rotation: 0,
    selected: false,
    ...overrides,
  };
}

/**
 * Build a minimal PDFDocument around the supplied pages.
 */
function makeDocument(
  pages: PDFPage[],
  overrides: Partial<PDFDocument> = {},
): PDFDocument {
  return {
    id: "doc-1",
    name: "original.pdf",
    file: new File(["%PDF-1.7"], "original.pdf", { type: "application/pdf" }),
    pages,
    totalPages: pages.length,
    ...overrides,
  };
}

type DomPageSpec = {
  id: string;
  /** Omit `img` entirely to simulate a page element with no <img>. */
  img?: {
    /** Value for data-original-rotation; omit to leave the attribute absent. */
    originalRotation?: number;
    /** style.transform string; omit to leave transform empty. */
    transform?: string;
  };
};

/**
 * Render a controlled DOM tree of page elements that the service can query.
 * Returns a lookup of the created <img> elements keyed by page id so tests can
 * assert on mutations (e.g. resetDOMToDocumentState rewriting transform).
 */
function buildDOM(specs: DomPageSpec[]): Record<string, HTMLImageElement> {
  document.body.innerHTML = "";
  const imgs: Record<string, HTMLImageElement> = {};

  for (const spec of specs) {
    const el = document.createElement("div");
    el.setAttribute("data-page-id", spec.id);

    if (spec.img) {
      const img = document.createElement("img");
      if (spec.img.originalRotation !== undefined) {
        img.setAttribute(
          "data-original-rotation",
          String(spec.img.originalRotation),
        );
      }
      if (spec.img.transform !== undefined) {
        img.style.transform = spec.img.transform;
      }
      el.appendChild(img);
      imgs[spec.id] = img;
    }

    document.body.appendChild(el);
  }

  return imgs;
}

beforeEach(() => {
  nextPageSeq = 0;
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("singleton export", () => {
  test("exports a ready-to-use DocumentManipulationService instance", () => {
    expect(documentManipulationService).toBeInstanceOf(
      DocumentManipulationService,
    );
  });
});

describe("applyDOMChangesToDocument - no splits", () => {
  test("returns a single document and leaves pages untouched when no DOM elements exist", () => {
    const service = new DocumentManipulationService();
    const pages = [makePage({ id: "a", rotation: 90 }), makePage({ id: "b" })];
    const doc = makeDocument(pages, { id: "src" });

    // No buildDOM call -> querySelector finds nothing -> applyPageChanges
    // short-circuits and returns each page unchanged.
    const result = service.applyDOMChangesToDocument(doc);

    expect(Array.isArray(result)).toBe(false);
    const single = result as PDFDocument;
    // Original document metadata (id/name/file) is preserved.
    expect(single.id).toBe("src");
    expect(single.pages).toHaveLength(2);
    expect(single.pages[0].rotation).toBe(90);
    expect(single.pages[1].rotation).toBe(0);
  });

  test("uses currentDisplayOrder pages over the original document order", () => {
    const service = new DocumentManipulationService();
    const original = makeDocument(
      [makePage({ id: "x" }), makePage({ id: "y" })],
      { id: "orig" },
    );
    // A reordered view: y first, then x.
    const displayOrder = makeDocument(
      [
        makePage({ id: "y", pageNumber: 1 }),
        makePage({ id: "x", pageNumber: 2 }),
      ],
      { id: "display" },
    );

    const result = service.applyDOMChangesToDocument(
      original,
      displayOrder,
    ) as PDFDocument;

    // Metadata comes from the ORIGINAL document...
    expect(result.id).toBe("orig");
    // ...but page order follows the display order.
    expect(result.pages.map((p) => p.id)).toEqual(["y", "x"]);
  });

  test("ignores an empty splitPositions set (no conversion, single document)", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a" }), makePage({ id: "b" })]);

    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(),
    );

    expect(Array.isArray(result)).toBe(false);
    expect((result as PDFDocument).pages).toHaveLength(2);
  });
});

describe("applyDOMChangesToDocument - rotation from DOM", () => {
  test("adds the user's visual rotation delta to the page's stored rotation", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 90 })]);
    // originalRotation 0, visual 90 -> userChange 90 -> final 90+90 = 180.
    buildDOM([
      { id: "a", img: { originalRotation: 0, transform: "rotate(90deg)" } },
    ]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(180);
  });

  test("wraps a 360-degree result back to 0", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 270 })]);
    // userChange 90, final = (270 + 90) % 360 = 360 -> normalized to 0.
    buildDOM([
      { id: "a", img: { originalRotation: 0, transform: "rotate(90deg)" } },
    ]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(0);
  });

  test("normalizes a negative visual delta into the 0-359 range", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 0 })]);
    // visual -90, original 0 -> userChange ((-90 % 360)+360)%360 = 270.
    buildDOM([
      { id: "a", img: { originalRotation: 0, transform: "rotate(-90deg)" } },
    ]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(270);
  });

  test("defaults data-original-rotation to 0 when the attribute is absent", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 10 })]);
    // No data-original-rotation -> parseInt("0") = 0; visual 180 -> userChange 180.
    buildDOM([{ id: "a", img: { transform: "rotate(180deg)" } }]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(190);
  });

  test("falls back to originalRotation when the transform has no rotate() match", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 45 })]);
    // transform present but not a rotate() -> visualRotation = originalRotation
    // (here 30) -> userChange 0 -> final 45.
    buildDOM([
      {
        id: "a",
        img: { originalRotation: 30, transform: "scale(2) translateX(5px)" },
      },
    ]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(45);
  });

  test("keeps the page rotation unchanged when the element has no <img>", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 135 })]);
    // Element exists (so applyPageChanges proceeds) but contains no img ->
    // getRotationFromDOM returns originalPage.rotation.
    buildDOM([{ id: "a" }]);

    const result = service.applyDOMChangesToDocument(doc) as PDFDocument;

    expect(result.pages[0].rotation).toBe(135);
  });
});

describe("applyDOMChangesToDocument - splits", () => {
  test("returns multiple documents segmented at the resolved split point", () => {
    const service = new DocumentManipulationService();
    const pages = [
      makePage({ id: "p1" }),
      makePage({ id: "p2" }),
      makePage({ id: "p3" }),
    ];
    const doc = makeDocument(pages, { id: "doc", name: "report.pdf" });
    buildDOM([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);

    // Split AFTER p1 (index 0). The last page can never be a split point.
    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p1"]),
    );

    expect(Array.isArray(result)).toBe(true);
    const docs = result as PDFDocument[];
    expect(docs).toHaveLength(2);

    // Part 1: pages [p1]; Part 2: pages [p2, p3].
    expect(docs[0].id).toBe("doc_part_1");
    expect(docs[0].name).toBe("report_part_1.pdf");
    expect(docs[0].pages.map((p) => p.id)).toEqual(["p1"]);
    expect(docs[0].totalPages).toBe(1);

    expect(docs[1].id).toBe("doc_part_2");
    expect(docs[1].name).toBe("report_part_2.pdf");
    expect(docs[1].pages.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(docs[1].totalPages).toBe(2);
  });

  test("tags only the resolved indexes with splitAfter and ignores last-page split ids", () => {
    const service = new DocumentManipulationService();
    const pages = [
      makePage({ id: "p1" }),
      makePage({ id: "p2" }),
      makePage({ id: "p3" }),
    ];
    const doc = makeDocument(pages, { id: "doc" });
    buildDOM([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);

    // "p3" is the last page -> convertSplitPageIdsToIndexes drops it.
    // "p2" (index 1) is a valid split point.
    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p2", "p3"]),
    ) as PDFDocument[];

    // Split after index 1 -> [p1, p2] and [p3].
    expect(result).toHaveLength(2);
    expect(result[0].pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result[1].pages.map((p) => p.id)).toEqual(["p3"]);
  });

  test("produces a single-segment document when the only split id is the last page", () => {
    const service = new DocumentManipulationService();
    const pages = [makePage({ id: "p1" }), makePage({ id: "p2" })];
    const doc = makeDocument(pages);

    // Only "p2" (the last page) -> resolved index set is empty -> no split,
    // returns a single document (not an array).
    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p2"]),
    );

    expect(Array.isArray(result)).toBe(false);
    expect((result as PDFDocument).pages).toHaveLength(2);
  });

  test("strips a trailing .pdf (case-insensitive) when naming parts", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "p1" }), makePage({ id: "p2" })], {
      name: "MixedCase.PDF",
    });
    buildDOM([{ id: "p1" }, { id: "p2" }]);

    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p1"]),
    ) as PDFDocument[];

    expect(result[0].name).toBe("MixedCase_part_1.pdf");
    expect(result[1].name).toBe("MixedCase_part_2.pdf");
  });

  test("keeps a name without a .pdf suffix intact when naming parts", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "p1" }), makePage({ id: "p2" })], {
      name: "no-extension",
    });
    buildDOM([{ id: "p1" }, { id: "p2" }]);

    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p1"]),
    ) as PDFDocument[];

    expect(result[0].name).toBe("no-extension_part_1.pdf");
  });

  test("creates three parts for two interior split points", () => {
    const service = new DocumentManipulationService();
    const pages = [
      makePage({ id: "p1" }),
      makePage({ id: "p2" }),
      makePage({ id: "p3" }),
      makePage({ id: "p4" }),
    ];
    const doc = makeDocument(pages);
    buildDOM([{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }]);

    // Splits after index 0 (p1) and index 1 (p2) -> [p1] [p2] [p3,p4].
    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p1", "p2"]),
    ) as PDFDocument[];

    expect(result).toHaveLength(3);
    expect(result[0].pages.map((p) => p.id)).toEqual(["p1"]);
    expect(result[1].pages.map((p) => p.id)).toEqual(["p2"]);
    expect(result[2].pages.map((p) => p.id)).toEqual(["p3", "p4"]);
  });

  test("applies rotation changes within split segments", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument(
      [
        makePage({ id: "p1", rotation: 0 }),
        makePage({ id: "p2", rotation: 0 }),
      ],
      { id: "doc" },
    );
    buildDOM([
      { id: "p1", img: { originalRotation: 0, transform: "rotate(90deg)" } },
      { id: "p2", img: { originalRotation: 0, transform: "rotate(180deg)" } },
    ]);

    const result = service.applyDOMChangesToDocument(
      doc,
      undefined,
      new Set<string>(["p1"]),
    ) as PDFDocument[];

    expect(result[0].pages[0].rotation).toBe(90);
    expect(result[1].pages[0].rotation).toBe(180);
  });
});

describe("resetDOMToDocumentState", () => {
  test("rewrites each page <img> transform to match the stored rotation", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([
      makePage({ id: "a", rotation: 90 }),
      makePage({ id: "b", rotation: 270 }),
    ]);
    const imgs = buildDOM([
      { id: "a", img: { transform: "rotate(45deg)" } },
      { id: "b", img: { transform: "rotate(10deg)" } },
    ]);

    service.resetDOMToDocumentState(doc);

    expect(imgs.a.style.transform).toBe("rotate(90deg)");
    expect(imgs.b.style.transform).toBe("rotate(270deg)");
  });

  test("skips pages whose element is missing or has no <img>", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([
      makePage({ id: "present-no-img", rotation: 90 }),
      makePage({ id: "absent", rotation: 90 }),
    ]);
    // "present-no-img" element exists but has no <img>; "absent" has no element.
    buildDOM([{ id: "present-no-img" }]);

    // Must not throw across both the no-img and missing-element branches.
    expect(() => service.resetDOMToDocumentState(doc)).not.toThrow();
  });
});

describe("hasUnsavedChanges", () => {
  test("returns true when a DOM rotation differs from the stored rotation", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "a", rotation: 0 })]);
    // DOM yields rotation 90, stored is 0 -> mismatch.
    buildDOM([
      { id: "a", img: { originalRotation: 0, transform: "rotate(90deg)" } },
    ]);

    expect(service.hasUnsavedChanges(doc)).toBe(true);
  });

  test("returns false when every DOM rotation matches the stored rotation", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([
      makePage({ id: "a", rotation: 90 }),
      makePage({ id: "b", rotation: 0 }),
    ]);
    // a: original 90, visual 90 -> userChange 0 -> final 90 (matches stored 90).
    // b: no transform, original 0 -> stays 0 (matches stored 0).
    buildDOM([
      { id: "a", img: { originalRotation: 90, transform: "rotate(90deg)" } },
      { id: "b", img: { originalRotation: 0 } },
    ]);

    expect(service.hasUnsavedChanges(doc)).toBe(false);
  });

  test("treats pages with no DOM element as unchanged (false)", () => {
    const service = new DocumentManipulationService();
    const doc = makeDocument([makePage({ id: "ghost", rotation: 180 })]);
    // No DOM at all -> querySelector returns null -> branch returns false.

    expect(service.hasUnsavedChanges(doc)).toBe(false);
  });
});
