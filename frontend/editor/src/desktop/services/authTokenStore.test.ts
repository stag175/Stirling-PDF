/**
 * Unit tests for authTokenStore (desktop layer).
 *
 * The module exposes a single async helper, getAuthTokenFromAnySource, which
 * reads a JWT from "any available source": it first tries the Tauri store via
 * invoke("get_auth_token") inside a try/catch, and on a falsy result OR an
 * error falls back to localStorage.getItem("stirling_jwt") inside its own
 * try/catch.
 *
 * Determinism: the only external dependency, invoke from @tauri-apps/api/core,
 * is replaced with a vi.mock so no real Tauri runtime is touched. localStorage
 * is the jsdom implementation, cleared between tests; getItem is spied on (and
 * made to throw) to exercise the inner catch branch. console.error is silenced
 * so the module's logging does not pollute test output.
 *
 * Coverage: the four deterministic paths are
 *   1. Tauri returns a truthy token            -> returned directly
 *   2. Tauri returns falsy                      -> localStorage fallback (hit)
 *   3. Tauri invoke rejects (outer catch)       -> localStorage fallback
 *   4. localStorage.getItem throws (inner catch) -> returns null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- mocks ------------------------------------------------------------------
// invoke is the only external dependency; the module imports it at load time
// and calls it by command name.
const invoke = vi.fn<(cmd: string) => Promise<string | null>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => invoke(cmd),
}));

import { getAuthTokenFromAnySource } from "@app/services/authTokenStore";

const TOKEN_KEY = "stirling_jwt";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAuthTokenFromAnySource — Tauri store path", () => {
  it("returns the token resolved by the Tauri invoke command without touching localStorage", async () => {
    invoke.mockResolvedValue("tauri-jwt-123");
    const getItemSpy = vi.spyOn(window.localStorage, "getItem");

    expect(await getAuthTokenFromAnySource()).toBe("tauri-jwt-123");
    expect(invoke).toHaveBeenCalledWith("get_auth_token");
    // A truthy Tauri result short-circuits before the localStorage fallback.
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("getAuthTokenFromAnySource — falsy Tauri result falls through to localStorage", () => {
  it("falls back to a stored localStorage token when invoke resolves null", async () => {
    invoke.mockResolvedValue(null);
    localStorage.setItem(TOKEN_KEY, "local-jwt-abc");

    expect(await getAuthTokenFromAnySource()).toBe("local-jwt-abc");
    expect(invoke).toHaveBeenCalledWith("get_auth_token");
    // Falsy (not error) result: the error log must NOT have fired.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns null when invoke resolves null and localStorage is empty", async () => {
    invoke.mockResolvedValue(null);

    expect(await getAuthTokenFromAnySource()).toBeNull();
  });

  it("treats an empty-string Tauri token as falsy and falls through to localStorage", async () => {
    // "" is falsy, so the `if (token)` guard fails and the fallback runs.
    invoke.mockResolvedValue("");
    localStorage.setItem(TOKEN_KEY, "local-jwt-from-empty");

    expect(await getAuthTokenFromAnySource()).toBe("local-jwt-from-empty");
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("getAuthTokenFromAnySource — Tauri invoke rejects (outer catch)", () => {
  it("logs the Tauri error and returns the localStorage token", async () => {
    invoke.mockRejectedValue(new Error("ipc unavailable"));
    localStorage.setItem(TOKEN_KEY, "local-jwt-after-error");

    expect(await getAuthTokenFromAnySource()).toBe("local-jwt-after-error");
    expect(console.error).toHaveBeenCalledWith(
      "[Desktop AuthTokenStore] Failed to read from Tauri store:",
      expect.any(Error),
    );
  });

  it("logs the Tauri error and returns null when localStorage is also empty", async () => {
    invoke.mockRejectedValue(new Error("ipc unavailable"));

    expect(await getAuthTokenFromAnySource()).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe("getAuthTokenFromAnySource — localStorage.getItem throws (inner catch)", () => {
  it("returns null and logs the localStorage error when getItem throws after a falsy Tauri result", async () => {
    invoke.mockResolvedValue(null);
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(await getAuthTokenFromAnySource()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[Desktop AuthTokenStore] Failed to read from localStorage:",
      expect.any(Error),
    );
  });

  it("logs both errors when invoke rejects AND localStorage.getItem throws", async () => {
    invoke.mockRejectedValue(new Error("ipc unavailable"));
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(await getAuthTokenFromAnySource()).toBeNull();
    // Outer (Tauri) catch + inner (localStorage) catch both logged.
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
