import { beforeEach, describe, expect, test, vi } from "vitest";

import usageAnalyticsService, {
  type EndpointStatistic,
  type EndpointStatisticsResponse,
} from "@app/services/usageAnalyticsService";
import apiClient from "@app/services/apiClient";

/**
 * Unit tests for the core usageAnalyticsService API object.
 *
 * Its sole external dependency is the shared axios instance exported by
 * `@app/services/apiClient`, which we mock so no real HTTP machinery runs.
 *
 * The two methods are:
 *   - getEndpointStatistics(limit?, dataType="all"): assembles a query-params
 *     object, conditionally adding `limit` (only when defined) and `dataType`
 *     (only when not the "all" default), GETs the usage-endpoint-statistics
 *     URL, and returns `response.data`.
 *   - getChartData(limit?, dataType="all"): delegates to getEndpointStatistics
 *     and maps the resulting endpoints into parallel `labels`/`values` arrays.
 *
 * We assert the outbound call shape (URL + params) for every branch of the
 * param-assembly logic, the JSON shaping of getChartData, and the error/await
 * paths on rejection.
 */

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: vi.fn(),
  },
}));

// apiClient.get is an overloaded axios method, so vi.mocked() doesn't surface
// the Mock helpers cleanly; re-type to the vi.fn mock the factory installs.
const mockedClient = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
};

const ENDPOINT_URL = "/api/v1/proprietary/ui-data/usage-endpoint-statistics";

/** Convenience: make apiClient.get resolve with the given payload as data. */
function resolveGet<T>(data: T): void {
  mockedClient.get.mockResolvedValue({ data } as never);
}

function makeStatsResponse(
  endpoints: EndpointStatistic[],
): EndpointStatisticsResponse {
  const totalVisits = endpoints.reduce((sum, e) => sum + e.visits, 0);
  return {
    endpoints,
    totalEndpoints: endpoints.length,
    totalVisits,
  };
}

const SAMPLE_ENDPOINTS: EndpointStatistic[] = [
  { endpoint: "/api/v1/merge", visits: 120, percentage: 60 },
  { endpoint: "/api/v1/split", visits: 80, percentage: 40 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usageAnalyticsService.getEndpointStatistics", () => {
  test("uses empty params and returns data when called with no args (defaults)", async () => {
    const data = makeStatsResponse(SAMPLE_ENDPOINTS);
    resolveGet(data);

    const result = await usageAnalyticsService.getEndpointStatistics();

    expect(result).toBe(data);
    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith(ENDPOINT_URL, {
      params: {},
    });
    // The default dataType of "all" must NOT be added to the params.
    const [, config] = mockedClient.get.mock.calls[0];
    expect(config.params).not.toHaveProperty("dataType");
    expect(config.params).not.toHaveProperty("limit");
  });

  test("adds only the limit param when limit is provided and dataType is the default", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    await usageAnalyticsService.getEndpointStatistics(5);

    expect(mockedClient.get).toHaveBeenCalledWith(ENDPOINT_URL, {
      params: { limit: 5 },
    });
  });

  test("treats limit of 0 as defined and includes it in params", async () => {
    resolveGet(makeStatsResponse([]));

    await usageAnalyticsService.getEndpointStatistics(0);

    const [, config] = mockedClient.get.mock.calls[0];
    expect(config.params).toEqual({ limit: 0 });
  });

  test("adds only the dataType param when dataType is non-default and limit is omitted", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    await usageAnalyticsService.getEndpointStatistics(undefined, "api");

    expect(mockedClient.get).toHaveBeenCalledWith(ENDPOINT_URL, {
      params: { dataType: "api" },
    });
  });

  test("adds both limit and dataType params when both are non-default", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    await usageAnalyticsService.getEndpointStatistics(10, "ui");

    expect(mockedClient.get).toHaveBeenCalledWith(ENDPOINT_URL, {
      params: { limit: 10, dataType: "ui" },
    });
  });

  test("omits dataType when explicitly passed the default 'all' value", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    await usageAnalyticsService.getEndpointStatistics(3, "all");

    const [, config] = mockedClient.get.mock.calls[0];
    expect(config.params).toEqual({ limit: 3 });
    expect(config.params).not.toHaveProperty("dataType");
  });

  test("propagates a rejection from apiClient.get", async () => {
    mockedClient.get.mockRejectedValue(new Error("stats unavailable"));

    await expect(
      usageAnalyticsService.getEndpointStatistics(5, "api"),
    ).rejects.toThrow("stats unavailable");
  });
});

describe("usageAnalyticsService.getChartData", () => {
  test("maps endpoint names to labels and visit counts to values", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    const result = await usageAnalyticsService.getChartData();

    expect(result).toEqual({
      labels: ["/api/v1/merge", "/api/v1/split"],
      values: [120, 80],
    });
  });

  test("forwards limit and dataType through to getEndpointStatistics", async () => {
    resolveGet(makeStatsResponse(SAMPLE_ENDPOINTS));

    await usageAnalyticsService.getChartData(7, "ui");

    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith(ENDPOINT_URL, {
      params: { limit: 7, dataType: "ui" },
    });
  });

  test("returns parallel empty arrays when there are no endpoints", async () => {
    resolveGet(makeStatsResponse([]));

    const result = await usageAnalyticsService.getChartData(0, "api");

    expect(result).toEqual({ labels: [], values: [] });
    expect(result.labels).toHaveLength(result.values.length);
  });

  test("preserves endpoint order and pairs labels with values positionally", async () => {
    const endpoints: EndpointStatistic[] = [
      { endpoint: "/c", visits: 3, percentage: 50 },
      { endpoint: "/a", visits: 2, percentage: 33 },
      { endpoint: "/b", visits: 1, percentage: 17 },
    ];
    resolveGet(makeStatsResponse(endpoints));

    const result = await usageAnalyticsService.getChartData(3);

    expect(result.labels).toEqual(["/c", "/a", "/b"]);
    expect(result.values).toEqual([3, 2, 1]);
  });

  test("propagates a rejection bubbling up from getEndpointStatistics", async () => {
    mockedClient.get.mockRejectedValue(new Error("chart fetch failed"));

    await expect(usageAnalyticsService.getChartData()).rejects.toThrow(
      "chart fetch failed",
    );
  });
});
