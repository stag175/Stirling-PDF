import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  buildSplitFormData,
  getSplitEndpoint,
  splitOperationConfig,
  useSplitOperation,
} from "@app/hooks/tools/split/useSplitOperation";
import {
  defaultParameters,
  type SplitParameters,
} from "@app/hooks/tools/split/useSplitParameters";
import { SPLIT_METHODS } from "@app/constants/splitConstants";

// Mock the useToolOperation hook (keep ToolType etc. from the real module)
vi.mock("../shared/useToolOperation", async () => {
  const actual = await vi.importActual("../shared/useToolOperation");
  return {
    ...actual,
    useToolOperation: vi.fn(),
  };
});

// Mock the translation hook
const mockT = vi.fn((key: string, fallback?: string) => fallback ?? key);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock the error handler
vi.mock("../../../utils/toolErrorHandler", () => ({
  createStandardErrorHandler: vi.fn(() => "error-handler-function"),
}));

// Mock useToolResources so the hook does not require a PreferencesContext provider
const mockExtractZipFiles = vi.fn();
vi.mock("../shared/useToolResources", () => ({
  useToolResources: () => ({
    extractZipFiles: mockExtractZipFiles,
  }),
}));

// Import the mocked function
import {
  SingleFileToolOperationConfig,
  ToolOperationHook,
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";

describe("useSplitOperation", () => {
  const mockUseToolOperation = vi.mocked(useToolOperation);

  const getToolConfig = () =>
    mockUseToolOperation.mock
      .calls[0][0] as SingleFileToolOperationConfig<SplitParameters>;

  const mockToolOperationReturn: ToolOperationHook<unknown> = {
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

  const makeFile = () =>
    new File(["test content"], "test.pdf", { type: "application/pdf" });

  const makeParams = (
    overrides: Partial<SplitParameters>,
  ): SplitParameters => ({
    ...defaultParameters,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToolOperation.mockReturnValue(mockToolOperationReturn);
  });

  describe("buildSplitFormData", () => {
    test("always appends the file under fileInput", () => {
      const file = makeFile();
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_PAGES, pages: "1,3" }),
        file,
      );
      expect(formData.get("fileInput")).toBe(file);
    });

    test("BY_PAGES appends pageNumbers", () => {
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_PAGES, pages: "1,2,5-7" }),
        makeFile(),
      );
      expect(formData.get("pageNumbers")).toBe("1,2,5-7");
    });

    test("defaults to BY_PAGES branch when method is null", () => {
      const formData = buildSplitFormData(
        makeParams({ method: null, pages: "4,8" }),
        makeFile(),
      );
      expect(formData.get("pageNumbers")).toBe("4,8");
      expect(formData.get("splitType")).toBeNull();
    });

    test("BY_SECTIONS appends divisions, merge, and SPLIT_ALL mode (no custom pages)", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_SECTIONS,
          hDiv: "3",
          vDiv: "4",
          merge: true,
          splitMode: "SPLIT_ALL",
        }),
        makeFile(),
      );
      expect(formData.get("horizontalDivisions")).toBe("3");
      expect(formData.get("verticalDivisions")).toBe("4");
      expect(formData.get("merge")).toBe("true");
      expect(formData.get("splitMode")).toBe("SPLIT_ALL");
      // SPLIT_ALL mode must not add pageNumbers
      expect(formData.get("pageNumbers")).toBeNull();
    });

    test("BY_SECTIONS with CUSTOM mode and customPages appends pageNumbers", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_SECTIONS,
          hDiv: "2",
          vDiv: "2",
          merge: false,
          splitMode: "CUSTOM",
          customPages: "2-5",
        }),
        makeFile(),
      );
      expect(formData.get("splitMode")).toBe("CUSTOM");
      expect(formData.get("merge")).toBe("false");
      expect(formData.get("pageNumbers")).toBe("2-5");
    });

    test("BY_SECTIONS CUSTOM mode without customPages skips pageNumbers", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_SECTIONS,
          splitMode: "CUSTOM",
          customPages: "",
        }),
        makeFile(),
      );
      expect(formData.get("splitMode")).toBe("CUSTOM");
      expect(formData.get("pageNumbers")).toBeNull();
    });

    test("BY_SECTIONS falls back merge=false and splitMode=SPLIT_ALL via nullish/or defaults", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_SECTIONS,
          // override the typed boolean default with undefined to hit ?? branch
          merge: undefined as unknown as boolean,
          splitMode: "",
        }),
        makeFile(),
      );
      expect(formData.get("merge")).toBe("false");
      expect(formData.get("splitMode")).toBe("SPLIT_ALL");
    });

    test("BY_SIZE appends splitType 0 and value", () => {
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_SIZE, splitValue: "10MB" }),
        makeFile(),
      );
      expect(formData.get("splitType")).toBe("0");
      expect(formData.get("splitValue")).toBe("10MB");
    });

    test("BY_PAGE_COUNT appends splitType 1 and value", () => {
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_PAGE_COUNT, splitValue: "5" }),
        makeFile(),
      );
      expect(formData.get("splitType")).toBe("1");
      expect(formData.get("splitValue")).toBe("5");
    });

    test("BY_DOC_COUNT appends splitType 2 and value", () => {
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_DOC_COUNT, splitValue: "3" }),
        makeFile(),
      );
      expect(formData.get("splitType")).toBe("2");
      expect(formData.get("splitValue")).toBe("3");
    });

    test("BY_CHAPTERS appends bookmarkLevel and boolean flags", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_CHAPTERS,
          bookmarkLevel: "2",
          includeMetadata: true,
          allowDuplicates: true,
        }),
        makeFile(),
      );
      expect(formData.get("bookmarkLevel")).toBe("2");
      expect(formData.get("includeMetadata")).toBe("true");
      expect(formData.get("allowDuplicates")).toBe("true");
    });

    test("BY_CHAPTERS falls back to false for undefined boolean flags", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_CHAPTERS,
          bookmarkLevel: "1",
          includeMetadata: undefined as unknown as boolean,
          allowDuplicates: undefined as unknown as boolean,
        }),
        makeFile(),
      );
      expect(formData.get("includeMetadata")).toBe("false");
      expect(formData.get("allowDuplicates")).toBe("false");
    });

    test("BY_PAGE_DIVIDER appends duplexMode true", () => {
      const formData = buildSplitFormData(
        makeParams({ method: SPLIT_METHODS.BY_PAGE_DIVIDER, duplexMode: true }),
        makeFile(),
      );
      expect(formData.get("duplexMode")).toBe("true");
    });

    test("BY_PAGE_DIVIDER falls back to false when duplexMode undefined", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_PAGE_DIVIDER,
          duplexMode: undefined as unknown as boolean,
        }),
        makeFile(),
      );
      expect(formData.get("duplexMode")).toBe("false");
    });

    test("BY_POSTER appends explicit poster parameters", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_POSTER,
          pageSize: "A3",
          xFactor: "4",
          yFactor: "5",
          rightToLeft: true,
        }),
        makeFile(),
      );
      expect(formData.get("pageSize")).toBe("A3");
      expect(formData.get("xFactor")).toBe("4");
      expect(formData.get("yFactor")).toBe("5");
      expect(formData.get("rightToLeft")).toBe("true");
    });

    test("BY_POSTER uses A4/2/2/false defaults for empty/undefined values", () => {
      const formData = buildSplitFormData(
        makeParams({
          method: SPLIT_METHODS.BY_POSTER,
          pageSize: "",
          xFactor: "",
          yFactor: "",
          rightToLeft: undefined as unknown as boolean,
        }),
        makeFile(),
      );
      expect(formData.get("pageSize")).toBe("A4");
      expect(formData.get("xFactor")).toBe("2");
      expect(formData.get("yFactor")).toBe("2");
      expect(formData.get("rightToLeft")).toBe("false");
    });

    test("throws for an unknown split method", () => {
      expect(() =>
        buildSplitFormData(
          makeParams({ method: "totallyBogus" as never }),
          makeFile(),
        ),
      ).toThrow("Unknown split method: totallyBogus");
    });
  });

  describe("getSplitEndpoint", () => {
    test.each([
      { method: null, expected: "/api/v1/general/split-pages" },
      {
        method: SPLIT_METHODS.BY_PAGES,
        expected: "/api/v1/general/split-pages",
      },
      {
        method: SPLIT_METHODS.BY_SECTIONS,
        expected: "/api/v1/general/split-pdf-by-sections",
      },
      {
        method: SPLIT_METHODS.BY_SIZE,
        expected: "/api/v1/general/split-by-size-or-count",
      },
      {
        method: SPLIT_METHODS.BY_PAGE_COUNT,
        expected: "/api/v1/general/split-by-size-or-count",
      },
      {
        method: SPLIT_METHODS.BY_DOC_COUNT,
        expected: "/api/v1/general/split-by-size-or-count",
      },
      {
        method: SPLIT_METHODS.BY_CHAPTERS,
        expected: "/api/v1/general/split-pdf-by-chapters",
      },
      {
        method: SPLIT_METHODS.BY_PAGE_DIVIDER,
        expected: "/api/v1/misc/auto-split-pdf",
      },
      {
        method: SPLIT_METHODS.BY_POSTER,
        expected: "/api/v1/general/split-for-poster-print",
      },
    ])("maps method $method to $expected", ({ method, expected }) => {
      expect(getSplitEndpoint(makeParams({ method }))).toBe(expected);
    });

    test("throws for an unknown split method", () => {
      expect(() =>
        getSplitEndpoint(makeParams({ method: "nope" as never })),
      ).toThrow("Unknown split method: nope");
    });
  });

  describe("splitOperationConfig", () => {
    test("exposes the static configuration", () => {
      expect(splitOperationConfig.toolType).toBe(ToolType.singleFile);
      expect(splitOperationConfig.operationType).toBe("split");
      expect(splitOperationConfig.buildFormData).toBe(buildSplitFormData);
      expect(splitOperationConfig.endpoint).toBe(getSplitEndpoint);
      expect(splitOperationConfig.defaultParameters).toBe(defaultParameters);
    });
  });

  describe("useSplitOperation hook", () => {
    test("returns the result of useToolOperation", () => {
      const { result } = renderHook(() => useSplitOperation());
      expect(result.current).toBe(mockToolOperationReturn);
    });

    test("passes the static config plus a response handler and error message", () => {
      renderHook(() => useSplitOperation());

      const config = getToolConfig();
      expect(config.toolType).toBe(ToolType.singleFile);
      expect(config.operationType).toBe("split");
      expect(config.buildFormData).toBe(buildSplitFormData);
      expect(config.endpoint).toBe(getSplitEndpoint);
      expect(typeof config.responseHandler).toBe("function");
      expect(config.getErrorMessage).toBe("error-handler-function");
    });

    test("uses the split error translation key", () => {
      renderHook(() => useSplitOperation());
      expect(mockT).toHaveBeenCalledWith(
        "split.error.failed",
        "An error occurred while splitting the PDF.",
      );
    });

    test("responseHandler delegates to extractZipFiles", async () => {
      const extracted = [makeFile()];
      mockExtractZipFiles.mockResolvedValueOnce(extracted);

      renderHook(() => useSplitOperation());
      const config = getToolConfig();

      const blob = new Blob(["zip-bytes"], { type: "application/zip" });
      const originalFiles = [makeFile()];
      const result = await config.responseHandler!(blob, originalFiles);

      expect(mockExtractZipFiles).toHaveBeenCalledWith(blob);
      expect(result).toBe(extracted);
    });
  });
});
