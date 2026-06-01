/**
 * Unit tests for the TauriHttpClient (desktop layer).
 *
 * This module is an axios-compatible HTTP wrapper around Tauri's native
 * `@tauri-apps/plugin-http` fetch. It performs deterministic URL/param
 * building, request-body serialization, response-type handling, HTTP
 * status-to-error mapping, network-error classification, and runs request /
 * response / error interceptor chains.
 *
 * Its only external dependency is the Tauri `fetch`, mocked here with vi.mock
 * for fully deterministic behaviour (no real network). We feed it Response-like
 * objects covering ok and non-ok paths and every response type, and assert on
 * the exact request built (url, method, headers, body, credentials, danger).
 * console.* is silenced because the client logs verbosely on its error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- mocks ------------------------------------------------------------------

const tauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => tauriFetch(...args),
}));

import client, {
  create,
  type TauriHttpError,
  type TauriHttpResponse,
} from "@app/services/tauriHttpClient";

// --- helpers ----------------------------------------------------------------

interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  blob?: Blob;
  arrayBuffer?: ArrayBuffer;
  textThrows?: boolean;
}

/**
 * Build a minimal object that quacks like the standard Fetch `Response` the
 * client consumes: `.ok`, `.status`, `.statusText`, a Headers-like `.headers`
 * with both `forEach` and `get`, and the body readers `.text/.blob/.arrayBuffer/.json`.
 */
function fakeResponse(init: FakeResponseInit = {}) {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    headers = {},
    body = "",
    blob,
    arrayBuffer,
    textThrows = false,
  } = init;

  const headerEntries = Object.entries(headers);
  const headerObj = {
    forEach: (cb: (value: string, key: string) => void) => {
      headerEntries.forEach(([k, v]) => cb(v, k));
    },
    get: (key: string) => {
      const found = headerEntries.find(
        ([k]) => k.toLowerCase() === key.toLowerCase(),
      );
      return found ? found[1] : null;
    },
  };

  const bodyText = typeof body === "string" ? body : JSON.stringify(body);

  return {
    ok,
    status,
    statusText,
    headers: headerObj,
    text: vi.fn(async () => {
      if (textThrows) throw new Error("body stream errored");
      return bodyText;
    }),
    json: vi.fn(async () =>
      typeof body === "string" ? JSON.parse(body || "null") : body,
    ),
    blob: vi.fn(async () => blob ?? new Blob([bodyText])),
    arrayBuffer: vi.fn(async () => arrayBuffer ?? new ArrayBuffer(8)),
  };
}

function lastCall() {
  return tauriFetch.mock.calls[tauriFetch.mock.calls.length - 1] as [
    string,
    Record<string, unknown>,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset shared singleton interceptors that individual tests register so they
  // never leak across tests.
  client.interceptors.request.handlers.length = 0;
  client.interceptors.response.handlers.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- buildUrl / getUri ------------------------------------------------------

describe("URL building (getUri / buildUrl)", () => {
  it("returns an absolute http URL unchanged, ignoring baseURL", () => {
    const c = create({ baseURL: "https://api.example.com" });
    expect(c.getUri({ url: "http://other.test/path" })).toBe(
      "http://other.test/path",
    );
  });

  it("returns an absolute https URL unchanged", () => {
    const c = create({ baseURL: "https://api.example.com" });
    expect(c.getUri({ url: "https://other.test/path" })).toBe(
      "https://other.test/path",
    );
  });

  it("prepends the instance baseURL to a relative url", () => {
    const c = create({ baseURL: "https://api.example.com" });
    expect(c.getUri({ url: "/v1/files" })).toBe(
      "https://api.example.com/v1/files",
    );
  });

  it("prefers a per-request baseURL over the instance default", () => {
    const c = create({ baseURL: "https://default.example.com" });
    expect(
      c.getUri({ url: "/x", baseURL: "https://override.example.com" }),
    ).toBe("https://override.example.com/x");
  });

  it("defaults to empty url when none is provided", () => {
    const c = create({ baseURL: "" });
    expect(c.getUri({})).toBe("");
  });

  it("appends params as a query string, skipping null/undefined values", () => {
    const c = create({ baseURL: "https://api.example.com" });
    const uri = c.getUri({
      url: "/search",
      params: {
        q: "hello world",
        page: 2,
        active: true,
        skip: null,
        gone: undefined,
      },
    });
    expect(uri).toBe(
      "https://api.example.com/search?q=hello+world&page=2&active=true",
    );
  });

  it("joins params with & when the (relative) url already contains a query string", () => {
    const c = create({ baseURL: "https://api.test" });
    expect(c.getUri({ url: "/x?existing=1", params: { a: 2 } })).toBe(
      "https://api.test/x?existing=1&a=2",
    );
  });

  it("does not append a trailing ? when params serialize to empty", () => {
    const c = create({ baseURL: "https://api.example.com" });
    expect(c.getUri({ url: "/x", params: { gone: undefined } })).toBe(
      "https://api.example.com/x",
    );
  });

  it("ignores a non-object params value", () => {
    const c = create({ baseURL: "https://api.example.com" });
    expect(
      c.getUri({ url: "/x", params: "not-an-object" as unknown as object }),
    ).toBe("https://api.example.com/x");
  });
});

// --- successful requests: response types ------------------------------------

describe("successful responses", () => {
  it("GET parses a non-empty JSON body and reports status/headers/config", async () => {
    tauriFetch.mockResolvedValue(
      fakeResponse({
        body: { hello: "world" },
        headers: { "content-type": "application/json", "x-trace": "abc" },
      }),
    );

    const res: TauriHttpResponse = await client.get("/items", {
      baseURL: "https://api.test",
      params: { limit: 5 },
    });

    expect(res.data).toEqual({ hello: "world" });
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(res.headers).toEqual({
      "content-type": "application/json",
      "x-trace": "abc",
    });
    expect(res.config.method).toBe("GET");

    const [url, opts] = lastCall();
    expect(url).toBe("https://api.test/items?limit=5");
    expect(opts.method).toBe("GET");
    expect(opts.credentials).toBe("omit");
    // https => danger cert-bypass flag is enabled.
    expect(opts.danger).toEqual({
      acceptInvalidCerts: true,
      acceptInvalidHostnames: true,
    });
    // default User-Agent header is merged in.
    expect((opts.headers as Record<string, string>)["User-Agent"]).toContain(
      "StirlingPDF-Desktop",
    );
  });

  it("returns null data for an empty JSON body", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: "" }));
    const res = await client.get("https://api.test/empty");
    expect(res.data).toBeNull();
  });

  it("returns raw text for responseType=text", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: "plain body" }));
    const res = await client.get("https://api.test/text", {
      responseType: "text",
    });
    expect(res.data).toBe("plain body");
  });

  it("returns an arraybuffer for responseType=arraybuffer", async () => {
    const buf = new ArrayBuffer(16);
    tauriFetch.mockResolvedValue(fakeResponse({ arrayBuffer: buf }));
    const res = await client.get("https://api.test/bin", {
      responseType: "arraybuffer",
    });
    expect(res.data).toBe(buf);
  });

  it("wraps a typeless blob, applying the Content-Type header", async () => {
    const typeless = new Blob(["xyz"]); // jsdom Blobs have empty type
    tauriFetch.mockResolvedValue(
      fakeResponse({
        blob: typeless,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const res = await client.get<Blob>("https://api.test/file.pdf", {
      responseType: "blob",
    });
    expect(res.data).toBeInstanceOf(Blob);
    expect(res.data.type).toBe("application/pdf");
  });

  it("falls back to application/octet-stream for a typeless blob with no content-type", async () => {
    const typeless = new Blob(["xyz"]);
    tauriFetch.mockResolvedValue(fakeResponse({ blob: typeless }));
    const res = await client.get<Blob>("https://api.test/file", {
      responseType: "blob",
    });
    expect(res.data.type).toBe("application/octet-stream");
  });

  it("passes through a blob that already has a type", async () => {
    const typed = new Blob(["xyz"], { type: "image/png" });
    tauriFetch.mockResolvedValue(fakeResponse({ blob: typed }));
    const res = await client.get<Blob>("https://api.test/img", {
      responseType: "blob",
    });
    expect(res.data).toBe(typed);
  });

  it("uses response.json() for an unrecognized responseType (default branch)", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: { via: "json()" } }));
    const res = await client.request({
      url: "https://api.test/weird",
      responseType: "stream" as unknown as "json",
    });
    expect(res.data).toEqual({ via: "json()" });
  });
});

// --- request bodies & headers -----------------------------------------------

describe("request body serialization", () => {
  it("serializes a plain object body as JSON and sets Content-Type", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: { ok: true } }));
    await client.post("https://api.test/create", { name: "doc" });

    const [, opts] = lastCall();
    expect(opts.body).toBe(JSON.stringify({ name: "doc" }));
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("does not override an explicit Content-Type for an object body", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.post(
      "https://api.test/create",
      { a: 1 },
      { headers: { "Content-Type": "application/vnd.custom+json" } },
    );
    const [, opts] = lastCall();
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/vnd.custom+json",
    );
  });

  it("passes a FormData body through untouched (no JSON Content-Type)", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    const fd = new FormData();
    fd.append("file", "contents");
    await client.post("https://api.test/upload", fd);

    const [, opts] = lastCall();
    expect(opts.body).toBe(fd);
    expect(
      (opts.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("stringifies a primitive (non-object) body", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.put("https://api.test/raw", 12345);
    const [, opts] = lastCall();
    expect(opts.body).toBe("12345");
  });

  it("sends no body when data is falsy", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.delete("https://api.test/thing");
    const [, opts] = lastCall();
    expect(opts.body).toBeUndefined();
  });
});

// --- method helpers & options -----------------------------------------------

describe("HTTP method helpers", () => {
  it.each([
    ["delete", "DELETE"],
    ["head", "HEAD"],
    ["options", "OPTIONS"],
  ] as const)("%s issues a %s request", async (fnName, method) => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await (client[fnName] as (url: string) => Promise<unknown>)(
      "https://api.test/x",
    );
    expect(lastCall()[1].method).toBe(method);
  });

  it.each([
    ["patch", "PATCH"],
    ["put", "PUT"],
    ["post", "POST"],
  ] as const)("%s issues a %s request with data", async (fnName, method) => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await (client[fnName] as (url: string, data?: unknown) => Promise<unknown>)(
      "https://api.test/x",
      { v: 1 },
    );
    expect(lastCall()[1].method).toBe(method);
  });

  it("uppercases an explicit lowercase method and defaults to GET", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.request({ url: "https://api.test/a", method: "post" });
    expect(lastCall()[1].method).toBe("POST");

    await client.request({ url: "https://api.test/b" });
    expect(lastCall()[1].method).toBe("GET");
  });

  it("uses credentials=include when withCredentials is true", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.get("https://api.test/secure", { withCredentials: true });
    expect(lastCall()[1].credentials).toBe("include");
  });

  it("omits the danger cert-bypass flag for plain http URLs", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.get("http://localhost:8080/x");
    expect(lastCall()[1].danger).toBeUndefined();
  });

  it("forwards an AbortSignal when provided", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    const controller = new AbortController();
    await client.get("https://api.test/x", { signal: controller.signal });
    expect(lastCall()[1].signal).toBe(controller.signal);
  });

  it("does not include a signal key when none is provided", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.get("https://api.test/x");
    expect("signal" in lastCall()[1]).toBe(false);
  });
});

// --- form helpers -----------------------------------------------------------

describe("form helpers", () => {
  it("postForm converts an object into FormData entries", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.postForm("https://api.test/form", { a: 1, b: "two" });
    const [, opts] = lastCall();
    const body = opts.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("a")).toBe("1");
    expect(body.get("b")).toBe("two");
  });

  it("postForm passes an existing FormData through unchanged", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    const fd = new FormData();
    fd.append("x", "y");
    await client.postForm("https://api.test/form", fd);
    expect(lastCall()[1].body).toBe(fd);
  });

  it("putForm converts an object into FormData entries", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.putForm("https://api.test/form", { k: "v" });
    const body = lastCall()[1].body as FormData;
    expect(body.get("k")).toBe("v");
    expect(lastCall()[1].method).toBe("PUT");
  });

  it("patchForm converts an object into FormData entries", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.patchForm("https://api.test/form", { k: "v" });
    expect((lastCall()[1].body as FormData).get("k")).toBe("v");
    expect(lastCall()[1].method).toBe("PATCH");
  });

  it("postForm tolerates a non-object data argument", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    await client.postForm("https://api.test/form", undefined);
    expect(lastCall()[1].body).toBeInstanceOf(FormData);
  });
});

// --- HTTP status-to-error mapping -------------------------------------------

describe("HTTP error status mapping", () => {
  async function expectError(
    status: number,
    expected: { code: string; messageIncludes?: string },
    body = "server said no",
  ) {
    tauriFetch.mockResolvedValue(
      fakeResponse({ ok: false, status, statusText: "ERR", body }),
    );
    let caught: TauriHttpError | undefined;
    try {
      await client.get("https://api.test/fail");
    } catch (e) {
      caught = e as TauriHttpError;
    }
    expect(caught).toBeDefined();
    expect(caught!.isAxiosError).toBe(true);
    expect(caught!.code).toBe(expected.code);
    expect(caught!.response?.status).toBe(status);
    expect(caught!.response?.data).toBe(body);
    if (expected.messageIncludes) {
      expect(caught!.message).toContain(expected.messageIncludes);
    }
    return caught!;
  }

  it("maps 400 to ERR_BAD_REQUEST and surfaces the server body", async () => {
    await expectError(400, {
      code: "ERR_BAD_REQUEST",
      messageIncludes: "server said no",
    });
  });

  it("maps 401 to ERR_UNAUTHORIZED", async () => {
    await expectError(401, {
      code: "ERR_UNAUTHORIZED",
      messageIncludes: "Authentication failed",
    });
  });

  it("maps 403 to ERR_FORBIDDEN", async () => {
    await expectError(403, {
      code: "ERR_FORBIDDEN",
      messageIncludes: "Access denied",
    });
  });

  it("maps 404 to ERR_NOT_FOUND", async () => {
    await expectError(404, {
      code: "ERR_NOT_FOUND",
      messageIncludes: "Endpoint not found",
    });
  });

  it("maps 500 to ERR_SERVER_ERROR", async () => {
    await expectError(500, {
      code: "ERR_SERVER_ERROR",
      messageIncludes: "Internal server error",
    });
  });

  it.each([502, 503, 504])(
    "maps %i to ERR_SERVICE_UNAVAILABLE",
    async (status) => {
      await expectError(status, {
        code: "ERR_SERVICE_UNAVAILABLE",
        messageIncludes: "Server unavailable",
      });
    },
  );

  it("falls back to a status-code message when the body is empty", async () => {
    const err = await expectError(
      418,
      { code: "ERR_BAD_REQUEST" },
      "", // empty body triggers the generated fallback message
    );
    expect(err.message).toBe("Request failed with status code 418");
  });

  it("treats a body-read failure on an error response as an empty body", async () => {
    tauriFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 400, textThrows: true }),
    );
    let caught: TauriHttpError | undefined;
    try {
      await client.get("https://api.test/fail");
    } catch (e) {
      caught = e as TauriHttpError;
    }
    expect(caught!.message).toBe("Request failed with status code 400");
    expect(caught!.code).toBe("ERR_BAD_REQUEST");
  });

  it("toJSON serializes the salient error fields", async () => {
    const err = await expectError(404, { code: "ERR_NOT_FOUND" });
    const json = err.toJSON() as Record<string, unknown>;
    expect(json).toMatchObject({
      message: err.message,
      name: "Error",
      code: "ERR_NOT_FOUND",
    });
    expect((json.config as { url?: string }).url).toBe("https://api.test/fail");
  });
});

// --- network-error classification (thrown by fetch) -------------------------

describe("network error classification", () => {
  async function expectNetworkError(thrown: unknown, code: string) {
    tauriFetch.mockRejectedValue(thrown);
    let caught: TauriHttpError | undefined;
    try {
      await client.get("https://api.test/down");
    } catch (e) {
      caught = e as TauriHttpError;
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe(code);
    expect(caught!.isAxiosError).toBe(true);
    expect(caught!.response).toBeUndefined();
    return caught!;
  }

  it("classifies connection refused", async () => {
    const err = await expectNetworkError(
      new Error("ECONNREFUSED: connection refused"),
      "ERR_CONNECTION_REFUSED",
    );
    expect(err.message).toContain("Unable to connect");
  });

  it("classifies timeouts", async () => {
    await expectNetworkError(new Error("operation timed out"), "ERR_TIMEOUT");
  });

  it("classifies DNS failures", async () => {
    await expectNetworkError(
      new Error("getaddrinfo ENOTFOUND host"),
      "ERR_DNS_FAILURE",
    );
  });

  it("classifies SSL/TLS certificate errors", async () => {
    await expectNetworkError(
      new Error("invalid SSL certificate"),
      "ERR_SSL_ERROR",
    );
  });

  it("classifies protocol errors", async () => {
    await expectNetworkError(
      new Error("unexpected protocol scheme"),
      "ERR_PROTOCOL",
    );
  });

  it("classifies CORS errors", async () => {
    await expectNetworkError(new Error("blocked by CORS policy"), "ERR_CORS");
  });

  it("falls back to ERR_NETWORK for an unrecognized Error message", async () => {
    const err = await expectNetworkError(
      new Error("something odd happened"),
      "ERR_NETWORK",
    );
    expect(err.message).toContain("something odd happened");
  });

  it("handles a non-Error thrown value", async () => {
    const err = await expectNetworkError("just a string", "ERR_NETWORK");
    expect(err.message).toBe("Network Error");
  });
});

// --- interceptor chains -----------------------------------------------------

describe("interceptors", () => {
  it("registers handlers and returns their index", () => {
    const reqId = client.interceptors.request.use((c) => c);
    const resId = client.interceptors.response.use((r) => r);
    expect(reqId).toBe(0);
    expect(resId).toBe(0);
  });

  it("runs request interceptors (sync + async) in registration order", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    client.interceptors.request.use((cfg) => ({
      ...cfg,
      headers: { ...cfg.headers, "X-First": "1" },
    }));
    client.interceptors.request.use(async (cfg) => ({
      ...cfg,
      headers: { ...cfg.headers, "X-Second": "2" },
    }));

    await client.get("https://api.test/x");
    const headers = lastCall()[1].headers as Record<string, string>;
    expect(headers["X-First"]).toBe("1");
    expect(headers["X-Second"]).toBe("2");
  });

  it("runs response interceptors and lets them transform the response", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ body: { n: 1 } }));
    client.interceptors.response.use((res) => ({
      ...res,
      data: { transformed: true },
    }));
    const res = await client.get("https://api.test/x");
    expect(res.data).toEqual({ transformed: true });
  });

  it("runs the error interceptor on an HTTP error and throws its (transformed) result", async () => {
    tauriFetch.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));
    // The error interceptor returns a transformed value; the client always
    // re-throws `finalError`, so that transformed value is what gets thrown.
    // It carries `isAxiosError` so the outer catch re-throws it as-is rather
    // than re-classifying (which would invoke the handler a second time).
    const transformed = { transformedError: true, isAxiosError: true };
    const rejected = vi.fn(async () => transformed);
    client.interceptors.response.use((r) => r, rejected);

    await expect(client.get("https://api.test/x")).rejects.toBe(transformed);
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("runs error interceptors on a network error and propagates a re-throw", async () => {
    tauriFetch.mockRejectedValue(new Error("offline"));
    const rejected = vi.fn(async (e) => {
      throw e;
    });
    client.interceptors.response.use((r) => r, rejected);

    await expect(client.get("https://api.test/x")).rejects.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("re-throws an already-axios error without re-wrapping it", async () => {
    // A response interceptor that throws a TauriHttpError-shaped object should
    // bypass the network-error classification (it has isAxiosError).
    tauriFetch.mockResolvedValue(fakeResponse({ body: {} }));
    const marker = Object.assign(new Error("already axios"), {
      isAxiosError: true,
      code: "ERR_CUSTOM",
    });
    client.interceptors.response.use(() => {
      throw marker;
    });

    let caught: TauriHttpError | undefined;
    try {
      await client.get("https://api.test/x");
    } catch (e) {
      caught = e as TauriHttpError;
    }
    expect(caught).toBe(marker);
    expect(caught!.code).toBe("ERR_CUSTOM");
  });
});

// --- factory & defaults -----------------------------------------------------

describe("factory and instance creation", () => {
  it("exposes sensible axios-compatible defaults on the singleton", () => {
    expect(client.defaults.timeout).toBe(120000);
    expect(client.defaults.responseType).toBe("json");
    expect(client.defaults.withCredentials).toBe(false);
  });

  it("create() returns a new independent instance carrying merged defaults", () => {
    const c = create({ baseURL: "https://made.example.com", timeout: 5000 });
    expect(c).not.toBe(client);
    expect(c.defaults.baseURL).toBe("https://made.example.com");
    expect(c.defaults.timeout).toBe(5000);
    // unspecified defaults are inherited from the class defaults.
    expect(c.defaults.responseType).toBe("json");
  });

  it("instance .create() merges its own defaults into the child", () => {
    const parent = create({ baseURL: "https://p.example.com" });
    const child = parent.create({ timeout: 1 });
    expect(child.defaults.baseURL).toBe("https://p.example.com");
    expect(child.defaults.timeout).toBe(1);
  });

  it("a created instance has independent interceptor handler arrays", () => {
    const c = create();
    c.interceptors.request.use((cfg) => cfg);
    expect(c.interceptors.request.handlers).toHaveLength(1);
    // The singleton's arrays were reset in beforeEach and remain untouched.
    expect(client.interceptors.request.handlers).toHaveLength(0);
  });
});
