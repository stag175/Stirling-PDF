import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---- Mocks for external/side-effecting deps ----
//
// useAuditFilters fetches metadata on mount via auditService (network-backed).
// Mock the service so mount-time fetches are deterministic and never touch
// the real apiClient/axios.
const mockGetEventTypes = vi.fn<() => Promise<string[]>>();
const mockGetUsers = vi.fn<() => Promise<string[]>>();

vi.mock("@app/services/auditService", () => ({
  __esModule: true,
  default: {
    getEventTypes: () => mockGetEventTypes(),
    getUsers: () => mockGetUsers(),
  },
}));

import { useAuditFilters } from "@app/hooks/useAuditFilters";
import type { AuditFilters } from "@app/services/auditService";

const EVENT_TYPES = ["LOGIN", "DOWNLOAD", "DELETE"];
const USERS = ["alice", "bob"];

describe("useAuditFilters", () => {
  beforeEach(() => {
    mockGetEventTypes.mockReset();
    mockGetUsers.mockReset();
    // Default happy-path resolutions; individual tests override as needed.
    mockGetEventTypes.mockResolvedValue(EVENT_TYPES);
    mockGetUsers.mockResolvedValue(USERS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("initializes with empty metadata and all-undefined filters by default", async () => {
    const { result } = renderHook(() => useAuditFilters());

    // Filters start with the four canonical keys all undefined.
    expect(result.current.filters).toStrictEqual({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
    });

    // Metadata is empty until the mount-effect resolves.
    await waitFor(() => {
      expect(result.current.eventTypes).toStrictEqual(EVENT_TYPES);
    });
    expect(result.current.users).toStrictEqual(USERS);
  });

  test("merges initialFilters over the canonical defaults", async () => {
    const initial: Partial<AuditFilters> = {
      eventType: "LOGIN",
      username: "alice",
      startDate: "2026-01-01",
      page: 2,
      pageSize: 50,
    };

    const { result } = renderHook(() => useAuditFilters(initial));

    expect(result.current.filters).toStrictEqual({
      eventType: "LOGIN",
      username: "alice",
      startDate: "2026-01-01",
      endDate: undefined,
      page: 2,
      pageSize: 50,
    });

    await waitFor(() => {
      expect(mockGetEventTypes).toHaveBeenCalledTimes(1);
    });
  });

  test("fetches event types and users on mount when loginEnabled is true (default)", async () => {
    const { result } = renderHook(() => useAuditFilters());

    await waitFor(() => {
      expect(result.current.eventTypes).toStrictEqual(EVENT_TYPES);
      expect(result.current.users).toStrictEqual(USERS);
    });

    expect(mockGetEventTypes).toHaveBeenCalledTimes(1);
    expect(mockGetUsers).toHaveBeenCalledTimes(1);
  });

  test("does NOT fetch metadata when loginEnabled is false", async () => {
    const { result } = renderHook(() => useAuditFilters({}, false));

    // Give any (unexpected) async effect a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetEventTypes).not.toHaveBeenCalled();
    expect(mockGetUsers).not.toHaveBeenCalled();
    expect(result.current.eventTypes).toStrictEqual([]);
    expect(result.current.users).toStrictEqual([]);
  });

  test("re-fetches when loginEnabled flips from false to true", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAuditFilters({}, enabled),
      { initialProps: { enabled: false } },
    );

    // No fetch while disabled.
    await Promise.resolve();
    expect(mockGetEventTypes).not.toHaveBeenCalled();

    // Flip to enabled -> effect re-runs and fetches.
    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.eventTypes).toStrictEqual(EVENT_TYPES);
    });
    expect(mockGetEventTypes).toHaveBeenCalledTimes(1);
    expect(mockGetUsers).toHaveBeenCalledTimes(1);
  });

  test("logs an error and leaves metadata empty when the fetch rejects", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const boom = new Error("metadata fetch failed");
    mockGetEventTypes.mockRejectedValue(boom);
    // getUsers resolves, but Promise.all rejects on the first failure.
    mockGetUsers.mockResolvedValue(USERS);

    const { result } = renderHook(() => useAuditFilters());

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to fetch audit metadata:",
        boom,
      );
    });

    // State stays at the empty defaults because the catch swallows the error.
    expect(result.current.eventTypes).toStrictEqual([]);
    expect(result.current.users).toStrictEqual([]);
  });

  test("handleFilterChange updates a single key while preserving others", async () => {
    const { result } = renderHook(() =>
      useAuditFilters({ eventType: "LOGIN", page: 1 }),
    );

    act(() => {
      result.current.handleFilterChange("username", "bob");
    });

    expect(result.current.filters).toStrictEqual({
      eventType: "LOGIN",
      username: "bob",
      startDate: undefined,
      endDate: undefined,
      page: 1,
    });

    // A second change merges on top of the previous state.
    act(() => {
      result.current.handleFilterChange("startDate", "2026-02-02");
    });

    expect(result.current.filters.startDate).toBe("2026-02-02");
    expect(result.current.filters.username).toBe("bob");
    expect(result.current.filters.eventType).toBe("LOGIN");

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenCalled();
    });
  });

  test("handleFilterChange accepts array values for multi-select keys", async () => {
    const { result } = renderHook(() => useAuditFilters());

    // Let the mount-time metadata fetch settle so its state updates don't
    // leak into the synchronous assertions below (avoids act() warnings).
    await waitFor(() => expect(result.current.eventTypes).not.toHaveLength(0));

    act(() => {
      result.current.handleFilterChange("eventType", ["LOGIN", "DOWNLOAD"]);
      result.current.handleFilterChange("username", ["alice", "bob"]);
    });

    expect(result.current.filters.eventType).toStrictEqual([
      "LOGIN",
      "DOWNLOAD",
    ]);
    expect(result.current.filters.username).toStrictEqual(["alice", "bob"]);
  });

  test("setFilters replaces the entire filter object", async () => {
    const { result } = renderHook(() =>
      useAuditFilters({ eventType: "LOGIN" }),
    );

    await waitFor(() => expect(result.current.eventTypes).not.toHaveLength(0));

    act(() => {
      result.current.setFilters({
        eventType: "DELETE",
        username: "alice",
        startDate: "2026-03-03",
        endDate: "2026-03-04",
        page: 5,
        pageSize: 25,
      });
    });

    expect(result.current.filters).toStrictEqual({
      eventType: "DELETE",
      username: "alice",
      startDate: "2026-03-03",
      endDate: "2026-03-04",
      page: 5,
      pageSize: 25,
    });
  });

  test("handleClearFilters resets values but preserves page/pageSize from initialFilters", async () => {
    const { result } = renderHook(() =>
      useAuditFilters({ page: 3, pageSize: 100 }),
    );

    await waitFor(() => expect(result.current.eventTypes).not.toHaveLength(0));

    // Dirty the filters first.
    act(() => {
      result.current.handleFilterChange("eventType", "LOGIN");
      result.current.handleFilterChange("username", "bob");
      result.current.handleFilterChange("startDate", "2026-04-04");
      result.current.handleFilterChange("endDate", "2026-04-05");
    });

    expect(result.current.filters.eventType).toBe("LOGIN");

    act(() => {
      result.current.handleClearFilters();
    });

    expect(result.current.filters).toStrictEqual({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
      page: 3,
      pageSize: 100,
    });
  });

  test("handleClearFilters carries undefined page/pageSize when initialFilters omits them", async () => {
    const { result } = renderHook(() => useAuditFilters());

    await waitFor(() => expect(result.current.eventTypes).not.toHaveLength(0));

    act(() => {
      result.current.handleFilterChange("eventType", "LOGIN");
    });

    act(() => {
      result.current.handleClearFilters();
    });

    expect(result.current.filters).toStrictEqual({
      eventType: undefined,
      username: undefined,
      startDate: undefined,
      endDate: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });
});
