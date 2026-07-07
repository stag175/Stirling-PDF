import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fileProcessingService } from "@app/services/fileProcessingService";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { generateThumbnailForFile } from "@app/utils/thumbnailUtils";
import { FileId } from "@app/types/file";

/**
 * Unit tests for fileProcessingService (singleton FileProcessingService).
 *
 * The service has two external dependencies, both mocked here for
 * determinism:
 *   - pdfWorkerManager        (createDocument / destroyDocument /
 *                              destroyAllDocuments; we never touch a real
 *                              PDF.js worker)
 *   - generateThumbnailForFile (thumbnail rendering; we never touch a real
 *                              canvas / pdf render pipeline)
 *
 * Because the module exports a singleton, every test resets the mocks AND
 * clears the in-flight processing cache in afterEach so state never leaks
 * between cases. console output is silenced to keep the run quiet and to
 * exercise the logging branches without noise.
 */

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn(),
    destroyDocument: vi.fn(),
    destroyAllDocuments: vi.fn(),
  },
}));

vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn(),
}));

const mockedWorker = vi.mocked(pdfWorkerManager);
const mockedThumbnail = vi.mocked(generateThumbnailForFile);

const asFileId = (id: string): FileId => id as unknown as FileId;

/**
 * Build a fake File with a deterministic arrayBuffer(). jsdom's File does not
 * reliably implement arrayBuffer, and even when it does we want full control
 * over timing (so a cancellation can be slipped in between awaits).
 */
function makeFile(
  name: string,
  type: string,
  arrayBufferImpl?: () => Promise<ArrayBuffer>,
): File {
  const file = new File(["%PDF-1.7"], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(
      arrayBufferImpl ?? (() => Promise.resolve(new ArrayBuffer(8))),
    ),
    configurable: true,
  });
  return file;
}

function makePdf(name = "doc.pdf"): File {
  return makeFile(name, "application/pdf");
}

/** A fake PDFDocumentProxy exposing just numPages. */
function makeFakeDoc(numPages: number) {
  return {
    numPages,
  } as unknown as Awaited<ReturnType<typeof pdfWorkerManager.createDocument>>;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // Sensible defaults: a 3-page PDF doc + a real thumbnail string.
  mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(3));
  mockedThumbnail.mockResolvedValue("data:image/png;base64,THUMB");
});

afterEach(() => {
  // The service is a singleton; make sure no in-flight op leaks across tests.
  fileProcessingService.clearCache();
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("processFile - PDF success path", () => {
  test("returns metadata with page count from PDF.js and a page-1 thumbnail", async () => {
    const file = makePdf();
    const result = await fileProcessingService.processFile(
      file,
      asFileId("f-pdf"),
    );

    expect(result.success).toBe(true);
    const metadata = result.metadata!;
    expect(metadata.totalPages).toBe(3);
    expect(metadata.thumbnailUrl).toBe("data:image/png;base64,THUMB");
    expect(typeof metadata.lastProcessed).toBe("number");

    // Page structure: one entry per page, only page 1 carries the thumbnail.
    expect(metadata.pages).toHaveLength(3);
    expect(metadata.pages[0]).toEqual({
      pageNumber: 1,
      thumbnail: "data:image/png;base64,THUMB",
      rotation: 0,
      splitBefore: false,
    });
    expect(metadata.pages[1]).toEqual({
      pageNumber: 2,
      thumbnail: undefined,
      rotation: 0,
      splitBefore: false,
    });

    // The PDF was opened with the disable flags and then destroyed.
    expect(mockedWorker.createDocument).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { disableAutoFetch: true, disableStream: true },
    );
    expect(mockedWorker.destroyDocument).toHaveBeenCalledTimes(1);

    // Cache is cleaned up once the promise settles.
    expect(fileProcessingService.isProcessing(asFileId("f-pdf"))).toBe(false);
  });
});

describe("processFile - non-PDF path", () => {
  test("defaults to a single page and never opens a PDF document", async () => {
    const file = makeFile("image.png", "image/png");

    const result = await fileProcessingService.processFile(
      file,
      asFileId("f-img"),
    );

    expect(result.success).toBe(true);
    expect(result.metadata!.totalPages).toBe(1);
    expect(result.metadata!.pages).toHaveLength(1);
    expect(result.metadata!.pages[0].thumbnail).toBe(
      "data:image/png;base64,THUMB",
    );
    // arrayBuffer/PDF.js path is skipped for non-PDFs.
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mockedWorker.createDocument).not.toHaveBeenCalled();
  });
});

describe("processFile - PDF.js failure fallback", () => {
  test("sets totalPages to 0 (unknown) when createDocument throws, still succeeds", async () => {
    mockedWorker.createDocument.mockRejectedValue(new Error("pdfjs boom"));

    const result = await fileProcessingService.processFile(
      makePdf(),
      asFileId("f-pdf-fail"),
    );

    expect(result.success).toBe(true);
    expect(result.metadata!.totalPages).toBe(0);
    // No pages, so the page array is empty.
    expect(result.metadata!.pages).toEqual([]);
    // Thumbnail is still attempted (and succeeds) even though page count failed.
    expect(result.metadata!.thumbnailUrl).toBe("data:image/png;base64,THUMB");
    // We never reached destroyDocument because creation threw.
    expect(mockedWorker.destroyDocument).not.toHaveBeenCalled();
  });
});

describe("processFile - thumbnail failure", () => {
  test("succeeds with undefined thumbnail when generateThumbnailForFile throws", async () => {
    mockedThumbnail.mockRejectedValue(new Error("render fail"));

    const result = await fileProcessingService.processFile(
      makePdf(),
      asFileId("f-thumb-fail"),
    );

    expect(result.success).toBe(true);
    expect(result.metadata!.thumbnailUrl).toBeUndefined();
    // Page count from PDF.js is unaffected.
    expect(result.metadata!.totalPages).toBe(3);
    // Page 1 thumbnail is undefined too.
    expect(result.metadata!.pages[0].thumbnail).toBeUndefined();
  });
});

describe("processFile - in-flight dedup cache", () => {
  test("a second call with the same fileId returns the SAME in-flight promise", async () => {
    // Gate createDocument so the first op stays in flight while we issue a
    // second call for the same id.
    let releaseDoc!: () => void;
    mockedWorker.createDocument.mockReturnValue(
      new Promise((resolve) => {
        releaseDoc = () => resolve(makeFakeDoc(2));
      }) as unknown as ReturnType<typeof pdfWorkerManager.createDocument>,
    );

    const file = makePdf();
    const id = asFileId("dup");
    const first = fileProcessingService.processFile(file, id);
    const second = fileProcessingService.processFile(file, id);

    // The op is in flight and de-duplicated: the second call hit the cache and
    // logged the "Using cached processing" message rather than starting anew.
    expect(fileProcessingService.isProcessing(id)).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Using cached processing"),
    );

    releaseDoc();
    const [r1, r2] = await Promise.all([first, second]);
    // Both calls resolve to the SAME underlying result object (one processing
    // run shared between callers).
    expect(r1).toBe(r2);
    expect(r1.success).toBe(true);
    // createDocument ran exactly once despite two processFile calls.
    expect(mockedWorker.createDocument).toHaveBeenCalledTimes(1);
    // Cache freed afterward.
    expect(fileProcessingService.isProcessing(id)).toBe(false);
  });

  test("after completion the same fileId can be processed again (cache cleared)", async () => {
    const id = asFileId("reuse");
    await fileProcessingService.processFile(makePdf(), id);
    expect(fileProcessingService.isProcessing(id)).toBe(false);

    await fileProcessingService.processFile(makePdf(), id);
    expect(mockedWorker.createDocument).toHaveBeenCalledTimes(2);
  });
});

describe("processFile - cancellation checkpoints", () => {
  test("cancelling before arrayBuffer resolves yields a 'Processing cancelled' error", async () => {
    const id = asFileId("cancel-early");
    // arrayBuffer hangs until we manually resolve it AFTER aborting.
    let releaseBuffer!: () => void;
    const file = makeFile(
      "slow.pdf",
      "application/pdf",
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          releaseBuffer = () => resolve(new ArrayBuffer(8));
        }),
    );

    const promise = fileProcessingService.processFile(file, id);
    // Abort while the op is parked on file.arrayBuffer().
    expect(fileProcessingService.cancelProcessing(id)).toBe(true);
    releaseBuffer();

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("Processing cancelled");
    // We aborted after createDocument was set up but before it ran.
    expect(mockedWorker.createDocument).not.toHaveBeenCalled();
  });

  // NOTE on the swallowed-cancellation branches below:
  // The post-PDF.js signal check (inside the PDF.js try/catch) and the
  // post-thumbnail signal check (inside the thumbnail try/catch) DO throw
  // "Processing cancelled", but those throws are caught by their surrounding
  // local catch blocks rather than the outer handler. So an abort that lands
  // while parked on createDocument or generateThumbnailForFile does NOT fail
  // the operation -- it is absorbed as a (degraded) success. These tests pin
  // that real behaviour while still executing the in-block signal-check lines.

  test("an abort during PDF.js is swallowed by the PDF.js catch (degrades to 0 pages, success)", async () => {
    const id = asFileId("cancel-mid");
    // Gate createDocument so we can abort exactly while the op is parked on it.
    let releaseDoc!: () => void;
    mockedWorker.createDocument.mockReturnValue(
      new Promise((resolve) => {
        releaseDoc = () => resolve(makeFakeDoc(5));
      }) as unknown as ReturnType<typeof pdfWorkerManager.createDocument>,
    );

    const promise = fileProcessingService.processFile(makePdf(), id);
    // Let arrayBuffer resolve and the op reach the awaited createDocument.
    await Promise.resolve();
    await Promise.resolve();
    // Abort, then let the doc resolve so the post-PDF.js signal check runs.
    expect(fileProcessingService.cancelProcessing(id)).toBe(true);
    releaseDoc();

    const result = await promise;
    // The thrown "Processing cancelled" is caught by the PDF.js catch, which
    // sets totalPages = 0 and lets processing continue to a success result.
    expect(result.success).toBe(true);
    expect(result.metadata!.totalPages).toBe(0);
    expect(result.metadata!.pages).toEqual([]);
    // The doc was created and cleaned up before the cancellation check.
    expect(mockedWorker.destroyDocument).toHaveBeenCalledTimes(1);
    // Thumbnail generation still runs (it's outside the PDF.js block).
    expect(mockedThumbnail).toHaveBeenCalledTimes(1);
  });

  test("an abort during thumbnail generation is swallowed by the thumbnail catch (success, no thumbnail)", async () => {
    const id = asFileId("cancel-late");
    // Gate the thumbnail so we can abort while the op awaits it (after PDF.js).
    let releaseThumb!: () => void;
    mockedThumbnail.mockReturnValue(
      new Promise<string>((resolve) => {
        releaseThumb = () => resolve("data:image/png;base64,LATE");
      }),
    );

    const promise = fileProcessingService.processFile(makePdf(), id);
    // Flush microtasks until the op is parked on generateThumbnailForFile.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    expect(mockedThumbnail).toHaveBeenCalledTimes(1);
    // Abort, then resolve the thumbnail so the final signal check runs.
    expect(fileProcessingService.cancelProcessing(id)).toBe(true);
    releaseThumb();

    const result = await promise;
    // thumbnailUrl is assigned BEFORE the post-thumbnail signal check throws,
    // and the thumbnail catch only logs (it does not clear thumbnailUrl). So
    // the op succeeds and keeps the already-assigned thumbnail value.
    expect(result.success).toBe(true);
    expect(result.metadata!.totalPages).toBe(3);
    expect(result.metadata!.thumbnailUrl).toBe("data:image/png;base64,LATE");
    expect(result.metadata!.pages[0].thumbnail).toBe(
      "data:image/png;base64,LATE",
    );
  });
});

describe("processFile - error mapping", () => {
  test("maps a thrown Error to its message", async () => {
    // Force an Error out of the non-PDF path by making arrayBuffer irrelevant
    // and instead aborting before start is not it; use thumbnail throwing a
    // non-cancellation Error is swallowed, so instead break Array.from via a
    // rejected arrayBuffer on a PDF.
    const file = makeFile("bad.pdf", "application/pdf", () =>
      Promise.reject(new Error("buffer read failed")),
    );

    const result = await fileProcessingService.processFile(
      file,
      asFileId("err-msg"),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("buffer read failed");
    expect(errorSpy).toHaveBeenCalled();
  });

  test("maps a non-Error thrown value to 'Unknown processing error'", async () => {
    const file = makeFile("bad2.pdf", "application/pdf", () =>
      Promise.reject("plain string failure"),
    );

    const result = await fileProcessingService.processFile(
      file,
      asFileId("err-unknown"),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown processing error");
  });
});

describe("isProcessing", () => {
  test("reports true while an op is in flight and false once settled", async () => {
    const id = asFileId("inflight");
    let releaseDoc!: () => void;
    mockedWorker.createDocument.mockReturnValue(
      new Promise((resolve) => {
        releaseDoc = () => resolve(makeFakeDoc(1));
      }) as unknown as ReturnType<typeof pdfWorkerManager.createDocument>,
    );

    const promise = fileProcessingService.processFile(makePdf(), id);
    expect(fileProcessingService.isProcessing(id)).toBe(true);

    releaseDoc();
    await promise;
    expect(fileProcessingService.isProcessing(id)).toBe(false);
  });

  test("reports false for an unknown fileId", () => {
    expect(fileProcessingService.isProcessing(asFileId("nope"))).toBe(false);
  });
});

describe("cancelProcessing", () => {
  test("returns false when there is nothing to cancel", () => {
    expect(fileProcessingService.cancelProcessing(asFileId("ghost"))).toBe(
      false,
    );
  });

  test("returns true and aborts an in-flight operation", async () => {
    const id = asFileId("to-cancel");
    let releaseBuffer!: () => void;
    const file = makeFile(
      "hang.pdf",
      "application/pdf",
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          releaseBuffer = () => resolve(new ArrayBuffer(8));
        }),
    );

    const promise = fileProcessingService.processFile(file, id);
    expect(fileProcessingService.cancelProcessing(id)).toBe(true);

    releaseBuffer();
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe("Processing cancelled");
  });
});

describe("clearCache", () => {
  test("empties the in-flight cache so isProcessing returns false", async () => {
    const id = asFileId("clear-me");
    let releaseDoc!: () => void;
    mockedWorker.createDocument.mockReturnValue(
      new Promise((resolve) => {
        releaseDoc = () => resolve(makeFakeDoc(1));
      }) as unknown as ReturnType<typeof pdfWorkerManager.createDocument>,
    );

    const promise = fileProcessingService.processFile(makePdf(), id);
    expect(fileProcessingService.isProcessing(id)).toBe(true);

    fileProcessingService.clearCache();
    expect(fileProcessingService.isProcessing(id)).toBe(false);

    // Let the orphaned op finish cleanly so it doesn't leak.
    releaseDoc();
    await promise;
  });
});

describe("cancelAllProcessing", () => {
  test("aborts every in-flight operation", async () => {
    const fileA = makeFile(
      "a.pdf",
      "application/pdf",
      () => new Promise<ArrayBuffer>(() => {}),
    );
    const fileB = makeFile(
      "b.pdf",
      "application/pdf",
      () => new Promise<ArrayBuffer>(() => {}),
    );

    const pA = fileProcessingService.processFile(fileA, asFileId("a"));
    const pB = fileProcessingService.processFile(fileB, asFileId("b"));

    expect(fileProcessingService.isProcessing(asFileId("a"))).toBe(true);
    expect(fileProcessingService.isProcessing(asFileId("b"))).toBe(true);

    fileProcessingService.cancelAllProcessing();

    // The arrayBuffer promises never resolve (the ops hang forever), so we
    // assert the abort path ran by checking the per-op cancellation logs.
    // Both ops were logged as cancelled.
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cancelled processing for a"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cancelled processing for b"),
    );

    // The hanging ops never settle; drop references so the test ends.
    fileProcessingService.clearCache();
    void pA;
    void pB;
  });

  test("is a no-op (logs zero) when nothing is in flight", () => {
    fileProcessingService.cancelAllProcessing();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cancelled 0 processing operations"),
    );
  });
});

describe("emergencyCleanup", () => {
  test("cancels all, clears the cache, and destroys all workers", async () => {
    const file = makeFile(
      "x.pdf",
      "application/pdf",
      () => new Promise<ArrayBuffer>(() => {}),
    );
    const p = fileProcessingService.processFile(file, asFileId("x"));
    expect(fileProcessingService.isProcessing(asFileId("x"))).toBe(true);

    fileProcessingService.emergencyCleanup();

    expect(fileProcessingService.isProcessing(asFileId("x"))).toBe(false);
    expect(mockedWorker.destroyAllDocuments).toHaveBeenCalledTimes(1);

    void p;
  });
});
