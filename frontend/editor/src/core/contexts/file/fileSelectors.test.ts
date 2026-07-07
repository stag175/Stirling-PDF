/**
 * Unit tests for fileSelectors
 *
 * These are pure functions over plain refs/maps; no React render is required.
 * We construct minimal FileContextState / ref-like objects by hand so the tests
 * stay deterministic and free of network, storage, Tauri or React concerns.
 */

import { describe, test, expect } from "vitest";
import type { FileId } from "@app/types/file";
import {
  type FileContextState,
  type StirlingFileStub,
  type StirlingFile,
  createStirlingFile,
} from "@app/types/fileContext";
import {
  createFileSelectors,
  buildQuickKeySet,
  buildQuickKeySetFromMetadata,
  getPrimaryFile,
} from "@app/contexts/file/fileSelectors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const asId = (s: string): FileId => s as FileId;

/** A ref-like wrapper matching React.MutableRefObject's shape ({ current }). */
function ref<T>(current: T): React.MutableRefObject<T> {
  return { current } as React.MutableRefObject<T>;
}

/** Build a real File object (jsdom provides File). */
function makeFile(name = "f.pdf", lastModified = 1000, contents = "x"): File {
  return new File([contents], name, {
    type: "application/pdf",
    lastModified,
  });
}

/** Build a minimal StirlingFileStub with sensible defaults. */
function makeStub(
  id: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  const fileId = asId(id);
  return {
    id: fileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 100,
    lastModified: 5000,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    quickKey: `${id}.pdf|100|5000`,
    ...overrides,
  };
}

/** Build a minimal FileContextState. */
function makeState(
  overrides: {
    ids?: FileId[];
    byId?: Record<string, StirlingFileStub>;
    selectedFileIds?: FileId[];
    pinnedFiles?: Set<FileId>;
  } = {},
): FileContextState {
  return {
    files: {
      ids: overrides.ids ?? [],
      byId: (overrides.byId ?? {}) as Record<FileId, StirlingFileStub>,
    },
    pinnedFiles: overrides.pinnedFiles ?? new Set<FileId>(),
    ui: {
      selectedFileIds: overrides.selectedFileIds ?? [],
      selectedPageNumbers: [],
      isProcessing: false,
      processingProgress: 0,
      hasUnsavedChanges: false,
      errorFileIds: [],
    },
  };
}

// ---------------------------------------------------------------------------
// buildQuickKeySet
// ---------------------------------------------------------------------------

describe("buildQuickKeySet", () => {
  test("collects every defined quickKey into a Set", () => {
    const stubs: Record<FileId, StirlingFileStub> = {
      [asId("a")]: makeStub("a", { quickKey: "a.pdf|1|1" }),
      [asId("b")]: makeStub("b", { quickKey: "b.pdf|2|2" }),
    };

    const result = buildQuickKeySet(stubs);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has("a.pdf|1|1")).toBe(true);
    expect(result.has("b.pdf|2|2")).toBe(true);
  });

  test("skips records whose quickKey is missing or empty", () => {
    const stubs: Record<FileId, StirlingFileStub> = {
      [asId("a")]: makeStub("a", { quickKey: "a.pdf|1|1" }),
      [asId("b")]: makeStub("b", { quickKey: undefined }),
      [asId("c")]: makeStub("c", { quickKey: "" }),
    };

    const result = buildQuickKeySet(stubs);

    expect(result.size).toBe(1);
    expect(result.has("a.pdf|1|1")).toBe(true);
  });

  test("deduplicates identical quickKeys", () => {
    const stubs: Record<FileId, StirlingFileStub> = {
      [asId("a")]: makeStub("a", { quickKey: "dup|1|1" }),
      [asId("b")]: makeStub("b", { quickKey: "dup|1|1" }),
    };

    const result = buildQuickKeySet(stubs);

    expect(result.size).toBe(1);
    expect(result.has("dup|1|1")).toBe(true);
  });

  test("returns an empty Set for an empty record", () => {
    expect(buildQuickKeySet({}).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildQuickKeySetFromMetadata
// ---------------------------------------------------------------------------

describe("buildQuickKeySetFromMetadata", () => {
  test("formats quickKeys as name|size|lastModified", () => {
    const result = buildQuickKeySetFromMetadata([
      { name: "doc.pdf", size: 200, lastModified: 999 },
    ]);

    expect(result.has("doc.pdf|200|999")).toBe(true);
    expect(result.size).toBe(1);
  });

  test("builds one entry per metadata item", () => {
    const result = buildQuickKeySetFromMetadata([
      { name: "a.pdf", size: 1, lastModified: 1 },
      { name: "b.pdf", size: 2, lastModified: 2 },
    ]);

    expect(result.size).toBe(2);
    expect(result.has("a.pdf|1|1")).toBe(true);
    expect(result.has("b.pdf|2|2")).toBe(true);
  });

  test("deduplicates metadata that produce identical keys", () => {
    const result = buildQuickKeySetFromMetadata([
      { name: "same.pdf", size: 5, lastModified: 5 },
      { name: "same.pdf", size: 5, lastModified: 5 },
    ]);

    expect(result.size).toBe(1);
  });

  test("produces a key that matches createQuickKey's format for the same file", () => {
    const file = makeFile("match.pdf", 7);
    const result = buildQuickKeySetFromMetadata([
      { name: file.name, size: file.size, lastModified: file.lastModified },
    ]);

    // createStirlingFile embeds a quickKey using the same name|size|lastModified format.
    const stirling = createStirlingFile(file, asId("m1"));
    expect(result.has(stirling.quickKey)).toBe(true);
  });

  test("returns an empty Set for empty metadata", () => {
    expect(buildQuickKeySetFromMetadata([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getPrimaryFile
// ---------------------------------------------------------------------------

describe("getPrimaryFile", () => {
  test("returns an empty object when there are no files", () => {
    const state = makeState({ ids: [] });
    const files = new Map<FileId, File>();

    expect(getPrimaryFile(ref(state), ref(files))).toEqual({});
  });

  test("returns the first file and its stub record", () => {
    const file = makeFile("first.pdf");
    const stub = makeStub("id1");
    const state = makeState({
      ids: [asId("id1"), asId("id2")],
      byId: { id1: stub, id2: makeStub("id2") },
    });
    const files = new Map<FileId, File>([[asId("id1"), file]]);

    const result = getPrimaryFile(ref(state), ref(files));

    expect(result.file).toBe(file);
    expect(result.record).toBe(stub);
  });

  test("returns undefined file when the id exists in state but not in the files map", () => {
    const stub = makeStub("id1");
    const state = makeState({ ids: [asId("id1")], byId: { id1: stub } });
    const files = new Map<FileId, File>(); // intentionally empty

    const result = getPrimaryFile(ref(state), ref(files));

    expect(result.file).toBeUndefined();
    expect(result.record).toBe(stub);
  });

  test("uses ids[0] even if a later id has a backing file", () => {
    const second = makeFile("second.pdf");
    const state = makeState({
      ids: [asId("missing"), asId("present")],
      byId: { present: makeStub("present") },
    });
    const files = new Map<FileId, File>([[asId("present"), second]]);

    const result = getPrimaryFile(ref(state), ref(files));

    // Primary is "missing" -> no backing file, and no stub recorded for it.
    expect(result.file).toBeUndefined();
    expect(result.record).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createFileSelectors
// ---------------------------------------------------------------------------

describe("createFileSelectors", () => {
  test("getFile returns a StirlingFile carrying the requested id", () => {
    const file = makeFile("a.pdf");
    const state = makeState();
    const files = new Map<FileId, File>([[asId("a"), file]]);
    const selectors = createFileSelectors(ref(state), ref(files));

    const result = selectors.getFile(asId("a")) as StirlingFile;
    expect(result).toBeDefined();
    expect(result.fileId).toBe("a");
    expect(result.name).toBe("a.pdf");
  });

  test("getFile returns undefined for an unknown id", () => {
    const state = makeState();
    const files = new Map<FileId, File>();
    const selectors = createFileSelectors(ref(state), ref(files));

    expect(selectors.getFile(asId("nope"))).toBeUndefined();
  });

  test("getFiles defaults to state.files.ids and drops ids without backing files", () => {
    const fa = makeFile("a.pdf");
    const fc = makeFile("c.pdf");
    const state = makeState({ ids: [asId("a"), asId("b"), asId("c")] });
    const files = new Map<FileId, File>([
      [asId("a"), fa],
      [asId("c"), fc],
    ]);
    const selectors = createFileSelectors(ref(state), ref(files));

    const result = selectors.getFiles();
    expect(result.map((f) => f.fileId)).toEqual(["a", "c"]);
  });

  test("getFiles honors an explicit id list and preserves its order", () => {
    const fa = makeFile("a.pdf");
    const fb = makeFile("b.pdf");
    const state = makeState({ ids: [asId("a"), asId("b")] });
    const files = new Map<FileId, File>([
      [asId("a"), fa],
      [asId("b"), fb],
    ]);
    const selectors = createFileSelectors(ref(state), ref(files));

    const result = selectors.getFiles([asId("b"), asId("a")]);
    expect(result.map((f) => f.fileId)).toEqual(["b", "a"]);
  });

  test("getStirlingFileStub returns the matching record or undefined", () => {
    const stub = makeStub("a");
    const state = makeState({ byId: { a: stub } });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getStirlingFileStub(asId("a"))).toBe(stub);
    expect(selectors.getStirlingFileStub(asId("missing"))).toBeUndefined();
  });

  test("getStirlingFileStubs defaults to all ids and filters out absent records", () => {
    const a = makeStub("a");
    const c = makeStub("c");
    const state = makeState({
      ids: [asId("a"), asId("b"), asId("c")],
      byId: { a, c }, // "b" has no record
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getStirlingFileStubs()).toEqual([a, c]);
  });

  test("getStirlingFileStubs honors an explicit id list", () => {
    const a = makeStub("a");
    const b = makeStub("b");
    const state = makeState({ byId: { a, b } });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getStirlingFileStubs([asId("b")])).toEqual([b]);
  });

  test("getAllFileIds returns the live ids array from state", () => {
    const state = makeState({ ids: [asId("a"), asId("b")] });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getAllFileIds()).toEqual(["a", "b"]);
  });

  test("getSelectedFiles maps selectedFileIds to StirlingFiles, skipping missing ones", () => {
    const fa = makeFile("a.pdf");
    const state = makeState({ selectedFileIds: [asId("a"), asId("ghost")] });
    const files = new Map<FileId, File>([[asId("a"), fa]]);
    const selectors = createFileSelectors(ref(state), ref(files));

    const result = selectors.getSelectedFiles();
    expect(result.map((f) => f.fileId)).toEqual(["a"]);
  });

  test("getSelectedStirlingFileStubs maps selectedFileIds to stubs, skipping missing ones", () => {
    const a = makeStub("a");
    const state = makeState({
      selectedFileIds: [asId("a"), asId("ghost")],
      byId: { a },
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getSelectedStirlingFileStubs()).toEqual([a]);
  });

  test("getPinnedFileIds returns the pinned set as an array", () => {
    const state = makeState({
      pinnedFiles: new Set<FileId>([asId("a"), asId("b")]),
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getPinnedFileIds().sort()).toEqual(["a", "b"]);
  });

  test("getPinnedFiles maps the pinned set to StirlingFiles, skipping missing ones", () => {
    const fa = makeFile("a.pdf");
    const state = makeState({
      pinnedFiles: new Set<FileId>([asId("a"), asId("ghost")]),
    });
    const files = new Map<FileId, File>([[asId("a"), fa]]);
    const selectors = createFileSelectors(ref(state), ref(files));

    const result = selectors.getPinnedFiles();
    expect(result.map((f) => f.fileId)).toEqual(["a"]);
  });

  test("getPinnedStirlingFileStubs maps the pinned set to stubs, skipping missing ones", () => {
    const a = makeStub("a");
    const state = makeState({
      pinnedFiles: new Set<FileId>([asId("a"), asId("ghost")]),
      byId: { a },
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getPinnedStirlingFileStubs()).toEqual([a]);
  });

  test("isFilePinned reflects the pinned set membership by fileId", () => {
    const pinned = createStirlingFile(makeFile("a.pdf"), asId("a"));
    const notPinned = createStirlingFile(makeFile("b.pdf"), asId("b"));
    const state = makeState({ pinnedFiles: new Set<FileId>([asId("a")]) });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.isFilePinned(pinned)).toBe(true);
    expect(selectors.isFilePinned(notPinned)).toBe(false);
  });

  test("getFilesSignature joins id:size:lastModified per file with '|'", () => {
    const state = makeState({
      ids: [asId("a"), asId("b")],
      byId: {
        a: makeStub("a", { size: 11, lastModified: 22 }),
        b: makeStub("b", { size: 33, lastModified: 44 }),
      },
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getFilesSignature()).toBe("a:11:22|b:33:44");
  });

  test("getFilesSignature emits an empty segment when an id has no record", () => {
    const state = makeState({
      ids: [asId("a"), asId("missing")],
      byId: { a: makeStub("a", { size: 11, lastModified: 22 }) },
    });
    const selectors = createFileSelectors(
      ref(state),
      ref(new Map<FileId, File>()),
    );

    // Missing record contributes an empty string, joined with "|".
    expect(selectors.getFilesSignature()).toBe("a:11:22|");
  });

  test("getFilesSignature returns an empty string when there are no files", () => {
    const selectors = createFileSelectors(
      ref(makeState({ ids: [] })),
      ref(new Map<FileId, File>()),
    );

    expect(selectors.getFilesSignature()).toBe("");
  });

  test("selectors read live ref state, reflecting later mutations", () => {
    const state = makeState({ ids: [asId("a")] });
    const stateR = ref(state);
    const selectors = createFileSelectors(stateR, ref(new Map<FileId, File>()));

    expect(selectors.getAllFileIds()).toEqual(["a"]);

    // Mutate the ref's current value as the provider would on a state update.
    stateR.current = makeState({ ids: [asId("a"), asId("b")] });
    expect(selectors.getAllFileIds()).toEqual(["a", "b"]);
  });
});
