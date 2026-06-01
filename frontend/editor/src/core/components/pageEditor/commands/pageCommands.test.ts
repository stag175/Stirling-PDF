import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PDFDocument, PDFPage } from "@app/types/pageEditor";
import {
  BulkPageBreakCommand,
  BulkRotateCommand,
  BulkSplitCommand,
  DeletePagesCommand,
  DOMCommand,
  InsertFilesCommand,
  PageBreakCommand,
  ReorderPagesCommand,
  RotatePageCommand,
  SplitAllCommand,
  SplitCommand,
  UndoManager,
} from "@app/components/pageEditor/commands/pageCommands";

// --- Mock the dynamically-imported services used by InsertFilesCommand. -----
// These are imported lazily via `await import(...)` inside the command, so a
// module-level vi.mock keeps the async path fully deterministic (no real
// PDF.js worker, no real canvas thumbnailing).
const createDocument = vi.fn();
const destroyDocument = vi.fn();
const generateThumbnails = vi.fn();

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: (...args: unknown[]) => createDocument(...args),
    destroyDocument: (...args: unknown[]) => destroyDocument(...args),
  },
}));

vi.mock("@app/services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: {
    generateThumbnails: (...args: unknown[]) => generateThumbnails(...args),
  },
}));

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
    isBlankPage: overrides.isBlankPage,
    ...overrides,
  };
}

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

/**
 * A tiny store mimicking the get/set document callbacks the commands consume.
 * Returning the live reference (not a clone) matches how the real page-editor
 * state feeds back into getCurrentDocument between execute/undo calls.
 */
function makeDocStore(initial: PDFDocument | null) {
  let doc = initial;
  const setDocument = vi.fn((next: PDFDocument) => {
    doc = next;
  });
  const getCurrentDocument = vi.fn(() => doc);
  return { getCurrentDocument, setDocument, get: () => doc };
}

function makeSetStore<T>(initial: T) {
  let value = initial;
  const set = vi.fn((next: T) => {
    value = next;
  });
  const get = vi.fn(() => value);
  return { get, set, peek: () => value };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe("RotatePageCommand", () => {
  test("execute applies normalized rotation and undo restores original", () => {
    const store = makeDocStore(makeDoc(2));
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );

    cmd.execute();
    expect(store.get()!.pages[0].rotation).toBe(90);
    expect(store.get()!.pages[1].rotation).toBe(0);

    cmd.undo();
    expect(store.get()!.pages[0].rotation).toBe(0);
  });

  test("execute normalizes negative rotation into the 0-359 range", () => {
    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "page-1",
      -90,
      store.getCurrentDocument,
      store.setDocument,
    );

    cmd.execute();
    expect(store.get()!.pages[0].rotation).toBe(270);
    expect(cmd.description).toBe("Rotate page left");
  });

  test("right rotation reports the correct description", () => {
    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    expect(cmd.description).toBe("Rotate page right");
  });

  test("execute mirrors the rotation onto a mounted DOM img", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-page-id", "page-1");
    const img = document.createElement("img");
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);

    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );

    cmd.execute();
    expect(img.style.transform).toBe("rotate(90deg)");

    cmd.undo();
    expect(img.style.transform).toBe("rotate(0deg)");
  });

  test("execute is a no-op when there is no document", () => {
    const store = makeDocStore(null);
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.setDocument).not.toHaveBeenCalled();
  });

  test("execute is a no-op when the target page is missing", () => {
    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "missing",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.setDocument).not.toHaveBeenCalled();
  });

  test("undo before execute returns without touching the document", () => {
    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });

  test("undo is a no-op when the document disappears after execute", () => {
    const store = makeDocStore(makeDoc(1));
    const cmd = new RotatePageCommand(
      "page-1",
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    store.setDocument.mockClear();
    store.getCurrentDocument.mockReturnValue(null);
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("DeletePagesCommand", () => {
  function build(doc: PDFDocument | null, pagesToDelete: number[]) {
    const store = makeDocStore(doc);
    const selectedIds = makeSetStore<string[]>([]);
    const splits = makeSetStore<Set<string>>(new Set());
    const selectedPages = makeSetStore<number[]>([]);
    const onAllPagesDeleted = vi.fn();
    const cmd = new DeletePagesCommand(
      pagesToDelete,
      store.getCurrentDocument,
      store.setDocument,
      selectedIds.set,
      splits.get,
      splits.set,
      selectedPages.get,
      onAllPagesDeleted,
    );
    return {
      store,
      selectedIds,
      splits,
      selectedPages,
      onAllPagesDeleted,
      cmd,
    };
  }

  test("deletes pages, renumbers, and prunes selection + splits", () => {
    const ctx = build(makeDoc(4), [2]);
    ctx.selectedPages.set([2, 3]);
    ctx.splits.set(new Set(["page-2", "page-3"]));

    ctx.cmd.execute();

    const remaining = ctx.store.get()!.pages;
    expect(remaining.map((p) => p.id)).toEqual(["page-1", "page-3", "page-4"]);
    expect(remaining.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(ctx.store.get()!.totalPages).toBe(3);
    // page-3 was selected and survives; page-2 was deleted.
    expect(ctx.selectedIds.peek()).toEqual(["page-3"]);
    // split on the deleted page-2 dropped; split on page-3 (no longer last) kept.
    expect([...ctx.splits.peek()]).toEqual(["page-3"]);
    expect(ctx.cmd.description).toBe("Delete 1 page(s)");
  });

  test("drops a split that lands on the new last page", () => {
    const ctx = build(makeDoc(3), [1]);
    ctx.splits.set(new Set(["page-3"]));
    ctx.cmd.execute();
    // page-3 becomes the last remaining page, so its split is removed.
    expect([...ctx.splits.peek()]).toEqual([]);
  });

  test("undo restores the original document, splits, and selection", () => {
    const ctx = build(makeDoc(3), [2]);
    ctx.selectedPages.set([1, 2]);
    ctx.splits.set(new Set(["page-1"]));

    ctx.cmd.execute();
    ctx.cmd.undo();

    expect(ctx.store.get()!.pages.map((p) => p.id)).toEqual([
      "page-1",
      "page-2",
      "page-3",
    ]);
    expect([...ctx.splits.peek()]).toEqual(["page-1"]);
    expect(ctx.selectedIds.peek()).toEqual(["page-1", "page-2"]);
  });

  test("deleting every page clears selection/splits and fires the callback", () => {
    const ctx = build(makeDoc(2), [1, 2]);
    ctx.splits.set(new Set(["page-1"]));
    ctx.cmd.execute();

    expect(ctx.onAllPagesDeleted).toHaveBeenCalledTimes(1);
    expect(ctx.selectedIds.peek()).toEqual([]);
    expect([...ctx.splits.peek()]).toEqual([]);
    // setDocument not called on the all-deleted branch.
    expect(ctx.store.setDocument).not.toHaveBeenCalled();
  });

  test("re-execute reuses the captured page IDs (idempotent first-capture)", () => {
    const ctx = build(makeDoc(4), [2]);
    ctx.cmd.execute();
    ctx.cmd.undo();
    // Second execute hits the hasExecuted=true short-circuit for state capture.
    ctx.cmd.execute();
    expect(ctx.store.get()!.pages.map((p) => p.id)).toEqual([
      "page-1",
      "page-3",
      "page-4",
    ]);
  });

  test("execute is a no-op with no document or an empty delete list", () => {
    const noDoc = build(null, [1]);
    noDoc.cmd.execute();
    expect(noDoc.store.setDocument).not.toHaveBeenCalled();

    const empty = build(makeDoc(2), []);
    empty.cmd.execute();
    expect(empty.store.setDocument).not.toHaveBeenCalled();
  });

  test("undo before execute does nothing", () => {
    const ctx = build(makeDoc(2), [1]);
    ctx.cmd.undo();
    expect(ctx.store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("ReorderPagesCommand", () => {
  test("single-page move forward adjusts the target index", () => {
    const store = makeDocStore(makeDoc(4));
    const onComplete = vi.fn();
    const cmd = new ReorderPagesCommand(
      1,
      3,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
      onComplete,
    );

    cmd.execute();

    expect(store.get()!.pages.map((p) => p.id)).toEqual([
      "page-2",
      "page-3",
      "page-1",
      "page-4",
    ]);
    expect(store.get()!.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(cmd.description).toBe("Reorder page(s)");
  });

  test("single-page move backward keeps the target index", () => {
    const store = makeDocStore(makeDoc(4));
    const cmd = new ReorderPagesCommand(
      4,
      1,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.get()!.pages.map((p) => p.id)).toEqual([
      "page-1",
      "page-4",
      "page-2",
      "page-3",
    ]);
  });

  test("multi-page move relocates the whole selection block", () => {
    const store = makeDocStore(makeDoc(5));
    const cmd = new ReorderPagesCommand(
      1,
      2,
      [1, 2],
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    // pages 1 & 2 lifted out, re-inserted at index 2 of the remaining [3,4,5].
    expect(store.get()!.pages.map((p) => p.id)).toEqual([
      "page-3",
      "page-4",
      "page-1",
      "page-2",
      "page-5",
    ]);
  });

  test("undo restores the captured original order", () => {
    const store = makeDocStore(makeDoc(3));
    const cmd = new ReorderPagesCommand(
      1,
      2,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    cmd.undo();
    expect(store.get()!.pages.map((p) => p.id)).toEqual([
      "page-1",
      "page-2",
      "page-3",
    ]);
  });

  test("execute is a no-op with no document", () => {
    const store = makeDocStore(null);
    const cmd = new ReorderPagesCommand(
      1,
      2,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.setDocument).not.toHaveBeenCalled();
  });

  test("execute is a no-op when the source page number is not found", () => {
    const store = makeDocStore(makeDoc(2));
    const cmd = new ReorderPagesCommand(
      99,
      0,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.setDocument).not.toHaveBeenCalled();
  });

  test("undo is a no-op when nothing was reordered", () => {
    const store = makeDocStore(makeDoc(2));
    const cmd = new ReorderPagesCommand(
      1,
      0,
      undefined,
      store.getCurrentDocument,
      store.setDocument,
    );
    // No execute => originalPages empty => undo bails.
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("SplitCommand (single)", () => {
  test("toggles a split on, then undo restores", () => {
    const splits = makeSetStore<Set<string>>(new Set());
    const cmd = new SplitCommand("page-2", 2, splits.get, splits.set);

    expect(cmd.description).toBe("Add split at position 2");
    cmd.execute();
    expect([...splits.peek()]).toEqual(["page-2"]);

    cmd.undo();
    expect([...splits.peek()]).toEqual([]);
  });

  test("toggles an existing split off", () => {
    const splits = makeSetStore<Set<string>>(new Set(["page-2"]));
    const cmd = new SplitCommand("page-2", 2, splits.get, splits.set);
    expect(cmd.description).toBe("Remove split at position 2");
    cmd.execute();
    expect([...splits.peek()]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("BulkRotateCommand", () => {
  test("rotates multiple pages and leaves others untouched", () => {
    const store = makeDocStore(makeDoc(3));
    const cmd = new BulkRotateCommand(
      ["page-1", "page-3"],
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.get()!.pages.map((p) => p.rotation)).toEqual([90, 0, 90]);
    expect(cmd.description).toBe("Rotate 2 page(s) right");
  });

  test("undo restores the captured original rotations", () => {
    const doc = makeDoc(2);
    doc.pages[0].rotation = 270;
    const store = makeDocStore(doc);
    const cmd = new BulkRotateCommand(
      ["page-1", "page-2"],
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.get()!.pages.map((p) => p.rotation)).toEqual([0, 90]);
    cmd.undo();
    expect(store.get()!.pages.map((p) => p.rotation)).toEqual([270, 0]);
  });

  test("mirrors rotation onto mounted DOM imgs on execute and undo", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-page-id", "page-1");
    const img = document.createElement("img");
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);

    const store = makeDocStore(makeDoc(1));
    const cmd = new BulkRotateCommand(
      ["page-1"],
      -90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(img.style.transform).toBe("rotate(270deg)");
    expect(cmd.description).toBe("Rotate 1 page(s) left");

    cmd.undo();
    expect(img.style.transform).toBe("rotate(0deg)");
  });

  test("execute and undo are no-ops without a document", () => {
    const store = makeDocStore(null);
    const cmd = new BulkRotateCommand(
      ["page-1"],
      90,
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("BulkSplitCommand", () => {
  test("toggles each numeric position (add + remove in one pass)", () => {
    const splits = makeSetStore<Set<number>>(new Set([1]));
    const cmd = new BulkSplitCommand([0, 1, 2], splits.get, splits.set);
    cmd.execute();
    // 0 and 2 added, 1 removed.
    expect([...splits.peek()].sort((a, b) => a - b)).toEqual([0, 2]);
    expect(cmd.description).toBe("Toggle 3 split position(s)");
  });

  test("undo restores the captured original positions", () => {
    const splits = makeSetStore<Set<number>>(new Set([5]));
    const cmd = new BulkSplitCommand([0, 1], splits.get, splits.set);
    cmd.execute();
    cmd.undo();
    expect([...splits.peek()]).toEqual([5]);
  });

  test("first-capture only happens once across re-execute", () => {
    const splits = makeSetStore<Set<number>>(new Set([9]));
    const cmd = new BulkSplitCommand([0], splits.get, splits.set);
    cmd.execute(); // captures {9}, toggles -> {9,0}
    cmd.execute(); // re-toggles 0 -> {9}; original still {9}
    cmd.undo();
    expect([...splits.peek()]).toEqual([9]);
  });
});

// ---------------------------------------------------------------------------
describe("SplitAllCommand", () => {
  test("adds every interior split when none are present", () => {
    const splits = makeSetStore<Set<number>>(new Set());
    const cmd = new SplitAllCommand(4, splits.get, splits.set);
    expect(cmd.description).toBe("Split all pages");
    cmd.execute();
    expect([...splits.peek()].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  test("removes every split when all are already present", () => {
    const splits = makeSetStore<Set<number>>(new Set([0, 1, 2]));
    const cmd = new SplitAllCommand(4, splits.get, splits.set);
    expect(cmd.description).toBe("Remove all splits");
    cmd.execute();
    expect([...splits.peek()]).toEqual([]);
  });

  test("undo restores the original positions", () => {
    const splits = makeSetStore<Set<number>>(new Set([1]));
    const cmd = new SplitAllCommand(4, splits.get, splits.set);
    cmd.execute();
    cmd.undo();
    expect([...splits.peek()]).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
describe("PageBreakCommand", () => {
  test("inserts a blank page after each selected page and renumbers", () => {
    const store = makeDocStore(makeDoc(3));
    const settings = { size: "A4" as const, orientation: "portrait" as const };
    const cmd = new PageBreakCommand(
      [1, 3],
      store.getCurrentDocument,
      store.setDocument,
      settings,
    );
    cmd.execute();

    const pages = store.get()!.pages;
    expect(pages).toHaveLength(5);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5]);
    const blanks = pages.filter((p) => p.isBlankPage);
    expect(blanks).toHaveLength(2);
    expect(blanks[0].pageBreakSettings).toEqual(settings);
    expect(blanks[0].originalPageNumber).toBe(-1);
    expect(cmd.description).toBe("Insert 2 page break(s)");
  });

  test("undo restores the original document", () => {
    const store = makeDocStore(makeDoc(2));
    const cmd = new PageBreakCommand(
      [1],
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.execute();
    expect(store.get()!.pages).toHaveLength(3);
    cmd.undo();
    expect(store.get()!.pages).toHaveLength(2);
  });

  test("execute is a no-op with no doc or empty selection", () => {
    const noDoc = makeDocStore(null);
    new PageBreakCommand(
      [1],
      noDoc.getCurrentDocument,
      noDoc.setDocument,
    ).execute();
    expect(noDoc.setDocument).not.toHaveBeenCalled();

    const empty = makeDocStore(makeDoc(2));
    new PageBreakCommand(
      [],
      empty.getCurrentDocument,
      empty.setDocument,
    ).execute();
    expect(empty.setDocument).not.toHaveBeenCalled();
  });

  test("undo before execute is a no-op", () => {
    const store = makeDocStore(makeDoc(2));
    const cmd = new PageBreakCommand(
      [1],
      store.getCurrentDocument,
      store.setDocument,
    );
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("BulkPageBreakCommand", () => {
  test("inserts blank pages between every page and remaps selection", () => {
    const store = makeDocStore(makeDoc(3));
    const selected = makeSetStore<number[]>([1, 3]);
    const cmd = new BulkPageBreakCommand(
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );
    cmd.execute();

    const pages = store.get()!.pages;
    // 3 real + 2 blanks (after pages 1 and 2, not the last).
    expect(pages).toHaveLength(5);
    expect(pages.filter((p) => p.isBlankPage)).toHaveLength(2);
    // page 1 stays at 1; page 3 (originally index 2) shifts to position 5.
    expect(selected.peek()).toEqual([1, 5]);
    expect(cmd.description).toBe("Insert page breaks after all pages");
  });

  test("undo restores the original document", () => {
    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([]);
    const cmd = new BulkPageBreakCommand(
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );
    cmd.execute();
    expect(store.get()!.pages).toHaveLength(3);
    cmd.undo();
    expect(store.get()!.pages).toHaveLength(2);
  });

  test("execute is a no-op without a document", () => {
    const store = makeDocStore(null);
    const selected = makeSetStore<number[]>([]);
    const cmd = new BulkPageBreakCommand(
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );
    cmd.execute();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("InsertFilesCommand", () => {
  beforeEach(() => {
    createDocument.mockReset();
    destroyDocument.mockReset();
    generateThumbnails.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function pdfFile(name = "ins.pdf") {
    return new File(["%PDF-1.4 inserted"], name, { type: "application/pdf" });
  }

  test("extracts pages, inserts them, updates context, and thumbnails", async () => {
    createDocument.mockResolvedValue({ numPages: 2 });
    generateThumbnails.mockResolvedValue([
      { success: true, thumbnail: "thumb-1" },
      { success: true, thumbnail: "thumb-2" },
    ]);

    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([1, 2]);
    const updateFileContext = vi.fn();
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      1,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
      updateFileContext,
    );

    await cmd.execute();

    const pages = store.get()!.pages;
    // 2 original + 2 inserted after page 1.
    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(destroyDocument).toHaveBeenCalledTimes(1);
    expect(updateFileContext).toHaveBeenCalledTimes(1);
    // page 1 kept; page 2 (after insert point) shifted by 2 inserted pages.
    expect(selected.peek()).toEqual([1, 4]);
    expect(cmd.description).toBe("Insert 1 file(s) after page 1");

    // Thumbnail generation is fire-and-forget inside execute(), so wait for the
    // detached async chain (dynamic import + generateThumbnails + setDocument)
    // to settle before asserting on its effects.
    await vi.waitFor(() => {
      expect(generateThumbnails).toHaveBeenCalledTimes(1);
      const inserted = store.get()!.pages.filter((p) => p.thumbnail !== null);
      expect(inserted.map((p) => p.thumbnail)).toEqual(["thumb-1", "thumb-2"]);
    });
  });

  test("undo restores the document captured before insertion", async () => {
    createDocument.mockResolvedValue({ numPages: 1 });
    generateThumbnails.mockResolvedValue([{ success: true, thumbnail: "t" }]);

    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([]);
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      2,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );
    await cmd.execute();
    expect(store.get()!.pages).toHaveLength(3);

    cmd.undo();
    expect(store.get()!.pages).toHaveLength(2);
  });

  test("reverts to the original document when extraction throws", async () => {
    createDocument.mockRejectedValue(new Error("boom"));

    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([]);
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      0,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );

    await cmd.execute();

    // On error the command restores the original 2-page document.
    expect(store.get()!.pages).toHaveLength(2);
    expect(generateThumbnails).not.toHaveBeenCalled();
  });

  test("handles a failed thumbnail result without throwing", async () => {
    createDocument.mockResolvedValue({ numPages: 1 });
    generateThumbnails.mockResolvedValue([
      { success: false, thumbnail: undefined },
    ]);

    const store = makeDocStore(makeDoc(1));
    const selected = makeSetStore<number[]>([]);
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      1,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );

    await cmd.execute();
    expect(store.get()!.pages).toHaveLength(2);

    // Wait for the detached thumbnail chain to run, then confirm the failed
    // result left every thumbnail null (the !result.success branch).
    await vi.waitFor(() => {
      expect(generateThumbnails).toHaveBeenCalledTimes(1);
    });
    expect(store.get()!.pages.every((p) => p.thumbnail === null)).toBe(true);
  });

  test("execute is a no-op with no document or no files", async () => {
    const noDoc = makeDocStore(null);
    const selected = makeSetStore<number[]>([]);
    await new InsertFilesCommand(
      [pdfFile()],
      0,
      noDoc.getCurrentDocument,
      noDoc.setDocument,
      selected.set,
      selected.get,
    ).execute();
    expect(noDoc.setDocument).not.toHaveBeenCalled();

    const noFiles = makeDocStore(makeDoc(2));
    await new InsertFilesCommand(
      [],
      0,
      noFiles.getCurrentDocument,
      noFiles.setDocument,
      selected.set,
      selected.get,
    ).execute();
    expect(noFiles.setDocument).not.toHaveBeenCalled();
  });

  test("returns early when extracted files contain zero pages", async () => {
    createDocument.mockResolvedValue({ numPages: 0 });

    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([]);
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      0,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );

    await cmd.execute();
    // allNewPages.length === 0 short-circuits before setDocument.
    expect(store.setDocument).not.toHaveBeenCalled();
    expect(generateThumbnails).not.toHaveBeenCalled();
  });

  test("undo before execute is a no-op", () => {
    const store = makeDocStore(makeDoc(2));
    const selected = makeSetStore<number[]>([]);
    const cmd = new InsertFilesCommand(
      [pdfFile()],
      0,
      store.getCurrentDocument,
      store.setDocument,
      selected.set,
      selected.get,
    );
    cmd.undo();
    expect(store.setDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("UndoManager", () => {
  /** A trivial concrete DOMCommand whose effects are observable via a log. */
  class LogCommand extends DOMCommand {
    constructor(
      private label: string,
      private log: string[],
    ) {
      super();
    }
    execute(): void {
      this.log.push(`exec:${this.label}`);
    }
    undo(): void {
      this.log.push(`undo:${this.label}`);
    }
    get description(): string {
      return this.label;
    }
  }

  test("executeCommand runs, stacks, and notifies", () => {
    const log: string[] = [];
    const onChange = vi.fn();
    const mgr = new UndoManager();
    mgr.setStateChangeCallback(onChange);

    mgr.executeCommand(new LogCommand("A", log));
    expect(log).toEqual(["exec:A"]);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.hasHistory()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("undo / redo round trip", () => {
    const log: string[] = [];
    const mgr = new UndoManager();
    mgr.executeCommand(new LogCommand("A", log));
    mgr.executeCommand(new LogCommand("B", log));

    expect(mgr.undo()).toBe(true);
    expect(mgr.canRedo()).toBe(true);
    expect(mgr.redo()).toBe(true);

    expect(log).toEqual(["exec:A", "exec:B", "undo:B", "exec:B"]);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  test("undo / redo on empty stacks return false", () => {
    const mgr = new UndoManager();
    expect(mgr.undo()).toBe(false);
    expect(mgr.redo()).toBe(false);
  });

  test("executeCommand clears the redo stack", () => {
    const log: string[] = [];
    const mgr = new UndoManager();
    mgr.executeCommand(new LogCommand("A", log));
    mgr.undo();
    expect(mgr.canRedo()).toBe(true);
    mgr.executeCommand(new LogCommand("B", log));
    expect(mgr.canRedo()).toBe(false);
  });

  test("addToUndoStack stacks without executing", () => {
    const log: string[] = [];
    const mgr = new UndoManager();
    mgr.addToUndoStack(new LogCommand("A", log));
    // Not executed, but stacked.
    expect(log).toEqual([]);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  test("clear empties both stacks and notifies", () => {
    const log: string[] = [];
    const onChange = vi.fn();
    const mgr = new UndoManager();
    mgr.setStateChangeCallback(onChange);
    mgr.executeCommand(new LogCommand("A", log));
    mgr.undo();
    onChange.mockClear();

    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.hasHistory()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("works without a state-change callback registered", () => {
    const log: string[] = [];
    const mgr = new UndoManager();
    // No setStateChangeCallback => onStateChange?. paths execute the no-op branch.
    expect(() => {
      mgr.executeCommand(new LogCommand("A", log));
      mgr.undo();
      mgr.redo();
      mgr.addToUndoStack(new LogCommand("B", log));
      mgr.clear();
    }).not.toThrow();
  });
});
