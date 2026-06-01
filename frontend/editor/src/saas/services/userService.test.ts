import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { synchronizeUserUpgrade } from "@app/services/userService";

// ---------------------------------------------------------------------------
// userService.synchronizeUserUpgrade talks to the backend exclusively through
// the global fetch. We stub fetch per-test with a vi.fn so we control both the
// request assertion (URL, method, headers, body) and the response branch
// (ok / not-ok, JSON success / JSON error / JSON parse failure).
//
// `makeResponse` builds a minimal Response-like object exposing only the bits
// the service reads: `ok` and `json()`. This keeps the tests deterministic and
// free of any real network or whatwg-fetch behaviour.
// ---------------------------------------------------------------------------

interface FakeResponseOptions {
  ok: boolean;
  json: () => Promise<unknown>;
}

function makeResponse({ ok, json }: FakeResponseOptions) {
  return { ok, json } as unknown as Response;
}

/** Install a global fetch stub resolving to the supplied fake response. */
function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ENDPOINT = "/api/v1/user-role/promptToAuthUser";

describe("userService.synchronizeUserUpgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts an empty urlencoded body and returns parsed JSON when no authMethod is given", async () => {
    const success = {
      message: "upgraded",
      userId: "user-1",
      email: "u@x.com",
    };
    const fetchMock = stubFetch(
      makeResponse({ ok: true, json: async () => success }),
    );

    const result = await synchronizeUserUpgrade();

    expect(result).toEqual(success);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    // No authMethod -> the URLSearchParams body stays empty.
    expect(init.body).toBe("");
  });

  it("appends the authMethod to the urlencoded body when provided", async () => {
    const success = {
      message: "ok",
      userId: "user-2",
      email: "g@x.com",
    };
    const fetchMock = stubFetch(
      makeResponse({ ok: true, json: async () => success }),
    );

    const result = await synchronizeUserUpgrade("google");

    expect(result).toEqual(success);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.body).toBe("authMethod=google");
  });

  it("url-encodes authMethod values that contain special characters", async () => {
    const fetchMock = stubFetch(
      makeResponse({
        ok: true,
        json: async () => ({ message: "m", userId: "i", email: "e" }),
      }),
    );

    await synchronizeUserUpgrade("azure ad");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    // URLSearchParams uses '+' for spaces in application/x-www-form-urlencoded.
    expect(init.body).toBe("authMethod=azure+ad");
  });

  it("throws the server-provided error message when the response is not ok", async () => {
    stubFetch(
      makeResponse({
        ok: false,
        json: async () => ({ error: "User already upgraded" }),
      }),
    );

    await expect(synchronizeUserUpgrade("email")).rejects.toThrow(
      "User already upgraded",
    );
  });

  it("falls back to the default message when the error JSON has no error field", async () => {
    stubFetch(
      makeResponse({
        ok: false,
        json: async () => ({ somethingElse: true }),
      }),
    );

    await expect(synchronizeUserUpgrade()).rejects.toThrow(
      "Failed to synchronize user upgrade",
    );
  });

  it("falls back to the default message when parsing the error JSON throws", async () => {
    // The service guards response.json() with .catch(() => ({ error: ... })),
    // so a rejected json() must still produce the default error message.
    stubFetch(
      makeResponse({
        ok: false,
        json: async () => {
          throw new Error("invalid json");
        },
      }),
    );

    await expect(synchronizeUserUpgrade()).rejects.toThrow(
      "Failed to synchronize user upgrade",
    );
  });

  it("propagates a network-level fetch rejection", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(synchronizeUserUpgrade("github")).rejects.toThrow(
      "network down",
    );
  });
});
