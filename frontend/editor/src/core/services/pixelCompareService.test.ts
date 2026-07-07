/**
 * Unit tests for the pixel-compare orchestration service.
 *
 * The module under test imports the real pixel-compare Web Worker via
 * `@app/workers/pixelCompareWorker?worker`. That module transitively loads the
 * heavy pdf.js legacy build and instantiates a Worker, so we replace it with a
 * fully controllable fake. The fake captures the `message`/`error` listeners
 * that `runPixelCompare` registers, letting each test synchronously drive the
 * worker's response stream and exercise every branch of the message handler.
 *
 * `setupTests.ts` globally stubs `URL.createObjectURL` to a constant string and
 * `URL.revokeObjectURL` to a no-op. We re-stub both per test so emitted object
 * URLs are distinct and revocation calls are observable.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Controllable fake Worker. The real `?worker` import resolves to a default
// export that is `new () => Worker`; the fake mirrors that shape and records
// every constructed instance plus the listeners it registers.
//
// Defined inside `vi.hoisted` because the `vi.mock` factory below is hoisted to
// the top of the module and must be able to reference the class.
// ---------------------------------------------------------------------------
type Listener = (event: unknown) => void;

interface FakeWorkerInstance {
  messageListeners: Listener[];
  errorListeners: Listener[];
  postedMessages: unknown[];
  terminateCalls: number;
  terminateShouldThrow: boolean;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  postMessage(message: unknown): void;
  terminate(): void;
  emitMessage(data: unknown): void;
  emitError(event: unknown): void;
}

const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];

    messageListeners: Listener[] = [];
    errorListeners: Listener[] = [];
    postedMessages: unknown[] = [];
    terminateCalls = 0;
    terminateShouldThrow = false;

    constructor() {
      FakeWorker.instances.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
      if (type === "message") this.messageListeners.push(listener);
      else if (type === "error") this.errorListeners.push(listener);
    }

    removeEventListener(type: string, listener: Listener): void {
      if (type === "message") {
        this.messageListeners = this.messageListeners.filter(
          (l) => l !== listener,
        );
      } else if (type === "error") {
        this.errorListeners = this.errorListeners.filter((l) => l !== listener);
      }
    }

    postMessage(message: unknown): void {
      this.postedMessages.push(message);
    }

    terminate(): void {
      this.terminateCalls += 1;
      if (this.terminateShouldThrow) throw new Error("terminate boom");
    }

    // Test helpers --------------------------------------------------------
    emitMessage(data: unknown): void {
      // Snapshot the listener list: handlers may detach via removeEventListener.
      for (const listener of [...this.messageListeners]) listener({ data });
    }

    emitError(event: unknown): void {
      for (const listener of [...this.errorListeners]) listener(event);
    }
  }
  return { FakeWorker };
});

vi.mock("@app/workers/pixelCompareWorker?worker", () => ({
  default: FakeWorker,
}));

import {
  revokePixelResult,
  runPixelCompare,
} from "@app/services/pixelCompareService";
import type {
  ComparePixelPageResult,
  CompareResultPixelData,
  PixelCompareWorkerErrors,
  PixelCompareWorkerPagePayload,
  PixelCompareWorkerWarnings,
} from "@app/types/compare";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const warnings: PixelCompareWorkerWarnings = {
  pageCountMismatch: "mismatch",
  noPages: "no-pages",
};
const errors: PixelCompareWorkerErrors = {
  canvasContextUnavailable: "no-canvas",
};

const makeFile = (name: string): File =>
  new File(["%PDF-1.7 mock"], name, { type: "application/pdf" });

const baseArgs = () => ({
  baseFile: makeFile("base.pdf"),
  comparisonFile: makeFile("comparison.pdf"),
  baseFileId: "base-id",
  comparisonFileId: "comp-id",
  dpi: 150,
  threshold: 0.1,
  warnings,
  errors,
});

const makePagePayload = (
  pageNumber: number,
  overrides: Partial<PixelCompareWorkerPagePayload> = {},
): PixelCompareWorkerPagePayload => ({
  pageNumber,
  width: 100,
  height: 200,
  baseBlob: new Blob(["base"]),
  comparisonBlob: new Blob(["comp"]),
  diffBlob: new Blob(["diff"]),
  diffPixels: 10,
  totalPixels: 1000,
  diffRatio: 0.01,
  sizeMismatch: false,
  ...overrides,
});

const latestWorker = (): FakeWorkerInstance => {
  const w = FakeWorker.instances.at(-1);
  if (!w) throw new Error("no worker instantiated");
  return w;
};

// Distinct, incrementing object URLs so per-call revocation is observable.
let urlCounter = 0;
let createSpy: ReturnType<typeof vi.fn>;
let revokeSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeWorker.instances = [];
  urlCounter = 0;
  createSpy = vi.fn(() => `blob:mock/${urlCounter++}`);
  revokeSpy = vi.fn();
  global.URL.createObjectURL =
    createSpy as unknown as typeof URL.createObjectURL;
  global.URL.revokeObjectURL =
    revokeSpy as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// revokePixelResult
// ---------------------------------------------------------------------------
describe("revokePixelResult", () => {
  const pageWithUrls = (n: number): ComparePixelPageResult => ({
    pageNumber: n,
    width: 1,
    height: 1,
    baseImageUrl: `base-${n}`,
    comparisonImageUrl: `comp-${n}`,
    diffImageUrl: `diff-${n}`,
    diffPixels: 0,
    totalPixels: 0,
    diffRatio: 0,
    sizeMismatch: false,
  });

  test("returns early without revoking when result is null", () => {
    revokePixelResult(null);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test("returns early without revoking when result is undefined", () => {
    revokePixelResult(undefined);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test("revokes every image url on every page", () => {
    const result = {
      pages: [pageWithUrls(1), pageWithUrls(2)],
    } as unknown as CompareResultPixelData;

    revokePixelResult(result);

    expect(revokeSpy).toHaveBeenCalledTimes(6);
    expect(revokeSpy.mock.calls.map((c) => c[0])).toEqual([
      "base-1",
      "comp-1",
      "diff-1",
      "base-2",
      "comp-2",
      "diff-2",
    ]);
  });

  test("does nothing for a result with no pages", () => {
    revokePixelResult({
      pages: [],
    } as unknown as CompareResultPixelData);
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runPixelCompare
// ---------------------------------------------------------------------------
describe("runPixelCompare", () => {
  test("rejects immediately when the signal is already cancelled (no worker created)", async () => {
    await expect(
      runPixelCompare({ ...baseArgs(), signal: { cancelled: true } }),
    ).rejects.toThrow("CANCELLED");
    expect(FakeWorker.instances).toHaveLength(0);
  });

  test("posts a fully-populated request with default diff colours", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    expect(worker.postedMessages).toHaveLength(1);
    const request = worker.postedMessages[0] as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(request.type).toBe("pixel-compare");
    expect(request.payload.dpi).toBe(150);
    expect(request.payload.threshold).toBe(0.1);
    expect(request.payload.concurrency).toBeUndefined();
    expect(request.payload.warnings).toBe(warnings);
    expect(request.payload.errors).toBe(errors);
    // Defaults come from hexToRgb(REMOVAL_HIGHLIGHT="#FF3B30") and
    // hexToRgb(ADDITION_HIGHLIGHT="#34C759").
    expect(request.payload.diffColor).toEqual([0xff, 0x3b, 0x30]);
    expect(request.payload.diffColorAlt).toEqual([0x34, 0xc7, 0x59]);

    // Resolve so the promise settles and the worker is cleaned up.
    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("forwards concurrency and overridden diff colours into the request", async () => {
    const promise = runPixelCompare({
      ...baseArgs(),
      concurrency: 4,
      diffColor: [1, 2, 3],
      diffColorAlt: [4, 5, 6],
    });
    const worker = latestWorker();
    const request = worker.postedMessages[0] as {
      payload: Record<string, unknown>;
    };
    expect(request.payload.concurrency).toBe(4);
    expect(request.payload.diffColor).toEqual([1, 2, 3]);
    expect(request.payload.diffColorAlt).toEqual([4, 5, 6]);

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("ignores a falsy message payload", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    // Falsy data hits the early `if (!message) return;` guard.
    worker.emitMessage(null);
    worker.emitMessage(undefined);
    expect(worker.terminateCalls).toBe(0);

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("forwards progress callbacks", async () => {
    const onProgress = vi.fn();
    const promise = runPixelCompare({ ...baseArgs(), onProgress });
    const worker = latestWorker();

    worker.emitMessage({ type: "progress", pageNumber: 2, totalPages: 5 });
    expect(onProgress).toHaveBeenCalledWith(2, 5);

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("handles a progress message even with no onProgress callback", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    // optional-chaining branch: onProgress is undefined.
    expect(() =>
      worker.emitMessage({ type: "progress", pageNumber: 1, totalPages: 1 }),
    ).not.toThrow();

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("converts page payloads into results, creates object urls, and fires onPageReady", async () => {
    const onPageReady = vi.fn();
    const promise = runPixelCompare({ ...baseArgs(), onPageReady });
    const worker = latestWorker();

    worker.emitMessage({ type: "page", page: makePagePayload(1) });

    // Three object URLs created for base/comparison/diff blobs.
    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(onPageReady).toHaveBeenCalledTimes(1);
    const page = onPageReady.mock.calls[0][0] as ComparePixelPageResult;
    expect(page.pageNumber).toBe(1);
    expect(page.baseImageUrl).toBe("blob:mock/0");
    expect(page.comparisonImageUrl).toBe("blob:mock/1");
    expect(page.diffImageUrl).toBe("blob:mock/2");
    expect(page.diffPixels).toBe(10);
    // Neither missing flag was set, so they must be absent (not false).
    expect("missingBase" in page).toBe(false);
    expect("missingComparison" in page).toBe(false);

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("sets missingBase / missingComparison flags when the payload declares them", async () => {
    const onPageReady = vi.fn();
    const promise = runPixelCompare({ ...baseArgs(), onPageReady });
    const worker = latestWorker();

    worker.emitMessage({
      type: "page",
      page: makePagePayload(1, { missingBase: true }),
    });
    worker.emitMessage({
      type: "page",
      page: makePagePayload(2, { missingComparison: true, sizeMismatch: true }),
    });

    const first = onPageReady.mock.calls[0][0] as ComparePixelPageResult;
    const second = onPageReady.mock.calls[1][0] as ComparePixelPageResult;
    expect(first.missingBase).toBe(true);
    expect("missingComparison" in first).toBe(false);
    expect(second.missingComparison).toBe(true);
    expect(second.sizeMismatch).toBe(true);
    expect("missingBase" in second).toBe(false);

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("does not throw when a page arrives with no onPageReady callback", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    expect(() =>
      worker.emitMessage({ type: "page", page: makePagePayload(1) }),
    ).not.toThrow();

    worker.emitMessage({
      type: "success",
      totals: emptyTotals(),
      warnings: [],
    });
    await promise;
  });

  test("resolves with a sorted, fully-assembled result on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));

    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    // Deliver pages out of order to verify the success handler sorts them.
    worker.emitMessage({ type: "page", page: makePagePayload(3) });
    worker.emitMessage({ type: "page", page: makePagePayload(1) });
    worker.emitMessage({ type: "page", page: makePagePayload(2) });

    const totals = {
      diffPixels: 30,
      totalPixels: 3000,
      diffRatio: 0.01,
      pagesWithChanges: 3,
      durationMs: 42,
    };
    worker.emitMessage({ type: "success", totals, warnings: ["w1"] });

    const result = await promise;

    expect(result.mode).toBe("pixel");
    expect(result.base).toEqual({ fileId: "base-id", fileName: "base.pdf" });
    expect(result.comparison).toEqual({
      fileId: "comp-id",
      fileName: "comparison.pdf",
    });
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(result.totals).toEqual({
      ...totals,
      processedAt: Date.parse("2026-06-01T00:00:00.000Z"),
    });
    expect(result.warnings).toEqual(["w1"]);
    expect(result.settings).toEqual({ dpi: 150, threshold: 0.1 });

    // Worker listeners were detached and the worker terminated on success.
    expect(worker.terminateCalls).toBe(1);
    expect(worker.messageListeners).toHaveLength(0);
    expect(worker.errorListeners).toHaveLength(0);
  });

  test("rejects with the worker's message and revokes emitted urls on an error response", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    // Emit a page first so there are urls to clean up.
    worker.emitMessage({ type: "page", page: makePagePayload(1) });
    expect(createSpy).toHaveBeenCalledTimes(3);

    worker.emitMessage({ type: "error", message: "render failed" });

    await expect(promise).rejects.toThrow("render failed");
    // cleanupOnFailure revokes the three emitted urls.
    expect(revokeSpy).toHaveBeenCalledTimes(3);
    expect(revokeSpy.mock.calls.map((c) => c[0])).toEqual([
      "blob:mock/0",
      "blob:mock/1",
      "blob:mock/2",
    ]);
    expect(worker.terminateCalls).toBe(1);
  });

  test("rejects using event.error when the worker emits an ErrorEvent with an error object", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    const original = new Error("worker exploded");
    worker.emitError({ error: original, message: "ignored" });

    await expect(promise).rejects.toBe(original);
    expect(worker.terminateCalls).toBe(1);
  });

  test("rejects using event.message when the ErrorEvent has no error object", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    worker.emitError({ error: undefined, message: "boom message" });

    await expect(promise).rejects.toThrow("boom message");
  });

  test("falls back to a default message when the ErrorEvent has neither error nor message", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();

    worker.emitError({ error: undefined, message: "" });

    await expect(promise).rejects.toThrow("Pixel compare worker error");
  });

  test("swallows a throwing terminate() and still rejects on error", async () => {
    const promise = runPixelCompare(baseArgs());
    const worker = latestWorker();
    worker.terminateShouldThrow = true;

    worker.emitMessage({ type: "error", message: "kaboom" });

    await expect(promise).rejects.toThrow("kaboom");
    expect(worker.terminateCalls).toBe(1);
  });

  test("cancels mid-stream when the signal flips to cancelled and cleans up urls", async () => {
    const signal = { cancelled: false };
    const promise = runPixelCompare({ ...baseArgs(), signal });
    const worker = latestWorker();

    // First page emits urls while not cancelled.
    worker.emitMessage({ type: "page", page: makePagePayload(1) });
    expect(createSpy).toHaveBeenCalledTimes(3);

    // Flip the signal; the next message takes the cancellation branch.
    signal.cancelled = true;
    worker.emitMessage({ type: "progress", pageNumber: 2, totalPages: 3 });

    await expect(promise).rejects.toThrow("CANCELLED");
    expect(revokeSpy).toHaveBeenCalledTimes(3);
    expect(worker.terminateCalls).toBe(1);
  });
});

// Shared empty totals payload for success messages that we do not assert on.
function emptyTotals(): {
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  pagesWithChanges: number;
  durationMs: number;
} {
  return {
    diffPixels: 0,
    totalPixels: 0,
    diffRatio: 0,
    pagesWithChanges: 0,
    durationMs: 0,
  };
}
