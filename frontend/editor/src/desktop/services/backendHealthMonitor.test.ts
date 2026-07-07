/**
 * Unit tests for the BackendHealthMonitor singleton (desktop layer).
 *
 * The monitor is a subscribe/poll state machine wrapped around
 * `tauriBackendService`:
 *   - At construction it seeds its state from getBackendStatus() and registers a
 *     status listener via subscribeToStatus() so backend-service status changes
 *     are reflected immediately (healthy => clears error + "Backend Online";
 *     anything else preserves the existing error and keeps/sets an offline
 *     message).
 *   - subscribe(listener) emits current state synchronously, and starts a
 *     setInterval poll loop on the FIRST subscriber. The last unsubscribe stops
 *     the loop.
 *   - pollOnce() calls checkBackendHealth(): true => healthy, false => unhealthy,
 *     a thrown error => unhealthy with a hard-coded English message.
 *   - updateState() diffs status/error/message and only notifies listeners on a
 *     meaningful change; isOnline is always derived from status === "healthy".
 *
 * External deps are mocked for determinism:
 *   - `@app/services/tauriBackendService` — getBackendStatus / subscribeToStatus
 *     / checkBackendHealth are vi.fn()s we drive explicitly. subscribeToStatus
 *     captures the registered listener so we can simulate backend status pushes.
 *   - `@app/i18n` — t(key, fallback) returns the fallback so assertions read in
 *     plain English regardless of locale.
 * Timers are faked so the interval loop is driven by advanceTimersByTimeAsync.
 *
 * Because the module instantiates the singleton at import time, each test loads
 * a FRESH module via vi.resetModules() + dynamic import so monitor state (and
 * the captured status listener) never leaks between cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BackendHealthState } from "@app/types/backendHealth";

type BackendStatus = "stopped" | "starting" | "healthy" | "unhealthy";

// --- tauriBackendService mock -----------------------------------------------
// These module-scoped fns are referenced (not captured by value) inside the
// hoisted vi.mock factory, so each test can reconfigure them freely.
const getBackendStatusMock = vi.fn<() => BackendStatus>();
const checkBackendHealthMock = vi.fn<() => Promise<boolean>>();
let statusListener: ((status: BackendStatus) => void) | null = null;
const subscribeToStatusMock = vi.fn(
  (listener: (status: BackendStatus) => void) => {
    statusListener = listener;
    return () => {
      statusListener = null;
    };
  },
);

vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    getBackendStatus: () => getBackendStatusMock(),
    subscribeToStatus: (listener: (status: BackendStatus) => void) =>
      subscribeToStatusMock(listener),
    checkBackendHealth: () => checkBackendHealthMock(),
  },
}));

// i18n.t(key, fallback) => fallback for stable, locale-independent assertions.
vi.mock("@app/i18n", () => ({
  default: {
    t: (_key: string, fallback?: string) => fallback ?? _key,
  },
}));

interface MonitorModule {
  backendHealthMonitor: {
    subscribe(listener: (s: BackendHealthState) => void): () => void;
    getSnapshot(): BackendHealthState;
    checkNow(): Promise<boolean>;
  };
}

/**
 * Load a pristine instance of the module. resetModules() guarantees the
 * module-level singleton — and the captured status listener — are re-created so
 * no state bleeds across tests. The current getBackendStatusMock return value
 * is read at construction time, seeding the initial snapshot.
 */
async function loadMonitor(): Promise<MonitorModule["backendHealthMonitor"]> {
  vi.resetModules();
  const mod =
    (await import("@app/services/backendHealthMonitor")) as unknown as MonitorModule;
  return mod.backendHealthMonitor;
}

/** Flush the pending async pollOnce() microtask chain. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  statusListener = null;
  vi.useFakeTimers();
  // Defaults: backend reports stopped at construction, health checks pass.
  getBackendStatusMock.mockReturnValue("stopped");
  checkBackendHealthMock.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BackendHealthMonitor — construction & initial snapshot", () => {
  it("seeds initial state from getBackendStatus() (stopped => offline)", async () => {
    const monitor = await loadMonitor();
    expect(monitor.getSnapshot()).toEqual({
      status: "stopped",
      error: null,
      isOnline: false,
    });
  });

  it("derives isOnline=true when the backend is already healthy at construction", async () => {
    getBackendStatusMock.mockReturnValue("healthy");
    const monitor = await loadMonitor();
    const snap = monitor.getSnapshot();
    expect(snap.status).toBe("healthy");
    expect(snap.isOnline).toBe(true);
    expect(snap.error).toBeNull();
  });

  it("registers a backend status listener via subscribeToStatus at construction", async () => {
    await loadMonitor();
    expect(subscribeToStatusMock).toHaveBeenCalledTimes(1);
    expect(typeof statusListener).toBe("function");
  });
});

describe("subscribe / unsubscribe", () => {
  it("emits the current state synchronously on subscribe", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      status: "stopped",
      error: null,
      isOnline: false,
    });
  });

  it("starts the poll loop only on the first subscriber and performs an immediate poll", async () => {
    const monitor = await loadMonitor();
    monitor.subscribe(vi.fn());
    await flush();
    // ensurePolling() => one immediate pollOnce().
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1);

    // A second subscriber must NOT trigger another immediate poll or interval.
    monitor.subscribe(vi.fn());
    await flush();
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1);
  });

  it("re-polls on the configured 5s interval while subscribed", async () => {
    const monitor = await loadMonitor();
    monitor.subscribe(vi.fn());
    await flush();
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling once the last subscriber unsubscribes", async () => {
    const monitor = await loadMonitor();
    const unsubA = monitor.subscribe(vi.fn());
    const unsubB = monitor.subscribe(vi.fn());
    await flush();
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1);

    // Removing one of two subscribers keeps the loop alive.
    unsubA();
    await vi.advanceTimersByTimeAsync(5000);
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2);

    // Removing the last subscriber clears the interval.
    unsubB();
    checkBackendHealthMock.mockClear();
    await vi.advanceTimersByTimeAsync(60000);
    expect(checkBackendHealthMock).not.toHaveBeenCalled();
  });

  it("a stopped listener receives no further notifications after unsubscribe", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    const unsubscribe = monitor.subscribe(listener);
    await flush(); // immediate poll => stopped -> healthy transition emitted
    listener.mockClear();

    unsubscribe();

    // A subsequent backend status push would emit on active listeners only.
    statusListener?.("unhealthy");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("pollOnce — health-check transitions (via checkNow)", () => {
  it("transitions to healthy with cleared error when the backend is healthy", async () => {
    const monitor = await loadMonitor();
    checkBackendHealthMock.mockResolvedValue(true);

    const result = await monitor.checkNow();

    expect(result).toBe(true);
    expect(monitor.getSnapshot()).toEqual({
      status: "healthy",
      message: "Backend Online",
      error: null,
      isOnline: true,
    });
  });

  it("transitions to unhealthy with an offline error when the backend is unhealthy", async () => {
    const monitor = await loadMonitor();
    checkBackendHealthMock.mockResolvedValue(false);

    const result = await monitor.checkNow();

    expect(result).toBe(false);
    expect(monitor.getSnapshot()).toEqual({
      status: "unhealthy",
      message: "Backend Offline",
      error: "Backend Offline",
      isOnline: false,
    });
  });

  it("transitions to unhealthy with a hard-coded message when checkBackendHealth throws", async () => {
    const monitor = await loadMonitor();
    checkBackendHealthMock.mockRejectedValue(new Error("boom"));

    const result = await monitor.checkNow();

    expect(result).toBe(false);
    expect(monitor.getSnapshot()).toEqual({
      status: "unhealthy",
      message: "Backend is unavailable",
      error: "Backend offline",
      isOnline: false,
    });
    // The catch branch logs the failure.
    expect(console.error).toHaveBeenCalledWith(
      "[BackendHealthMonitor] Health check failed:",
      expect.any(Error),
    );
  });

  it("flips healthy -> unhealthy across consecutive checkNow calls", async () => {
    const monitor = await loadMonitor();

    checkBackendHealthMock.mockResolvedValueOnce(true);
    expect(await monitor.checkNow()).toBe(true);
    expect(monitor.getSnapshot().status).toBe("healthy");

    checkBackendHealthMock.mockResolvedValueOnce(false);
    expect(await monitor.checkNow()).toBe(false);
    expect(monitor.getSnapshot().status).toBe("unhealthy");
    expect(monitor.getSnapshot().isOnline).toBe(false);
  });
});

describe("updateState — emit-only-on-meaningful-change", () => {
  it("does not re-emit when consecutive polls report the same healthy state", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener); // immediate emit of current (stopped) state
    await flush(); // immediate poll: stopped -> healthy (one emit)
    listener.mockClear();

    // Second poll returns healthy again => identical status/message/error => no emit.
    await vi.advanceTimersByTimeAsync(5000);
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("re-emits only when status/message/error actually change between polls", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    await flush(); // stopped -> healthy
    listener.mockClear();

    // Next poll fails => healthy -> unhealthy (emit).
    checkBackendHealthMock.mockResolvedValueOnce(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "unhealthy", isOnline: false }),
    );

    // Following poll succeeds => unhealthy -> healthy (another emit).
    checkBackendHealthMock.mockResolvedValueOnce(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "healthy", isOnline: true }),
    );
  });

  it("notifies every active subscriber on a real change", async () => {
    const monitor = await loadMonitor();
    const a = vi.fn();
    const b = vi.fn();
    monitor.subscribe(a);
    monitor.subscribe(b);
    a.mockClear();
    b.mockClear();

    await flush(); // immediate poll: stopped -> healthy
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "healthy" }),
    );
    expect(b).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "healthy" }),
    );
  });
});

describe("backend status listener (subscribeToStatus callback)", () => {
  it("reflects a healthy push: clears error and sets the online message", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    statusListener?.("healthy");

    const snap = monitor.getSnapshot();
    expect(snap.status).toBe("healthy");
    expect(snap.isOnline).toBe(true);
    expect(snap.error).toBeNull();
    expect(snap.message).toBe("Backend Online");
  });

  it("reflects a non-healthy push: preserves existing error and uses an offline message", async () => {
    const monitor = await loadMonitor();
    // First drive an unhealthy poll so an error string is present in state.
    checkBackendHealthMock.mockResolvedValueOnce(false);
    await monitor.checkNow();
    expect(monitor.getSnapshot().error).toBe("Backend Offline");

    // A "starting" status push should keep the existing error and message.
    statusListener?.("starting");
    const snap = monitor.getSnapshot();
    expect(snap.status).toBe("starting");
    expect(snap.isOnline).toBe(false);
    expect(snap.error).toBe("Backend Offline");
    // message branch: existing message (??) is retained.
    expect(snap.message).toBe("Backend Offline");
  });

  it("uses the offline fallback message on a non-healthy push when no message exists yet", async () => {
    // Fresh monitor (stopped) has no message; a non-healthy push hits the
    // i18n fallback branch of the message nullish-coalesce.
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    statusListener?.("unhealthy");

    const snap = monitor.getSnapshot();
    expect(snap.status).toBe("unhealthy");
    expect(snap.isOnline).toBe(false);
    expect(snap.message).toBe("Backend Offline");
    // No prior error => stays null (status !== healthy keeps this.state.error).
    expect(snap.error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not re-emit when a status push produces no meaningful change", async () => {
    getBackendStatusMock.mockReturnValue("healthy");
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    // Already healthy with the same derived message/error => no emit.
    // (message is undefined here, push sets it to "Backend Online" => that IS a
    // change, so to test the no-op path we push the very same state twice.)
    statusListener?.("healthy"); // sets message -> emit
    listener.mockClear();
    statusListener?.("healthy"); // identical -> no emit
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("checkNow", () => {
  it("delegates to a single pollOnce and returns its boolean result", async () => {
    const monitor = await loadMonitor();
    checkBackendHealthMock.mockResolvedValue(true);
    const result = await monitor.checkNow();
    expect(checkBackendHealthMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("works without any subscribers (no poll loop required)", async () => {
    const monitor = await loadMonitor();
    checkBackendHealthMock.mockResolvedValue(false);
    const result = await monitor.checkNow();
    expect(result).toBe(false);
    expect(monitor.getSnapshot().status).toBe("unhealthy");
  });
});

describe("module singleton", () => {
  it("exports a ready-to-use singleton with the expected surface", async () => {
    const monitor = await loadMonitor();
    expect(typeof monitor.subscribe).toBe("function");
    expect(typeof monitor.getSnapshot).toBe("function");
    expect(typeof monitor.checkNow).toBe("function");
  });
});
