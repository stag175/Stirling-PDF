import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useToolState,
  type OperationState,
  type ProcessingProgress,
} from "@app/hooks/tools/shared/useToolState";

/**
 * The module exports only the `useToolState` hook (the reducer and its action
 * union are private), so every state transition is exercised through the hook
 * via renderHook + act. This drives every branch of the internal
 * operationReducer plus all the useCallback-wrapped action creators.
 */

// Build a deterministic File without touching disk or the network.
function makeFile(name: string): File {
  return new File(["dummy-bytes"], name, { type: "application/pdf" });
}

// The expected pristine initial state, used to assert resets/defaults.
const expectedInitialState: OperationState = {
  files: [],
  thumbnails: [],
  isGeneratingThumbnails: false,
  downloadUrl: null,
  downloadFilename: "",
  downloadLocalPath: null,
  outputFileIds: null,
  isLoading: false,
  status: "",
  errorMessage: null,
  progress: null,
};

describe("useToolState", () => {
  beforeEach(() => {
    // setThumbnails emits a console.log; silence it for clean, deterministic output.
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("initializes with the pristine operation state", () => {
    const { result } = renderHook(() => useToolState());

    expect(result.current.state).toEqual(expectedInitialState);
  });

  test("exposes a stable set of action creators that persist across renders", () => {
    const { result, rerender } = renderHook(() => useToolState());

    const firstActions = result.current.actions;
    expect(Object.keys(firstActions).sort()).toEqual(
      [
        "clearError",
        "resetResults",
        "setDownloadInfo",
        "setError",
        "setFiles",
        "setGeneratingThumbnails",
        "setLoading",
        "setProgress",
        "setStatus",
        "setThumbnails",
      ].sort(),
    );

    rerender();

    // useCallback memoizes every action creator with an empty dep array.
    expect(result.current.actions.setLoading).toBe(firstActions.setLoading);
    expect(result.current.actions.setFiles).toBe(firstActions.setFiles);
    expect(result.current.actions.setThumbnails).toBe(
      firstActions.setThumbnails,
    );
    expect(result.current.actions.setGeneratingThumbnails).toBe(
      firstActions.setGeneratingThumbnails,
    );
    expect(result.current.actions.setDownloadInfo).toBe(
      firstActions.setDownloadInfo,
    );
    expect(result.current.actions.setStatus).toBe(firstActions.setStatus);
    expect(result.current.actions.setError).toBe(firstActions.setError);
    expect(result.current.actions.setProgress).toBe(firstActions.setProgress);
    expect(result.current.actions.resetResults).toBe(firstActions.resetResults);
    expect(result.current.actions.clearError).toBe(firstActions.clearError);
  });

  test("SET_LOADING toggles isLoading both true and false", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setLoading(true));
    expect(result.current.state.isLoading).toBe(true);

    act(() => result.current.actions.setLoading(false));
    expect(result.current.state.isLoading).toBe(false);
  });

  test("SET_FILES stores the provided files array", () => {
    const { result } = renderHook(() => useToolState());
    const files = [makeFile("a.pdf"), makeFile("b.pdf")];

    act(() => result.current.actions.setFiles(files));

    expect(result.current.state.files).toBe(files);
    expect(result.current.state.files).toHaveLength(2);
    expect(result.current.state.files[0].name).toBe("a.pdf");
  });

  test("SET_FILES accepts an empty array", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setFiles([makeFile("x.pdf")]));
    act(() => result.current.actions.setFiles([]));

    expect(result.current.state.files).toEqual([]);
  });

  test("SET_THUMBNAILS stores thumbnails and logs a diagnostic line", () => {
    const logSpy = vi.spyOn(console, "log");
    const { result } = renderHook(() => useToolState());
    const thumbs = [
      "data:image/png;base64,AAA",
      "",
      "data:image/png;base64,BBB",
    ];

    act(() => result.current.actions.setThumbnails(thumbs));

    expect(result.current.state.thumbnails).toBe(thumbs);
    // The log call exercises the present/missing mapping branch over each entry.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message, mapped] = logSpy.mock.calls[0];
    expect(message).toContain("Setting 3 thumbnails");
    expect(mapped).toEqual(["[0]: PRESENT", "[1]: MISSING", "[2]: PRESENT"]);
  });

  test("SET_THUMBNAILS handles an empty thumbnails array", () => {
    const logSpy = vi.spyOn(console, "log");
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setThumbnails([]));

    expect(result.current.state.thumbnails).toEqual([]);
    expect(logSpy.mock.calls[0][0]).toContain("Setting 0 thumbnails");
    expect(logSpy.mock.calls[0][1]).toEqual([]);
  });

  test("SET_GENERATING_THUMBNAILS toggles the flag", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setGeneratingThumbnails(true));
    expect(result.current.state.isGeneratingThumbnails).toBe(true);

    act(() => result.current.actions.setGeneratingThumbnails(false));
    expect(result.current.state.isGeneratingThumbnails).toBe(false);
  });

  test("SET_DOWNLOAD_INFO with all fields populates every download field", () => {
    const { result } = renderHook(() => useToolState());

    act(() =>
      result.current.actions.setDownloadInfo(
        "blob:http://x/123",
        "result.pdf",
        "/tmp/result.pdf",
        ["file-1", "file-2"],
      ),
    );

    expect(result.current.state.downloadUrl).toBe("blob:http://x/123");
    expect(result.current.state.downloadFilename).toBe("result.pdf");
    expect(result.current.state.downloadLocalPath).toBe("/tmp/result.pdf");
    expect(result.current.state.outputFileIds).toEqual(["file-1", "file-2"]);
  });

  test("SET_DOWNLOAD_INFO defaults localPath and outputFileIds to null when omitted", () => {
    const { result } = renderHook(() => useToolState());

    // Omitting the optional args exercises the `?? null` fallback branches.
    act(() => result.current.actions.setDownloadInfo(null, ""));

    expect(result.current.state.downloadUrl).toBeNull();
    expect(result.current.state.downloadFilename).toBe("");
    expect(result.current.state.downloadLocalPath).toBeNull();
    expect(result.current.state.outputFileIds).toBeNull();
  });

  test("SET_DOWNLOAD_INFO coerces explicit null optionals to null", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setDownloadInfo("u", "f.pdf", null, null));

    expect(result.current.state.downloadLocalPath).toBeNull();
    expect(result.current.state.outputFileIds).toBeNull();
  });

  test("SET_STATUS stores the status string", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setStatus("processing"));

    expect(result.current.state.status).toBe("processing");
  });

  test("SET_ERROR stores an error message and can clear it back to null", () => {
    const { result } = renderHook(() => useToolState());

    act(() => result.current.actions.setError("boom"));
    expect(result.current.state.errorMessage).toBe("boom");

    act(() => result.current.actions.setError(null));
    expect(result.current.state.errorMessage).toBeNull();
  });

  test("SET_PROGRESS stores progress and accepts null", () => {
    const { result } = renderHook(() => useToolState());
    const progress: ProcessingProgress = {
      current: 2,
      total: 5,
      currentFileName: "page-2.pdf",
    };

    act(() => result.current.actions.setProgress(progress));
    expect(result.current.state.progress).toEqual(progress);

    act(() => result.current.actions.setProgress(null));
    expect(result.current.state.progress).toBeNull();
  });

  test("CLEAR_ERROR resets only the error message, leaving other fields intact", () => {
    const { result } = renderHook(() => useToolState());

    act(() => {
      result.current.actions.setError("failed");
      result.current.actions.setStatus("done");
    });
    expect(result.current.state.errorMessage).toBe("failed");

    act(() => result.current.actions.clearError());

    expect(result.current.state.errorMessage).toBeNull();
    expect(result.current.state.status).toBe("done");
  });

  test("RESET_RESULTS restores defaults while preserving isLoading=true", () => {
    const { result } = renderHook(() => useToolState());

    act(() => {
      result.current.actions.setFiles([makeFile("keep.pdf")]);
      result.current.actions.setThumbnails(["data:img"]);
      result.current.actions.setDownloadInfo("u", "f.pdf", "/p", ["id"]);
      result.current.actions.setStatus("working");
      result.current.actions.setError("nope");
      result.current.actions.setProgress({ current: 1, total: 1 });
      result.current.actions.setLoading(true);
    });

    act(() => result.current.actions.resetResults());

    // Loading must survive the reset; everything else returns to initial.
    expect(result.current.state).toEqual({
      ...expectedInitialState,
      isLoading: true,
    });
  });

  test("RESET_RESULTS preserves isLoading=false", () => {
    const { result } = renderHook(() => useToolState());

    act(() => {
      result.current.actions.setStatus("working");
      result.current.actions.setLoading(false);
    });

    act(() => result.current.actions.resetResults());

    expect(result.current.state).toEqual(expectedInitialState);
    expect(result.current.state.isLoading).toBe(false);
  });

  test("sequential dispatches accumulate independent slices of state", () => {
    const { result } = renderHook(() => useToolState());
    const files = [makeFile("seq.pdf")];

    act(() => {
      result.current.actions.setLoading(true);
      result.current.actions.setFiles(files);
      result.current.actions.setStatus("running");
      result.current.actions.setProgress({ current: 3, total: 10 });
    });

    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.files).toBe(files);
    expect(result.current.state.status).toBe("running");
    expect(result.current.state.progress).toEqual({ current: 3, total: 10 });
    expect(result.current.state.errorMessage).toBeNull();
  });
});
