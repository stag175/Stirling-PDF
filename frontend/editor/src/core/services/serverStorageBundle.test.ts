import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fileStorage } from "@app/services/fileStorage";
import {
  buildHistoryBundle,
  buildSharePackage,
} from "@app/services/serverStorageBundle";
import type { FileId, ToolOperation } from "@app/types/file";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";

/**
 * Unit tests for serverStorageBundle (buildHistoryBundle / buildSharePackage).
 *
 * The ONLY external dependency is the IndexedDB-backed `fileStorage` singleton,
 * which we vi.mock so neither test touches a real database:
 *   - getHistoryChainStubs(rootId)  -> the version chain stubs for a root
 *   - getStirlingFile(id)           -> the File blob for a stub (or null)
 *
 * JSZip is NOT mocked: the builders produce a real zip blob via JSZip, so every
 * statement (zip.file(...) for each entry, manifest JSON serialization,
 * generateAsync, File construction) runs for real. The generated bundle's bytes
 * can't be re-read in this jsdom environment (Blob/File.arrayBuffer is polyfilled
 * to a fixed buffer and does not round-trip binary content), so output is
 * asserted against the `manifest` object returned alongside the bundle — that
 * object is exactly what gets serialized into the zip — plus the bundleFile's
 * name/type/size metadata.
 *
 * Determinism notes:
 *  - Date.now() is stubbed to a fixed value so createdAt / lastModified are
 *    predictable.
 *  - Every fake File overrides arrayBuffer() to resolve a known byte sequence,
 *    so the builders' `await file.arrayBuffer()` path is exercised with real
 *    bytes rather than throwing.
 */

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getHistoryChainStubs: vi.fn(),
    getStirlingFile: vi.fn(),
  },
}));

const mockedStorage = vi.mocked(fileStorage);

const FIXED_NOW = 1_700_000_000_000;

const asFileId = (id: string): FileId => id as unknown as FileId;

/** ASCII string -> Uint8Array, used to build deterministic file payloads. */
function ascii(str: string): Uint8Array {
  return new Uint8Array(Array.from(str, (c) => c.charCodeAt(0)));
}

/**
 * A real File whose arrayBuffer() resolves to the given text bytes. We override
 * arrayBuffer explicitly because the shared test setup polyfills it to a fixed
 * 8-byte buffer regardless of the File's actual content.
 */
function makeFile(content: string, name = "doc.pdf"): StirlingFile {
  const bytes = ascii(content);
  const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(() => Promise.resolve(bytes.buffer.slice(0))),
    configurable: true,
  });
  return file as unknown as StirlingFile;
}

/** Build a StirlingFileStub with sensible defaults that callers override. */
function makeStub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: asFileId("stub-0"),
    name: "doc.pdf",
    type: "application/pdf",
    size: 10,
    lastModified: 100,
    isLeaf: false,
    originalFileId: "stub-0",
    versionNumber: 1,
    ...overrides,
  } as StirlingFileStub;
}

/** Assert the returned bundle is a real, non-empty zip File with the given name. */
function expectZipFile(bundleFile: File, expectedName: string): void {
  expect(bundleFile).toBeInstanceOf(File);
  expect(bundleFile.name).toBe(expectedName);
  expect(bundleFile.type).toBe("application/zip");
  expect(bundleFile.lastModified).toBe(FIXED_NOW);
  // A real DEFLATE zip always has bytes (central directory + manifest entry).
  expect(bundleFile.size).toBeGreaterThan(0);
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("buildHistoryBundle", () => {
  test("builds a bundle for a single root id (non-array input) with a full manifest", async () => {
    const tool: ToolOperation = { toolId: "rotate" as never, timestamp: 5 };
    const stubV1 = makeStub({
      id: asFileId("root-a"),
      name: "report.pdf",
      versionNumber: 1,
      isLeaf: false,
    });
    const stubV2 = makeStub({
      id: asFileId("root-a-v2"),
      name: "report-rotated.pdf",
      versionNumber: 2,
      parentFileId: asFileId("root-a"),
      isLeaf: true,
      toolHistory: [tool],
      size: 42,
      lastModified: 999,
    });

    mockedStorage.getHistoryChainStubs.mockResolvedValue([stubV1, stubV2]);
    mockedStorage.getStirlingFile.mockImplementation(async (id: FileId) =>
      id === stubV1.id ? makeFile("V1BYTES") : makeFile("V2BYTESLONG"),
    );

    const { bundleFile, manifest } = await buildHistoryBundle(
      asFileId("root-a"),
    );

    // The chain is fetched exactly once for the single (deduped) root.
    expect(mockedStorage.getHistoryChainStubs).toHaveBeenCalledTimes(1);
    expect(mockedStorage.getHistoryChainStubs).toHaveBeenCalledWith(
      asFileId("root-a"),
    );
    // Each stub's file bytes are fetched.
    expect(mockedStorage.getStirlingFile).toHaveBeenCalledTimes(2);

    // Bundle file naming derives from the first stub's sanitized name.
    expectZipFile(bundleFile, "report.pdf-history.zip");

    // Manifest top-level fields.
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.rootLogicalId).toBe("root-a");
    expect(manifest.rootLogicalIds).toEqual(["root-a"]);
    expect(manifest.createdAt).toBe(FIXED_NOW);
    expect(manifest.entries).toHaveLength(2);

    // First entry mirrors the v1 stub; rootLogicalId is the chain root.
    const [e1, e2] = manifest.entries;
    expect(e1.logicalId).toBe("root-a");
    expect(e1.rootLogicalId).toBe("root-a");
    expect(e1.parentLogicalId).toBeUndefined();
    expect(e1.versionNumber).toBe(1);
    expect(e1.filePath).toBe("files/root-a/report.pdf");
    expect(e1.isLeaf).toBe(false);

    // Second entry carries parent + toolHistory + leaf flag.
    expect(e2.logicalId).toBe("root-a-v2");
    expect(e2.rootLogicalId).toBe("root-a");
    expect(e2.parentLogicalId).toBe("root-a");
    expect(e2.versionNumber).toBe(2);
    expect(e2.size).toBe(42);
    expect(e2.lastModified).toBe(999);
    expect(e2.toolHistory).toEqual([tool]);
    expect(e2.filePath).toBe("files/root-a-v2/report-rotated.pdf");
    expect(e2.isLeaf).toBe(true);
  });

  test("dedupes repeated root ids and concatenates multiple chains in order", async () => {
    const rootA = makeStub({ id: asFileId("A"), name: "alpha.pdf" });
    const rootB = makeStub({ id: asFileId("B"), name: "beta.pdf" });

    mockedStorage.getHistoryChainStubs.mockImplementation(async (id: FileId) =>
      id === rootA.id ? [rootA] : [rootB],
    );
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("X"));

    // "A" appears twice -> deduped to a single chain fetch for A.
    const { manifest } = await buildHistoryBundle([
      asFileId("A"),
      asFileId("B"),
      asFileId("A"),
    ]);

    expect(mockedStorage.getHistoryChainStubs).toHaveBeenCalledTimes(2);
    expect(manifest.rootLogicalIds).toEqual(["A", "B"]);
    expect(manifest.rootLogicalId).toBe("A");
    expect(manifest.entries.map((e) => e.rootLogicalId)).toEqual(["A", "B"]);
    expect(manifest.entries.map((e) => e.logicalId)).toEqual(["A", "B"]);
  });

  test("throws when a root's history chain is empty", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([]);

    await expect(buildHistoryBundle(asFileId("empty"))).rejects.toThrow(
      "No history chain found for file.",
    );
    // We never attempt to read file bytes once a chain is empty.
    expect(mockedStorage.getStirlingFile).not.toHaveBeenCalled();
  });

  test("throws (using stub name) when a stub's file data is missing", async () => {
    const stub = makeStub({ id: asFileId("R"), name: "missing.pdf" });
    mockedStorage.getHistoryChainStubs.mockResolvedValue([stub]);
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(buildHistoryBundle(asFileId("R"))).rejects.toThrow(
      "Missing file data for missing.pdf",
    );
  });

  test("falls back to the stub id in the error when the stub name is empty", async () => {
    const stub = makeStub({ id: asFileId("R2"), name: "" });
    mockedStorage.getHistoryChainStubs.mockResolvedValue([stub]);
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(buildHistoryBundle(asFileId("R2"))).rejects.toThrow(
      "Missing file data for R2",
    );
  });

  test("sanitizes illegal filename characters in the file path", async () => {
    const stub = makeStub({
      id: asFileId("S"),
      name: 'a/b\\c:d*e?f"g<h>i|j.pdf',
    });
    mockedStorage.getHistoryChainStubs.mockResolvedValue([stub]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("DATA"));

    const { manifest } = await buildHistoryBundle(asFileId("S"));

    expect(manifest.entries[0].filePath).toBe(
      "files/S/a_b_c_d_e_f_g_h_i_j.pdf",
    );
  });

  test("uses the 'file' fallback filename when a stub name is empty/whitespace", async () => {
    const stub = makeStub({ id: asFileId("W"), name: "   " });
    mockedStorage.getHistoryChainStubs.mockResolvedValue([stub]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("DATA"));

    const { bundleFile, manifest } = await buildHistoryBundle(asFileId("W"));

    // sanitizeFilename("   ") -> trimmed empty -> "file".
    expect(manifest.entries[0].filePath).toBe("files/W/file");
    // The bundle name also falls back: first stub name is whitespace -> "file".
    expectZipFile(bundleFile, "file-history.zip");
  });

  test("defaults versionNumber to 1 when the stub omits it", async () => {
    const stub = makeStub({ id: asFileId("V"), name: "v.pdf" });
    // Force versionNumber to 0 (falsy) to hit the `|| 1` fallback.
    (stub as { versionNumber: number }).versionNumber = 0;
    mockedStorage.getHistoryChainStubs.mockResolvedValue([stub]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("DATA"));

    const { manifest } = await buildHistoryBundle(asFileId("V"));
    expect(manifest.entries[0].versionNumber).toBe(1);
  });
});

describe("buildSharePackage", () => {
  test("throws when given an empty stub array", async () => {
    await expect(buildSharePackage([])).rejects.toThrow(
      "No files provided for sharing.",
    );
    expect(mockedStorage.getStirlingFile).not.toHaveBeenCalled();
  });

  test("builds a share bundle where every entry is its own leaf root", async () => {
    const tool: ToolOperation = { toolId: "merge" as never, timestamp: 7 };
    const stubs: StirlingFileStub[] = [
      makeStub({
        id: asFileId("share-1"),
        name: "one.pdf",
        versionNumber: 3,
        size: 11,
        lastModified: 321,
        toolHistory: [tool],
      }),
      makeStub({
        id: asFileId("share-2"),
        name: "two.pdf",
        versionNumber: 1,
        size: 22,
        lastModified: 654,
      }),
    ];
    mockedStorage.getStirlingFile.mockImplementation(async (id: FileId) =>
      id === stubs[0].id ? makeFile("ONE") : makeFile("TWOO"),
    );

    const { bundleFile, manifest } = await buildSharePackage(stubs);

    expectZipFile(bundleFile, "shared-files.zip");
    expect(mockedStorage.getStirlingFile).toHaveBeenCalledTimes(2);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.rootLogicalId).toBe("share-1");
    expect(manifest.rootLogicalIds).toEqual(["share-1", "share-2"]);
    expect(manifest.createdAt).toBe(FIXED_NOW);
    expect(manifest.entries).toHaveLength(2);

    const [e1, e2] = manifest.entries;
    // Each share entry is its own root and always a leaf.
    expect(e1.logicalId).toBe("share-1");
    expect(e1.rootLogicalId).toBe("share-1");
    expect(e1.isLeaf).toBe(true);
    expect(e1.versionNumber).toBe(3);
    expect(e1.size).toBe(11);
    expect(e1.lastModified).toBe(321);
    expect(e1.toolHistory).toEqual([tool]);
    expect(e1.filePath).toBe("files/share-1/one.pdf");
    // parentLogicalId is never set by buildSharePackage.
    expect(e1.parentLogicalId).toBeUndefined();

    expect(e2.logicalId).toBe("share-2");
    expect(e2.rootLogicalId).toBe("share-2");
    expect(e2.isLeaf).toBe(true);
    expect(e2.filePath).toBe("files/share-2/two.pdf");
  });

  test("throws (with stub name) when a shared stub has no file data", async () => {
    const stub = makeStub({ id: asFileId("gone"), name: "gone.pdf" });
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(buildSharePackage([stub])).rejects.toThrow(
      "Missing file data for gone.pdf",
    );
  });

  test("falls back to the stub id in the missing-data error when name is empty", async () => {
    const stub = makeStub({ id: asFileId("gone-2"), name: "" });
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(buildSharePackage([stub])).rejects.toThrow(
      "Missing file data for gone-2",
    );
  });

  test("sanitizes filenames and defaults a missing versionNumber to 1", async () => {
    const stub = makeStub({
      id: asFileId("S2"),
      name: "weird:name?.pdf",
    });
    (stub as { versionNumber: number }).versionNumber = 0;
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("Z"));

    const { manifest } = await buildSharePackage([stub]);

    expect(manifest.entries[0].filePath).toBe("files/S2/weird_name_.pdf");
    expect(manifest.entries[0].versionNumber).toBe(1);
  });
});
