/**
 * Unit tests for httpErrorHandler.handleHttpError.
 *
 * Every collaborator is mocked for determinism:
 *  - toast.alert            -> spy, so we can assert the generic toast path
 *  - errorUtils             -> extractErrorFileIds / broadcastErroredFiles /
 *                              normalizeAxiosErrorData are controllable spies
 *  - specialErrorToasts     -> showSpecialErrorToast returns a configurable bool
 *  - saasErrorInterceptor   -> handleSaaSError returns a configurable bool
 *  - httpErrorUtils         -> clampText / extractAxiosErrorMessage are spies
 *
 * window.location is replaced with a plain configurable object so that reads of
 * pathname/search are deterministic and writes to href are observable without
 * triggering jsdom navigation. localStorage/sessionStorage are real (jsdom).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { alert } from "@app/components/toast";
import {
  broadcastErroredFiles,
  extractErrorFileIds,
  normalizeAxiosErrorData,
} from "@app/services/errorUtils";
import { showSpecialErrorToast } from "@app/services/specialErrorToasts";
import { handleSaaSError } from "@app/services/saasErrorInterceptor";
import {
  clampText,
  extractAxiosErrorMessage,
} from "@app/services/httpErrorUtils";
import { handleHttpError } from "@app/services/httpErrorHandler";

vi.mock("@app/components/toast", () => ({
  alert: vi.fn(),
}));

vi.mock("@app/services/errorUtils", () => ({
  broadcastErroredFiles: vi.fn(),
  extractErrorFileIds: vi.fn(() => []),
  normalizeAxiosErrorData: vi.fn(async (raw: unknown) => raw),
}));

vi.mock("@app/services/specialErrorToasts", () => ({
  showSpecialErrorToast: vi.fn(() => false),
}));

vi.mock("@app/services/saasErrorInterceptor", () => ({
  handleSaaSError: vi.fn(() => false),
}));

vi.mock("@app/services/httpErrorUtils", () => ({
  clampText: vi.fn((s: string) => s),
  extractAxiosErrorMessage: vi.fn(() => ({
    title: "Generic title",
    body: "Generic body",
  })),
}));

// Typed handles to the mocked collaborators.
const alertMock = vi.mocked(alert);
const broadcastMock = vi.mocked(broadcastErroredFiles);
const extractIdsMock = vi.mocked(extractErrorFileIds);
const normalizeMock = vi.mocked(normalizeAxiosErrorData);
const specialToastMock = vi.mocked(showSpecialErrorToast);
const saasMock = vi.mocked(handleSaaSError);
const clampMock = vi.mocked(clampText);
const extractMsgMock = vi.mocked(extractAxiosErrorMessage);

const POST_LOGIN_KEY = "stirling_post_login_path";
const JWT_KEY = "stirling_jwt";

/** Install a deterministic, mutable window.location. Returns the stub. */
function setLocation(
  pathname: string,
  search = "",
): {
  pathname: string;
  search: string;
  href: string;
} {
  const stub = {
    pathname,
    search,
    href: "http://localhost/",
  };
  Object.defineProperty(window, "location", {
    value: stub,
    writable: true,
    configurable: true,
  });
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementations cleared by clearAllMocks.
  extractIdsMock.mockReturnValue([]);
  normalizeMock.mockImplementation(async (raw: unknown) => raw);
  specialToastMock.mockReturnValue(false);
  saasMock.mockReturnValue(false);
  clampMock.mockImplementation((s: string) => s);
  extractMsgMock.mockReturnValue({
    title: "Generic title",
    body: "Generic body",
  });

  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocation("/workspace");
  // Keep test output quiet and deterministic.
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("handleHttpError - suppressErrorToast short-circuit", () => {
  test("returns false immediately when config.suppressErrorToast is true", async () => {
    const result = await handleHttpError({
      config: { suppressErrorToast: true },
      response: { status: 500 },
    });
    expect(result).toBe(false);
    // No downstream work should run.
    expect(saasMock).not.toHaveBeenCalled();
    expect(extractMsgMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });
});

describe("handleHttpError - 401 handling", () => {
  test("redirects to login and stashes a safe return path when not on an auth page", async () => {
    const loc = setLocation("/tools/merge", "?id=42");
    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });

    expect(result).toBe(true);
    expect(window.sessionStorage.getItem(POST_LOGIN_KEY)).toBe(
      "/tools/merge?id=42",
    );
    // No stored JWT -> no expired= prefix.
    expect(loc.href).toBe(
      `/login?from=${encodeURIComponent("/tools/merge?id=42")}`,
    );
    // 401 path never reaches toast/saas logic.
    expect(saasMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  test("adds expired=true prefix when a stored JWT exists", async () => {
    window.localStorage.setItem(JWT_KEY, "some.jwt.token");
    const loc = setLocation("/tools/split", "");
    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });

    expect(result).toBe(true);
    expect(loc.href).toBe(
      `/login?expired=true&from=${encodeURIComponent("/tools/split")}`,
    );
  });

  test("suppresses without redirecting when already on an auth page", async () => {
    const loc = setLocation("/login", "");
    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });

    expect(result).toBe(true);
    // href untouched and nothing stashed -> no redirect occurred.
    expect(loc.href).toBe("http://localhost/");
    expect(window.sessionStorage.getItem(POST_LOGIN_KEY)).toBeNull();
  });

  test.each(["/auth/callback", "/signup", "/invite/abc"])(
    "treats %s as an auth page and suppresses without redirect",
    async (pathname) => {
      const loc = setLocation(pathname, "");
      const result = await handleHttpError({
        config: {},
        response: { status: 401 },
      });
      expect(result).toBe(true);
      expect(loc.href).toBe("http://localhost/");
    },
  );

  test("suppresses without redirect when skipAuthRedirect is set, even off an auth page", async () => {
    const loc = setLocation("/tools/merge", "");
    const result = await handleHttpError({
      config: { skipAuthRedirect: true },
      response: { status: 401 },
    });
    expect(result).toBe(true);
    // skipAuthRedirect forces the "auth page" branch: no redirect, no stash.
    expect(loc.href).toBe("http://localhost/");
    expect(window.sessionStorage.getItem(POST_LOGIN_KEY)).toBeNull();
  });

  test("does NOT stash an unsafe return path but still redirects", async () => {
    // An open-redirect style pathname must be rejected by isSafePostLoginPath.
    const loc = setLocation("//evil.example.com", "");
    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });
    expect(result).toBe(true);
    // Nothing stashed because the path is unsafe...
    expect(window.sessionStorage.getItem(POST_LOGIN_KEY)).toBeNull();
    // ...but the redirect still fires with the encoded current location.
    expect(loc.href).toBe(
      `/login?from=${encodeURIComponent("//evil.example.com")}`,
    );
  });

  test("tolerates localStorage.getItem throwing while reading the JWT", async () => {
    const loc = setLocation("/tools/merge", "");
    const getItemSpy = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });

    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });

    expect(result).toBe(true);
    // Falls back to no expired prefix when JWT read throws.
    expect(loc.href).toBe(`/login?from=${encodeURIComponent("/tools/merge")}`);
    getItemSpy.mockRestore();
  });

  test("does not throw when sessionStorage.setItem fails during stash (fails open)", async () => {
    const loc = setLocation("/tools/merge", "");
    const setItemSpy = vi
      .spyOn(window.sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });

    const result = await handleHttpError({
      config: {},
      response: { status: 401 },
    });

    // Still redirects despite the stash failure.
    expect(result).toBe(true);
    expect(loc.href).toBe(`/login?from=${encodeURIComponent("/tools/merge")}`);
    setItemSpy.mockRestore();
  });
});

describe("handleHttpError - SaaS interceptor", () => {
  test("returns true and skips toast logic when handleSaaSError handles it", async () => {
    saasMock.mockReturnValue(true);
    const result = await handleHttpError({
      config: {},
      response: { status: 500, data: { message: "x" } },
    });
    expect(result).toBe(true);
    expect(extractMsgMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });
});

describe("handleHttpError - generic toast path", () => {
  test("shows the generic toast when nothing special matches", async () => {
    const error = {
      config: { url: "/api/v1/convert" },
      response: { status: 400, data: { message: "bad input" } },
    };
    const result = await handleHttpError(error);

    expect(result).toBe(false);
    expect(extractMsgMock).toHaveBeenCalledWith(error);
    expect(normalizeMock).toHaveBeenCalledWith({ message: "bad input" });
    expect(clampMock).toHaveBeenCalledWith("Generic body");
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith({
      alertType: "error",
      title: "Generic title",
      body: "Generic body",
      expandable: true,
      isPersistentPopup: false,
    });
  });

  test("broadcasts errored file ids when extractErrorFileIds returns ids", async () => {
    extractIdsMock.mockReturnValue(["file-a", "file-b"]);
    const result = await handleHttpError({
      config: { url: "/api/v1/merge" },
      response: { status: 400, data: { errorFileIds: ["file-a", "file-b"] } },
    });
    expect(result).toBe(false);
    expect(broadcastMock).toHaveBeenCalledWith(["file-a", "file-b"]);
  });

  test("does NOT broadcast when extractErrorFileIds returns an empty array", async () => {
    extractIdsMock.mockReturnValue([]);
    await handleHttpError({
      config: { url: "/api/v1/merge" },
      response: { status: 400, data: {} },
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  test("delegates to the special toast and skips the generic alert when handled", async () => {
    specialToastMock.mockReturnValue(true);
    const result = await handleHttpError({
      config: { url: "/api/v1/ocr" },
      response: { status: 400, data: { message: "special" } },
    });
    expect(result).toBe(false);
    expect(specialToastMock).toHaveBeenCalledTimes(1);
    expect(alertMock).not.toHaveBeenCalled();
  });

  test("stringifies a non-string normalized payload before passing to the special toast", async () => {
    normalizeMock.mockResolvedValue({ a: 1, b: "x" });
    await handleHttpError({
      config: { url: "/api/v1/x" },
      response: { status: 400, data: { a: 1, b: "x" } },
    });
    expect(specialToastMock).toHaveBeenCalledWith(
      JSON.stringify({ a: 1, b: "x" }),
      { status: 400 },
    );
  });

  test("passes a string normalized payload through unchanged", async () => {
    normalizeMock.mockResolvedValue("already a string");
    await handleHttpError({
      config: { url: "/api/v1/x" },
      response: { status: 400, data: "already a string" },
    });
    expect(specialToastMock).toHaveBeenCalledWith("already a string", {
      status: 400,
    });
  });
});

describe("handleHttpError - resilient error swallowing", () => {
  test("continues to the toast when normalizeAxiosErrorData rejects", async () => {
    normalizeMock.mockRejectedValue(new Error("normalize boom"));
    const result = await handleHttpError({
      config: { url: "/api/v1/x" },
      response: { status: 400, data: { message: "m" } },
    });
    expect(result).toBe(false);
    // raw data is reused as the normalized value, still reaching the toast.
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test("continues to the toast when extractErrorFileIds throws", async () => {
    extractIdsMock.mockImplementation(() => {
      throw new Error("ids boom");
    });
    const result = await handleHttpError({
      config: { url: "/api/v1/x" },
      response: { status: 400, data: { message: "m" } },
    });
    expect(result).toBe(false);
    expect(broadcastMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to the generic toast when JSON.stringify of normalized throws (circular)", async () => {
    // A circular object makes JSON.stringify throw; rawString stays undefined.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    normalizeMock.mockResolvedValue(circular);

    const result = await handleHttpError({
      config: { url: "/api/v1/x" },
      response: { status: 400, data: {} },
    });
    expect(result).toBe(false);
    expect(specialToastMock).toHaveBeenCalledWith(undefined, { status: 400 });
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleHttpError - generic/special endpoint dedupe", () => {
  test("suppresses a generic error that arrives shortly after a special one on the same endpoint", async () => {
    const url = "/api/v1/dedupe";

    // 1) A 422 (special) marks the endpoint as recently special.
    const first = await handleHttpError({
      config: { url },
      response: { status: 422, data: { message: "first" } },
    });
    expect(first).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(1);

    // 2) A generic error on the SAME endpoint within the suppress window is deduped.
    vi.advanceTimersByTime(500); // < 1500ms window
    const second = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "second" } },
    });
    expect(second).toBe(true);
    // No new alert from the suppressed generic error.
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test("does NOT suppress once the special-suppress window has elapsed", async () => {
    const url = "/api/v1/dedupe-window";

    await handleHttpError({
      config: { url },
      response: { status: 409, data: { message: "conflict" } },
    });
    expect(alertMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000); // > 1500ms window
    const result = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "later generic" } },
    });
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(2);
  });

  test("treats a 'Failed files:' body as special and records the endpoint", async () => {
    extractMsgMock.mockReturnValue({
      title: "t",
      body: "Failed files: a.pdf, b.pdf",
    });
    const url = "/api/v1/failed-files";
    const first = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "x" } },
    });
    expect(first).toBe(false);

    // A subsequent generic error (different body) on the same endpoint is suppressed.
    extractMsgMock.mockReturnValue({ title: "t", body: "plain generic" });
    vi.advanceTimersByTime(100);
    const second = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "y" } },
    });
    expect(second).toBe(true);
  });

  test("treats an 'invalid/corrupted file(s)' body as special (case-insensitive)", async () => {
    extractMsgMock.mockReturnValue({
      title: "t",
      body: "Process failed due to INVALID/CORRUPTED FILE(S)",
    });
    const url = "/api/v1/corrupt";
    const first = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "x" } },
    });
    expect(first).toBe(false);

    extractMsgMock.mockReturnValue({ title: "t", body: "plain generic" });
    vi.advanceTimersByTime(100);
    const second = await handleHttpError({
      config: { url },
      response: { status: 400, data: { message: "y" } },
    });
    expect(second).toBe(true);
  });

  test("does not dedupe across different endpoints", async () => {
    await handleHttpError({
      config: { url: "/api/v1/one" },
      response: { status: 422, data: { message: "special" } },
    });
    expect(alertMock).toHaveBeenCalledTimes(1);

    const result = await handleHttpError({
      config: { url: "/api/v1/two" },
      response: { status: 400, data: { message: "generic on other endpoint" } },
    });
    // Different endpoint -> not suppressed.
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(2);
  });

  test("does not dedupe when the error has no config.url", async () => {
    // Special error without a url: cannot be recorded by endpoint.
    await handleHttpError({
      response: { status: 422, data: { message: "no url special" } },
    });
    expect(alertMock).toHaveBeenCalledTimes(1);

    // Generic error without a url: the !url branch means no suppression lookup.
    const result = await handleHttpError({
      response: { status: 400, data: { message: "no url generic" } },
    });
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(2);
  });
});

describe("handleHttpError - non-401 status with missing fields", () => {
  test("handles an error with no response/status as a generic toast", async () => {
    const result = await handleHttpError({ config: { url: "/api/v1/x" } });
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test("handles a completely empty error object without throwing", async () => {
    const result = await handleHttpError({});
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});
