import { describe, expect, it } from "vitest";

import {
  ENDPOINTS,
  isSplitMethod,
  METHOD_OPTIONS,
  SPLIT_METHODS,
} from "@app/constants/splitConstants";

describe("isSplitMethod", () => {
  it.each(Object.values(SPLIT_METHODS))(
    "accepts the valid split method %s",
    (method) => {
      expect(isSplitMethod(method)).toBe(true);
    },
  );

  it("rejects null", () => {
    expect(isSplitMethod(null)).toBe(false);
  });

  it("rejects empty, unknown, and key-name (not value) strings", () => {
    expect(isSplitMethod("")).toBe(false);
    expect(isSplitMethod("notAMethod")).toBe(false);
    // The guard matches SPLIT_METHODS *values*, not its keys.
    expect(isSplitMethod("BY_PAGES")).toBe(false);
  });
});

describe("ENDPOINTS registry", () => {
  it("maps every split method to a non-empty endpoint string", () => {
    for (const method of Object.values(SPLIT_METHODS)) {
      expect(typeof ENDPOINTS[method]).toBe("string");
      expect(ENDPOINTS[method].length).toBeGreaterThan(0);
    }
  });

  it("has no endpoint keys that are not split methods", () => {
    const methods = new Set<string>(Object.values(SPLIT_METHODS));
    for (const key of Object.keys(ENDPOINTS)) {
      expect(methods.has(key)).toBe(true);
    }
  });
});

describe("METHOD_OPTIONS", () => {
  it("every option's value is a valid split method", () => {
    for (const option of METHOD_OPTIONS) {
      expect(isSplitMethod(option.value)).toBe(true);
    }
  });

  it("option values are unique", () => {
    const values = METHOD_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
