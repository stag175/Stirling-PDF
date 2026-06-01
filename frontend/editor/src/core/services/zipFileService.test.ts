import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import JSZip from "jszip";

import { ZipFileService, zipFileService } from "@app/services/zipFileService";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import { fileStorage } from "@app/services/fileStorage";
import type { StirlingFileStub } from "@app/types/fileContext";

/**
 * Unit tests for ZipFileService.
 *
 * The service wraps a REAL in-memory JSZip instance plus two mockable side
 * effects: the thumbnail generator (`generateThumbnailForFile`) and the
 * IndexedDB-backed `fileStorage.storeStirlingFile`. Everything ZIP-related runs
 * against genuine JSZip so the validate / extract / progress / size-accounting
 * branches all execute for real.
 *
 * Determinism strategy:
 *  - `generateThumbnailForFile` and `fileStorage` are vi.mock'd so no PDFium /
 *    canvas / IndexedDB is touched; they resolve deterministic stand-ins.
 *  - ZIPs are built with a real JSZip and serialised to an ArrayBuffer, then
 *    wrapped in a File. JSZip.loadAsync reads File/Blob bytes through its own
 *    reader (NOT Blob.prototype.arrayBuffer), so round-tripping is exact and the
 *    `_data.uncompressedSize` field the service reads is populated genuinely.
 *  - The shared setupTests.ts polyfills Blob.prototype.arrayBuffer to a FIXED
 *    8-byte buffer ([1..8]) because jsdom's Blob lacks it. That buffer is NOT a
 *    "%PDF-" header, so the service's internal isValidPdfFile() returns false by
 *    default. To drive the "extracted file IS a valid PDF" branch we spy on
 *    Blob.prototype.slice to hand back a Blob whose arrayBuffer resolves a real
 *    "%PDF-" header; omitting that spy exercises the "not a valid PDF" branch.
 *  - File.size is overridden with Object.defineProperty for the size-limit
 *    branches so we never allocate hundreds of MB.
 *  - console.error is silenced where catch paths log, and asserted where useful.
 */

vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn(async () => "data:image/png;base64,THUMB"),
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    storeStirlingFile: vi.fn(async () => undefined),
  },
}));

const mockedThumbnail = vi.mocked(generateThumbnailForFile);
const mockedStore = vi.mocked(fileStorage.storeStirlingFile);

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** A small valid-looking PDF payload (real %PDF- header + a little body). */
function pdfBytes(extra = ""): Uint8Array {
  const body = `%PDF-1.7\n${extra}\n%%EOF`;
  return new Uint8Array(Array.from(body, (c) => c.charCodeAt(0)));
}

/** Build a real ZIP File from a map of entry name -> content. */
async function makeZipFile(
  entries: Record<string, Uint8Array | string>,
  options: {
    name?: string;
    type?: string;
    dirs?: string[];
  } = {},
): Promise<File> {
  const zip = new JSZip();
  for (const dir of options.dirs ?? []) {
    zip.folder(dir);
  }
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  const ab = await zip.generateAsync({ type: "arraybuffer" });
  return new File([ab], options.name ?? "archive.zip", {
    type: options.type ?? "application/zip",
  });
}

/** Build a real ZIP Blob (no File wrapper) for the Blob-input code paths. */
async function makeZipBlob(
  entries: Record<string, Uint8Array | string>,
): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "blob" });
}

/** Force File.size for the size-limit branches without allocating bytes. */
function setSize(file: File, size: number): File {
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/**
 * Make every Blob.slice(...).arrayBuffer() resolve a real "%PDF-" header so the
 * service's isValidPdfFile() check passes for extracted PDFs. Returns nothing;
 * restored by afterEach's vi.restoreAllMocks().
 */
function makeSliceReturnPdfHeader(): void {
  vi.spyOn(Blob.prototype, "slice").mockImplementation(function (
    this: Blob,
    start?: number,
    end?: number,
  ) {
    const headerBuf = new Uint8Array(PDF_HEADER).buffer;
    const slice = new Blob([new Uint8Array(headerBuf)]);
    const lo = start ?? 0;
    const hi = end ?? PDF_HEADER.length;
    const sub = new Uint8Array(PDF_HEADER.slice(lo, hi)).buffer;
    vi.spyOn(slice, "arrayBuffer").mockResolvedValue(sub);
    return slice;
  });
}

const MB = 1024 * 1024;

let service: ZipFileService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new ZipFileService();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ZipFileService.isZipFile", () => {
  test("true when MIME type is a recognised ZIP type", () => {
    const file = new File([], "thing.bin", { type: "application/zip" });
    expect(service.isZipFile(file)).toBe(true);
  });

  test("true when only the .zip extension matches (case-insensitive)", () => {
    const file = new File([], "ARCHIVE.ZIP", { type: "" });
    expect(service.isZipFile(file)).toBe(true);
  });

  test("true for the octet-stream fallback type", () => {
    const file = new File([], "noext", { type: "application/octet-stream" });
    expect(service.isZipFile(file)).toBe(true);
  });

  test("false when neither type nor extension qualify", () => {
    const file = new File([], "notes.txt", { type: "text/plain" });
    expect(service.isZipFile(file)).toBe(false);
  });
});

describe("ZipFileService.isZipFileStub", () => {
  function stub(over: Partial<StirlingFileStub>): StirlingFileStub {
    return {
      id: "id-1" as StirlingFileStub["id"],
      name: over.name ?? "file.bin",
      type: over.type ?? "",
      size: 0,
      lastModified: 0,
      isLeaf: true,
      originalFileId: "orig",
      versionNumber: 1,
      ...over,
    } as StirlingFileStub;
  }

  test("true when the stub type is a recognised ZIP type", () => {
    expect(service.isZipFileStub(stub({ type: "application/x-zip" }))).toBe(
      true,
    );
  });

  test("true when only the .zip extension matches", () => {
    expect(service.isZipFileStub(stub({ name: "bundle.zip", type: "" }))).toBe(
      true,
    );
  });

  test("false when the stub has no qualifying type or extension", () => {
    expect(service.isZipFileStub(stub({ name: "x.pdf", type: "" }))).toBe(
      false,
    );
  });
});

describe("ZipFileService.validateZipFile", () => {
  test("valid ZIP containing a PDF reports counts, size and containsPDFs", async () => {
    const file = await makeZipFile({
      "doc.pdf": pdfBytes("hello"),
      "readme.txt": "plain text content",
    });

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(result.containsPDFs).toBe(true);
    expect(result.containsFiles).toBe(true);
    expect(result.totalSizeBytes).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  test("directory entries are skipped from the file count", async () => {
    const file = await makeZipFile(
      { "folder/doc.pdf": pdfBytes() },
      { dirs: ["folder"] },
    );

    const result = await service.validateZipFile(file);

    // The explicit "folder/" directory entry must not be counted.
    expect(result.fileCount).toBe(1);
    expect(result.containsPDFs).toBe(true);
  });

  test("rejects a ZIP whose declared file size exceeds the 500MB total limit", async () => {
    const file = setSize(await makeZipFile({ "a.txt": "x" }), 600 * MB);

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(false);
    expect(result.fileCount).toBe(0); // bailed before parsing
    expect(result.errors[0]).toContain("ZIP file too large");
  });

  test("rejects a file that is not a ZIP archive by type/extension", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "image.png", {
      type: "image/png",
    });

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("File is not a valid ZIP archive");
  });

  test("an empty (file-less) ZIP is invalid and reports the no-files error", async () => {
    const file = await makeZipFile({});

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(false);
    expect(result.containsFiles).toBe(false);
    expect(result.errors).toContain("ZIP file does not contain any files");
  });

  test("a non-PDF-only ZIP is still valid but containsPDFs is false", async () => {
    const file = await makeZipFile({ "notes.txt": "some text" });

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(true);
    expect(result.containsPDFs).toBe(false);
    expect(result.containsFiles).toBe(true);
  });

  test("a malformed ZIP (valid extension, garbage bytes) hits the catch path", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3, 4])], "broken.zip", {
      type: "application/zip",
    });

    const result = await service.validateZipFile(file);

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain("Failed to validate ZIP file");
  });
});

describe("ZipFileService.createZipFromFiles", () => {
  test("packs the provided files into a ZIP File round-trippable by JSZip", async () => {
    const a = new File([new Uint8Array([10, 20, 30])], "a.bin");
    const b = new File([pdfBytes("b") as BlobPart], "b.pdf");

    const { zipFile, size } = await service.createZipFromFiles(
      [a, b],
      "out.zip",
    );

    expect(zipFile).toBeInstanceOf(File);
    expect(zipFile.name).toBe("out.zip");
    expect(zipFile.type).toBe("application/zip");
    expect(size).toBe(zipFile.size);
    expect(size).toBeGreaterThan(0);

    // Re-open the produced ZIP to prove both entries made it in.
    const reopened = await new JSZip().loadAsync(zipFile);
    expect(Object.keys(reopened.files).sort()).toEqual(["a.bin", "b.pdf"]);
  });

  test("wraps a failure from file.arrayBuffer() in a descriptive Error with a cause", async () => {
    const bad = new File([], "bad.bin");
    const boom = new Error("read blew up");
    vi.spyOn(bad, "arrayBuffer").mockRejectedValue(boom);

    await expect(service.createZipFromFiles([bad], "x.zip")).rejects.toThrow(
      /Failed to create ZIP file: read blew up/,
    );
  });
});

describe("ZipFileService.extractPdfFiles", () => {
  test("extracts valid PDFs, reports progress, and sanitises the filename", async () => {
    makeSliceReturnPdfHeader();
    const file = await makeZipFile({
      "sub dir/My Report*.pdf": pdfBytes("one"),
      "ignore.txt": "not a pdf",
    });
    const progress: number[] = [];

    const result = await service.extractPdfFiles(file, (p) => {
      progress.push(p.progress);
    });

    expect(result.success).toBe(true);
    expect(result.totalFiles).toBe(1);
    expect(result.extractedCount).toBe(1);
    expect(result.errors).toEqual([]);
    // sanitizeFilename strips the path and replaces unsafe chars/spaces.
    expect(result.extractedFiles[0].name).toBe("My_Report_.pdf");
    expect(result.extractedFiles[0].type).toBe("application/pdf");
    // Progress fired at least the start (0) and the final 100 report.
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(100);
  });

  test("a PDF that fails the header check is reported as not a valid PDF", async () => {
    // No slice spy => Blob.slice().arrayBuffer() yields the polyfilled [1..8],
    // which is not "%PDF-", so isValidPdfFile() returns false.
    const file = await makeZipFile({ "doc.pdf": pdfBytes() });

    const result = await service.extractPdfFiles(file);

    expect(result.success).toBe(false);
    expect(result.extractedCount).toBe(0);
    expect(result.errors).toContain('File "doc.pdf" is not a valid PDF');
  });

  test("returns validation errors when the ZIP itself is invalid", async () => {
    const empty = await makeZipFile({});

    const result = await service.extractPdfFiles(empty);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("ZIP file does not contain any files");
  });

  test("a ZIP without any PDF entries yields zero total files and no success", async () => {
    const file = await makeZipFile({ "a.txt": "x", "b.csv": "y" });

    const result = await service.extractPdfFiles(file);

    expect(result.totalFiles).toBe(0);
    expect(result.success).toBe(false);
    expect(result.extractedFiles).toEqual([]);
  });

  test("per-entry extraction failure is captured in errors without aborting", async () => {
    makeSliceReturnPdfHeader();
    const file = await makeZipFile({ "good.pdf": pdfBytes() });

    // Make JSZipObject.async reject for the single entry to hit the inner catch.
    const real = await new JSZip().loadAsync(file);
    const entry = real.files["good.pdf"];
    vi.spyOn(entry, "async").mockRejectedValue(new Error("decompress fail"));
    const loadSpy = vi
      .spyOn(JSZip.prototype, "loadAsync")
      .mockResolvedValue(real);

    const result = await service.extractPdfFiles(file);

    loadSpy.mockRestore();
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("decompress fail"))).toBe(true);
  });
});

describe("ZipFileService.containsHtmlFiles", () => {
  test("true when the ZIP contains an .html entry", async () => {
    const file = await makeZipFile({ "index.html": "<html></html>" });
    expect(await service.containsHtmlFiles(file)).toBe(true);
  });

  test("true for .htm and .xhtml variants", async () => {
    expect(
      await service.containsHtmlFiles(await makeZipFile({ "p.htm": "x" })),
    ).toBe(true);
    expect(
      await service.containsHtmlFiles(await makeZipFile({ "p.xhtml": "x" })),
    ).toBe(true);
  });

  test("false when no HTML entries are present", async () => {
    const file = await makeZipFile({ "doc.pdf": pdfBytes(), "a.txt": "x" });
    expect(await service.containsHtmlFiles(file)).toBe(false);
  });

  test("returns false and logs when the ZIP cannot be parsed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = new File([new Uint8Array([9, 9, 9])], "bad.zip");

    expect(await service.containsHtmlFiles(bad)).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("ZipFileService.shouldUnzip", () => {
  test("skipAutoUnzip forces extraction but still counts files", async () => {
    const file = await makeZipFile({ "a.pdf": pdfBytes(), "b.txt": "x" });

    const result = await service.shouldUnzip(file, false, 5, true);

    expect(result).toEqual({ shouldExtract: true, fileCount: 2 });
  });

  test("autoUnzip disabled short-circuits to no extraction and zero count", async () => {
    const file = await makeZipFile({ "a.pdf": pdfBytes() });

    const result = await service.shouldUnzip(file, false, 5, false);

    expect(result).toEqual({ shouldExtract: false, fileCount: 0 });
  });

  test("extracts when the file count is within the limit", async () => {
    const file = await makeZipFile({
      "a.pdf": pdfBytes(),
      "b.pdf": pdfBytes(),
    });

    const result = await service.shouldUnzip(file, true, 5);

    expect(result).toEqual({ shouldExtract: true, fileCount: 2 });
  });

  test("does not extract when the file count exceeds the limit", async () => {
    const file = await makeZipFile({
      "a.pdf": pdfBytes(),
      "b.pdf": pdfBytes(),
      "c.pdf": pdfBytes(),
    });

    const result = await service.shouldUnzip(file, true, 2);

    expect(result.shouldExtract).toBe(false);
    expect(result.fileCount).toBe(3);
  });

  test("directory entries are excluded from the count", async () => {
    const file = await makeZipFile(
      { "dir/a.pdf": pdfBytes() },
      { dirs: ["dir"] },
    );

    const result = await service.shouldUnzip(file, true, 5);

    expect(result.fileCount).toBe(1);
  });

  test("a parse failure defaults to the safe no-extract result and logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = new File([new Uint8Array([1, 1, 1])], "bad.zip");

    const result = await service.shouldUnzip(bad, true, 5);

    expect(result).toEqual({ shouldExtract: false, fileCount: 0 });
    expect(errorSpy).toHaveBeenCalledWith(
      "Error checking shouldUnzip:",
      expect.any(Error),
    );
  });
});

describe("ZipFileService.extractAllFiles", () => {
  test("extracts every non-directory entry with extension-derived MIME types", async () => {
    const file = await makeZipFile(
      {
        "image.png": new Uint8Array([1, 2, 3]),
        "data.json": '{"a":1}',
        "weird.unknownext": "x",
        "dir/nested.txt": "n",
      },
      { dirs: ["dir"] },
    );
    const progress: ZipFileServiceProgress[] = [];

    const result = await service.extractAllFiles(file, (p) => progress.push(p));

    expect(result.success).toBe(true);
    expect(result.extractedCount).toBe(4);
    expect(result.totalFiles).toBe(4);
    const byName = Object.fromEntries(
      result.extractedFiles.map((f) => [f.name, f.type]),
    );
    expect(byName["image.png"]).toBe("image/png");
    expect(byName["data.json"]).toBe("application/json");
    // Unknown extension falls back to octet-stream.
    expect(byName["weird.unknownext"]).toBe("application/octet-stream");
    // Final progress report is 100.
    expect(progress[progress.length - 1].progress).toBe(100);
  });

  test("a file with no extension also falls back to octet-stream", async () => {
    const file = await makeZipFile({ Makefile: "all:\n\techo hi" });

    const result = await service.extractAllFiles(file);

    expect(result.extractedFiles[0].type).toBe("application/octet-stream");
  });

  test("an unparseable ZIP populates the process-failure error", async () => {
    const bad = new File([new Uint8Array([7, 7, 7])], "bad.zip");

    const result = await service.extractAllFiles(bad);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Failed to process ZIP file");
  });

  test("per-entry async failure is recorded per file", async () => {
    const file = await makeZipFile({ "a.txt": "x" });
    const real = await new JSZip().loadAsync(file);
    vi.spyOn(real.files["a.txt"], "async").mockRejectedValue(
      new Error("blob fail"),
    );
    const loadSpy = vi
      .spyOn(JSZip.prototype, "loadAsync")
      .mockResolvedValue(real);

    const result = await service.extractAllFiles(file);

    loadSpy.mockRestore();
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("blob fail"))).toBe(true);
  });
});

describe("ZipFileService.extractWithPreferences", () => {
  test("keeps the ZIP intact (single zip File) when it contains HTML", async () => {
    const blob = await makeZipBlob({ "page.html": "<html></html>" });

    const out = await service.extractWithPreferences(blob, {
      autoUnzip: true,
      autoUnzipFileLimit: 50,
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(File);
    expect(out[0].type).toBe("application/zip");
    // A bare Blob input is wrapped into the default "result.zip" name.
    expect(out[0].name).toBe("result.zip");
  });

  test("returns the ZIP unchanged when shouldUnzip declines (auto-unzip off)", async () => {
    const blob = await makeZipBlob({ "a.pdf": pdfBytes() });

    const out = await service.extractWithPreferences(blob, {
      autoUnzip: false,
      autoUnzipFileLimit: 50,
    });

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("result.zip");
  });

  test("extracts and returns individual files when within limit", async () => {
    const file = await makeZipFile({
      "a.txt": "alpha",
      "b.json": '{"x":1}',
    });

    const out = await service.extractWithPreferences(file, {
      autoUnzip: true,
      autoUnzipFileLimit: 50,
    });

    expect(out.map((f) => f.name).sort()).toEqual(["a.txt", "b.json"]);
  });

  test("prompts for large extractions and keeps ZIP when the user cancels", async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < ZipFileService.ZIP_WARNING_THRESHOLD + 1; i++) {
      entries[`f${i}.txt`] = `content ${i}`;
    }
    const file = await makeZipFile(entries, { name: "big.zip" });
    const confirm = vi.fn(async () => false);

    const out = await service.extractWithPreferences(file, {
      autoUnzip: true,
      autoUnzipFileLimit: 1000,
      confirmLargeExtraction: confirm,
    });

    expect(confirm).toHaveBeenCalledWith(
      ZipFileService.ZIP_WARNING_THRESHOLD + 1,
      "big.zip",
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("big.zip");
  });

  test("proceeds with extraction when the user confirms a large ZIP", async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < ZipFileService.ZIP_WARNING_THRESHOLD + 1; i++) {
      entries[`f${i}.txt`] = `content ${i}`;
    }
    const file = await makeZipFile(entries);
    const confirm = vi.fn(async () => true);

    const out = await service.extractWithPreferences(file, {
      autoUnzip: true,
      autoUnzipFileLimit: 1000,
      confirmLargeExtraction: confirm,
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(ZipFileService.ZIP_WARNING_THRESHOLD + 1);
  });

  test("falls back to the ZIP when extraction yields nothing", async () => {
    // An empty ZIP passes the HTML and shouldUnzip checks (fileCount 0 <= limit)
    // but extractAllFiles returns success=false, so the original ZIP is kept.
    const file = await makeZipFile({}, { name: "empty.zip" });

    const out = await service.extractWithPreferences(file, {
      autoUnzip: true,
      autoUnzipFileLimit: 50,
    });

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("empty.zip");
  });

  test("on an unexpected error returns the ZIP as-is (Blob wrapped) and logs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // containsHtmlFiles and shouldUnzip both swallow their own errors, so the
    // method's outer catch is only reachable when an *unguarded* call throws.
    // The large-extraction confirm callback runs outside any inner try/catch:
    // a rejection from it propagates to extractWithPreferences' own catch.
    const entries: Record<string, string> = {};
    for (let i = 0; i < ZipFileService.ZIP_WARNING_THRESHOLD + 1; i++) {
      entries[`f${i}.txt`] = `content ${i}`;
    }
    const blob = await makeZipBlob(entries);

    const out = await service.extractWithPreferences(blob, {
      autoUnzip: true,
      autoUnzipFileLimit: 1000,
      confirmLargeExtraction: async () => {
        throw new Error("catastrophic");
      },
    });

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("result.zip");
    expect(errorSpy).toHaveBeenCalledWith(
      "Error in extractWithPreferences:",
      expect.any(Error),
    );
  });
});

describe("ZipFileService.extractAndStoreFilesWithHistory", () => {
  const zipStub: StirlingFileStub = {
    id: "zip-id" as StirlingFileStub["id"],
    name: "bundle.zip",
    type: "application/zip",
    size: 123,
    lastModified: 42,
    isLeaf: false,
    originalFileId: "root-original",
    parentFileId: "parent-id" as StirlingFileStub["parentFileId"],
    versionNumber: 3,
    toolHistory: [{ toolName: "merge" } as never],
  };

  test("extracts, thumbnails, stores each file, and preserves ZIP history metadata", async () => {
    const file = await makeZipFile({
      "report.pdf": pdfBytes("r"),
      "image.png": new Uint8Array([1, 2, 3]),
    });

    const result = await service.extractAndStoreFilesWithHistory(file, zipStub);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.extractedStubs).toHaveLength(2);
    expect(mockedThumbnail).toHaveBeenCalledTimes(2);
    expect(mockedStore).toHaveBeenCalledTimes(2);

    const stub = result.extractedStubs[0];
    // History fields are copied verbatim from the ZIP's stub.
    expect(stub.originalFileId).toBe("root-original");
    expect(stub.parentFileId).toBe("parent-id");
    expect(stub.versionNumber).toBe(3);
    expect(stub.toolHistory).toEqual(zipStub.toolHistory);
    expect(stub.thumbnailUrl).toBe("data:image/png;base64,THUMB");
    expect(stub.isLeaf).toBe(true);
  });

  test("does not extract and reports an error when the ZIP contains HTML", async () => {
    const file = await makeZipFile({ "page.html": "<html></html>" });

    const result = await service.extractAndStoreFilesWithHistory(file, zipStub);

    expect(result.success).toBe(false);
    expect(result.extractedStubs).toEqual([]);
    expect(result.errors[0]).toContain(
      "ZIP contains HTML files and will not be auto-extracted",
    );
    expect(mockedStore).not.toHaveBeenCalled();
  });

  test("surfaces extraction errors when there is nothing to extract", async () => {
    const empty = await makeZipFile({});

    const result = await service.extractAndStoreFilesWithHistory(
      empty,
      zipStub,
    );

    expect(result.success).toBe(false);
    expect(result.extractedStubs).toEqual([]);
  });

  test("records a per-file error when thumbnail generation throws but keeps going", async () => {
    const file = await makeZipFile({
      "ok.txt": "fine",
      "bad.txt": "boom",
    });
    mockedThumbnail
      .mockResolvedValueOnce("data:thumb-ok")
      .mockRejectedValueOnce(new Error("thumb fail"));

    const result = await service.extractAndStoreFilesWithHistory(file, zipStub);

    // One file succeeded, one failed -> overall success (>=1 stored) with an error.
    expect(result.success).toBe(true);
    expect(result.extractedStubs).toHaveLength(1);
    expect(result.errors.some((e) => e.includes("thumb fail"))).toBe(true);
  });

  test("a thrown failure while reading the ZIP hits the outer catch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = new File([new Uint8Array([3, 3, 3])], "bad.zip");
    // containsHtmlFiles swallows its own error (returns false), so to reach the
    // outer catch we make extractAllFiles' loadAsync throw. The first loadAsync
    // (HTML check) is inside its own try/catch; make ALL loadAsync calls throw.
    vi.spyOn(JSZip.prototype, "loadAsync").mockImplementation(() => {
      throw new Error("read explosion");
    });

    const result = await service.extractAndStoreFilesWithHistory(bad, zipStub);

    expect(result.success).toBe(false);
    // containsHtmlFiles caught the throw (false), then extractAllFiles caught it
    // too and returned errors, so we land on the "nothing to extract" branch.
    expect(result.extractedStubs).toEqual([]);
  });
});

describe("singleton export", () => {
  test("zipFileService is a ready-to-use ZipFileService instance", () => {
    expect(zipFileService).toBeInstanceOf(ZipFileService);
  });
});

// Local alias to keep the progress-callback typing explicit without importing
// the interface name (avoids an unused-import lint if the shape changes).
type ZipFileServiceProgress = {
  currentFile: string;
  extractedCount: number;
  totalFiles: number;
  progress: number;
};
