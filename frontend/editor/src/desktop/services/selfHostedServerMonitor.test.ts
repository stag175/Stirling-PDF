/**
 * Unit tests for the SelfHostedServerMonitor singleton (desktop layer).
 *
 * The monitor is a poll/subscribe state machine: start(url) seeds a "checking"
 * state, performs an immediate health check, then re-polls on a 15s interval.
 * A health response is treated as ONLINE when response.ok OR status 401/403
 * (auth-required servers are still "running"); any other status — or a thrown
 * fetch — is OFFLINE. State changes are diffed and only emitted to subscribers
 * when status / isOnline / serverUrl actually changes.
 *
 * The single external dependency is the Tauri `fetch` from
 * `@tauri-apps/plugin-http`, mocked with vi.mock for determinism (no network).
 * Timers are faked so the interval loop is driven explicitly.
 *
 * Because the module instantiates the singleton at import time, each test loads
 * a FRESH module via vi.resetModules() + dynamic import so monitor state never
 * leaks between cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Tauri fetch mock -------------------------------------------------------
const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

type MonitorState = {
  status: "idle" | "checking" | "online" | "offline";
  isOnline: boolean;
  serverUrl: string | null;
};

interface MonitorModule {
  selfHostedServerMonitor: {
    start(url: string): void;
    stop(): void;
    checkNow(): Promise<void>;
    subscribe(listener: (s: MonitorState) => void): () => void;
    getSnapshot(): MonitorState;
    readonly isOnline: boolean;
  };
}

/**
 * Load a pristine instance of the module. resetModules() guarantees the
 * module-level singleton is re-created so no state bleeds across tests.
 */
async function loadMonitor(): Promise<
  MonitorModule["selfHostedServerMonitor"]
> {
  vi.resetModules();
  const mod =
    (await import("@app/services/selfHostedServerMonitor")) as unknown as MonitorModule;
  return mod.selfHostedServerMonitor;
}

/** A fake Response good enough for the monitor's `.ok` / `.status` reads. */
function makeResponse(status: number): { ok: boolean; status: number } {
  return { ok: status >= 200 && status < 300, status };
}

/** Flush the pending async pollOnce() microtask chain. */
async function flush(): Promise<void> {
  // The immediate pollOnce awaits fetch (already resolved) then updateState;
  // two microtask turns are plenty to settle it.
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: server reachable and healthy.
  fetchMock.mockResolvedValue(makeResponse(200));
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("SelfHostedServerMonitor — initial state & singleton", () => {
  it("starts idle, offline, with no server URL", async () => {
    const monitor = await loadMonitor();
    const snap = monitor.getSnapshot();
    expect(snap).toEqual({ status: "idle", isOnline: false, serverUrl: null });
    expect(monitor.isOnline).toBe(false);
  });

  it("returns the same singleton from getInstance across imports", async () => {
    vi.resetModules();
    const mod =
      (await import("@app/services/selfHostedServerMonitor")) as unknown as MonitorModule & {
        // getInstance is a static on the (unexported) class; reach it via the
        // instance's constructor to prove identity without changing the module.
        selfHostedServerMonitor: { constructor: { getInstance(): unknown } };
      };
    const inst = mod.selfHostedServerMonitor;
    const viaStatic = (
      inst.constructor as { getInstance(): unknown }
    ).getInstance();
    expect(viaStatic).toBe(inst);
  });
});

describe("subscribe", () => {
  it("emits the current state immediately on subscribe", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      status: "idle",
      isOnline: false,
      serverUrl: null,
    });
  });

  it("returns an unsubscribe function that stops further notifications", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    const unsubscribe = monitor.subscribe(listener);
    listener.mockClear();

    unsubscribe();

    // start() would normally emit a "checking" transition; after unsubscribe
    // the listener must not be called again.
    monitor.start("https://server.example.com");
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("start — health check transitions", () => {
  it("transitions checking -> online when the server responds 200", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    monitor.start("https://server.example.com");

    // Immediately seeds the "checking" state synchronously.
    expect(monitor.getSnapshot()).toEqual({
      status: "checking",
      isOnline: false,
      serverUrl: "https://server.example.com",
    });
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "checking" }),
    );

    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.example.com/api/v1/info/status",
      expect.objectContaining({ method: "GET", connectTimeout: 8000 }),
    );
    expect(monitor.getSnapshot()).toEqual({
      status: "online",
      isOnline: true,
      serverUrl: "https://server.example.com",
    });
    expect(monitor.isOnline).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "online", isOnline: true }),
    );
  });

  it("strips a trailing slash from the server URL when building the health URL", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com/");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.example.com/api/v1/info/status",
      expect.anything(),
    );
  });

  it("treats a 401 (auth required) response as online", async () => {
    const monitor = await loadMonitor();
    fetchMock.mockResolvedValue(makeResponse(401));
    monitor.start("https://auth.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("online");
    expect(monitor.isOnline).toBe(true);
  });

  it("treats a 403 (forbidden) response as online", async () => {
    const monitor = await loadMonitor();
    fetchMock.mockResolvedValue(makeResponse(403));
    monitor.start("https://auth.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("online");
    expect(monitor.isOnline).toBe(true);
  });

  it("treats a 500 response as offline", async () => {
    const monitor = await loadMonitor();
    fetchMock.mockResolvedValue(makeResponse(500));
    monitor.start("https://server.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("offline");
    expect(monitor.isOnline).toBe(false);
  });

  it("treats a 404 response as offline", async () => {
    const monitor = await loadMonitor();
    fetchMock.mockResolvedValue(makeResponse(404));
    monitor.start("https://server.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("offline");
  });

  it("treats a thrown fetch (network error) as offline", async () => {
    const monitor = await loadMonitor();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    monitor.start("https://down.example.com");
    await flush();
    expect(monitor.getSnapshot()).toEqual({
      status: "offline",
      isOnline: false,
      serverUrl: "https://down.example.com",
    });
  });
});

describe("start — polling loop & idempotency", () => {
  it("re-polls on the 15s interval", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush(); // immediate poll
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not restart polling when start() is called again with the same URL", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same URL while interval is live => no-op (no extra immediate poll).
    monitor.start("https://server.example.com");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restarts polling (stop + start) when start() is called with a different URL", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://first.example.com");
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://first.example.com/api/v1/info/status",
      expect.anything(),
    );

    monitor.start("https://second.example.com");
    // start() -> stop() resets to idle, then a fresh "checking" + immediate poll.
    expect(monitor.getSnapshot().serverUrl).toBe("https://second.example.com");
    await flush();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://second.example.com/api/v1/info/status",
      expect.anything(),
    );

    // Only the new URL should be polled on subsequent intervals.
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://second.example.com/api/v1/info/status",
      expect.anything(),
    );
  });
});

describe("stop", () => {
  it("clears the interval and resets state to idle", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("online");

    monitor.stop();
    expect(monitor.getSnapshot()).toEqual({
      status: "idle",
      isOnline: false,
      serverUrl: null,
    });

    // No further polls after stop.
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is safe to call when never started (no interval to clear)", async () => {
    const monitor = await loadMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    // Already idle -> updateState produces no change -> no emit.
    expect(() => monitor.stop()).not.toThrow();
    expect(monitor.getSnapshot().status).toBe("idle");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("checkNow", () => {
  it("performs an immediate poll when a server URL is set", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush();
    fetchMock.mockClear();

    await monitor.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.example.com/api/v1/info/status",
      expect.anything(),
    );
  });

  it("flips online->offline on a checkNow that now fails", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush();
    expect(monitor.getSnapshot().status).toBe("online");

    fetchMock.mockRejectedValueOnce(new Error("dropped"));
    await monitor.checkNow();
    expect(monitor.getSnapshot().status).toBe("offline");
    expect(monitor.isOnline).toBe(false);
  });

  it("is a no-op when no server URL is set (never started)", async () => {
    const monitor = await loadMonitor();
    await monitor.checkNow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(monitor.getSnapshot().status).toBe("idle");
  });

  it("is a no-op after stop() clears the server URL", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush();
    monitor.stop();
    fetchMock.mockClear();

    await monitor.checkNow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("updateState change-detection (emit-only-on-change)", () => {
  it("does not re-emit when consecutive polls report the same online status", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush(); // checking -> online (one emit)

    const listener = vi.fn();
    monitor.subscribe(listener); // immediate emit of current state
    listener.mockClear();

    // Second poll returns 200 again -> next state identical -> no emit.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("re-emits only when the status actually changes between polls", async () => {
    const monitor = await loadMonitor();
    monitor.start("https://server.example.com");
    await flush(); // online

    const listener = vi.fn();
    monitor.subscribe(listener);
    listener.mockClear();

    // Next poll fails -> online -> offline (emit).
    fetchMock.mockResolvedValueOnce(makeResponse(503));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "offline", isOnline: false }),
    );

    // Following poll succeeds -> offline -> online (another emit).
    fetchMock.mockResolvedValueOnce(makeResponse(200));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "online", isOnline: true }),
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

    monitor.start("https://server.example.com"); // checking transition
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
