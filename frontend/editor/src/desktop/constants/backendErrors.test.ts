import { describe, expect, it, vi } from "vitest";

// i18n.t(key, fallback) => fallback, so createBackendNotReadyError's message is
// the stable, locale-independent fallback string.
vi.mock("@app/i18n", () => ({
  default: {
    t: (_key: string, fallback?: string) => fallback ?? _key,
  },
}));

import {
  BACKEND_NOT_READY_CODE,
  createBackendNotReadyError,
  isBackendNotReadyError,
} from "@app/constants/backendErrors";

describe("createBackendNotReadyError", () => {
  it("produces a real Error tagged with the BACKEND_NOT_READY code", () => {
    const err = createBackendNotReadyError();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(BACKEND_NOT_READY_CODE);
    expect(err.code).toBe("BACKEND_NOT_READY");
  });

  it("uses the i18n fallback as its message", () => {
    expect(createBackendNotReadyError().message).toBe("Backend starting up...");
  });

  it("is recognised by its own type guard", () => {
    expect(isBackendNotReadyError(createBackendNotReadyError())).toBe(true);
  });
});

describe("isBackendNotReadyError", () => {
  it("accepts any object carrying the matching code (structural, not nominal)", () => {
    expect(isBackendNotReadyError({ code: BACKEND_NOT_READY_CODE })).toBe(true);
  });

  it("rejects a plain Error with no code", () => {
    expect(isBackendNotReadyError(new Error("boom"))).toBe(false);
  });

  it("rejects an object with a different code", () => {
    expect(isBackendNotReadyError({ code: "SOMETHING_ELSE" })).toBe(false);
    expect(isBackendNotReadyError({ code: 42 })).toBe(false);
  });

  it("rejects null, undefined and non-objects", () => {
    expect(isBackendNotReadyError(null)).toBe(false);
    expect(isBackendNotReadyError(undefined)).toBe(false);
    expect(isBackendNotReadyError("BACKEND_NOT_READY")).toBe(false);
    expect(isBackendNotReadyError(123)).toBe(false);
  });
});
