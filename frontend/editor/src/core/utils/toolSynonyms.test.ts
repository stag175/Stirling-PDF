import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { getSynonyms } from "@app/utils/toolSynonyms";

// i18next's t() returns the key itself when a translation is missing; the mock mirrors that so the
// "value !== key" fallback logic in getSynonyms is exercised realistically.
const tFn = (mapping: Record<string, string>): TFunction =>
  ((key: string) => (key in mapping ? mapping[key] : key)) as unknown as TFunction;

describe("getSynonyms", () => {
  it("splits the comma-separated tags from the home.<id>.tags key", () => {
    const t = tFn({ "home.split.tags": "split, divide, cut" });
    expect(getSynonyms(t, "split")).toEqual(["split", "divide", "cut"]);
  });

  it("falls back to the <id>.tags key when the home.<id>.tags key is missing", () => {
    const t = tFn({ "split.tags": "alpha, beta" });
    expect(getSynonyms(t, "split")).toEqual(["alpha", "beta"]);
  });

  it("returns an empty array when no tags key resolves", () => {
    expect(getSynonyms(tFn({}), "split")).toEqual([]);
  });

  it("trims whitespace and drops empty entries", () => {
    const t = tFn({ "home.x.tags": "  a , , b ,, c  " });
    expect(getSynonyms(t, "x")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for an empty tags value", () => {
    expect(getSynonyms(tFn({ "home.x.tags": "" }), "x")).toEqual([]);
  });

  it("returns an empty array (not throw) if the translator throws", () => {
    const throwing = (() => {
      throw new Error("boom");
    }) as unknown as TFunction;
    expect(getSynonyms(throwing, "split")).toEqual([]);
  });
});
