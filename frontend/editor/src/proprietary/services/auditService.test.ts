import { describe, it, expect, beforeEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import auditService, {
  type AuditChartsData,
  type AuditEventsResponse,
  type AuditStats,
} from "@app/services/auditService";

// Auto-mock the apiClient (axios instance) so get/post become vi.fn() stubs,
// matching the convention used by licenseService.test.ts. Under the
// "proprietary" Vitest project, both the module under test (which lives in
// src/core) and this mock specifier resolve to src/core/services/apiClient,
// so the mock applies to the same module the service imports.
vi.mock("@app/services/apiClient");

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

/** Build a full V1 audit-dashboard response with explicit capture flags. */
function dashboardPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    auditEnabled: true,
    auditLevel: "STANDARD",
    retentionDays: 90,
    pdfMetadataEnabled: true,
    captureFileHash: true,
    capturePdfAuthor: true,
    captureOperationResults: true,
    ...overrides,
  };
}

/** A representative AuditStats payload used to assert pass-through shaping. */
function statsPayload(): AuditStats {
  return {
    totalEvents: 120,
    prevTotalEvents: 100,
    uniqueUsers: 12,
    prevUniqueUsers: 10,
    successRate: 98.5,
    prevSuccessRate: 97,
    avgLatencyMs: 42,
    prevAvgLatencyMs: 50,
    errorCount: 3,
    topEventType: "FILE_UPLOAD",
    topUser: "alice",
    eventsByType: { FILE_UPLOAD: 80, FILE_DOWNLOAD: 40 },
    eventsByUser: { alice: 70, bob: 50 },
    topTools: { merge: 30, split: 20 },
    hourlyDistribution: { "00": 1, "13": 9 },
  };
}

describe("auditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSystemStatus", () => {
    it("maps the V1 dashboard response, forcing totalEvents to 0 and suppressing the error toast", async () => {
      mockedGet.mockResolvedValueOnce({ data: dashboardPayload() });

      const result = await auditService.getSystemStatus();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-dashboard",
        { suppressErrorToast: true },
      );
      expect(result).toEqual({
        enabled: true,
        level: "STANDARD",
        retentionDays: 90,
        // Always 0 regardless of the source payload (fetched separately).
        totalEvents: 0,
        pdfMetadataEnabled: true,
        captureFileHash: true,
        capturePdfAuthor: true,
        captureOperationResults: true,
      });
    });

    it("applies nullish (??) defaults of false when capture flags are missing", async () => {
      // Omit every optional capture flag so each `?? false` branch is taken.
      mockedGet.mockResolvedValueOnce({
        data: {
          auditEnabled: false,
          auditLevel: "OFF",
          retentionDays: 0,
        },
      });

      const result = await auditService.getSystemStatus();

      expect(result.pdfMetadataEnabled).toBe(false);
      expect(result.captureFileHash).toBe(false);
      expect(result.capturePdfAuthor).toBe(false);
      expect(result.captureOperationResults).toBe(false);
      expect(result.enabled).toBe(false);
      expect(result.level).toBe("OFF");
      expect(result.totalEvents).toBe(0);
    });

    it("treats null capture flags as false but preserves an explicit false vs true", async () => {
      // null -> ?? false; explicit false stays false; explicit true stays true.
      mockedGet.mockResolvedValueOnce({
        data: dashboardPayload({
          pdfMetadataEnabled: null,
          captureFileHash: false,
          capturePdfAuthor: null,
          captureOperationResults: true,
        }),
      });

      const result = await auditService.getSystemStatus();

      expect(result.pdfMetadataEnabled).toBe(false); // null -> false
      expect(result.captureFileHash).toBe(false); // explicit false retained
      expect(result.capturePdfAuthor).toBe(false); // null -> false
      expect(result.captureOperationResults).toBe(true); // explicit true retained
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("dashboard down"));

      await expect(auditService.getSystemStatus()).rejects.toThrow(
        "dashboard down",
      );
    });
  });

  describe("getStats", () => {
    it("defaults the period to 'week' and returns the response data", async () => {
      const data = statsPayload();
      mockedGet.mockResolvedValueOnce({ data });

      const result = await auditService.getStats();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-stats",
        { params: { period: "week" } },
      );
      expect(result).toBe(data);
    });

    it("forwards an explicit period parameter", async () => {
      const data = statsPayload();
      mockedGet.mockResolvedValueOnce({ data });

      await auditService.getStats("month");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-stats",
        { params: { period: "month" } },
      );
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("stats boom"));

      await expect(auditService.getStats("day")).rejects.toThrow("stats boom");
    });
  });

  describe("getEvents", () => {
    it("defaults filters to an empty object", async () => {
      const data: AuditEventsResponse = {
        events: [],
        totalEvents: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      };
      mockedGet.mockResolvedValueOnce({ data });

      const result = await auditService.getEvents();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-events",
        { params: {} },
      );
      expect(result).toBe(data);
    });

    it("passes through filters (including array-valued ones) as params", async () => {
      const data: AuditEventsResponse = {
        events: [
          {
            id: "evt-1",
            timestamp: "2026-06-01T00:00:00Z",
            eventType: "FILE_UPLOAD",
            username: "alice",
            ipAddress: "10.0.0.1",
            details: { size: 1024 },
          },
        ],
        totalEvents: 1,
        page: 2,
        pageSize: 10,
        totalPages: 1,
      };
      mockedGet.mockResolvedValueOnce({ data });

      const filters = {
        eventType: ["FILE_UPLOAD", "FILE_DOWNLOAD"],
        username: "alice",
        startDate: "2026-05-01",
        endDate: "2026-06-01",
        outcome: "SUCCESS",
        page: 2,
        pageSize: 10,
        fields: "id,timestamp",
      };

      const result = await auditService.getEvents(filters);

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-events",
        { params: filters },
      );
      expect(result.events).toHaveLength(1);
      expect(result.events[0].details).toEqual({ size: 1024 });
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("events boom"));

      await expect(auditService.getEvents()).rejects.toThrow("events boom");
    });
  });

  describe("getChartsData", () => {
    it("defaults the period to 'week' and returns the chart data", async () => {
      const data: AuditChartsData = {
        eventsByType: { labels: ["FILE_UPLOAD"], values: [80] },
        eventsByUser: { labels: ["alice"], values: [70] },
        eventsOverTime: { labels: ["00:00"], values: [5] },
      };
      mockedGet.mockResolvedValueOnce({ data });

      const result = await auditService.getChartsData();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-charts",
        { params: { period: "week" } },
      );
      expect(result).toBe(data);
    });

    it("forwards an explicit period parameter", async () => {
      mockedGet.mockResolvedValueOnce({
        data: {
          eventsByType: { labels: [], values: [] },
          eventsByUser: { labels: [], values: [] },
          eventsOverTime: { labels: [], values: [] },
        },
      });

      await auditService.getChartsData("day");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-charts",
        { params: { period: "day" } },
      );
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("charts boom"));

      await expect(auditService.getChartsData("month")).rejects.toThrow(
        "charts boom",
      );
    });
  });

  describe("exportData", () => {
    it("requests a blob with the format merged into the filter params", async () => {
      const blob = new Blob(["a,b,c"], { type: "text/csv" });
      mockedGet.mockResolvedValueOnce({ data: blob });

      const result = await auditService.exportData("csv", {
        eventType: "FILE_UPLOAD",
        page: 1,
      });

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-export",
        {
          params: { format: "csv", eventType: "FILE_UPLOAD", page: 1 },
          responseType: "blob",
        },
      );
      expect(result).toBe(blob);
    });

    it("defaults filters to an empty object and supports the json format", async () => {
      const blob = new Blob(["{}"], { type: "application/json" });
      mockedGet.mockResolvedValueOnce({ data: blob });

      await auditService.exportData("json");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-export",
        {
          params: { format: "json" },
          responseType: "blob",
        },
      );
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("export boom"));

      await expect(auditService.exportData("csv")).rejects.toThrow(
        "export boom",
      );
    });
  });

  describe("getEventTypes", () => {
    it("returns the list of event types", async () => {
      const data = ["FILE_UPLOAD", "FILE_DOWNLOAD"];
      mockedGet.mockResolvedValueOnce({ data });

      const result = await auditService.getEventTypes();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-event-types",
      );
      expect(result).toBe(data);
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("types boom"));

      await expect(auditService.getEventTypes()).rejects.toThrow("types boom");
    });
  });

  describe("getUsers", () => {
    it("returns the list of users", async () => {
      const data = ["alice", "bob"];
      mockedGet.mockResolvedValueOnce({ data });

      const result = await auditService.getUsers();

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-users",
      );
      expect(result).toBe(data);
    });

    it("propagates request rejections", async () => {
      mockedGet.mockRejectedValueOnce(new Error("users boom"));

      await expect(auditService.getUsers()).rejects.toThrow("users boom");
    });
  });

  describe("clearAllAuditData", () => {
    it("posts to the clear-all endpoint with an empty body and resolves to undefined", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      const result = await auditService.clearAllAuditData();

      expect(mockedPost).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/audit-clear-all",
        {},
      );
      expect(result).toBeUndefined();
    });

    it("propagates request rejections", async () => {
      mockedPost.mockRejectedValueOnce(new Error("clear boom"));

      await expect(auditService.clearAllAuditData()).rejects.toThrow(
        "clear boom",
      );
    });
  });
});
