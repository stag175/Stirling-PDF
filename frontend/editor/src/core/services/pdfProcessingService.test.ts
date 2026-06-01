import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import type { ProcessedFile, ProcessingState } from "@app/types/processing";

// ---------------------------------------------------------------------------
// Mock ProcessingCache: an in-memory, fully-controllable stand-in so cache
// hit / miss / set / clear / stats branches run deterministically.
// ---------------------------------------------------------------------------
vi.mock("@app/services/processingCache", () => {
  class MockProcessingCache {
    store = new Map<string, ProcessedFile>();
    getCalls: string[] = [];

    get = vi.fn((key: string): ProcessedFile | null => {
      this.getCalls.push(key);
      return this.store.get(key) ?? null;
    });

    set = vi.fn((key: string, data: ProcessedFile): void => {
      this.store.set(key, data);
    });

    has = vi.fn((key: string): boolean => this.store.has(key));

    delete = vi.fn((key: string): void => {
      this.store.delete(key);
    });

    clear = vi.fn((): void => {
      this.store.clear();
    });

    getStats = vi.fn(() => ({
      entries: this.store.size,
      totalSizeBytes: this.store.size * 1024,
      maxSizeBytes: 99999,
    }));
  }

  return { ProcessingCache: MockProcessingCache };
});

// ---------------------------------------------------------------------------
// Mock pdfWorkerManager: createDocument / destroyDocument are vi.fn()s so the
// processFileWithProgress pipeline runs headlessly with a fake PDF document.
// ---------------------------------------------------------------------------
const createDocumentMock = vi.fn();
const destroyDocumentMock = vi.fn();

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: (...args: unknown[]) => createDocumentMock(...args),
    destroyDocument: (...args: unknown[]) => destroyDocumentMock(...args),
  },
}));

// Import AFTER the mocks are registered so the module under test wires up the
// mocked dependencies.
import {
  PDFProcessingService,
  pdfProcessingService,
} from "@app/services/pdfProcessingService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a deterministic File whose generated key is predictable. */
function makeFile(name = "doc.pdf", size = 1234, lastModified = 42): File {
  const file = new File(["pdf-bytes"], name, {
    type: "application/pdf",
    lastModified,
  });
  // jsdom may not honour the size from content; force a deterministic value.
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/** Build a fake PDF document proxy with `numPages` renderable pages. */
function makeFakePdf(numPages: number) {
  const renderPromise = Promise.resolve(undefined);
  const page = {
    getViewport: vi.fn(() => ({ width: 100, height: 200 })),
    render: vi.fn(() => ({ promise: renderPromise })),
  };
  return {
    numPages,
    getPage: vi.fn(async () => page),
    __page: page,
  };
}

/** A canvas 2d context stub deterministic across runs. */
function install2dContext(returnContext: boolean) {
  const ctx = returnContext ? ({} as CanvasRenderingContext2D) : null;
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const toDataURLSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/png;base64,STUB");
  return { getContextSpy, toDataURLSpy };
}

/** Reset the singleton so each test starts with a clean private state. */
function freshInstance(): PDFProcessingService {
  // The constructor is private; reset the cached static instance so the next
  // getInstance() rebuilds with a fresh cache + processing map.
  (
    PDFProcessingService as unknown as { instance?: PDFProcessingService }
  ).instance = undefined;
  return PDFProcessingService.getInstance();
}

/** Flush microtasks so awaited promises inside startProcessing settle. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("PDFProcessingService", () => {
  let service: PDFProcessingService;
  let logSpy: Mock;
  let errorSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    createDocumentMock.mockReset();
    destroyDocumentMock.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as Mock;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {}) as Mock;
    service = freshInstance();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getInstance / singleton export", () => {
    test("returns the same instance on repeated calls", () => {
      const a = PDFProcessingService.getInstance();
      const b = PDFProcessingService.getInstance();
      expect(a).toBe(b);
    });

    test("exports a ready singleton instance", () => {
      expect(pdfProcessingService).toBeInstanceOf(PDFProcessingService);
    });
  });

  describe("generateFileKey", () => {
    test("composes name, size and lastModified", () => {
      const file = makeFile("report.pdf", 999, 7);
      expect(service.generateFileKey(file)).toBe("report.pdf-999-7");
    });
  });

  describe("getProcessedFile", () => {
    test("returns the cached file on a cache hit (no processing started)", async () => {
      const file = makeFile();
      const key = service.generateFileKey(file);
      // Deterministic seed: drive a successful (zero-page) processing run so the
      // result lands in the mocked cache, then re-request to hit the cache.
      createDocumentMock.mockResolvedValue(makeFakePdf(0));
      install2dContext(true);

      // First call: miss -> starts processing.
      const first = await service.getProcessedFile(file);
      expect(first).toBeNull();
      await flushMicrotasks();

      // Now cached. Second call should hit cache.
      const second = await service.getProcessedFile(file);
      expect(second).not.toBeNull();
      expect(second?.totalPages).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("Cache hit for:", file.name);
      expect(key).toContain("doc.pdf");
    });

    test("returns null and does not re-start when already processing", async () => {
      const file = makeFile();
      // Never resolves: keeps the entry in the processing map.
      createDocumentMock.mockReturnValue(new Promise(() => {}));

      const first = await service.getProcessedFile(file);
      expect(first).toBeNull();
      await flushMicrotasks();
      expect(createDocumentMock).toHaveBeenCalledTimes(1);

      // Second call while still processing -> short-circuits.
      const second = await service.getProcessedFile(file);
      expect(second).toBeNull();
      expect(logSpy).toHaveBeenCalledWith("Already processing:", file.name);
      expect(createDocumentMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("startProcessing (success path)", () => {
    test("renders pages, caches result, completes then evicts after 2s", async () => {
      const file = makeFile("multi.pdf", 5000, 1);
      const fakePdf = makeFakePdf(2);
      createDocumentMock.mockResolvedValue(fakePdf);
      const { getContextSpy, toDataURLSpy } = install2dContext(true);

      const states: Array<Map<string, ProcessingState>> = [];
      const unsubscribe = service.onProcessingChange((s) => {
        states.push(new Map(s));
      });

      await service.getProcessedFile(file);
      await flushMicrotasks();

      // Page render + worker teardown all exercised.
      expect(fakePdf.getPage).toHaveBeenCalledTimes(2);
      expect(getContextSpy).toHaveBeenCalled();
      expect(toDataURLSpy).toHaveBeenCalled();
      expect(destroyDocumentMock).toHaveBeenCalledWith(fakePdf);

      // The cached file is now retrievable.
      const cached = await service.getProcessedFile(file);
      expect(cached?.totalPages).toBe(2);
      expect(cached?.pages).toHaveLength(2);
      expect(cached?.pages[0].pageNumber).toBe(1);
      expect(cached?.pages[0].thumbnail).toBe("data:image/png;base64,STUB");

      // Completed state observed via listener fan-out.
      const completed = states
        .flatMap((m) => Array.from(m.values()))
        .find((st) => st.status === "completed");
      expect(completed).toBeDefined();
      expect(completed?.progress).toBe(100);
      expect(completed?.completedAt).toBeTypeOf("number");

      // Still tracked until the 2s eviction timer fires.
      expect(service.getProcessingStates().size).toBe(1);
      vi.advanceTimersByTime(2000);
      expect(service.getProcessingStates().size).toBe(0);

      unsubscribe();
    });

    test("skips page push when 2d context is unavailable", async () => {
      const file = makeFile("noctx.pdf", 10, 2);
      const fakePdf = makeFakePdf(3);
      createDocumentMock.mockResolvedValue(fakePdf);
      install2dContext(false); // getContext -> null

      await service.getProcessedFile(file);
      await flushMicrotasks();

      const cached = await service.getProcessedFile(file);
      // totalPages still reflects the document, but no pages were pushed.
      expect(cached?.totalPages).toBe(3);
      expect(cached?.pages).toHaveLength(0);
      expect(fakePdf.__page.render).not.toHaveBeenCalled();
    });
  });

  describe("startProcessing (error path)", () => {
    test("Error instance: records message and evicts after 5s", async () => {
      const file = makeFile("boom.pdf", 1, 1);
      createDocumentMock.mockRejectedValue(new Error("decode failed"));

      const states: Array<Map<string, ProcessingState>> = [];
      service.onProcessingChange((s) => states.push(new Map(s)));

      await service.getProcessedFile(file);
      await flushMicrotasks();

      expect(errorSpy).toHaveBeenCalled();
      const errored = states
        .flatMap((m) => Array.from(m.values()))
        .find((st) => st.status === "error");
      expect(errored).toBeDefined();
      expect(errored?.error).toBe("decode failed");

      expect(service.getProcessingStates().size).toBe(1);
      vi.advanceTimersByTime(4999);
      expect(service.getProcessingStates().size).toBe(1);
      vi.advanceTimersByTime(1);
      expect(service.getProcessingStates().size).toBe(0);
    });

    test("non-Error rejection falls back to 'Unknown error'", async () => {
      const file = makeFile("weird.pdf", 2, 2);
      createDocumentMock.mockRejectedValue("plain string failure");

      await service.getProcessedFile(file);
      await flushMicrotasks();

      const errored = Array.from(service.getProcessingStates().values()).find(
        (st) => st.status === "error",
      );
      expect(errored?.error).toBe("Unknown error");
    });
  });

  describe("listener subscription", () => {
    test("onProcessingChange returns an unsubscribe that stops fan-out", async () => {
      const file = makeFile("sub.pdf", 3, 3);
      createDocumentMock.mockResolvedValue(makeFakePdf(0));
      install2dContext(true);

      const cb = vi.fn();
      const unsubscribe = service.onProcessingChange(cb);
      expect(typeof unsubscribe).toBe("function");

      await service.getProcessedFile(file);
      await flushMicrotasks();
      const callsWhileSubscribed = cb.mock.calls.length;
      expect(callsWhileSubscribed).toBeGreaterThan(0);

      unsubscribe();
      // clearAll triggers notifyListeners, but cb is gone now.
      service.clearAll();
      expect(cb.mock.calls.length).toBe(callsWhileSubscribed);
    });

    test("multiple listeners all receive state maps", () => {
      const a = vi.fn();
      const b = vi.fn();
      service.onProcessingChange(a);
      service.onProcessingChange(b);
      service.clearAll(); // fires notifyListeners
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(a.mock.calls[0][0]).toBeInstanceOf(Map);
    });
  });

  describe("getProcessingStates", () => {
    test("returns a defensive copy of the processing map", async () => {
      const file = makeFile("copy.pdf", 4, 4);
      createDocumentMock.mockReturnValue(new Promise(() => {})); // stays processing
      await service.getProcessedFile(file);
      await flushMicrotasks();

      const snapshot = service.getProcessingStates();
      expect(snapshot.size).toBe(1);
      snapshot.clear();
      // Mutating the copy must not affect internal state.
      expect(service.getProcessingStates().size).toBe(1);
    });
  });

  describe("cleanup", () => {
    test("removes cache + processing entries for the given files and notifies", async () => {
      const file = makeFile("clean.pdf", 8, 8);
      createDocumentMock.mockReturnValue(new Promise(() => {}));
      await service.getProcessedFile(file);
      await flushMicrotasks();
      expect(service.getProcessingStates().size).toBe(1);

      const cb = vi.fn();
      service.onProcessingChange(cb);
      service.cleanup([file]);

      expect(service.getProcessingStates().size).toBe(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test("handles an empty removal list without error", () => {
      const cb = vi.fn();
      service.onProcessingChange(cb);
      service.cleanup([]);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCacheStats", () => {
    test("delegates to the underlying cache getStats", () => {
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty("entries");
      expect(stats).toHaveProperty("totalSizeBytes");
      expect(stats).toHaveProperty("maxSizeBytes");
    });
  });

  describe("clearAll", () => {
    test("clears cache + processing and notifies listeners", async () => {
      const file = makeFile("all.pdf", 9, 9);
      createDocumentMock.mockReturnValue(new Promise(() => {}));
      await service.getProcessedFile(file);
      await flushMicrotasks();
      expect(service.getProcessingStates().size).toBe(1);

      const cb = vi.fn();
      service.onProcessingChange(cb);
      service.clearAll();

      expect(service.getProcessingStates().size).toBe(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
