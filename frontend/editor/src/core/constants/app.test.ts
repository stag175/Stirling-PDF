import { describe, expect, it } from "vitest";

import {
  ANNOTATION_RECREATION_DELAY_MS,
  ANNOTATION_VERIFICATION_DELAY_MS,
  BASE_PATH,
  absoluteWithBasePath,
  withBasePath,
} from "@app/constants/app";

/**
 * BASE_PATH is resolved once at module load (from a <base> tag, else Vite's
 * BASE_URL) and normalised to have no trailing slash. The two builders are
 * pinned against BASE_PATH / window.location.origin rather than a hard-coded
 * value, so the assertions hold regardless of the test runner's base URL.
 */
describe("BASE_PATH", () => {
  it("never has a trailing slash", () => {
    expect(BASE_PATH.endsWith("/")).toBe(false);
  });
});

describe("withBasePath", () => {
  it("prefixes BASE_PATH and guarantees a single leading slash on the path", () => {
    expect(withBasePath("/tools")).toBe(`${BASE_PATH}/tools`);
  });

  it("adds the leading slash when the caller omits it", () => {
    expect(withBasePath("tools")).toBe(withBasePath("/tools"));
    expect(withBasePath("tools")).toBe(`${BASE_PATH}/tools`);
  });
});

describe("absoluteWithBasePath", () => {
  it("is the origin-qualified form of withBasePath", () => {
    expect(absoluteWithBasePath("/oauth")).toBe(
      `${window.location.origin}${withBasePath("/oauth")}`,
    );
  });

  it("normalises a missing leading slash the same way", () => {
    expect(absoluteWithBasePath("oauth")).toBe(
      `${window.location.origin}${withBasePath("/oauth")}`,
    );
  });
});

describe("annotation timing constants", () => {
  it("keep their documented millisecond values", () => {
    expect(ANNOTATION_RECREATION_DELAY_MS).toBe(50);
    expect(ANNOTATION_VERIFICATION_DELAY_MS).toBe(100);
  });
});
