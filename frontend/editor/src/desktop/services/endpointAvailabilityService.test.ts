/**
 * Unit tests for EndpointAvailabilityService (desktop layer).
 *
 * The service maintains a 5-minute TTL cache for endpoint-availability checks
 * against the local bundled backend and the SaaS backend, plus combined
 * decision flags, a batch preload, cache clearing, and debug/stats helpers.
 *
 * Its only external dependency is the Tauri HTTP `fetch`, which we mock with
 * vi.mock for fully deterministic behaviour (no real network). The SaaS backend
 * URL constant is mocked to a real value; the "not configured" branch is
 * exercised in an isolated module registry via vi.resetModules + vi.doMock so
 * the global mock is never mutated. Date.now() is driven with fake timers so
 * the TTL-expiry branches are deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- mocks ------------------------------------------------------------------

const tauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => tauriFetch(...args),
}));

// vi.mock factories are hoisted; inline the URL. SAAS_URL mirrors it below.
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://saas.example.com/",
}));

const SAAS_BASE = "https://saas.example.com"; // trailing slash trimmed by code
const LOCAL_BASE = "http://localhost:8080";

import {
  EndpointAvailabilityService,
  endpointAvailabilityService,
} from "@app/services/endpointAvailabilityService";

// Build a Response-like object the service understands.
function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  };
}

function errResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
  };
}

let service: EndpointAvailabilityService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  service = new EndpointAvailabilityService();
  // Quiet the console.warn/error/group noise the service emits on edge paths.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "group").mockImplementation(() => {});
  vi.spyOn(console, "groupEnd").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- isEndpointSupportedLocally ---------------------------------------------

describe("isEndpointSupportedLocally", () => {
  it("returns false immediately when no backend URL is provided", async () => {
    const result = await service.isEndpointSupportedLocally("/api/v1/x", null);
    expect(result).toBe(false);
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it("fetches, returns enabled=true, and caches the positive result", async () => {
    const endpoint = "/api/v1/misc/compress-pdf";
    tauriFetch.mockResolvedValue(okResponse({ [endpoint]: { enabled: true } }));

    const result = await service.isEndpointSupportedLocally(
      endpoint,
      LOCAL_BASE,
    );
    expect(result).toBe(true);

    // Verify the request was built correctly against the local backend.
    expect(tauriFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = tauriFetch.mock.calls[0];
    expect(url).toBe(
      `${LOCAL_BASE}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpoint)}`,
    );
    expect(opts).toEqual({
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    });

    // Second call within TTL should be served from cache (no extra fetch).
    const cached = await service.isEndpointSupportedLocally(
      endpoint,
      LOCAL_BASE,
    );
    expect(cached).toBe(true);
    expect(tauriFetch).toHaveBeenCalledTimes(1);
  });

  it("defaults to false when the endpoint detail is missing/undefined", async () => {
    tauriFetch.mockResolvedValue(okResponse({}));
    const result = await service.isEndpointSupportedLocally(
      "/api/v1/missing",
      LOCAL_BASE,
    );
    expect(result).toBe(false);
  });

  it("re-fetches once the cached entry passes its TTL", async () => {
    const endpoint = "/api/v1/ttl";
    tauriFetch.mockResolvedValue(okResponse({ [endpoint]: { enabled: true } }));

    expect(await service.isEndpointSupportedLocally(endpoint, LOCAL_BASE)).toBe(
      true,
    );
    expect(tauriFetch).toHaveBeenCalledTimes(1);

    // Advance past the 5-minute cache duration so the entry is stale.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    tauriFetch.mockResolvedValue(
      okResponse({ [endpoint]: { enabled: false } }),
    );
    expect(await service.isEndpointSupportedLocally(endpoint, LOCAL_BASE)).toBe(
      false,
    );
    expect(tauriFetch).toHaveBeenCalledTimes(2);
  });

  it("returns false and warns when the backend responds non-ok", async () => {
    tauriFetch.mockResolvedValue(errResponse(503));
    const result = await service.isEndpointSupportedLocally(
      "/api/v1/down",
      LOCAL_BASE,
    );
    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns false and logs when fetch throws", async () => {
    tauriFetch.mockRejectedValue(new Error("network down"));
    const result = await service.isEndpointSupportedLocally(
      "/api/v1/boom",
      LOCAL_BASE,
    );
    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

// --- isEndpointSupportedOnSaaS ----------------------------------------------

describe("isEndpointSupportedOnSaaS", () => {
  it("fetches the SaaS backend (trailing slash trimmed) and caches the result", async () => {
    const endpoint = "/api/v1/misc/repair";
    tauriFetch.mockResolvedValue(okResponse({ [endpoint]: { enabled: true } }));

    expect(await service.isEndpointSupportedOnSaaS(endpoint)).toBe(true);
    const [url] = tauriFetch.mock.calls[0];
    expect(url).toBe(
      `${SAAS_BASE}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpoint)}`,
    );

    // Cached on the second call.
    expect(await service.isEndpointSupportedOnSaaS(endpoint)).toBe(true);
    expect(tauriFetch).toHaveBeenCalledTimes(1);
  });

  it("defaults to false when the SaaS payload lacks the endpoint", async () => {
    tauriFetch.mockResolvedValue(okResponse({ other: { enabled: true } }));
    expect(await service.isEndpointSupportedOnSaaS("/api/v1/none")).toBe(false);
  });

  it("re-fetches a SaaS entry after TTL expiry", async () => {
    const endpoint = "/api/v1/saas-ttl";
    tauriFetch.mockResolvedValue(okResponse({ [endpoint]: { enabled: true } }));
    expect(await service.isEndpointSupportedOnSaaS(endpoint)).toBe(true);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    tauriFetch.mockResolvedValue(okResponse({ [endpoint]: { enabled: true } }));
    expect(await service.isEndpointSupportedOnSaaS(endpoint)).toBe(true);
    expect(tauriFetch).toHaveBeenCalledTimes(2);
  });

  it("returns false and warns on a non-ok SaaS response", async () => {
    tauriFetch.mockResolvedValue(errResponse(500));
    expect(await service.isEndpointSupportedOnSaaS("/api/v1/err")).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns false and logs when the SaaS fetch throws", async () => {
    tauriFetch.mockRejectedValue(new Error("dns fail"));
    expect(await service.isEndpointSupportedOnSaaS("/api/v1/throw")).toBe(
      false,
    );
    expect(console.error).toHaveBeenCalled();
  });
});

// --- preloadEndpoints -------------------------------------------------------

describe("preloadEndpoints", () => {
  it("no-ops when given no backend URL", async () => {
    await service.preloadEndpoints(["/api/v1/a"], null);
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it("no-ops when the endpoint list is empty", async () => {
    await service.preloadEndpoints([], LOCAL_BASE);
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it("populates the local cache for every returned endpoint", async () => {
    const a = "/api/v1/general/merge";
    const b = "/api/v1/misc/repair";
    tauriFetch.mockResolvedValue(
      okResponse({
        [a]: { enabled: true },
        [b]: {}, // missing enabled => defaults to false
      }),
    );

    await service.preloadEndpoints([a, b], LOCAL_BASE);

    // The comma-joined endpoints param is sent in a single request.
    const [url] = tauriFetch.mock.calls[0];
    expect(url).toBe(
      `${LOCAL_BASE}/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(
        `${a},${b}`,
      )}`,
    );

    // Subsequent capability checks are served from the warmed cache.
    expect(await service.isEndpointSupportedLocally(a, LOCAL_BASE)).toBe(true);
    expect(await service.isEndpointSupportedLocally(b, LOCAL_BASE)).toBe(false);
    // Only the preload request happened — no per-endpoint fetches.
    expect(tauriFetch).toHaveBeenCalledTimes(1);

    const stats = service.getCacheStats();
    expect(stats.local.size).toBe(2);
  });

  it("warns and leaves the cache empty on a non-ok preload response", async () => {
    tauriFetch.mockResolvedValue(errResponse(404));
    await service.preloadEndpoints(["/api/v1/x"], LOCAL_BASE);
    expect(console.warn).toHaveBeenCalled();
    expect(service.getCacheStats().local.size).toBe(0);
  });

  it("logs and swallows errors when the preload fetch throws", async () => {
    tauriFetch.mockRejectedValue(new Error("offline"));
    await service.preloadEndpoints(["/api/v1/x"], LOCAL_BASE);
    expect(console.error).toHaveBeenCalled();
    expect(service.getCacheStats().local.size).toBe(0);
  });
});

// --- checkEndpointCombined --------------------------------------------------

describe("checkEndpointCombined", () => {
  it("computes localOnly flags when only the local backend supports it", async () => {
    const endpoint = "/api/v1/local-only";
    // Local query => enabled true; SaaS query => enabled false.
    tauriFetch.mockImplementation((url: string) => {
      if (url.startsWith(LOCAL_BASE)) {
        return Promise.resolve(okResponse({ [endpoint]: { enabled: true } }));
      }
      return Promise.resolve(okResponse({ [endpoint]: { enabled: false } }));
    });

    const result = await service.checkEndpointCombined(endpoint, LOCAL_BASE);
    expect(result).toEqual({
      availableLocally: true,
      availableOnSaaS: false,
      isAvailable: true,
      willUseCloud: false,
      localOnly: true,
    });
  });

  it("computes willUseCloud when only SaaS supports it", async () => {
    const endpoint = "/api/v1/cloud-only";
    tauriFetch.mockImplementation((url: string) => {
      if (url.startsWith(LOCAL_BASE)) {
        return Promise.resolve(okResponse({ [endpoint]: { enabled: false } }));
      }
      return Promise.resolve(okResponse({ [endpoint]: { enabled: true } }));
    });

    const result = await service.checkEndpointCombined(endpoint, LOCAL_BASE);
    expect(result.availableLocally).toBe(false);
    expect(result.availableOnSaaS).toBe(true);
    expect(result.isAvailable).toBe(true);
    expect(result.willUseCloud).toBe(true);
    expect(result.localOnly).toBe(false);
  });

  it("reports unavailable when neither backend supports it", async () => {
    const endpoint = "/api/v1/nowhere";
    tauriFetch.mockResolvedValue(
      okResponse({ [endpoint]: { enabled: false } }),
    );
    const result = await service.checkEndpointCombined(endpoint, LOCAL_BASE);
    expect(result.isAvailable).toBe(false);
    expect(result.willUseCloud).toBe(false);
    expect(result.localOnly).toBe(false);
  });
});

// --- clearCache / getCacheStats / debugCache --------------------------------

describe("clearCache", () => {
  it("empties both local and SaaS caches", async () => {
    const ep = "/api/v1/clear-me";
    tauriFetch.mockResolvedValue(okResponse({ [ep]: { enabled: true } }));
    await service.isEndpointSupportedLocally(ep, LOCAL_BASE);
    await service.isEndpointSupportedOnSaaS(ep);

    let stats = service.getCacheStats();
    expect(stats.local.size).toBe(1);
    expect(stats.saas.size).toBe(1);

    service.clearCache();
    stats = service.getCacheStats();
    expect(stats.local.size).toBe(0);
    expect(stats.saas.size).toBe(0);
  });
});

describe("getCacheStats", () => {
  it("reports remaining TTL and clamps expired entries to zero", async () => {
    const ep = "/api/v1/stats";
    tauriFetch.mockResolvedValue(okResponse({ [ep]: { enabled: true } }));
    await service.isEndpointSupportedLocally(ep, LOCAL_BASE);

    // Immediately after caching, the full TTL remains.
    let stats = service.getCacheStats();
    expect(stats.local.entries).toHaveLength(1);
    expect(stats.local.entries[0]).toMatchObject({
      endpoint: ep,
      available: true,
    });
    expect(stats.local.entries[0].expiresIn).toBe(5 * 60 * 1000);

    // After the TTL elapses, expiresIn is clamped to 0 (never negative).
    vi.advanceTimersByTime(10 * 60 * 1000);
    stats = service.getCacheStats();
    expect(stats.local.entries[0].expiresIn).toBe(0);
  });

  it("reports zeroed stats with no cached entries", () => {
    const stats = service.getCacheStats();
    expect(stats).toEqual({
      local: { size: 0, entries: [] },
      saas: { size: 0, entries: [] },
    });
  });
});

describe("debugCache", () => {
  it("logs both caches without throwing, including expired entries", async () => {
    const local = "/api/v1/dbg-local";
    const saas = "/api/v1/dbg-saas";
    tauriFetch.mockImplementation((url: string) => {
      const ep = url.startsWith(LOCAL_BASE) ? local : saas;
      return Promise.resolve(okResponse({ [ep]: { enabled: true } }));
    });
    await service.isEndpointSupportedLocally(local, LOCAL_BASE);
    await service.isEndpointSupportedOnSaaS(saas);

    expect(() => service.debugCache()).not.toThrow();
    expect(console.group).toHaveBeenCalled();
    expect(console.groupEnd).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });
});

// --- exported singleton + window exposure -----------------------------------

describe("module singleton", () => {
  it("exports a ready-to-use singleton instance", () => {
    expect(endpointAvailabilityService).toBeInstanceOf(
      EndpointAvailabilityService,
    );
  });

  it("exposes the singleton on window for console debugging", () => {
    expect(
      (window as unknown as Record<string, unknown>)
        .endpointAvailabilityService,
    ).toBe(endpointAvailabilityService);
  });
});

// --- isolated registry: SaaS URL not configured -----------------------------

describe("isEndpointSupportedOnSaaS — SaaS URL not configured", () => {
  it("returns false without fetching when the SaaS backend URL is empty", async () => {
    vi.resetModules();
    const localFetch = vi.fn();
    vi.doMock("@tauri-apps/plugin-http", () => ({
      fetch: (...args: unknown[]) => localFetch(...args),
    }));
    vi.doMock("@app/constants/connection", () => ({
      STIRLING_SAAS_BACKEND_API_URL: "",
    }));

    const mod = await import("@app/services/endpointAvailabilityService");
    const svc = new mod.EndpointAvailabilityService();
    expect(await svc.isEndpointSupportedOnSaaS("/api/v1/anything")).toBe(false);
    expect(localFetch).not.toHaveBeenCalled();

    vi.resetModules();
  });
});
