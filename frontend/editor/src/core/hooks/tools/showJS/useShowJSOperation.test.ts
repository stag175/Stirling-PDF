import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useShowJSOperation } from "@app/hooks/tools/showJS/useShowJSOperation";
import type { ShowJSParameters } from "@app/hooks/tools/showJS/useShowJSParameters";
import type { StirlingFile } from "@app/types/fileContext";

// Mock the axios apiClient (network) for determinism.
vi.mock("@app/services/apiClient", () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock translation so status/error strings are the human-readable fallbacks.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: vi.fn((_key: string, fallback: string) => fallback),
  }),
}));

import apiClient from "@app/services/apiClient";

const mockedPost = vi.mocked(apiClient.post);
const createObjectURL = vi.mocked(global.URL.createObjectURL);
const revokeObjectURL = vi.mocked(global.URL.revokeObjectURL);

const emptyParams: ShowJSParameters = {};

const makeFile = (name = "doc.pdf"): StirlingFile =>
  new File(["%PDF-1.7"], name, { type: "application/pdf" }) as StirlingFile;

describe("useShowJSOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURL.mockReturnValue("blob:mocked-url");
  });

  test("exposes the ToolOperationHook shape with showJS defaults", () => {
    const { result } = renderHook(() => useShowJSOperation());

    expect(result.current.files).toEqual([]);
    expect(result.current.thumbnails).toEqual([]);
    expect(result.current.isGeneratingThumbnails).toBe(false);
    expect(result.current.downloadUrl).toBeNull();
    expect(result.current.downloadFilename).toBe("");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe("");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.scriptText).toBeNull();
    expect(typeof result.current.executeOperation).toBe("function");
    expect(typeof result.current.resetResults).toBe("function");
    expect(typeof result.current.clearError).toBe("function");
    expect(typeof result.current.cancelOperation).toBe("function");
    expect(typeof result.current.undoOperation).toBe("function");
  });

  test("sets an error and skips the request when no files are selected", async () => {
    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, []);
    });

    expect(result.current.errorMessage).toBe("No file loaded");
    expect(mockedPost).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.scriptText).toBeNull();
  });

  test("extracts JavaScript on success and prepares a downloadable .js file", async () => {
    mockedPost.mockResolvedValue({ data: "console.log('hi');" });

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [
        makeFile("report.pdf"),
      ]);
    });

    // FormData posted to the correct endpoint with text responseType.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, formData, config] = mockedPost.mock.calls[0];
    expect(url).toBe("/api/v1/misc/show-javascript");
    expect(config).toEqual({ responseType: "text" });
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("fileInput")).toBeInstanceOf(File);
    expect(((formData as FormData).get("fileInput") as File).name).toBe(
      "report.pdf",
    );

    // Script text + downloadable file.
    expect(result.current.scriptText).toBe("console.log('hi');");
    expect(result.current.files).toHaveLength(1);
    const outFile = result.current.files[0];
    expect(outFile.name).toBe("report.js");
    expect(outFile.type).toBe("application/javascript");

    // Object URL lifecycle.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(outFile);
    expect(result.current.downloadUrl).toBe("blob:mocked-url");
    expect(result.current.downloadFilename).toBe("report.js");

    expect(result.current.status).toBe("JavaScript extracted");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("coerces a non-string response body to an empty script", async () => {
    mockedPost.mockResolvedValue({ data: { unexpected: "object" } });

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile("a.pdf")]);
    });

    expect(result.current.scriptText).toBe("");
    expect(result.current.files[0].name).toBe("a.js");
  });

  test("falls back to 'extracted.js' when the filename has no extension", async () => {
    mockedPost.mockResolvedValue({ data: "var x = 1;" });

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      // A name without a dotted extension hits the `|| "extracted"` branch.
      await result.current.executeOperation(emptyParams, [makeFile("noext")]);
    });

    expect(result.current.files[0].name).toBe("noext.js");
  });

  test("surfaces a server response string via extractErrorMessage on failure", async () => {
    mockedPost.mockRejectedValue({
      response: { data: "Backend rejected the upload" },
    });

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile()]);
    });

    expect(result.current.errorMessage).toBe("Backend rejected the upload");
    expect(result.current.status).toBe("");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.scriptText).toBeNull();
    expect(result.current.downloadUrl).toBeNull();
  });

  test("falls back to error.message when there is no response data", async () => {
    mockedPost.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile()]);
    });

    expect(result.current.errorMessage).toBe("Network down");
  });

  test("revokes the previous object URL when executing twice", async () => {
    mockedPost.mockResolvedValue({ data: "a();" });
    createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile("one.pdf")]);
    });
    expect(result.current.downloadUrl).toBe("blob:first");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile("two.pdf")]);
    });

    // The second run cleans up the first blob URL before creating a new one.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(result.current.downloadUrl).toBe("blob:second");
    expect(result.current.downloadFilename).toBe("two.js");
  });

  test("resetResults clears state and revokes the active object URL", async () => {
    mockedPost.mockResolvedValue({ data: "b();" });

    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, [makeFile("c.pdf")]);
    });
    expect(result.current.scriptText).toBe("b();");

    act(() => {
      result.current.resetResults();
    });

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mocked-url");
    expect(result.current.scriptText).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.downloadUrl).toBeNull();
    expect(result.current.downloadFilename).toBe("");
    expect(result.current.status).toBe("");
    expect(result.current.errorMessage).toBeNull();
  });

  test("resetResults is a no-op for cleanup when no object URL exists", () => {
    const { result } = renderHook(() => useShowJSOperation());

    act(() => {
      result.current.resetResults();
    });

    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(result.current.scriptText).toBeNull();
  });

  test("clearError clears only the error message", async () => {
    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.executeOperation(emptyParams, []);
    });
    expect(result.current.errorMessage).toBe("No file loaded");

    act(() => {
      result.current.clearError();
    });
    expect(result.current.errorMessage).toBeNull();
  });

  test("cancelOperation stops loading and reports cancellation", () => {
    const { result } = renderHook(() => useShowJSOperation());

    act(() => {
      result.current.cancelOperation();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe("Operation cancelled");
  });

  test("undoOperation reports nothing to undo", async () => {
    const { result } = renderHook(() => useShowJSOperation());

    await act(async () => {
      await result.current.undoOperation();
    });

    expect(result.current.status).toBe("Nothing to undo");
  });
});
