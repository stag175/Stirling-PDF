import { beforeEach, describe, expect, test, vi } from "vitest";

import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { FileAnalyzer } from "@app/services/fileAnalyzer";
import { TrappedStatus } from "@app/types/metadata";

/**
 * Unit tests for pdfMetadataService.extractPDFMetadata.
 *
 * The service has two external dependencies, both mocked here for
 * determinism:
 *   - FileAnalyzer.isValidPDF  (gatekeeper validation)
 *   - pdfWorkerManager         (createDocument / destroyDocument; we never
 *                               touch a real PDF.js worker)
 *
 * extractPDFMetadata drives off a fake PDFDocumentProxy whose getMetadata()
 * returns a controllable `info` object, so every formatting / extraction
 * branch (formatPDFDate, convertTrappedStatus, extractCustomMetadata,
 * getStringMetadata) is exercised indirectly through the public API.
 */

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn(),
    destroyDocument: vi.fn(),
  },
}));

vi.mock("@app/services/fileAnalyzer", () => ({
  FileAnalyzer: {
    isValidPDF: vi.fn(),
  },
}));

const mockedWorker = vi.mocked(pdfWorkerManager);
const mockedAnalyzer = vi.mocked(FileAnalyzer);

/**
 * Build a fake File whose arrayBuffer() resolves so that the service can
 * proceed past `file.arrayBuffer()`. We avoid relying on jsdom's File impl
 * for arrayBuffer and stub it explicitly for determinism.
 */
function makeFile(name = "doc.pdf"): File {
  const file = new File(["%PDF-1.7"], name, { type: "application/pdf" });
  // jsdom File doesn't always implement arrayBuffer; force a resolved buffer.
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    configurable: true,
  });
  return file;
}

/**
 * Build a fake PDFDocumentProxy whose getMetadata returns the supplied info.
 */
function makeFakeDoc(info: Record<string, unknown>) {
  return {
    getMetadata: vi.fn().mockResolvedValue({ info }),
  } as unknown as Awaited<ReturnType<typeof pdfWorkerManager.createDocument>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: valid PDF so most tests reach the extraction body.
  mockedAnalyzer.isValidPDF.mockResolvedValue(true);
});

describe("extractPDFMetadata - validation gate", () => {
  test("returns error when FileAnalyzer rejects the file", async () => {
    mockedAnalyzer.isValidPDF.mockResolvedValue(false);

    const result = await extractPDFMetadata(makeFile());

    expect(result).toEqual({
      success: false,
      error: "File is not a valid PDF",
    });
    // We never attempt to open the document.
    expect(mockedWorker.createDocument).not.toHaveBeenCalled();
  });
});

describe("extractPDFMetadata - error / cleanup paths", () => {
  test("returns a Failed-to-read error with the Error message when createDocument throws", async () => {
    mockedWorker.createDocument.mockRejectedValue(new Error("boom"));

    const result = await extractPDFMetadata(makeFile());

    expect(result).toEqual({
      success: false,
      error: "Failed to read PDF: boom",
    });
    // pdfDoc is still null at the throw point, so cleanup must NOT destroy.
    expect(mockedWorker.destroyDocument).not.toHaveBeenCalled();
  });

  test("falls back to 'Unknown error' when the thrown value is not an Error", async () => {
    mockedWorker.createDocument.mockRejectedValue("string failure");

    const result = await extractPDFMetadata(makeFile());

    expect(result).toEqual({
      success: false,
      error: "Failed to read PDF: Unknown error",
    });
  });

  test("destroys the document and still returns error when getMetadata throws after creation", async () => {
    const doc = {
      getMetadata: vi.fn().mockRejectedValue(new Error("meta fail")),
    } as unknown as Awaited<ReturnType<typeof pdfWorkerManager.createDocument>>;
    mockedWorker.createDocument.mockResolvedValue(doc);

    const result = await extractPDFMetadata(makeFile());

    expect(result).toEqual({
      success: false,
      error: "Failed to read PDF: meta fail",
    });
    // pdfDoc is now set, so cleanup must destroy it.
    expect(mockedWorker.destroyDocument).toHaveBeenCalledWith(doc);
  });

  test("swallows a destroyDocument failure during cleanup (catch branch)", async () => {
    const doc = {
      getMetadata: vi.fn().mockRejectedValue(new Error("meta fail")),
    } as unknown as Awaited<ReturnType<typeof pdfWorkerManager.createDocument>>;
    mockedWorker.createDocument.mockResolvedValue(doc);
    mockedWorker.destroyDocument.mockImplementation(() => {
      throw new Error("cleanup explode");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to cleanup PDF document:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
    // Restore a no-op impl so the throwing one doesn't leak into later tests.
    mockedWorker.destroyDocument.mockReset();
  });
});

describe("extractPDFMetadata - successful extraction", () => {
  test("extracts all string fields, PDF dates, trapped=True and custom metadata", async () => {
    const info = {
      Title: "My Title",
      Author: "Jane Author",
      Subject: "A Subject",
      Keywords: "k1, k2",
      Creator: "Creator App",
      Producer: "Producer Lib",
      // Full PDF date format: D:YYYYMMDDHHmmSS...
      CreationDate: "D:20240115093045Z",
      ModDate: "D:20240116101112+02'00'",
      Trapped: { name: "True" },
      Custom: {
        Department: "Engineering",
        Project: "Apollo",
        Empty: "",
        Nothing: null,
      },
    };
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(info));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return; // type narrow
    const m = result.metadata;

    expect(m.title).toBe("My Title");
    expect(m.author).toBe("Jane Author");
    expect(m.subject).toBe("A Subject");
    expect(m.keywords).toBe("k1, k2");
    expect(m.creator).toBe("Creator App");
    expect(m.producer).toBe("Producer Lib");
    expect(m.trapped).toBe(TrappedStatus.TRUE);

    // formatPDFDate parses the D: prefix using local-time Date construction.
    // We assert the deterministic structure (yyyy/MM/dd HH:mm:ss) rather than
    // an exact value, which would depend on the test machine's timezone for
    // the date components. The date portion is timezone-stable.
    expect(m.creationDate).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(m.creationDate.startsWith("2024/01/15")).toBe(true);
    expect(m.modificationDate.startsWith("2024/01/16")).toBe(true);

    // Custom metadata: empty-string and null values are skipped; surviving
    // entries get sequential custom IDs.
    expect(m.customMetadata).toEqual([
      { key: "Department", value: "Engineering", id: "custom1" },
      { key: "Project", value: "Apollo", id: "custom2" },
    ]);

    // Document is cleaned up on the success path.
    expect(mockedWorker.destroyDocument).toHaveBeenCalledTimes(1);
    // createDocument was called with the disable flags from the source.
    expect(mockedWorker.createDocument).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { disableAutoFetch: true, disableStream: true },
    );
  });

  test("handles PDF date with only year/month/day (missing time defaults to 0)", async () => {
    const info = {
      // No time component -> hour/minute/second parseInt is NaN -> || 0.
      CreationDate: "D:20231225",
    };
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(info));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.creationDate).toBe("2023/12/25 00:00:00");
  });

  test("parses a regular (non-D:) date string via the Date constructor", async () => {
    const info = {
      // ISO date with explicit UTC offset so the local components are stable.
      ModDate: "2022-03-04T05:06:07Z",
    };
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(info));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Output must match the yyyy/MM/dd HH:mm:ss shape regardless of timezone.
    expect(result.metadata.modificationDate).toMatch(
      /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });

  test("returns empty string for unparseable / missing dates", async () => {
    const info = {
      CreationDate: "not-a-real-date", // Date -> NaN -> ""
      ModDate: "", // empty -> early return ""
    };
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(info));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.creationDate).toBe("");
    expect(result.metadata.modificationDate).toBe("");
  });

  test("non-string metadata fields and absent keys fall back to empty strings", async () => {
    const info = {
      Title: 12345, // numeric -> not a string -> ""
      Author: undefined, // missing -> ""
      // Subject/Keywords/Creator/Producer absent entirely.
    };
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc(info));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    const m = result.metadata;
    expect(m.title).toBe("");
    expect(m.author).toBe("");
    expect(m.subject).toBe("");
    expect(m.keywords).toBe("");
    expect(m.creator).toBe("");
    expect(m.producer).toBe("");
  });

  test("maps trapped=False to TrappedStatus.FALSE", async () => {
    mockedWorker.createDocument.mockResolvedValue(
      makeFakeDoc({ Trapped: { name: "False" } }),
    );

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.trapped).toBe(TrappedStatus.FALSE);
  });

  test("maps an unrecognized trapped name to TrappedStatus.UNKNOWN", async () => {
    mockedWorker.createDocument.mockResolvedValue(
      makeFakeDoc({ Trapped: { name: "Maybe" } }),
    );

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.trapped).toBe(TrappedStatus.UNKNOWN);
  });

  test("maps a non-object / missing trapped value to TrappedStatus.UNKNOWN", async () => {
    mockedWorker.createDocument.mockResolvedValue(
      makeFakeDoc({ Trapped: "True" }), // a string, not the {name} object
    );

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.trapped).toBe(TrappedStatus.UNKNOWN);
  });

  test("returns an empty custom metadata list when Custom is not an object", async () => {
    mockedWorker.createDocument.mockResolvedValue(
      makeFakeDoc({ Custom: "nope" }),
    );

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.customMetadata).toEqual([]);
  });

  test("returns an empty custom metadata list when Custom is absent (undefined)", async () => {
    mockedWorker.createDocument.mockResolvedValue(makeFakeDoc({}));

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.customMetadata).toEqual([]);
    // All standard string fields default to empty too.
    expect(result.metadata.title).toBe("");
    expect(result.metadata.trapped).toBe(TrappedStatus.UNKNOWN);
  });

  test("stringifies non-string custom metadata values", async () => {
    mockedWorker.createDocument.mockResolvedValue(
      makeFakeDoc({ Custom: { Pages: 42, Flag: true } }),
    );

    const result = await extractPDFMetadata(makeFile());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.metadata.customMetadata).toEqual([
      { key: "Pages", value: "42", id: "custom1" },
      { key: "Flag", value: "true", id: "custom2" },
    ]);
  });
});
