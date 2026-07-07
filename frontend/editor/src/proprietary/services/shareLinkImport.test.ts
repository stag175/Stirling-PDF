import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AxiosResponse } from "axios";

import apiClient from "@app/services/apiClient";
import { fileStorage } from "@app/services/fileStorage";
import {
  getShareBundleEntryRootId,
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
} from "@app/services/shareBundleUtils";
import type { ShareBundleManifest } from "@app/services/serverStorageBundle";
import type { FileId } from "@app/types/file";
import type { FileContextActions, StirlingFile } from "@app/types/fileContext";
import {
  downloadShareLink,
  fetchShareLinkMetadata,
  importShareLinkToWorkbench,
  type ShareLinkMetadata,
} from "@app/services/shareLinkImport";

// Auto-mock the axios instance: get/post become vi.fn() spies, matching the
// convention used by the sibling workflowService/userManagementService tests.
vi.mock("@app/services/apiClient");

// fileStorage hits IndexedDB; replace updateFileMetadata with a spy so the
// metadata-write loop runs deterministically without storage I/O.
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    updateFileMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

// shareBundleUtils owns zip parsing (JSZip) and content-disposition parsing.
// Mocking it lets us drive every branch of importShareLinkToWorkbench --
// zip-vs-plain, bundle-vs-null, per-entry root resolution -- without building
// real zip bytes, keeping the suite fully deterministic.
vi.mock("@app/services/shareBundleUtils", () => ({
  isZipBundle: vi.fn(),
  loadShareBundleEntries: vi.fn(),
  getShareBundleEntryRootId: vi.fn(),
  parseContentDispositionFilename: vi.fn(),
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedIsZipBundle = vi.mocked(isZipBundle);
const mockedLoadBundle = vi.mocked(loadShareBundleEntries);
const mockedGetRootId = vi.mocked(getShareBundleEntryRootId);
const mockedParseFilename = vi.mocked(parseContentDispositionFilename);
const mockedUpdateMetadata = vi.mocked(fileStorage.updateFileMetadata);

type ManifestEntry = ShareBundleManifest["entries"][number];

/** Build a minimal AxiosResponse wrapper around arbitrary data + headers. */
function axiosResponse<T>(
  data: T,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return { data, headers } as unknown as AxiosResponse<T>;
}

/** Cast a plain string into the branded FileId type for test fixtures. */
function fid(value: string): FileId {
  return value as unknown as FileId;
}

/** Build a StirlingFile-shaped object carrying just the fileId the SUT reads. */
function stirlingFile(id: string): StirlingFile {
  return { fileId: fid(id) } as unknown as StirlingFile;
}

/** Minimal manifest entry; only the fields the importer reads carry meaning. */
function makeEntry(overrides: Partial<ManifestEntry>): ManifestEntry {
  return {
    logicalId: overrides.logicalId ?? "logical-0",
    rootLogicalId: overrides.rootLogicalId ?? "root-0",
    parentLogicalId: overrides.parentLogicalId,
    versionNumber: overrides.versionNumber ?? 1,
    name: overrides.name ?? "file.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? 0,
    lastModified: overrides.lastModified ?? 0,
    toolHistory: overrides.toolHistory,
    filePath: overrides.filePath ?? "files/logical-0/file.pdf",
    isLeaf: overrides.isLeaf ?? true,
  };
}

function makeManifest(
  overrides: Partial<ShareBundleManifest>,
): ShareBundleManifest {
  return {
    schemaVersion: 1,
    rootLogicalId: overrides.rootLogicalId ?? "root-0",
    rootLogicalIds: overrides.rootLogicalIds ?? [],
    createdAt: overrides.createdAt ?? 0,
    entries: overrides.entries ?? [],
  };
}

/**
 * Build a FileContextActions stub whose addFilesWithOptions returns one
 * StirlingFile per input file (ids `sf-0`, `sf-1`, ...). updateStirlingFileStub
 * is a spy so we can assert the metadata updates the importer pushes.
 */
function makeActions(idPrefix = "sf"): {
  actions: FileContextActions;
  addFilesWithOptions: ReturnType<typeof vi.fn>;
  updateStirlingFileStub: ReturnType<typeof vi.fn>;
} {
  const addFilesWithOptions = vi.fn(async (files: File[]) =>
    files.map((_file, index) => stirlingFile(`${idPrefix}-${index}`)),
  );
  const updateStirlingFileStub = vi.fn();
  const actions = {
    addFilesWithOptions,
    updateStirlingFileStub,
  } as unknown as FileContextActions;
  return { actions, addFilesWithOptions, updateStirlingFileStub };
}

describe("shareLinkImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdateMetadata.mockResolvedValue(true);
  });

  describe("fetchShareLinkMetadata", () => {
    it("requests the metadata endpoint with auth/toast suppression and returns data", async () => {
      const metadata: ShareLinkMetadata = {
        shareToken: "tok-1",
        fileId: 42,
        fileName: "doc.pdf",
        owner: "alice",
        accessRole: "EDITOR",
      };
      mockedGet.mockResolvedValueOnce(axiosResponse(metadata));

      const result = await fetchShareLinkMetadata("tok-1");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/storage/share-links/tok-1/metadata",
        { suppressErrorToast: true, skipAuthRedirect: true },
      );
      expect(result).toEqual(metadata);
    });

    it("returns an empty object when the response has no data", async () => {
      mockedGet.mockResolvedValueOnce(axiosResponse(undefined));

      const result = await fetchShareLinkMetadata("tok-empty");

      expect(result).toEqual({});
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("metadata boom"));

      await expect(fetchShareLinkMetadata("tok-x")).rejects.toThrow(
        "metadata boom",
      );
    });
  });

  describe("downloadShareLink", () => {
    it("reads lowercase headers and parses the disposition filename", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="report.pdf"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("report.pdf");

      const result = await downloadShareLink("tok-dl");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/storage/share-links/tok-dl",
        {
          responseType: "blob",
          suppressErrorToast: true,
          skipAuthRedirect: true,
        },
      );
      expect(mockedParseFilename).toHaveBeenCalledWith(
        'attachment; filename="report.pdf"',
      );
      expect(result).toEqual({
        blob,
        filename: "report.pdf",
        contentType: "application/pdf",
      });
    });

    it("reads capitalized header variants when lowercase are absent", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="b.zip"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("b.zip");

      const result = await downloadShareLink("tok-caps");

      expect(result.contentType).toBe("application/zip");
      expect(result.filename).toBe("b.zip");
    });

    it("falls back to the default filename and blob.type when headers are missing", async () => {
      const blob = new Blob(["bytes"], { type: "application/octet-stream" });
      // No headers object at all -> exercises the `response.headers && ...` guard
      // falling through to "" for both content-type and disposition.
      mockedGet.mockResolvedValueOnce({
        data: blob,
      } as unknown as AxiosResponse);
      mockedParseFilename.mockReturnValueOnce(null);

      const result = await downloadShareLink("tok-bare");

      expect(mockedParseFilename).toHaveBeenCalledWith("");
      expect(result.filename).toBe("shared-file");
      // contentType "" || blob.type -> blob.type
      expect(result.contentType).toBe("application/octet-stream");
    });
  });

  describe("importShareLinkToWorkbench (plain file path)", () => {
    it("imports a single non-zip file and applies shared metadata to each id", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="single.pdf"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("single.pdf");
      mockedIsZipBundle.mockReturnValueOnce(false);

      const { actions, addFilesWithOptions, updateStirlingFileStub } =
        makeActions();
      const shareMetadata: ShareLinkMetadata = {
        shareToken: "meta-token",
        fileId: 99,
        owner: "bob",
        accessRole: "VIEWER",
      };

      const ids = await importShareLinkToWorkbench(
        "tok-plain",
        actions,
        shareMetadata,
      );

      expect(addFilesWithOptions).toHaveBeenCalledTimes(1);
      const [files, options] = addFilesWithOptions.mock.calls[0];
      expect(files).toHaveLength(1);
      expect((files[0] as File).name).toBe("single.pdf");
      expect(options).toEqual({
        selectFiles: true,
        autoUnzip: false,
        skipAutoUnzip: false,
      });

      expect(ids).toEqual([fid("sf-0")]);
      const expectedUpdates = {
        remoteStorageId: 99,
        remoteOwnerUsername: "bob",
        remoteOwnedByCurrentUser: false,
        remoteAccessRole: "VIEWER",
        remoteSharedViaLink: true,
        remoteHasShareLinks: false,
        remoteShareToken: "meta-token",
      };
      expect(updateStirlingFileStub).toHaveBeenCalledWith(
        fid("sf-0"),
        expectedUpdates,
      );
      expect(mockedUpdateMetadata).toHaveBeenCalledWith(
        fid("sf-0"),
        expectedUpdates,
      );
    });

    it("falls back to the token and undefined owner/role when metadata is null", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="x.pdf"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("x.pdf");
      mockedIsZipBundle.mockReturnValueOnce(false);

      const { actions, updateStirlingFileStub } = makeActions();

      const ids = await importShareLinkToWorkbench("tok-null", actions, null);

      expect(ids).toEqual([fid("sf-0")]);
      expect(updateStirlingFileStub).toHaveBeenCalledWith(fid("sf-0"), {
        remoteStorageId: undefined,
        remoteOwnerUsername: undefined,
        remoteOwnedByCurrentUser: false,
        remoteAccessRole: undefined,
        remoteSharedViaLink: true,
        remoteHasShareLinks: false,
        remoteShareToken: "tok-null",
      });
    });

    it("skips the metadata loop entirely when no files are added", async () => {
      const blob = new Blob([""], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="empty.pdf"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("empty.pdf");
      mockedIsZipBundle.mockReturnValueOnce(false);

      const { actions, addFilesWithOptions, updateStirlingFileStub } =
        makeActions();
      // Force addFilesWithOptions to return no StirlingFiles.
      addFilesWithOptions.mockResolvedValueOnce([]);

      const ids = await importShareLinkToWorkbench("tok-noadd", actions);

      expect(ids).toEqual([]);
      expect(updateStirlingFileStub).not.toHaveBeenCalled();
      expect(mockedUpdateMetadata).not.toHaveBeenCalled();
    });
  });

  describe("importShareLinkToWorkbench (zip bundle path)", () => {
    it("falls through to single-file import when isZipBundle is true but the bundle is null", async () => {
      const blob = new Blob(["zipbytes"], { type: "application/zip" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="b.zip"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("b.zip");
      mockedIsZipBundle.mockReturnValueOnce(true);
      mockedLoadBundle.mockResolvedValueOnce(null);

      const { actions, addFilesWithOptions } = makeActions();

      const ids = await importShareLinkToWorkbench("tok-nullbundle", actions);

      // Bundle null -> behaves like the plain-file path, wrapping the zip blob.
      expect(addFilesWithOptions).toHaveBeenCalledTimes(1);
      const [, options] = addFilesWithOptions.mock.calls[0];
      expect(options).toEqual({
        selectFiles: true,
        autoUnzip: false,
        skipAutoUnzip: false,
      });
      expect(ids).toEqual([fid("sf-0")]);
    });

    it("maps ids, resolves roots, updates every entry, and returns the latest id per root", async () => {
      const blob = new Blob(["zipbytes"], { type: "application/zip" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="bundle.zip"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("bundle.zip");
      mockedIsZipBundle.mockReturnValueOnce(true);

      // Realistic shapes: each root's logicalId IS its rootLogicalId (the root
      // entry is version 1). Two roots:
      //   root-a -> entry "root-a" (v1, isLeaf false) and "a2" (v2, child of root-a)
      //   root-b -> entry "b1" whose own rootLogicalId is empty, exercising the
      //             manifest-fallback inside getShareBundleEntryRootId.
      // rootOrder lists the two root logicalIds, so rootIdMap gets populated
      // (idMap has the "root-a" key) and the rootIdMap branch runs.
      const entryRootA = makeEntry({
        logicalId: "root-a",
        rootLogicalId: "root-a",
        versionNumber: 1,
        toolHistory: [],
        isLeaf: false,
      });
      const entryA2 = makeEntry({
        logicalId: "a2",
        rootLogicalId: "root-a",
        parentLogicalId: "root-a",
        versionNumber: 2,
        isLeaf: true,
      });
      const entryB1 = makeEntry({
        logicalId: "b1",
        rootLogicalId: "", // empty -> falls back to manifest.rootLogicalId "b1"
        versionNumber: 1,
        isLeaf: true,
      });
      const sortedEntries = [entryRootA, entryA2, entryB1];
      const manifest = makeManifest({
        rootLogicalId: "b1",
        rootLogicalIds: ["root-a", "b1"],
        entries: sortedEntries,
      });

      mockedLoadBundle.mockResolvedValueOnce({
        manifest,
        // rootOrder uses the root entries' logicalIds so they exist in idMap.
        rootOrder: ["root-a", "b1"],
        sortedEntries,
        files: [
          new File(["rootA"], "root-a.pdf"),
          new File(["a2"], "a2.pdf"),
          new File(["b1"], "b1.pdf"),
        ],
      });

      // getShareBundleEntryRootId: entry's own root if set, else manifest root.
      mockedGetRootId.mockImplementation(
        (mani, entry) => entry.rootLogicalId || mani.rootLogicalId,
      );

      const { actions, addFilesWithOptions, updateStirlingFileStub } =
        makeActions();
      const shareMetadata: ShareLinkMetadata = {
        shareToken: "share-tok",
        fileId: 7,
        owner: null, // null -> coalesced to undefined
        accessRole: null, // null -> coalesced to undefined
      };

      const ids = await importShareLinkToWorkbench(
        "tok-bundle",
        actions,
        shareMetadata,
      );

      // Bundle import uses allowDuplicates + no select.
      expect(addFilesWithOptions).toHaveBeenCalledWith(expect.any(Array), {
        selectFiles: false,
        autoUnzip: false,
        skipAutoUnzip: false,
        allowDuplicates: true,
      });

      // idMap: root-a->sf-0, a2->sf-1, b1->sf-2.
      // rootIdMap (built from rootOrder ["root-a","b1"] via idMap): root-a->sf-0, b1->sf-2.

      // One updateStirlingFileStub per sorted entry (3 entries).
      expect(updateStirlingFileStub).toHaveBeenCalledTimes(3);
      expect(mockedUpdateMetadata).toHaveBeenCalledTimes(3);

      // Entry root-a: v1, no parent, root id "root-a" -> rootIdMap sf-0.
      expect(updateStirlingFileStub).toHaveBeenNthCalledWith(1, fid("sf-0"), {
        versionNumber: 1,
        originalFileId: fid("sf-0"),
        parentFileId: undefined,
        toolHistory: [],
        isLeaf: false,
        remoteStorageId: 7,
        remoteOwnerUsername: undefined,
        remoteOwnedByCurrentUser: false,
        remoteAccessRole: undefined,
        remoteSharedViaLink: true,
        remoteHasShareLinks: false,
        remoteShareToken: "share-tok",
      });

      // Entry a2: parent "root-a" -> sf-0, root "root-a" -> rootIdMap sf-0.
      expect(updateStirlingFileStub).toHaveBeenNthCalledWith(
        2,
        fid("sf-1"),
        expect.objectContaining({
          versionNumber: 2,
          originalFileId: fid("sf-0"),
          parentFileId: fid("sf-0"),
          isLeaf: true,
        }),
      );

      // Entry b1: own root empty -> manifest root "b1" -> rootIdMap sf-2.
      expect(updateStirlingFileStub).toHaveBeenNthCalledWith(
        3,
        fid("sf-2"),
        expect.objectContaining({
          versionNumber: 1,
          originalFileId: fid("sf-2"),
          parentFileId: undefined,
        }),
      );

      // Selected ids: latest entry per root in rootOrder.
      // root-a latest = a2 -> sf-1; b1 latest = b1 -> sf-2.
      expect(ids).toEqual([fid("sf-1"), fid("sf-2")]);
    });

    it("falls back to manifest.rootLogicalId mapping when a root id is unmapped", async () => {
      const blob = new Blob(["zipbytes"], { type: "application/zip" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="bundle.zip"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("bundle.zip");
      mockedIsZipBundle.mockReturnValueOnce(true);

      // Single entry whose root id (root-a) is NOT present in rootOrder, so
      // rootIdMap never gets it. manifest.rootLogicalId ("root-a") maps via
      // idMap to the entry's own id, exercising the second `||` fallback.
      const entry = makeEntry({
        logicalId: "only",
        rootLogicalId: "root-a",
        versionNumber: 1,
      });
      const manifest = makeManifest({
        rootLogicalId: "only",
        rootLogicalIds: ["root-unmapped"],
        entries: [entry],
      });

      mockedLoadBundle.mockResolvedValueOnce({
        manifest,
        rootOrder: ["root-unmapped"],
        sortedEntries: [entry],
        files: [new File(["only"], "only.pdf")],
      });
      mockedGetRootId.mockImplementation(
        (mani, e) => e.rootLogicalId || mani.rootLogicalId,
      );

      const { actions, updateStirlingFileStub } = makeActions();

      const ids = await importShareLinkToWorkbench("tok-fallback", actions);

      // rootIdMap.get("root-a") is undefined; idMap.get(manifest.rootLogicalId
      // "only") -> sf-0. So originalFileId is sf-0.
      expect(updateStirlingFileStub).toHaveBeenCalledWith(
        fid("sf-0"),
        expect.objectContaining({ originalFileId: fid("sf-0") }),
      );
      // root-unmapped has no matching entries -> filtered list empty -> latest
      // undefined -> skipped, so selectedIds is empty.
      expect(ids).toEqual([]);
    });

    it("skips entries with no mapped id and roots whose latest entry is unmapped", async () => {
      const blob = new Blob(["zipbytes"], { type: "application/zip" });
      mockedGet.mockResolvedValueOnce(
        axiosResponse(blob, {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="bundle.zip"',
        }),
      );
      mockedParseFilename.mockReturnValueOnce("bundle.zip");
      mockedIsZipBundle.mockReturnValueOnce(true);

      const entryReal = makeEntry({
        logicalId: "real",
        rootLogicalId: "root-real",
        versionNumber: 1,
      });
      // A second entry whose logicalId has no matching addFiles output, because
      // addFilesWithOptions returns fewer StirlingFiles than sortedEntries.
      const entryGhost = makeEntry({
        logicalId: "ghost",
        rootLogicalId: "root-ghost",
        versionNumber: 1,
      });
      const sortedEntries = [entryReal, entryGhost];
      const manifest = makeManifest({
        rootLogicalId: "root-real",
        rootLogicalIds: ["root-real", "root-ghost"],
        entries: sortedEntries,
      });

      mockedLoadBundle.mockResolvedValueOnce({
        manifest,
        rootOrder: ["root-real", "root-ghost"],
        sortedEntries,
        // Only ONE file returned -> idMap maps sortedEntries[0]=real -> sf-0.
        // "ghost" never gets an id.
        files: [
          new File(["real"], "real.pdf"),
          new File(["ghost"], "ghost.pdf"),
        ],
      });
      mockedGetRootId.mockImplementation(
        (mani, e) => e.rootLogicalId || mani.rootLogicalId,
      );

      const { actions, addFilesWithOptions, updateStirlingFileStub } =
        makeActions();
      // Return a single StirlingFile so only the first entry maps to an id.
      addFilesWithOptions.mockResolvedValueOnce([stirlingFile("sf-0")]);

      const ids = await importShareLinkToWorkbench("tok-ghost", actions);

      // Only the real entry produced an update; ghost was skipped via `continue`.
      expect(updateStirlingFileStub).toHaveBeenCalledTimes(1);
      expect(updateStirlingFileStub).toHaveBeenCalledWith(
        fid("sf-0"),
        expect.objectContaining({ originalFileId: fid("sf-0") }),
      );
      // root-real -> sf-0 selected; root-ghost latest (ghost) has no id -> skipped.
      expect(ids).toEqual([fid("sf-0")]);
    });

    it("propagates download errors before any import work happens", async () => {
      mockedGet.mockRejectedValueOnce(new Error("download failed"));

      const { actions, addFilesWithOptions } = makeActions();

      await expect(
        importShareLinkToWorkbench("tok-err", actions),
      ).rejects.toThrow("download failed");
      expect(addFilesWithOptions).not.toHaveBeenCalled();
    });
  });
});
