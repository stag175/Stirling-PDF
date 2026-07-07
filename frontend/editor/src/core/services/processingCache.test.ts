import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

import { ProcessingCache } from "@app/services/processingCache";
import { ProcessedFile, CacheConfig, PDFPage } from "@app/types/processing";

/**
 * Unit tests for ProcessingCache: a pure in-memory LRU + TTL cache.
 *
 * The class has no external dependencies, so determinism comes entirely
 * from controlling the clock. We use vi.useFakeTimers() so that Date.now()
 * (read internally for createdAt / lastAccessed / TTL checks) is driven by
 * vi.advanceTimersByTime / vi.setSystemTime instead of the real wall clock.
 */

function makePage(pageNumber: number, withThumbnail: boolean): PDFPage {
  return {
    id: `page-${pageNumber}`,
    pageNumber,
    thumbnail: withThumbnail ? "data:image/png;base64,AAAA" : null,
    rotation: 0,
    selected: false,
  };
}

function makeFile(id: string, thumbnailPageCount = 0): ProcessedFile {
  const pages: PDFPage[] = [];
  // First `thumbnailPageCount` pages have thumbnails, plus one without.
  for (let i = 1; i <= thumbnailPageCount; i++) {
    pages.push(makePage(i, true));
  }
  pages.push(makePage(thumbnailPageCount + 1, false));
  return {
    id,
    pages,
    totalPages: pages.length,
    metadata: {
      title: id,
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

// Size constants mirror the (intentionally rough) estimation in the source:
// 50KB per thumbnail page + 10KB overhead.
const THUMB_BYTES = 50 * 1024;
const OVERHEAD_BYTES = 10 * 1024;

describe("ProcessingCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the system clock to a stable, non-zero epoch so createdAt/
    // lastAccessed are deterministic across runs.
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set / get / has basics", () => {
    test("stores and retrieves a file by key", () => {
      const cache = new ProcessingCache();
      const file = makeFile("a", 2);

      cache.set("a", file);

      expect(cache.get("a")).toBe(file);
      expect(cache.has("a")).toBe(true);
    });

    test("get returns null for a missing key", () => {
      const cache = new ProcessingCache();
      expect(cache.get("missing")).toBeNull();
    });

    test("has returns false for a missing key", () => {
      const cache = new ProcessingCache();
      expect(cache.has("missing")).toBe(false);
    });

    test("set overwrites an existing key and re-counts its size", () => {
      const cache = new ProcessingCache();
      // First version: no thumbnails -> only overhead.
      cache.set("a", makeFile("a", 0));
      expect(cache.getStats().totalSizeBytes).toBe(OVERHEAD_BYTES);

      // Overwrite with a 2-thumbnail file. The Map keeps a single entry,
      // but totalSize accumulates because set() does not subtract the old
      // entry's size before adding the new one (documented current behavior).
      const replacement = makeFile("a", 2);
      cache.set("a", replacement);

      expect(cache.get("a")).toBe(replacement);
      expect(cache.getStats().entries).toBe(1);
      expect(cache.getStats().totalSizeBytes).toBe(
        OVERHEAD_BYTES + (2 * THUMB_BYTES + OVERHEAD_BYTES),
      );
    });
  });

  describe("calculateSize via getStats", () => {
    test("a file with no thumbnails costs only the fixed overhead", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 0));
      expect(cache.getStats().totalSizeBytes).toBe(OVERHEAD_BYTES);
    });

    test("each thumbnail page adds 50KB on top of the overhead", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 3));
      expect(cache.getStats().totalSizeBytes).toBe(
        3 * THUMB_BYTES + OVERHEAD_BYTES,
      );
    });
  });

  describe("TTL expiry", () => {
    test("get evicts and returns null once the entry outlives ttlMs", () => {
      const config: CacheConfig = {
        maxFiles: 20,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 1000,
      };
      const cache = new ProcessingCache(config);
      cache.set("a", makeFile("a", 1));

      // Just before expiry the entry is still live.
      vi.advanceTimersByTime(1000);
      expect(cache.get("a")).not.toBeNull();

      // Reset lastAccessed via the get above, but createdAt is fixed, so
      // advancing one more ms past ttl from creation expires it.
      vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
      vi.advanceTimersByTime(1001);
      expect(cache.get("a")).toBeNull();
      // Eviction also frees the tracked size.
      expect(cache.getStats().entries).toBe(0);
      expect(cache.getStats().totalSizeBytes).toBe(0);
    });

    test("has evicts and returns false once the entry outlives ttlMs", () => {
      const cache = new ProcessingCache({
        maxFiles: 20,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 1000,
      });
      cache.set("a", makeFile("a", 1));

      vi.advanceTimersByTime(1001);

      expect(cache.has("a")).toBe(false);
      expect(cache.getStats().entries).toBe(0);
    });

    test("set runs cleanup, purging already-expired entries", () => {
      const cache = new ProcessingCache({
        maxFiles: 20,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 1000,
      });
      cache.set("old", makeFile("old", 1));

      // Let "old" expire, then insert a fresh key. set() calls cleanup()
      // first, which should drop the stale "old" entry and its size.
      vi.advanceTimersByTime(2000);
      cache.set("new", makeFile("new", 1));

      expect(cache.getKeys()).toEqual(["new"]);
      expect(cache.getStats().entries).toBe(1);
      expect(cache.getStats().totalSizeBytes).toBe(
        THUMB_BYTES + OVERHEAD_BYTES,
      );
    });

    test("an entry exactly at the ttl boundary is still considered live", () => {
      const cache = new ProcessingCache({
        maxFiles: 20,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 1000,
      });
      cache.set("a", makeFile("a", 0));

      // age === ttlMs is NOT > ttlMs, so it must remain.
      vi.advanceTimersByTime(1000);
      expect(cache.has("a")).toBe(true);
      expect(cache.get("a")).not.toBeNull();
    });
  });

  describe("makeRoom eviction by file count (LRU)", () => {
    test("evicts the least-recently-accessed entry when maxFiles is reached", () => {
      const cache = new ProcessingCache({
        maxFiles: 2,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 60_000,
      });

      cache.set("a", makeFile("a", 0));
      vi.advanceTimersByTime(10);
      cache.set("b", makeFile("b", 0));

      // Touch "a" so it becomes the most-recently-accessed; "b" is now oldest.
      vi.advanceTimersByTime(10);
      expect(cache.get("a")).not.toBeNull();

      // Inserting "c" needs room (size already 2 >= maxFiles 2): the LRU
      // entry "b" should be evicted, not "a".
      vi.advanceTimersByTime(10);
      cache.set("c", makeFile("c", 0));

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
      expect(cache.getStats().entries).toBe(2);
    });

    test("repeated inserts never exceed maxFiles", () => {
      const cache = new ProcessingCache({
        maxFiles: 3,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 60_000,
      });

      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1);
        cache.set(`k${i}`, makeFile(`k${i}`, 0));
      }

      expect(cache.getStats().entries).toBe(3);
      // The three most recently inserted keys survive.
      expect(cache.getKeys().sort()).toEqual(["k7", "k8", "k9"]);
    });
  });

  describe("makeRoom eviction by byte budget", () => {
    test("evicts oldest entries until the new entry fits the size cap", () => {
      // Budget allows ~2 files of (1 thumb + overhead) = 60KB each.
      const perFile = THUMB_BYTES + OVERHEAD_BYTES;
      const cache = new ProcessingCache({
        maxFiles: 100, // high, so the size cap is the binding constraint
        maxSizeBytes: perFile * 2,
        ttlMs: 60_000,
      });

      cache.set("a", makeFile("a", 1));
      vi.advanceTimersByTime(10);
      cache.set("b", makeFile("b", 1));
      // Now at 2 * perFile == cap. Adding "c" would exceed it, so the
      // oldest ("a") is evicted to make room.
      vi.advanceTimersByTime(10);
      cache.set("c", makeFile("c", 1));

      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(true);
      expect(cache.has("c")).toBe(true);
      expect(cache.getStats().totalSizeBytes).toBe(perFile * 2);
    });

    test("makeRoom stops when the cache is empty even if the entry is oversized", () => {
      // A single file is larger than the whole budget. makeRoom should empty
      // the cache and then break (findOldestEntry returns null), letting the
      // oversized entry be stored rather than looping forever.
      const cache = new ProcessingCache({
        maxFiles: 100,
        maxSizeBytes: OVERHEAD_BYTES, // smaller than any thumbnailed file
        ttlMs: 60_000,
      });

      cache.set("big", makeFile("big", 5));

      expect(cache.has("big")).toBe(true);
      expect(cache.getStats().entries).toBe(1);
      expect(cache.getStats().totalSizeBytes).toBe(
        5 * THUMB_BYTES + OVERHEAD_BYTES,
      );
    });
  });

  describe("get refreshes recency", () => {
    test("accessing an entry protects it from the next eviction", () => {
      const cache = new ProcessingCache({
        maxFiles: 2,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
        ttlMs: 60_000,
      });

      cache.set("a", makeFile("a", 0));
      vi.advanceTimersByTime(10);
      cache.set("b", makeFile("b", 0));

      // Without a touch, "a" would be oldest. Touch it to flip recency.
      vi.advanceTimersByTime(10);
      cache.get("a");

      vi.advanceTimersByTime(10);
      cache.set("c", makeFile("c", 0));

      // "b" was the least recently accessed -> evicted.
      expect(cache.has("b")).toBe(false);
      expect(cache.has("a")).toBe(true);
    });
  });

  describe("delete", () => {
    test("removes an entry and decrements the tracked size", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 2));
      const sizeBefore = cache.getStats().totalSizeBytes;
      expect(sizeBefore).toBeGreaterThan(0);

      cache.delete("a");

      expect(cache.has("a")).toBe(false);
      expect(cache.getStats().entries).toBe(0);
      expect(cache.getStats().totalSizeBytes).toBe(0);
    });

    test("deleting a missing key is a no-op", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 1));
      const before = cache.getStats();

      cache.delete("does-not-exist");

      const after = cache.getStats();
      expect(after.entries).toBe(before.entries);
      expect(after.totalSizeBytes).toBe(before.totalSizeBytes);
    });
  });

  describe("clear", () => {
    test("removes all entries and zeroes the size", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 1));
      cache.set("b", makeFile("b", 2));

      cache.clear();

      expect(cache.getKeys()).toEqual([]);
      expect(cache.getStats().entries).toBe(0);
      expect(cache.getStats().totalSizeBytes).toBe(0);
      expect(cache.get("a")).toBeNull();
    });
  });

  describe("getStats / getKeys", () => {
    test("getStats reports entries, total size, and the configured cap", () => {
      const config: CacheConfig = {
        maxFiles: 5,
        maxSizeBytes: 123_456,
        ttlMs: 60_000,
      };
      const cache = new ProcessingCache(config);
      cache.set("a", makeFile("a", 1));

      const stats = cache.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.totalSizeBytes).toBe(THUMB_BYTES + OVERHEAD_BYTES);
      expect(stats.maxSizeBytes).toBe(123_456);
    });

    test("getKeys returns the current keys in insertion order", () => {
      const cache = new ProcessingCache();
      cache.set("a", makeFile("a", 0));
      cache.set("b", makeFile("b", 0));
      cache.set("c", makeFile("c", 0));

      expect(cache.getKeys()).toEqual(["a", "b", "c"]);
    });

    test("empty cache reports zeroed stats and no keys", () => {
      const cache = new ProcessingCache();
      expect(cache.getKeys()).toEqual([]);
      expect(cache.getStats()).toEqual({
        entries: 0,
        totalSizeBytes: 0,
        maxSizeBytes: 2 * 1024 * 1024 * 1024,
      });
    });
  });
});
