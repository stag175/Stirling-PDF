/**
 * Unit tests for the CORE endpoint-configuration hooks
 * (frontend/editor/src/core/hooks/useEndpointConfig.ts).
 *
 * The module exports two React hooks backed by module-level global state
 * (globalFetchDone + globalEndpointCache) and the proprietary jwt-available
 * refetch wiring:
 *
 *   - useEndpointEnabled(endpoint)           — single-endpoint resolver that
 *     hits /api/v1/config/endpoint-enabled and surfaces enabled/loading/error.
 *   - useMultipleEndpointsEnabled(endpoints) — batch resolver that hits
 *     /api/v1/config/endpoints-availability once, populates a process-global
 *     cache, normalizes missing enabled/reason, then serves later renders from
 *     that cache. It has a 401 "optimistic fallback" branch, a generic-error
 *     optimistic-fallback branch, and an auth-change handler that clears the
 *     cache and force-refetches.
 *
 * Every external dependency is mocked with vi.mock for full determinism:
 *   - "@app/services/apiClient"        -> axios-like get() spy
 *   - "@app/hooks/useJwtConfigSync"    -> captures the auth-change callback so
 *     the jwt-available refetch branch can be driven without a real event bus.
 *
 * `axios`'s isAxiosError is NOT mocked; instead the helper below builds a real
 * axios-shaped error (isAxiosError:true) so the genuine guard returns true.
 *
 * The module keeps `globalFetchDone`/`globalEndpointCache` at module scope, so
 * each test loads a pristine copy via loadModule() (vi.resetModules()) to avoid
 * cross-test cache bleed. The endpoints array is passed through renderHook
 * initialProps with a stable reference to avoid an effect-driven render loop.
 *
 * Imports use the "@app/*" alias (core layer -> src/core/*) per repo lint rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

// --- mocks ------------------------------------------------------------------

const getMock = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

// Capture the auth-change callback the hook registers with useJwtConfigSync so
// the jwt-available refetch path (resetGlobalCache + force fetch) is testable.
let capturedAuthCallback: ((force?: boolean) => void) | null = null;
const useJwtConfigSyncMock = vi.fn((cb: (force?: boolean) => void) => {
  capturedAuthCallback = cb;
  return { isAuthPage: false };
});
vi.mock("@app/hooks/useJwtConfigSync", () => ({
  useJwtConfigSync: (cb: (force?: boolean) => void) => useJwtConfigSyncMock(cb),
}));

// --- helpers ----------------------------------------------------------------

type Module = typeof import("@app/hooks/useEndpointConfig");

/** Load a pristine copy of the module so the module-level cache starts empty. */
async function loadModule(): Promise<Module> {
  vi.resetModules();
  return import("@app/hooks/useEndpointConfig");
}

/**
 * Renders useMultipleEndpointsEnabled with a STABLE endpoints array reference.
 * An inline array literal would change identity on every internal re-render and
 * re-trigger the fetch effect in a loop; initialProps fixes the reference,
 * mirroring how real callers pass a memoized array.
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
}): Error & { isAxiosError: true } {
  const err = new Error(opts.message ?? "request failed") as Error & {
    isAxiosError: true;
    response?: { status?: number };
  };
  err.isAxiosError = true;
  err.response = { status: opts.status };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedAuthCallback = null;
  useJwtConfigSyncMock.mockImplementation((cb: (force?: boolean) => void) => {
    capturedAuthCallback = cb;
    return { isAuthPage: false };
  });
  // Quiet the chatty console.debug/warn/error calls the hook emits.
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// useEndpointEnabled
// ===========================================================================

describe("useEndpointEnabled", () => {
  it("returns enabled=null for an empty endpoint and never calls the API", async () => {
    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled(""));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBeNull();
    expect(result.current.error).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("resolves enabled=true from the endpoint-enabled API", async () => {
    getMock.mockResolvedValueOnce({ data: true });

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/config/endpoint-enabled?endpoint=merge-pdfs",
    );
  });

  it("resolves enabled=false and url-encodes the endpoint name", async () => {
    getMock.mockResolvedValueOnce({ data: false });

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("convert/to pdf"));

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/config/endpoint-enabled?endpoint=convert%2Fto%20pdf",
    );
  });

  it("surfaces the Error.message when the API rejects with an Error", async () => {
    getMock.mockRejectedValueOnce(new Error("boom from server"));

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() => expect(result.current.error).toBe("boom from server"));
    expect(result.current.loading).toBe(false);
    // enabled stays at its initial null when the check fails.
    expect(result.current.enabled).toBeNull();
  });

  it("falls back to a generic message for a non-Error rejection value", async () => {
    getMock.mockRejectedValueOnce("just a string");

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("ocr-pdf"));

    await waitFor(() =>
      expect(result.current.error).toBe("Unknown error occurred"),
    );
  });

  it("re-fetches when the endpoint prop changes", async () => {
    getMock
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: false });

    const { useEndpointEnabled } = await loadModule();
    const { result, rerender } = renderHook(
      (ep: string) => useEndpointEnabled(ep),
      { initialProps: "merge-pdfs" },
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));

    rerender("ocr-pdf");

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/config/endpoint-enabled?endpoint=ocr-pdf",
    );
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("refetch() re-runs the resolution and clears a prior error", async () => {
    getMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ data: true });

    const { useEndpointEnabled } = await loadModule();
    const { result } = renderHook(() => useEndpointEnabled("merge-pdfs"));

    await waitFor(() => expect(result.current.error).toBe("transient"));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.enabled).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(2);
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
    expect(result.current.endpointDetails).toEqual({});
    expect(result.current.error).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("resolves via the availability API, normalizing missing fields and defaulting unknown endpoints to enabled", async () => {
    const apiData: Record<string, Partial<EndpointAvailabilityDetails>> = {
      "merge-pdfs": { enabled: true, reason: null },
      "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
      // missing enabled/reason -> normalized to {enabled:true, reason:null}
      "weird-endpoint": {},
    };
    getMock.mockResolvedValueOnce({ data: apiData });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
      // not present in the server response -> defaults to enabled (no details)
      "never-heard-of-it",
    ]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.endpointStatus["ocr-pdf"]).toBe(false);
    expect(result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: false,
      reason: "DEPENDENCY",
    });
    // Endpoint absent from the requested set is not surfaced.
    expect(result.current.endpointStatus["weird-endpoint"]).toBeUndefined();
    // Requested endpoint missing from the server payload -> optimistic enabled.
    expect(result.current.endpointStatus["never-heard-of-it"]).toBe(true);
    expect(result.current.endpointDetails["never-heard-of-it"]).toBeUndefined();
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/config/endpoints-availability",
    );
  });

  it("normalizes a null enabled flag from the server to true", async () => {
    getMock.mockResolvedValueOnce({
      data: { "merge-pdfs": { enabled: null, reason: "CONFIG" } },
    });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
        enabled: true,
        reason: "CONFIG",
      }),
    );
    expect(result.current.endpointStatus["merge-pdfs"]).toBe(true);
  });

  it("serves a second hook from the global cache without a second network call", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        "merge-pdfs": { enabled: true, reason: null },
        "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
      },
    });

    const { useMultipleEndpointsEnabled } = await loadModule();

    // First consumer performs the single network fetch and fills the cache.
    const first = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);
    await waitFor(() =>
      expect(first.result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(getMock).toHaveBeenCalledTimes(1);

    // Second consumer requests a mix of cached + uncached endpoints and is
    // served entirely from the cache (uncached -> optimistic enabled).
    const second = renderMulti(useMultipleEndpointsEnabled, [
      "ocr-pdf",
      "uncached-endpoint",
    ]);
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.endpointStatus).toEqual({
      "ocr-pdf": false,
      "uncached-endpoint": true,
    });
    expect(second.result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: false,
      reason: "DEPENDENCY",
    });
    // No additional network request — the cache short-circuit handled it.
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("uses the optimistic 401 fallback (all enabled) without recording an error", async () => {
    getMock.mockRejectedValueOnce(axiosError({ status: 401 }));

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
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.endpointDetails["ocr-pdf"]).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it("on a generic (non-401) error surfaces the message and applies the optimistic fallback", async () => {
    getMock.mockRejectedValueOnce(
      axiosError({ status: 500, message: "kaboom" }),
    );

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, [
      "merge-pdfs",
      "ocr-pdf",
    ]);

    await waitFor(() => expect(result.current.error).toBe("kaboom"));
    expect(result.current.endpointStatus).toEqual({
      "merge-pdfs": true,
      "ocr-pdf": true,
    });
    expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it("falls back to a generic message for a non-Error rejection value", async () => {
    getMock.mockRejectedValueOnce("plain string failure");

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.error).toBe("Unknown error occurred"),
    );
    expect(result.current.endpointStatus["merge-pdfs"]).toBe(true);
  });

  it("refetch() forces a fresh network fetch even when the cache is populated", async () => {
    getMock
      .mockResolvedValueOnce({
        data: { "merge-pdfs": { enabled: true, reason: null } },
      })
      .mockResolvedValueOnce({
        data: { "merge-pdfs": { enabled: false, reason: "CONFIG" } },
      });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(getMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(false),
    );
    expect(result.current.endpointDetails["merge-pdfs"]).toEqual({
      enabled: false,
      reason: "CONFIG",
    });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("registers an auth-change handler that resets the cache and force-refetches", async () => {
    getMock
      .mockResolvedValueOnce({
        data: { "merge-pdfs": { enabled: true, reason: null } },
      })
      .mockResolvedValueOnce({
        data: { "merge-pdfs": { enabled: false, reason: "DEPENDENCY" } },
      });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result } = renderMulti(useMultipleEndpointsEnabled, ["merge-pdfs"]);

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );
    expect(useJwtConfigSyncMock).toHaveBeenCalled();
    expect(capturedAuthCallback).toBeTypeOf("function");

    // Simulate the proprietary jwt-available auth change: clears the global
    // cache and forces a fresh availability fetch.
    await act(async () => {
      capturedAuthCallback?.();
    });

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(false),
    );
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches and merges details when the endpoints prop changes", async () => {
    getMock
      .mockResolvedValueOnce({
        data: { "merge-pdfs": { enabled: true, reason: null } },
      })
      .mockResolvedValueOnce({
        data: {
          "merge-pdfs": { enabled: true, reason: null },
          "ocr-pdf": { enabled: false, reason: "DEPENDENCY" },
        },
      });

    const { useMultipleEndpointsEnabled } = await loadModule();
    const { result, rerender } = renderHook(
      (eps: string[]) => useMultipleEndpointsEnabled(eps),
      { initialProps: ["merge-pdfs"] },
    );

    await waitFor(() =>
      expect(result.current.endpointStatus["merge-pdfs"]).toBe(true),
    );

    // Changing the endpoints set changes the effect dependency (join key).
    // The first fetch already marked globalFetchDone, so the new render is
    // served from the cache: ocr-pdf isn't cached yet -> optimistic enabled.
    rerender(["merge-pdfs", "ocr-pdf"]);

    await waitFor(() =>
      expect(result.current.endpointStatus["ocr-pdf"]).toBe(true),
    );
    expect(result.current.endpointStatus["merge-pdfs"]).toBe(true);
  });
});
