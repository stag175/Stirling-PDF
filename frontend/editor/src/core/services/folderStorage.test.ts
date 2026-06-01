import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

import { folderStorage } from "@app/services/folderStorage";
import {
  DATABASE_CONFIGS,
  indexedDBManager,
} from "@app/services/indexedDBManager";
import type { FolderId, FolderRecord } from "@app/types/folder";

/**
 * Unit tests for the FolderStorageService IndexedDB read-cache.
 *
 * Strategy (mirrors automationStorage.test.ts + indexedDBManager.migration.test.ts):
 * - Happy paths run against the real `fake-indexeddb/auto` polyfill so the
 *   genuine production transaction/request code paths execute headlessly
 *   (replaceAll clear+put, targeted updaters, getAll/get, clearAll).
 * - The service resolves its DB handle through the shared `indexedDBManager`
 *   singleton, which caches open connections. We close all connections and
 *   delete the underlying database before each test so every test re-opens a
 *   fresh DB and stays isolated/deterministic.
 * - Error / abort branches (transaction.onerror, transaction.onabort, and the
 *   `?? new Error(...)` fallbacks, plus request.onerror) are driven by stuffing
 *   a hand-rolled fake `IDBDatabase` into the manager's private connection
 *   cache so `getDatabase()` hands it back synchronously.
 */

const DB_NAME = DATABASE_CONFIGS.FILES.name;

/** Branded FolderId helper - real RFC-4122 UUIDs so any consumer stays honest. */
function fid(value: string): FolderId {
  return value as FolderId;
}

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

function makeFolder(
  over: Omit<Partial<FolderRecord>, "id"> & { id: string },
): FolderRecord {
  return {
    id: fid(over.id),
    name: over.name ?? "Folder",
    parentFolderId: over.parentFolderId ?? null,
    color: over.color,
    icon: over.icon,
    createdAt: over.createdAt ?? 1000,
    updatedAt: over.updatedAt ?? 1000,
  };
}

/**
 * Close every cached connection and delete the DB so the next openDatabase()
 * rebuilds a fresh `stirling-pdf-files` with the `folders` store. Closing is
 * essential: a lingering open connection blocks deleteDatabase() and would
 * hang the following beforeEach.
 */
async function resetDatabase(): Promise<void> {
  indexedDBManager.closeAllDatabases();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** Seed folders directly via the production replaceAll to keep state genuine. */
async function seed(folders: FolderRecord[]): Promise<void> {
  await folderStorage.replaceAll(folders);
}

function managerCache(): Map<string, IDBDatabase> {
  return (
    indexedDBManager as unknown as { databases: Map<string, IDBDatabase> }
  ).databases;
}

/**
 * Replace the manager's cached connection for `stirling-pdf-files` with a
 * caller-supplied fake handle so `folderStorage.getDatabase()` resolves to it.
 * Returns a restore() that wipes the fake back out of the cache. The fake is
 * also tracked so afterEach can purge it even if the test bailed before
 * calling restore() (otherwise closeAllDatabases() would call db.close() on a
 * handle that has no such method).
 */
let injectedFake = false;

function injectFakeDatabase(fake: IDBDatabase): () => void {
  managerCache().set(DB_NAME, fake);
  injectedFake = true;
  return () => {
    managerCache().delete(DB_NAME);
    injectedFake = false;
  };
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Purge any leaked fake handle so the next resetDatabase()'s
  // closeAllDatabases() never invokes db.close() on a handle-less fake.
  if (injectedFake) {
    managerCache().delete(DB_NAME);
    injectedFake = false;
  }
});

describe("FolderStorageService CRUD (real fake-indexeddb)", () => {
  test("replaceAll persists every folder and getAllFolders returns them", async () => {
    const folders = [
      makeFolder({ id: UUID_A, name: "Alpha" }),
      makeFolder({ id: UUID_B, name: "Beta", parentFolderId: fid(UUID_A) }),
      makeFolder({ id: UUID_C, name: "Gamma", color: "#3b82f6", icon: "star" }),
    ];
    await folderStorage.replaceAll(folders);

    const all = await folderStorage.getAllFolders();
    expect(all).toHaveLength(3);
    expect(all.map((f) => f.id).sort()).toEqual([UUID_A, UUID_B, UUID_C]);
    const beta = all.find((f) => f.id === UUID_B);
    expect(beta?.parentFolderId).toBe(UUID_A);
  });

  test("replaceAll with an empty list clears the cache (drops orphans)", async () => {
    await seed([makeFolder({ id: UUID_A }), makeFolder({ id: UUID_B })]);
    expect(await folderStorage.getAllFolders()).toHaveLength(2);

    // The server dropped everything; an empty replaceAll must clear locally.
    await folderStorage.replaceAll([]);
    expect(await folderStorage.getAllFolders()).toEqual([]);
  });

  test("replaceAll overwrites prior state rather than merging", async () => {
    await seed([makeFolder({ id: UUID_A, name: "Old" })]);
    await folderStorage.replaceAll([makeFolder({ id: UUID_B, name: "New" })]);

    const all = await folderStorage.getAllFolders();
    expect(all.map((f) => f.id)).toEqual([UUID_B]);
    expect(await folderStorage.getFolder(fid(UUID_A))).toBeNull();
  });

  test("getAllFolders returns [] on a freshly created (empty) store", async () => {
    const all = await folderStorage.getAllFolders();
    expect(all).toEqual([]);
  });

  test("upsertFolder inserts a new folder", async () => {
    await folderStorage.upsertFolder(makeFolder({ id: UUID_A, name: "Solo" }));
    const fetched = await folderStorage.getFolder(fid(UUID_A));
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Solo");
  });

  test("upsertFolder overwrites an existing folder of the same id", async () => {
    await seed([makeFolder({ id: UUID_A, name: "Before", updatedAt: 1 })]);
    await folderStorage.upsertFolder(
      makeFolder({ id: UUID_A, name: "After", updatedAt: 2 }),
    );

    const fetched = await folderStorage.getFolder(fid(UUID_A));
    expect(fetched?.name).toBe("After");
    expect(fetched?.updatedAt).toBe(2);
    // Still a single row, not a duplicate.
    expect(await folderStorage.getAllFolders()).toHaveLength(1);
  });

  test("getFolder returns null for a missing id (miss branch)", async () => {
    await seed([makeFolder({ id: UUID_A })]);
    expect(await folderStorage.getFolder(fid(UUID_B))).toBeNull();
  });

  test("removeFolders deletes the named ids and leaves the rest", async () => {
    await seed([
      makeFolder({ id: UUID_A, name: "Keep" }),
      makeFolder({ id: UUID_B, name: "Drop1" }),
      makeFolder({ id: UUID_C, name: "Drop2" }),
    ]);

    await folderStorage.removeFolders([fid(UUID_B), fid(UUID_C)]);

    const all = await folderStorage.getAllFolders();
    expect(all.map((f) => f.id)).toEqual([UUID_A]);
  });

  test("removeFolders is a no-op for an empty id list (early return)", async () => {
    await seed([makeFolder({ id: UUID_A })]);
    // Should resolve without touching the DB at all.
    await expect(folderStorage.removeFolders([])).resolves.toBeUndefined();
    expect(await folderStorage.getAllFolders()).toHaveLength(1);
  });

  test("removeFolders tolerates ids that are not present", async () => {
    await seed([makeFolder({ id: UUID_A })]);
    await expect(
      folderStorage.removeFolders([fid(UUID_B)]),
    ).resolves.toBeUndefined();
    expect(await folderStorage.getAllFolders()).toHaveLength(1);
  });

  test("clearAll empties the store", async () => {
    await seed([makeFolder({ id: UUID_A }), makeFolder({ id: UUID_B })]);
    await expect(folderStorage.clearAll()).resolves.toBeUndefined();
    expect(await folderStorage.getAllFolders()).toEqual([]);
  });
});

/**
 * Fake-handle helpers for the error / abort branches.
 *
 * A `readwrite` transaction in this module resolves on `oncomplete` and rejects
 * on `onerror` / `onabort`. `readonly` reads resolve/reject on the request's
 * onsuccess/onerror. We build minimal fakes that fire the chosen callback on a
 * microtask AFTER the production code has wired its handlers.
 */

type Handler = (() => void) | null;

/**
 * A request stub that fires `onerror` the moment the production code assigns
 * its handler. Using a setter (rather than a pre-scheduled microtask) avoids a
 * race: `getDatabase()` is async, so handlers are wired a tick AFTER the fake
 * is built, and a microtask scheduled at build time would fire into nulls.
 */
function makeErrorRequest(error: Error): IDBRequest {
  let onerror: Handler = null;
  const req = {
    onsuccess: null as Handler,
    error,
    result: undefined as unknown,
    get onerror() {
      return onerror;
    },
    set onerror(h: Handler) {
      onerror = h;
      if (h) queueMicrotask(() => h());
    },
  };
  return req as unknown as IDBRequest;
}

/**
 * Build a fake DB whose readwrite transaction fires the given lifecycle event
 * ("error" or "abort") once the production code attaches that handler.
 * `txError` controls whether `transaction.error` is populated (covers both
 * sides of the `transaction.error ?? new Error(...)` fallback).
 */
function makeTxLifecycleDb(
  fire: "error" | "abort",
  txError: DOMException | Error | null,
): IDBDatabase {
  const noopRequest = () =>
    ({ onsuccess: null, onerror: null }) as unknown as IDBRequest;
  const store = {
    clear: noopRequest,
    put: noopRequest,
    delete: noopRequest,
  };
  let handler: Handler = null;
  const transaction = {
    error: txError,
    oncomplete: null as Handler,
    objectStore: () => store,
    get onerror() {
      return fire === "error" ? handler : null;
    },
    set onerror(h: Handler) {
      if (fire === "error") {
        handler = h;
        if (h) queueMicrotask(() => h());
      }
    },
    get onabort() {
      return fire === "abort" ? handler : null;
    },
    set onabort(h: Handler) {
      if (fire === "abort") {
        handler = h;
        if (h) queueMicrotask(() => h());
      }
    },
  };
  return {
    transaction: () => transaction,
  } as unknown as IDBDatabase;
}

/**
 * Build a fake DB whose single request (named by `kind`) fires onerror with a
 * populated `request.error`. Used for upsertFolder.put, getAllFolders.getAll,
 * getFolder.get and clearAll.clear request-level rejections.
 */
function makeRequestErrorDb(
  kind: "put" | "getAll" | "get" | "clear",
): IDBDatabase {
  const make = () => makeErrorRequest(new Error(`${kind} boom`));
  const store: Record<string, unknown> = {
    put: make,
    getAll: make,
    get: make,
    clear: make,
  };
  const transaction = {
    objectStore: () => store,
  };
  return {
    transaction: () => transaction,
  } as unknown as IDBDatabase;
}

describe("FolderStorageService error and rejection paths", () => {
  test("replaceAll rejects with transaction.error on transaction error", async () => {
    const boom = new Error("tx exploded");
    const restore = injectFakeDatabase(makeTxLifecycleDb("error", boom));
    try {
      await expect(
        folderStorage.replaceAll([makeFolder({ id: UUID_A })]),
      ).rejects.toThrow("tx exploded");
    } finally {
      restore();
    }
  });

  test("replaceAll rejects with the fallback Error when transaction.error is null", async () => {
    const restore = injectFakeDatabase(makeTxLifecycleDb("error", null));
    try {
      await expect(folderStorage.replaceAll([])).rejects.toThrow(
        "folder cache replace failed",
      );
    } finally {
      restore();
    }
  });

  test("replaceAll rejects with the fallback Error on abort (no tx error)", async () => {
    const restore = injectFakeDatabase(makeTxLifecycleDb("abort", null));
    try {
      await expect(folderStorage.replaceAll([])).rejects.toThrow(
        "folder cache replace aborted",
      );
    } finally {
      restore();
    }
  });

  test("removeFolders rejects with transaction.error on transaction error", async () => {
    const boom = new Error("delete tx exploded");
    const restore = injectFakeDatabase(makeTxLifecycleDb("error", boom));
    try {
      await expect(folderStorage.removeFolders([fid(UUID_A)])).rejects.toThrow(
        "delete tx exploded",
      );
    } finally {
      restore();
    }
  });

  test("removeFolders rejects with the fallback Error when transaction.error is null", async () => {
    const restore = injectFakeDatabase(makeTxLifecycleDb("error", null));
    try {
      await expect(folderStorage.removeFolders([fid(UUID_A)])).rejects.toThrow(
        "folder cache delete failed",
      );
    } finally {
      restore();
    }
  });

  test("removeFolders rejects with the fallback Error on abort", async () => {
    const restore = injectFakeDatabase(makeTxLifecycleDb("abort", null));
    try {
      await expect(folderStorage.removeFolders([fid(UUID_A)])).rejects.toThrow(
        "folder cache delete aborted",
      );
    } finally {
      restore();
    }
  });

  test("upsertFolder rejects when the put request errors", async () => {
    const restore = injectFakeDatabase(makeRequestErrorDb("put"));
    try {
      await expect(
        folderStorage.upsertFolder(makeFolder({ id: UUID_A })),
      ).rejects.toThrow("put boom");
    } finally {
      restore();
    }
  });

  test("getAllFolders rejects when the getAll request errors", async () => {
    const restore = injectFakeDatabase(makeRequestErrorDb("getAll"));
    try {
      await expect(folderStorage.getAllFolders()).rejects.toThrow(
        "getAll boom",
      );
    } finally {
      restore();
    }
  });

  test("getFolder rejects when the get request errors", async () => {
    const restore = injectFakeDatabase(makeRequestErrorDb("get"));
    try {
      await expect(folderStorage.getFolder(fid(UUID_A))).rejects.toThrow(
        "get boom",
      );
    } finally {
      restore();
    }
  });

  test("clearAll rejects when the clear request errors", async () => {
    const restore = injectFakeDatabase(makeRequestErrorDb("clear"));
    try {
      await expect(folderStorage.clearAll()).rejects.toThrow("clear boom");
    } finally {
      restore();
    }
  });

  test("getAllFolders falls back to [] when request.result is null/undefined", async () => {
    // result left undefined -> exercises the `(request.result ?? []) ` branch.
    let onsuccess: Handler = null;
    const req = {
      onerror: null as Handler,
      result: undefined as unknown,
      get onsuccess() {
        return onsuccess;
      },
      set onsuccess(h: Handler) {
        onsuccess = h;
        if (h) queueMicrotask(() => h());
      },
    };
    const store = { getAll: () => req as unknown as IDBRequest };
    const fake = {
      transaction: () => ({ objectStore: () => store }),
    } as unknown as IDBDatabase;
    const restore = injectFakeDatabase(fake);
    try {
      await expect(folderStorage.getAllFolders()).resolves.toEqual([]);
    } finally {
      restore();
    }
  });
});
