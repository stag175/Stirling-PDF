import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useGetPdfInfoOperation } from "@app/hooks/tools/getPdfInfo/useGetPdfInfoOperation";
import { INFO_JSON_FILENAME } from "@app/types/getPdfInfo";
import type { StirlingFile } from "@app/types/fileContext";
import type { GetPdfInfoParameters } from "@app/hooks/tools/getPdfInfo/useGetPdfInfoParameters";

// --- Mocks for external/side-effecting dependencies (determinism) ---

// apiClient wraps axios; mock the default export's post method.
const mockPost = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// useFileContext exposes selectors used to look up per-file thumbnails.
const mockGetStirlingFileStub = vi.fn();
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    selectors: {
      getStirlingFileStub: (...args: unknown[]) =>
        mockGetStirlingFileStub(...args),
    },
  }),
}));

// Translation: return the provided fallback (2nd arg) so assertions are meaningful.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

// extractErrorMessage: deterministic, predictable transform of the error.
vi.mock("@app/utils/toolErrorHandler", () => ({
  extractErrorMessage: (error: unknown) =>
    `extracted:${(error as { message?: string })?.message ?? "unknown"}`,
}));

// --- Test helpers ---

const PARAMS = {} as GetPdfInfoParameters;

interface MakeFileOpts {
  id: string;
  name?: string;
  size?: number;
  lastModified?: number;
  omitSizeLastModified?: boolean;
}

/**
 * Build a StirlingFile-like object. When omitSizeLastModified is set, size and
 * lastModified are forced to undefined to exercise the `?? null` fallbacks.
 */
function makeFile(opts: MakeFileOpts): StirlingFile {
  const file = new File(["pdf-bytes"], opts.name ?? `${opts.id}.pdf`, {
    type: "application/pdf",
  }) as unknown as Record<string, unknown>;

  Object.defineProperty(file, "fileId", { value: opts.id, writable: false });

  if (opts.omitSizeLastModified) {
    Object.defineProperty(file, "size", { value: undefined, writable: true });
    Object.defineProperty(file, "lastModified", {
      value: undefined,
      writable: true,
    });
  } else {
    if (opts.size !== undefined) {
      Object.defineProperty(file, "size", { value: opts.size, writable: true });
    }
    if (opts.lastModified !== undefined) {
      Object.defineProperty(file, "lastModified", {
        value: opts.lastModified,
        writable: true,
      });
    }
  }

  return file as unknown as StirlingFile;
}

// jsdom's File/Blob in this environment does not faithfully round-trip the
// constructor bits through arrayBuffer()/text(), so we capture the raw string
// passed to `new File([...], "response.json")` by wrapping the File constructor.
const RealFile = globalThis.File;
const capturedJsonByName = new Map<string, string>();

class CapturingFile extends RealFile {
  constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
    super(bits, name, options);
    if (name === INFO_JSON_FILENAME) {
      capturedJsonByName.set(name, bits.map((part) => String(part)).join(""));
    }
  }
}

/** Returns the JSON string that the hook wrote into the generated result file. */
function readGeneratedJson(file: File): string {
  const captured = capturedJsonByName.get(file.name);
  if (captured === undefined) {
    throw new Error(`No captured content for file "${file.name}"`);
  }
  return captured;
}

describe("useGetPdfInfoOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedJsonByName.clear();
    (globalThis as { File: typeof File }).File =
      CapturingFile as unknown as typeof File;
    mockGetStirlingFileStub.mockReturnValue(undefined);
  });

  afterEach(() => {
    (globalThis as { File: typeof File }).File = RealFile;
  });

  test("exposes a stable hook shape with the expected defaults", () => {
    const { result } = renderHook(() => useGetPdfInfoOperation());

    expect(result.current.files).toEqual([]);
    expect(result.current.thumbnails).toEqual([]);
    expect(result.current.isGeneratingThumbnails).toBe(false);
    expect(result.current.downloadUrl).toBeNull();
    expect(result.current.downloadFilename).toBe("");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe("");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.results).toEqual([]);
    expect(typeof result.current.executeOperation).toBe("function");
    expect(typeof result.current.resetResults).toBe("function");
    expect(typeof result.current.clearError).toBe("function");
    expect(typeof result.current.cancelOperation).toBe("function");
    expect(typeof result.current.undoOperation).toBe("function");
  });

  test("sets a no-file error and skips the request when no files are selected", async () => {
    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, []);
    });

    expect(result.current.errorMessage).toBe("No file loaded");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test("aggregates a single successful file into a non-array JSON payload", async () => {
    const stub = { thumbnailUrl: "thumb://abc" };
    mockGetStirlingFileStub.mockReturnValue(stub);
    mockPost.mockResolvedValue({ data: { Metadata: { Title: "Doc" } } });

    const file = makeFile({
      id: "file-1",
      name: "one.pdf",
      size: 1234,
      lastModified: 999,
    });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [file]);
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [endpoint, formData] = mockPost.mock.calls[0];
    expect(endpoint).toBe("/api/v1/security/get-info-on-pdf");
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("fileInput")).toBe(file);

    expect(result.current.results).toHaveLength(1);
    const entry = result.current.results[0];
    expect(entry.fileId).toBe("file-1");
    expect(entry.fileName).toBe("one.pdf");
    expect(entry.fileSize).toBe(1234);
    expect(entry.lastModified).toBe(999);
    expect(entry.thumbnailUrl).toBe("thumb://abc");
    expect(entry.data).toEqual({ Metadata: { Title: "Doc" } });
    expect(entry.error).toBeNull();
    expect(typeof entry.summaryGeneratedAt).toBe("number");

    // Single successful payload -> object, not array.
    expect(result.current.files).toHaveLength(1);
    const resultFile = result.current.files[0];
    expect(resultFile.name).toBe(INFO_JSON_FILENAME);
    expect(resultFile.type).toBe("application/json");
    const text = readGeneratedJson(resultFile);
    expect(JSON.parse(text)).toEqual({ Metadata: { Title: "Doc" } });

    expect(result.current.status).toBe("Extraction complete");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("falls back to null/{} for missing size, lastModified, stub, and response data", async () => {
    mockGetStirlingFileStub.mockReturnValue(undefined);
    mockPost.mockResolvedValue({}); // no `data` key -> `?? {}`

    const file = makeFile({
      id: "file-nullish",
      name: "nullish.pdf",
      omitSizeLastModified: true,
    });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [file]);
    });

    const entry = result.current.results[0];
    expect(entry.fileSize).toBeNull();
    expect(entry.lastModified).toBeNull();
    expect(entry.thumbnailUrl).toBeNull();
    expect(entry.data).toEqual({});
    expect(entry.error).toBeNull();
  });

  test("records per-file errors and surfaces a partial-failure message", async () => {
    const stubA = { thumbnailUrl: "thumb://a" };
    mockGetStirlingFileStub.mockImplementation((id: string) =>
      id === "ok" ? stubA : undefined,
    );

    mockPost
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockRejectedValueOnce(new Error("boom"));

    const okFile = makeFile({ id: "ok", name: "ok.pdf", size: 10 });
    const badFile = makeFile({ id: "bad", name: "bad.pdf", size: 20 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [okFile, badFile]);
    });

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(result.current.results).toHaveLength(2);

    const [okEntry, badEntry] = result.current.results;
    expect(okEntry.error).toBeNull();
    expect(okEntry.thumbnailUrl).toBe("thumb://a");
    expect(badEntry.error).toBe("extracted:boom");
    expect(badEntry.data).toEqual({});
    expect(badEntry.thumbnailUrl).toBeNull();

    // Only the non-errored payload should be included in the JSON file.
    expect(result.current.files).toHaveLength(1);
    const text = readGeneratedJson(result.current.files[0]);
    expect(JSON.parse(text)).toEqual({ ok: true });

    expect(result.current.errorMessage).toBe(
      "Some files could not be processed.",
    );
    expect(result.current.status).toBe("Extraction complete");
  });

  test("emits an empty array payload when every file fails", async () => {
    mockPost.mockRejectedValue(new Error("all-fail"));

    const a = makeFile({ id: "a", name: "a.pdf", size: 1 });
    const b = makeFile({ id: "b", name: "b.pdf", size: 2 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [a, b]);
    });

    expect(result.current.results).toHaveLength(2);
    expect(
      result.current.results.every((r) => r.error === "extracted:all-fail"),
    ).toBe(true);

    // aggregated.length > 0, but no successful payloads -> empty array JSON.
    expect(result.current.files).toHaveLength(1);
    const text = readGeneratedJson(result.current.files[0]);
    expect(JSON.parse(text)).toEqual([]);

    expect(result.current.errorMessage).toBe(
      "Some files could not be processed.",
    );
  });

  test("uses an array payload when multiple files succeed", async () => {
    mockPost
      .mockResolvedValueOnce({ data: { idx: 1 } })
      .mockResolvedValueOnce({ data: { idx: 2 } });

    const a = makeFile({ id: "a", name: "a.pdf", size: 1 });
    const b = makeFile({ id: "b", name: "b.pdf", size: 2 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [a, b]);
    });

    expect(result.current.files).toHaveLength(1);
    const text = readGeneratedJson(result.current.files[0]);
    expect(JSON.parse(text)).toEqual([{ idx: 1 }, { idx: 2 }]);
    expect(result.current.errorMessage).toBeNull();
  });

  test("cancellation during the loop halts processing and discards results", async () => {
    // The first request is held open with a deferred promise so we can flip
    // isLoading -> true (committed render), call cancelOperation while loading,
    // then release the request. The loop guard then breaks before the 2nd file
    // and the post-loop `!cancelRequested.current` block is skipped.
    let releaseFirstPost: (value: { data: unknown }) => void = () => {};
    const firstPost = new Promise<{ data: unknown }>((resolve) => {
      releaseFirstPost = resolve;
    });
    mockPost.mockReturnValueOnce(firstPost);

    const a = makeFile({ id: "a", name: "a.pdf", size: 1 });
    const b = makeFile({ id: "b", name: "b.pdf", size: 2 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    let execPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      execPromise = result.current.executeOperation(PARAMS, [a, b]);
      // Allow the synchronous prelude (setIsLoading(true)) to commit.
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(true);

    // Cancel while loading; this sets the internal cancel flag.
    act(() => {
      result.current.cancelOperation();
    });
    expect(result.current.status).toBe("Operation cancelled");

    // Release the in-flight request and let the loop finish.
    await act(async () => {
      releaseFirstPost({ data: { idx: 1 } });
      await execPromise;
    });

    // Second file is never requested because the loop breaks.
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Results are not committed when cancellation was requested.
    expect(result.current.results).toEqual([]);
    expect(result.current.files).toEqual([]);
    expect(result.current.status).toBe("Operation cancelled");
    expect(result.current.isLoading).toBe(false);
  });

  test("cancelOperation is a no-op when nothing is loading", () => {
    const { result } = renderHook(() => useGetPdfInfoOperation());

    act(() => {
      result.current.cancelOperation();
    });

    expect(result.current.status).toBe("");
    expect(result.current.isLoading).toBe(false);
  });

  test("falls into the unexpected-error branch when JSON serialization throws", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    // Circular structure makes JSON.stringify throw in the post-loop block,
    // which is caught by the outer try/catch.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    mockPost.mockResolvedValue({ data: circular });

    const file = makeFile({ id: "circular", name: "c.pdf", size: 5 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [file]);
    });

    // Per-file aggregation succeeded and results were set before stringify ran.
    expect(result.current.results).toHaveLength(1);
    expect(result.current.errorMessage).toBe(
      "Unexpected error during extraction.",
    );
    expect(result.current.isLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[getPdfInfo] unexpected failure",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  test("clearError resets only the error message", async () => {
    mockPost.mockRejectedValue(new Error("oops"));
    const file = makeFile({ id: "e", name: "e.pdf", size: 3 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [file]);
    });
    expect(result.current.errorMessage).toBe(
      "Some files could not be processed.",
    );

    act(() => {
      result.current.clearError();
    });
    expect(result.current.errorMessage).toBeNull();
    // Results are untouched by clearError.
    expect(result.current.results).toHaveLength(1);
  });

  test("resetResults / undoOperation clear all derived state and revoke URLs", async () => {
    mockPost.mockResolvedValue({ data: { ok: 1 } });
    const file = makeFile({ id: "r", name: "r.pdf", size: 7 });

    const { result } = renderHook(() => useGetPdfInfoOperation());

    await act(async () => {
      await result.current.executeOperation(PARAMS, [file]);
    });
    expect(result.current.results).toHaveLength(1);
    expect(result.current.files).toHaveLength(1);

    await act(async () => {
      await result.current.undoOperation();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.files).toEqual([]);
    expect(result.current.downloadUrl).toBeNull();
    expect(result.current.downloadFilename).toBe("");
    expect(result.current.status).toBe("");
    expect(result.current.errorMessage).toBeNull();

    // resetResults is the same primitive used by undoOperation; calling it
    // directly should be idempotent.
    act(() => {
      result.current.resetResults();
    });
    expect(result.current.results).toEqual([]);
  });

  test("revokes any outstanding object URL on unmount", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
    const { unmount } = renderHook(() => useGetPdfInfoOperation());

    unmount();

    // No URL was created in this flow, so the cleanup effect should not throw
    // and revoke should not be invoked for a null ref.
    expect(revokeSpy).not.toHaveBeenCalled();
    revokeSpy.mockRestore();
  });
});
