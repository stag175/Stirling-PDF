import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  FILE_EVENTS,
  tryParseJson,
  normalizeAxiosErrorData,
  extractErrorFileIds,
  broadcastErroredFiles,
  isZeroByte,
  isEmptyOutput,
} from "@app/services/errorUtils";

const UUID_A = "123e4567-e89b-12d3-a456-426614174000";
const UUID_B = "00000000-0000-0000-0000-000000000000";

describe("errorUtils", () => {
  describe("FILE_EVENTS", () => {
    test("exposes the markError event name", () => {
      expect(FILE_EVENTS.markError).toBe("files:markError");
    });
  });

  describe("tryParseJson", () => {
    test("parses a valid JSON object string", () => {
      expect(tryParseJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
    });

    test("parses JSON primitives encoded as strings", () => {
      expect(tryParseJson("42")).toBe(42);
      expect(tryParseJson("true")).toBe(true);
      expect(tryParseJson("null")).toBe(null);
    });

    test("parses a JSON array string", () => {
      expect(tryParseJson("[1,2,3]")).toEqual([1, 2, 3]);
    });

    test("returns undefined for an invalid JSON string", () => {
      expect(tryParseJson("{not json}")).toBeUndefined();
      expect(tryParseJson("undefined")).toBeUndefined();
    });

    test("returns the input unchanged when it is not a string", () => {
      const obj = { already: "parsed" };
      expect(tryParseJson(obj)).toBe(obj);
      expect(tryParseJson(123)).toBe(123);
      expect(tryParseJson(null)).toBe(null);
      expect(tryParseJson(undefined)).toBeUndefined();
    });
  });

  describe("normalizeAxiosErrorData", () => {
    test("returns undefined for falsy data", async () => {
      await expect(normalizeAxiosErrorData(undefined)).resolves.toBeUndefined();
      await expect(normalizeAxiosErrorData(null)).resolves.toBeUndefined();
      await expect(normalizeAxiosErrorData(0)).resolves.toBeUndefined();
      await expect(normalizeAxiosErrorData("")).resolves.toBeUndefined();
    });

    test("returns non-blob data as-is", async () => {
      const data = { errorFileIds: ["x"] };
      await expect(normalizeAxiosErrorData(data)).resolves.toBe(data);
    });

    test("reads and JSON-parses blob-like data with a text() method", async () => {
      const blobLike = { text: () => Promise.resolve('{"message":"boom"}') };
      await expect(normalizeAxiosErrorData(blobLike)).resolves.toEqual({
        message: "boom",
      });
    });

    test("falls back to raw text when blob text is not valid JSON", async () => {
      const blobLike = { text: () => Promise.resolve("plain failure text") };
      await expect(normalizeAxiosErrorData(blobLike)).resolves.toBe(
        "plain failure text",
      );
    });

    test("preserves an empty-string text payload via fallback", async () => {
      // tryParseJson("") -> undefined, so the `?? text` branch returns "".
      const blobLike = { text: () => Promise.resolve("") };
      await expect(normalizeAxiosErrorData(blobLike)).resolves.toBe("");
    });
  });

  describe("extractErrorFileIds", () => {
    test("returns undefined for falsy payloads", () => {
      expect(extractErrorFileIds(undefined)).toBeUndefined();
      expect(extractErrorFileIds(null)).toBeUndefined();
      expect(extractErrorFileIds("")).toBeUndefined();
    });

    test("returns the errorFileIds array when present on an object", () => {
      const ids = ["a", "b"];
      expect(extractErrorFileIds({ errorFileIds: ids })).toBe(ids);
    });

    test("prefers errorFileIds array even when empty", () => {
      const ids: string[] = [];
      expect(extractErrorFileIds({ errorFileIds: ids })).toBe(ids);
    });

    test("extracts UUIDs from a string payload", () => {
      const payload = `Failed to process ${UUID_A} and ${UUID_B}`;
      expect(extractErrorFileIds(payload)).toEqual([UUID_A, UUID_B]);
    });

    test("deduplicates repeated UUIDs in a string payload", () => {
      const payload = `${UUID_A} again ${UUID_A}`;
      expect(extractErrorFileIds(payload)).toEqual([UUID_A]);
    });

    test("returns undefined for a string without any UUID", () => {
      expect(extractErrorFileIds("no identifiers here")).toBeUndefined();
    });

    test("returns undefined for an object with no errorFileIds", () => {
      expect(extractErrorFileIds({ message: "oops" })).toBeUndefined();
    });
  });

  describe("broadcastErroredFiles", () => {
    let listener: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      listener = vi.fn();
      window.addEventListener(FILE_EVENTS.markError, listener);
    });

    afterEach(() => {
      window.removeEventListener(FILE_EVENTS.markError, listener);
    });

    test("dispatches a CustomEvent carrying the file ids", () => {
      const ids = [UUID_A, UUID_B];
      broadcastErroredFiles(ids);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe(FILE_EVENTS.markError);
      expect(event.detail).toEqual({ fileIds: ids });
    });

    test("does not dispatch for an empty array", () => {
      broadcastErroredFiles([]);
      expect(listener).not.toHaveBeenCalled();
    });

    test("does not dispatch for a nullish argument", () => {
      broadcastErroredFiles(undefined as unknown as string[]);
      broadcastErroredFiles(null as unknown as string[]);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("isZeroByte", () => {
    test("treats null/undefined files as zero-byte", () => {
      expect(isZeroByte(null)).toBe(true);
      expect(isZeroByte(undefined)).toBe(true);
    });

    test("returns true when size is zero or negative", () => {
      expect(isZeroByte({ size: 0 })).toBe(true);
      expect(isZeroByte({ size: -1 })).toBe(true);
    });

    test("returns false for a positive size", () => {
      expect(isZeroByte({ size: 10 })).toBe(false);
    });

    test("returns true when size is not a number", () => {
      expect(isZeroByte({} as { size?: number })).toBe(true);
    });

    test("works with a real File instance", () => {
      const empty = new File([], "empty.pdf");
      const nonEmpty = new File(["abc"], "data.pdf");
      expect(isZeroByte(empty)).toBe(true);
      expect(isZeroByte(nonEmpty)).toBe(false);
    });
  });

  describe("isEmptyOutput", () => {
    test("returns true for null/undefined/empty arrays", () => {
      expect(isEmptyOutput(null)).toBe(true);
      expect(isEmptyOutput(undefined)).toBe(true);
      expect(isEmptyOutput([])).toBe(true);
    });

    test("returns true when every file is zero-byte", () => {
      const files = [new File([], "a.pdf"), new File([], "b.pdf")];
      expect(isEmptyOutput(files)).toBe(true);
    });

    test("returns false when at least one file has content", () => {
      const files = [new File([], "a.pdf"), new File(["x"], "b.pdf")];
      expect(isEmptyOutput(files)).toBe(false);
    });

    test("returns false for a single non-empty file", () => {
      expect(isEmptyOutput([new File(["data"], "only.pdf")])).toBe(false);
    });
  });
});
