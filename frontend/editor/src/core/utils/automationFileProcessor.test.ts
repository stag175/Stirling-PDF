/**
 * Unit tests for AutomationFileProcessor.
 *
 * Exercises ZIP detection, ZIP extraction (HTML-keep, success, empty-result
 * fallback, thrown-error fallback), single/multi-file processing (success,
 * non-200, thrown error), and buildAutomationFormData (single/array files,
 * array/scalar/null/undefined parameters). All external collaborators
 * (apiClient, zipFileService, ResourceManager) are mocked for determinism.
 */

import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { AutomationFileProcessor } from "@app/utils/automationFileProcessor";
import apiClient from "@app/services/apiClient";
import { zipFileService } from "@app/services/zipFileService";
import { ResourceManager } from "@app/utils/resourceManager";
import { AUTOMATION_CONSTANTS } from "@app/constants/automation";

vi.mock("@app/services/apiClient", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("@app/services/zipFileService", () => ({
  zipFileService: {
    containsHtmlFiles: vi.fn(),
    extractAllFiles: vi.fn(),
  },
}));

vi.mock("@app/utils/resourceManager", () => ({
  ResourceManager: {
    createTimestampedFile: vi.fn(),
    createResultFile: vi.fn(),
  },
}));

const mockPost = apiClient.post as unknown as Mock;
const mockContainsHtml = zipFileService.containsHtmlFiles as unknown as Mock;
const mockExtractAll = zipFileService.extractAllFiles as unknown as Mock;
const mockCreateTimestampedFile =
  ResourceManager.createTimestampedFile as unknown as Mock;
const mockCreateResultFile =
  ResourceManager.createResultFile as unknown as Mock;

const makeZipFile = (name = "response_1.zip") =>
  new File(["zip-bytes"], name, { type: "application/zip" });

const makeExtractedFile = (name: string) =>
  new File(["data"], name, { type: "application/pdf" });

describe("AutomationFileProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, createTimestampedFile returns a stable ZIP file so fallback
    // assertions are deterministic regardless of Date.now().
    mockCreateTimestampedFile.mockImplementation(() => makeZipFile());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isZipFile", () => {
    test("recognizes application/zip", () => {
      const blob = new Blob(["x"], { type: "application/zip" });
      expect(AutomationFileProcessor.isZipFile(blob)).toBe(true);
    });

    test("recognizes application/x-zip-compressed", () => {
      const blob = new Blob(["x"], { type: "application/x-zip-compressed" });
      expect(AutomationFileProcessor.isZipFile(blob)).toBe(true);
    });

    test("rejects non-zip mime types", () => {
      const blob = new Blob(["x"], { type: "application/pdf" });
      expect(AutomationFileProcessor.isZipFile(blob)).toBe(false);
    });

    test("rejects a blob with no type", () => {
      const blob = new Blob(["x"]);
      expect(AutomationFileProcessor.isZipFile(blob)).toBe(false);
    });
  });

  describe("extractAutomationZipFiles", () => {
    test("keeps the ZIP as-is when it contains HTML files", async () => {
      const zipFile = makeZipFile();
      mockCreateTimestampedFile.mockReturnValueOnce(zipFile);
      mockContainsHtml.mockResolvedValueOnce(true);

      const blob = new Blob(["zip"], { type: "application/zip" });
      const result =
        await AutomationFileProcessor.extractAutomationZipFiles(blob);

      expect(result.success).toBe(true);
      expect(result.files).toEqual([zipFile]);
      expect(result.errors).toEqual([]);
      // HTML-keep path must not attempt extraction.
      expect(mockExtractAll).not.toHaveBeenCalled();
      expect(mockCreateTimestampedFile).toHaveBeenCalledWith(
        blob,
        AUTOMATION_CONSTANTS.RESPONSE_ZIP_PREFIX,
        ".zip",
        "application/zip",
      );
    });

    test("returns extracted files on successful extraction", async () => {
      mockContainsHtml.mockResolvedValueOnce(false);
      const extracted = [
        makeExtractedFile("a.pdf"),
        makeExtractedFile("b.png"),
      ];
      mockExtractAll.mockResolvedValueOnce({
        success: true,
        extractedFiles: extracted,
        errors: [],
      });

      const blob = new Blob(["zip"], { type: "application/zip" });
      const result =
        await AutomationFileProcessor.extractAutomationZipFiles(blob);

      expect(result.success).toBe(true);
      expect(result.files).toEqual(extracted);
      expect(result.errors).toEqual([]);
    });

    test("falls back to ZIP when extraction reports failure (with joined errors)", async () => {
      const zipFile = makeZipFile();
      mockCreateTimestampedFile.mockReturnValueOnce(zipFile);
      mockContainsHtml.mockResolvedValueOnce(false);
      mockExtractAll.mockResolvedValueOnce({
        success: false,
        extractedFiles: [],
        errors: ["bad entry", "crc mismatch"],
      });

      const blob = new Blob(["zip"], { type: "application/zip" });
      const result =
        await AutomationFileProcessor.extractAutomationZipFiles(blob);

      expect(result.success).toBe(true);
      expect(result.files).toEqual([zipFile]);
      expect(result.errors).toEqual([
        "ZIP extraction failed, kept as ZIP: bad entry, crc mismatch",
      ]);
    });

    test("falls back to ZIP when extraction yields zero files and no error array", async () => {
      const zipFile = makeZipFile();
      mockCreateTimestampedFile.mockReturnValueOnce(zipFile);
      mockContainsHtml.mockResolvedValueOnce(false);
      mockExtractAll.mockResolvedValueOnce({
        success: true,
        extractedFiles: [],
        errors: undefined,
      });

      const blob = new Blob(["zip"], { type: "application/zip" });
      const result =
        await AutomationFileProcessor.extractAutomationZipFiles(blob);

      expect(result.success).toBe(true);
      expect(result.files).toEqual([zipFile]);
      expect(result.errors).toEqual([
        "ZIP extraction failed, kept as ZIP: Unknown error",
      ]);
    });

    test("falls back to ZIP and logs a warning when a collaborator throws", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const fallbackFile = makeZipFile("fallback.zip");
      // First createTimestampedFile (inside try) returns a file, then
      // containsHtmlFiles throws to reach the catch block, where a second
      // createTimestampedFile builds the fallback file.
      mockCreateTimestampedFile
        .mockReturnValueOnce(makeZipFile())
        .mockReturnValueOnce(fallbackFile);
      mockContainsHtml.mockRejectedValueOnce(new Error("boom"));

      const blob = new Blob(["zip"], { type: "application/zip" });
      const result =
        await AutomationFileProcessor.extractAutomationZipFiles(blob);

      expect(result.success).toBe(true);
      expect(result.files).toEqual([fallbackFile]);
      expect(result.errors).toEqual([
        "ZIP extraction failed, kept as ZIP: Error: boom",
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to extract automation ZIP files, keeping as ZIP:",
        expect.any(Error),
      );
      expect(mockCreateTimestampedFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("processAutomationSingleFile", () => {
    test("returns a result file on HTTP 200 using default blob responseType and timeout", async () => {
      const responseData = new Blob(["pdf"], { type: "application/pdf" });
      mockPost.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: responseData,
      });
      const resultFile = makeExtractedFile("automated_in.pdf");
      mockCreateResultFile.mockReturnValueOnce(resultFile);

      const formData = new FormData();
      const result = await AutomationFileProcessor.processAutomationSingleFile(
        "/api/v1/tool",
        formData,
        "in.pdf",
      );

      expect(result.success).toBe(true);
      expect(result.files).toEqual([resultFile]);
      expect(result.errors).toEqual([]);
      expect(mockPost).toHaveBeenCalledWith("/api/v1/tool", formData, {
        responseType: "blob",
        timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT,
      });
      expect(mockCreateResultFile).toHaveBeenCalledWith(
        responseData,
        "in.pdf",
        AUTOMATION_CONSTANTS.FILE_PREFIX,
      );
    });

    test("honors explicit responseType and timeout options", async () => {
      mockPost.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: { json: true },
      });
      mockCreateResultFile.mockReturnValueOnce(makeExtractedFile("x.pdf"));

      const formData = new FormData();
      await AutomationFileProcessor.processAutomationSingleFile(
        "/api/v1/tool",
        formData,
        "in.pdf",
        { responseType: "json", timeout: 1234 },
      );

      expect(mockPost).toHaveBeenCalledWith("/api/v1/tool", formData, {
        responseType: "json",
        timeout: 1234,
      });
    });

    test("returns a failure result on non-200 status", async () => {
      mockPost.mockResolvedValueOnce({
        status: 422,
        statusText: "Unprocessable Entity",
        data: null,
      });

      const result = await AutomationFileProcessor.processAutomationSingleFile(
        "/api/v1/tool",
        new FormData(),
        "in.pdf",
      );

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([
        "Automation step failed - HTTP 422: Unprocessable Entity",
      ]);
      expect(mockCreateResultFile).not.toHaveBeenCalled();
    });

    test("reports error.response.data when the request rejects with a response payload", async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: "server detail" },
        message: "ignored when response.data exists",
      });

      const result = await AutomationFileProcessor.processAutomationSingleFile(
        "/api/v1/tool",
        new FormData(),
        "in.pdf",
      );

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual(["Automation step failed: server detail"]);
    });

    test("falls back to error.message when no response payload is present", async () => {
      mockPost.mockRejectedValueOnce(new Error("network down"));

      const result = await AutomationFileProcessor.processAutomationSingleFile(
        "/api/v1/tool",
        new FormData(),
        "in.pdf",
      );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Automation step failed: network down"]);
    });
  });

  describe("processAutomationMultipleFiles", () => {
    test("extracts the ZIP response on HTTP 200", async () => {
      const responseData = new Blob(["zip"], { type: "application/zip" });
      mockPost.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: responseData,
      });
      mockContainsHtml.mockResolvedValueOnce(false);
      const extracted = [makeExtractedFile("p1.pdf")];
      mockExtractAll.mockResolvedValueOnce({
        success: true,
        extractedFiles: extracted,
        errors: [],
      });

      const formData = new FormData();
      const result =
        await AutomationFileProcessor.processAutomationMultipleFiles(
          "/api/v1/tool",
          formData,
        );

      expect(result.success).toBe(true);
      expect(result.files).toEqual(extracted);
      expect(mockPost).toHaveBeenCalledWith("/api/v1/tool", formData, {
        responseType: "blob",
        timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT,
      });
      // createTimestampedFile is wrapped around the response data by the
      // extract step.
      expect(mockCreateTimestampedFile).toHaveBeenCalledWith(
        responseData,
        AUTOMATION_CONSTANTS.RESPONSE_ZIP_PREFIX,
        ".zip",
        "application/zip",
      );
    });

    test("honors explicit options when posting", async () => {
      mockPost.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: new Blob(["zip"], { type: "application/zip" }),
      });
      mockContainsHtml.mockResolvedValueOnce(true);

      await AutomationFileProcessor.processAutomationMultipleFiles(
        "/api/v1/tool",
        new FormData(),
        { responseType: "json", timeout: 999 },
      );

      expect(mockPost).toHaveBeenCalledWith(
        "/api/v1/tool",
        expect.any(FormData),
        { responseType: "json", timeout: 999 },
      );
    });

    test("returns a failure result on non-200 status", async () => {
      mockPost.mockResolvedValueOnce({
        status: 500,
        statusText: "Internal Server Error",
        data: null,
      });

      const result =
        await AutomationFileProcessor.processAutomationMultipleFiles(
          "/api/v1/tool",
          new FormData(),
        );

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.errors).toEqual([
        "Automation step failed - HTTP 500: Internal Server Error",
      ]);
      // Should not have attempted extraction.
      expect(mockContainsHtml).not.toHaveBeenCalled();
    });

    test("returns a failure result when the request rejects", async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: "upstream error" },
        message: "fallback message",
      });

      const result =
        await AutomationFileProcessor.processAutomationMultipleFiles(
          "/api/v1/tool",
          new FormData(),
        );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Automation step failed: upstream error"]);
    });

    test("uses error.message when rejection has no response payload", async () => {
      mockPost.mockRejectedValueOnce(new Error("timeout"));

      const result =
        await AutomationFileProcessor.processAutomationMultipleFiles(
          "/api/v1/tool",
          new FormData(),
        );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Automation step failed: timeout"]);
    });
  });

  describe("buildAutomationFormData", () => {
    const getAll = (fd: FormData, key: string) =>
      fd.getAll(key).map((v) => (v instanceof File ? v.name : v));

    test("appends a single file under the default field name", () => {
      const file = new File(["x"], "single.pdf", { type: "application/pdf" });
      const fd = AutomationFileProcessor.buildAutomationFormData({}, file);

      expect(getAll(fd, "fileInput")).toEqual(["single.pdf"]);
    });

    test("appends multiple files under a custom field name", () => {
      const files = [
        new File(["a"], "a.pdf", { type: "application/pdf" }),
        new File(["b"], "b.pdf", { type: "application/pdf" }),
      ];
      const fd = AutomationFileProcessor.buildAutomationFormData(
        {},
        files,
        "documents",
      );

      expect(getAll(fd, "documents")).toEqual(["a.pdf", "b.pdf"]);
    });

    test("appends scalar parameters and expands array parameters", () => {
      const file = new File(["x"], "single.pdf", { type: "application/pdf" });
      const fd = AutomationFileProcessor.buildAutomationFormData(
        {
          scalar: "value",
          numberish: 42,
          list: ["one", "two"],
        },
        file,
      );

      expect(fd.get("scalar")).toBe("value");
      expect(fd.get("numberish")).toBe("42");
      expect(getAll(fd, "list")).toEqual(["one", "two"]);
    });

    test("skips undefined and null parameter values", () => {
      const file = new File(["x"], "single.pdf", { type: "application/pdf" });
      const fd = AutomationFileProcessor.buildAutomationFormData(
        {
          present: "yes",
          missing: undefined,
          empty: null,
        },
        file,
      );

      expect(fd.has("present")).toBe(true);
      expect(fd.has("missing")).toBe(false);
      expect(fd.has("empty")).toBe(false);
    });

    test("includes falsy-but-defined scalar values like 0 and empty string", () => {
      const file = new File(["x"], "single.pdf", { type: "application/pdf" });
      const fd = AutomationFileProcessor.buildAutomationFormData(
        {
          zero: 0,
          blank: "",
        },
        file,
      );

      expect(fd.get("zero")).toBe("0");
      expect(fd.get("blank")).toBe("");
    });
  });
});
