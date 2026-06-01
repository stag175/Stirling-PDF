import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Dependency mocks.
//
// useCredits pulls in three src modules. We mock all of them so the hook runs
// in isolation and deterministically:
//   - @app/services/apiClient  -> default export with a .get() method (network)
//   - @app/auth/UseSession     -> useAuth() (session/loading/user gating)
//   - @app/auth/supabase       -> isUserAnonymous() (anonymous gating)
//
// vi.hoisted produces the underlying vi.fns BEFORE the hoisted vi.mock
// factories run, so each test can re-program them. Note: the saas
// setupTests.ts already mocks @app/auth/supabase globally; our explicit
// vi.mock here takes precedence for this file and adds isUserAnonymous.
// ---------------------------------------------------------------------------
const { getMock, useAuthMock, isUserAnonymousMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  useAuthMock: vi.fn(),
  isUserAnonymousMock: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: getMock,
  },
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: useAuthMock,
}));

vi.mock("@app/auth/supabase", () => ({
  isUserAnonymous: isUserAnonymousMock,
}));

import { useCredits } from "@app/components/shared/config/configSections/apiKeys/hooks/useCredits";

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** A fully-zero/empty normalized payload (the "empty" sentinel the hook nulls). */
const EMPTY_PAYLOAD: Record<string, unknown> = {};

/** A non-empty raw payload using the canonical key names. */
const CANONICAL_PAYLOAD: Record<string, unknown> = {
  weeklyCreditsRemaining: 12,
  weeklyCreditsAllocated: 100,
  boughtCreditsRemaining: 5,
  totalBoughtCredits: 50,
  totalAvailableCredits: 17,
  weeklyResetDate: "2026-06-08",
  lastApiUsage: "2026-06-01T10:00:00Z",
};

/** Configure useAuth's return for a given gating scenario. */
function setAuth({
  session = { access_token: "tok" } as unknown,
  loading = false,
  user = { id: "u1", is_anonymous: false } as unknown,
}: {
  session?: unknown;
  loading?: boolean;
  user?: unknown;
} = {}) {
  useAuthMock.mockReturnValue({
    session,
    loading,
    user,
  } as unknown as ReturnType<typeof import("@app/auth/UseSession").useAuth>);
}

/** Build an axios-like resolved response wrapping the given data. */
function res(data: Record<string, unknown>) {
  return { data };
}

describe("useCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Happy-path defaults; individual tests override.
    setAuth();
    isUserAnonymousMock.mockReturnValue(false);
    getMock.mockResolvedValue(res(CANONICAL_PAYLOAD));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auto-fetch effect gating: only fetch when
  //   !loading && session && !hasAttempted && !isAnonymous
  // -------------------------------------------------------------------------
  describe("auto-fetch gating", () => {
    it("does not fetch while auth is still loading", async () => {
      setAuth({ loading: true });

      const { result } = renderHook(() => useCredits());

      // Give any (incorrectly) scheduled effect a chance to run.
      await act(async () => {
        await Promise.resolve();
      });

      expect(getMock).not.toHaveBeenCalled();
      expect(result.current.hasAttempted).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("does not fetch when there is no session", async () => {
      setAuth({ session: null });

      const { result } = renderHook(() => useCredits());

      await act(async () => {
        await Promise.resolve();
      });

      expect(getMock).not.toHaveBeenCalled();
      expect(result.current.hasAttempted).toBe(false);
    });

    it("does not fetch when the user is anonymous", async () => {
      // user present AND isUserAnonymous -> isAnonymous === true.
      setAuth({ user: { id: "anon", is_anonymous: true } });
      isUserAnonymousMock.mockReturnValue(true);

      const { result } = renderHook(() => useCredits());

      await act(async () => {
        await Promise.resolve();
      });

      expect(isUserAnonymousMock).toHaveBeenCalledWith({
        id: "anon",
        is_anonymous: true,
      });
      expect(getMock).not.toHaveBeenCalled();
      expect(result.current.hasAttempted).toBe(false);
    });

    it("treats a missing user as non-anonymous (isUserAnonymous not consulted)", async () => {
      // user is null/undefined -> Boolean(user && ...) short-circuits to false
      // so isUserAnonymous must not be called, and the fetch proceeds.
      setAuth({ user: null });

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(isUserAnonymousMock).not.toHaveBeenCalled();
      expect(getMock).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Successful fetch + normalizeCredits (canonical keys).
  // -------------------------------------------------------------------------
  describe("successful fetch", () => {
    it("normalizes a canonical payload and exposes it as data", async () => {
      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.data).not.toBeNull());

      expect(getMock).toHaveBeenCalledWith("/api/v1/credits");
      expect(result.current.data).toEqual({
        weeklyCreditsRemaining: 12,
        weeklyCreditsAllocated: 100,
        boughtCreditsRemaining: 5,
        totalBoughtCredits: 50,
        totalAvailableCredits: 17,
        weeklyResetDate: "2026-06-08",
        lastApiUsage: "2026-06-01T10:00:00Z",
      });
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasAttempted).toBe(true);
    });

    it("falls back to the secondary key set (weeklyRemaining/boughtRemaining/...)", async () => {
      getMock.mockResolvedValue(
        res({
          weeklyRemaining: 7,
          weeklyAllocated: 70,
          boughtRemaining: 3,
          boughtTotal: 30,
          totalRemaining: 10,
          weeklyReset: "reset-A",
          lastApiUse: "use-A",
        }),
      );

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.data).not.toBeNull());

      expect(result.current.data).toEqual({
        weeklyCreditsRemaining: 7,
        weeklyCreditsAllocated: 70,
        boughtCreditsRemaining: 3,
        totalBoughtCredits: 30,
        totalAvailableCredits: 10,
        weeklyResetDate: "reset-A",
        lastApiUsage: "use-A",
      });
    });

    it("falls back to the snake_case key set and coerces numeric strings", async () => {
      getMock.mockResolvedValue(
        res({
          weekly_left: "9",
          weekly_total: "90",
          bought_left: "4",
          bought_total: "40",
          available_total: "13",
          reset_date: "reset-B",
          last_used_at: "use-B",
        }),
      );

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.data).not.toBeNull());

      // coerceNumber("9") -> Number("9") -> 9, etc.
      expect(result.current.data).toEqual({
        weeklyCreditsRemaining: 9,
        weeklyCreditsAllocated: 90,
        boughtCreditsRemaining: 4,
        totalBoughtCredits: 40,
        totalAvailableCredits: 13,
        weeklyResetDate: "reset-B",
        lastApiUsage: "use-B",
      });
    });

    it("coerces non-finite/garbage numeric inputs to the 0 fallback", async () => {
      // Numeric fields are unparseable -> Number.isFinite(NaN) is false -> 0.
      // A single non-numeric date field keeps the payload from being 'empty'.
      getMock.mockResolvedValue(
        res({
          weeklyCreditsRemaining: "not-a-number",
          weeklyCreditsAllocated: null,
          boughtCreditsRemaining: undefined,
          totalBoughtCredits: NaN,
          totalAvailableCredits: "abc",
          weeklyResetDate: "2026-12-31",
          // lastApiUsage omitted -> String(undefined ?? ... ?? "") -> ""
        }),
      );

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.data).not.toBeNull());

      expect(result.current.data).toEqual({
        weeklyCreditsRemaining: 0,
        weeklyCreditsAllocated: 0,
        boughtCreditsRemaining: 0,
        totalBoughtCredits: 0,
        totalAvailableCredits: 0,
        weeklyResetDate: "2026-12-31",
        lastApiUsage: "",
      });
    });

    it("keeps data non-null when only lastApiUsage is present (empty-detection negative branch)", async () => {
      // All numeric/reset fields fall to 0/"" but lastApiUsage is set, so the
      // isEmpty conjunction is false and the normalized object is stored.
      getMock.mockResolvedValue(res({ lastApiUsage: "2026-05-30T00:00:00Z" }));

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.data).not.toBeNull());

      expect(result.current.data?.lastApiUsage).toBe("2026-05-30T00:00:00Z");
      expect(result.current.data?.weeklyCreditsRemaining).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty-payload detection: keep data null so the UI stays in skeleton.
  // -------------------------------------------------------------------------
  describe("empty payload handling", () => {
    it("keeps data null when the backend returns an empty object", async () => {
      getMock.mockResolvedValue(res(EMPTY_PAYLOAD));

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(getMock).toHaveBeenCalledTimes(1);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it("keeps data null when all known fields are zero/empty-equivalent", async () => {
      getMock.mockResolvedValue(
        res({
          weeklyCreditsRemaining: 0,
          weeklyCreditsAllocated: 0,
          boughtCreditsRemaining: 0,
          totalBoughtCredits: 0,
          totalAvailableCredits: 0,
          weeklyResetDate: "",
          lastApiUsage: "",
        }),
      );

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));
      expect(result.current.data).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error paths in fetchCredits.
  // -------------------------------------------------------------------------
  describe("error handling", () => {
    it("captures a thrown Error instance directly", async () => {
      const boom = new Error("network down");
      getMock.mockRejectedValue(boom);

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.error).toBe(boom));

      expect(result.current.error?.message).toBe("network down");
      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasAttempted).toBe(true);
    });

    it("wraps a non-Error rejection in a new Error via String()", async () => {
      getMock.mockRejectedValue("string failure");

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.error).not.toBeNull());

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("string failure");
      expect(result.current.hasAttempted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Manual refetch: the hasAttempted guard prevents auto-fetch re-runs, but
  // refetch() always re-invokes the network call and resets error state.
  // -------------------------------------------------------------------------
  describe("manual refetch", () => {
    it("re-fetches on demand and clears a prior error", async () => {
      // First (auto) attempt fails; the effect's hasAttempted guard then blocks
      // any further auto-fetch, so a manual refetch is the only way forward.
      getMock.mockRejectedValueOnce(new Error("first failure"));

      const { result } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(getMock).toHaveBeenCalledTimes(1);

      // Subsequent call succeeds (beforeEach default still returns canonical).
      await act(async () => {
        await result.current.refetch();
      });

      expect(getMock).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual({
        weeklyCreditsRemaining: 12,
        weeklyCreditsAllocated: 100,
        boughtCreditsRemaining: 5,
        totalBoughtCredits: 50,
        totalAvailableCredits: 17,
        weeklyResetDate: "2026-06-08",
        lastApiUsage: "2026-06-01T10:00:00Z",
      });
      expect(result.current.hasAttempted).toBe(true);
    });

    it("does not auto-fetch a second time once hasAttempted is set (effect guard)", async () => {
      const { result, rerender } = renderHook(() => useCredits());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));
      expect(getMock).toHaveBeenCalledTimes(1);

      // Re-render with the same satisfied conditions: the effect must not fire
      // again because hasAttempted is now true.
      act(() => {
        rerender();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(getMock).toHaveBeenCalledTimes(1);
    });
  });
});
