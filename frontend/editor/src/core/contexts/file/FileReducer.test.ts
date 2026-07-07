import { describe, it, expect } from "vitest";
import {
  fileContextReducer,
  initialFileContextState,
} from "@app/contexts/file/FileReducer";
import { FileId } from "@app/types/file";
import {
  FileContextState,
  FileContextAction,
  StirlingFileStub,
} from "@app/types/fileContext";

// --- Deterministic fixtures -------------------------------------------------

const id = (s: string): FileId => s as FileId;

function makeStub(
  fileId: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: id(fileId),
    name: `${fileId}.pdf`,
    type: "application/pdf",
    size: 1024,
    lastModified: 1000,
    createdAt: 2000,
    isLeaf: true,
    originalFileId: fileId,
    versionNumber: 1,
    ...overrides,
  };
}

/**
 * Build a state with the given stubs registered, plus optional UI/pinned tweaks.
 * Keeps every test isolated from the shared initial-state object.
 */
function stateWith(
  stubs: StirlingFileStub[],
  opts: {
    selectedFileIds?: FileId[];
    pinned?: FileId[];
    errorFileIds?: FileId[];
    selectedPageNumbers?: number[];
  } = {},
): FileContextState {
  const byId: Record<FileId, StirlingFileStub> = {};
  stubs.forEach((s) => {
    byId[s.id] = s;
  });
  return {
    files: {
      ids: stubs.map((s) => s.id),
      byId,
    },
    pinnedFiles: new Set(opts.pinned ?? []),
    ui: {
      selectedFileIds: opts.selectedFileIds ?? [],
      selectedPageNumbers: opts.selectedPageNumbers ?? [],
      isProcessing: false,
      processingProgress: 0,
      hasUnsavedChanges: false,
      errorFileIds: opts.errorFileIds ?? [],
    },
  };
}

describe("FileReducer", () => {
  describe("initialFileContextState", () => {
    it("starts empty with a Set for pinnedFiles", () => {
      expect(initialFileContextState.files.ids).toEqual([]);
      expect(initialFileContextState.files.byId).toEqual({});
      expect(initialFileContextState.pinnedFiles).toBeInstanceOf(Set);
      expect(initialFileContextState.pinnedFiles.size).toBe(0);
      expect(initialFileContextState.ui.selectedFileIds).toEqual([]);
      expect(initialFileContextState.ui.errorFileIds).toEqual([]);
      expect(initialFileContextState.ui.isProcessing).toBe(false);
    });
  });

  describe("default / unknown action", () => {
    it("returns the same state reference for an unknown action", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "TOTALLY_UNKNOWN",
      } as unknown as FileContextAction);
      expect(result).toBe(state);
    });
  });

  describe("ADD_FILES", () => {
    it("adds new stubs to an empty state", () => {
      const a = makeStub("a");
      const b = makeStub("b");
      const result = fileContextReducer(initialFileContextState, {
        type: "ADD_FILES",
        payload: { stirlingFileStubs: [a, b] },
      });

      expect(result.files.ids).toEqual([id("a"), id("b")]);
      expect(result.files.byId[id("a")]).toBe(a);
      expect(result.files.byId[id("b")]).toBe(b);
    });

    it("appends to existing files preserving order", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "ADD_FILES",
        payload: { stirlingFileStubs: [makeStub("b")] },
      });
      expect(result.files.ids).toEqual([id("a"), id("b")]);
    });

    it("dedupes by stable id and keeps the existing record (does not overwrite)", () => {
      const original = makeStub("a", { name: "original.pdf" });
      const state = stateWith([original]);
      const duplicate = makeStub("a", { name: "duplicate.pdf" });

      const result = fileContextReducer(state, {
        type: "ADD_FILES",
        payload: { stirlingFileStubs: [duplicate] },
      });

      expect(result.files.ids).toEqual([id("a")]);
      // Existing record is retained, duplicate ignored
      expect(result.files.byId[id("a")]).toBe(original);
      expect(result.files.byId[id("a")].name).toBe("original.pdf");
    });

    it("dedupes within the same batch", () => {
      const result = fileContextReducer(initialFileContextState, {
        type: "ADD_FILES",
        payload: {
          stirlingFileStubs: [makeStub("a"), makeStub("a"), makeStub("b")],
        },
      });
      expect(result.files.ids).toEqual([id("a"), id("b")]);
    });

    it("does not mutate the previous state", () => {
      const state = stateWith([makeStub("a")]);
      const before = state.files.ids;
      fileContextReducer(state, {
        type: "ADD_FILES",
        payload: { stirlingFileStubs: [makeStub("b")] },
      });
      expect(state.files.ids).toBe(before);
      expect(state.files.ids).toEqual([id("a")]);
    });

    it("handles an empty batch as a no-op clone", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "ADD_FILES",
        payload: { stirlingFileStubs: [] },
      });
      expect(result.files.ids).toEqual([id("a")]);
      expect(result).not.toBe(state);
    });
  });

  describe("REMOVE_FILES", () => {
    it("removes a file and prunes it from selection", () => {
      const state = stateWith([makeStub("a"), makeStub("b")], {
        selectedFileIds: [id("a"), id("b")],
      });
      const result = fileContextReducer(state, {
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a")] },
      });

      expect(result.files.ids).toEqual([id("b")]);
      expect(result.files.byId[id("a")]).toBeUndefined();
      expect(result.files.byId[id("b")]).toBeDefined();
      expect(result.ui.selectedFileIds).toEqual([id("b")]);
    });

    it("removes multiple files at once", () => {
      const state = stateWith([makeStub("a"), makeStub("b"), makeStub("c")]);
      const result = fileContextReducer(state, {
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a"), id("c")] },
      });
      expect(result.files.ids).toEqual([id("b")]);
    });

    it("removes pinned files too (REMOVE_FILES ignores pin status)", () => {
      const state = stateWith([makeStub("a"), makeStub("b")], {
        pinned: [id("a")],
      });
      const result = fileContextReducer(state, {
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a")] },
      });
      expect(result.files.ids).toEqual([id("b")]);
      expect(result.files.byId[id("a")]).toBeUndefined();
    });

    it("ignores ids that are not present", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "REMOVE_FILES",
        payload: { fileIds: [id("nonexistent")] },
      });
      expect(result.files.ids).toEqual([id("a")]);
    });

    it("does not mutate the previous state byId map", () => {
      const state = stateWith([makeStub("a"), makeStub("b")]);
      fileContextReducer(state, {
        type: "REMOVE_FILES",
        payload: { fileIds: [id("a")] },
      });
      expect(state.files.byId[id("a")]).toBeDefined();
    });
  });

  describe("UPDATE_FILE_RECORD", () => {
    it("merges updates into an existing record", () => {
      const state = stateWith([
        makeStub("a", { name: "old.pdf", versionNumber: 1 }),
      ]);
      const result = fileContextReducer(state, {
        type: "UPDATE_FILE_RECORD",
        payload: {
          id: id("a"),
          updates: { name: "new.pdf", versionNumber: 2 },
        },
      });
      expect(result.files.byId[id("a")].name).toBe("new.pdf");
      expect(result.files.byId[id("a")].versionNumber).toBe(2);
      // Untouched fields preserved
      expect(result.files.byId[id("a")].type).toBe("application/pdf");
    });

    it("returns the same state reference when the file does not exist (no-op)", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "UPDATE_FILE_RECORD",
        payload: { id: id("missing"), updates: { name: "x.pdf" } },
      });
      expect(result).toBe(state);
    });

    it("does not mutate the original record", () => {
      const original = makeStub("a", { name: "old.pdf" });
      const state = stateWith([original]);
      fileContextReducer(state, {
        type: "UPDATE_FILE_RECORD",
        payload: { id: id("a"), updates: { name: "new.pdf" } },
      });
      expect(original.name).toBe("old.pdf");
    });

    it("preserves files ids ordering", () => {
      const state = stateWith([makeStub("a"), makeStub("b")]);
      const result = fileContextReducer(state, {
        type: "UPDATE_FILE_RECORD",
        payload: { id: id("b"), updates: { isDirty: true } },
      });
      expect(result.files.ids).toEqual([id("a"), id("b")]);
      expect(result.files.byId[id("b")].isDirty).toBe(true);
    });
  });

  describe("REORDER_FILES", () => {
    it("reorders ids to the provided order", () => {
      const state = stateWith([makeStub("a"), makeStub("b"), makeStub("c")]);
      const result = fileContextReducer(state, {
        type: "REORDER_FILES",
        payload: { orderedFileIds: [id("c"), id("a"), id("b")] },
      });
      expect(result.files.ids).toEqual([id("c"), id("a"), id("b")]);
    });

    it("filters out ids that do not exist in state", () => {
      const state = stateWith([makeStub("a"), makeStub("b")]);
      const result = fileContextReducer(state, {
        type: "REORDER_FILES",
        payload: { orderedFileIds: [id("b"), id("ghost"), id("a")] },
      });
      expect(result.files.ids).toEqual([id("b"), id("a")]);
    });

    it("reorders selected files following the new order and drops unselected", () => {
      const state = stateWith([makeStub("a"), makeStub("b"), makeStub("c")], {
        selectedFileIds: [id("a"), id("c")],
      });
      const result = fileContextReducer(state, {
        type: "REORDER_FILES",
        payload: { orderedFileIds: [id("c"), id("b"), id("a")] },
      });
      // Only previously-selected ids survive, in the new order
      expect(result.ui.selectedFileIds).toEqual([id("c"), id("a")]);
    });
  });

  describe("SET_SELECTED_FILES / SET_SELECTED_PAGES / CLEAR_SELECTIONS", () => {
    it("sets selected file ids", () => {
      const state = stateWith([makeStub("a"), makeStub("b")]);
      const result = fileContextReducer(state, {
        type: "SET_SELECTED_FILES",
        payload: { fileIds: [id("b")] },
      });
      expect(result.ui.selectedFileIds).toEqual([id("b")]);
    });

    it("sets selected page numbers", () => {
      const result = fileContextReducer(initialFileContextState, {
        type: "SET_SELECTED_PAGES",
        payload: { pageNumbers: [1, 3, 5] },
      });
      expect(result.ui.selectedPageNumbers).toEqual([1, 3, 5]);
    });

    it("clears both file and page selections", () => {
      const state = stateWith([makeStub("a")], {
        selectedFileIds: [id("a")],
        selectedPageNumbers: [2],
      });
      const result = fileContextReducer(state, { type: "CLEAR_SELECTIONS" });
      expect(result.ui.selectedFileIds).toEqual([]);
      expect(result.ui.selectedPageNumbers).toEqual([]);
    });
  });

  describe("SET_PROCESSING / SET_UNSAVED_CHANGES", () => {
    it("sets processing flag and progress", () => {
      const result = fileContextReducer(initialFileContextState, {
        type: "SET_PROCESSING",
        payload: { isProcessing: true, progress: 42 },
      });
      expect(result.ui.isProcessing).toBe(true);
      expect(result.ui.processingProgress).toBe(42);
    });

    it("sets unsaved changes flag", () => {
      const result = fileContextReducer(initialFileContextState, {
        type: "SET_UNSAVED_CHANGES",
        payload: { hasChanges: true },
      });
      expect(result.ui.hasUnsavedChanges).toBe(true);
    });
  });

  describe("file error actions", () => {
    it("MARK_FILE_ERROR adds an error id", () => {
      const result = fileContextReducer(initialFileContextState, {
        type: "MARK_FILE_ERROR",
        payload: { fileId: id("a") },
      });
      expect(result.ui.errorFileIds).toEqual([id("a")]);
    });

    it("MARK_FILE_ERROR is idempotent and returns same state when already present", () => {
      const state = stateWith([makeStub("a")], { errorFileIds: [id("a")] });
      const result = fileContextReducer(state, {
        type: "MARK_FILE_ERROR",
        payload: { fileId: id("a") },
      });
      expect(result).toBe(state);
    });

    it("CLEAR_FILE_ERROR removes a specific error id", () => {
      const state = stateWith([makeStub("a")], {
        errorFileIds: [id("a"), id("b")],
      });
      const result = fileContextReducer(state, {
        type: "CLEAR_FILE_ERROR",
        payload: { fileId: id("a") },
      });
      expect(result.ui.errorFileIds).toEqual([id("b")]);
    });

    it("CLEAR_ALL_FILE_ERRORS empties the error list", () => {
      const state = stateWith([makeStub("a")], {
        errorFileIds: [id("a"), id("b")],
      });
      const result = fileContextReducer(state, {
        type: "CLEAR_ALL_FILE_ERRORS",
      });
      expect(result.ui.errorFileIds).toEqual([]);
    });
  });

  describe("PIN_FILE / UNPIN_FILE", () => {
    it("pins a file into a new Set", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "PIN_FILE",
        payload: { fileId: id("a") },
      });
      expect(result.pinnedFiles.has(id("a"))).toBe(true);
      // Immutability: new Set, old untouched
      expect(result.pinnedFiles).not.toBe(state.pinnedFiles);
      expect(state.pinnedFiles.has(id("a"))).toBe(false);
    });

    it("unpins a file", () => {
      const state = stateWith([makeStub("a")], { pinned: [id("a")] });
      const result = fileContextReducer(state, {
        type: "UNPIN_FILE",
        payload: { fileId: id("a") },
      });
      expect(result.pinnedFiles.has(id("a"))).toBe(false);
      expect(result.pinnedFiles).not.toBe(state.pinnedFiles);
    });
  });

  describe("CONSUME_FILES (processFileSwap)", () => {
    it("removes inputs and prepends outputs", () => {
      const state = stateWith([makeStub("a"), makeStub("b")]);
      const out = makeStub("out1");
      const result = fileContextReducer(state, {
        type: "CONSUME_FILES",
        payload: { inputFileIds: [id("a")], outputStirlingFileStubs: [out] },
      });
      // Added ids are prepended before remaining ids
      expect(result.files.ids).toEqual([id("out1"), id("b")]);
      expect(result.files.byId[id("a")]).toBeUndefined();
      expect(result.files.byId[id("out1")]).toBe(out);
    });

    it("does NOT remove pinned input files", () => {
      const state = stateWith([makeStub("a"), makeStub("b")], {
        pinned: [id("a")],
      });
      const out = makeStub("out1");
      const result = fileContextReducer(state, {
        type: "CONSUME_FILES",
        payload: {
          inputFileIds: [id("a"), id("b")],
          outputStirlingFileStubs: [out],
        },
      });
      // 'a' is pinned -> stays; 'b' is unpinned -> removed; out1 prepended
      expect(result.files.ids).toEqual([id("out1"), id("a")]);
      expect(result.files.byId[id("a")]).toBeDefined();
      expect(result.files.byId[id("b")]).toBeUndefined();
    });

    it("adds outputs to selection and drops removed inputs from selection", () => {
      const state = stateWith([makeStub("a"), makeStub("b")], {
        selectedFileIds: [id("a"), id("b")],
      });
      const out = makeStub("out1");
      const result = fileContextReducer(state, {
        type: "CONSUME_FILES",
        payload: { inputFileIds: [id("a")], outputStirlingFileStubs: [out] },
      });
      // 'a' removed from selection, 'b' kept, 'out1' appended
      expect(result.ui.selectedFileIds).toEqual([id("b"), id("out1")]);
    });

    it("does not add an output stub whose id already exists", () => {
      const existing = makeStub("dup", { name: "existing.pdf" });
      const state = stateWith([existing, makeStub("b")]);
      const collidingOutput = makeStub("dup", { name: "incoming.pdf" });
      const result = fileContextReducer(state, {
        type: "CONSUME_FILES",
        payload: {
          inputFileIds: [id("b")],
          outputStirlingFileStubs: [collidingOutput],
        },
      });
      // 'dup' already present so not re-added; only 'dup' remains (b removed)
      expect(result.files.ids).toEqual([id("dup")]);
      expect(result.files.byId[id("dup")]).toBe(existing);
      expect(result.files.byId[id("dup")].name).toBe("existing.pdf");
      // Not added => not appended to selection
      expect(result.ui.selectedFileIds).toEqual([]);
    });

    it("supports multiple outputs prepended in order", () => {
      const state = stateWith([makeStub("a")]);
      const result = fileContextReducer(state, {
        type: "CONSUME_FILES",
        payload: {
          inputFileIds: [id("a")],
          outputStirlingFileStubs: [makeStub("o1"), makeStub("o2")],
        },
      });
      expect(result.files.ids).toEqual([id("o1"), id("o2")]);
    });
  });

  describe("UNDO_CONSUME_FILES (processFileSwap reversed)", () => {
    it("removes outputs and restores inputs", () => {
      // Simulate post-consume state: out1 present, original 'a' gone
      const state = stateWith([makeStub("out1"), makeStub("b")]);
      const restored = makeStub("a");
      const result = fileContextReducer(state, {
        type: "UNDO_CONSUME_FILES",
        payload: {
          inputStirlingFileStubs: [restored],
          outputFileIds: [id("out1")],
        },
      });
      expect(result.files.ids).toEqual([id("a"), id("b")]);
      expect(result.files.byId[id("out1")]).toBeUndefined();
      expect(result.files.byId[id("a")]).toBe(restored);
    });

    it("keeps pinned outputs when undoing", () => {
      const state = stateWith([makeStub("out1"), makeStub("b")], {
        pinned: [id("out1")],
      });
      const result = fileContextReducer(state, {
        type: "UNDO_CONSUME_FILES",
        payload: {
          inputStirlingFileStubs: [makeStub("a")],
          outputFileIds: [id("out1")],
        },
      });
      // out1 pinned -> not removed; a prepended
      expect(result.files.ids).toEqual([id("a"), id("out1"), id("b")]);
      expect(result.files.byId[id("out1")]).toBeDefined();
    });
  });

  describe("RESET_CONTEXT", () => {
    it("returns a clean slate based on initial state", () => {
      const state = stateWith([makeStub("a"), makeStub("b")], {
        selectedFileIds: [id("a")],
        pinned: [id("b")],
        errorFileIds: [id("a")],
        selectedPageNumbers: [1, 2],
      });
      const result = fileContextReducer(state, { type: "RESET_CONTEXT" });
      expect(result.files.ids).toEqual([]);
      expect(result.files.byId).toEqual({});
      expect(result.ui.selectedFileIds).toEqual([]);
      expect(result.ui.selectedPageNumbers).toEqual([]);
      expect(result.ui.errorFileIds).toEqual([]);
      expect(result.pinnedFiles.size).toBe(0);
    });
  });
});
