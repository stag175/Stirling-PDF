/**
 * Unit tests for saveOperationResults (desktop layer).
 *
 * The desktop variant differs from the core one: when `outputFileIds` is
 * present it persists each in-memory File via downloadFile() (preferring the
 * stub's localFilePath) and short-circuits with `null`; otherwise it falls back
 * to streaming the result from `downloadUrl` via downloadFromUrl() and then
 * stamps every output id with the saved path.
 *
 * The only collaborators are downloadFile / downloadFromUrl from
 * "@app/services/downloadService" (which themselves wrap localFileSaveService /
 * fetch). Both are mocked with vi.mock so the suite is fully deterministic — no
 * network, no Tauri, no filesystem. The context's getFile / getStub / markSaved
 * are plain vi.fn()s, so every branch (file missing, stub missing, savedPath
 * present/absent, cancelled save) is exercised directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OperationSaveContext } from "@app/services/operationResultsSaveService";

// --- collaborator mocks -----------------------------------------------------

const downloadFile =
  vi.fn<
    (req: {
      data: unknown;
      filename: string;
      localPath?: string;
    }) => Promise<{ savedPath?: string; cancelled?: boolean }>
  >();
const downloadFromUrl =
  vi.fn<
    (
      url: string,
      filename: string,
      localPath?: string,
    ) => Promise<{ savedPath?: string; cancelled?: boolean }>
  >();

vi.mock("@app/services/downloadService", () => ({
  downloadFile: (req: {
    data: unknown;
    filename: string;
    localPath?: string;
  }) => downloadFile(req),
  downloadFromUrl: (url: string, filename: string, localPath?: string) =>
    downloadFromUrl(url, filename, localPath),
}));

import { saveOperationResults } from "@app/services/operationResultsSaveService";

// --- helpers ----------------------------------------------------------------

/**
 * Build an OperationSaveContext whose getFile/getStub/markSaved are spies.
 * `files` maps a fileId -> File|undefined and `stubs` maps a fileId -> stub.
 */
function makeContext(
  overrides: Partial<OperationSaveContext> = {},
  files: Record<string, File | undefined> = {},
  stubs: Record<string, { localFilePath?: string } | undefined> = {},
): OperationSaveContext {
  const getFile = vi.fn((id: string) => files[id]);
  const getStub = vi.fn((id: string) => stubs[id]);
  const markSaved = vi.fn();
  return {
    downloadUrl: "https://example.com/result.pdf",
    downloadFilename: "result.pdf",
    downloadLocalPath: null,
    outputFileIds: null,
    // The real signatures take a FileId branded string; plain strings are fine
    // at runtime and the module casts internally.
    getFile: getFile as unknown as OperationSaveContext["getFile"],
    getStub: getStub as unknown as OperationSaveContext["getStub"],
    markSaved: markSaved as unknown as OperationSaveContext["markSaved"],
    ...overrides,
  };
}

function fakeFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: "application/pdf",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  downloadFile.mockResolvedValue({ savedPath: "/saved/default.pdf" });
  downloadFromUrl.mockResolvedValue({ savedPath: "/saved/from-url.pdf" });
});

describe("saveOperationResults — early return", () => {
  it("returns null and touches nothing when downloadUrl is null", async () => {
    const ctx = makeContext({ downloadUrl: null });
    const result = await saveOperationResults(ctx);
    expect(result).toBeNull();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(downloadFromUrl).not.toHaveBeenCalled();
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });

  it("returns null when downloadUrl is an empty string (falsy)", async () => {
    const ctx = makeContext({ downloadUrl: "" });
    const result = await saveOperationResults(ctx);
    expect(result).toBeNull();
    expect(downloadFromUrl).not.toHaveBeenCalled();
  });
});

describe("saveOperationResults — outputFileIds loop (per-file save)", () => {
  it("saves each in-memory file and returns null, preferring the stub localFilePath", async () => {
    const files = { a: fakeFile("a.pdf"), b: fakeFile("b.pdf") };
    const stubs = {
      a: { localFilePath: "/disk/a.pdf" },
      b: { localFilePath: "/disk/b.pdf" },
    };
    downloadFile
      .mockResolvedValueOnce({ savedPath: "/disk/a.pdf" })
      .mockResolvedValueOnce({ savedPath: "/disk/b.pdf" });

    const ctx = makeContext({ outputFileIds: ["a", "b"] }, files, stubs);
    const result = await saveOperationResults(ctx);

    expect(result).toBeNull();
    // downloadFromUrl is never reached on the loop path.
    expect(downloadFromUrl).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile).toHaveBeenNthCalledWith(1, {
      data: files.a,
      filename: "a.pdf",
      localPath: "/disk/a.pdf",
    });
    expect(downloadFile).toHaveBeenNthCalledWith(2, {
      data: files.b,
      filename: "b.pdf",
      localPath: "/disk/b.pdf",
    });
    expect(ctx.markSaved).toHaveBeenCalledTimes(2);
    expect(ctx.markSaved).toHaveBeenNthCalledWith(1, "a", "/disk/a.pdf");
    expect(ctx.markSaved).toHaveBeenNthCalledWith(2, "b", "/disk/b.pdf");
  });

  it("passes localPath as undefined when the stub is missing", async () => {
    const files = { only: fakeFile("only.pdf") };
    // No stub registered for "only" => getStub returns undefined.
    const ctx = makeContext({ outputFileIds: ["only"] }, files, {});
    await saveOperationResults(ctx);

    expect(downloadFile).toHaveBeenCalledWith({
      data: files.only,
      filename: "only.pdf",
      localPath: undefined,
    });
  });

  it("skips (continue) a fileId whose file is missing, without calling downloadFile", async () => {
    // "present" resolves to a File; "ghost" resolves to undefined.
    const files = { present: fakeFile("present.pdf"), ghost: undefined };
    downloadFile.mockResolvedValue({ savedPath: "/disk/present.pdf" });

    const ctx = makeContext({ outputFileIds: ["ghost", "present"] }, files, {});
    const result = await saveOperationResults(ctx);

    expect(result).toBeNull();
    // Only the present file triggered a save.
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith({
      data: files.present,
      filename: "present.pdf",
      localPath: undefined,
    });
    expect(ctx.getFile).toHaveBeenCalledTimes(2);
    expect(ctx.markSaved).toHaveBeenCalledTimes(1);
    expect(ctx.markSaved).toHaveBeenCalledWith("present", "/disk/present.pdf");
  });

  it("does NOT call markSaved when the save was cancelled (no savedPath)", async () => {
    const files = { c: fakeFile("c.pdf") };
    downloadFile.mockResolvedValue({ cancelled: true });

    const ctx = makeContext({ outputFileIds: ["c"] }, files, {});
    const result = await saveOperationResults(ctx);

    expect(result).toBeNull();
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });

  it("propagates an error thrown by downloadFile within the loop", async () => {
    const files = { boom: fakeFile("boom.pdf") };
    downloadFile.mockRejectedValue(new Error("save failed"));

    const ctx = makeContext({ outputFileIds: ["boom"] }, files, {});
    await expect(saveOperationResults(ctx)).rejects.toThrow("save failed");
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });

  it("falls through to the URL path when outputFileIds is an empty array", async () => {
    // length === 0 fails the guard, so the URL fallback runs.
    downloadFromUrl.mockResolvedValue({ savedPath: "/saved/empty-ids.pdf" });
    const ctx = makeContext({ outputFileIds: [] });
    const result = await saveOperationResults(ctx);

    expect(downloadFile).not.toHaveBeenCalled();
    expect(downloadFromUrl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ savedPath: "/saved/empty-ids.pdf" });
  });
});

describe("saveOperationResults — downloadFromUrl fallback", () => {
  it("downloads from the URL and returns the result (no outputFileIds => no markSaved)", async () => {
    downloadFromUrl.mockResolvedValue({ savedPath: "/saved/out.pdf" });
    const ctx = makeContext({
      downloadUrl: "https://host/file.pdf",
      downloadFilename: "out.pdf",
      downloadLocalPath: "/target/out.pdf",
      outputFileIds: null,
    });
    const result = await saveOperationResults(ctx);

    expect(result).toEqual({ savedPath: "/saved/out.pdf" });
    expect(downloadFromUrl).toHaveBeenCalledWith(
      "https://host/file.pdf",
      "out.pdf",
      "/target/out.pdf",
    );
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });

  it("uses the 'download' filename fallback and undefined localPath when both are falsy", async () => {
    const ctx = makeContext({
      downloadUrl: "https://host/x",
      downloadFilename: "",
      downloadLocalPath: null,
      outputFileIds: null,
    });
    await saveOperationResults(ctx);

    expect(downloadFromUrl).toHaveBeenCalledWith(
      "https://host/x",
      "download",
      undefined,
    );
  });

  it("does NOT mark anything saved when the URL download has no savedPath", async () => {
    downloadFromUrl.mockResolvedValue({ cancelled: true });
    const ctx = makeContext({ outputFileIds: null });
    const result = await saveOperationResults(ctx);

    expect(result).toEqual({ cancelled: true });
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });

  it("propagates an error thrown by downloadFromUrl", async () => {
    downloadFromUrl.mockRejectedValue(new Error("Download failed (500)"));
    const ctx = makeContext({ outputFileIds: null });
    await expect(saveOperationResults(ctx)).rejects.toThrow(
      "Download failed (500)",
    );
  });
});

// The post-download markSaved loop only runs when outputFileIds is truthy AND a
// savedPath came back. Because a NON-empty outputFileIds takes the loop branch
// above, this branch is reached only via the empty-array case (truthy [] with a
// savedPath) where the for-of body simply never iterates.
describe("saveOperationResults — post-URL markSaved guard", () => {
  it("does not iterate markSaved for an empty (but truthy) outputFileIds array even with a savedPath", async () => {
    downloadFromUrl.mockResolvedValue({ savedPath: "/saved/none.pdf" });
    const ctx = makeContext({ outputFileIds: [] });
    const result = await saveOperationResults(ctx);

    expect(result).toEqual({ savedPath: "/saved/none.pdf" });
    // Truthy [] enters the guard, but the for-of has nothing to iterate.
    expect(ctx.markSaved).not.toHaveBeenCalled();
  });
});
