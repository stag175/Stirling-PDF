import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

import {
  automationStorage,
  type AutomationConfig,
} from "@app/services/automationStorage";

/**
 * Unit tests for the AutomationStorage IndexedDB service.
 *
 * Strategy:
 * - Happy paths run against the real `fake-indexeddb/auto` polyfill (same
 *   approach as indexedDBManager.migration.test.ts) so CRUD, sorting and
 *   search execute their genuine production code paths.
 * - The singleton caches its `db` handle on `this.db`. Because every test
 *   shares the one exported instance, we reset that cached handle and delete
 *   the underlying database before each test so init()/ensureDB() lazily run
 *   again and tests stay isolated/deterministic.
 * - Error/branch paths (open onerror, request onerror, "not initialized") are
 *   driven by temporarily swapping `globalThis.indexedDB` with hand-rolled
 *   request stubs, then restoring the polyfill.
 */

const DB_NAME = "StirlingPDF_Automations";
const STORE_NAME = "automations";

// The service keeps an open handle on a private `db` field. Close any real
// connection and reset it so each test re-runs init() against a freshly
// recreated database. Closing is essential: a lingering open connection blocks
// indexedDB.deleteDatabase() and would hang the next beforeEach.
function resetSingletonHandle(): void {
  const ref = automationStorage as unknown as { db: IDBDatabase | null };
  if (ref.db && typeof ref.db.close === "function") {
    ref.db.close();
  }
  ref.db = null;
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * Seed records directly via raw IndexedDB with fully-controlled createdAt
 * values so getAllAutomations()'s newest-first sort is deterministic.
 */
function seedRaw(records: AutomationConfig[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const r of records) {
        store.add(r);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("seed failed"));
    };
    open.onerror = () => reject(open.error ?? new Error("seed open failed"));
  });
}

function makeRecord(over: Partial<AutomationConfig>): AutomationConfig {
  return {
    id: "seed-id",
    name: "Seed",
    description: "Seed description",
    operations: [{ operation: "merge", parameters: {} }],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

beforeEach(async () => {
  resetSingletonHandle();
  await deleteDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AutomationStorage CRUD (real fake-indexeddb)", () => {
  test("saveAutomation lazily initializes the DB and stamps id + timestamps", async () => {
    const saved = await automationStorage.saveAutomation({
      name: "My Automation",
      description: "does things",
      operations: [{ operation: "rotate", parameters: { angle: 90 } }],
    });

    expect(saved.id).toMatch(/^automation-\d+-[a-z0-9]+$/);
    expect(saved.name).toBe("My Automation");
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(typeof saved.createdAt).toBe("string");

    // Persisted and retrievable.
    const fetched = await automationStorage.getAutomation(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("My Automation");
  });

  test("saveAutomation works without an optional description", async () => {
    const saved = await automationStorage.saveAutomation({
      name: "No Description",
      operations: [{ operation: "split", parameters: {} }],
    });
    expect(saved.description).toBeUndefined();
    const fetched = await automationStorage.getAutomation(saved.id);
    expect(fetched?.description).toBeUndefined();
  });

  test("getAutomation returns null for a missing id (miss branch)", async () => {
    // Trigger lazy init first via a save so the store exists.
    await automationStorage.saveAutomation({
      name: "exists",
      operations: [],
    });
    const missing = await automationStorage.getAutomation("does-not-exist");
    expect(missing).toBeNull();
  });

  test("getAllAutomations returns [] when the store is empty", async () => {
    // Force the store to be created without inserting any records.
    await seedRaw([]);
    resetSingletonHandle();
    const all = await automationStorage.getAllAutomations();
    expect(all).toEqual([]);
  });

  test("getAllAutomations sorts newest-first by createdAt", async () => {
    await seedRaw([
      makeRecord({
        id: "old",
        name: "Oldest",
        createdAt: "2020-01-01T00:00:00.000Z",
      }),
      makeRecord({
        id: "new",
        name: "Newest",
        createdAt: "2024-12-31T00:00:00.000Z",
      }),
      makeRecord({
        id: "mid",
        name: "Middle",
        createdAt: "2022-06-15T00:00:00.000Z",
      }),
    ]);
    resetSingletonHandle();

    const all = await automationStorage.getAllAutomations();
    expect(all.map((a) => a.id)).toEqual(["new", "mid", "old"]);
  });

  test("updateAutomation persists changes and refreshes updatedAt only", async () => {
    // Seed a record with a fixed, old timestamp so the refreshed updatedAt is
    // deterministically different. We avoid vi.useFakeTimers() here because
    // fake-indexeddb dispatches its request callbacks on real microtasks/timers
    // and freezing the clock would deadlock those async completions.
    const seededTimestamp = "2020-01-01T00:00:00.000Z";
    await seedRaw([
      makeRecord({
        id: "to-update",
        name: "Original",
        createdAt: seededTimestamp,
        updatedAt: seededTimestamp,
        operations: [],
      }),
    ]);
    resetSingletonHandle();

    const existing = await automationStorage.getAutomation("to-update");
    expect(existing).not.toBeNull();

    const updated = await automationStorage.updateAutomation({
      ...existing!,
      name: "Renamed",
    });

    expect(updated.name).toBe("Renamed");
    // createdAt preserved, updatedAt advanced to "now" (not the seeded value).
    expect(updated.createdAt).toBe(seededTimestamp);
    expect(updated.updatedAt).not.toBe(seededTimestamp);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(seededTimestamp).getTime(),
    );

    const fetched = await automationStorage.getAutomation("to-update");
    expect(fetched?.name).toBe("Renamed");
    expect(fetched?.updatedAt).toBe(updated.updatedAt);
  });

  test("deleteAutomation removes the record", async () => {
    const saved = await automationStorage.saveAutomation({
      name: "ToDelete",
      operations: [],
    });
    await expect(
      automationStorage.deleteAutomation(saved.id),
    ).resolves.toBeUndefined();
    expect(await automationStorage.getAutomation(saved.id)).toBeNull();
  });

  test("ensureDB reuses the cached handle across calls", async () => {
    const first = await automationStorage.saveAutomation({
      name: "first",
      operations: [],
    });
    // Second call should NOT re-init (db already cached) but still work.
    const second = await automationStorage.saveAutomation({
      name: "second",
      operations: [],
    });
    expect(first.id).not.toBe(second.id);
    const all = await automationStorage.getAllAutomations();
    expect(all).toHaveLength(2);
  });
});

describe("AutomationStorage.searchAutomations", () => {
  beforeEach(async () => {
    await seedRaw([
      makeRecord({
        id: "a",
        name: "Invoice Splitter",
        description: "Splits invoices by page",
        operations: [{ operation: "split", parameters: {} }],
        createdAt: "2024-03-01T00:00:00.000Z",
      }),
      makeRecord({
        id: "b",
        name: "Watermark Adder",
        description: undefined, // exercises the description-undefined branch
        operations: [{ operation: "addStamp", parameters: {} }],
        createdAt: "2024-02-01T00:00:00.000Z",
      }),
      makeRecord({
        id: "c",
        name: "Rotate Pages",
        description: "Turn pages around",
        operations: [{ operation: "rotate", parameters: {} }],
        createdAt: "2024-01-01T00:00:00.000Z",
      }),
    ]);
    resetSingletonHandle();
  });

  test("returns all records (sorted) for an empty query", async () => {
    const result = await automationStorage.searchAutomations("");
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  test("returns all records for a whitespace-only query", async () => {
    const result = await automationStorage.searchAutomations("   ");
    expect(result).toHaveLength(3);
  });

  test("matches on name (case-insensitive)", async () => {
    const result = await automationStorage.searchAutomations("INVOICE");
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  test("matches on description", async () => {
    const result = await automationStorage.searchAutomations("around");
    expect(result.map((r) => r.id)).toEqual(["c"]);
  });

  test("matches on an operation name when name/description miss", async () => {
    // 'addstamp' only appears as an operation on record b (which has no
    // description), exercising the operations.some(...) branch.
    const result = await automationStorage.searchAutomations("addstamp");
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  test("returns an empty array when nothing matches", async () => {
    const result = await automationStorage.searchAutomations("zzz-nope");
    expect(result).toEqual([]);
  });
});

describe("AutomationStorage error and rejection paths", () => {
  test("init rejects when indexedDB.open fails", async () => {
    const realIDB = globalThis.indexedDB;
    const fakeRequest: Record<string, unknown> = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };
    const openSpy = vi.fn(() => {
      // Fire onerror asynchronously, after the service wires up its handlers.
      queueMicrotask(() => {
        (fakeRequest.onerror as (() => void) | null)?.();
      });
      return fakeRequest as unknown as IDBOpenDBRequest;
    });
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      ...realIDB,
      open: openSpy,
    };

    try {
      resetSingletonHandle();
      await expect(automationStorage.init()).rejects.toThrow(
        "Failed to open automation storage database",
      );
      expect(openSpy).toHaveBeenCalledWith(DB_NAME, 1);
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = realIDB;
    }
  });

  test("onupgradeneeded creates the object store and indexes on a brand new DB", async () => {
    // Run init() against the real polyfill on a fresh DB so the
    // onupgradeneeded branch (createObjectStore + createIndex) executes.
    resetSingletonHandle();
    await automationStorage.init();

    const handle = (automationStorage as unknown as { db: IDBDatabase | null })
      .db;
    expect(handle).not.toBeNull();
    expect(handle?.objectStoreNames.contains(STORE_NAME)).toBe(true);

    const tx = handle!.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    expect(Array.from(store.indexNames)).toEqual(
      expect.arrayContaining(["name", "createdAt"]),
    );
  });

  test("ensureDB throws when init leaves db unset", async () => {
    const realIDB = globalThis.indexedDB;
    // open() resolves "successfully" but yields a falsy result, so
    // init() resolves yet this.db stays null -> ensureDB throws.
    const fakeRequest: Record<string, unknown> = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: null,
    };
    const openSpy = vi.fn(() => {
      queueMicrotask(() => {
        (fakeRequest.onsuccess as (() => void) | null)?.();
      });
      return fakeRequest as unknown as IDBOpenDBRequest;
    });
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      ...realIDB,
      open: openSpy,
    };

    try {
      resetSingletonHandle();
      await expect(automationStorage.ensureDB()).rejects.toThrow(
        "Database not initialized",
      );
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = realIDB;
    }
  });

  test("saveAutomation rejects when the add request errors", async () => {
    injectFailingTransaction();
    await expect(
      automationStorage.saveAutomation({ name: "x", operations: [] }),
    ).rejects.toThrow("Failed to save automation");
  });

  test("updateAutomation rejects when the put request errors", async () => {
    injectFailingTransaction();
    await expect(
      automationStorage.updateAutomation(makeRecord({ id: "u" })),
    ).rejects.toThrow("Failed to update automation");
  });

  test("getAutomation rejects when the get request errors", async () => {
    injectFailingTransaction();
    await expect(automationStorage.getAutomation("id")).rejects.toThrow(
      "Failed to get automation",
    );
  });

  test("getAllAutomations rejects when the getAll request errors", async () => {
    injectFailingTransaction();
    await expect(automationStorage.getAllAutomations()).rejects.toThrow(
      "Failed to get automations",
    );
  });

  test("deleteAutomation rejects when the delete request errors", async () => {
    injectFailingTransaction();
    await expect(automationStorage.deleteAutomation("id")).rejects.toThrow(
      "Failed to delete automation",
    );
  });
});

/**
 * Swap in an indexedDB whose transactions hand back request objects that fire
 * onerror asynchronously. This forces every CRUD method's request.onerror
 * rejection branch to run deterministically without depending on polyfill
 * internals. The pre-cached db handle is replaced so ensureDB() returns it
 * immediately.
 */
function injectFailingTransaction(): void {
  const makeFailingRequest = () => {
    const req: Record<string, unknown> = { onsuccess: null, onerror: null };
    queueMicrotask(() => {
      (req.onerror as (() => void) | null)?.();
    });
    return req as unknown as IDBRequest;
  };

  const fakeStore = {
    add: makeFailingRequest,
    put: makeFailingRequest,
    get: makeFailingRequest,
    getAll: makeFailingRequest,
    delete: makeFailingRequest,
  };

  const fakeDb = {
    transaction: () => ({
      objectStore: () => fakeStore,
    }),
  } as unknown as IDBDatabase;

  (automationStorage as unknown as { db: IDBDatabase | null }).db = fakeDb;
}
