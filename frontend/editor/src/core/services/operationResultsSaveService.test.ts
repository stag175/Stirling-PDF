import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadFromUrl } from "@app/services/downloadService";
import {
  type OperationSaveContext,
  saveOperationResults,
} from "@app/services/operationResultsSaveService";

vi.mock("@app/services/downloadService", () => ({
  downloadFromUrl: vi.fn(),
}));

const mockDownload = vi.mocked(downloadFromUrl);

function makeContext(
  overrides: Partial<OperationSaveContext> = {},
): OperationSaveContext {
  return {
    downloadUrl: "http://host/file",
    downloadFilename: "out.pdf",
    downloadLocalPath: null,
    outputFileIds: null,
    getFile: () => undefined,
    getStub: () => undefined,
    markSaved: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveOperationResults", () => {
  it("returns null and skips the download when there is no downloadUrl", async () => {
    const result = await saveOperationResults(
      makeContext({ downloadUrl: null }),
    );
    expect(result).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("downloads with url + filename + undefined localPath and returns the result", async () => {
    mockDownload.mockResolvedValue({ savedPath: "/p" });
    const result = await saveOperationResults(
      makeContext({ downloadUrl: "u", downloadFilename: "f.pdf" }),
    );
    expect(mockDownload).toHaveBeenCalledWith("u", "f.pdf", undefined);
    expect(result).toEqual({ savedPath: "/p" });
  });

  it("falls back to the 'download' filename when none is provided", async () => {
    mockDownload.mockResolvedValue({});
    await saveOperationResults(makeContext({ downloadFilename: "" }));
    expect(mockDownload).toHaveBeenCalledWith(
      "http://host/file",
      "download",
      undefined,
    );
  });

  it("passes the local path through when present", async () => {
    mockDownload.mockResolvedValue({});
    await saveOperationResults(makeContext({ downloadLocalPath: "/dir/out.pdf" }));
    expect(mockDownload).toHaveBeenCalledWith(
      "http://host/file",
      "out.pdf",
      "/dir/out.pdf",
    );
  });

  it("marks every output file saved with the resolved savedPath", async () => {
    mockDownload.mockResolvedValue({ savedPath: "/saved/out.pdf" });
    const markSaved = vi.fn();
    await saveOperationResults(
      makeContext({ outputFileIds: ["a", "b"], markSaved }),
    );
    expect(markSaved).toHaveBeenCalledTimes(2);
    expect(markSaved).toHaveBeenCalledWith("a", "/saved/out.pdf");
    expect(markSaved).toHaveBeenCalledWith("b", "/saved/out.pdf");
  });

  it("does not mark saved when the download produced no savedPath", async () => {
    mockDownload.mockResolvedValue({}); // e.g. browser-download path with no local save
    const markSaved = vi.fn();
    await saveOperationResults(makeContext({ outputFileIds: ["a"], markSaved }));
    expect(markSaved).not.toHaveBeenCalled();
  });

  it("does not mark saved when there are no output file ids", async () => {
    mockDownload.mockResolvedValue({ savedPath: "/saved" });
    const markSaved = vi.fn();
    await saveOperationResults(makeContext({ outputFileIds: null, markSaved }));
    expect(markSaved).not.toHaveBeenCalled();
  });
});
