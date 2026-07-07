/**
 * Unit tests for httpErrorUtils
 *
 * axios.isAxiosError is mocked so that any object carrying an `__isAxios: true`
 * marker is treated as an AxiosError. This keeps status/payload -> title/body
 * mapping fully deterministic without depending on real axios internals.
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    isAxiosError: (error: unknown): boolean =>
      typeof error === "object" &&
      error !== null &&
      (error as { __isAxios?: boolean }).__isAxios === true,
  },
}));

import {
  clampText,
  extractAxiosErrorMessage,
} from "@app/services/httpErrorUtils";

const FRIENDLY_FALLBACK = "There was an error processing your request.";
const INVALID_FILE_MSG = "Process failed due to invalid/corrupted file(s)";

/** Build an object the mocked axios.isAxiosError will recognize as an AxiosError. */
function makeAxiosError(
  response?: { status?: number; statusText?: string; data?: unknown },
  message?: string,
): Record<string, unknown> {
  return {
    __isAxios: true,
    message,
    response,
  };
}

describe("httpErrorUtils", () => {
  describe("clampText", () => {
    test("returns the string unchanged when under the limit", () => {
      expect(clampText("hello")).toBe("hello");
    });

    test("returns short string unchanged with an explicit limit", () => {
      expect(clampText("hello", 10)).toBe("hello");
    });

    test("truncates and appends an ellipsis when over the limit", () => {
      const result = clampText("abcdef", 3);
      expect(result).toBe("abc…");
      // 3 chars + the ellipsis character only
      expect(result.length).toBe(4);
    });

    test("does not truncate when length exactly equals the limit", () => {
      expect(clampText("abc", 3)).toBe("abc");
    });

    test("uses the default 400-char limit when none is provided", () => {
      const long = "x".repeat(401);
      const result = clampText(long);
      expect(result).toBe(`${"x".repeat(400)}…`);
      expect(result.length).toBe(401);
    });

    test("passes through an empty string untouched", () => {
      expect(clampText("")).toBe("");
    });
  });

  describe("extractAxiosErrorMessage - non-axios errors", () => {
    test("uses Error.message and a Network error title", () => {
      const result = extractAxiosErrorMessage(new Error("Something specific"));
      expect(result).toEqual({
        title: "Network error",
        body: "Something specific",
      });
    });

    test("falls back to friendly text for an unhelpful 'Network Error' message", () => {
      const result = extractAxiosErrorMessage(new Error("Network Error"));
      expect(result).toEqual({
        title: "Network error",
        body: FRIENDLY_FALLBACK,
      });
    });

    test("falls back to String(error) when an Error has an empty message", () => {
      // Error("").message === "" is falsy, so String(error) -> "Error",
      // which is not flagged as unhelpful and is used verbatim.
      const result = extractAxiosErrorMessage(new Error(""));
      expect(result.title).toBe("Network error");
      expect(result.body).toBe("Error");
    });

    test("stringifies a non-Error value lacking a message", () => {
      const result = extractAxiosErrorMessage("boom");
      expect(result).toEqual({ title: "Network error", body: "boom" });
    });

    test("stringifies null via String(error)", () => {
      // null has no .message, so String(null) -> "null" (not unhelpful).
      const result = extractAxiosErrorMessage(null);
      expect(result).toEqual({
        title: "Network error",
        body: "null",
      });
    });

    test("falls back to friendly text for a whitespace-only message", () => {
      // A non-axios object whose message is only whitespace is unhelpful.
      const result = extractAxiosErrorMessage({ message: "   " });
      expect(result).toEqual({
        title: "Network error",
        body: FRIENDLY_FALLBACK,
      });
    });
  });

  describe("extractAxiosErrorMessage - status -> title mapping", () => {
    test("missing status yields a Network error title", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ data: { message: "no status here" } }),
      );
      expect(result.title).toBe("Network error");
      expect(result.body).toBe("no status here");
    });

    test("status >= 500 yields a Server error title", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 503,
          data: { message: "down for maintenance" },
        }),
      );
      expect(result.title).toBe("Server error");
      expect(result.body).toBe("down for maintenance");
    });

    test("status in the 4xx range yields a Request error title", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 404, data: { message: "not found here" } }),
      );
      expect(result.title).toBe("Request error");
      expect(result.body).toBe("not found here");
    });

    test("status below 400 yields a Request failed title", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 302,
          data: { message: "redirected somewhere" },
        }),
      );
      expect(result.title).toBe("Request failed");
      expect(result.body).toBe("redirected somewhere");
    });
  });

  describe("extractAxiosErrorMessage - body extraction", () => {
    test("prefers data.message from an object payload", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 400,
          data: { message: "field x is required" },
        }),
      );
      expect(result.body).toBe("field x is required");
    });

    test("parses a JSON string payload and uses its message", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 400,
          data: JSON.stringify({ message: "parsed from json string" }),
        }),
      );
      expect(result.body).toBe("parsed from json string");
    });

    test("keeps a non-JSON string payload as the raw body", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 400, data: "plain helpful text payload" }),
      );
      expect(result.body).toBe("plain helpful text payload");
    });

    test("stringifies an object payload that has no message field", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 400,
          data: { detail: "deep error", code: 7 },
        }),
      );
      expect(result.body).toBe(
        JSON.stringify({ detail: "deep error", code: 7 }),
      );
    });

    test("falls back to friendly text when payload data is null", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 500, data: null }),
      );
      expect(result.title).toBe("Server error");
      expect(result.body).toBe(FRIENDLY_FALLBACK);
    });

    test("falls back to friendly text when the only message is unhelpful '{}'", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 500, data: "{}" }),
      );
      // "{}" parses to an empty object -> stringifies back to "{}" -> unhelpful
      expect(result.body).toBe(FRIENDLY_FALLBACK);
    });
  });

  describe("extractAxiosErrorMessage - errorFileIds extraction", () => {
    test("uses errorFileIds array from an object payload", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 500,
          data: { errorFileIds: ["file-1", "file-2"] },
        }),
      );
      expect(result.title).toBe("Server error");
      expect(result.body).toBe(INVALID_FILE_MSG);
    });

    test("uses errorFileIds parsed from a JSON string payload", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 422,
          data: JSON.stringify({ errorFileIds: ["only-one"] }),
        }),
      );
      expect(result.body).toBe(INVALID_FILE_MSG);
    });

    test("extracts UUIDs from a non-JSON string payload and dedupes them", () => {
      const uuid = "123e4567-e89b-12d3-a456-426614174000";
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 500,
          data: `Failed processing ${uuid} and again ${uuid}`,
        }),
      );
      // Presence of file ids overrides the body with the invalid-file message
      expect(result.body).toBe(INVALID_FILE_MSG);
    });

    test("ignores an empty errorFileIds array and falls through to message", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({
          status: 500,
          data: { errorFileIds: [], message: "real underlying message" },
        }),
      );
      expect(result.body).toBe("real underlying message");
    });
  });

  describe("extractAxiosErrorMessage - 422 special handling", () => {
    test("uses the message body when it is helpful", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 422, data: { message: "page out of range" } }),
      );
      expect(result.title).toBe("Request error");
      expect(result.body).toBe("page out of range");
    });

    test("falls back to the invalid-file message when the body is unhelpful", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 422, data: { message: "{}" } }),
      );
      // data.message is the literal "{}" which is flagged as unhelpful
      expect(result.body).toBe(INVALID_FILE_MSG);
    });

    test("falls back to the invalid-file message for a 'request failed' body", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 422, data: { message: "Request failed" } }),
      );
      expect(result.body).toBe(INVALID_FILE_MSG);
    });
  });

  describe("extractAxiosErrorMessage - unhelpful body fallbacks (non-422)", () => {
    test("replaces a status-code-prefixed body with the friendly fallback", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 500, data: { message: "500 Server Error" } }),
      );
      expect(result.title).toBe("Server error");
      expect(result.body).toBe(FRIENDLY_FALLBACK);
    });

    test("replaces a 'request failed' body with the friendly fallback", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 400, data: { message: "Request failed" } }),
      );
      expect(result.body).toBe(FRIENDLY_FALLBACK);
    });

    test("replaces an empty-array '[]' body with the friendly fallback", () => {
      const result = extractAxiosErrorMessage(
        makeAxiosError({ status: 400, data: "[]" }),
      );
      // "[]" parses to an array, no message, stringifies back to "[]" -> unhelpful
      expect(result.body).toBe(FRIENDLY_FALLBACK);
    });
  });
});
