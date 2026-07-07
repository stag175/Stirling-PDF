import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FileAnalyzer } from "@app/services/fileAnalyzer";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";

/**
 * Unit tests for FileAnalyzer.
 *
 * FileAnalyzer mixes pure math (determineStrategy / estimateProcessingTime /
 * calculateBatchSize) with two side-effectful probes that delegate to the
 * pdf.js worker singleton (quickPDFAnalysis / isPDFUserPasswordProtected) and
 * a byte-scanning helper (isValidPDF + the internal /Encrypt marker scan).
 *
 * Determinism strategy:
 *  - The ONLY external dependency is `pdfWorkerManager`, so we vi.mock it. Its
 *    createDocument is driven per-test to return a fake PDFDocumentProxy
 *    (numPages) or to reject with a chosen error, which exercises every branch
 *    of analyzeFile / quickPDFAnalysis / isPDFUserPasswordProtected.
 *  - The shared setupTests.ts polyfills File/Blob.prototype.arrayBuffer to a
 *    FIXED 8-byte buffer, so real File content never reaches the module. To
 *    drive the genuine byte-scanning paths (hasEncryptMarker + isValidPDF) we
 *    therefore stub each file's arrayBuffer()/slice() to resolve a buffer we
 *    construct, which keeps the scanning logic real and fully deterministic.
 *  - File.size is huge for some strategy branches; we override the size getter
 *    with Object.defineProperty so we never allocate large buffers.
 *  - console.error is silenced to keep the catch path quiet and assertable.
 */

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn(),
    destroyDocument: vi.fn(),
  },
}));

const mockedManager = vi.mocked(pdfWorkerManager);

const MB = 1024 * 1024;

/** ASCII -> bytes helper for constructing readable PDF-ish content. */
function ascii(str: string): Uint8Array {
  return new Uint8Array(Array.from(str, (c) => c.charCodeAt(0)));
}

/** A fresh ArrayBuffer holding exactly `bytes` (independent of the view). */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Build a File and wire its byte-reading methods to the supplied `bytes`.
 *
 * The shared test setup overrides File/Blob.prototype.arrayBuffer with a fixed
 * stub, so we explicitly stub THIS file's arrayBuffer() (used by
 * quickPDFAnalysis / isPDFUserPasswordProtected) and slice().arrayBuffer()
 * (used by isValidPDF's header read) to return our controlled buffer. `.size`
 * is overridable so size-threshold branches don't need large allocations.
 */
function makeFile(
  bytes: Uint8Array,
  options: { size?: number; name?: string; type?: string } = {},
): File {
  const file = new File([], options.name ?? "doc.pdf", {
    type: options.type ?? "application/pdf",
  });
  Object.defineProperty(file, "size", {
    value: options.size ?? bytes.length,
    configurable: true,
  });
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(bufferOf(bytes));
  // isValidPDF reads file.slice(0, 8) then .arrayBuffer(); return a Blob whose
  // bytes are the first 8 of our content.
  vi.spyOn(file, "slice").mockImplementation((start?: number, end?: number) => {
    const sliced = bytes.slice(start ?? 0, end ?? bytes.length);
    const blob = new Blob([]);
    vi.spyOn(blob, "arrayBuffer").mockResolvedValue(bufferOf(sliced));
    return blob;
  });
  return file;
}

/** A fake PDFDocumentProxy that satisfies the only field FileAnalyzer reads. */
function fakePdf(numPages: number) {
  return { numPages } as unknown as Awaited<
    ReturnType<typeof pdfWorkerManager.createDocument>
  >;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FileAnalyzer.analyzeFile (strategy + timing integration)", () => {
  test("small file with few pages -> immediate_full, time = pages * 200", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(5));
    const file = makeFile(ascii("%PDF-1.7 small"), { size: 1 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.fileSize).toBe(1 * MB);
    expect(analysis.estimatedPageCount).toBe(5);
    expect(analysis.isEncrypted).toBe(false);
    expect(analysis.isCorrupted).toBe(false);
    expect(analysis.recommendedStrategy).toBe("immediate_full");
    expect(analysis.estimatedProcessingTime).toBe(5 * 200);
    // The opened document must be destroyed in the finally block.
    expect(mockedManager.destroyDocument).toHaveBeenCalledTimes(1);
  });

  test("medium file / many pages -> priority_pages, capped at 10 priority pages", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(40));
    // 30MB <= MEDIUM(50MB) and 40 <= MANY(50) -> priority_pages.
    const file = makeFile(ascii("%PDF-1.7 medium"), { size: 30 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.recommendedStrategy).toBe("priority_pages");
    // min(40, 10) * 150
    expect(analysis.estimatedProcessingTime).toBe(10 * 150);
  });

  test("priority_pages with fewer than 10 pages uses the actual page count", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(15));
    // 12MB > SMALL(10MB) so not immediate_full even though pages > FEW; lands
    // in priority_pages (12MB <= MEDIUM, 15 <= MANY).
    const file = makeFile(ascii("%PDF-1.7"), { size: 12 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.recommendedStrategy).toBe("priority_pages");
    // min(15, 10) * 150 -> 10 priority pages.
    expect(analysis.estimatedProcessingTime).toBe(10 * 150);
  });

  test("large file / massive pages -> progressive_chunked, first chunk of 20", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(80));
    // 100MB <= LARGE(200MB) and 80 <= MASSIVE(100) -> progressive_chunked.
    const file = makeFile(ascii("%PDF-1.7 large"), { size: 100 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.recommendedStrategy).toBe("progressive_chunked");
    // min(80, 20) * 100
    expect(analysis.estimatedProcessingTime).toBe(20 * 100);
  });

  test("progressive_chunked with fewer than 20 pages uses the actual page count", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(12));
    // 60MB > MEDIUM(50MB) so not priority_pages; 60MB <= LARGE and 12 <= MASSIVE.
    const file = makeFile(ascii("%PDF-1.7"), { size: 60 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.recommendedStrategy).toBe("progressive_chunked");
    // min(12, 20) * 100 -> 12 pages.
    expect(analysis.estimatedProcessingTime).toBe(12 * 100);
  });

  test("very large file -> metadata_only with the flat 50ms estimate", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(500));
    // 300MB > LARGE(200MB) -> falls through every guard to metadata_only.
    const file = makeFile(ascii("%PDF-1.7 huge"), { size: 300 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.recommendedStrategy).toBe("metadata_only");
    expect(analysis.estimatedProcessingTime).toBe(50);
  });

  test("createDocument rejecting with a password error -> encrypted, not corrupted", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("The PDF requires a password to open"),
    );
    const file = makeFile(ascii("%PDF-1.7"), { size: 5 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.isEncrypted).toBe(true);
    expect(analysis.isCorrupted).toBe(false);
    // pageCount 0 -> determineStrategy short-circuits to metadata_only.
    expect(analysis.recommendedStrategy).toBe("metadata_only");
    expect(analysis.estimatedProcessingTime).toBe(50);
    // No document was opened, so nothing to destroy.
    expect(mockedManager.destroyDocument).not.toHaveBeenCalled();
  });

  test("createDocument rejecting with a non-encryption error -> corrupted", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("Invalid PDF structure"),
    );
    const file = makeFile(ascii("not a pdf at all"), { size: 2 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.isEncrypted).toBe(false);
    expect(analysis.isCorrupted).toBe(true);
    expect(analysis.recommendedStrategy).toBe("metadata_only");
  });

  test("createDocument rejecting with a non-Error value is treated as corrupted", async () => {
    // error instanceof Error is false -> errorMessage "" -> isEncrypted false.
    mockedManager.createDocument.mockRejectedValue("boom string");
    const file = makeFile(ascii("%PDF-1.7"), { size: 2 * MB });

    const analysis = await FileAnalyzer.analyzeFile(file);

    expect(analysis.isEncrypted).toBe(false);
    expect(analysis.isCorrupted).toBe(true);
  });

  test("a thrown failure inside analyzeFile (file.arrayBuffer rejects) hits the outer catch", async () => {
    const file = makeFile(ascii("%PDF-1.7"), { size: 2 * MB });
    // Force the try block to throw before quickPDFAnalysis can catch anything
    // of its own: arrayBuffer() rejects, but quickPDFAnalysis swallows that and
    // returns corrupted, so analyzeFile's own catch is reached only when the
    // *whole* call throws. Here we make analyzeFile's call chain throw by
    // throwing synchronously from arrayBuffer. quickPDFAnalysis catches it and
    // reports corrupted with pageCount 0.
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("read fail"));

    const analysis = await FileAnalyzer.analyzeFile(file);

    // quickPDFAnalysis caught the read failure: pageCount 0 -> metadata_only.
    expect(analysis.isCorrupted).toBe(true);
    expect(analysis.recommendedStrategy).toBe("metadata_only");
  });
});

describe("FileAnalyzer.quickPDFAnalysis", () => {
  test("returns the page count and clears encrypted/corrupted on success", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(7));
    const file = makeFile(ascii("%PDF-1.7"));

    const result = await FileAnalyzer.quickPDFAnalysis(file);

    expect(result).toEqual({
      pageCount: 7,
      isEncrypted: false,
      isCorrupted: false,
    });
    expect(mockedManager.destroyDocument).toHaveBeenCalledTimes(1);
  });

  test("maps an 'encrypted' error message to isEncrypted and not corrupted", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("File is encrypted"),
    );
    const file = makeFile(ascii("%PDF-1.7"));

    const result = await FileAnalyzer.quickPDFAnalysis(file);

    expect(result).toEqual({
      pageCount: 0,
      isEncrypted: true,
      isCorrupted: false,
    });
    expect(mockedManager.destroyDocument).not.toHaveBeenCalled();
  });
});

describe("FileAnalyzer.isPDFUserPasswordProtected", () => {
  test("returns false fast when the tail has no /Encrypt marker (no pdf.js parse)", async () => {
    const file = makeFile(ascii("%PDF-1.7\nplain content with no marker"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(false);
    // The cheap path must NOT touch the worker.
    expect(mockedManager.createDocument).not.toHaveBeenCalled();
  });

  test("marker present + pdf.js opens it -> owner-password-only, returns false", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(3));
    const file = makeFile(ascii("%PDF-1.7\n<< /Encrypt 1 0 R >>\ntrailer"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(false);
    expect(mockedManager.createDocument).toHaveBeenCalledTimes(1);
    // It opened, so it must be destroyed.
    expect(mockedManager.destroyDocument).toHaveBeenCalledTimes(1);
  });

  test("marker present + pdf.js throws a password error -> returns true", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("No password given"),
    );
    const file = makeFile(ascii("%PDF-1.7\n/Encrypt blob\ntrailer"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(true);
    expect(mockedManager.destroyDocument).not.toHaveBeenCalled();
  });

  test("marker present + pdf.js throws a non-encryption error -> returns false", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("corrupt xref table"),
    );
    const file = makeFile(ascii("%PDF-1.7\n/Encrypt\ntrailer"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(false);
  });

  test("marker present + pdf.js throws a non-Error value -> returns false", async () => {
    mockedManager.createDocument.mockRejectedValue({ notAn: "error" });
    const file = makeFile(ascii("%PDF-1.7\n/Encrypt\ntrailer"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(false);
  });

  test("scans only the last 8KB: a marker before the tail window is ignored", async () => {
    // /Encrypt at the very start, followed by >8KB of marker-free padding, so
    // the tail-only scan (offset = byteLength - 8KB) never sees it.
    const head = "/Encrypt at the front\n";
    const padding = "A".repeat(9 * 1024);
    const file = makeFile(ascii(head + padding));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(false);
    expect(mockedManager.createDocument).not.toHaveBeenCalled();
  });

  test("scans the whole file when it is smaller than the 8KB window", async () => {
    mockedManager.createDocument.mockRejectedValue(
      new Error("incorrect password"),
    );
    // Small file: offset clamps to 0 so the whole buffer is scanned and the
    // marker is found.
    const file = makeFile(ascii("/Encrypt"));

    const result = await FileAnalyzer.isPDFUserPasswordProtected(file);

    expect(result).toBe(true);
  });
});

describe("FileAnalyzer.analyzeMultipleFiles", () => {
  test("aggregates per-file analyses and flags worker + memory recommendations", async () => {
    // Two large files: each 120MB, 80 pages -> progressive_chunked, 20*100 time.
    mockedManager.createDocument.mockResolvedValue(fakePdf(80));
    const fileA = makeFile(ascii("%PDF-1.7 a"), { size: 120 * MB });
    const fileB = makeFile(ascii("%PDF-1.7 b"), { size: 120 * MB });

    const { analyses, recommendations } =
      await FileAnalyzer.analyzeMultipleFiles([fileA, fileB]);

    expect(analyses.size).toBe(2);
    expect(analyses.get(fileA)?.recommendedStrategy).toBe(
      "progressive_chunked",
    );
    expect(recommendations.totalEstimatedTime).toBe(2 * (20 * 100));
    // totalPages 160 > 100 and totalSize 240MB > MEDIUM -> use a web worker.
    expect(recommendations.shouldUseWebWorker).toBe(true);
    // totalSize 240MB > LARGE(200MB) -> memory warning.
    expect(recommendations.memoryWarning).toBe(true);
    // totalSize 240MB > LARGE -> batch size = floor(2 / 4) clamped to >= 1.
    expect(recommendations.suggestedBatchSize).toBe(1);
  });

  test("medium total size picks the half-batch branch", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(5));
    // 4 files of 20MB -> totalSize 80MB: > MEDIUM(50MB) but <= LARGE(200MB).
    const files = Array.from({ length: 4 }, (_, i) =>
      makeFile(ascii(`%PDF-1.7 ${i}`), { size: 20 * MB }),
    );

    const { recommendations } = await FileAnalyzer.analyzeMultipleFiles(files);

    // floor(4 / 2) = 2, max(2, 2).
    expect(recommendations.suggestedBatchSize).toBe(2);
    // totalPages 20 (<=100) but totalSize 80MB > MEDIUM -> still web worker.
    expect(recommendations.shouldUseWebWorker).toBe(true);
    // totalSize 80MB <= LARGE and totalPages 20 <= MASSIVE -> no warning.
    expect(recommendations.memoryWarning).toBe(false);
  });

  test("small total size processes everything in one batch and skips the worker", async () => {
    mockedManager.createDocument.mockResolvedValue(fakePdf(3));
    // 3 small files of 1MB each -> totalSize 3MB.
    const files = Array.from({ length: 3 }, (_, i) =>
      makeFile(ascii(`%PDF-1.7 ${i}`), { size: 1 * MB }),
    );

    const { recommendations } = await FileAnalyzer.analyzeMultipleFiles(files);

    expect(recommendations.suggestedBatchSize).toBe(3);
    expect(recommendations.shouldUseWebWorker).toBe(false);
    expect(recommendations.memoryWarning).toBe(false);
  });

  test("an empty file list yields zeroed totals and a zero batch size", async () => {
    const { analyses, recommendations } =
      await FileAnalyzer.analyzeMultipleFiles([]);

    expect(analyses.size).toBe(0);
    expect(recommendations.totalEstimatedTime).toBe(0);
    expect(recommendations.suggestedBatchSize).toBe(0);
    expect(recommendations.shouldUseWebWorker).toBe(false);
    expect(recommendations.memoryWarning).toBe(false);
  });
});

describe("FileAnalyzer.isValidPDF", () => {
  test("returns false for a non-pdf type and non-.pdf name without reading bytes", async () => {
    const file = makeFile(ascii("%PDF-1.7"), {
      name: "notes.txt",
      type: "text/plain",
    });

    expect(await FileAnalyzer.isValidPDF(file)).toBe(false);
  });

  test("accepts a real %PDF- header when the type is application/pdf", async () => {
    const file = makeFile(ascii("%PDF-1.7 rest of file"), {
      type: "application/pdf",
      name: "doc.pdf",
    });

    expect(await FileAnalyzer.isValidPDF(file)).toBe(true);
  });

  test("accepts a .pdf name even when the MIME type is wrong, but bytes must match", async () => {
    const file = makeFile(ascii("%PDF-1.4 something"), {
      type: "application/octet-stream",
      name: "report.PDF",
    });

    expect(await FileAnalyzer.isValidPDF(file)).toBe(true);
  });

  test("rejects a file that passes the name check but lacks the %PDF- header", async () => {
    const file = makeFile(ascii("GIF89a not a pdf"), {
      type: "application/pdf",
      name: "fake.pdf",
    });

    expect(await FileAnalyzer.isValidPDF(file)).toBe(false);
  });

  test("returns false when reading the header bytes throws", async () => {
    const file = makeFile(ascii("%PDF-1.7"), {
      type: "application/pdf",
      name: "doc.pdf",
    });
    // slice() returns a Blob whose arrayBuffer rejects -> caught -> false.
    const badBlob = {
      arrayBuffer: () => Promise.reject(new Error("read error")),
    } as unknown as Blob;
    vi.spyOn(file, "slice").mockReturnValue(badBlob);

    expect(await FileAnalyzer.isValidPDF(file)).toBe(false);
  });
});
