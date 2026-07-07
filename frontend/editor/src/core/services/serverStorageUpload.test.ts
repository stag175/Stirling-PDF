import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import {
  buildHistoryBundle,
  buildSharePackage,
} from "@app/services/serverStorageBundle";
import {
  uploadHistoryChain,
  uploadHistoryChains,
} from "@app/services/serverStorageUpload";
import type { FileId } from "@app/types/file";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";

/**
 * Unit tests for serverStorageUpload (uploadHistoryChain / uploadHistoryChains).
 *
 * Every external collaborator is mocked for full determinism:
 *   - apiClient      (axios instance; we never hit the network)
 *   - fileStorage    (IndexedDB-backed store; getHistoryChainStubs /
 *                     getStirlingFile)
 *   - serverStorageBundle (buildHistoryBundle / buildSharePackage; we never
 *                     build a real zip)
 *
 * The tests drive the history-chain resolution, leaf-stub selection, dedup
 * across multiple roots, the resolveUpdatedAt parsing branches (number /
 * string / missing / non-finite), and the create-vs-update (POST vs PUT)
 * branching plus the error paths.
 */

vi.mock("@app/services/apiClient", () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getHistoryChainStubs: vi.fn(),
    getStirlingFile: vi.fn(),
  },
}));

vi.mock("@app/services/serverStorageBundle", () => ({
  buildHistoryBundle: vi.fn(),
  buildSharePackage: vi.fn(),
}));

// apiClient.post/put are overloaded axios methods, so vi.mocked() doesn't surface
// the Mock helpers cleanly; re-type to the vi.fn mocks the factory actually installs.
const mockedApi = apiClient as unknown as {
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};
const mockedStorage = vi.mocked(fileStorage);
const mockedBuildHistoryBundle = vi.mocked(buildHistoryBundle);
const mockedBuildSharePackage = vi.mocked(buildSharePackage);

const asFileId = (id: string): FileId => id as unknown as FileId;

/** Build a minimal StirlingFileStub; only id/isLeaf matter to the module. */
function makeStub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: overrides.id ?? asFileId("stub-0"),
    name: overrides.name ?? "file.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? 1,
    lastModified: overrides.lastModified ?? 0,
    isLeaf: overrides.isLeaf ?? true,
    originalFileId: overrides.originalFileId ?? "root-0",
    versionNumber: overrides.versionNumber ?? 1,
    ...overrides,
  } as StirlingFileStub;
}

/** A real File so FormData.append and finalFile.name work without stubbing. */
function makeFile(name: string): StirlingFile {
  return new File(["bytes"], name, {
    type: "application/pdf",
  }) as unknown as StirlingFile;
}

/** Default happy-path wiring for buildHistoryBundle / buildSharePackage. */
function wireBundles(): void {
  mockedBuildHistoryBundle.mockResolvedValue({
    bundleFile: makeFile("history-bundle.zip"),
    manifest: {
      schemaVersion: 1,
      rootLogicalId: "root-0",
      rootLogicalIds: [],
      createdAt: 0,
      entries: [],
    },
  });
  mockedBuildSharePackage.mockResolvedValue({
    bundleFile: makeFile("share-bundle.zip"),
    manifest: {
      schemaVersion: 1,
      rootLogicalId: "root-0",
      rootLogicalIds: [],
      createdAt: 0,
      entries: [],
    },
  });
}

beforeEach(() => {
  wireBundles();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("uploadHistoryChain", () => {
  test("throws when the history chain is empty", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([]);

    await expect(uploadHistoryChain(asFileId("root-0"))).rejects.toThrow(
      "No history chain found.",
    );
    expect(mockedStorage.getStirlingFile).not.toHaveBeenCalled();
  });

  test("throws when the resolved final file is missing", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([
      makeStub({ id: asFileId("a") }),
    ]);
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(uploadHistoryChain(asFileId("root-0"))).rejects.toThrow(
      "Missing final file data for sharing.",
    );
  });

  test("creates (POST) a new file and parses a numeric updatedAt", async () => {
    const chain = [
      makeStub({ id: asFileId("a"), isLeaf: false }),
      makeStub({ id: asFileId("b"), isLeaf: true }),
    ];
    mockedStorage.getHistoryChainStubs.mockResolvedValue(chain);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({ data: { id: 42, updatedAt: 1234 } });

    const result = await uploadHistoryChain(asFileId("root-0"));

    expect(result).toEqual({ remoteId: 42, updatedAt: 1234, chain });
    // The leaf stub (last isLeaf !== false) drives the file fetch.
    expect(mockedStorage.getStirlingFile).toHaveBeenCalledWith(asFileId("b"));
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/api/v1/storage/files",
      expect.any(FormData),
    );
    expect(mockedApi.put).not.toHaveBeenCalled();
  });

  test("falls back to the last stub when no leaf exists (all isLeaf false)", async () => {
    const chain = [
      makeStub({ id: asFileId("a"), isLeaf: false }),
      makeStub({ id: asFileId("c"), isLeaf: false }),
    ];
    mockedStorage.getHistoryChainStubs.mockResolvedValue(chain);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({ data: { id: 7 } });

    const result = await uploadHistoryChain(asFileId("root-0"));

    // No isLeaf !== false found -> fallback to chain[chain.length - 1] = "c".
    expect(mockedStorage.getStirlingFile).toHaveBeenCalledWith(asFileId("c"));
    // Missing updatedAt -> resolveUpdatedAt returns Date.now() (a finite number).
    expect(result.remoteId).toBe(7);
    expect(Number.isFinite(result.updatedAt)).toBe(true);
  });

  test("updates (PUT) an existing remote file and parses a string updatedAt", async () => {
    const chain = [makeStub({ id: asFileId("a"), isLeaf: true })];
    mockedStorage.getHistoryChainStubs.mockResolvedValue(chain);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    const iso = "2024-01-02T03:04:05.000Z";
    mockedApi.put.mockResolvedValue({ data: { updatedAt: iso } });

    const result = await uploadHistoryChain(asFileId("root-0"), 99);

    expect(mockedApi.put).toHaveBeenCalledWith(
      "/api/v1/storage/files/99",
      expect.any(FormData),
    );
    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(result.remoteId).toBe(99);
    expect(result.updatedAt).toBe(new Date(iso).getTime());
    expect(result.chain).toBe(chain);
  });

  test("throws when the POST response has no stored file id", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([
      makeStub({ id: asFileId("a") }),
    ]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({ data: {} });

    await expect(uploadHistoryChain(asFileId("root-0"))).rejects.toThrow(
      "Missing stored file ID in response.",
    );
  });

  test("resolveUpdatedAt: non-finite numeric value falls back to now", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([
      makeStub({ id: asFileId("a") }),
    ]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({
      data: { id: 5, updatedAt: Number.POSITIVE_INFINITY },
    });

    const result = await uploadHistoryChain(asFileId("root-0"));

    expect(result.remoteId).toBe(5);
    expect(Number.isFinite(result.updatedAt)).toBe(true);
  });

  test("resolveUpdatedAt: unparseable string falls back to now", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([
      makeStub({ id: asFileId("a") }),
    ]);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({
      data: { id: 6, updatedAt: "not-a-date" },
    });

    const result = await uploadHistoryChain(asFileId("root-0"));

    expect(result.remoteId).toBe(6);
    expect(Number.isFinite(result.updatedAt)).toBe(true);
  });
});

describe("uploadHistoryChains", () => {
  test("throws when any root has an empty history chain", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([]);

    await expect(uploadHistoryChains([asFileId("root-0")])).rejects.toThrow(
      "No history chain found.",
    );
  });

  test("single leaf: uploads the raw final file and POSTs", async () => {
    const chain = [
      makeStub({ id: asFileId("a"), isLeaf: false }),
      makeStub({ id: asFileId("b"), isLeaf: true }),
    ];
    mockedStorage.getHistoryChainStubs.mockResolvedValue(chain);
    mockedStorage.getStirlingFile.mockResolvedValue(makeFile("final.pdf"));
    mockedApi.post.mockResolvedValue({ data: { id: 11, updatedAt: 500 } });

    const result = await uploadHistoryChains([asFileId("root-0")]);

    // One root -> one leaf stub -> raw file path (no buildSharePackage).
    expect(mockedBuildSharePackage).not.toHaveBeenCalled();
    expect(mockedStorage.getStirlingFile).toHaveBeenCalledWith(asFileId("b"));
    expect(result.remoteId).toBe(11);
    expect(result.updatedAt).toBe(500);
    // combinedChain is deduped in first-seen order.
    expect(result.chain.map((s) => s.id)).toEqual([
      asFileId("a"),
      asFileId("b"),
    ]);
  });

  test("single leaf: throws when the final file data is missing", async () => {
    mockedStorage.getHistoryChainStubs.mockResolvedValue([
      makeStub({ id: asFileId("a"), isLeaf: true }),
    ]);
    mockedStorage.getStirlingFile.mockResolvedValue(null);

    await expect(uploadHistoryChains([asFileId("root-0")])).rejects.toThrow(
      "Missing final file data for sharing.",
    );
  });

  test("multiple roots: dedups, builds a share package, and PUTs", async () => {
    const sharedStub = makeStub({ id: asFileId("shared"), isLeaf: false });
    const chainA = [sharedStub, makeStub({ id: asFileId("a-leaf") })];
    const chainB = [sharedStub, makeStub({ id: asFileId("b-leaf") })];
    mockedStorage.getHistoryChainStubs
      .mockResolvedValueOnce(chainA)
      .mockResolvedValueOnce(chainB);
    mockedApi.put.mockResolvedValue({ data: { updatedAt: 9000 } });

    const result = await uploadHistoryChains(
      // Duplicate root id is collapsed by the uniqueRoots Set.
      [asFileId("root-a"), asFileId("root-b"), asFileId("root-a")],
      77,
    );

    // Two leaf stubs -> share package path; raw getStirlingFile not used.
    expect(mockedBuildSharePackage).toHaveBeenCalledTimes(1);
    expect(mockedStorage.getStirlingFile).not.toHaveBeenCalled();
    // getHistoryChainStubs called once per unique root (2), not 3 times.
    expect(mockedStorage.getHistoryChainStubs).toHaveBeenCalledTimes(2);
    expect(mockedApi.put).toHaveBeenCalledWith(
      "/api/v1/storage/files/77",
      expect.any(FormData),
    );
    expect(result.remoteId).toBe(77);
    expect(result.updatedAt).toBe(9000);
    // "shared" appears once despite being in both chains (dedup by id).
    expect(result.chain.map((s) => s.id)).toEqual([
      asFileId("shared"),
      asFileId("a-leaf"),
      asFileId("b-leaf"),
    ]);
  });

  test("multiple roots create path throws when POST returns no id", async () => {
    mockedStorage.getHistoryChainStubs
      .mockResolvedValueOnce([makeStub({ id: asFileId("a-leaf") })])
      .mockResolvedValueOnce([makeStub({ id: asFileId("b-leaf") })]);
    mockedApi.post.mockResolvedValue({ data: {} });

    await expect(
      uploadHistoryChains([asFileId("root-a"), asFileId("root-b")]),
    ).rejects.toThrow("Missing stored file ID in response.");
    expect(mockedBuildSharePackage).toHaveBeenCalledTimes(1);
  });

  test("multiple roots: all-non-leaf chains fall back to last stub each", async () => {
    mockedStorage.getHistoryChainStubs
      .mockResolvedValueOnce([
        makeStub({ id: asFileId("a1"), isLeaf: false }),
        makeStub({ id: asFileId("a2"), isLeaf: false }),
      ])
      .mockResolvedValueOnce([makeStub({ id: asFileId("b1"), isLeaf: false })]);
    mockedApi.post.mockResolvedValue({ data: { id: 88, updatedAt: null } });

    const result = await uploadHistoryChains([
      asFileId("root-a"),
      asFileId("root-b"),
    ]);

    // Two leaf stubs (the fallback last stub of each chain) -> share package.
    expect(mockedBuildSharePackage).toHaveBeenCalledTimes(1);
    expect(result.remoteId).toBe(88);
    // null updatedAt -> now() fallback (finite).
    expect(Number.isFinite(result.updatedAt)).toBe(true);
  });
});
