import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SavedSignature } from "@app/types/signature";
import { signatureStorageService } from "@app/services/signatureStorageService";

const STORAGE_KEY = "stirling:saved-signatures:v1";

// Minimal valid SavedSignature factory. The service treats entries opaquely
// apart from id/label/updatedAt/scope, so a canvas-type payload is sufficient.
function makeSignature(
  overrides: Partial<SavedSignature> = {},
): SavedSignature {
  return {
    type: "canvas",
    dataUrl: "data:image/png;base64,AAAA",
    id: "sig-1",
    label: "My Signature",
    scope: "personal",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  } as SavedSignature;
}

// Read the raw persisted array straight out of localStorage so assertions can
// inspect exactly what the service wrote (order, scope coercion, etc.).
function readStored(): SavedSignature[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as SavedSignature[]) : [];
}

describe("signatureStorageService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("detectCapabilities / getStorageType", () => {
    it("returns localStorage capabilities and logs on first detection", async () => {
      // Fresh module instance so the per-instance cache starts empty and the
      // console.log + assignment branch executes.
      vi.resetModules();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { signatureStorageService: fresh } =
        await import("@app/services/signatureStorageService");

      const caps = await fresh.detectCapabilities();

      expect(caps).toEqual({
        supportsBackend: false,
        storageType: "localStorage",
      });
      expect(logSpy).toHaveBeenCalledWith(
        "[SignatureStorage] SaaS mode - using localStorage (backend not available)",
      );
    });

    it("caches capabilities so the second call short-circuits without logging", async () => {
      vi.resetModules();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { signatureStorageService: fresh } =
        await import("@app/services/signatureStorageService");

      const first = await fresh.detectCapabilities();
      const second = await fresh.detectCapabilities();

      expect(second).toBe(first); // identical cached object reference
      expect(logSpy).toHaveBeenCalledTimes(1); // only the first call logged
    });

    it("getStorageType resolves to 'localStorage'", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const type = await signatureStorageService.getStorageType();
      expect(type).toBe("localStorage");
    });
  });

  describe("loadSignatures", () => {
    it("returns an empty array when nothing is stored", async () => {
      const result = await signatureStorageService.loadSignatures();
      expect(result).toEqual([]);
    });

    it("loads stored signatures and coerces every scope to localStorage", async () => {
      const stored = [
        makeSignature({ id: "a", scope: "personal" }),
        makeSignature({ id: "b", scope: "shared" }),
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      const result = await signatureStorageService.loadSignatures();

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.id)).toEqual(["a", "b"]);
      expect(result.every((s) => s.scope === "localStorage")).toBe(true);
    });

    it("returns an empty array when the stored JSON is corrupt (parse guard)", async () => {
      localStorage.setItem(STORAGE_KEY, "{not valid json");
      const result = await signatureStorageService.loadSignatures();
      expect(result).toEqual([]);
    });

    it("returns an empty array when the stored value is non-array (map throws -> caught)", async () => {
      // JSON.parse succeeds but the result has no .map, so the catch path runs.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
      const result = await signatureStorageService.loadSignatures();
      expect(result).toEqual([]);
    });
  });

  describe("saveSignature", () => {
    it("inserts a new signature at the front and forces localStorage scope", async () => {
      const existing = makeSignature({ id: "old", scope: "localStorage" });
      localStorage.setItem(STORAGE_KEY, JSON.stringify([existing]));

      const incoming = makeSignature({ id: "new", scope: "shared" });
      await signatureStorageService.saveSignature(incoming);

      // saveSignature mutates the passed object's scope.
      expect(incoming.scope).toBe("localStorage");

      const stored = readStored();
      expect(stored.map((s) => s.id)).toEqual(["new", "old"]); // unshifted to front
      expect(stored[0].scope).toBe("localStorage");
    });

    it("replaces an existing signature in place when ids match", async () => {
      const original = makeSignature({ id: "dup", label: "Original" });
      localStorage.setItem(STORAGE_KEY, JSON.stringify([original]));

      const updated = makeSignature({ id: "dup", label: "Updated" });
      await signatureStorageService.saveSignature(updated);

      const stored = readStored();
      expect(stored).toHaveLength(1); // replaced, not appended
      expect(stored[0].label).toBe("Updated");
    });

    it("saves into an empty store", async () => {
      await signatureStorageService.saveSignature(
        makeSignature({ id: "first" }),
      );
      expect(readStored().map((s) => s.id)).toEqual(["first"]);
    });
  });

  describe("deleteSignature", () => {
    it("removes the matching signature and keeps the rest", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          makeSignature({ id: "keep" }),
          makeSignature({ id: "drop" }),
        ]),
      );

      await signatureStorageService.deleteSignature("drop");

      expect(readStored().map((s) => s.id)).toEqual(["keep"]);
    });

    it("is a no-op (rewrites the same set) when the id is absent", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([makeSignature({ id: "keep" })]),
      );

      await signatureStorageService.deleteSignature("missing");

      expect(readStored().map((s) => s.id)).toEqual(["keep"]);
    });
  });

  describe("updateSignatureLabel", () => {
    it("updates the label and bumps updatedAt when the signature exists", async () => {
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(987654321);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          makeSignature({ id: "x", label: "Before", updatedAt: 1 }),
        ]),
      );

      await signatureStorageService.updateSignatureLabel("x", "After");

      const stored = readStored();
      expect(stored[0].label).toBe("After");
      expect(stored[0].updatedAt).toBe(987654321);
      expect(nowSpy).toHaveBeenCalled();
    });

    it("does not persist any change when the id is not found", async () => {
      const serialized = JSON.stringify([
        makeSignature({ id: "x", label: "Stay" }),
      ]);
      localStorage.setItem(STORAGE_KEY, serialized);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");

      await signatureStorageService.updateSignatureLabel("nope", "Changed");

      // The not-found branch skips the setItem call entirely.
      expect(setSpy).not.toHaveBeenCalled();
      expect(readStored()[0].label).toBe("Stay");
    });
  });

  describe("migrateToBackend", () => {
    it("is a no-op returning zero counts in SaaS mode", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const result = await signatureStorageService.migrateToBackend();
      expect(result).toEqual({ migrated: 0, failed: 0 });
      expect(logSpy).toHaveBeenCalledWith(
        "[SignatureStorage] Migration not supported in SaaS mode",
      );
    });
  });

  describe("cleanup", () => {
    it("revokes and clears any tracked blob URLs", async () => {
      vi.resetModules();
      const { signatureStorageService: fresh } =
        await import("@app/services/signatureStorageService");
      // Seed the private blobUrls set so the forEach -> revokeObjectURL line runs.
      const seeded = fresh as unknown as { blobUrls: Set<string> };
      seeded.blobUrls.add("blob:one");
      seeded.blobUrls.add("blob:two");

      const revokeSpy = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});

      fresh.cleanup();

      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(revokeSpy).toHaveBeenCalledWith("blob:one");
      expect(revokeSpy).toHaveBeenCalledWith("blob:two");
      expect(seeded.blobUrls.size).toBe(0);
    });

    it("loadSignatures invokes cleanup (no-op with an empty blob set)", async () => {
      const revokeSpy = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      await signatureStorageService.loadSignatures();
      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });
});
