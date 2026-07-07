/**
 * Unit tests for specialErrorToasts.showSpecialErrorToast.
 *
 * The only external collaborators are mocked for determinism:
 *  - toast.alert            -> a vi.fn() spy so we can assert the toast payload
 *  - globalThis.i18next     -> installed/removed per test to exercise the
 *                              translation, missing-i18n, non-function, and
 *                              throwing branches of the best-effort i18n block.
 *
 * Everything else (regex matching, status->title branching) is pure and runs
 * synchronously, so no timers or network stubs are required.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

import { alert } from "@app/components/toast";
import { showSpecialErrorToast } from "@app/services/specialErrorToasts";

vi.mock("@app/components/toast", () => ({
  alert: vi.fn(),
}));

const alertMock = vi.mocked(alert);

// The two known backend error strings, kept verbatim so the regexes match.
const ENCRYPTED_RAW =
  "Caused by: org.apache.pdfbox: PDF contains an encryption dictionary";
const PASSWORDED_RAW =
  "The PDF document is passworded and either the password was not provided or was incorrect.";

/** Read whatever was previously on globalThis.i18next so we can restore it. */
const originalI18next = (globalThis as Record<string, unknown>).i18next;

function setI18next(value: unknown): void {
  (globalThis as Record<string, unknown>).i18next = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Start each test with a clean global so the "no i18n configured" branch is
  // the default unless a test opts into installing a fake i18next.
  delete (globalThis as Record<string, unknown>).i18next;
});

afterEach(() => {
  // Restore whatever the test harness had on the global before we touched it.
  if (typeof originalI18next === "undefined") {
    delete (globalThis as Record<string, unknown>).i18next;
  } else {
    setI18next(originalI18next);
  }
});

describe("showSpecialErrorToast - non-matching / empty input", () => {
  test("returns false and shows no toast for undefined input", () => {
    expect(showSpecialErrorToast(undefined)).toBe(false);
    expect(alertMock).not.toHaveBeenCalled();
  });

  test("returns false for an empty string", () => {
    expect(showSpecialErrorToast("")).toBe(false);
    expect(alertMock).not.toHaveBeenCalled();
  });

  test("returns false when no mapping pattern matches", () => {
    expect(showSpecialErrorToast("Some entirely unrelated error")).toBe(false);
    expect(alertMock).not.toHaveBeenCalled();
  });
});

describe("showSpecialErrorToast - mapping pattern matching", () => {
  test("matches the encryption-dictionary pattern and shows its default body", () => {
    const result = showSpecialErrorToast(ENCRYPTED_RAW);

    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith({
      alertType: "error",
      // No status -> "Network error" title.
      title: "Network error",
      body: "This PDF is encrypted. Please unlock it using the Unlock PDF Forms tool.",
      expandable: true,
      isPersistentPopup: false,
    });
  });

  test("matches the passworded-document pattern and shows its default body", () => {
    const result = showSpecialErrorToast(PASSWORDED_RAW);

    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "error",
        body: "The PDF password is incorrect or not provided.",
      }),
    );
  });

  test("matching is case-insensitive (lower-cased raw still matches)", () => {
    const result = showSpecialErrorToast(ENCRYPTED_RAW.toLowerCase());
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  test("coerces a non-string rawError via toString before matching", () => {
    // Object whose string form contains the encryption pattern.
    const objLike = {
      toString: () => "pdf contains an encryption dictionary",
    } as unknown as string;
    const result = showSpecialErrorToast(objLike);
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});

describe("showSpecialErrorToast - titleForStatus branching", () => {
  test.each([
    [undefined, "Network error"],
    [0, "Network error"], // falsy status -> network error
    [500, "Server error"],
    [503, "Server error"],
    [400, "Request error"],
    [422, "Request error"],
    [499, "Request error"],
    [302, "Request failed"], // < 400 but truthy -> generic failure
    [200, "Request failed"],
  ])("status %s yields title %s", (status, expectedTitle) => {
    const result = showSpecialErrorToast(
      ENCRYPTED_RAW,
      status === undefined ? undefined : { status: status as number },
    );
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expectedTitle }),
    );
  });

  test("an options object without a status falls back to the network title", () => {
    const result = showSpecialErrorToast(PASSWORDED_RAW, {});
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Network error" }),
    );
  });
});

describe("showSpecialErrorToast - i18n best-effort translation", () => {
  test("uses i18next.t when a valid translator is present on globalThis", () => {
    const t = vi.fn(() => "Translated encrypted message");
    setI18next({ t });

    const result = showSpecialErrorToast(ENCRYPTED_RAW, { status: 500 });

    expect(result).toBe(true);
    expect(t).toHaveBeenCalledWith("errors.encryptedPdfMustRemovePassword", {
      defaultValue:
        "This PDF is encrypted. Please unlock it using the Unlock PDF Forms tool.",
    });
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Server error",
        body: "Translated encrypted message",
      }),
    );
  });

  test("falls back to the default body when i18next is absent", () => {
    // beforeEach already deleted globalThis.i18next.
    const result = showSpecialErrorToast(PASSWORDED_RAW, { status: 400 });
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Request error",
        body: "The PDF password is incorrect or not provided.",
      }),
    );
  });

  test("ignores an i18next whose t is not a function and uses the default body", () => {
    setI18next({ t: "not-a-function" });
    const result = showSpecialErrorToast(ENCRYPTED_RAW);
    expect(result).toBe(true);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "This PDF is encrypted. Please unlock it using the Unlock PDF Forms tool.",
      }),
    );
  });

  test("swallows a throwing i18next.t and falls back to the default body", () => {
    const t = vi.fn(() => {
      throw new Error("i18n boom");
    });
    setI18next({ t });

    const result = showSpecialErrorToast(PASSWORDED_RAW, { status: 500 });

    expect(result).toBe(true);
    expect(t).toHaveBeenCalledTimes(1);
    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Server error",
        body: "The PDF password is incorrect or not provided.",
      }),
    );
  });
});
