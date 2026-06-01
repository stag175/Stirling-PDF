/**
 * Unit tests for fileOpenService (desktop layer).
 *
 * The module under test selects between a TauriFileOpenService and a
 * WebFileOpenService at module-evaluation time based on isTauri(). It also
 * dynamically imports `@tauri-apps/api/event` (listen) and
 * `@tauri-apps/plugin-fs` (readFile) inside async methods. To exercise BOTH
 * service variants plus the listener setup/teardown race logic, every Tauri
 * dependency is mocked with vi.mock and the module is (re)imported through a
 * fresh registry (vi.resetModules + dynamic import) once isTauri()'s return
 * value has been pinned for that scenario.
 *
 * Determinism: no real Tauri runtime, no network, no filesystem. console.* is
 * silenced so the chatty logging in the module does not pollute test output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Tauri dependency mocks -------------------------------------------------
// invoke + isTauri come from @tauri-apps/api/core; isTauri is consulted both at
// module load (service selection) and inside onFileOpened.
const invoke = vi.fn<(cmd: string) => Promise<unknown>>();
const isTauri = vi.fn<() => boolean>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => invoke(cmd),
  isTauri: () => isTauri(),
}));

// listen() is dynamically imported by onFileOpened. It resolves to an unlisten
// fn; we capture the registered handler so tests can drive the callback path.
const unlisten = vi.fn();
const listen =
  vi.fn<
    (
      event: string,
      handler: (e: { payload: unknown }) => void,
    ) => Promise<() => void>
  >();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) =>
    listen(event, handler),
}));

// readFile() is dynamically imported by readFileAsArrayBuffer.
const readFile = vi.fn<(path: string) => Promise<Uint8Array>>();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (path: string) => readFile(path),
}));

type FileOpenServiceModule = typeof import("@app/services/fileOpenService");

/**
 * Re-import the module under a fresh registry so the module-level isTauri()
 * service selection runs against the currently-pinned isTauri() value.
 */
async function loadModule(): Promise<FileOpenServiceModule> {
  vi.resetModules();
  return import("@app/services/fileOpenService");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a real Tauri environment so the Tauri service is selected.
  isTauri.mockReturnValue(true);
  invoke.mockResolvedValue([]);
  listen.mockResolvedValue(unlisten);
  readFile.mockResolvedValue(new Uint8Array());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("service selection (module-level isTauri branch)", () => {
  it("exposes a service implementing the full FileOpenService contract", async () => {
    const { fileOpenService } = await loadModule();
    expect(typeof fileOpenService.getOpenedFiles).toBe("function");
    expect(typeof fileOpenService.readFileAsArrayBuffer).toBe("function");
    expect(typeof fileOpenService.clearOpenedFiles).toBe("function");
    expect(typeof fileOpenService.onFileOpened).toBe("function");
  });

  it("selects the Tauri service when isTauri() is true (getOpenedFiles invokes the command)", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValue(["/tmp/a.pdf"]);
    const { fileOpenService } = await loadModule();
    const files = await fileOpenService.getOpenedFiles();
    expect(files).toEqual(["/tmp/a.pdf"]);
    expect(invoke).toHaveBeenCalledWith("pop_opened_files");
  });

  it("selects the Web service when isTauri() is false (getOpenedFiles never invokes)", async () => {
    isTauri.mockReturnValue(false);
    const { fileOpenService } = await loadModule();
    const files = await fileOpenService.getOpenedFiles();
    expect(files).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("TauriFileOpenService.getOpenedFiles", () => {
  it("returns the invoke result on success", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValue(["one.pdf", "two.pdf"]);
    const { fileOpenService } = await loadModule();
    expect(await fileOpenService.getOpenedFiles()).toEqual([
      "one.pdf",
      "two.pdf",
    ]);
  });

  it("returns an empty array and logs when invoke rejects (catch branch)", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockRejectedValue(new Error("boom"));
    const { fileOpenService } = await loadModule();
    expect(await fileOpenService.getOpenedFiles()).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("TauriFileOpenService.readFileAsArrayBuffer", () => {
  it("reads a file and derives the file name from a forward-slash path", async () => {
    isTauri.mockReturnValue(true);
    readFile.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    const { fileOpenService } = await loadModule();
    const result = await fileOpenService.readFileAsArrayBuffer(
      "/home/user/report.pdf",
    );
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("report.pdf");
    expect(new Uint8Array(result!.arrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(readFile).toHaveBeenCalledWith("/home/user/report.pdf");
  });

  it("derives the file name from a Windows back-slash path", async () => {
    isTauri.mockReturnValue(true);
    readFile.mockResolvedValue(new Uint8Array([9]));
    const { fileOpenService } = await loadModule();
    const result = await fileOpenService.readFileAsArrayBuffer(
      "C:\\Users\\me\\docs\\thing.pdf",
    );
    expect(result?.fileName).toBe("thing.pdf");
  });

  it("falls back to 'opened-file.pdf' when the path has no basename", async () => {
    isTauri.mockReturnValue(true);
    readFile.mockResolvedValue(new Uint8Array([0]));
    const { fileOpenService } = await loadModule();
    // A trailing separator => split().pop() yields "" which is falsy.
    const result = await fileOpenService.readFileAsArrayBuffer("/some/dir/");
    expect(result?.fileName).toBe("opened-file.pdf");
  });

  it("slices the buffer using byteOffset/byteLength for an offset view", async () => {
    isTauri.mockReturnValue(true);
    // Build a view that does NOT start at offset 0 to exercise the slice math.
    const backing = new Uint8Array([10, 20, 30, 40, 50]);
    const view = new Uint8Array(backing.buffer, 1, 3); // -> [20,30,40]
    readFile.mockResolvedValue(view);
    const { fileOpenService } = await loadModule();
    const result = await fileOpenService.readFileAsArrayBuffer("/x/y.pdf");
    expect(result).not.toBeNull();
    expect(new Uint8Array(result!.arrayBuffer)).toEqual(
      new Uint8Array([20, 30, 40]),
    );
  });

  it("returns null and logs when readFile rejects (catch branch)", async () => {
    isTauri.mockReturnValue(true);
    readFile.mockRejectedValue(new Error("no such file"));
    const { fileOpenService } = await loadModule();
    expect(await fileOpenService.readFileAsArrayBuffer("/bad")).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("TauriFileOpenService.clearOpenedFiles", () => {
  it("invokes clear_opened_files on success", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockResolvedValue(undefined);
    const { fileOpenService } = await loadModule();
    await fileOpenService.clearOpenedFiles();
    expect(invoke).toHaveBeenCalledWith("clear_opened_files");
  });

  it("swallows and logs an invoke rejection (catch branch)", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockRejectedValue(new Error("fail"));
    const { fileOpenService } = await loadModule();
    await expect(fileOpenService.clearOpenedFiles()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("TauriFileOpenService.onFileOpened — happy path", () => {
  it("registers a listener, forwards the payload to the callback, and cleans up", async () => {
    isTauri.mockReturnValue(true);
    let captured: ((e: { payload: unknown }) => void) | undefined;
    listen.mockImplementation(async (_event, handler) => {
      captured = handler;
      return unlisten;
    });
    const { fileOpenService } = await loadModule();

    const callback = vi.fn();
    const dispose = fileOpenService.onFileOpened(callback);

    // Let the async setupEventListeners() chain settle.
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
    expect(listen).toHaveBeenCalledWith("file-opened", expect.any(Function));

    // Drive the captured event handler -> callback receives payload.
    captured?.({ payload: "/opened/file.pdf" });
    expect(callback).toHaveBeenCalledWith("/opened/file.pdf");

    // Cleanup invokes the unlisten fn exactly once.
    dispose();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("logs but does not throw when unlisten() throws during cleanup", async () => {
    isTauri.mockReturnValue(true);
    unlisten.mockImplementation(() => {
      throw new Error("unlisten failed");
    });
    const { fileOpenService } = await loadModule();

    const dispose = fileOpenService.onFileOpened(vi.fn());
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));

    expect(() => dispose()).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("TauriFileOpenService.onFileOpened — cleanup race guards", () => {
  it("skips listener setup entirely when disposed before the async chain runs (first isCleanedUp guard)", async () => {
    isTauri.mockReturnValue(true);
    const { fileOpenService } = await loadModule();

    // Dispose synchronously, before setupEventListeners() reaches isTauri().
    const dispose = fileOpenService.onFileOpened(vi.fn());
    dispose();

    // Give the microtask queue a chance to run the async setup.
    await Promise.resolve();
    await Promise.resolve();
    expect(listen).not.toHaveBeenCalled();
    // Cleanup was never assigned, so unlisten is never called.
    expect(unlisten).not.toHaveBeenCalled();
  });

  it("runs the immediate-cleanup branch when disposed while listen() is in flight", async () => {
    isTauri.mockReturnValue(true);

    // Make listen() hang until we release it. We signal `listenStarted` only
    // once listen() has actually been invoked (i.e. the dynamic import has
    // resolved and we are past the second isCleanedUp guard), so disposing now
    // lands us in the immediate-cleanup `else` branch when listen() resolves.
    let releaseListen: (() => void) | undefined;
    let signalStarted: (() => void) | undefined;
    const listenGate = new Promise<void>((resolve) => {
      releaseListen = resolve;
    });
    const listenStarted = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    listen.mockImplementation(async () => {
      signalStarted?.();
      await listenGate;
      return unlisten;
    });

    const { fileOpenService } = await loadModule();
    const dispose = fileOpenService.onFileOpened(vi.fn());

    // Wait until setup has actually reached the awaited listen() call.
    await listenStarted;
    dispose();
    releaseListen?.();

    // listen() resolves -> cleanup was already requested -> immediate unlisten().
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("does nothing when isTauri() is false at call time (Tauri service, non-Tauri runtime)", async () => {
    // Module-level selection sees true (Tauri service), but the per-call check
    // inside onFileOpened sees false, so the listen import is skipped.
    isTauri.mockReturnValue(true);
    const { fileOpenService } = await loadModule();
    isTauri.mockReturnValue(false);

    const dispose = fileOpenService.onFileOpened(vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(listen).not.toHaveBeenCalled();
    expect(() => dispose()).not.toThrow();
  });

  it("logs and recovers when the listen import/registration rejects (outer catch)", async () => {
    isTauri.mockReturnValue(true);
    listen.mockRejectedValue(new Error("listen rejected"));
    const { fileOpenService } = await loadModule();

    const dispose = fileOpenService.onFileOpened(vi.fn());
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());

    // No cleanup fn was set, so dispose is a no-op that must not throw.
    expect(() => dispose()).not.toThrow();
    expect(unlisten).not.toHaveBeenCalled();
  });
});

describe("WebFileOpenService", () => {
  it("getOpenedFiles resolves to an empty array", async () => {
    isTauri.mockReturnValue(false);
    const { fileOpenService } = await loadModule();
    expect(await fileOpenService.getOpenedFiles()).toEqual([]);
  });

  it("readFileAsArrayBuffer resolves to null and never touches the fs", async () => {
    isTauri.mockReturnValue(false);
    const { fileOpenService } = await loadModule();
    expect(
      await fileOpenService.readFileAsArrayBuffer("/anything.pdf"),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("clearOpenedFiles resolves without invoking any command", async () => {
    isTauri.mockReturnValue(false);
    const { fileOpenService } = await loadModule();
    await expect(fileOpenService.clearOpenedFiles()).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("onFileOpened returns a no-op cleanup and registers no listeners", async () => {
    isTauri.mockReturnValue(false);
    const { fileOpenService } = await loadModule();
    const dispose = fileOpenService.onFileOpened(vi.fn());
    expect(typeof dispose).toBe("function");
    expect(() => dispose()).not.toThrow();
    await Promise.resolve();
    expect(listen).not.toHaveBeenCalled();
  });
});
