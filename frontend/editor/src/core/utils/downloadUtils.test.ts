/**
 * Unit tests for downloadUtils.
 *
 * downloadUtils orchestrates downloads on top of three external services:
 *   - fileStorage.getStirlingFile  (IndexedDB-backed storage lookup)
 *   - zipFileService.createZipFromFiles (ZIP archive creation)
 *   - downloadFile (browser/Tauri download primitive)
 *
 * All three are mocked so the tests are deterministic and assert purely on
 * call arguments and control flow. No real IndexedDB, network, or DOM download
 * is exercised.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import {
  downloadBlob,
  downloadFileFromStorage,
  downloadMultipleFiles,
  downloadFilesAsZip,
  downloadFiles,
  downloadFileObject,
  downloadTextAsFile,
  downloadJsonAsFile,
} from "@app/utils/downloadUtils";

// --- Mocks for external services ------------------------------------------

const getStirlingFileMock = vi.fn();
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: (id: unknown) => getStirlingFileMock(id),
  },
}));

const createZipFromFilesMock = vi.fn();
vi.mock("@app/services/zipFileService", () => ({
  zipFileService: {
    createZipFromFiles: (files: unknown, name: unknown) =>
      createZipFromFilesMock(files, name),
  },
}));

const downloadFileMock = vi.fn();
vi.mock("@app/services/downloadService", () => ({
  downloadFile: (request: unknown) => downloadFileMock(request),
}));

// --- Test helpers -----------------------------------------------------------

/** Build a minimal StirlingFileStub; only id/name/localFilePath are read. */
function makeStub(
  overrides: Partial<Record<keyof StirlingFileStub, unknown>> = {},
): StirlingFileStub {
  return {
    id: "file-1",
    name: "doc.pdf",
    ...overrides,
  } as unknown as StirlingFileStub;
}

/**
 * Build a fake "StirlingFile" (a File-like object). The module treats whatever
 * getStirlingFile returns as a File, so a plain object with name/type is fine
 * for argument assertions.
 */
function makeStirlingFile(name: string): File {
  return { name, type: "application/pdf" } as unknown as File;
}

/**
 * Read a Blob's text content via FileReader. jsdom's Blob does not implement
 * the async .text() method, so this provides a deterministic equivalent.
 */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  getStirlingFileMock.mockReset();
  createZipFromFilesMock.mockReset();
  downloadFileMock.mockReset();
  // downloadFile returns a promise in production; default to a resolved value.
  downloadFileMock.mockResolvedValue({ savedPath: undefined });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("downloadBlob", () => {
  it("forwards the blob and filename to downloadFile", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    downloadBlob(blob, "greeting.txt");

    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    expect(downloadFileMock).toHaveBeenCalledWith({
      data: blob,
      filename: "greeting.txt",
    });
  });
});

describe("downloadFileFromStorage", () => {
  it("looks up by file id and downloads the stored file with its localPath", async () => {
    const stored = makeStirlingFile("stored.pdf");
    getStirlingFileMock.mockResolvedValue(stored);
    const stub = makeStub({
      id: "abc-123",
      name: "stub-name.pdf",
      localFilePath: "/tmp/out.pdf",
    } as Partial<StirlingFileStub>);

    await downloadFileFromStorage(stub);

    expect(getStirlingFileMock).toHaveBeenCalledTimes(1);
    expect(getStirlingFileMock).toHaveBeenCalledWith("abc-123");
    // filename comes from the stored file, not the stub.
    expect(downloadFileMock).toHaveBeenCalledWith({
      data: stored,
      filename: "stored.pdf",
      localPath: "/tmp/out.pdf",
    });
  });

  it("passes localPath as undefined when the stub has none", async () => {
    getStirlingFileMock.mockResolvedValue(makeStirlingFile("s.pdf"));

    await downloadFileFromStorage(makeStub());

    const request = downloadFileMock.mock.calls[0][0];
    expect(request.localPath).toBeUndefined();
  });

  it("throws a descriptive error and skips download when the file is missing", async () => {
    getStirlingFileMock.mockResolvedValue(null);
    const stub = makeStub({ name: "ghost.pdf" });

    await expect(downloadFileFromStorage(stub)).rejects.toThrow(
      'File "ghost.pdf" not found in storage',
    );
    expect(downloadFileMock).not.toHaveBeenCalled();
  });
});

describe("downloadMultipleFiles", () => {
  it("downloads each file individually, in order", async () => {
    getStirlingFileMock.mockImplementation(async (id: string) =>
      makeStirlingFile(`${id}.pdf`),
    );
    const files = [
      makeStub({ id: "a", name: "A" }),
      makeStub({ id: "b", name: "B" }),
      makeStub({ id: "c", name: "C" }),
    ];

    await downloadMultipleFiles(files);

    expect(getStirlingFileMock).toHaveBeenCalledTimes(3);
    expect(downloadFileMock).toHaveBeenCalledTimes(3);
    expect(getStirlingFileMock.mock.calls.map((c) => c[0])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is a no-op for an empty list", async () => {
    await downloadMultipleFiles([]);

    expect(getStirlingFileMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it("propagates the missing-file error from a member download", async () => {
    getStirlingFileMock
      .mockResolvedValueOnce(makeStirlingFile("ok.pdf"))
      .mockResolvedValueOnce(null);
    const files = [
      makeStub({ id: "a", name: "ok" }),
      makeStub({ id: "b", name: "broken" }),
    ];

    await expect(downloadMultipleFiles(files)).rejects.toThrow(
      'File "broken" not found in storage',
    );
    // first file downloaded before the second threw.
    expect(downloadFileMock).toHaveBeenCalledTimes(1);
  });
});

describe("downloadFilesAsZip", () => {
  it("throws when given no files and never touches storage", async () => {
    await expect(downloadFilesAsZip([])).rejects.toThrow(
      "No files provided for ZIP download",
    );
    expect(getStirlingFileMock).not.toHaveBeenCalled();
    expect(createZipFromFilesMock).not.toHaveBeenCalled();
  });

  it("zips only the files that resolve in storage and uses the provided filename", async () => {
    const f1 = makeStirlingFile("one.pdf");
    const f3 = makeStirlingFile("three.pdf");
    getStirlingFileMock
      .mockResolvedValueOnce(f1)
      .mockResolvedValueOnce(null) // missing file is skipped
      .mockResolvedValueOnce(f3);
    const zipFile = makeStirlingFile("custom.zip");
    createZipFromFilesMock.mockResolvedValue({ zipFile, size: 123 });

    const files = [
      makeStub({ id: "1" }),
      makeStub({ id: "2" }),
      makeStub({ id: "3" }),
    ];

    await downloadFilesAsZip(files, "custom.zip");

    expect(getStirlingFileMock).toHaveBeenCalledTimes(3);
    // only the two resolved files are passed to the zipper.
    expect(createZipFromFilesMock).toHaveBeenCalledWith([f1, f3], "custom.zip");
    expect(downloadFileMock).toHaveBeenCalledWith({
      data: zipFile,
      filename: "custom.zip",
    });
  });

  it("throws when none of the requested files exist in storage", async () => {
    getStirlingFileMock.mockResolvedValue(null);

    await expect(
      downloadFilesAsZip([makeStub({ id: "x" }), makeStub({ id: "y" })]),
    ).rejects.toThrow("No valid files found in storage for ZIP download");
    expect(createZipFromFilesMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it("generates a deterministic timestamped filename when none is provided", async () => {
    vi.useFakeTimers();
    // Fixed instant: 2026-06-01T13:45:30.000Z
    vi.setSystemTime(new Date("2026-06-01T13:45:30.000Z"));

    const stored = makeStirlingFile("a.pdf");
    getStirlingFileMock.mockResolvedValue(stored);
    const zipFile = makeStirlingFile("generated.zip");
    createZipFromFilesMock.mockResolvedValue({ zipFile, size: 1 });

    await downloadFilesAsZip([makeStub({ id: "1" })]);

    // toISOString -> "2026-06-01T13:45:30.000Z"; slice(0,19) -> "2026-06-01T13:45:30";
    // replace([:-]) -> "20260601T134530".
    const expectedName = "files-20260601T134530.zip";
    expect(createZipFromFilesMock).toHaveBeenCalledWith([stored], expectedName);
    expect(downloadFileMock).toHaveBeenCalledWith({
      data: zipFile,
      filename: expectedName,
    });
  });
});

describe("downloadFiles (smart dispatcher)", () => {
  it("throws on an empty list", async () => {
    await expect(downloadFiles([])).rejects.toThrow(
      "No files provided for download",
    );
  });

  it("downloads a single file directly (no ZIP)", async () => {
    getStirlingFileMock.mockResolvedValue(makeStirlingFile("solo.pdf"));

    await downloadFiles([makeStub({ id: "solo" })]);

    expect(createZipFromFilesMock).not.toHaveBeenCalled();
    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    expect(getStirlingFileMock).toHaveBeenCalledWith("solo");
  });

  it("forces ZIP for a single file when forceZip is set", async () => {
    getStirlingFileMock.mockResolvedValue(makeStirlingFile("solo.pdf"));
    const zipFile = makeStirlingFile("z.zip");
    createZipFromFilesMock.mockResolvedValue({ zipFile, size: 1 });

    await downloadFiles([makeStub({ id: "solo" })], {
      forceZip: true,
      zipFilename: "z.zip",
    });

    expect(createZipFromFilesMock).toHaveBeenCalledTimes(1);
    expect(createZipFromFilesMock.mock.calls[0][1]).toBe("z.zip");
  });

  it("downloads multiple files individually when multipleAsIndividual is set", async () => {
    getStirlingFileMock.mockImplementation(async (id: string) =>
      makeStirlingFile(`${id}.pdf`),
    );

    await downloadFiles([makeStub({ id: "a" }), makeStub({ id: "b" })], {
      multipleAsIndividual: true,
    });

    expect(createZipFromFilesMock).not.toHaveBeenCalled();
    expect(downloadFileMock).toHaveBeenCalledTimes(2);
  });

  it("defaults multiple files to a ZIP download", async () => {
    getStirlingFileMock.mockResolvedValue(makeStirlingFile("x.pdf"));
    const zipFile = makeStirlingFile("zz.zip");
    createZipFromFilesMock.mockResolvedValue({ zipFile, size: 1 });

    await downloadFiles([makeStub({ id: "a" }), makeStub({ id: "b" })], {
      zipFilename: "zz.zip",
    });

    expect(createZipFromFilesMock).toHaveBeenCalledTimes(1);
    expect(downloadFileMock).toHaveBeenCalledWith({
      data: zipFile,
      filename: "zz.zip",
    });
  });
});

describe("downloadFileObject", () => {
  it("uses the provided filename when given", () => {
    const file = makeStirlingFile("original.pdf");
    downloadFileObject(file, "renamed.pdf");

    expect(downloadFileMock).toHaveBeenCalledWith({
      data: file,
      filename: "renamed.pdf",
    });
  });

  it("falls back to the file's own name when no filename is provided", () => {
    const file = makeStirlingFile("original.pdf");
    downloadFileObject(file);

    expect(downloadFileMock).toHaveBeenCalledWith({
      data: file,
      filename: "original.pdf",
    });
  });
});

describe("downloadTextAsFile", () => {
  it("wraps content in a text/plain blob by default", async () => {
    downloadTextAsFile("line one", "note.txt");

    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    const request = downloadFileMock.mock.calls[0][0];
    expect(request.filename).toBe("note.txt");
    expect(request.data).toBeInstanceOf(Blob);
    expect(request.data.type).toBe("text/plain");
    await expect(readBlobText(request.data)).resolves.toBe("line one");
  });

  it("honors a custom mime type", () => {
    downloadTextAsFile("a,b,c", "data.csv", "text/csv");

    const request = downloadFileMock.mock.calls[0][0];
    expect(request.data.type).toBe("text/csv");
    expect(request.filename).toBe("data.csv");
  });
});

describe("downloadJsonAsFile", () => {
  it("serializes data as pretty JSON with an application/json blob", async () => {
    const data = { name: "test", nested: { count: 2 } };
    downloadJsonAsFile(data, "payload.json");

    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    const request = downloadFileMock.mock.calls[0][0];
    expect(request.filename).toBe("payload.json");
    expect(request.data).toBeInstanceOf(Blob);
    expect(request.data.type).toBe("application/json");
    await expect(readBlobText(request.data)).resolves.toBe(
      JSON.stringify(data, null, 2),
    );
  });
});
