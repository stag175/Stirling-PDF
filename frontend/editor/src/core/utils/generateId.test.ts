import { afterEach, describe, expect, it, vi } from "vitest";

import { generateId } from "@app/utils/generateId";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a v4-formatted UUID (crypto.randomUUID path)", () => {
    expect(generateId()).toMatch(UUID_V4);
  });

  it("produces unique ids across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it("falls back to a Math.random v4 UUID when crypto.randomUUID is unavailable", () => {
    // Replace the global crypto with one lacking randomUUID to force the manual path.
    vi.stubGlobal("crypto", {});
    const id = generateId();
    expect(id).toMatch(UUID_V4); // version nibble '4' and variant nibble [89ab] are enforced by the regex
  });
});
