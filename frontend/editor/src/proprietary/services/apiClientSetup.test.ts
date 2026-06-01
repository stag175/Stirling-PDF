import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import type {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

// The module under test holds module-level mutable state (isRefreshing,
// failedQueue). We re-import it fresh for each test via vi.resetModules() +
// dynamic import so queued-refresh state never leaks across tests.
type ApiClientSetupModule = typeof import("@app/services/apiClientSetup");

type RequestSuccess = (
  config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
type RequestError = (error: unknown) => unknown;
type ResponseSuccess = (response: unknown) => unknown;
type ResponseError = (error: AxiosError) => unknown;

interface CapturedHandlers {
  requestSuccess: RequestSuccess;
  requestError: RequestError;
  responseSuccess: ResponseSuccess;
  responseError: ResponseError;
}

/**
 * Build a fake axios instance that (a) is itself callable (so the interceptor's
 * `client(originalRequest)` retry path works) and (b) records the request /
 * response interceptor handlers registered by setupApiInterceptors so the test
 * can drive them directly.
 */
function makeFakeClient(): {
  client: AxiosInstance;
  handlers: CapturedHandlers;
  clientCall: Mock;
  post: Mock;
} {
  const handlers: Partial<CapturedHandlers> = {};

  const clientCall = vi.fn(async (config: unknown) => ({
    data: { retried: true, config },
  }));
  const post = vi.fn();

  const client = clientCall as unknown as AxiosInstance & Mock;
  client.post = post as unknown as AxiosInstance["post"];
  client.interceptors = {
    request: {
      use: vi.fn((success: RequestSuccess, error: RequestError) => {
        handlers.requestSuccess = success;
        handlers.requestError = error;
        return 0;
      }),
    },
    response: {
      use: vi.fn((success: ResponseSuccess, error: ResponseError) => {
        handlers.responseSuccess = success;
        handlers.responseError = error;
        return 0;
      }),
    },
  } as unknown as AxiosInstance["interceptors"];

  return {
    client,
    handlers: handlers as CapturedHandlers,
    clientCall,
    post,
  };
}

/** Minimal AxiosError-shaped object for the response error interceptor. */
function makeAxiosError(opts: {
  status?: number;
  config?: Partial<InternalAxiosRequestConfig> & { _retry?: boolean };
}): AxiosError {
  return {
    isAxiosError: true,
    name: "AxiosError",
    message: "request failed",
    config: opts.config as InternalAxiosRequestConfig | undefined,
    response: opts.status
      ? ({
          status: opts.status,
          data: {},
          headers: {},
          statusText: "",
        } as never)
      : undefined,
  } as AxiosError;
}

/** A request config object with a mutable headers bag. */
function makeConfig(
  url: string,
  extra: Record<string, unknown> = {},
): InternalAxiosRequestConfig & { _retry?: boolean } {
  return {
    url,
    headers: {} as Record<string, unknown>,
    ...extra,
  } as unknown as InternalAxiosRequestConfig & { _retry?: boolean };
}

const JWT_KEY = "stirling_jwt";

async function loadModule(): Promise<ApiClientSetupModule> {
  vi.resetModules();
  return import("@app/services/apiClientSetup");
}

describe("apiClientSetup", () => {
  let originalCookie: PropertyDescriptor | undefined;
  let originalLocation: Location;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Silence (but still spy on) the module's console noise.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});

    originalCookie = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    originalLocation = window.location;
  });

  afterEach(() => {
    // Restore document.cookie if a test replaced it.
    if (originalCookie) {
      Object.defineProperty(document, "cookie", originalCookie);
    }
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  /** Replace document.cookie with a fixed string for getXsrfToken. */
  function setCookie(value: string): void {
    Object.defineProperty(document, "cookie", {
      value,
      writable: true,
      configurable: true,
    });
  }

  /** Replace window.location with a stubbed object. */
  function stubLocation(pathname: string): {
    hrefSetter: Mock;
    getHref: () => string;
  } {
    let href = `http://localhost${pathname}`;
    const hrefSetter = vi.fn((v: string) => {
      href = v;
    });
    Object.defineProperty(window, "location", {
      value: {
        pathname,
        get href() {
          return href;
        },
        set href(v: string) {
          hrefSetter(v);
        },
      },
      writable: true,
      configurable: true,
    });
    return { hrefSetter, getHref: () => href };
  }

  describe("getAuthHeaders", () => {
    it("returns empty object when there is no JWT and no XSRF cookie", async () => {
      setCookie("");
      const mod = await loadModule();

      expect(mod.getAuthHeaders()).toEqual({});
    });

    it("includes Authorization when a JWT is stored", async () => {
      localStorage.setItem(JWT_KEY, "tok-123");
      setCookie("");
      const mod = await loadModule();

      expect(mod.getAuthHeaders()).toEqual({
        Authorization: "Bearer tok-123",
      });
    });

    it("includes X-XSRF-TOKEN (decoded) when an XSRF cookie is present", async () => {
      setCookie("other=1; XSRF-TOKEN=abc%2F123; foo=bar");
      const mod = await loadModule();

      expect(mod.getAuthHeaders()).toEqual({
        "X-XSRF-TOKEN": "abc/123",
      });
    });

    it("includes both Authorization and X-XSRF-TOKEN when both exist", async () => {
      localStorage.setItem(JWT_KEY, "tok-xyz");
      setCookie("XSRF-TOKEN=plain-token");
      const mod = await loadModule();

      expect(mod.getAuthHeaders()).toEqual({
        Authorization: "Bearer tok-xyz",
        "X-XSRF-TOKEN": "plain-token",
      });
    });

    it("returns no Authorization header when getItem throws (storage error branch)", async () => {
      const getItemSpy = vi
        .spyOn(window.localStorage, "getItem")
        .mockImplementation(() => {
          throw new Error("storage blocked");
        });
      setCookie("");
      const mod = await loadModule();

      const headers = mod.getAuthHeaders();

      expect(headers.Authorization).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        "[API Client] Failed to read JWT from localStorage:",
        expect.any(Error),
      );
      getItemSpy.mockRestore();
    });

    it("returns no XSRF header when reading document.cookie throws (cookie error branch)", async () => {
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get() {
          throw new Error("cookie blocked");
        },
      });
      const mod = await loadModule();

      const headers = mod.getAuthHeaders();

      expect(headers["X-XSRF-TOKEN"]).toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        "[API Client] Failed to read XSRF token from cookies:",
        expect.any(Error),
      );
    });
  });

  describe("setupApiInterceptors registration", () => {
    it("registers one request and one response interceptor", async () => {
      const mod = await loadModule();
      const { client } = makeFakeClient();

      mod.setupApiInterceptors(client);

      expect(client.interceptors.request.use).toHaveBeenCalledTimes(1);
      expect(client.interceptors.response.use).toHaveBeenCalledTimes(1);
    });
  });

  describe("request interceptor", () => {
    it("adds auth headers when none are already present", async () => {
      localStorage.setItem(JWT_KEY, "req-tok");
      setCookie("XSRF-TOKEN=req-xsrf");
      const mod = await loadModule();
      const { client, handlers } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const config = makeConfig("/api/v1/foo");
      const result = await handlers.requestSuccess(config);

      expect(result.headers.Authorization).toBe("Bearer req-tok");
      expect(result.headers["X-XSRF-TOKEN"]).toBe("req-xsrf");
    });

    it("does not overwrite headers that are already set", async () => {
      localStorage.setItem(JWT_KEY, "req-tok");
      setCookie("");
      const mod = await loadModule();
      const { client, handlers } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const config = makeConfig("/api/v1/foo");
      config.headers.Authorization = "Bearer preexisting";
      const result = await handlers.requestSuccess(config);

      expect(result.headers.Authorization).toBe("Bearer preexisting");
    });

    it("rejects via the request error handler", async () => {
      const mod = await loadModule();
      const { client, handlers } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const err = new Error("request setup failed");
      await expect(handlers.requestError(err)).rejects.toBe(err);
    });
  });

  describe("response interceptor - passthrough & skip paths", () => {
    it("passes successful responses through untouched", async () => {
      const mod = await loadModule();
      const { client, handlers } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const response = { data: "ok" };
      expect(handlers.responseSuccess(response)).toBe(response);
    });

    it("rejects immediately when there is no originalRequest config", async () => {
      const mod = await loadModule();
      const { client, handlers, clientCall } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const error = makeAxiosError({ status: 401, config: undefined });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(clientCall).not.toHaveBeenCalled();
    });

    it("skips refresh for /api/v1/auth/ endpoints (not /auth/me)", async () => {
      localStorage.setItem(JWT_KEY, "tok");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const error = makeAxiosError({
        status: 401,
        config: makeConfig("/api/v1/auth/login"),
      });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(post).not.toHaveBeenCalled();
    });

    it("skips refresh when X-Skip-Auth-Refresh header is set", async () => {
      localStorage.setItem(JWT_KEY, "tok");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const config = makeConfig("/api/v1/data");
      config.headers["X-Skip-Auth-Refresh"] = "true";
      const error = makeAxiosError({ status: 401, config });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(post).not.toHaveBeenCalled();
    });

    it("skips refresh when the request was already retried (_retry)", async () => {
      localStorage.setItem(JWT_KEY, "tok");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const config = makeConfig("/api/v1/data");
      config._retry = true;
      const error = makeAxiosError({ status: 401, config });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(post).not.toHaveBeenCalled();
    });

    it("rejects non-401 errors without attempting refresh", async () => {
      localStorage.setItem(JWT_KEY, "tok");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const error = makeAxiosError({
        status: 500,
        config: makeConfig("/api/v1/data"),
      });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(post).not.toHaveBeenCalled();
    });

    it("rejects 401 errors when there is no stored JWT (nothing to refresh)", async () => {
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const error = makeAxiosError({
        status: 401,
        config: makeConfig("/api/v1/data"),
      });
      await expect(handlers.responseError(error)).rejects.toBe(error);
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe("response interceptor - 401 auto-refresh (happy path)", () => {
    it("refreshes the token, stores it, and retries the original request", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const mod = await loadModule();
      const { client, handlers, clientCall, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      post.mockResolvedValueOnce({
        data: { session: { access_token: "fresh-tok" } },
      });

      const config = makeConfig("/api/v1/data");
      const result = await handlers.responseError(
        makeAxiosError({ status: 401, config }),
      );

      // Refresh endpoint called with the skip-refresh guard header.
      expect(post).toHaveBeenCalledWith(
        "/api/v1/auth/refresh",
        {},
        { headers: { "X-Skip-Auth-Refresh": "true" } },
      );
      // New token persisted.
      expect(localStorage.getItem(JWT_KEY)).toBe("fresh-tok");
      // Original request marked retried and re-issued with the new bearer token.
      expect(config._retry).toBe(true);
      expect(config.headers.Authorization).toBe("Bearer fresh-tok");
      expect(clientCall).toHaveBeenCalledWith(config);
      expect(result).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ retried: true }),
        }),
      );
    });

    it("triggers refresh for the /api/v1/auth/me endpoint (the documented exception)", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const mod = await loadModule();
      const { client, handlers, post, clientCall } = makeFakeClient();
      mod.setupApiInterceptors(client);

      post.mockResolvedValueOnce({
        data: { session: { access_token: "me-tok" } },
      });

      const config = makeConfig("/api/v1/auth/me");
      await handlers.responseError(makeAxiosError({ status: 401, config }));

      expect(post).toHaveBeenCalledTimes(1);
      expect(clientCall).toHaveBeenCalledWith(config);
      expect(localStorage.getItem(JWT_KEY)).toBe("me-tok");
    });
  });

  describe("response interceptor - 401 refresh failures", () => {
    it("clears the JWT and redirects to /login when refresh response has no access token", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const { hrefSetter } = stubLocation("/workbench");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      // Refresh succeeds at the HTTP level but carries no token.
      post.mockResolvedValueOnce({ data: { session: {} } });

      const config = makeConfig("/api/v1/data");
      await expect(
        handlers.responseError(makeAxiosError({ status: 401, config })),
      ).rejects.toThrow("No access token in refresh response");

      expect(localStorage.getItem(JWT_KEY)).toBeNull();
      expect(hrefSetter).toHaveBeenCalledWith("/login");
    });

    it("clears the JWT and redirects when the refresh request itself rejects", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const { hrefSetter } = stubLocation("/dashboard");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      const refreshErr = new Error("refresh network down");
      post.mockRejectedValueOnce(refreshErr);

      const config = makeConfig("/api/v1/data");
      await expect(
        handlers.responseError(makeAxiosError({ status: 401, config })),
      ).rejects.toBe(refreshErr);

      expect(localStorage.getItem(JWT_KEY)).toBeNull();
      expect(hrefSetter).toHaveBeenCalledWith("/login");
    });

    it("does not redirect again when already on the /login page", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const { hrefSetter } = stubLocation("/login");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      post.mockRejectedValueOnce(new Error("still failing"));

      const config = makeConfig("/api/v1/data");
      await expect(
        handlers.responseError(makeAxiosError({ status: 401, config })),
      ).rejects.toThrow("still failing");

      expect(localStorage.getItem(JWT_KEY)).toBeNull();
      expect(hrefSetter).not.toHaveBeenCalled();
    });
  });

  describe("response interceptor - refresh queue (concurrent 401s)", () => {
    it("queues a concurrent 401 and resolves it with the refreshed token once refresh completes", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const mod = await loadModule();
      const { client, handlers, clientCall, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      // Gate the refresh POST so the first request stays "in flight" while a
      // second 401 arrives and must be queued.
      let resolveRefresh!: (value: unknown) => void;
      post.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      );

      const firstConfig = makeConfig("/api/v1/first");
      const firstPromise = handlers.responseError(
        makeAxiosError({ status: 401, config: firstConfig }),
      );

      // Second 401 arrives while isRefreshing === true → it gets queued.
      const secondConfig = makeConfig("/api/v1/second");
      const secondPromise = handlers.responseError(
        makeAxiosError({ status: 401, config: secondConfig }),
      );

      // Allow the queued promise's executor to run.
      await Promise.resolve();

      // Complete the refresh; this drains the queue.
      resolveRefresh({ data: { session: { access_token: "queued-tok" } } });

      await firstPromise;
      await secondPromise;

      // Both the original and the queued request were retried with the new token.
      expect(firstConfig.headers.Authorization).toBe("Bearer queued-tok");
      expect(secondConfig.headers.Authorization).toBe("Bearer queued-tok");
      expect(clientCall).toHaveBeenCalledWith(firstConfig);
      expect(clientCall).toHaveBeenCalledWith(secondConfig);
      // Refresh endpoint hit exactly once despite two 401s.
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("rejects a queued request when the in-flight refresh fails", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      stubLocation("/workbench");
      const mod = await loadModule();
      const { client, handlers, clientCall, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      let rejectRefresh!: (error: unknown) => void;
      post.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectRefresh = reject;
        }),
      );

      const firstConfig = makeConfig("/api/v1/first");
      const firstPromise = handlers.responseError(
        makeAxiosError({ status: 401, config: firstConfig }),
      );

      const secondConfig = makeConfig("/api/v1/second");
      const secondPromise = handlers.responseError(
        makeAxiosError({ status: 401, config: secondConfig }),
      );

      await Promise.resolve();

      const refreshErr = new Error("refresh failed for queue");
      rejectRefresh(refreshErr);

      await expect(firstPromise).rejects.toBe(refreshErr);
      await expect(secondPromise).rejects.toBe(refreshErr);
      // The queued request must NOT be retried when refresh fails.
      expect(clientCall).not.toHaveBeenCalledWith(secondConfig);
    });
  });

  describe("internal storage helpers (reached via interceptors)", () => {
    it("logs an error but continues when storing the refreshed token throws", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      const mod = await loadModule();
      const { client, handlers, clientCall, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      post.mockResolvedValueOnce({
        data: { session: { access_token: "store-fail-tok" } },
      });

      // setItem throws only for the persist step.
      const setItemSpy = vi
        .spyOn(window.localStorage, "setItem")
        .mockImplementationOnce(() => {
          throw new Error("quota exceeded");
        });

      const config = makeConfig("/api/v1/data");
      const result = await handlers.responseError(
        makeAxiosError({ status: 401, config }),
      );

      expect(console.error).toHaveBeenCalledWith(
        "[API Client] Failed to store JWT in localStorage:",
        expect.any(Error),
      );
      // Despite the storage failure, the retry still proceeds with the new token.
      expect(config.headers.Authorization).toBe("Bearer store-fail-tok");
      expect(clientCall).toHaveBeenCalledWith(config);
      expect(result).toBeDefined();
      setItemSpy.mockRestore();
    });

    it("logs an error but continues when clearing the token throws during a failed refresh", async () => {
      localStorage.setItem(JWT_KEY, "old-tok");
      stubLocation("/login");
      const mod = await loadModule();
      const { client, handlers, post } = makeFakeClient();
      mod.setupApiInterceptors(client);

      post.mockRejectedValueOnce(new Error("refresh boom"));

      const removeItemSpy = vi
        .spyOn(window.localStorage, "removeItem")
        .mockImplementationOnce(() => {
          throw new Error("remove blocked");
        });

      const config = makeConfig("/api/v1/data");
      await expect(
        handlers.responseError(makeAxiosError({ status: 401, config })),
      ).rejects.toThrow("refresh boom");

      expect(console.error).toHaveBeenCalledWith(
        "[API Client] Failed to clear JWT from localStorage:",
        expect.any(Error),
      );
      removeItemSpy.mockRestore();
    });
  });
});
