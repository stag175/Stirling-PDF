import { beforeEach, describe, expect, test, vi } from "vitest";

import auditService, {
  type AuditChartsData,
  type AuditEventsResponse,
  type AuditStats,
} from "@app/services/auditService";
import apiClient from "@app/services/apiClient";

/**
 * Unit tests for the core auditService API object.
 *
 * Its single external dependency is the shared axios instance exported by
 * `@app/services/apiClient`. We mock that module so no real HTTP (or axios
 * interceptor / config) machinery runs, giving fully deterministic behaviour.
 * Each method is a thin wrapper that:
 *   - calls apiClient.get/post with a fixed URL and a method-specific config
 *     (params, responseType, suppressErrorToast), and
 *   - returns response.data (getSystemStatus additionally remaps a V1 payload).
 *
 * We therefore assert both the outbound call shape (URL + config) AND the
 * returned/transformed value, and exercise getSystemStatus twice to cover the
 * `?? false` fallbacks for every optional capture flag.
 */

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// apiClient.get/post are overloaded axios methods, so vi.mocked() doesn't surface
// the Mock helpers cleanly; re-type to the vi.fn mocks the factory actually installs.
const mockedClient = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

/** Convenience: make apiClient.get resolve with the given payload as data. */
function resolveGet<T>(data: T): void {
  mockedClient.get.mockResolvedValue({ data } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auditService.getSystemStatus", () => {
  test("maps a fully-populated V1 payload and overrides totalEvents to 0", async () => {
    resolveGet({
      auditEnabled: true,
      auditLevel: "STANDARD",
      retentionDays: 90,
      pdfMetadataEnabled: true,
      captureFileHash: true,
      capturePdfAuthor: true,
      captureOperationResults: true,
    });

    const status = await auditService.getSystemStatus();

    expect(status).toEqual({
      enabled: true,
      level: "STANDARD",
      retentionDays: 90,
      totalEvents: 0,
      pdfMetadataEnabled: true,
      captureFileHash: true,
      capturePdfAuthor: true,
      captureOperationResults: true,
    });

    // Hits the V1 dashboard endpoint with the error toast suppressed.
    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-dashboard",
      { suppressErrorToast: true },
    );
  });

  test("defaults every optional capture flag to false when absent (?? branches)", async () => {
    // Only the required-ish fields present; all four capture flags omitted so
    // each `?? false` fallback is exercised.
    resolveGet({
      auditEnabled: false,
      auditLevel: "OFF",
      retentionDays: 0,
    });

    const status = await auditService.getSystemStatus();

    expect(status).toEqual({
      enabled: false,
      level: "OFF",
      retentionDays: 0,
      totalEvents: 0,
      pdfMetadataEnabled: false,
      captureFileHash: false,
      capturePdfAuthor: false,
      captureOperationResults: false,
    });
  });

  test("treats an explicit null capture flag as false (nullish coalescing)", async () => {
    resolveGet({
      auditEnabled: true,
      auditLevel: "VERBOSE",
      retentionDays: 30,
      pdfMetadataEnabled: null,
      captureFileHash: null,
      capturePdfAuthor: null,
      captureOperationResults: null,
    });

    const status = await auditService.getSystemStatus();

    expect(status.pdfMetadataEnabled).toBe(false);
    expect(status.captureFileHash).toBe(false);
    expect(status.capturePdfAuthor).toBe(false);
    expect(status.captureOperationResults).toBe(false);
  });

  test("propagates a rejection from apiClient.get", async () => {
    const boom = new Error("dashboard unavailable");
    mockedClient.get.mockRejectedValue(boom);

    await expect(auditService.getSystemStatus()).rejects.toThrow(
      "dashboard unavailable",
    );
  });
});

describe("auditService.getStats", () => {
  const stats: AuditStats = {
    totalEvents: 10,
    prevTotalEvents: 8,
    uniqueUsers: 3,
    prevUniqueUsers: 2,
    successRate: 95,
    prevSuccessRate: 90,
    avgLatencyMs: 12,
    prevAvgLatencyMs: 15,
    errorCount: 1,
    topEventType: "LOGIN",
    topUser: "alice",
    eventsByType: { LOGIN: 5 },
    eventsByUser: { alice: 5 },
    topTools: { merge: 2 },
    hourlyDistribution: { "00": 1 },
  };

  test("uses the default 'week' period when none is supplied", async () => {
    resolveGet(stats);

    const result = await auditService.getStats();

    expect(result).toBe(stats);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-stats",
      { params: { period: "week" } },
    );
  });

  test("forwards an explicit period through params", async () => {
    resolveGet(stats);

    await auditService.getStats("month");

    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-stats",
      { params: { period: "month" } },
    );
  });
});

describe("auditService.getEvents", () => {
  const eventsResponse: AuditEventsResponse = {
    events: [
      {
        id: "e1",
        timestamp: "2026-01-01T00:00:00Z",
        eventType: "LOGIN",
        username: "bob",
        ipAddress: "127.0.0.1",
        details: { ok: true },
      },
    ],
    totalEvents: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  };

  test("defaults filters to an empty object when omitted", async () => {
    resolveGet(eventsResponse);

    const result = await auditService.getEvents();

    expect(result).toBe(eventsResponse);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-events",
      { params: {} },
    );
  });

  test("passes the supplied filters straight through as params", async () => {
    resolveGet(eventsResponse);

    const filters = {
      eventType: ["LOGIN", "LOGOUT"],
      username: "bob",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      outcome: "SUCCESS",
      page: 2,
      pageSize: 50,
      fields: "id,timestamp",
    };

    await auditService.getEvents(filters);

    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-events",
      { params: filters },
    );
  });
});

describe("auditService.getChartsData", () => {
  const charts: AuditChartsData = {
    eventsByType: { labels: ["LOGIN"], values: [5] },
    eventsByUser: { labels: ["alice"], values: [5] },
    eventsOverTime: { labels: ["2026-01-01"], values: [5] },
  };

  test("defaults to the 'week' period", async () => {
    resolveGet(charts);

    const result = await auditService.getChartsData();

    expect(result).toBe(charts);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-charts",
      { params: { period: "week" } },
    );
  });

  test("forwards an explicit 'day' period", async () => {
    resolveGet(charts);

    await auditService.getChartsData("day");

    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-charts",
      { params: { period: "day" } },
    );
  });
});

describe("auditService.exportData", () => {
  test("requests a blob, merging format into the filter params (default filters)", async () => {
    const blob = new Blob(["a,b,c"], { type: "text/csv" });
    resolveGet(blob);

    const result = await auditService.exportData("csv");

    expect(result).toBe(blob);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-export",
      { params: { format: "csv" }, responseType: "blob" },
    );
  });

  test("spreads explicit filters alongside the json format", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    resolveGet(blob);

    await auditService.exportData("json", {
      eventType: "LOGIN",
      page: 1,
    });

    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-export",
      {
        params: { format: "json", eventType: "LOGIN", page: 1 },
        responseType: "blob",
      },
    );
  });
});

describe("auditService.getEventTypes", () => {
  test("returns the event-type list from response.data", async () => {
    resolveGet(["LOGIN", "LOGOUT", "EXPORT"]);

    const result = await auditService.getEventTypes();

    expect(result).toEqual(["LOGIN", "LOGOUT", "EXPORT"]);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-event-types",
    );
  });
});

describe("auditService.getUsers", () => {
  test("returns the user list from response.data", async () => {
    resolveGet(["alice", "bob"]);

    const result = await auditService.getUsers();

    expect(result).toEqual(["alice", "bob"]);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-users",
    );
  });
});

describe("auditService.clearAllAuditData", () => {
  test("POSTs an empty body to the clear-all endpoint and resolves void", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await auditService.clearAllAuditData();

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
    expect(mockedClient.post).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/audit-clear-all",
      {},
    );
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("not authorized"));

    await expect(auditService.clearAllAuditData()).rejects.toThrow(
      "not authorized",
    );
  });
});
