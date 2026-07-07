import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Dependency mocks.
//
// useAutoAnonymousAuth pulls in four src modules. We mock all of them so the
// hook runs in isolation and deterministically:
//   - @app/auth/UseSession      -> useAuth() (session + loading)
//   - react-router-dom          -> useLocation() (pathname gating)
//   - @app/auth/supabase        -> signInAnonymously() + supabase.auth.*
//   - @app/utils/pathUtils      -> route classification helpers
//
// vi.hoisted produces the underlying vi.fns BEFORE the hoisted vi.mock
// factories run, so each test can re-program them. Note: the saas
// setupTests.ts already mocks @app/auth/supabase globally; our explicit
// vi.mock here takes precedence for this file.
// ---------------------------------------------------------------------------
const {
  useAuthMock,
  useLocationMock,
  signInAnonymouslyMock,
  getSessionMock,
  onAuthStateChangeMock,
  isAuthRouteMock,
  isHomeRouteMock,
  isToolRouteMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useLocationMock: vi.fn(),
  signInAnonymouslyMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  isAuthRouteMock: vi.fn(),
  isHomeRouteMock: vi.fn(),
  isToolRouteMock: vi.fn(),
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: useAuthMock,
}));

vi.mock("react-router-dom", () => ({
  useLocation: useLocationMock,
}));

vi.mock("@app/auth/supabase", () => ({
  signInAnonymously: signInAnonymouslyMock,
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}));

vi.mock("@app/utils/pathUtils", () => ({
  isAuthRoute: isAuthRouteMock,
  isHomeRoute: isHomeRouteMock,
  isToolRoute: isToolRouteMock,
}));

import { useAutoAnonymousAuth } from "@app/hooks/useAutoAnonymousAuth";

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** A fake auth subscription whose unsubscribe is observable. */
function makeSubscription() {
  const unsubscribe = vi.fn();
  return {
    unsubscribe,
    handle: { data: { subscription: { unsubscribe } } },
  };
}

/** Program getSession to report "no token" then "token" after N calls. */
function tokenAfterCalls(n: number) {
  let calls = 0;
  getSessionMock.mockImplementation(async () => {
    calls += 1;
    return calls > n
      ? { data: { session: { access_token: "tok" } }, error: null }
      : { data: { session: null }, error: null };
  });
}

/** Configure the route helpers for a plain tool route. */
function setToolRoute() {
  isAuthRouteMock.mockReturnValue(false);
  isHomeRouteMock.mockReturnValue(false);
  isToolRouteMock.mockReturnValue(true);
}

describe("useAutoAnonymousAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible happy-path defaults; individual tests override.
    useAuthMock.mockReturnValue({ session: null, loading: false });
    useLocationMock.mockReturnValue({ pathname: "/compress" });
    signInAnonymouslyMock.mockResolvedValue({ data: {}, error: null });
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    onAuthStateChangeMock.mockReturnValue(makeSubscription().handle);
    isAuthRouteMock.mockReturnValue(false);
    isHomeRouteMock.mockReturnValue(false);
    isToolRouteMock.mockReturnValue(false);
    // Silence the hook's diagnostic logging.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // shouldAutoAuthenticate route gating (via the auto-trigger effect).
  // -------------------------------------------------------------------------
  describe("route gating", () => {
    it("does not auto-auth while auth is still loading", () => {
      useAuthMock.mockReturnValue({ session: null, loading: true });
      setToolRoute();

      const { result } = renderHook(() => useAutoAnonymousAuth());

      expect(signInAnonymouslyMock).not.toHaveBeenCalled();
      expect(result.current.shouldTriggerAutoAuth).toBe(false);
      expect(result.current.isAutoAuthenticating).toBe(false);
    });

    it("does not auto-auth when a session already exists", () => {
      useAuthMock.mockReturnValue({
        session: { access_token: "existing" },
        loading: false,
      });
      setToolRoute();

      renderHook(() => useAutoAnonymousAuth());

      expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    });

    it("does not auto-auth on an auth route (login/signup/callback)", () => {
      isAuthRouteMock.mockReturnValue(true);
      isHomeRouteMock.mockReturnValue(false);
      isToolRouteMock.mockReturnValue(true);

      renderHook(() => useAutoAnonymousAuth());

      expect(isAuthRouteMock).toHaveBeenCalledWith("/compress");
      expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    });

    it("does not auto-auth on the home route", () => {
      isAuthRouteMock.mockReturnValue(false);
      isHomeRouteMock.mockReturnValue(true);
      isToolRouteMock.mockReturnValue(true);

      renderHook(() => useAutoAnonymousAuth());

      expect(isHomeRouteMock).toHaveBeenCalled();
      expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    });

    it("does not auto-auth on a non-tool route", () => {
      isAuthRouteMock.mockReturnValue(false);
      isHomeRouteMock.mockReturnValue(false);
      isToolRouteMock.mockReturnValue(false);

      renderHook(() => useAutoAnonymousAuth());

      expect(isToolRouteMock).toHaveBeenCalled();
      expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path auto-auth (token already present -> waitForToken fast path).
  // -------------------------------------------------------------------------
  describe("automatic anonymous auth on a tool route", () => {
    it("signs in anonymously and resolves immediately when a token is already present", async () => {
      setToolRoute();
      // getSession returns a token on the very first call -> fast path.

      const { result } = renderHook(() => useAutoAnonymousAuth());

      await waitFor(() =>
        expect(result.current.isAutoAuthenticating).toBe(false),
      );

      // The auto-trigger effect may fire more than once before the
      // isAutoAuthenticating guard flushes (the hook re-runs the effect when
      // shouldTriggerAutoAuth flips), so we only assert it ran.
      expect(signInAnonymouslyMock).toHaveBeenCalled();
      expect(getSessionMock).toHaveBeenCalled();
      // onAuthStateChange is never reached on the fast path.
      expect(onAuthStateChangeMock).not.toHaveBeenCalled();
      expect(result.current.autoAuthError).toBeNull();
      expect(result.current.shouldTriggerAutoAuth).toBe(false);
    });

    it("runs the onAuthStateChange callback path (sees token, unsubscribes)", async () => {
      // REAL timers: the 120ms backoff is cheap and deterministic, avoiding
      // the fragile fake-timer/microtask interleaving inside the poll loop.
      // Manual trigger on a non-tool route -> a single waitForToken loop.
      //
      // NOTE: the source's event callback (lines 49-54) only sets an internal
      // `resolved` flag + unsubscribes to STOP the poll loop; the loop itself
      // is what returns success. We exercise that callback branch here and
      // assert its observable effect (unsubscribe + loop termination) rather
      // than the final success/timeout result, which is inherently racy.
      isToolRouteMock.mockReturnValue(false);
      // No token initially; the event callback flips it ready when it fires.
      let tokenReady = false;
      getSessionMock.mockImplementation(async () => ({
        data: { session: tokenReady ? { access_token: "tok" } : null },
        error: null,
      }));
      const sub = makeSubscription();
      let firedCb: ((evt: string, session: unknown) => Promise<void>) | null =
        null;
      onAuthStateChangeMock.mockImplementation((cb) => {
        firedCb = cb;
        return sub.handle;
      });

      const { result } = renderHook(() => useAutoAnonymousAuth());

      let run!: Promise<void>;
      act(() => {
        run = result.current.triggerAnonymousAuth();
      });

      // The subscription registers synchronously inside waitForToken; flush a
      // microtask so the callback is captured.
      await act(async () => {
        await Promise.resolve();
      });
      expect(onAuthStateChangeMock).toHaveBeenCalled();
      expect(firedCb).not.toBeNull();

      // Fire the auth event carrying a usable token. The callback's hasToken()
      // check is true, so it unsubscribes and marks the wait resolved.
      await act(async () => {
        tokenReady = true;
        await firedCb!("SIGNED_IN", { access_token: "tok" });
        await run;
      });

      expect(result.current.isAutoAuthenticating).toBe(false);
      // The callback (or the loop's own cleanup) unsubscribed the listener.
      expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it("resolves via the polling fallback when no event fires", async () => {
      // REAL timers. Manual trigger on a non-tool route so the auto-trigger
      // effect never fires; this guarantees a single deterministic poll loop.
      isToolRouteMock.mockReturnValue(false);
      // No token on first check; token appears on a later poll iteration.
      tokenAfterCalls(2);
      const sub = makeSubscription();
      // Event callback never invokes -> only the while-loop polling path runs.
      onAuthStateChangeMock.mockReturnValue(sub.handle);

      const { result } = renderHook(() => useAutoAnonymousAuth());

      await act(async () => {
        await result.current.triggerAnonymousAuth();
      });

      expect(result.current.isAutoAuthenticating).toBe(false);
      expect(getSessionMock.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(sub.unsubscribe).toHaveBeenCalled();
      expect(result.current.autoAuthError).toBeNull();
    });

    it("times out and reports an error when no token ever arrives", async () => {
      vi.useFakeTimers();
      // Manual trigger on a non-tool route -> single deterministic loop.
      isToolRouteMock.mockReturnValue(false);
      // Token never appears.
      getSessionMock.mockResolvedValue({
        data: { session: null },
        error: null,
      });
      const sub = makeSubscription();
      onAuthStateChangeMock.mockReturnValue(sub.handle);

      const { result } = renderHook(() => useAutoAnonymousAuth());

      let run!: Promise<void>;
      act(() => {
        run = result.current.triggerAnonymousAuth();
      });
      // runAllTimersAsync drains the 120ms backoff loop, flushing microtasks
      // between fires, until Date.now() passes the hardcoded 7000ms timeout
      // and the loop stops scheduling new timers.
      await act(async () => {
        await vi.runAllTimersAsync();
        await run;
      });

      expect(result.current.isAutoAuthenticating).toBe(false);
      expect(result.current.autoAuthError).toBe(
        "Timed out waiting for anonymous session token",
      );
      expect(sub.unsubscribe).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error paths in triggerAnonymousAuth.
  // -------------------------------------------------------------------------
  describe("auth error handling", () => {
    it("records the error message when signInAnonymously returns an error", async () => {
      setToolRoute();
      signInAnonymouslyMock.mockResolvedValue({
        data: null,
        error: new Error("anon sign-in rejected"),
      });

      const { result } = renderHook(() => useAutoAnonymousAuth());

      await waitFor(() =>
        expect(result.current.autoAuthError).toBe("anon sign-in rejected"),
      );
      expect(result.current.isAutoAuthenticating).toBe(false);
    });

    it("falls back to a generic message when a non-Error is thrown", async () => {
      setToolRoute();
      // Throw a non-Error value so the `e instanceof Error` branch is false.
      signInAnonymouslyMock.mockRejectedValue("string failure");

      const { result } = renderHook(() => useAutoAnonymousAuth());

      await waitFor(() =>
        expect(result.current.autoAuthError).toBe(
          "Anonymous authentication failed",
        ),
      );
      expect(result.current.isAutoAuthenticating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Manual triggerAnonymousAuth + re-entrancy guard.
  // -------------------------------------------------------------------------
  describe("triggerAnonymousAuth (manual)", () => {
    it("can be invoked manually on a non-tool route and completes", async () => {
      // Non-tool route so the auto effect never fires; we drive it by hand.
      isToolRouteMock.mockReturnValue(false);

      const { result } = renderHook(() => useAutoAnonymousAuth());
      expect(signInAnonymouslyMock).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.triggerAnonymousAuth();
      });

      expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
      expect(result.current.isAutoAuthenticating).toBe(false);
      expect(result.current.autoAuthError).toBeNull();
    });

    it("is a no-op while a previous run is still authenticating (re-entrancy guard)", async () => {
      isToolRouteMock.mockReturnValue(false);
      // Hold signInAnonymously pending so the first run stays in-flight.
      let release: (v: { data: unknown; error: null }) => void = () => {};
      const pending = new Promise<{ data: unknown; error: null }>((res) => {
        release = res;
      });
      signInAnonymouslyMock.mockReturnValueOnce(pending);

      const { result } = renderHook(() => useAutoAnonymousAuth());

      // Kick off the first run (do not await — it is pending).
      let firstRun: Promise<void>;
      act(() => {
        firstRun = result.current.triggerAnonymousAuth();
      });
      await waitFor(() =>
        expect(result.current.isAutoAuthenticating).toBe(true),
      );

      // A second concurrent call returns immediately (guard) without a second
      // signInAnonymously invocation.
      await act(async () => {
        await result.current.triggerAnonymousAuth();
      });
      expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);

      // Release the first run and let it finish cleanly.
      await act(async () => {
        release({ data: {}, error: null });
        await firstRun!;
      });
      expect(result.current.isAutoAuthenticating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup effect: clears error/shouldTrigger once authenticated or off-route.
  // -------------------------------------------------------------------------
  describe("cleanup effect", () => {
    it("clears state when a session becomes present after an error", async () => {
      setToolRoute();
      signInAnonymouslyMock.mockResolvedValue({
        data: null,
        error: new Error("boom"),
      });

      const { result, rerender } = renderHook(() => useAutoAnonymousAuth());

      await waitFor(() => expect(result.current.autoAuthError).toBe("boom"));

      // Now a session appears -> the cleanup effect should clear the error.
      useAuthMock.mockReturnValue({
        session: { access_token: "now-authed" },
        loading: false,
      });
      act(() => {
        rerender();
      });

      await waitFor(() => expect(result.current.autoAuthError).toBeNull());
      expect(result.current.shouldTriggerAutoAuth).toBe(false);
    });

    it("clears state when navigating away from a tool route", async () => {
      setToolRoute();
      signInAnonymouslyMock.mockResolvedValue({
        data: null,
        error: new Error("boom"),
      });

      const { result, rerender } = renderHook(() => useAutoAnonymousAuth());
      await waitFor(() => expect(result.current.autoAuthError).toBe("boom"));

      // Navigate to a non-tool route -> shouldAutoAuthenticate() is false.
      isToolRouteMock.mockReturnValue(false);
      useLocationMock.mockReturnValue({ pathname: "/" });
      act(() => {
        rerender();
      });

      await waitFor(() => expect(result.current.autoAuthError).toBeNull());
      expect(result.current.shouldTriggerAutoAuth).toBe(false);
    });
  });
});
