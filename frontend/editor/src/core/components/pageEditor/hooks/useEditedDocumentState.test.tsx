import { useCallback, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";

import { useEditedDocumentState } from "@app/components/pageEditor/hooks/useEditedDocumentState";
import type { FileId } from "@app/types/file";
import type { PDFDocument, PDFPage } from "@app/types/pageEditor";

const noop = () => {};

/**
 * Builds a minimal PDFPage. Page ids double as a human-readable label so the
 * ordering/insertion assertions stay easy to read.
 */
function makePage(id: string, overrides: Partial<PDFPage> = {}): PDFPage {
  return {
    id,
    pageNumber: 1,
    originalPageNumber: 1,
    thumbnail: null,
    rotation: 0,
    selected: false,
    ...overrides,
  };
}

/**
 * Builds a minimal PDFDocument. A throwaway File is fine because the hook never
 * inspects file contents — only identity for the metadata-change comparison.
 */
function makeDoc(
  overrides: Partial<PDFDocument> = {},
  pages: PDFPage[] = [makePage("p1"), makePage("p2")],
): PDFDocument {
  return {
    id: "doc-1",
    name: "doc.pdf",
    file: new File(["x"], "doc.pdf", { type: "application/pdf" }),
    pages,
    totalPages: pages.length,
    ...overrides,
  };
}

interface HookProps {
  initialDocument: PDFDocument | null;
  mergedPdfDocument: PDFDocument | null;
  reorderedPages: PDFPage[] | null;
  clearReorderedPages: () => void;
  fileOrder: FileId[];
  updateCurrentPages: (pages: PDFPage[] | null) => void;
}

/**
 * Convenience to render the hook with sensible defaults plus per-test
 * overrides, returning the renderHook result so callers can rerender.
 */
function renderEditedDocumentState(props: Partial<HookProps> = {}) {
  const clearReorderedPages = props.clearReorderedPages ?? vi.fn();
  const updateCurrentPages = props.updateCurrentPages ?? vi.fn();
  const initialProps: HookProps = {
    initialDocument: props.initialDocument ?? null,
    mergedPdfDocument: props.mergedPdfDocument ?? null,
    reorderedPages: props.reorderedPages ?? null,
    clearReorderedPages,
    fileOrder: props.fileOrder ?? [],
    updateCurrentPages,
  };

  const utils = renderHook((p: HookProps) => useEditedDocumentState(p), {
    initialProps,
  });

  // The hook seeds state from effects (clone, then merged-sync). Each is a
  // setState fired from a useEffect, so the resulting render needs an extra
  // commit before assertions can observe a fully-settled value. Re-rendering
  // with the same props inside act() drains those pending passive-effect
  // updates deterministically.
  act(() => {
    utils.rerender(initialProps);
  });

  return { ...utils, clearReorderedPages, updateCurrentPages, initialProps };
}

/**
 * Rerenders with new props, then rerenders again with the same props inside the
 * same act() so any setState queued by the merged-sync / reorder effects fully
 * commits before assertions run.
 */
function rerenderAndFlush(
  rerender: (props: HookProps) => void,
  props: HookProps,
) {
  act(() => {
    rerender(props);
    rerender(props);
  });
}

const ids = (pages: PDFPage[] | null | undefined) =>
  (pages ?? []).map((p) => p.id);

describe("useEditedDocumentState", () => {
  test("returns null edited document and falls back to initialDocument for display", () => {
    const { result } = renderEditedDocumentState();

    // With no initial document at all, both edited and display are null.
    expect(result.current.editedDocument).toBeNull();
    expect(result.current.displayDocument).toBeNull();
    expect(result.current.getEditedDocument()).toBeNull();
  });

  test("clones the initial document once and uses it as display fallback", () => {
    const initialPages = [makePage("a"), makePage("b")];
    const initialDocument = makeDoc({}, initialPages);
    // A merged document is required for the cloned working copy to survive (the
    // hook resets edited state to null whenever mergedPdfDocument is absent).
    // Reusing the same id/name/file and page ids keeps the merged-sync a no-op,
    // so the pristine clone is what we observe.
    const merged = {
      ...initialDocument,
      pages: initialDocument.pages.map((p) => ({ ...p })),
    };

    const { result } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged,
    });

    // The clone effect should have produced an edited document.
    expect(result.current.editedDocument).not.toBeNull();
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "b"]);
    // displayDocument prefers the edited (cloned) document.
    expect(result.current.displayDocument).toBe(result.current.editedDocument);

    // The clone must be a distinct object graph, not the same references.
    expect(result.current.editedDocument).not.toBe(initialDocument);
    expect(result.current.editedDocument?.pages[0]).not.toBe(initialPages[0]);
    // getEditedDocument exposes the latest ref value.
    expect(result.current.getEditedDocument()).toBe(
      result.current.editedDocument,
    );
  });

  test("invokes updateCurrentPages with the display document pages", () => {
    const initialDocument = makeDoc({}, [makePage("a"), makePage("b")]);
    const updateCurrentPages = vi.fn();

    renderEditedDocumentState({ initialDocument, updateCurrentPages });

    // Even before any merged-driven clone settles, displayDocument falls back to
    // the initial document, so updateCurrentPages receives its pages.
    const lastCall = updateCurrentPages.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(ids(lastCall?.[0])).toEqual(["a", "b"]);
  });

  test("applies reorderedPages and clears the pending reorder", () => {
    const initialDocument = makeDoc({}, [makePage("a"), makePage("b")]);
    // Merged is required so the cloned editedDocument exists for the reorder
    // effect to act on.
    const merged = {
      ...initialDocument,
      pages: initialDocument.pages.map((p) => ({ ...p })),
    };

    // The reorder effect both reads editedDocument and writes it, so it would
    // loop forever unless reorderedPages becomes null after the first apply.
    // Modeling the real parent contract, the harness keeps reorderedPages in
    // its own state and clearReorderedPages() nulls it — exactly what stops the
    // effect from re-firing.
    const reordered = [makePage("b"), makePage("a")];
    const clearSpy = vi.fn();

    let triggerReorder!: () => void;
    let latest: ReturnType<typeof useEditedDocumentState> | null = null;

    function Harness() {
      const [pendingReorder, setPendingReorder] = useState<PDFPage[] | null>(
        null,
      );
      triggerReorder = () => setPendingReorder(reordered);
      const clearReorderedPages = useCallback(() => {
        clearSpy();
        setPendingReorder(null);
      }, []);

      latest = useEditedDocumentState({
        initialDocument,
        mergedPdfDocument: merged,
        reorderedPages: pendingReorder,
        clearReorderedPages,
        fileOrder: [],
        updateCurrentPages: noop,
      });
      return null;
    }

    render(<Harness />);

    expect(
      ids(
        (latest as ReturnType<typeof useEditedDocumentState> | null)
          ?.editedDocument?.pages,
      ),
    ).toEqual(["a", "b"]);

    // Fire the reorder; the effect applies it and calls clearReorderedPages,
    // which nulls the harness state so the effect stops re-running.
    act(() => {
      triggerReorder();
    });

    expect(
      ids(
        (latest as ReturnType<typeof useEditedDocumentState> | null)
          ?.editedDocument?.pages,
      ),
    ).toEqual(["b", "a"]);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores reorderedPages when there is no edited document yet", () => {
    const clearReorderedPages = vi.fn();
    const reordered = [makePage("b"), makePage("a")];

    const { result } = renderEditedDocumentState({
      reorderedPages: reordered,
      clearReorderedPages,
    });

    // No initial/edited document means the reorder effect early-returns.
    expect(result.current.editedDocument).toBeNull();
    expect(clearReorderedPages).not.toHaveBeenCalled();
  });

  test("resets the synced signature and re-clones from initial when mergedPdfDocument becomes null", () => {
    const initialDocument = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged = {
      ...initialDocument,
      pages: initialDocument.pages.map((p) => ({ ...p })),
    };

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged,
    });

    const firstEdited = result.current.editedDocument;
    expect(firstEdited).not.toBeNull();

    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: null });

    // The merged-null effect resets edited state to null and clears the
    // synced-signature ref; because editedDocument then transitions to null, the
    // clone effect re-runs and re-seeds a fresh working copy from the
    // still-present initial document.
    expect(result.current.editedDocument).not.toBeNull();
    expect(result.current.editedDocument).not.toBe(firstEdited);
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "b"]);
    expect(result.current.displayDocument).toBe(result.current.editedDocument);
  });

  test("falls back to initialDocument display while merged is null and no clone exists", () => {
    // initialDocument is null so the clone effect never fires; with merged null
    // too, both the reset effect and clone effect short-circuit.
    const { result } = renderEditedDocumentState({
      initialDocument: null,
      mergedPdfDocument: null,
    });

    expect(result.current.editedDocument).toBeNull();
    expect(result.current.displayDocument).toBeNull();
  });

  test("resets to merged pages when the new signature has no overlap", () => {
    const initialDocument = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged1 = makeDoc({ id: "doc-1" }, [makePage("a"), makePage("b")]);

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "b"]);

    // Entirely new ids => no overlap => hard reset to merged source pages.
    const merged2 = makeDoc({ id: "doc-1" }, [makePage("x"), makePage("y")]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    expect(ids(result.current.editedDocument?.pages)).toEqual(["x", "y"]);
    // Page numbers are renumbered sequentially after the reset.
    expect(
      result.current.editedDocument?.pages.map((p) => p.pageNumber),
    ).toEqual([1, 2]);
    expect(result.current.editedDocument?.totalPages).toBe(2);
  });

  test("inserts an added page after its cached neighbor when overlap exists", () => {
    const initialDocument = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged1 = makeDoc({ id: "doc-1" }, [makePage("a"), makePage("b")]);

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    // Merged now has a new page "c" sitting after "a" (its neighbor cache => "a").
    const merged2 = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("c"),
      makePage("b"),
    ]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    // Existing pages keep their order, the addition lands after neighbor "a".
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "c", "b"]);
    expect(result.current.editedDocument?.totalPages).toBe(3);
  });

  test("inserts a page with neighborId null at the front", () => {
    const initialDocument = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged1 = makeDoc({ id: "doc-1" }, [makePage("a"), makePage("b")]);

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    // New page "z" becomes the first merged page, so its neighbor cache is null
    // => it should be prepended at index 0.
    const merged2 = makeDoc({ id: "doc-1" }, [
      makePage("z"),
      makePage("a"),
      makePage("b"),
    ]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    expect(ids(result.current.editedDocument?.pages)).toEqual(["z", "a", "b"]);
  });

  test("removes non-ephemeral pages that disappear but keeps blank/placeholder pages", () => {
    const initialPages = [
      makePage("a"),
      makePage("blank", { isBlankPage: true }),
      makePage("b"),
    ];
    const initialDocument = makeDoc({ id: "doc-1" }, initialPages);
    const merged1 = makeDoc(
      { id: "doc-1" },
      initialPages.map((p) => makePage(p.id, { isBlankPage: p.isBlankPage })),
    );

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    expect(ids(result.current.editedDocument?.pages)).toEqual([
      "a",
      "blank",
      "b",
    ]);

    // Merged drops "b" (a real page) but never tracked the ephemeral "blank".
    const merged2 = makeDoc({ id: "doc-1" }, [makePage("a")]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    // "b" removed, ephemeral "blank" preserved.
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "blank"]);
  });

  test("inserts an added page at a placeholder position for its originalFileId", () => {
    const fileA = "file-A" as FileId;
    const initialPages = [
      makePage("ph", { isPlaceholder: true, originalFileId: fileA }),
      makePage("tail"),
    ];
    const initialDocument = makeDoc({ id: "doc-1" }, initialPages);
    const merged1 = makeDoc(
      { id: "doc-1" },
      initialPages.map((p) =>
        makePage(p.id, {
          isPlaceholder: p.isPlaceholder,
          originalFileId: p.originalFileId,
        }),
      ),
    );

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    // A real page belonging to fileA arrives; it should be inserted at the
    // placeholder slot (index 0) rather than appended.
    const merged2 = makeDoc({ id: "doc-1" }, [
      makePage("ph", { isPlaceholder: true, originalFileId: fileA }),
      makePage("real", { originalFileId: fileA }),
      makePage("tail"),
    ]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    // "real" lands at the placeholder index (front), placeholder + tail remain.
    expect(ids(result.current.editedDocument?.pages)).toEqual([
      "real",
      "ph",
      "tail",
    ]);
  });

  test("replaces base document and renumbers on a metadata-only change", () => {
    const initialDocument = makeDoc({ id: "doc-1", name: "old.pdf" }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged1 = makeDoc({ id: "doc-1", name: "old.pdf" }, [
      makePage("a"),
      makePage("b"),
    ]);

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    expect(result.current.editedDocument?.name).toBe("old.pdf");

    // Same page ids (no signature change) but new name => metadataChanged path.
    const merged2 = makeDoc({ id: "doc-1", name: "renamed.pdf" }, [
      makePage("a"),
      makePage("b"),
    ]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    expect(result.current.editedDocument?.name).toBe("renamed.pdf");
    // Page order is untouched by a metadata-only change.
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "b"]);
  });

  test("no-ops when neither signature nor metadata changed", () => {
    const initialDocument = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
    ]);
    // merged1 shares the same id/name/file and page ids as the clone.
    const merged1 = {
      ...initialDocument,
      pages: initialDocument.pages.map((p) => ({ ...p })),
    };

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
      fileOrder: ["f1" as FileId],
    });

    // On mount the merged-sync bails because the editedDocument ref isn't synced
    // yet, so lastSyncedSignature is still null. The first fileOrder bump
    // re-triggers the effect with the ref populated; it records the signature
    // and produces the settled base document.
    rerenderAndFlush(rerender, {
      ...initialProps,
      mergedPdfDocument: merged1,
      fileOrder: ["f1" as FileId, "f2" as FileId],
    });
    const before = result.current.editedDocument;
    expect(before).not.toBeNull();

    // A second fileOrder bump re-runs the effect, but now signatureChanged and
    // metadataChanged are both false, so it returns early and editedDocument is
    // left untouched (same reference).
    rerenderAndFlush(rerender, {
      ...initialProps,
      mergedPdfDocument: merged1,
      fileOrder: ["f1" as FileId, "f2" as FileId, "f3" as FileId],
    });

    expect(result.current.editedDocument).toBe(before);
  });

  test("does not re-clone once an edited document already exists", () => {
    const initialDoc1 = makeDoc({ id: "doc-1" }, [makePage("a")]);
    // Stable merged copy keeps the clone alive without mutating it.
    const merged1 = {
      ...initialDoc1,
      pages: initialDoc1.pages.map((p) => ({ ...p })),
    };

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument: initialDoc1,
      mergedPdfDocument: merged1,
    });

    const firstEdited = result.current.editedDocument;
    expect(firstEdited).not.toBeNull();

    // A brand new initial document arrives, but the clone effect guards on the
    // existing editedDocument and must not overwrite it.
    const initialDoc2 = makeDoc({ id: "doc-2" }, [makePage("z")]);
    rerenderAndFlush(rerender, {
      ...initialProps,
      initialDocument: initialDoc2,
    });

    expect(result.current.editedDocument).toBe(firstEdited);
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a"]);
  });

  test("preserves the destroy callback from the previous document on signature change", () => {
    const destroy = vi.fn();
    const initialDocument = makeDoc({ id: "doc-1", destroy }, [
      makePage("a"),
      makePage("b"),
    ]);
    const merged1 = makeDoc({ id: "doc-1", destroy }, [
      makePage("a"),
      makePage("b"),
    ]);

    const { result, rerender, initialProps } = renderEditedDocumentState({
      initialDocument,
      mergedPdfDocument: merged1,
    });

    // Signature change (new id "c") triggers a base replacement; the prior
    // destroy handler must be carried over onto the new base document.
    const merged2 = makeDoc({ id: "doc-1" }, [
      makePage("a"),
      makePage("b"),
      makePage("c"),
    ]);
    rerenderAndFlush(rerender, { ...initialProps, mergedPdfDocument: merged2 });

    expect(result.current.editedDocument?.destroy).toBe(destroy);
    expect(ids(result.current.editedDocument?.pages)).toEqual(["a", "b", "c"]);
  });
});
