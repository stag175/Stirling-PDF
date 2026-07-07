import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  detectSignaturesInFiles,
  useSignatureDetection,
  type FileSignatureStatus,
} from "@app/services/signatureDetectionService";

/**
 * Unit tests for signatureDetectionService.
 *
 * The module's only external dependency is the `window.pdfjsLib` global, which
 * it uses to open a PDF and walk pages/annotations plus AcroForm metadata. We
 * never load a real PDF: instead we install a fully controllable fake on
 * `window.pdfjsLib` whose getDocument(...).promise resolves to a fake
 * PDFDocumentProxy. That fake drives numPages, per-page getAnnotations() and
 * getMetadata(), which lets us exercise every branch of detectSignaturesInFile:
 *
 *   - the "PDF.js not available" guard (no global at all),
 *   - signature widget counting across multiple pages (Widget + fieldType Sig),
 *   - annotations that don't match (wrong subtype / wrong fieldType),
 *   - the AcroForm metadata.info.Signature branch and the
 *     metadata.metadata.has("dc:signature") branch (incl. Math.max clamp),
 *   - the "no signatures anywhere" result,
 *   - destroy() being called on the happy path,
 *   - the catch path for an Error (message surfaced) and a non-Error throw.
 *
 * detectSignaturesInFiles is the public iterator, and useSignatureDetection is
 * the React state hook around it (driven with @testing-library/react).
 *
 * The shared setupTests.ts polyfills File.prototype.arrayBuffer to a fixed
 * 8-byte buffer; that buffer's CONTENT is irrelevant because getDocument is a
 * stub that ignores its argument, so the tests stay deterministic.
 */

// console.warn is hit on the catch path; silence + assert it where relevant.
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the global between tests so the "not available" guard is reachable.
  delete (window as { pdfjsLib?: unknown }).pdfjsLib;
});

/** Build a plain PDF File; its bytes never reach pdf.js (getDocument is stubbed). */
function makeFile(name = "doc.pdf"): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

interface FakeMetadata {
  info?: Record<string, unknown>;
  metadata?: { has: (k: string) => boolean } | null;
}

interface FakePdfConfig {
  /** Annotations returned per page, index 0 -> page 1. */
  pages: Array<Array<Record<string, unknown>>>;
  /** Optional metadata object returned by getMetadata(). */
  metadata?: FakeMetadata | null;
  /** When set, getPage rejects for this 1-based page number. */
  failOnPage?: number;
  /** When set, getDocument(...).promise rejects with this. */
  rejectGetDocument?: unknown;
}

/**
 * Install a fake window.pdfjsLib and return the spies the tests assert on
 * (notably destroy()).
 */
function installPdfjs(config: FakePdfConfig) {
  const destroy = vi.fn();

  const getPage = vi.fn(async (pageNum: number) => {
    if (config.failOnPage === pageNum) {
      throw new Error(`getPage failed for ${pageNum}`);
    }
    const annotations = config.pages[pageNum - 1] ?? [];
    return {
      getAnnotations: vi.fn().mockResolvedValue(annotations),
    };
  });

  const getMetadata = vi.fn().mockResolvedValue(config.metadata ?? {});

  const pdf = {
    numPages: config.pages.length,
    getPage,
    getMetadata,
    destroy,
  };

  const getDocument = vi.fn(() => ({
    promise:
      config.rejectGetDocument !== undefined
        ? Promise.reject(config.rejectGetDocument)
        : Promise.resolve(pdf),
  }));

  (window as { pdfjsLib?: unknown }).pdfjsLib = { getDocument };

  return { destroy, getDocument, getPage, getMetadata };
}

/** A matching signature widget annotation. */
const sigWidget = (extra: Record<string, unknown> = {}) => ({
  subtype: "Widget",
  fieldType: "Sig",
  ...extra,
});

describe("detectSignaturesInFiles - PDF.js availability guard", () => {
  test("returns the not-available error when window.pdfjsLib is missing", async () => {
    // No installPdfjs() call -> global absent (afterEach deletes it).
    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results).toHaveLength(1);
    expect(results[0].result).toEqual({
      hasSignatures: false,
      error: "PDF.js not available",
    });
  });
});

describe("detectSignaturesInFiles - annotation counting", () => {
  test("counts signature widgets across multiple pages and ignores non-matches", async () => {
    const { destroy, getPage } = installPdfjs({
      pages: [
        // Page 1: one matching sig + a non-Sig widget + a non-widget.
        [
          sigWidget(),
          { subtype: "Widget", fieldType: "Tx" },
          { subtype: "Link", fieldType: "Sig" },
        ],
        // Page 2: two matching sigs.
        [sigWidget(), sigWidget()],
      ],
      metadata: {},
    });

    const file = makeFile();
    const results = await detectSignaturesInFiles([file]);

    expect(results[0].file).toBe(file);
    expect(results[0].result).toEqual({
      hasSignatures: true,
      signatureCount: 3,
    });
    // Both pages were walked.
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenNthCalledWith(1, 1);
    expect(getPage).toHaveBeenNthCalledWith(2, 2);
    // Happy path must destroy the document.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("reports no signatures when no annotation matches and metadata is clean", async () => {
    const { destroy } = installPdfjs({
      pages: [[{ subtype: "Widget", fieldType: "Tx" }], []],
      metadata: { info: {}, metadata: { has: () => false } },
    });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result).toEqual({
      hasSignatures: false,
      signatureCount: 0,
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("detectSignaturesInFiles - AcroForm metadata branches", () => {
  test("metadata.info.Signature flags a signature even with no widget annotations", async () => {
    installPdfjs({
      pages: [[]],
      metadata: { info: { Signature: "present" } },
    });

    const results = await detectSignaturesInFiles([makeFile()]);

    // No widgets -> totalSignatures 0, clamped up to 1 by the info branch.
    expect(results[0].result).toEqual({
      hasSignatures: true,
      signatureCount: 1,
    });
  });

  test("metadata.metadata.has('dc:signature') flags a signature", async () => {
    const has = vi.fn((key: string) => key === "dc:signature");
    installPdfjs({
      pages: [[]],
      metadata: { info: {}, metadata: { has } },
    });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result).toEqual({
      hasSignatures: true,
      signatureCount: 1,
    });
    expect(has).toHaveBeenCalledWith("dc:signature");
  });

  test("Math.max keeps the larger widget count when metadata also signals a signature", async () => {
    installPdfjs({
      // Three widget sigs already counted.
      pages: [[sigWidget(), sigWidget(), sigWidget()]],
      metadata: { info: { Signature: 1 } },
    });

    const results = await detectSignaturesInFiles([makeFile()]);

    // max(3, 1) = 3, not clamped down.
    expect(results[0].result).toEqual({
      hasSignatures: true,
      signatureCount: 3,
    });
  });

  test("a null metadata object does not throw and yields no signatures", async () => {
    installPdfjs({ pages: [[]], metadata: null });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result).toEqual({
      hasSignatures: false,
      signatureCount: 0,
    });
  });
});

describe("detectSignaturesInFiles - error/catch paths", () => {
  test("a rejected getDocument.promise surfaces the Error message", async () => {
    installPdfjs({ pages: [], rejectGetDocument: new Error("load boom") });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result).toEqual({
      hasSignatures: false,
      signatureCount: 0,
      error: "load boom",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "PDF signature detection failed:",
      expect.any(Error),
    );
  });

  test("a non-Error throw falls back to the generic 'Detection failed' message", async () => {
    installPdfjs({ pages: [], rejectGetDocument: "string failure" });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result).toEqual({
      hasSignatures: false,
      signatureCount: 0,
      error: "Detection failed",
    });
  });

  test("a getPage failure mid-walk is caught and reported", async () => {
    installPdfjs({
      pages: [[sigWidget()], []],
      failOnPage: 2,
    });

    const results = await detectSignaturesInFiles([makeFile()]);

    expect(results[0].result.hasSignatures).toBe(false);
    expect(results[0].result.error).toBe("getPage failed for 2");
  });
});

describe("detectSignaturesInFiles - multi-file iteration", () => {
  test("processes every file in order and returns one status per file", async () => {
    installPdfjs({
      pages: [[sigWidget()]],
      metadata: {},
    });

    const a = makeFile("a.pdf");
    const b = makeFile("b.pdf");
    const results = await detectSignaturesInFiles([a, b]);

    expect(results).toHaveLength(2);
    expect(results[0].file).toBe(a);
    expect(results[1].file).toBe(b);
    expect(results[0].result.signatureCount).toBe(1);
    expect(results[1].result.signatureCount).toBe(1);
  });

  test("an empty file list yields an empty result array", async () => {
    const results = await detectSignaturesInFiles([]);
    expect(results).toEqual([]);
  });
});

describe("useSignatureDetection hook", () => {
  test("starts empty with falsy aggregate flags", () => {
    const { result } = renderHook(() => useSignatureDetection());

    expect(result.current.detectionResults).toEqual([]);
    expect(result.current.isDetecting).toBe(false);
    expect(result.current.hasAnySignatures).toBe(false);
    expect(result.current.totalSignatures).toBe(0);
  });

  test("detectSignatures with an empty array clears results without detecting", async () => {
    const { result } = renderHook(() => useSignatureDetection());

    // Seed some state first so we can prove the empty-array branch resets it.
    installPdfjs({ pages: [[sigWidget()]], metadata: {} });
    await act(async () => {
      await result.current.detectSignatures([makeFile()]);
    });
    expect(result.current.detectionResults).toHaveLength(1);

    await act(async () => {
      await result.current.detectSignatures([]);
    });

    expect(result.current.detectionResults).toEqual([]);
    expect(result.current.isDetecting).toBe(false);
  });

  test("populates results, aggregates, and exposes per-file lookup", async () => {
    installPdfjs({
      pages: [[sigWidget(), sigWidget()]],
      metadata: {},
    });

    const file = makeFile("signed.pdf");
    const { result } = renderHook(() => useSignatureDetection());

    await act(async () => {
      await result.current.detectSignatures([file]);
    });

    expect(result.current.detectionResults).toHaveLength(1);
    expect(result.current.isDetecting).toBe(false);
    expect(result.current.hasAnySignatures).toBe(true);
    expect(result.current.totalSignatures).toBe(2);

    const status = result.current.getFileSignatureStatus(file);
    expect(status).toEqual({ hasSignatures: true, signatureCount: 2 });

    // A file that was never detected returns null.
    expect(result.current.getFileSignatureStatus(makeFile("other.pdf"))).toBe(
      null,
    );
  });

  test("totalSignatures defaults missing counts to zero (PDF.js unavailable)", async () => {
    // No pdfjs installed -> each result has hasSignatures:false and NO count,
    // exercising the `|| 0` fallback in the reduce.
    const { result } = renderHook(() => useSignatureDetection());

    await act(async () => {
      await result.current.detectSignatures([makeFile()]);
    });

    expect(result.current.detectionResults[0].result).toEqual({
      hasSignatures: false,
      error: "PDF.js not available",
    });
    expect(result.current.hasAnySignatures).toBe(false);
    expect(result.current.totalSignatures).toBe(0);
  });

  test("reset clears previously detected results", async () => {
    installPdfjs({ pages: [[sigWidget()]], metadata: {} });

    const { result } = renderHook(() => useSignatureDetection());

    await act(async () => {
      await result.current.detectSignatures([makeFile()]);
    });
    expect(result.current.detectionResults).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.detectionResults).toEqual([]);
    expect(result.current.hasAnySignatures).toBe(false);
  });

  test("isDetecting is true while detection is in flight and false after (finally)", async () => {
    // A deferred getAnnotations lets us observe the in-flight isDetecting state.
    let releaseAnnotations: (
      value: Array<Record<string, unknown>>,
    ) => void = () => {};
    const annotationsPromise = new Promise<Array<Record<string, unknown>>>(
      (resolve) => {
        releaseAnnotations = resolve;
      },
    );
    const destroy = vi.fn();
    (window as { pdfjsLib?: unknown }).pdfjsLib = {
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockResolvedValue({
            getAnnotations: vi.fn(() => annotationsPromise),
          }),
          getMetadata: vi.fn().mockResolvedValue({}),
          destroy,
        }),
      })),
    };

    const { result } = renderHook(() => useSignatureDetection());

    let detectPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      detectPromise = result.current.detectSignatures([makeFile()]);
      // Yield so setIsDetecting(true) is applied but detection hasn't resolved.
      await Promise.resolve();
    });

    expect(result.current.isDetecting).toBe(true);

    await act(async () => {
      releaseAnnotations([sigWidget()]);
      await detectPromise;
    });

    expect(result.current.isDetecting).toBe(false);
    expect(result.current.totalSignatures).toBe(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("FileSignatureStatus typing sanity", () => {
  test("the returned shape matches FileSignatureStatus", async () => {
    installPdfjs({ pages: [[]], metadata: {} });
    const file = makeFile();
    const results = await detectSignaturesInFiles([file]);
    const status: FileSignatureStatus = results[0];
    expect(status.file).toBe(file);
    expect(status.result.hasSignatures).toBe(false);
  });
});
