/**
 * Unit tests for the desktop endpoint-configuration hooks (desktop layer).
 *
 * The module exports three React hooks plus three internal pure-ish helpers
 * (isSelfHostedOffline / getErrorMessage / checkDependenciesReady) that are
 * exercised indirectly through the hooks:
 *
 *   - useEndpointEnabled(endpoint)          — single-endpoint resolver
 *   - useMultipleEndpointsEnabled(endpoints) — batch resolver w/ legacy fallback
 *   - useEndpointConfig()                    — backend-URL resolver by mode
 *
 * Every external dependency is mocked with vi.mock for full determinism:
 *   - "@app/services/apiClient"                  -> axios-like get() spy
 *   - "@app/services/tauriBackendService"        -> isOnline / getBackendUrl / subscribeToStatus
 *   - "@app/services/selfHostedServerMonitor"    -> getSnapshot / subscribe
 *   - "@app/services/endpointAvailabilityService"-> isEndpointSupportedLocally
 *   - "@app/services/connectionModeService"      -> getCurrentMode / getCurrentConfig
 *
 * react-i18next is re-mocked here (overriding the global setupTests mock) with
 * a STABLE `t` reference that returns the key verbatim, which keeps the
 * "backend starting" assertions readable AND avoids an infinite render loop the
 * default per-call fresh `t` would otherwise trigger (see note at the mock).
 *
 * The module captures DEFAULT_BACKEND_URL from import.meta.env at load time, so
 * env vars are stubbed BEFORE a fresh dynamic import (loadModule) — mirroring
 * the vi.resetModules() pattern used by connectionModeService.test.ts. Imports
 * use the "@app/*" alias as required by the repo lint rules (desktop layer
 * resolves "@app/*" to src/desktop/*).
 *
 * Fake timers are used to drive the RETRY_DELAY_MS (2500ms) backend-starting
 * retry loop deterministically without any real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

// --- mocks ------------------------------------------------------------------

// react-i18next is mocked globally in setupTests, but that mock returns a FRESH
// `t` function on every useTranslation() call. Both hooks list `t` in the deps
// of their fetch useCallback, so an unstable `t` makes the fetch effect re-run
// on every render; combined with setEndpointStatus/Details always allocating a
// new object, that produces an infinite render loop (OOM) in the test env only
// — the real app passes a stable `t`. Re-mock with a single stable `t`.
// Returns the key verbatim (matching the global setupTests mock convention),
// but is a single stable reference so it never re-triggers the fetch effect.
const stableT = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: stableT,
    i18n: { changeLanguage: () => {} },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const getMock = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

const isOnlineGetter = vi.fn(() => true);
const getBackendUrlMock = vi.fn<() => string | null>(() => null);
const subscribeToStatusMock = vi.fn<
  (listener: (s: string) => void) => () => void
>(() => () => {});
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    get isOnline() {
      return isOnlineGetter();
    },
    getBackendUrl: () => getBackendUrlMock(),
    subscribeToStatus: (listener: (s: string) => void) =>
      subscribeToStatusMock(listener),
  },
}));

const getSnapshotMock = vi.fn<() => { status: string }>(() => ({
  status: "online",
}));
const monitorSubscribeMock = vi.fn<(listener: () => void) => () => void>(
  () => () => {},
);
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => getSnapshotMock(),
    subscribe: (listener: () => void) => monitorSubscribeMock(listener),
  },
}));

const isEndpointSupportedLocallyMock =
  vi.fn<(ep: string, url: string) => Promise<boolean>>();
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: (ep: string, url: string) =>
      isEndpointSupportedLocallyMock(ep, url),
  },
}));

// backendErrors transitively imports @app/i18n which runs a real, heavy
// i18next .init() at module load. Re-importing that on every vi.resetModules()
// re-runs the init (and its TOML backend loader) repeatedly, which exhausts
// memory. Stub it with the same BACKEND_NOT_READY detection logic the hook uses
// so the module-under-test never pulls in the real i18n graph.
const BACKEND_NOT_READY_CODE = "BACKEND_NOT_READY";
vi.mock("@app/constants/backendErrors", () => ({
  BACKEND_NOT_READY_CODE,
  isBackendNotReadyError: (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === BACKEND_NOT_READY_CODE,
}));

const getCurrentModeMock = vi.fn<() => Promise<string>>(() =>
  Promise.resolve("local"),
);
const getCurrentConfigMock = vi.fn<() => Promise<unknown>>(() =>
  Promise.resolve({ mode: "saas", server_config: null }),
);
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => getCurrentModeMock(),
    getCurrentConfig: () => getCurrentConfigMock(),
  },
}));

// --- helpers ----------------------------------------------------------------

type Module = typeof import("@app/hooks/useEndpointConfig");

/** Load a pristine copy of the module so DEFAULT_BACKEND_URL re-reads env. */
async function loadModule(): Promise<Module> {
  vi.resetModules();
  return import("@app/hooks/useEndpointConfig");
}

/**
 * Renders useMultipleEndpointsEnabled with a STABLE endpoints array reference.
 *
 * Passing an inline array literal directly to the hook would create a new
 * reference on every internal re-render; because `endpoints` is a dependency of
 * the hook's fetch effect, that would re-trigger the effect -> setState ->
 * re-render in an infinite loop. renderHook's initialProps keeps the reference
 * fixed across the hook's own re-renders (it only changes on an explicit
 * rerender), which mirrors how real callers pass a memoized array.
 */
function renderMulti(
  hook: Module["useMultipleEndpointsEnabled"],
  endpoints: string[],
) {
  return renderHook((eps: string[]) => hook(eps), {
    initialProps: endpoints,
  });
}

/** Builds an axios-style error so the real isAxiosError() returns true. */
function axiosError(opts: {
  status?: number;
  message?: string;
  dataMessage?: string;
}): Error & { isAxiosError: true } {
  const err = new Error(opts.message ?? "request failed") as Error & {
    isAxiosError: true;
    response?: { status?: number; data?: { message?: string } };
  };
  err.isAxiosError = true;
  err.response = {
    status: opts.status,
    data:
      opts.dataMessage !== undefined
        ? { message: opts.dataMessage }
        : undefined,
  };
  return err;
}

/** Builds a BACKEND_NOT_READY error recognised by isBackendNotReadyError(). */
function backendNotReadyError(): Error & { code: string } {
  return Object.assign(new Error("starting"), {
    code: "BACKEND_NOT_READY",
  });
}

/** Resolves a successful app-config probe (dependenciesReady=true). */
function dependenciesReady(ready: boolean) {
  return Promise.resolve({ data: { dependenciesReady: ready } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults: online local backend, online self-hosted monitor, local mode.
  isOnlineGetter.mockReturnValue(true);
  getBackendUrlMock.mockReturnValue(null);
  subscribeToStatusMock.mockReturnValue(() => {});
  getSnapshotMock.mockReturnValue({ status: "online" });
  monitorSubscribeMock.mockReturnValue(() => {});
  getCurrentModeMock.mockResolvedValue("local");
  getCurrentConfigMock.mockResolvedValue({
    mode: "saas",
    server_config: null,
  });
  // Quiet the chatty console.debug/console.error calls.
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Deterministic env for DEFAULT_BACKEND_URL resolution.
  vi.stubEnv("VITE_DESKTOP_BACKEND_URL", "http://localhost:8080");
  vi.stubEnv("VITE_API_BASE_URL", "http://fallback:9090");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ===========================================================================
// useEndpointEnabled
// ===========================================================================

describe("useEndpointEnabled", () => {
  it("returns enabled=null for an empty endpoint and never calls the API", async () => {
    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled(""));

    await waitFor(() => expect(result.current.enabled).toBeNull());
    expect(result.current.loading).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("resolves enabled=true when the endpoint is supported locally", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true)) // checkDependenciesReady
      .mockReturnValueOnce(Promise.resolve({ data: true })); // endpoint-enabled

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.error).toBeNull();
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/config/endpoint-enabled?endpoint=merge-pdfs",
      { suppressErrorToast: true },
    );
  });

  it("stays unresolved (no endpoint call) while dependencies are not ready", async () => {
    getMock.mockReturnValueOnce(dependenciesReady(false));

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    // Only the app-config probe ran; the endpoint-enabled call is skipped.
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    // Optimistic initial value retained.
    expect(result.current.enabled).toBe(true);
  });

  it("treats a thrown app-config probe as dependencies-not-ready", async () => {
    getMock.mockImplementationOnce(() =>
      Promise.reject(new Error("config down")),
    );

    const { useEndpointEnabled } = await loadModule();
    renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(getMock).toHaveBeenCalledWith("/api/v1/config/app-config", {
      suppressErrorToast: true,
    });
  });

  it("keeps a locally-disabled endpoint disabled in non-saas (local) mode", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: false }));
    getCurrentModeMock.mockResolvedValue("local");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(getCurrentModeMock).toHaveBeenCalled();
  });

  it("forces a locally-disabled endpoint to enabled in saas mode (SaaS routing)", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: false }));
    getCurrentModeMock.mockResolvedValue("saas");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("surfaces a generic error and disables in non-saas mode on check failure", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ dataMessage: "boom from server" })),
      );
    getCurrentModeMock.mockResolvedValue("local");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.error).toBe("boom from server"));
    expect(result.current.enabled).toBe(false);
  });

  it("recovers to enabled=true on check failure when in saas mode", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ message: "neterr" })),
      );
    getCurrentModeMock.mockResolvedValue("saas");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("shows the 'backend starting' message and retries after RETRY_DELAY_MS", async () => {
    vi.useFakeTimers();
    getMock
      .mockImplementationOnce(() => dependenciesReady(true)) // 1st: deps ready
      .mockImplementationOnce(() => Promise.reject(backendNotReadyError())) // 2nd: starting
      .mockImplementationOnce(() => dependenciesReady(true)) // 3rd: retry deps ready
      .mockImplementationOnce(() => Promise.resolve({ data: true })); // 4th: enabled

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    // Flush the mount-time async chain (deps probe + endpoint check rejection).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error).toBe("backendHealth.starting");

    // Drive the scheduled retry timer and flush the retry's async chain.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.enabled).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it("optimistically enables when self-hosted is offline and a local backend exists", async () => {
    getSnapshotMock.mockReturnValue({ status: "offline" });
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    // No remote app-config probe happens in the self-hosted-offline branch.
    expect(getMock).not.toHaveBeenCalled();
    // It subscribes to the self-hosted monitor for recovery.
    expect(monitorSubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks the endpoint when the self-hosted server comes back online", async () => {
    getSnapshotMock.mockReturnValue({ status: "offline" });
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");
    let monitorListener: (() => void) | null = null;
    monitorSubscribeMock.mockImplementation((listener) => {
      monitorListener = listener;
      return () => {};
    });
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: true }));

    const { useEndpointEnabled } = await loadModule();
    renderHook(() => useEndpointEnabled("merge-pdfs"));

    // Simulate the server recovering: snapshot back online + backend online.
    getSnapshotMock.mockReturnValue({ status: "online" });
    isOnlineGetter.mockReturnValue(true);
    await act(async () => {
      monitorListener?.();
    });

    await waitFor(() => expect(getMock).toHaveBeenCalled());
  });

  it("subscribes to backend status and re-fetches when it turns healthy", async () => {
    let statusListener: ((s: string) => void) | null = null;
    subscribeToStatusMock.mockImplementation((listener) => {
      statusListener = listener;
      return () => {};
    });
    // Backend not online at mount -> only the subscription wires up.
    isOnlineGetter.mockReturnValue(false);
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: true }));

    const { useEndpointEnabled } = await loadModule();
    renderHook(() => useEndpointEnabled("merge-pdfs"));

    expect(getMock).not.toHaveBeenCalled();

    await act(async () => {
      statusListener?.("healthy");
    });

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });

  it("refetch() can be invoked manually to re-resolve the endpoint", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: true }))
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: true }));

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });

    expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

// ===========================================================================
// useMultipleEndpointsEnabled
// ===========================================================================

describe("useMultipleEndpointsEnabled", () => {
  it("clears status and stops loading for an empty endpoint list", async () => {
    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, []);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus).toEqual({});
    expect(getMock).not.toHaveBeenCalled();
  });

  it("resolves each endpoint locally when self-hosted is offline", async () => {
    getSnapshotMock.mockReturnValue({ status: "offline" });
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");
    isEndpointSupportedLocallyMock.mockImplementation((ep) =>
      Promise.resolve(ep === "merge-pdfs"),
    );

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
      "merge-pdfs",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({
        "merge-pdfs": true,
        "ocr-pdf": false,
      }),
    );
    expect(result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: false,
      reason: "NOT_SUPPORTED_LOCALLY",
    });
    expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
      enabled: true,
      reason: null,
    });
    // Deduplicated -> only two probes despite the repeated endpoint.
    expect(isEndpointSupportedLocallyMock).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown local-support probe as unsupported when offline", async () => {
    getSnapshotMock.mockReturnValue({ status: "offline" });
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");
    isEndpointSupportedLocallyMock.mockRejectedValue(new Error("probe failed"));

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({ "merge-pdfs": false }),
    );
  });

  it("resolves via the new availability API and normalizes missing fields", async () => {
    const apiData: Record<string, Partial<EndpointAvailabilityDetails>> = {
      "merge-pdfs": { enabled: true, reason: null },
      "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
      // missing enabled/reason -> normalized to {enabled:false, reason:null}
      "weird-endpoint": {},
    };
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: apiData }));
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
      "weird-endpoint",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(result.current.endpointStatus["ocr-pdf"]).toBe(false);
    expect(result.current.endpointStatus["weird-endpoint"]).toBe(false);
    expect(result.current.endpointDetails["weird-endpoint"]).toEqual({
      enabled: false,
      reason: null,
    });
  });

  it("falls back to the legacy ?endpoints= query when the server returns 400", async () => {
    const legacyData = { "merge-pdfs": { enabled: true, reason: null } };
    getMock
      .mockReturnValueOnce(dependenciesReady(true)) // app-config
      .mockImplementationOnce(() => Promise.reject(axiosError({ status: 400 }))) // new API 400
      .mockReturnValueOnce(Promise.resolve({ data: legacyData })); // legacy retry
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(getMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/config/endpoints-availability?endpoints=merge-pdfs",
      { suppressErrorToast: true },
    );
  });

  it("rethrows non-400 availability errors into the catch (fallback disabled)", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ status: 500 })),
      );
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(false),
    );
    expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
      enabled: false,
      reason: "UNKNOWN",
    });
    expect(result.current.endpointStatus["ocr-pdf"]).toBe(false);
  });

  it("marks disabled endpoints enabled in saas mode (SaaS routing)", async () => {
    const apiData = {
      "merge-pdfs": { enabled: true, reason: null },
      "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
    };
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockReturnValueOnce(Promise.resolve({ data: apiData }));
    getCurrentModeMock.mockResolvedValue("saas");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus["ocr-pdf"]).toBe(true),
    );
    expect(result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it("shows 'backend starting' and retries on a BACKEND_NOT_READY error", async () => {
    vi.useFakeTimers();
    const okData = { "merge-pdfs": { enabled: true, reason: null } };
    getMock
      .mockImplementationOnce(() => dependenciesReady(true)) // app-config
      .mockImplementationOnce(() => Promise.reject(backendNotReadyError())) // availability -> starting
      .mockImplementationOnce(() => dependenciesReady(true)) // retry app-config
      .mockImplementationOnce(() => Promise.resolve({ data: okData })); // retry availability
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error).toBe("backendHealth.starting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.endpointStatus["merge-pdfs"]).toBe(true);
  });

  it("populates fallback statuses and surfaces the error in non-saas mode", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ status: 500, dataMessage: "kaboom" })),
      );
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
    ]);

    await waitFor(() => expect(result.current.error).toBe("kaboom"));
    expect(result.current.endpointStatus).toEqual({
      "merge-pdfs": false,
      "ocr-pdf": false,
    });
    expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
      enabled: false,
      reason: "UNKNOWN",
    });
  });

  it("overrides the error fallback to enabled for all endpoints in saas mode", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ status: 500 })),
      );
    getCurrentModeMock.mockResolvedValue("saas");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus).toEqual({
        "merge-pdfs": true,
        "ocr-pdf": true,
      }),
    );
    expect(result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it("stays unresolved while dependencies are not ready (online mode)", async () => {
    getMock.mockReturnValueOnce(dependenciesReady(false));

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    expect(result.current.endpointStatus).toEqual({});
  });

  it("wires the self-hosted monitor and re-fetches on recovery", async () => {
    getSnapshotMock.mockReturnValue({ status: "offline" });
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");
    isEndpointSupportedLocallyMock.mockResolvedValue(true);
    let monitorListener: (() => void) | null = null;
    monitorSubscribeMock.mockImplementation((listener) => {
      monitorListener = listener;
      return () => {};
    });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );

    // Recovery: snapshot online + backend online triggers a fresh fetch.
    getSnapshotMock.mockReturnValue({ status: "online" });
    isOnlineGetter.mockReturnValue(true);
    getMock.mockReturnValueOnce(dependenciesReady(true)).mockReturnValueOnce(
      Promise.resolve({
        data: { "merge-pdfs": { enabled: true, reason: null } },
      }),
    );
    await act(async () => {
      monitorListener?.();
    });

    await waitFor(() => expect(getMock).toHaveBeenCalled());
  });

  it("subscribes to backend status and re-fetches when it turns healthy", async () => {
    isOnlineGetter.mockReturnValue(false);
    let statusListener: ((s: string) => void) | null = null;
    subscribeToStatusMock.mockImplementation((listener) => {
      statusListener = listener;
      return () => {};
    });
    getMock.mockReturnValueOnce(dependenciesReady(true)).mockReturnValueOnce(
      Promise.resolve({
        data: { "merge-pdfs": { enabled: true, reason: null } },
      }),
    );
    getCurrentModeMock.mockResolvedValue("local");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    expect(getMock).not.toHaveBeenCalled();

    await act(async () => {
      statusListener?.("healthy");
    });

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
  });
});

// ===========================================================================
// useEndpointConfig
// ===========================================================================

describe("useEndpointConfig", () => {
  it("starts with the default backend URL from env vars", async () => {
    // Self-hosted config arrives async; the initial render is the env default.
    getCurrentConfigMock.mockResolvedValue({
      mode: "saas",
      server_config: null,
    });

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    expect(result.current.backendUrl).toBe("http://localhost:8080");
  });

  it("switches to the self-hosted server URL in selfhosted mode", async () => {
    getCurrentConfigMock.mockResolvedValue({
      mode: "selfhosted",
      server_config: { url: "https://my-server.example.com" },
    });

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    await waitFor(() =>
      expect(result.current.backendUrl).toBe("https://my-server.example.com"),
    );
  });

  it("keeps the env default in saas mode even after config resolves", async () => {
    getCurrentConfigMock.mockResolvedValue({
      mode: "saas",
      server_config: { url: "https://ignored.example.com" },
    });

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    await waitFor(() => expect(getCurrentConfigMock).toHaveBeenCalled());
    expect(result.current.backendUrl).toBe("http://localhost:8080");
  });

  it("falls back to env default when selfhosted has no server URL", async () => {
    getCurrentConfigMock.mockResolvedValue({
      mode: "selfhosted",
      server_config: null,
    });

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    await waitFor(() => expect(getCurrentConfigMock).toHaveBeenCalled());
    expect(result.current.backendUrl).toBe("http://localhost:8080");
  });

  it("keeps the current URL when getCurrentConfig rejects", async () => {
    getCurrentConfigMock.mockRejectedValue(new Error("config ipc down"));

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    await waitFor(() => expect(getCurrentConfigMock).toHaveBeenCalled());
    expect(result.current.backendUrl).toBe("http://localhost:8080");
  });

  it("falls back to VITE_API_BASE_URL when VITE_DESKTOP_BACKEND_URL is unset", async () => {
    vi.stubEnv("VITE_DESKTOP_BACKEND_URL", "");
    getCurrentConfigMock.mockResolvedValue({
      mode: "saas",
      server_config: null,
    });

    const { useEndpointConfig } = await loadModule();
    const { result } = renderHook(() => useEndpointConfig());

    expect(result.current.backendUrl).toBe("http://fallback:9090");
  });
});

// ===========================================================================
// getErrorMessage branches (exercised via useEndpointEnabled error path)
// ===========================================================================

describe("getErrorMessage (via error surfacing)", () => {
  it("uses a plain Error.message when the failure is not an axios error", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() => Promise.reject(new Error("plain failure")));
    getCurrentModeMock.mockResolvedValue("local");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.error).toBe("plain failure"));
  });

  it("falls back to a generic message for a non-Error rejection value", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() => Promise.reject("just a string"));
    getCurrentModeMock.mockResolvedValue("local");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() =>
      expect(result.current.error).toBe("Unknown error occurred"),
    );
  });

  it("uses the axios top-level message when response.data has no message", async () => {
    getMock
      .mockReturnValueOnce(dependenciesReady(true))
      .mockImplementationOnce(() =>
        Promise.reject(axiosError({ status: 500, message: "axios top msg" })),
      );
    getCurrentModeMock.mockResolvedValue("local");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.error).toBe("axios top msg"));
  });
});
