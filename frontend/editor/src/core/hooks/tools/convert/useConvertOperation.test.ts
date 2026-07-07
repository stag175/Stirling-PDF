import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---- Mocks for external/side-effecting deps ----

// Mock the API client (network). Default export with a `post` method.
const mockPost = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

// Mock the underlying tool operation hook so we can inspect the config it
// receives without pulling in FileContext/navigation/etc.
vi.mock("@app/hooks/tools/shared/useToolOperation", async () => {
  const actual = await vi.importActual(
    "@app/hooks/tools/shared/useToolOperation",
  );
  return {
    ...actual,
    useToolOperation: vi.fn(),
  };
});

// Mock translation so error-message fallbacks are deterministic.
const mockT = vi.fn((_key: string, fallback: string) => fallback);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock the cloud-status hook so we control willUseCloud.
const mockUseToolCloudStatus = vi.fn((_endpointName?: string) => false);
vi.mock("@app/hooks/useToolCloudStatus", () => ({
  useToolCloudStatus: (endpointName?: string) =>
    mockUseToolCloudStatus(endpointName),
}));

import apiClient from "@app/services/apiClient";
import {
  ToolType,
  useToolOperation,
  type CustomToolOperationConfig,
  type ToolOperationHook,
} from "@app/hooks/tools/shared/useToolOperation";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import {
  shouldProcessFilesSeparately,
  buildConvertFormData,
  createFileFromResponse,
  convertProcessor,
  convertOperationConfig,
  useConvertOperation,
} from "@app/hooks/tools/convert/useConvertOperation";

// ---- Helpers ----

const makeParams = (
  overrides: Partial<Omit<ConvertParameters, "imageOptions">> & {
    imageOptions?: Partial<ConvertParameters["imageOptions"]>;
  } = {},
): ConvertParameters => ({
  ...defaultParameters,
  ...overrides,
  imageOptions: {
    ...defaultParameters.imageOptions,
    ...(overrides.imageOptions ?? {}),
  },
});

const makeFile = (name: string) =>
  new File(["content"], name, { type: "application/octet-stream" });

const mockResponse = (data: string = "blob-data") => ({
  data,
  headers: {
    "content-type": "application/pdf",
    "content-disposition": "",
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseToolCloudStatus.mockReturnValue(false);
});

// =====================================================================
// shouldProcessFilesSeparately decision tree
// =====================================================================
describe("shouldProcessFilesSeparately", () => {
  test("returns false when only one file is selected (short-circuit)", () => {
    const params = makeParams({ fromExtension: "pdf", toExtension: "png" });
    expect(shouldProcessFilesSeparately([makeFile("a.pdf")], params)).toBe(
      false,
    );
  });

  const twoFiles = [makeFile("a"), makeFile("b")];

  test.each([
    {
      description: "image format -> pdf with combineImages=false",
      params: {
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: { combineImages: false },
      },
      expected: true,
    },
    {
      description: "literal 'image' -> pdf with combineImages=false",
      params: {
        fromExtension: "image",
        toExtension: "pdf",
        imageOptions: { combineImages: false },
      },
      expected: true,
    },
    {
      description: "image -> pdf with combineImages=true (batch)",
      params: {
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: { combineImages: true },
      },
      expected: false,
    },
    {
      description: "svg -> pdf with combineImages=false",
      params: {
        fromExtension: "svg",
        toExtension: "pdf",
        imageOptions: { combineImages: false },
      },
      expected: true,
    },
    {
      description: "pdf -> image format",
      params: { fromExtension: "pdf", toExtension: "jpg" },
      expected: true,
    },
    {
      description: "pdf -> pdfa",
      params: { fromExtension: "pdf", toExtension: "pdfa" },
      expected: true,
    },
    {
      description: "pdf -> pdfx",
      params: { fromExtension: "pdf", toExtension: "pdfx" },
      expected: true,
    },
    {
      description: "pdf -> txt (text-like list)",
      params: { fromExtension: "pdf", toExtension: "txt" },
      expected: true,
    },
    {
      description: "pdf -> xlsx (spreadsheet list)",
      params: { fromExtension: "pdf", toExtension: "xlsx" },
      expected: true,
    },
    {
      description: "pdf -> cbr",
      params: { fromExtension: "pdf", toExtension: "cbr" },
      expected: true,
    },
    {
      description: "pdf -> epub (ebook list)",
      params: { fromExtension: "pdf", toExtension: "epub" },
      expected: true,
    },
    {
      description: "pdf -> office format (docx)",
      params: { fromExtension: "pdf", toExtension: "docx" },
      expected: true,
    },
    {
      description: "office format (docx) -> pdf",
      params: { fromExtension: "docx", toExtension: "pdf" },
      expected: true,
    },
    {
      description: "web format (html) -> pdf",
      params: { fromExtension: "html", toExtension: "pdf" },
      expected: true,
    },
    {
      description: "literal 'web' -> pdf",
      params: { fromExtension: "web", toExtension: "pdf" },
      expected: true,
    },
    {
      description: "ebook source (mobi) -> pdf",
      params: { fromExtension: "mobi", toExtension: "pdf" },
      expected: true,
    },
    {
      description: "smart detection web",
      params: { isSmartDetection: true, smartDetectionType: "web" as const },
      expected: true,
    },
    {
      description: "smart detection mixed",
      params: {
        isSmartDetection: true,
        smartDetectionType: "mixed" as const,
      },
      expected: true,
    },
    {
      description: "smart detection images (not separate)",
      params: {
        isSmartDetection: true,
        smartDetectionType: "images" as const,
        fromExtension: "image",
        toExtension: "pdf",
        imageOptions: { combineImages: true },
      },
      expected: false,
    },
    {
      description: "unrelated combination (md -> pdf)",
      params: { fromExtension: "md", toExtension: "pdf" },
      expected: false,
    },
  ])("$description -> $expected", ({ params, expected }) => {
    expect(shouldProcessFilesSeparately(twoFiles, makeParams(params))).toBe(
      expected,
    );
  });
});

// =====================================================================
// buildConvertFormData branches
// =====================================================================
describe("buildConvertFormData", () => {
  const files = [makeFile("a.pdf")];

  test("image output appends imageFormat/colorType/dpi/singleOrMultiple", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "png" }),
      files,
    );
    expect(fd.get("fileInput")).toBe(files[0]);
    expect(fd.get("imageFormat")).toBe("png");
    expect(fd.get("colorType")).toBe("color");
    expect(fd.get("dpi")).toBe("300");
    expect(fd.get("singleOrMultiple")).toBe("multiple");
  });

  test.each([
    { from: "pdf", to: "docx" },
    { from: "pdf", to: "odt" },
    { from: "pdf", to: "pptx" },
    { from: "pdf", to: "odp" },
    { from: "pdf", to: "txt" },
    { from: "pdf", to: "rtf" },
  ])("pdf -> $to appends outputFormat", ({ from, to }) => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: from, toExtension: to }),
      files,
    );
    expect(fd.get("outputFormat")).toBe(to);
  });

  test("image -> pdf appends fit/color/autoRotate", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "jpg", toExtension: "pdf" }),
      files,
    );
    expect(fd.get("fitOption")).toBe("maintainAspectRatio");
    expect(fd.get("colorType")).toBe("color");
    expect(fd.get("autoRotate")).toBe("true");
  });

  test("literal 'image' -> pdf also uses image branch", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "image", toExtension: "pdf" }),
      files,
    );
    expect(fd.get("fitOption")).toBe("maintainAspectRatio");
  });

  test("svg -> pdf appends combineIntoSinglePdf", () => {
    const fd = buildConvertFormData(
      makeParams({
        fromExtension: "svg",
        toExtension: "pdf",
        imageOptions: { combineImages: false },
      }),
      files,
    );
    expect(fd.get("combineIntoSinglePdf")).toBe("false");
  });

  test.each(["html", "zip"])("%s -> pdf appends zoom", (from) => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: from, toExtension: "pdf" }),
      files,
    );
    expect(fd.get("zoom")).toBe("1");
  });

  test.each(["eml", "msg"])("%s -> pdf appends email options", (from) => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: from, toExtension: "pdf" }),
      files,
    );
    expect(fd.get("includeAttachments")).toBe("true");
    expect(fd.get("maxAttachmentSizeMB")).toBe("10");
    expect(fd.get("downloadHtml")).toBe("false");
    expect(fd.get("includeAllRecipients")).toBe("false");
  });

  test("pdf -> pdfa appends outputFormat + strict", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "pdfa" }),
      files,
    );
    expect(fd.get("outputFormat")).toBe("pdfa-2b");
    expect(fd.get("strict")).toBe("false");
  });

  test("pdf -> pdfx uses pdfxOptions.outputFormat", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "pdfx" }),
      files,
    );
    expect(fd.get("outputFormat")).toBe("pdfx");
  });

  test("pdf -> pdfx falls back to 'pdfx' when option missing", () => {
    const params = makeParams({ fromExtension: "pdf", toExtension: "pdfx" });
    // Force the optional-chaining fallback branch.
    (params as { pdfxOptions?: unknown }).pdfxOptions = undefined;
    const fd = buildConvertFormData(params, files);
    expect(fd.get("outputFormat")).toBe("pdfx");
  });

  test("pdf -> csv appends pageNumbers", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "csv" }),
      files,
    );
    expect(fd.get("pageNumbers")).toBe("all");
  });

  test("pdf -> xlsx appends pageNumbers", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "xlsx" }),
      files,
    );
    expect(fd.get("pageNumbers")).toBe("all");
  });

  test("cbr -> pdf appends optimizeForEbook", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "cbr", toExtension: "pdf" }),
      files,
    );
    expect(fd.get("optimizeForEbook")).toBe("false");
  });

  test("pdf -> cbr appends dpi", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: "cbr" }),
      files,
    );
    expect(fd.get("dpi")).toBe("150");
  });

  test("cbz -> pdf appends optimizeForEbook (with nullish fallback)", () => {
    const params = makeParams({ fromExtension: "cbz", toExtension: "pdf" });
    (params as { cbzOptions?: unknown }).cbzOptions = undefined;
    const fd = buildConvertFormData(params, files);
    expect(fd.get("optimizeForEbook")).toBe("false");
  });

  test("pdf -> cbz appends dpi (with nullish fallback)", () => {
    const params = makeParams({ fromExtension: "pdf", toExtension: "cbz" });
    (params as { cbzOutputOptions?: unknown }).cbzOutputOptions = undefined;
    const fd = buildConvertFormData(params, files);
    expect(fd.get("dpi")).toBe("150");
  });

  test.each(["epub", "mobi", "azw3", "fb2"])(
    "%s -> pdf appends ebook options",
    (from) => {
      const fd = buildConvertFormData(
        makeParams({ fromExtension: from, toExtension: "pdf" }),
        files,
      );
      expect(fd.get("embedAllFonts")).toBe("false");
      expect(fd.get("includeTableOfContents")).toBe("false");
      expect(fd.get("includePageNumbers")).toBe("false");
      expect(fd.get("optimizeForEbook")).toBe("false");
    },
  );

  test("ebook -> pdf uses nullish fallbacks when ebookOptions missing", () => {
    const params = makeParams({ fromExtension: "epub", toExtension: "pdf" });
    (params as { ebookOptions?: unknown }).ebookOptions = undefined;
    const fd = buildConvertFormData(params, files);
    expect(fd.get("embedAllFonts")).toBe("false");
  });

  test.each(["epub", "azw3"])("pdf -> %s appends epub options", (to) => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "pdf", toExtension: to }),
      files,
    );
    expect(fd.get("detectChapters")).toBe("true");
    expect(fd.get("targetDevice")).toBe("TABLET_PHONE_IMAGES");
    expect(fd.get("outputFormat")).toBe("EPUB");
  });

  test("pdf -> azw3 falls back to AZW3 output format when option missing", () => {
    const params = makeParams({ fromExtension: "pdf", toExtension: "azw3" });
    (params as { epubOptions?: unknown }).epubOptions = undefined;
    const fd = buildConvertFormData(params, files);
    expect(fd.get("detectChapters")).toBe("true");
    expect(fd.get("outputFormat")).toBe("AZW3");
  });

  test("unhandled combination appends only fileInput", () => {
    const fd = buildConvertFormData(
      makeParams({ fromExtension: "md", toExtension: "pdf" }),
      files,
    );
    expect(fd.get("fileInput")).toBe(files[0]);
    expect(fd.get("outputFormat")).toBeNull();
  });
});

// =====================================================================
// createFileFromResponse
// =====================================================================
describe("createFileFromResponse", () => {
  test("maps pdfa target extension to pdf", () => {
    const file = createFileFromResponse("data", {}, "report.docx", "pdfa");
    expect(file.name).toBe("report.pdf");
  });

  test("maps pdfx target extension to pdf", () => {
    const file = createFileFromResponse("data", {}, "report.docx", "pdfx");
    expect(file.name).toBe("report.pdf");
  });

  test("uses the provided target extension for non pdf/a-x", () => {
    const file = createFileFromResponse("data", {}, "image.pdf", "png");
    expect(file.name).toBe("image.png");
  });

  test("prefers filename from content-disposition header", () => {
    const file = createFileFromResponse(
      "data",
      { "content-disposition": 'attachment; filename="server-name.pdf"' },
      "fallback.docx",
      "png",
    );
    expect(file.name).toBe("server-name.pdf");
  });
});

// =====================================================================
// convertProcessor
// =====================================================================
describe("convertProcessor", () => {
  test("throws on unsupported conversion format", async () => {
    await expect(
      convertProcessor(
        makeParams({ fromExtension: "png", toExtension: "docx" }),
        [makeFile("a.png")],
      ),
    ).rejects.toThrow("Unsupported conversion format");
    expect(mockPost).not.toHaveBeenCalled();
  });

  test("batch processing: single file produces one output, not consumed-all", async () => {
    mockPost.mockResolvedValue(mockResponse());
    const result = await convertProcessor(
      makeParams({
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: { combineImages: true },
      }),
      [makeFile("a.png")],
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/convert/img/pdf",
      expect.any(FormData),
      { responseType: "blob" },
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("a.pdf");
    expect(result.consumedAllInputs).toBe(false);
  });

  test("batch processing: multiple combined files marks consumedAllInputs", async () => {
    mockPost.mockResolvedValue(mockResponse());
    const result = await convertProcessor(
      makeParams({
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: { combineImages: true },
      }),
      [makeFile("a.png"), makeFile("b.png")],
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("converted_files.pdf");
    expect(result.consumedAllInputs).toBe(true);
  });

  test("separate processing: one API call per file, outputs per input", async () => {
    mockPost.mockResolvedValue(mockResponse());
    const result = await convertProcessor(
      makeParams({ fromExtension: "pdf", toExtension: "png" }),
      [makeFile("one.pdf"), makeFile("two.pdf")],
    );

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe("one.png");
    expect(result.files[1].name).toBe("two.png");
    expect(result.consumedAllInputs).toBe(false);
  });

  test("separate processing: catches per-file errors and continues", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPost
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(mockResponse());

    const result = await convertProcessor(
      makeParams({ fromExtension: "pdf", toExtension: "png" }),
      [makeFile("bad.pdf"), makeFile("good.pdf")],
    );

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("good.png");
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to convert file bad.pdf:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  test("maps pdfx to the pdfa endpoint and produces pdf output", async () => {
    mockPost.mockResolvedValue(mockResponse());
    const result = await convertProcessor(
      makeParams({ fromExtension: "pdf", toExtension: "pdfx" }),
      [makeFile("a.pdf"), makeFile("b.pdf")],
    );

    // pdfx routes through the pdf/pdfa endpoint.
    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/convert/pdf/pdfa",
      expect.any(FormData),
      { responseType: "blob" },
    );
    // Separate processing for pdf -> pdfa/pdfx.
    expect(result.files).toHaveLength(2);
    // pdfa/pdfx both produce .pdf output filenames.
    expect(result.files[0].name).toBe("a.pdf");
  });
});

// =====================================================================
// convertOperationConfig static config
// =====================================================================
describe("convertOperationConfig", () => {
  test("declares the custom tool type and operation type", () => {
    expect(convertOperationConfig.toolType).toBe(ToolType.custom);
    expect(convertOperationConfig.operationType).toBe("convert");
    expect(convertOperationConfig.customProcessor).toBe(convertProcessor);
  });

  test("endpoint returns undefined when extensions are missing", () => {
    expect(
      convertOperationConfig.endpoint(makeParams({ fromExtension: "" })),
    ).toBeUndefined();
    expect(
      convertOperationConfig.endpoint(
        makeParams({ fromExtension: "pdf", toExtension: "" }),
      ),
    ).toBeUndefined();
  });

  test("endpoint resolves the URL for a supported conversion", () => {
    expect(
      convertOperationConfig.endpoint(
        makeParams({ fromExtension: "pdf", toExtension: "png" }),
      ),
    ).toBe("/api/v1/convert/pdf/img");
  });

  test("endpoint maps pdfx to the pdfa endpoint", () => {
    expect(
      convertOperationConfig.endpoint(
        makeParams({ fromExtension: "pdf", toExtension: "pdfx" }),
      ),
    ).toBe("/api/v1/convert/pdf/pdfa");
  });

  test("endpoint returns empty string for an unsupported conversion", () => {
    // getEndpointUrl yields "" (not null), so the `?? undefined` keeps "".
    expect(
      convertOperationConfig.endpoint(
        makeParams({ fromExtension: "png", toExtension: "docx" }),
      ),
    ).toBe("");
  });
});

// =====================================================================
// useConvertOperation hook
// =====================================================================
describe("useConvertOperation", () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const baseReturn: ToolOperationHook<unknown> = {
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

  const getConfig = () =>
    mockUseToolOperation.mock
      .calls[0][0] as CustomToolOperationConfig<ConvertParameters>;

  beforeEach(() => {
    mockUseToolOperation.mockReturnValue(baseReturn);
  });

  test("passes a custom processor that delegates to convertProcessor", async () => {
    mockPost.mockResolvedValue(mockResponse());
    renderHook(() => useConvertOperation());

    const config = getConfig();
    expect(config.toolType).toBe(ToolType.custom);
    expect(config.operationType).toBe("convert");
    expect(typeof config.customProcessor).toBe("function");

    const result = await config.customProcessor(
      makeParams({
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: { combineImages: true },
      }),
      [makeFile("a.png")],
    );
    expect(result.files).toHaveLength(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test("getErrorMessage prefers string response data", () => {
    renderHook(() => useConvertOperation());
    const config = getConfig();
    const msg = config.getErrorMessage!({
      response: { data: "Backend failure detail" },
    });
    expect(msg).toBe("Backend failure detail");
  });

  test("getErrorMessage falls back to error.message", () => {
    renderHook(() => useConvertOperation());
    const config = getConfig();
    const msg = config.getErrorMessage!({
      response: { data: { not: "a string" } },
      message: "network down",
    });
    expect(msg).toBe("network down");
  });

  test("getErrorMessage falls back to translated default", () => {
    renderHook(() => useConvertOperation());
    const config = getConfig();
    const msg = config.getErrorMessage!({});
    expect(msg).toBe("An error occurred while converting the file.");
    expect(mockT).toHaveBeenCalledWith(
      "convert.errorConversion",
      "An error occurred while converting the file.",
    );
  });

  test("computes endpoint name only when both extensions present", () => {
    renderHook(() =>
      useConvertOperation(
        makeParams({ fromExtension: "pdf", toExtension: "png" }),
      ),
    );
    expect(mockUseToolCloudStatus).toHaveBeenCalledWith("pdf-to-img");
  });

  test("maps pdfx to pdfa endpoint name for cloud detection", () => {
    renderHook(() =>
      useConvertOperation(
        makeParams({ fromExtension: "pdf", toExtension: "pdfx" }),
      ),
    );
    expect(mockUseToolCloudStatus).toHaveBeenCalledWith("pdf-to-pdfa");
  });

  test("endpoint name is undefined when no parameters provided", () => {
    renderHook(() => useConvertOperation());
    expect(mockUseToolCloudStatus).toHaveBeenCalledWith(undefined);
  });

  test("endpoint name is undefined when an extension is missing", () => {
    renderHook(() =>
      useConvertOperation(
        makeParams({ fromExtension: "pdf", toExtension: "" }),
      ),
    );
    expect(mockUseToolCloudStatus).toHaveBeenCalledWith(undefined);
  });

  test("overrides willUseCloud with the calculated value", () => {
    mockUseToolCloudStatus.mockReturnValue(true);
    const { result } = renderHook(() =>
      useConvertOperation(
        makeParams({ fromExtension: "pdf", toExtension: "png" }),
      ),
    );
    expect(result.current.willUseCloud).toBe(true);
    // The rest of the operation hook result is spread through.
    expect(result.current.executeOperation).toBe(baseReturn.executeOperation);
  });

  test("default apiClient mock is wired (sanity)", () => {
    expect(apiClient).toBeDefined();
  });
});
