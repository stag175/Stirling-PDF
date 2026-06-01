/**
 * Unit tests for storageUtils
 */

import { describe, test, expect } from "vitest";
import type { StorageStats } from "@app/services/fileStorage";
import {
  updateStorageStatsIncremental,
  checkStorageWarnings,
  getStorageUsagePercent,
} from "@app/utils/storageUtils";

/** Build a StorageStats object with sensible defaults. */
function makeStats(overrides: Partial<StorageStats> = {}): StorageStats {
  return {
    used: 0,
    available: 1000,
    fileCount: 0,
    quota: 1000,
    ...overrides,
  };
}

/** Build a fake File of a given size without touching real file APIs. */
function makeFile(size: number, name = "f.pdf"): File {
  return { size, name } as unknown as File;
}

describe("storageUtils", () => {
  describe("updateStorageStatsIncremental - add", () => {
    test("adds the combined file size to used and decrements available", () => {
      const current = makeStats({ used: 100, available: 900, fileCount: 1 });
      const result = updateStorageStatsIncremental(current, "add", [
        makeFile(50),
        makeFile(150),
      ]);

      expect(result.used).toBe(300);
      expect(result.available).toBe(700);
      expect(result.fileCount).toBe(3);
    });

    test("treats a missing files argument as an empty list (no-op deltas)", () => {
      const current = makeStats({ used: 100, available: 900, fileCount: 2 });
      const result = updateStorageStatsIncremental(current, "add");

      expect(result.used).toBe(100);
      expect(result.available).toBe(900);
      expect(result.fileCount).toBe(2);
    });

    test("preserves other stat fields such as quota", () => {
      const current = makeStats({ used: 0, available: 500, quota: 2048 });
      const result = updateStorageStatsIncremental(current, "add", [
        makeFile(10),
      ]);

      expect(result.quota).toBe(2048);
    });

    test("does not mutate the input stats object", () => {
      const current = makeStats({ used: 100, available: 900, fileCount: 1 });
      const snapshot = { ...current };
      updateStorageStatsIncremental(current, "add", [makeFile(50)]);

      expect(current).toEqual(snapshot);
    });

    test("handles an empty file array as a no-op", () => {
      const current = makeStats({ used: 42, available: 958, fileCount: 5 });
      const result = updateStorageStatsIncremental(current, "add", []);

      expect(result.used).toBe(42);
      expect(result.available).toBe(958);
      expect(result.fileCount).toBe(5);
    });
  });

  describe("updateStorageStatsIncremental - remove", () => {
    test("subtracts the combined file size from used and increments available", () => {
      const current = makeStats({ used: 300, available: 700, fileCount: 3 });
      const result = updateStorageStatsIncremental(current, "remove", [
        makeFile(50),
        makeFile(150),
      ]);

      expect(result.used).toBe(100);
      expect(result.available).toBe(900);
      expect(result.fileCount).toBe(1);
    });

    test("clamps used at 0 when removing more than is used", () => {
      const current = makeStats({ used: 100, available: 900, fileCount: 1 });
      const result = updateStorageStatsIncremental(current, "remove", [
        makeFile(500),
      ]);

      expect(result.used).toBe(0);
      // available still gets the full size added back (no clamp on available)
      expect(result.available).toBe(1400);
    });

    test("clamps fileCount at 0 when removing more files than tracked", () => {
      const current = makeStats({ used: 100, available: 900, fileCount: 1 });
      const result = updateStorageStatsIncremental(current, "remove", [
        makeFile(10),
        makeFile(10),
        makeFile(10),
      ]);

      expect(result.fileCount).toBe(0);
    });

    test("does not mutate the input stats object", () => {
      const current = makeStats({ used: 300, available: 700, fileCount: 3 });
      const snapshot = { ...current };
      updateStorageStatsIncremental(current, "remove", [makeFile(50)]);

      expect(current).toEqual(snapshot);
    });
  });

  describe("updateStorageStatsIncremental - clear", () => {
    test("resets used and fileCount to 0 and restores available to quota", () => {
      const current = makeStats({
        used: 500,
        available: 500,
        fileCount: 7,
        quota: 1000,
      });
      const result = updateStorageStatsIncremental(current, "clear");

      expect(result.used).toBe(0);
      expect(result.fileCount).toBe(0);
      expect(result.available).toBe(1000);
    });

    test("falls back to current available when quota is undefined", () => {
      const current: StorageStats = {
        used: 200,
        available: 800,
        fileCount: 4,
      };
      const result = updateStorageStatsIncremental(current, "clear");

      expect(result.used).toBe(0);
      expect(result.fileCount).toBe(0);
      expect(result.available).toBe(800);
    });

    test("falls back to current available when quota is 0 (falsy)", () => {
      const current = makeStats({
        used: 300,
        available: 650,
        fileCount: 2,
        quota: 0,
      });
      const result = updateStorageStatsIncremental(current, "clear");

      expect(result.available).toBe(650);
    });

    test("ignores the files argument for clear", () => {
      const current = makeStats({ used: 300, available: 700, fileCount: 5 });
      const result = updateStorageStatsIncremental(current, "clear", [
        makeFile(999),
      ]);

      expect(result.used).toBe(0);
      expect(result.fileCount).toBe(0);
    });
  });

  describe("updateStorageStatsIncremental - default branch", () => {
    test("returns the same stats reference for an unknown operation", () => {
      const current = makeStats({ used: 123, available: 877, fileCount: 9 });
      const result = updateStorageStatsIncremental(
        current,
        "unknown" as never,
        [makeFile(10)],
      );

      expect(result).toBe(current);
    });
  });

  describe("checkStorageWarnings", () => {
    test("returns null when quota is undefined", () => {
      const stats: StorageStats = { used: 500, available: 500, fileCount: 1 };
      expect(checkStorageWarnings(stats)).toBeNull();
    });

    test("returns null when quota is 0 (falsy)", () => {
      const stats = makeStats({ used: 500, quota: 0 });
      expect(checkStorageWarnings(stats)).toBeNull();
    });

    test("returns null when nothing is used", () => {
      const stats = makeStats({ used: 0, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBeNull();
    });

    test("returns null at exactly 80% (boundary is exclusive)", () => {
      const stats = makeStats({ used: 800, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBeNull();
    });

    test("returns the >80% warning just above 80%", () => {
      const stats = makeStats({ used: 801, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBe(
        "Storage is getting full (>80%). Consider removing old files.",
      );
    });

    test("returns the >80% warning at exactly 90% (boundary is exclusive)", () => {
      const stats = makeStats({ used: 900, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBe(
        "Storage is getting full (>80%). Consider removing old files.",
      );
    });

    test("returns the >90% warning just above 90%", () => {
      const stats = makeStats({ used: 901, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBe(
        "Warning: Storage is nearly full (>90%). Browser may start clearing data.",
      );
    });

    test("returns the >90% warning when fully used", () => {
      const stats = makeStats({ used: 1000, quota: 1000 });
      expect(checkStorageWarnings(stats)).toBe(
        "Warning: Storage is nearly full (>90%). Browser may start clearing data.",
      );
    });
  });

  describe("getStorageUsagePercent", () => {
    test("returns the used/quota percentage", () => {
      const stats = makeStats({ used: 250, quota: 1000 });
      expect(getStorageUsagePercent(stats)).toBe(25);
    });

    test("returns 0 when quota is undefined", () => {
      const stats: StorageStats = { used: 500, available: 500, fileCount: 1 };
      expect(getStorageUsagePercent(stats)).toBe(0);
    });

    test("returns 0 when quota is 0 (falsy), avoiding division by zero", () => {
      const stats = makeStats({ used: 500, quota: 0 });
      expect(getStorageUsagePercent(stats)).toBe(0);
    });

    test("returns 100 when fully used", () => {
      const stats = makeStats({ used: 1000, quota: 1000 });
      expect(getStorageUsagePercent(stats)).toBe(100);
    });

    test("returns 0 when nothing is used", () => {
      const stats = makeStats({ used: 0, quota: 1000 });
      expect(getStorageUsagePercent(stats)).toBe(0);
    });
  });
});
