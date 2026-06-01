import { useCallback, useState } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { usePageSelectionManager } from "@app/components/pageEditor/hooks/usePageSelectionManager";
import type { PDFDocument, PDFPage } from "@app/types/pageEditor";

/**
 * Builds a minimal PDFPage. The id doubles as a readable label and the
 * pageNumber drives the number<->id mapping the hook exposes.
 */
function makePage(id: string, pageNumber: number): PDFPage {
  return {
    id,
    pageNumber,
    originalPageNumber: pageNumber,
    thumbnail: null,
    rotation: 0,
    selected: false,
  };
}

/**
 * Builds a minimal PDFDocument. A throwaway File satisfies the type; the hook
 * never inspects file contents, only `pages`.
 */
function makeDoc(
  pages: PDFPage[],
  overrides: Partial<PDFDocument> = {},
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
  displayDocument: PDFDocument | null;
  selectedPageIds: string[];
  setSelectedPageIds: (ids: string[]) => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleSelectAll: (ids: string[]) => void;
  activeFilesSignature: string;
}

/**
 * Renders the hook with sensible defaults plus per-test overrides and returns
 * the spies alongside the renderHook result so callers can rerender.
 */
function renderManager(props: Partial<HookProps> = {}) {
  const setSelectedPageIds = props.setSelectedPageIds ?? vi.fn();
  const setSelectionMode = props.setSelectionMode ?? vi.fn();
  const toggleSelectAll = props.toggleSelectAll ?? vi.fn();
  const initialProps: HookProps = {
    displayDocument: props.displayDocument ?? null,
    selectedPageIds: props.selectedPageIds ?? [],
    setSelectedPageIds,
    setSelectionMode,
    toggleSelectAll,
    activeFilesSignature: props.activeFilesSignature ?? "sig-0",
  };

  const utils = renderHook((p: HookProps) => usePageSelectionManager(p), {
    initialProps,
  });

  return {
    ...utils,
    setSelectedPageIds,
    setSelectionMode,
    toggleSelectAll,
    initialProps,
  };
}

describe("usePageSelectionManager", () => {
  test("derives totalPages and returns no-op mappings when there is no document", () => {
    const { result } = renderManager({ displayDocument: null });

    // No document => totalPages is 0 and both mappers short-circuit to [].
    expect(result.current.totalPages).toBe(0);
    expect(result.current.csvInput).toBe("");
    expect(result.current.getPageNumbersFromIds(["a"])).toEqual([]);
    expect(result.current.getPageIdsFromNumbers([1])).toEqual([]);
  });

  test("auto-selects all pages and enables selection mode on first non-empty document", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2), makePage("c", 3)]);
    const setSelectedPageIds = vi.fn();
    const setSelectionMode = vi.fn();

    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
      setSelectionMode,
    });

    expect(result.current.totalPages).toBe(3);
    // The init effect seeds every page id and turns selection mode on once.
    expect(setSelectedPageIds).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(setSelectionMode).toHaveBeenCalledWith(true);
    expect(setSelectionMode).toHaveBeenCalledTimes(1);
  });

  test("does not auto-initialize selection for an empty document", () => {
    const doc = makeDoc([]);
    const setSelectedPageIds = vi.fn();
    const setSelectionMode = vi.fn();

    renderManager({
      displayDocument: doc,
      setSelectedPageIds,
      setSelectionMode,
    });

    // pages.length === 0 => the init guard fails and nothing fires.
    expect(setSelectionMode).not.toHaveBeenCalled();
    // The newly-added effect also early-returns (resets prev ref, no select).
    expect(setSelectedPageIds).not.toHaveBeenCalled();
  });

  test("maps page ids to page numbers, ignoring unknown ids and zero page numbers", () => {
    const doc = makeDoc([
      makePage("a", 1),
      makePage("b", 2),
      makePage("zero", 0),
    ]);
    const { result } = renderManager({ displayDocument: doc });

    // "missing" has no page; "zero" maps to 0 and is filtered out by `> 0`.
    expect(
      result.current.getPageNumbersFromIds(["b", "missing", "a", "zero"]),
    ).toEqual([2, 1]);
  });

  test("maps page numbers to ids, dropping numbers without a matching page", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2)]);
    const { result } = renderManager({ displayDocument: doc });

    // 99 has no page => "" => filtered out; order follows the input array.
    expect(result.current.getPageIdsFromNumbers([2, 99, 1])).toEqual([
      "b",
      "a",
    ]);
  });

  test("handleSelectAll forwards all page ids to toggleSelectAll", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2)]);
    const toggleSelectAll = vi.fn();
    const { result } = renderManager({ displayDocument: doc, toggleSelectAll });

    act(() => {
      result.current.handleSelectAll();
    });

    expect(toggleSelectAll).toHaveBeenCalledWith(["a", "b"]);
  });

  test("handleSelectAll is a no-op when there is no document", () => {
    const toggleSelectAll = vi.fn();
    const { result } = renderManager({
      displayDocument: null,
      toggleSelectAll,
    });

    act(() => {
      result.current.handleSelectAll();
    });

    expect(toggleSelectAll).not.toHaveBeenCalled();
  });

  test("handleDeselectAll clears the selection", () => {
    const doc = makeDoc([makePage("a", 1)]);
    const setSelectedPageIds = vi.fn();
    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    act(() => {
      result.current.handleDeselectAll();
    });

    expect(setSelectedPageIds).toHaveBeenLastCalledWith([]);
  });

  test("handleSetSelectedPages converts numbers to ids before storing them", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2), makePage("c", 3)]);
    const setSelectedPageIds = vi.fn();
    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    act(() => {
      result.current.handleSetSelectedPages([3, 1]);
    });

    // 3 -> "c", 1 -> "a"; unmatched numbers would be dropped.
    expect(setSelectedPageIds).toHaveBeenLastCalledWith(["c", "a"]);
  });

  test("updatePagesFromCSV is a no-op when there are no pages", () => {
    const doc = makeDoc([]);
    const setSelectedPageIds = vi.fn();
    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    act(() => {
      result.current.updatePagesFromCSV("1-3");
    });

    // totalPages === 0 => the CSV path returns before parsing.
    expect(setSelectedPageIds).not.toHaveBeenCalled();
  });

  test("updatePagesFromCSV parses an explicit override and selects matching ids", () => {
    const doc = makeDoc([
      makePage("a", 1),
      makePage("b", 2),
      makePage("c", 3),
      makePage("d", 4),
    ]);
    const setSelectedPageIds = vi.fn();
    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    act(() => {
      result.current.updatePagesFromCSV("1,3-4");
    });

    // parseSelection("1,3-4", 4) => [1,3,4] => ids ["a","c","d"].
    expect(setSelectedPageIds).toHaveBeenLastCalledWith(["a", "c", "d"]);
  });

  test("updatePagesFromCSV falls back to the stored csvInput when no override is given", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2), makePage("c", 3)]);
    const setSelectedPageIds = vi.fn();
    const { result } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    act(() => {
      result.current.setCsvInput("even");
    });

    act(() => {
      // No override => uses csvInput "even"; parseSelection("even", 3) => [2].
      result.current.updatePagesFromCSV();
    });

    expect(result.current.csvInput).toBe("even");
    expect(setSelectedPageIds).toHaveBeenLastCalledWith(["b"]);
  });

  test("setCsvInput updates the exposed csvInput state", () => {
    const { result } = renderManager({ displayDocument: makeDoc([]) });

    act(() => {
      result.current.setCsvInput("2n+1");
    });

    expect(result.current.csvInput).toBe("2n+1");
  });

  test("clears csvInput whenever activeFilesSignature changes", () => {
    const doc = makeDoc([makePage("a", 1)]);
    const { result, rerender, initialProps } = renderManager({
      displayDocument: doc,
      activeFilesSignature: "sig-0",
    });

    act(() => {
      result.current.setCsvInput("1-1");
    });
    expect(result.current.csvInput).toBe("1-1");

    // A new signature triggers the reset effect.
    act(() => {
      rerender({ ...initialProps, activeFilesSignature: "sig-1" });
    });

    expect(result.current.csvInput).toBe("");
  });

  test("auto-selects newly added page ids while preserving the existing selection", () => {
    const firstDoc = makeDoc([makePage("a", 1), makePage("b", 2)]);
    let captured: string[] = [];

    // A small harness models the parent's selection state so the
    // newly-added-pages effect can read the current selection and write back a
    // merged set deterministically across rerenders.
    function Harness({ doc }: { doc: PDFDocument }) {
      const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
      captured = selectedPageIds;
      const setSelected = useCallback((ids: string[]) => {
        setSelectedPageIds(ids);
      }, []);
      usePageSelectionManager({
        displayDocument: doc,
        selectedPageIds,
        setSelectedPageIds: setSelected,
        setSelectionMode: () => {},
        toggleSelectAll: () => {},
        activeFilesSignature: "sig",
      });
      return null;
    }

    const { rerender } = render(<Harness doc={firstDoc} />);

    // Init effect seeds the full first-doc selection.
    expect(captured).toEqual(["a", "b"]);

    // A new page "c" appears; only it is newly added, so it is appended while
    // "a" and "b" stay selected.
    const secondDoc = makeDoc([
      makePage("a", 1),
      makePage("b", 2),
      makePage("c", 3),
    ]);
    act(() => {
      rerender(<Harness doc={secondDoc} />);
    });

    expect(captured).toEqual(["a", "b", "c"]);
  });

  test("resets the previous-page-id tracking when the document becomes empty", () => {
    const doc = makeDoc([makePage("a", 1), makePage("b", 2)]);
    const setSelectedPageIds = vi.fn();
    const { rerender, initialProps } = renderManager({
      displayDocument: doc,
      setSelectedPageIds,
    });

    // Init seeded a selection; clear the spy to isolate the next transitions.
    setSelectedPageIds.mockClear();

    // Going to an empty document hits the early-return branch (prev ref reset),
    // so no selection update is emitted.
    act(() => {
      rerender({ ...initialProps, displayDocument: makeDoc([]) });
    });
    expect(setSelectedPageIds).not.toHaveBeenCalled();

    // Re-adding pages makes them all "newly added" again relative to the reset
    // tracking ref, so they get auto-selected.
    act(() => {
      rerender({
        ...initialProps,
        displayDocument: makeDoc([makePage("a", 1), makePage("b", 2)]),
        selectedPageIds: [],
      });
    });
    expect(setSelectedPageIds).toHaveBeenCalledWith(["a", "b"]);
  });
});
