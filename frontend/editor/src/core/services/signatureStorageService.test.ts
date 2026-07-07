import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SavedSignature } from "@app/types/signature";

/**
 * Unit tests for signatureStorageService.
 *
 * The module is a singleton that caches a one-shot capability detection, so we
 * re-import a *fresh* instance per test via vi.resetModules() + dynamic import.
 * That keeps every test deterministic and lets us exercise both the
 * supportsBackend=true and supportsBackend=false branches independently.
 *
 * The only external collaborator is the axios-style apiClient (default export),
 * which is fully mocked — we never touch the network. localStorage, Blob, and
 * FileReader are provided by the jsdom test environment.
 */

// Stable apiClient mock: re-import the same object across resetModules so the
// service-under-test and the test file share one set of vi.fn() spies. Built
// via vi.hoisted() because the vi.mock factory is hoisted above all imports.
const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({
  default: mockApi,
}));

const SIGNATURES_URL = "/api/v1/proprietary/signatures";
const STORAGE_KEY = "stirling:saved-signatures:v1";

type Service =
  typeof import("@app/services/signatureStorageService").signatureStorageService;

/** Re-import a pristine singleton (capabilities cache reset). */
async function freshService(): Promise<Service> {
  vi.resetModules();
  const mod = await import("@app/services/signatureStorageService");
  return mod.signatureStorageService;
}

/** A minimal canvas SavedSignature with overridable fields. */
function makeSignature(
  overrides: Partial<SavedSignature> = {},
): SavedSignature {
  return {
    id: "sig-1",
    label: "My Signature",
    type: "canvas",
    dataUrl: "data:image/png;base64,AAAA",
    scope: "personal",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as SavedSignature;
}

/** Build an axios-like error carrying an HTTP status code. */
function httpError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & {
    response: { status: number };
  };
  err.response = { status };
  return err;
}

beforeEach(() => {
  localStorage.clear();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.delete.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("detectCapabilities", () => {
  test("returns backend support when the probe succeeds (200)", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    const service = await freshService();

    const caps = await service.detectCapabilities();

    expect(caps).toEqual({ supportsBackend: true, storageType: "backend" });
    expect(mockApi.get).toHaveBeenCalledWith(SIGNATURES_URL, {
      timeout: 3000,
      suppressErrorToast: true,
    });
    expect(await service.getStorageType()).toBe("backend");
  });

  test("caches the result and probes the backend only once", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    const service = await freshService();

    const first = await service.detectCapabilities();
    const second = await service.detectCapabilities();

    expect(first).toBe(second);
    expect(mockApi.get).toHaveBeenCalledTimes(1);
  });

  test("dedupes concurrent in-flight detection into a single probe", async () => {
    let resolveProbe: (value: { data: unknown }) => void = () => {};
    mockApi.get.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );
    const service = await freshService();

    const a = service.detectCapabilities();
    const b = service.detectCapabilities();
    resolveProbe({ data: [] });
    const [resA, resB] = await Promise.all([a, b]);

    expect(resA).toEqual(resB);
    // Both callers shared the single in-flight detection promise.
    expect(mockApi.get).toHaveBeenCalledTimes(1);
  });

  test("falls back to localStorage on 401 (auth required)", async () => {
    mockApi.get.mockRejectedValue(httpError(401));
    const service = await freshService();

    const caps = await service.detectCapabilities();

    expect(caps).toEqual({
      supportsBackend: false,
      storageType: "localStorage",
    });
  });

  test("falls back to localStorage on 403 (forbidden)", async () => {
    mockApi.get.mockRejectedValue(httpError(403));
    const service = await freshService();

    expect((await service.detectCapabilities()).supportsBackend).toBe(false);
  });

  test("falls back to localStorage on 404 (not proprietary mode)", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    expect(await service.getStorageType()).toBe("localStorage");
  });

  test("falls back to localStorage on a network error (no response)", async () => {
    mockApi.get.mockRejectedValue(new Error("Network down"));
    const service = await freshService();

    expect((await service.detectCapabilities()).supportsBackend).toBe(false);
  });
});

describe("loadSignatures (backend)", () => {
  test("returns signatures unchanged when no dataUrl needs fetching", async () => {
    const sig = makeSignature({ dataUrl: "data:image/png;base64,XYZ" });
    mockApi.get.mockImplementation(
      (url: string, opts?: { responseType?: string }) => {
        if (url === SIGNATURES_URL && opts?.responseType !== "arraybuffer") {
          return Promise.resolve({ data: [sig] });
        }
        return Promise.reject(new Error(`unexpected GET ${url}`));
      },
    );
    const service = await freshService();

    const result = await service.loadSignatures();

    expect(result).toEqual([sig]);
    // The probe + the list fetch; never an image fetch.
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });

  test("fetches and converts an image dataUrl to a base64 data URL", async () => {
    const imagePath = "/api/v1/general/signatures/sig-1/image";
    const sig = makeSignature({ dataUrl: imagePath });
    mockApi.get.mockImplementation(
      (url: string, opts?: { responseType?: string }) => {
        if (url === imagePath && opts?.responseType === "arraybuffer") {
          return Promise.resolve({
            data: new Uint8Array([1, 2, 3]).buffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        // The probe AND the list fetch both target SIGNATURES_URL; both return
        // the signature list (the probe ignores the body).
        if (url === SIGNATURES_URL) return Promise.resolve({ data: [sig] });
        return Promise.reject(new Error(`unexpected GET ${url}`));
      },
    );
    const service = await freshService();

    const result = await service.loadSignatures();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sig-1");
    // FileReader.readAsDataURL produced a base64 data URL (jpeg per header).
    expect(result[0].dataUrl.startsWith("data:")).toBe(true);
  });

  test("falls back to a default content-type when the header is missing", async () => {
    const imagePath = "/api/v1/general/signatures/sig-1/image";
    const sig = makeSignature({ dataUrl: imagePath });
    mockApi.get.mockImplementation(
      (url: string, opts?: { responseType?: string }) => {
        if (url === imagePath && opts?.responseType === "arraybuffer") {
          return Promise.resolve({
            data: new Uint8Array([9, 9]).buffer,
            headers: {},
          });
        }
        if (url === SIGNATURES_URL) return Promise.resolve({ data: [sig] });
        return Promise.reject(new Error(`unexpected GET ${url}`));
      },
    );
    const service = await freshService();

    const result = await service.loadSignatures();

    expect(result[0].dataUrl.startsWith("data:")).toBe(true);
  });

  test("returns the original signature when the image fetch fails", async () => {
    const imagePath = "/api/v1/general/signatures/sig-1/image";
    const sig = makeSignature({ dataUrl: imagePath });
    mockApi.get.mockImplementation(
      (url: string, opts?: { responseType?: string }) => {
        if (url === imagePath && opts?.responseType === "arraybuffer") {
          return Promise.reject(new Error("image 500"));
        }
        if (url === SIGNATURES_URL) return Promise.resolve({ data: [sig] });
        return Promise.reject(new Error(`unexpected GET ${url}`));
      },
    );
    const service = await freshService();

    const result = await service.loadSignatures();

    // The per-signature catch returns the unmodified stub (still the API path).
    expect(result).toEqual([sig]);
  });

  test("returns [] when the list request rejects", async () => {
    let call = 0;
    mockApi.get.mockImplementation(() => {
      call += 1;
      // First call = capability probe (succeeds). Second = list load (fails).
      if (call === 1) return Promise.resolve({ data: [] });
      return Promise.reject(new Error("list 500"));
    });
    const service = await freshService();

    const result = await service.loadSignatures();

    expect(result).toEqual([]);
  });
});

describe("loadSignatures (localStorage)", () => {
  test("returns [] when nothing is stored", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    expect(await service.loadSignatures()).toEqual([]);
  });

  test("parses stored signatures and forces scope to localStorage", async () => {
    const stored = makeSignature({ id: "a", scope: "personal" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([stored]));
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    const result = await service.loadSignatures();

    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("localStorage");
  });

  test("returns [] when the stored JSON is corrupt", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    expect(await service.loadSignatures()).toEqual([]);
  });
});

describe("saveSignature", () => {
  test("POSTs to the backend when supported and scope is not localStorage", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockResolvedValue({ data: {} });
    const service = await freshService();

    const sig = makeSignature({ scope: "personal" });
    await service.saveSignature(sig);

    expect(mockApi.post).toHaveBeenCalledWith(SIGNATURES_URL, sig);
  });

  test("saves to localStorage (and forces scope) when scope is localStorage even with backend", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    const service = await freshService();

    const sig = makeSignature({ id: "ls-1", scope: "localStorage" });
    await service.saveSignature(sig);

    expect(mockApi.post).not.toHaveBeenCalled();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw[0].id).toBe("ls-1");
    expect(sig.scope).toBe("localStorage");
  });

  test("saves to localStorage and forces scope when backend unsupported", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    const sig = makeSignature({ id: "ls-2", scope: "personal" });
    await service.saveSignature(sig);

    expect(sig.scope).toBe("localStorage");
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw).toHaveLength(1);
    expect(raw[0].id).toBe("ls-2");
  });

  test("updates an existing localStorage entry in place (findIndex >= 0 branch)", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    await service.saveSignature(makeSignature({ id: "dup", label: "first" }));
    await service.saveSignature(makeSignature({ id: "dup", label: "second" }));

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw).toHaveLength(1);
    expect(raw[0].label).toBe("second");
  });

  test("prepends new localStorage entries (unshift branch)", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    await service.saveSignature(makeSignature({ id: "first" }));
    await service.saveSignature(makeSignature({ id: "second" }));

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw.map((s: SavedSignature) => s.id)).toEqual(["second", "first"]);
  });
});

describe("deleteSignature", () => {
  test("DELETEs against the backend when supported", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.delete.mockResolvedValue({ data: {} });
    const service = await freshService();

    await service.deleteSignature("sig-1");

    expect(mockApi.delete).toHaveBeenCalledWith(`${SIGNATURES_URL}/sig-1`);
  });

  test("removes the matching entry from localStorage when unsupported", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeSignature({ id: "keep" }),
        makeSignature({ id: "drop" }),
      ]),
    );
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    await service.deleteSignature("drop");

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw.map((s: SavedSignature) => s.id)).toEqual(["keep"]);
    expect(mockApi.delete).not.toHaveBeenCalled();
  });
});

describe("updateSignatureLabel", () => {
  test("POSTs the new label to the backend when supported", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockResolvedValue({ data: {} });
    const service = await freshService();

    await service.updateSignatureLabel("sig-1", "Renamed");

    expect(mockApi.post).toHaveBeenCalledWith(`${SIGNATURES_URL}/sig-1/label`, {
      label: "Renamed",
    });
  });

  test("updates the label and updatedAt in localStorage when found", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeSignature({ id: "x", label: "old", updatedAt: 1 })]),
    );
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    await service.updateSignatureLabel("x", "new");

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw[0].label).toBe("new");
    expect(raw[0].updatedAt).toBeGreaterThan(1);
  });

  test("is a no-op in localStorage when the id is not found", async () => {
    const stored = [makeSignature({ id: "present", label: "keep" })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    await service.updateSignatureLabel("absent", "ignored");

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(raw[0].label).toBe("keep");
  });
});

describe("migrateToBackend", () => {
  test("returns zeros when the backend is unsupported", async () => {
    mockApi.get.mockRejectedValue(httpError(404));
    const service = await freshService();

    expect(await service.migrateToBackend()).toEqual({
      migrated: 0,
      failed: 0,
    });
  });

  test("returns zeros when there are no local signatures to migrate", async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    const service = await freshService();

    expect(await service.migrateToBackend()).toEqual({
      migrated: 0,
      failed: 0,
    });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  test("migrates all local signatures and clears localStorage on full success", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeSignature({ id: "m1" }),
        makeSignature({ id: "m2" }),
      ]),
    );
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockResolvedValue({ data: {} });
    const service = await freshService();

    const result = await service.migrateToBackend();

    expect(result).toEqual({ migrated: 2, failed: 0 });
    expect(mockApi.post).toHaveBeenCalledTimes(2);
    // localStorage cleared after a clean migration.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("counts failures and keeps localStorage intact on partial failure", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        makeSignature({ id: "ok" }),
        makeSignature({ id: "bad" }),
      ]),
    );
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error("save failed"));
    const service = await freshService();

    const result = await service.migrateToBackend();

    expect(result).toEqual({ migrated: 1, failed: 1 });
    // failed > 0 -> localStorage is NOT cleared.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
