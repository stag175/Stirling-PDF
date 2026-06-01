/**
 * Unit tests for toolErrorHandler.
 *
 * These cover the four axios-shaped error parsers:
 *   - extractErrorMessage
 *   - createStandardErrorHandler
 *   - handle422Error (JSON / Blob / UUID-regex payload paths)
 *   - handlePasswordError (status + ProblemDetail / Blob branches)
 *
 * `normalizeAxiosErrorData` (from @app/services/errorUtils) is mocked so the
 * `handlePasswordError` fall-through branch is deterministic and does not pull
 * in the real Blob-reading implementation.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the only external dependency. The real implementation reads Blobs and
// parses JSON; for the parser-under-test we only care that its return value is
// threaded into extractErrorMessage, so we return the data unchanged.
const normalizeAxiosErrorData = vi.fn(async (data: unknown) => data);
vi.mock("@app/services/errorUtils", () => ({
  normalizeAxiosErrorData: (data: unknown) => normalizeAxiosErrorData(data),
}));

import {
  extractErrorMessage,
  createStandardErrorHandler,
  handle422Error,
  handlePasswordError,
} from "@app/utils/toolErrorHandler";

const UUID_A = "12345678-1234-1234-1234-123456789abc";
const UUID_B = "abcdef00-0000-4000-8000-abcdef000000";

/**
 * jsdom's Blob does not implement `.text()`, so we build a Blob-like stand-in
 * with a real async `text()`. handle422Error duck-types on `typeof .text`,
 * while handlePasswordError requires `instanceof Blob`; using
 * Object.create(Blob.prototype) satisfies both.
 */
function makeTextBlob(content: string): Blob {
  const blob = Object.create(Blob.prototype) as Blob;
  (blob as { text: () => Promise<string> }).text = () =>
    Promise.resolve(content);
  return blob;
}

beforeEach(() => {
  normalizeAxiosErrorData.mockClear();
  normalizeAxiosErrorData.mockImplementation(async (data: unknown) => data);
});

describe("extractErrorMessage", () => {
  test("returns response.data when it is a string", () => {
    const error = { response: { data: "Backend exploded" }, message: "ignore" };
    expect(extractErrorMessage(error)).toBe("Backend exploded");
  });

  test("falls back to error.message when response.data is not a string", () => {
    const error = { response: { data: { foo: "bar" } }, message: "boom" };
    expect(extractErrorMessage(error)).toBe("boom");
  });

  test("falls back to error.message when there is no response", () => {
    expect(extractErrorMessage({ message: "network down" })).toBe(
      "network down",
    );
  });

  test("returns the default message when nothing usable is present", () => {
    expect(extractErrorMessage({})).toBe(
      "There was an error processing your request.",
    );
  });

  test("ignores an empty-string message and uses the default", () => {
    expect(extractErrorMessage({ message: "" })).toBe(
      "There was an error processing your request.",
    );
  });
});

describe("createStandardErrorHandler", () => {
  test("returns a function that prefers string response.data", () => {
    const handler = createStandardErrorHandler("fallback here");
    expect(handler({ response: { data: "specific server error" } })).toBe(
      "specific server error",
    );
  });

  test("returns error.message when response.data is absent", () => {
    const handler = createStandardErrorHandler("fallback here");
    expect(handler({ message: "timed out" })).toBe("timed out");
  });

  test("uses the provided fallback message when nothing else matches", () => {
    const handler = createStandardErrorHandler("my custom fallback");
    expect(handler({})).toBe("my custom fallback");
  });

  test("does not leak the default message; uses the configured fallback", () => {
    const handler = createStandardErrorHandler("UNIQUE_FALLBACK");
    const result = handler({ response: { data: { notAString: true } } });
    expect(result).toBe("UNIQUE_FALLBACK");
    expect(result).not.toContain("processing your request");
  });
});

describe("handle422Error", () => {
  test("returns false (and does not mark) for non-422 statuses", async () => {
    const markFileError = vi.fn();
    const result = await handle422Error(
      { response: { status: 500, data: { errorFileIds: [UUID_A] } } },
      markFileError,
    );
    expect(result).toBe(false);
    expect(markFileError).not.toHaveBeenCalled();
  });

  test("returns false when status is missing entirely", async () => {
    const markFileError = vi.fn();
    expect(await handle422Error({}, markFileError)).toBe(false);
    expect(markFileError).not.toHaveBeenCalled();
  });

  test("returns false when status is the string '422' (type guard)", async () => {
    const markFileError = vi.fn();
    const result = await handle422Error(
      { response: { status: "422", data: { errorFileIds: [UUID_A] } } },
      markFileError,
    );
    expect(result).toBe(false);
    expect(markFileError).not.toHaveBeenCalled();
  });

  test("marks files from a structured object payload with errorFileIds", async () => {
    const markFileError = vi.fn();
    const result = await handle422Error(
      { response: { status: 422, data: { errorFileIds: [UUID_A, UUID_B] } } },
      markFileError,
    );
    expect(result).toBe(true);
    expect(markFileError).toHaveBeenCalledTimes(2);
    expect(markFileError).toHaveBeenCalledWith(UUID_A);
    expect(markFileError).toHaveBeenCalledWith(UUID_B);
  });

  test("parses a JSON string payload and marks the listed ids", async () => {
    const markFileError = vi.fn();
    const payload = JSON.stringify({ errorFileIds: [UUID_A] });
    const result = await handle422Error(
      { response: { status: 422, data: payload } },
      markFileError,
    );
    expect(result).toBe(true);
    expect(markFileError).toHaveBeenCalledExactlyOnceWith(UUID_A);
  });

  test("extracts UUIDs via regex from a non-JSON string and dedupes them", async () => {
    const markFileError = vi.fn();
    const payload = `Files ${UUID_A} and ${UUID_A} and ${UUID_B} failed`;
    const result = await handle422Error(
      { response: { status: 422, data: payload } },
      markFileError,
    );
    expect(result).toBe(true);
    // UUID_A appears twice but should be deduped via the Set.
    expect(markFileError).toHaveBeenCalledTimes(2);
    expect(markFileError.mock.calls.map((c) => c[0])).toEqual([UUID_A, UUID_B]);
  });

  test("returns false for a 422 plain string containing no UUIDs", async () => {
    const markFileError = vi.fn();
    const result = await handle422Error(
      { response: { status: 422, data: "no identifiers here" } },
      markFileError,
    );
    expect(result).toBe(false);
    expect(markFileError).not.toHaveBeenCalled();
  });

  test("reads and parses a Blob payload with errorFileIds", async () => {
    const markFileError = vi.fn();
    const blob = makeTextBlob(JSON.stringify({ errorFileIds: [UUID_B] }));
    const result = await handle422Error(
      { response: { status: 422, data: blob } },
      markFileError,
    );
    expect(result).toBe(true);
    expect(markFileError).toHaveBeenCalledExactlyOnceWith(UUID_B);
  });

  test("falls back to UUID regex when a Blob holds non-JSON text", async () => {
    const markFileError = vi.fn();
    const blob = makeTextBlob(`broken ${UUID_A}`);
    const result = await handle422Error(
      { response: { status: 422, data: blob } },
      markFileError,
    );
    expect(result).toBe(true);
    expect(markFileError).toHaveBeenCalledExactlyOnceWith(UUID_A);
  });

  test("returns false when errorFileIds is an empty array", async () => {
    const markFileError = vi.fn();
    const result = await handle422Error(
      { response: { status: 422, data: { errorFileIds: [] } } },
      markFileError,
    );
    expect(result).toBe(false);
    expect(markFileError).not.toHaveBeenCalled();
  });

  test("swallows markFileError exceptions and still returns true", async () => {
    const markFileError = vi.fn(() => {
      throw new Error("UI blew up");
    });
    const result = await handle422Error(
      { response: { status: 422, data: { errorFileIds: [UUID_A, UUID_B] } } },
      markFileError,
    );
    expect(result).toBe(true);
    // Both ids attempted even though each throws.
    expect(markFileError).toHaveBeenCalledTimes(2);
  });
});

describe("handlePasswordError", () => {
  test("returns the incorrect-password message for status 500", async () => {
    const result = await handlePasswordError(
      { response: { status: 500 } },
      "wrong password",
      "generic fallback",
    );
    expect(result).toBe("wrong password");
    expect(normalizeAxiosErrorData).not.toHaveBeenCalled();
  });

  test("returns incorrect-password for 400 ProblemDetail with pdf-password type", async () => {
    const result = await handlePasswordError(
      { response: { status: 400, data: { type: "/errors/pdf-password" } } },
      "wrong password",
      "generic fallback",
    );
    expect(result).toBe("wrong password");
  });

  test("returns incorrect-password for a 400 Blob containing 'pdf-password'", async () => {
    const blob = makeTextBlob(JSON.stringify({ type: "/errors/pdf-password" }));
    const result = await handlePasswordError(
      { response: { status: 400, data: blob } },
      "wrong password",
      "generic fallback",
    );
    expect(result).toBe("wrong password");
  });

  test("returns incorrect-password for a 400 Blob containing 'passworded'", async () => {
    const blob = makeTextBlob("the document is passworded");
    const result = await handlePasswordError(
      { response: { status: 400, data: blob } },
      "wrong password",
      "generic fallback",
    );
    expect(result).toBe("wrong password");
  });

  test("falls through to extracted message for a 400 that is not a password error", async () => {
    const result = await handlePasswordError(
      {
        response: { status: 400, data: { type: "/errors/other" } },
        message: "some axios message",
      },
      "wrong password",
      "generic fallback",
    );
    expect(normalizeAxiosErrorData).toHaveBeenCalledTimes(1);
    // normalize returns the object unchanged (not a string), so
    // extractErrorMessage falls back to error.message.
    expect(result).toBe("some axios message");
  });

  test("normalizes a Blob payload then returns the string message it yields", async () => {
    // Simulate normalizeAxiosErrorData converting a Blob into a plain string,
    // which extractErrorMessage should then return directly.
    normalizeAxiosErrorData.mockResolvedValueOnce("normalized server text");
    const blob = new Blob(["unrelated 404 body"], { type: "text/plain" });
    const result = await handlePasswordError(
      { response: { status: 404, data: blob } },
      "wrong password",
      "generic fallback",
    );
    expect(normalizeAxiosErrorData).toHaveBeenCalledTimes(1);
    expect(normalizeAxiosErrorData).toHaveBeenCalledWith(blob);
    expect(result).toBe("normalized server text");
  });

  test("returns the standard default when normalized data and message are both empty", async () => {
    // With no string data and no error.message, extractErrorMessage returns
    // its own (truthy) default, so the `|| fallbackMessage` in the source is
    // never reached. This pins down that quirk: the passed-in fallback is
    // effectively unreachable here.
    normalizeAxiosErrorData.mockResolvedValueOnce(undefined);
    const result = await handlePasswordError(
      { response: { status: 404 } },
      "wrong password",
      "the final fallback",
    );
    expect(result).toBe("There was an error processing your request.");
  });

  test("returns the standard default for a 400 Blob whose text() rejects", async () => {
    // A Blob-like object whose text() rejects exercises the inner try/catch
    // (isPasswordError resolves to false), pushing past the 400 branch into
    // the normalize/extract fall-through.
    const failingBlob = Object.create(Blob.prototype) as Blob;
    (failingBlob as { text: () => Promise<string> }).text = () =>
      Promise.reject(new Error("read failed"));
    normalizeAxiosErrorData.mockResolvedValueOnce(undefined);
    const result = await handlePasswordError(
      { response: { status: 400, data: failingBlob } },
      "wrong password",
      "generic fallback",
    );
    expect(result).toBe("There was an error processing your request.");
  });
});
