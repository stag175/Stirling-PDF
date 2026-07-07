import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import { alert } from "@app/components/toast";
import {
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
} from "@app/services/shareBundleUtils";
import {
  reconcileServerFiles,
  materializeServerStubs,
} from "@app/services/fileSyncService";
import type {
  StirlingFileStub,
  StirlingFile,
  FileId,
} from "@app/types/fileContext";
import { parseFolderId } from "@app/types/folder";

/**
 * Unit tests for fileSyncService.
 *
 * Determinism strategy:
 * - apiClient (the axios instance) is auto-mocked so every verb is a vi.fn().
 *   This matches folderSyncService.test.ts. We drive .get with mockResolvedValue
 *   / mockRejectedValue (and per-call queues) so no real network I/O occurs.
 * - fileStorage is auto-mocked; updateFileMetadata is asserted directly.
 * - shareBundleUtils is fully mocked so the zip-bundle branch is deterministic
 *   without constructing real archives (covered by its own test).
 * - The toast `alert` is mocked so error/branch toasts are observed, not shown.
 * - vi.useFakeTimers + setSystemTime pins Date.now() so the createdAt/updatedAt
 *   "default to now" fallback branches produce stable values.
 * - console.warn is silenced so the warn branches run without noisy output.
 */

vi.mock("@app/services/apiClient");
vi.mock("@app/services/fileStorage");
vi.mock("@app/components/toast");
vi.mock("@app/services/shareBundleUtils");

const mockedGet = apiClient.get as unknown as Mock;
const mockedAlert = alert as unknown as Mock;
const mockedUpdateMeta = fileStorage.updateFileMetadata as unknown as Mock;
const mockedIsZipBundle = isZipBundle as unknown as Mock;
const mockedLoadBundle = loadShareBundleEntries as unknown as Mock;
const mockedParseDisposition =
  parseContentDispositionFilename as unknown as Mock;

const FIXED_NOW = 1_700_000_000_000;
const UUID = "11111111-1111-4111-8111-111111111111";

/** Minimal-but-valid local StirlingFileStub. */
function localStub(
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: "local-1" as FileId,
    name: "local.pdf",
    type: "application/pdf",
    size: 10,
    lastModified: 1000,
    createdAt: 1000,
    isLeaf: true,
    originalFileId: "local-1" as FileId,
    versionNumber: 1,
    toolHistory: [],
    ...overrides,
  } as StirlingFileStub;
}

const OK_OPTS = { storageEnabled: true, shareLinksEnabled: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Default share-bundle helpers to the non-zip / passthrough behavior.
  mockedIsZipBundle.mockReturnValue(false);
  mockedLoadBundle.mockResolvedValue(null);
  mockedParseDisposition.mockReturnValue(null);
  mockedUpdateMeta.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reconcileServerFiles", () => {
  it("short-circuits and returns local stubs when storage is disabled", async () => {
    const stubs = [localStub()];
    const result = await reconcileServerFiles(stubs, {
      storageEnabled: false,
      shareLinksEnabled: true,
    });
    expect(result).toBe(stubs);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("passes through a local-only stub with no remoteStorageId", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] }); // /storage/files
    mockedGet.mockResolvedValueOnce({ data: [] }); // /share-links/accessed

    const stub = localStub();
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    expect(out).toEqual(stub);
    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/storage/files",
      expect.objectContaining({ suppressErrorToast: true }),
    );
  });

  it("detaches remote metadata when the server no longer knows a non-shared file", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] }); // server has nothing
    mockedGet.mockResolvedValueOnce({ data: [] }); // share-links

    const stub = localStub({
      remoteStorageId: 99,
      remoteSharedViaLink: false,
      remoteOwnerUsername: "alice",
    });
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    expect(out.remoteStorageId).toBeUndefined();
    expect(out.remoteOwnerUsername).toBeUndefined();
    expect(out.remoteSharedViaLink).toBe(false);
  });

  it("demotes (does not detach) a shared-via-link file the server dropped", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const stub = localStub({
      remoteStorageId: 99,
      remoteSharedViaLink: true,
      remoteOwnedByCurrentUser: true,
    });
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    // Demoted: still remote, but no longer owned by current user.
    expect(out.remoteStorageId).toBe(99);
    expect(out.remoteOwnedByCurrentUser).toBe(false);
  });

  it("detaches a server file that is no longer a generic file (signing workflow)", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        { id: 5, fileName: "x.pdf", sizeBytes: 1, filePurpose: "signing" },
      ],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const stub = localStub({ remoteStorageId: 5 });
    const result = await reconcileServerFiles([stub], OK_OPTS);

    // The matched local stub is detached, and the non-generic server file is
    // NOT synthesized into a server stub.
    expect(result).toHaveLength(1);
    expect(result[0].remoteStorageId).toBeUndefined();
  });

  it("merges authoritative server metadata into a matching local stub", async () => {
    const updatedAt = "2023-06-07T08:09:10.000Z";
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 7,
          fileName: "doc.pdf",
          sizeBytes: 123,
          filePurpose: "generic",
          owner: "bob",
          ownedByCurrentUser: true,
          accessRole: "EDITOR",
          shareLinks: [{ token: "t1" }],
          sharedUsers: [{ username: "carol" }],
          updatedAt,
          folderId: UUID,
        },
      ],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const stub = localStub({ remoteStorageId: 7, remoteSharedViaLink: false });
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    expect(out.remoteOwnerUsername).toBe("bob");
    expect(out.remoteOwnedByCurrentUser).toBe(true);
    expect(out.remoteAccessRole).toBe("EDITOR");
    expect(out.remoteHasShareLinks).toBe(true);
    expect(out.remoteHasUserShares).toBe(true);
    expect(out.remoteStorageUpdatedAt).toBe(Date.parse(updatedAt));
    expect(out.folderId).toBe(parseFolderId(UUID));
  });

  it("falls back to stub metadata when server fields are null/missing", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 7,
          fileName: "doc.pdf",
          sizeBytes: 123,
          owner: null,
          ownedByCurrentUser: "not-a-bool",
          accessRole: null,
          createdAt: null,
          updatedAt: null,
          folderId: null,
        },
      ],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const stub = localStub({
      remoteStorageId: 7,
      remoteOwnerUsername: "kept-owner",
      remoteOwnedByCurrentUser: true,
      remoteAccessRole: "VIEWER",
      remoteStorageUpdatedAt: 555,
      remoteHasUserShares: undefined,
    });
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    // owner/accessRole keep prior values; ownedByCurrentUser keeps prior because
    // server value is not a boolean; updatedAt keeps prior (non-finite from null).
    expect(out.remoteOwnerUsername).toBe("kept-owner");
    expect(out.remoteOwnedByCurrentUser).toBe(true);
    expect(out.remoteAccessRole).toBe("VIEWER");
    expect(out.remoteStorageUpdatedAt).toBe(555);
    expect(out.remoteHasShareLinks).toBe(false);
    expect(out.remoteHasUserShares).toBe(false);
    expect(out.folderId).toBeNull();
  });

  it("uses createdAt when updatedAt is absent for matched stub", async () => {
    const createdAt = "2022-01-02T00:00:00.000Z";
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 8, fileName: "c.pdf", sizeBytes: 1, createdAt }],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const stub = localStub({ remoteStorageId: 8 });
    const [out] = await reconcileServerFiles([stub], OK_OPTS);

    expect(out.remoteStorageUpdatedAt).toBe(Date.parse(createdAt));
  });

  it("synthesizes server stubs for uncached generic server files", async () => {
    const updatedAt = "2023-06-07T08:09:10.000Z";
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 21,
          fileName: "remote-archive.pdf.zip",
          contentType: "application/pdf",
          sizeBytes: 42,
          owner: "dan",
          ownedByCurrentUser: true,
          accessRole: "OWNER",
          shareLinks: [{ token: "z" }],
          sharedWithUsers: ["eve"],
          updatedAt,
          folderId: UUID,
        },
      ],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const result = await reconcileServerFiles([], OK_OPTS);

    expect(result).toHaveLength(1);
    const stub = result[0];
    expect(stub.id).toBe("server-21");
    // normalizeServerFileName strips the inner-ext .zip wrapper.
    expect(stub.name).toBe("remote-archive.pdf");
    expect(stub.type).toBe("application/pdf");
    expect(stub.size).toBe(42);
    expect(stub.remoteStorageId).toBe(21);
    expect(stub.remoteOwnedByCurrentUser).toBe(true);
    expect(stub.remoteHasShareLinks).toBe(true);
    expect(stub.remoteHasUserShares).toBe(true);
    expect(stub.lastModified).toBe(Date.parse(updatedAt));
    expect(stub.folderId).toBe(parseFolderId(UUID));
  });

  it("server stub falls back to defaults for missing fields and Date.now()", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 22, fileName: "  ", sizeBytes: undefined }],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const [stub] = await reconcileServerFiles([], OK_OPTS);

    expect(stub.id).toBe("server-22");
    expect(stub.name).toBe("server-file"); // blank -> fallback name
    expect(stub.type).toBe("application/octet-stream");
    expect(stub.size).toBe(0);
    expect(stub.lastModified).toBe(FIXED_NOW);
    expect(stub.remoteOwnedByCurrentUser).toBeUndefined();
  });

  it("normalizes a -history.zip server filename", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 23, fileName: "report-history.zip", sizeBytes: 1 }],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const [stub] = await reconcileServerFiles([], OK_OPTS);
    expect(stub.name).toBe("report");
  });

  it("skips server files lacking a numeric id and non-generic ones, and dedupes cached ids", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        null,
        { id: "nope", fileName: "bad.pdf", sizeBytes: 1 },
        { id: 30, fileName: "cached.pdf", sizeBytes: 1 },
        {
          id: 31,
          fileName: "signing.pdf",
          sizeBytes: 1,
          filePurpose: "signing",
        },
        { id: 32, fileName: "new.pdf", sizeBytes: 1, filePurpose: "generic" },
      ],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    // id 30 is already cached locally -> not duplicated as a server stub.
    const cached = localStub({ id: "local-30" as FileId, remoteStorageId: 30 });
    const result = await reconcileServerFiles([cached], OK_OPTS);

    const ids = result.map((s) => s.id);
    expect(ids).toContain("local-30");
    expect(ids).toContain("server-32");
    expect(ids).not.toContain("server-30");
    expect(ids).not.toContain("server-31");
  });

  it("drops an invalid server folderId to null and warns", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 40, fileName: "f.pdf", sizeBytes: 1, folderId: "garbage" }],
    });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const [stub] = await reconcileServerFiles([], OK_OPTS);
    expect(stub.folderId).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      "[fileSyncService] dropping invalid server folderId",
      "garbage",
    );
  });

  it("treats a non-array files response as empty", async () => {
    mockedGet.mockResolvedValueOnce({ data: { not: "an array" } });
    mockedGet.mockResolvedValueOnce({ data: [] });

    const result = await reconcileServerFiles([localStub()], OK_OPTS);
    expect(result).toHaveLength(1);
  });

  it("shows a generic warning toast and returns local stubs on a non-401 fetch failure", async () => {
    mockedGet.mockRejectedValueOnce(new Error("network down"));

    const stubs = [localStub()];
    const result = await reconcileServerFiles(stubs, OK_OPTS);

    expect(result).toBe(stubs);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "warning",
        title: "Could not reach the cloud library",
      }),
    );
  });

  it("shows the sign-in toast on a 401 fetch failure", async () => {
    mockedGet.mockRejectedValueOnce({ response: { status: 401 } });

    await reconcileServerFiles([localStub()], OK_OPTS);

    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sign-in required to load cloud files",
      }),
    );
  });

  it("returns combined stubs without share-link handling when share links are disabled", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 50, fileName: "g.pdf", sizeBytes: 1 }],
    });

    const result = await reconcileServerFiles([], {
      storageEnabled: true,
      shareLinksEnabled: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-50");
    // Only the files endpoint was hit; the share-links endpoint was skipped.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("revokes locally-cached share links the server no longer allows and persists the change", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] }); // files
    mockedGet.mockResolvedValueOnce({
      data: [{ shareToken: "still-good", fileId: 1 }],
    });

    const revoked = localStub({
      id: "local-revoke" as FileId,
      remoteSharedViaLink: true,
      remoteShareToken: "gone-token",
      remoteStorageId: 5,
    });
    const result = await reconcileServerFiles([revoked], OK_OPTS);

    const out = result.find((s) => s.id === "local-revoke")!;
    expect(out.remoteSharedViaLink).toBe(false);
    expect(out.remoteShareToken).toBeUndefined();
    expect(out.remoteStorageId).toBeUndefined();
    expect(mockedUpdateMeta).toHaveBeenCalledWith(
      "local-revoke",
      expect.objectContaining({ remoteSharedViaLink: false }),
    );
  });

  it("keeps a still-allowed cached share link untouched", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({
      data: [{ shareToken: "keep-me" }],
    });

    const kept = localStub({
      id: "local-keep" as FileId,
      remoteSharedViaLink: true,
      remoteShareToken: "keep-me",
    });
    const result = await reconcileServerFiles([kept], OK_OPTS);

    const out = result.find((s) => s.id === "local-keep")!;
    expect(out.remoteShareToken).toBe("keep-me");
    expect(mockedUpdateMeta).not.toHaveBeenCalled();
  });

  it("synthesizes shared-{token} stubs for accessed links not already present", async () => {
    const lastAccessedAt = "2024-03-03T10:00:00.000Z";
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({
      data: [
        { shareToken: null }, // dropped from `allowed` set and skipped in loop
        {
          shareToken: "tok-1",
          fileId: 70,
          fileName: "shared.pdf",
          owner: "frank",
          lastAccessedAt,
        },
      ],
    });

    const result = await reconcileServerFiles([], OK_OPTS);

    const shared = result.find((s) => s.id === "shared-tok-1")!;
    expect(shared).toBeDefined();
    expect(shared.name).toBe("shared.pdf");
    expect(shared.remoteShareToken).toBe("tok-1");
    expect(shared.remoteStorageId).toBe(70);
    expect(shared.remoteSharedViaLink).toBe(true);
    expect(shared.remoteOwnerUsername).toBe("frank");
    expect(shared.lastModified).toBe(Date.parse(lastAccessedAt));
  });

  it("does not duplicate a shared link that already has a stub with that token", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({
      data: [{ shareToken: "dup-tok", fileName: "x.pdf" }],
    });

    const existing = localStub({
      id: "local-existing" as FileId,
      remoteShareToken: "dup-tok",
      remoteSharedViaLink: true,
    });
    const result = await reconcileServerFiles([existing], OK_OPTS);

    expect(result.filter((s) => s.remoteShareToken === "dup-tok")).toHaveLength(
      1,
    );
    expect(result.some((s) => s.id === "shared-dup-tok")).toBe(false);
  });

  it("falls back to createdAt then Date.now for shared-stub lastModified and uses fallback name", async () => {
    const createdAt = "2024-04-04T12:00:00.000Z";
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({
      data: [
        { shareToken: "with-created", createdAt }, // no name, no lastAccessedAt
        { shareToken: "no-dates" }, // neither -> Date.now()
      ],
    });

    const result = await reconcileServerFiles([], OK_OPTS);

    const withCreated = result.find((s) => s.id === "shared-with-created")!;
    expect(withCreated.lastModified).toBe(Date.parse(createdAt));
    expect(withCreated.name).toBe("shared-file"); // default name fallback

    const noDates = result.find((s) => s.id === "shared-no-dates")!;
    expect(noDates.lastModified).toBe(FIXED_NOW);
  });

  it("treats a non-array share-links response as empty", async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    mockedGet.mockResolvedValueOnce({ data: null });

    const result = await reconcileServerFiles([], OK_OPTS);
    expect(result).toEqual([]);
  });

  it("swallows a share-links fetch error and still returns combined stubs", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ id: 80, fileName: "f.pdf", sizeBytes: 1 }],
    });
    mockedGet.mockRejectedValueOnce(new Error("share-links boom"));

    const result = await reconcileServerFiles([], OK_OPTS);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-80");
    expect(console.warn).toHaveBeenCalledWith(
      "[fileSyncService] failed to pull share-links",
      expect.any(Error),
    );
  });
});

describe("materializeServerStubs", () => {
  function makeHelpers(ingested: StirlingFile[]) {
    return {
      addFiles: vi.fn().mockResolvedValue(ingested),
      updateStub: vi.fn(),
    };
  }

  function ingestedFile(id: string): StirlingFile {
    const f = new File(["bytes"], "ingested.pdf", { type: "application/pdf" });
    Object.defineProperty(f, "fileId", { value: id });
    Object.defineProperty(f, "quickKey", { value: `${id}|5|0` });
    return f as StirlingFile;
  }

  it("passes through stubs that are neither server- nor shared-only", async () => {
    const stub = localStub();
    const helpers = makeHelpers([]);
    const out = await materializeServerStubs([stub], helpers);

    expect(out).toEqual([stub]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(helpers.addFiles).not.toHaveBeenCalled();
  });

  it("downloads, ingests, and rewrites a server stub (object-style headers)", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    mockedGet.mockResolvedValueOnce({
      data: blob,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="server-doc.pdf"',
      },
    });
    mockedParseDisposition.mockReturnValue("server-doc.pdf");

    const ingested = [ingestedFile("new-file-id")];
    const helpers = makeHelpers(ingested);
    const serverStub = localStub({
      id: "server-9" as FileId,
      name: "placeholder.pdf",
      remoteStorageId: 9,
      remoteStorageUpdatedAt: 123,
      remoteOwnerUsername: "gail",
    });

    const out = await materializeServerStubs([serverStub], helpers);

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/storage/files/9/download",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(helpers.addFiles).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ allowDuplicates: true }),
    );
    expect(helpers.updateStub).toHaveBeenCalledWith(
      "new-file-id",
      expect.objectContaining({
        remoteStorageId: 9,
        remoteSharedViaLink: false,
      }),
    );
    expect(mockedUpdateMeta).toHaveBeenCalledWith(
      "new-file-id",
      expect.objectContaining({ remoteStorageId: 9 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("new-file-id");
    expect(out[0].originalFileId).toBe("new-file-id");
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it("downloads a shared stub via the share-link endpoint and marks it shared", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    // Headers exposed via a Headers-like get() function.
    const headers = {
      get: (name: string) =>
        name === "content-type" ? "application/pdf" : null,
    };
    mockedGet.mockResolvedValueOnce({ data: blob, headers });

    const ingested = [ingestedFile("shared-new-id")];
    const helpers = makeHelpers(ingested);
    const sharedStub = localStub({
      id: "shared-abc" as FileId,
      name: "via-link.pdf",
      remoteShareToken: "abc",
    });

    const out = await materializeServerStubs([sharedStub], helpers);

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/storage/share-links/abc",
      expect.objectContaining({ responseType: "blob" }),
    );
    expect(helpers.updateStub).toHaveBeenCalledWith(
      "shared-new-id",
      expect.objectContaining({
        remoteSharedViaLink: true,
        remoteShareToken: "abc",
      }),
    );
    expect(out[0].id).toBe("shared-new-id");
  });

  it("expands a zip bundle into multiple files via loadShareBundleEntries", async () => {
    const blob = new Blob(["zip"], { type: "application/zip" });
    mockedGet.mockResolvedValueOnce({
      data: blob,
      headers: { "content-type": "application/zip" },
    });
    mockedIsZipBundle.mockReturnValue(true);
    const bundleFiles = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];
    mockedLoadBundle.mockResolvedValue({ files: bundleFiles, rootOrder: [] });

    const helpers = makeHelpers([ingestedFile("bundle-id")]);
    const serverStub = localStub({
      id: "server-12" as FileId,
      remoteStorageId: 12,
    });

    await materializeServerStubs([serverStub], helpers);

    // The files passed to addFiles came from the bundle, not a wrapped blob.
    expect(helpers.addFiles).toHaveBeenCalledWith(
      bundleFiles,
      expect.any(Object),
    );
  });

  it("wraps the blob directly when zip-bundle parsing returns null", async () => {
    const blob = new Blob(["zip"], { type: "application/zip" });
    mockedGet.mockResolvedValueOnce({
      data: blob,
      headers: {}, // no headers -> fall back to stub.name, blob.type
    });
    mockedIsZipBundle.mockReturnValue(true);
    mockedLoadBundle.mockResolvedValue(null); // parse failed/empty

    const helpers = makeHelpers([ingestedFile("wrap-id")]);
    const serverStub = localStub({
      id: "server-13" as FileId,
      name: "wrap-me.pdf",
      remoteStorageId: 13,
    });

    await materializeServerStubs([serverStub], helpers);

    const passedFiles = helpers.addFiles.mock.calls[0][0] as File[];
    expect(passedFiles).toHaveLength(1);
    expect(passedFiles[0].name).toBe("wrap-me.pdf");
  });

  it("skips a stub when addFiles returns nothing (ingested.length === 0)", async () => {
    mockedGet.mockResolvedValueOnce({
      data: new Blob(["x"]),
      headers: { "content-type": "application/pdf" },
    });

    const helpers = makeHelpers([]); // empty ingest
    const serverStub = localStub({
      id: "server-14" as FileId,
      remoteStorageId: 14,
    });

    const out = await materializeServerStubs([serverStub], helpers);

    expect(out).toEqual([]);
    expect(helpers.updateStub).not.toHaveBeenCalled();
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it("surfaces a single-file failure toast with an HTTP status", async () => {
    mockedGet.mockRejectedValueOnce({ response: { status: 404 } });

    const helpers = makeHelpers([]);
    const serverStub = localStub({
      id: "server-15" as FileId,
      name: "broken.pdf",
      remoteStorageId: 15,
    });

    const out = await materializeServerStubs([serverStub], helpers);

    expect(out).toEqual([]);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Some files couldn't be opened",
        body: 'Couldn\'t open "broken.pdf" (HTTP 404).',
      }),
    );
  });

  it("summarizes multiple failures into one toast", async () => {
    mockedGet.mockRejectedValueOnce(new Error("boom1"));
    mockedGet.mockRejectedValueOnce(new Error("boom2"));

    const helpers = makeHelpers([]);
    const stubs = [
      localStub({
        id: "server-16" as FileId,
        name: "one.pdf",
        remoteStorageId: 16,
      }),
      localStub({
        id: "server-17" as FileId,
        name: "two.pdf",
        remoteStorageId: 17,
      }),
    ];

    await materializeServerStubs(stubs, helpers);

    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Couldn\'t open 2 files including "one.pdf".',
      }),
    );
  });

  it("mixes passthrough, success, and failure across stubs in one call", async () => {
    // First stub: server success.
    mockedGet.mockResolvedValueOnce({
      data: new Blob(["ok"]),
      headers: { "content-type": "application/pdf" },
    });
    // Second stub: server failure.
    mockedGet.mockRejectedValueOnce(new Error("nope"));

    const helpers = makeHelpers([ingestedFile("mixed-id")]);
    const passthrough = localStub({ id: "local-x" as FileId });
    const ok = localStub({ id: "server-18" as FileId, remoteStorageId: 18 });
    const bad = localStub({
      id: "server-19" as FileId,
      name: "fail.pdf",
      remoteStorageId: 19,
    });

    const out = await materializeServerStubs([passthrough, ok, bad], helpers);

    const ids = out.map((s) => s.id);
    expect(ids).toContain("local-x");
    expect(ids).toContain("mixed-id");
    expect(ids).not.toContain("server-19");
    expect(mockedAlert).toHaveBeenCalledTimes(1);
  });
});
