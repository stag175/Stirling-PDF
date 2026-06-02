import { describe, expect, it } from "vitest";

import {
  FOLDER_COLOR_PALETTE,
  parseFolderId,
  pickFolderColor,
} from "@app/types/folder";

const V4 = "123e4567-e89b-42d3-a456-426614174000";

describe("parseFolderId", () => {
  it("returns a valid UUID unchanged", () => {
    expect(parseFolderId(V4)).toBe(V4);
  });

  it("accepts UUIDs case-insensitively and across variants", () => {
    expect(parseFolderId(V4.toUpperCase())).toBe(V4.toUpperCase());
    // The regex accepts any UUID variant (not strict v4) on purpose.
    expect(parseFolderId("00000000-0000-1000-8000-000000000000")).toBe(
      "00000000-0000-1000-8000-000000000000",
    );
  });

  it("throws for non-string inputs", () => {
    expect(() => parseFolderId(123)).toThrow(/Invalid FolderId/);
    expect(() => parseFolderId(null)).toThrow(/Invalid FolderId/);
    expect(() => parseFolderId(undefined)).toThrow(/Invalid FolderId/);
    expect(() => parseFolderId({})).toThrow(/Invalid FolderId/);
  });

  it("throws for malformed UUID strings", () => {
    expect(() => parseFolderId("")).toThrow(/Invalid FolderId/);
    expect(() => parseFolderId("not-a-uuid")).toThrow(/Invalid FolderId/);
    expect(() => parseFolderId("123e4567e89b42d3a456426614174000")).toThrow(
      /Invalid FolderId/,
    );
  });
});

describe("pickFolderColor", () => {
  it("is deterministic for a given seed", () => {
    expect(pickFolderColor("workspace-1")).toBe(pickFolderColor("workspace-1"));
  });

  it("always returns a member of the palette", () => {
    for (const seed of ["", "a", "folder", "workspace-1", "🙂"]) {
      expect(FOLDER_COLOR_PALETTE).toContain(pickFolderColor(seed));
    }
  });

  it("pins the hash→index algorithm for known seeds", () => {
    // Empty seed: hash 0 -> index 0.
    expect(pickFolderColor("")).toBe(FOLDER_COLOR_PALETTE[0]);
    // "a": hash = 97 -> index 97 % palette length.
    expect(pickFolderColor("a")).toBe(
      FOLDER_COLOR_PALETTE[97 % FOLDER_COLOR_PALETTE.length],
    );
  });

  it("distributes across more than one palette colour", () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => pickFolderColor(`seed-${i}`)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
