import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * Unit tests for useOCROperation.ts.
 *
 * The module exports three pure pieces plus a thin hook:
 *  - buildOCRFormData(parameters, file): assembles a FormData with languages,
 *    ocrType, ocrRenderType and five boolean additional-option flags.
 *  - ocrResponseHandler(blob, originalFiles, extractZipFiles): inspects the
 *    first 8 bytes of the response to branch between ZIP (PK header), PDF
 *    (%PDF header) and HTML/text error payloads, with a JSZip local-extractor
 *    fallback and regex title extraction.
 *  - ocrOperationConfig: a static config literal.
 *  - useOCROperation(): wires the above into useToolOperation.
 *
 * Determinism strategy:
 *  - The shared setupTests.ts polyfills Blob.prototype.arrayBuffer to a FIXED
 *    8-byte buffer ([1..8]) because jsdom's Blob lacks it, and slice() inherits
 *    that polyfill. Real Blobs therefore CANNOT drive the header branches. So
 *    the response-handler tests use a hand-built blob-like object whose
 *    slice(start,end).arrayBuffer() resolves the exact requested byte range of a
 *    backing Uint8Array. This exercises the genuine head/error-detection logic
 *    with no I/O.
 *  - jszip is vi.mock'd so the local-extractor fallback path runs without
 *    touching real ZIP bytes; loadAsync returns a controllable file map.
 *  - useToolOperation, useToolResources and the error handler are vi.mock'd for
 *    the hook test, mirroring the sibling useAddPasswordOperation.test.ts.
 */

// --- Mocks for the hook wiring -------------------------------------------

vi.mock("@app/hooks/tools/shared/useToolOperation", async () => {
  const actual = await vi.importActual(
    "@app/hooks/tools/shared/useToolOperation",
  );
  return {
    ...actual,
    useToolOperation: vi.fn(),
  };
});

const mockExtractZipFiles = vi.fn();
vi.mock("@app/hooks/tools/shared/useToolResources", () => ({
  useToolResources: () => ({ extractZipFiles: mockExtractZipFiles }),
}));

const mockCreateStandardErrorHandler = vi.fn(
  (_msg: string) => (error: { message?: string }) =>
    `handled:${error.message ?? ""}`,
);
vi.mock("@app/utils/toolErrorHandler", () => ({
  createStandardErrorHandler: (msg: string) =>
    mockCreateStandardErrorHandler(msg),
}));

// jszip is dynamically imported inside the local extractZipFile fallback.
const mockLoadAsync = vi.fn();
vi.mock("jszip", () => {
  return {
    default: class {
      loadAsync = mockLoadAsync;
    },
  };
});

import {
  buildOCRFormData,
  ocrResponseHandler,
  ocrOperationConfig,
  useOCROperation,
} from "@app/hooks/tools/ocr/useOCROperation";
import { defaultParameters } from "@app/hooks/tools/ocr/useOCRParameters";
import type { OCRParameters } from "@app/hooks/tools/ocr/useOCRParameters";
import {
  ToolType,
  useToolOperation,
  type ToolOperationConfig,
  type ToolOperationHook,
} from "@app/hooks/tools/shared/useToolOperation";

// --- Helpers --------------------------------------------------------------

/** Encode an ASCII string to a Uint8Array. */
function bytes(s: string): Uint8Array {
  return new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
}

/**
 * A blob-like object that supports the exact surface ocrResponseHandler uses:
 * `.slice(start, end).arrayBuffer()`. The slice resolves the requested byte
 * range of `backing`, so the handler's header/error detection runs for real.
 */
function fakeBlob(content: string | Uint8Array): Blob {
  const backing = typeof content === "string" ? bytes(content) : content;
  const toBuf = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  const obj = {
    // Used by ocrResponseHandler to read the head/error preview.
    slice(start: number, end: number) {
      const sub = backing.slice(start, end);
      return { arrayBuffer: async () => toBuf(sub) };
    },
    // Used by the local extractZipFile fallback (zip.loadAsync(arrayBuffer)).
    arrayBuffer: async () => toBuf(backing),
  };
  return obj as unknown as Blob;
}

function pdfFile(name = "doc.pdf"): File {
  return new File(["x"], name, { type: "application/pdf" });
}

// --- buildOCRFormData -----------------------------------------------------

describe("buildOCRFormData", () => {
  const baseFile = pdfFile();

  test("serialises languages, types and defaults all options to false", () => {
    const params: OCRParameters = {
      languages: ["eng", "deu"],
      ocrType: "skip-text",
      ocrRenderType: "hocr",
      additionalOptions: [],
    };

    const fd = buildOCRFormData(params, baseFile);

    expect(fd.get("fileInput")).toBe(baseFile);
    expect(fd.getAll("languages")).toEqual(["eng", "deu"]);
    expect(fd.get("ocrType")).toBe("skip-text");
    expect(fd.get("ocrRenderType")).toBe("hocr");
    expect(fd.get("sidecar")).toBe("false");
    expect(fd.get("deskew")).toBe("false");
    expect(fd.get("clean")).toBe("false");
    expect(fd.get("cleanFinal")).toBe("false");
    expect(fd.get("removeImagesAfter")).toBe("false");
  });

  test("sets each additional option flag to true when present", () => {
    const params: OCRParameters = {
      languages: ["eng"],
      ocrType: "force-ocr",
      ocrRenderType: "sandwich",
      additionalOptions: [
        "sidecar",
        "deskew",
        "clean",
        "cleanFinal",
        "removeImagesAfter",
      ],
    };

    const fd = buildOCRFormData(params, baseFile);

    expect(fd.get("sidecar")).toBe("true");
    expect(fd.get("deskew")).toBe("true");
    expect(fd.get("clean")).toBe("true");
    expect(fd.get("cleanFinal")).toBe("true");
    expect(fd.get("removeImagesAfter")).toBe("true");
  });

  test("handles a partial subset of options", () => {
    const params: OCRParameters = {
      languages: [],
      ocrType: "skip-text",
      ocrRenderType: "hocr",
      additionalOptions: ["deskew", "removeImagesAfter"],
    };

    const fd = buildOCRFormData(params, baseFile);

    expect(fd.getAll("languages")).toEqual([]);
    expect(fd.get("sidecar")).toBe("false");
    expect(fd.get("deskew")).toBe("true");
    expect(fd.get("clean")).toBe("false");
    expect(fd.get("cleanFinal")).toBe("false");
    expect(fd.get("removeImagesAfter")).toBe("true");
  });

  test("treats a missing additionalOptions array as empty", () => {
    // Force the `parameters.additionalOptions || []` fallback branch.
    const params = {
      languages: ["eng"],
      ocrType: "skip-text",
      ocrRenderType: "hocr",
    } as unknown as OCRParameters;

    const fd = buildOCRFormData(params, baseFile);

    expect(fd.get("sidecar")).toBe("false");
    expect(fd.get("removeImagesAfter")).toBe("false");
  });
});

// --- ocrResponseHandler ---------------------------------------------------

describe("ocrResponseHandler", () => {
  const originalFiles = [pdfFile("source.pdf")];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns the extractZipFiles result for a PK/ZIP header", async () => {
    const extracted = [
      new File(["a"], "page1.txt", { type: "text/plain" }),
      new File(["b"], "page2.txt", { type: "text/plain" }),
    ];
    const extractZipFiles = vi.fn().mockResolvedValue(extracted);

    const result = await ocrResponseHandler(
      fakeBlob("PKrest"),
      originalFiles,
      extractZipFiles,
    );

    expect(extractZipFiles).toHaveBeenCalledTimes(1);
    expect(result).toBe(extracted);
    // Local JSZip fallback must NOT run when the primary extractor succeeds.
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  test("falls back to the local JSZip extractor when the primary returns empty", async () => {
    const extractZipFiles = vi.fn().mockResolvedValue([]);
    mockLoadAsync.mockResolvedValue({
      files: {
        "out.pdf": {
          dir: false,
          async: async () => fakeBlob("%PDF-1.7"),
        },
        "subdir/": { dir: true, async: async () => fakeBlob("") },
      },
    });

    const result = await ocrResponseHandler(
      fakeBlob("PK-zip-data"),
      originalFiles,
      extractZipFiles,
    );

    expect(extractZipFiles).toHaveBeenCalledTimes(1);
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("out.pdf");
    expect(result[0].type).toBe("application/pdf");
  });

  test("falls back to the local JSZip extractor when the primary throws", async () => {
    const extractZipFiles = vi.fn().mockRejectedValue(new Error("boom"));
    mockLoadAsync.mockResolvedValue({
      files: {
        "image.png": { dir: false, async: async () => fakeBlob("PNG") },
      },
    });

    const result = await ocrResponseHandler(
      fakeBlob("PKxyz"),
      originalFiles,
      extractZipFiles,
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("image.png");
    // Unknown extension -> octet-stream mime.
    expect(result[0].type).toBe("application/octet-stream");
  });

  test("wraps the raw ZIP blob when both extractors yield nothing", async () => {
    const extractZipFiles = vi.fn().mockResolvedValue([]);
    mockLoadAsync.mockResolvedValue({ files: {} });

    const result = await ocrResponseHandler(
      fakeBlob("PK-empty"),
      originalFiles,
      extractZipFiles,
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ocr_source.zip");
    expect(result[0].type).toBe("application/zip");
  });

  test("wraps the raw ZIP blob when the local extractor throws too", async () => {
    const extractZipFiles = vi.fn().mockResolvedValue([]);
    mockLoadAsync.mockRejectedValue(new Error("corrupt zip"));

    const result = await ocrResponseHandler(
      fakeBlob("PK!!"),
      [pdfFile("noext")],
      extractZipFiles,
    );

    expect(result).toHaveLength(1);
    // stripExt("noext") has no dot -> name kept as-is.
    expect(result[0].name).toBe("ocr_noext.zip");
  });

  test("passes through a valid PDF response unchanged", async () => {
    const extractZipFiles = vi.fn();

    const result = await ocrResponseHandler(
      fakeBlob("%PDF-1.7 body"),
      [pdfFile("report.pdf")],
      extractZipFiles,
    );

    expect(extractZipFiles).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("report.pdf");
    expect(result[0].type).toBe("application/pdf");
  });

  test("throws a dedicated message when OCR tools are not installed", async () => {
    const body =
      "<html><body>OCR tools (OCRmyPDF) are not installed</body></html>";

    await expect(
      ocrResponseHandler(fakeBlob(body), originalFiles, vi.fn()),
    ).rejects.toThrow(/OCR tools \(OCRmyPDF or Tesseract\) are not installed/);
  });

  test("extracts the <title> from an HTML error response", async () => {
    const body =
      "<html><head><title>500 Internal Server Error</title></head>" +
      "<body>exception occurred</body></html>";

    await expect(
      ocrResponseHandler(fakeBlob(body), originalFiles, vi.fn()),
    ).rejects.toThrow("OCR service error: 500 Internal Server Error");
  });

  test("falls back to <h1> when there is no <title>", async () => {
    const body = "<html><body><h1>Bad Gateway</h1> error</body></html>";

    await expect(
      ocrResponseHandler(fakeBlob(body), originalFiles, vi.fn()),
    ).rejects.toThrow("OCR service error: Bad Gateway");
  });

  test("falls back to 'Unknown error' when neither title nor h1 is present", async () => {
    // Contains the error keyword to enter the branch, but no title/h1 tags.
    const body = "plain text error with no markup";

    await expect(
      ocrResponseHandler(fakeBlob(body), originalFiles, vi.fn()),
    ).rejects.toThrow("OCR service error: Unknown error");
  });

  test("throws an invalid-PDF message for non-error, non-PDF, non-ZIP content", async () => {
    const result = ocrResponseHandler(
      fakeBlob("just some random text"),
      originalFiles,
      vi.fn(),
    );

    await expect(result).rejects.toThrow(
      /Response is not a valid PDF\. Header/,
    );
  });
});

// --- ocrOperationConfig ---------------------------------------------------

describe("ocrOperationConfig", () => {
  test("exposes the expected static configuration", () => {
    expect(ocrOperationConfig.toolType).toBe(ToolType.singleFile);
    expect(ocrOperationConfig.operationType).toBe("ocr");
    expect(ocrOperationConfig.endpoint).toBe("/api/v1/misc/ocr-pdf");
    expect(ocrOperationConfig.buildFormData).toBe(buildOCRFormData);
    expect(ocrOperationConfig.defaultParameters).toBe(defaultParameters);
  });
});

// --- useOCROperation hook -------------------------------------------------

describe("useOCROperation", () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getConfig = () =>
    mockUseToolOperation.mock.calls[0][0] as ToolOperationConfig<OCRParameters>;

  const toolReturn: ToolOperationHook<unknown> = {
    files: [],
    thumbnails: [],
    downloadUrl: null,
    downloadFilename: "",
    isLoading: false,
    errorMessage: null,
    status: "",
    isGeneratingThumbnails: false,
    progress: null,
    executeOperation: vi.fn(),
    resetResults: vi.fn(),
    clearError: vi.fn(),
    cancelOperation: vi.fn(),
    undoOperation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToolOperation.mockReturnValue(toolReturn);
  });

  test("passes the static OCR config through to useToolOperation", () => {
    renderHook(() => useOCROperation());

    const config = getConfig();
    expect(config.toolType).toBe(ToolType.singleFile);
    expect(config.operationType).toBe("ocr");
    expect(config.endpoint).toBe("/api/v1/misc/ocr-pdf");
    expect(typeof config.responseHandler).toBe("function");
    expect(typeof config.getErrorMessage).toBe("function");
  });

  test("responseHandler delegates to ocrResponseHandler with the resources extractor", async () => {
    const extracted = [new File(["z"], "z.txt", { type: "text/plain" })];
    mockExtractZipFiles.mockResolvedValue(extracted);

    renderHook(() => useOCROperation());
    const config = getConfig();

    const result = await config.responseHandler!(fakeBlob("PK-data"), [
      pdfFile("in.pdf"),
    ]);

    expect(mockExtractZipFiles).toHaveBeenCalledTimes(1);
    expect(result).toBe(extracted);
  });

  test("getErrorMessage short-circuits the OCR-tools-not-installed case", () => {
    renderHook(() => useOCROperation());
    const config = getConfig();

    const msg = config.getErrorMessage!({
      message: "OCR tools missing: not installed",
    } as Error);

    expect(msg).toMatch(
      /OCR tools \(OCRmyPDF or Tesseract\) are not installed/,
    );
    // The standard handler must not be consulted for this case.
    expect(mockCreateStandardErrorHandler).not.toHaveBeenCalled();
  });

  test("getErrorMessage defers to the standard handler for other errors", () => {
    renderHook(() => useOCROperation());
    const config = getConfig();

    const msg = config.getErrorMessage!({
      message: "some other failure",
    } as Error);

    expect(mockCreateStandardErrorHandler).toHaveBeenCalledWith(
      "ocr.error.failed",
    );
    expect(msg).toBe("handled:some other failure");
  });

  test("getErrorMessage uses the standard handler when message lacks 'not installed'", () => {
    renderHook(() => useOCROperation());
    const config = getConfig();

    // Mentions "OCR tools" but NOT "not installed" -> standard handler path.
    const msg = config.getErrorMessage!({
      message: "OCR tools crashed",
    } as Error);

    expect(mockCreateStandardErrorHandler).toHaveBeenCalled();
    expect(msg).toBe("handled:OCR tools crashed");
  });
});
