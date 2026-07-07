/**
 * Unit tests for the useConversionCloudStatus desktop hook.
 *
 * The hook maps every conversion pair in EXTENSION_TO_ENDPOINT to an
 * availability / cloudStatus / localOnly triple, branching on:
 *   - connectionModeService.getCurrentMode()      → "selfhosted" | "saas" | other
 *   - selfHostedServerMonitor.getSnapshot().status → "offline" gates the local-only path
 *   - tauriBackendService.getBackendUrl() / isOnline
 *   - endpointAvailabilityService.isEndpointSupportedLocally() (+ thrown errors)
 *
 * Every external service is mocked with vi.mock for full determinism; the real
 * EXTENSION_TO_ENDPOINT matrix and getEndpointName() are used so the pair-
 * collection loops execute against real data. The two subscription callbacks
 * (tauriBackendService.subscribeToStatus and selfHostedServerMonitor.subscribe)
 * are captured so the re-check / skip-first / unsubscribe paths can be driven
 * explicitly.
 *
 * Imports use the "@app/*" alias as required by the repo lint rules; for the
 * desktop layer "@app/*" resolves across src/desktop, src/proprietary and
 * src/core (so the services resolve to src/desktop and the constants/utils to
 * src/core).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

type ConnectionMode = "saas" | "selfhosted" | "local";
type BackendStatus = "stopped" | "starting" | "healthy" | "unhealthy";
interface SelfHostedSnapshot {
  status: "idle" | "checking" | "online" | "offline";
  isOnline: boolean;
  serverUrl: string | null;
}

// --- service mocks ----------------------------------------------------------
// Module-scoped fns referenced (not captured by value) inside the hoisted
// vi.mock factories so each test can reconfigure behaviour freely.

const getCurrentModeMock = vi.fn<() => Promise<ConnectionMode>>();
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => getCurrentModeMock(),
  },
}));

const isEndpointSupportedLocallyMock =
  vi.fn<(endpoint: string, url: string | null) => Promise<boolean>>();
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: (endpoint: string, url: string | null) =>
      isEndpointSupportedLocallyMock(endpoint, url),
  },
}));

let backendIsOnline = true;
const getBackendUrlMock = vi.fn<() => string | null>(
  () => "http://127.0.0.1:8080",
);
let tauriStatusListener: ((status: BackendStatus) => void) | null = null;
const tauriUnsubscribeMock = vi.fn();
const subscribeToStatusMock = vi.fn(
  (listener: (status: BackendStatus) => void) => {
    tauriStatusListener = listener;
    return tauriUnsubscribeMock;
  },
);
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    get isOnline() {
      return backendIsOnline;
    },
    getBackendUrl: () => getBackendUrlMock(),
    subscribeToStatus: (listener: (status: BackendStatus) => void) =>
      subscribeToStatusMock(listener),
  },
}));

let selfHostedSnapshot: SelfHostedSnapshot = {
  status: "idle",
  isOnline: false,
  serverUrl: null,
};
const getSnapshotMock = vi.fn<() => SelfHostedSnapshot>(
  () => selfHostedSnapshot,
);
let selfHostedListener: ((state: SelfHostedSnapshot) => void) | null = null;
let invokeSelfHostedListenerOnSubscribe = true;
const selfHostedUnsubscribeMock = vi.fn();
const selfHostedSubscribeMock = vi.fn(
  (listener: (state: SelfHostedSnapshot) => void) => {
    selfHostedListener = listener;
    // The real monitor immediately emits current state on subscribe; the hook
    // relies on this to drive its skip-first logic. Reproduce it by default.
    if (invokeSelfHostedListenerOnSubscribe) listener(selfHostedSnapshot);
    return selfHostedUnsubscribeMock;
  },
);
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => getSnapshotMock(),
    subscribe: (listener: (state: SelfHostedSnapshot) => void) =>
      selfHostedSubscribeMock(listener),
  },
}));

// --- module under test (imported after mocks are registered) ----------------
import { useConversionCloudStatus } from "@app/hooks/useConversionCloudStatus";
import { EXTENSION_TO_ENDPOINT } from "@app/constants/convertConstants";
import { getEndpointName } from "@app/utils/convertUtils";

/** Build the full set of real conversion keys the hook iterates over. */
function allConversionKeys(): string[] {
  const keys: string[] = [];
  for (const fromExt of Object.keys(EXTENSION_TO_ENDPOINT)) {
    for (const toExt of Object.keys(EXTENSION_TO_ENDPOINT[fromExt] || {})) {
      if (getEndpointName(fromExt, toExt)) keys.push(`${fromExt}-${toExt}`);
    }
  }
  return keys;
}
const CONVERSION_KEYS = allConversionKeys();
// Sanity guard: the matrix should yield a non-trivial number of pairs so the
// loops actually run over real data.
if (CONVERSION_KEYS.length < 10) {
  throw new Error("Expected the real conversion matrix to produce many pairs");
}

beforeEach(() => {
  vi.clearAllMocks();
  tauriStatusListener = null;
  selfHostedListener = null;
  backendIsOnline = true;
  invokeSelfHostedListenerOnSubscribe = true;
  selfHostedSnapshot = { status: "idle", isOnline: false, serverUrl: null };
  getBackendUrlMock.mockReturnValue("http://127.0.0.1:8080");
  getSnapshotMock.mockImplementation(() => selfHostedSnapshot);
  // Sensible defaults; individual tests override.
  getCurrentModeMock.mockResolvedValue("local");
  isEndpointSupportedLocallyMock.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useConversionCloudStatus — non-SaaS / guard branches", () => {
  it("returns empty maps in 'local' mode (local endpoint checking handles it)", async () => {
    getCurrentModeMock.mockResolvedValue("local");
    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(getCurrentModeMock).toHaveBeenCalled();
    });
    expect(result.current.availability).toEqual({});
    expect(result.current.cloudStatus).toEqual({});
    expect(result.current.localOnly).toEqual({});
    // local mode never queries endpoint support
    expect(isEndpointSupportedLocallyMock).not.toHaveBeenCalled();
  });

  it("returns empty maps when the backend is not yet online (SaaS startup guard)", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    backendIsOnline = false;

    const { result } = renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(getCurrentModeMock).toHaveBeenCalled();
    });
    expect(result.current.availability).toEqual({});
    expect(result.current.cloudStatus).toEqual({});
    expect(result.current.localOnly).toEqual({});
    // Guarded before any endpoint check runs.
    expect(isEndpointSupportedLocallyMock).not.toHaveBeenCalled();
  });
});

describe("useConversionCloudStatus — SaaS mode cloud routing", () => {
  it("marks every pair available; willUseCloud=false when supported locally", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    isEndpointSupportedLocallyMock.mockResolvedValue(true);

    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(Object.keys(result.current.availability).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    for (const key of CONVERSION_KEYS) {
      expect(result.current.availability[key]).toBe(true);
      expect(result.current.cloudStatus[key]).toBe(false);
      expect(result.current.localOnly[key]).toBe(false);
    }
    // Each pair triggers a local-support probe against the backend URL.
    expect(isEndpointSupportedLocallyMock).toHaveBeenCalledWith(
      expect.any(String),
      "http://127.0.0.1:8080",
    );
  });

  it("marks willUseCloud=true when a pair is NOT supported locally", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    isEndpointSupportedLocallyMock.mockResolvedValue(false);

    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(Object.keys(result.current.cloudStatus).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    for (const key of CONVERSION_KEYS) {
      expect(result.current.availability[key]).toBe(true);
      expect(result.current.cloudStatus[key]).toBe(true);
      expect(result.current.localOnly[key]).toBe(false);
    }
  });

  it("on a local-probe error, defaults to available-via-cloud and logs", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    isEndpointSupportedLocallyMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(Object.keys(result.current.availability).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    for (const key of CONVERSION_KEYS) {
      expect(result.current.availability[key]).toBe(true);
      expect(result.current.cloudStatus[key]).toBe(true);
      expect(result.current.localOnly[key]).toBe(false);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("handles a mix of locally-supported and unsupported endpoints", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    // Support only endpoints whose name starts with "pdf-" locally.
    isEndpointSupportedLocallyMock.mockImplementation(
      async (endpoint: string) => endpoint.startsWith("pdf-"),
    );

    const { result } = renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(Object.keys(result.current.cloudStatus).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    let sawLocal = false;
    let sawCloud = false;
    for (const fromExt of Object.keys(EXTENSION_TO_ENDPOINT)) {
      for (const toExt of Object.keys(EXTENSION_TO_ENDPOINT[fromExt] || {})) {
        const endpoint = getEndpointName(fromExt, toExt);
        if (!endpoint) continue;
        const key = `${fromExt}-${toExt}`;
        const expectedCloud = !endpoint.startsWith("pdf-");
        expect(result.current.cloudStatus[key]).toBe(expectedCloud);
        if (expectedCloud) sawCloud = true;
        else sawLocal = true;
      }
    }
    expect(sawLocal).toBe(true);
    expect(sawCloud).toBe(true);
  });
});

describe("useConversionCloudStatus — self-hosted offline (local-only) path", () => {
  it("checks each pair against the local backend with no cloud routing", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    selfHostedSnapshot = {
      status: "offline",
      isOnline: false,
      serverUrl: "https://remote.example.com",
    };
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:9000");
    isEndpointSupportedLocallyMock.mockResolvedValue(true);

    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(Object.keys(result.current.availability).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    for (const key of CONVERSION_KEYS) {
      expect(result.current.availability[key]).toBe(true);
      expect(result.current.cloudStatus[key]).toBe(false);
      // Locally supported => available ONLY locally.
      expect(result.current.localOnly[key]).toBe(true);
    }
    expect(isEndpointSupportedLocallyMock).toHaveBeenCalledWith(
      expect.any(String),
      "http://127.0.0.1:9000",
    );
  });

  it("marks unsupported pairs unavailable and swallows per-pair probe errors", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    selfHostedSnapshot = {
      status: "offline",
      isOnline: false,
      serverUrl: "https://remote.example.com",
    };
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:9000");
    // First half of calls throw, rest resolve false → all unsupported.
    isEndpointSupportedLocallyMock.mockImplementation(
      async (endpoint: string) => {
        if (endpoint.includes("img")) throw new Error("boom");
        return false;
      },
    );

    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(Object.keys(result.current.availability).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    for (const key of CONVERSION_KEYS) {
      expect(result.current.availability[key]).toBe(false);
      expect(result.current.cloudStatus[key]).toBe(false);
      expect(result.current.localOnly[key]).toBe(false);
    }
  });

  it("falls back to empty maps when self-hosted server is online (not offline)", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    selfHostedSnapshot = {
      status: "online",
      isOnline: true,
      serverUrl: "https://remote.example.com",
    };
    getBackendUrlMock.mockReturnValue("http://127.0.0.1:9000");

    const { result } = renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(getCurrentModeMock).toHaveBeenCalled();
    });

    expect(result.current.availability).toEqual({});
    expect(result.current.cloudStatus).toEqual({});
    expect(result.current.localOnly).toEqual({});
    // Online self-hosted defers to normal endpoint checking — no probes.
    expect(isEndpointSupportedLocallyMock).not.toHaveBeenCalled();
  });

  it("falls back to empty maps when offline but the local backend URL is missing", async () => {
    getCurrentModeMock.mockResolvedValue("selfhosted");
    selfHostedSnapshot = {
      status: "offline",
      isOnline: false,
      serverUrl: "https://remote.example.com",
    };
    getBackendUrlMock.mockReturnValue(null);

    const { result } = renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(getCurrentModeMock).toHaveBeenCalled();
    });

    expect(result.current.availability).toEqual({});
    expect(result.current.cloudStatus).toEqual({});
    expect(result.current.localOnly).toEqual({});
    expect(isEndpointSupportedLocallyMock).not.toHaveBeenCalled();
  });
});

describe("useConversionCloudStatus — subscriptions & lifecycle", () => {
  it("subscribes to both monitors and unsubscribes on unmount", async () => {
    getCurrentModeMock.mockResolvedValue("local");
    const { unmount } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => {
      expect(subscribeToStatusMock).toHaveBeenCalledTimes(1);
    });
    expect(selfHostedSubscribeMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(tauriUnsubscribeMock).toHaveBeenCalledTimes(1);
    expect(selfHostedUnsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("re-runs the check when the tauri backend reports 'healthy'", async () => {
    getCurrentModeMock.mockResolvedValue("saas");
    isEndpointSupportedLocallyMock.mockResolvedValue(true);

    const { result } = renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(Object.keys(result.current.availability).length).toBe(
        CONVERSION_KEYS.length,
      );
    });

    const callsBefore = getCurrentModeMock.mock.calls.length;

    // A non-healthy push must NOT trigger a re-check.
    await act(async () => {
      tauriStatusListener?.("unhealthy");
      await Promise.resolve();
    });
    expect(getCurrentModeMock.mock.calls.length).toBe(callsBefore);

    // A healthy push re-runs checkConversions().
    await act(async () => {
      tauriStatusListener?.("healthy");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getCurrentModeMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("skips the first self-hosted emission, then re-checks on later emissions", async () => {
    getCurrentModeMock.mockResolvedValue("local");

    renderHook(() => useConversionCloudStatus());
    await waitFor(() => {
      expect(selfHostedSubscribeMock).toHaveBeenCalledTimes(1);
    });

    // The initial synchronous emission on subscribe is skipped, so only the
    // initial checkConversions() call has happened so far.
    const callsAfterMount = getCurrentModeMock.mock.calls.length;

    // A subsequent emission (server status change) DOES trigger a re-check.
    await act(async () => {
      selfHostedListener?.({
        status: "offline",
        isOnline: false,
        serverUrl: "https://remote.example.com",
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getCurrentModeMock.mock.calls.length).toBeGreaterThan(
        callsAfterMount,
      );
    });
  });
});
