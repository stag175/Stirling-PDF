import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase mock. The avatarSyncService imports the singleton `supabase` client
// from @app/auth/supabase (which otherwise throws at import time because it
// requires VITE_SUPABASE_* env vars). We replace it with a fully-stubbed
// builder whose terminal methods are vi.fns we control per-test.
// vi.hoisted lets these fns exist before the hoisted vi.mock factory runs.
// ---------------------------------------------------------------------------
const {
  storageUpload,
  storageFrom,
  tableUpsert,
  tableMaybeSingle,
  tableEq,
  tableSelect,
  tableFrom,
} = vi.hoisted(() => {
  const storageUpload = vi.fn();
  const tableUpsert = vi.fn();
  const tableMaybeSingle = vi.fn();
  // eq() returns an object exposing maybeSingle(); select() returns { eq };
  const tableEq = vi.fn(() => ({ maybeSingle: tableMaybeSingle }));
  const tableSelect = vi.fn(() => ({ eq: tableEq }));
  const storageFrom = vi.fn(() => ({ upload: storageUpload }));
  // from() is used for BOTH `.storage.from()` and the top-level `.from()` table
  // builder. The table builder needs select() and upsert().
  const tableFrom = vi.fn(() => ({
    select: tableSelect,
    upsert: tableUpsert,
  }));
  return {
    storageUpload,
    storageFrom,
    tableUpsert,
    tableMaybeSingle,
    tableEq,
    tableSelect,
    tableFrom,
  };
});

vi.mock("@app/auth/supabase", () => ({
  supabase: {
    storage: { from: storageFrom },
    from: tableFrom,
  },
}));

import {
  getProviderAvatarUrl,
  downloadAndOptimizeAvatar,
  uploadAvatarToStorage,
  getProfilePictureMetadata,
  updateProfilePictureMetadata,
  syncOAuthAvatar,
} from "@app/services/avatarSyncService";

// ---------------------------------------------------------------------------
// Test helpers.
// ---------------------------------------------------------------------------

/** Build a minimal Supabase User with the metadata the service inspects. */
function makeUser(overrides: {
  id?: string;
  provider?: string | null;
  userMetadata?: Record<string, unknown> | null;
  email?: string;
}): User {
  const {
    id = "user-1",
    provider,
    userMetadata,
    email = "u@x.com",
  } = overrides;
  return {
    id,
    email,
    app_metadata: provider === undefined ? {} : { provider },
    user_metadata:
      userMetadata === undefined ? {} : (userMetadata as Record<string, never>),
  } as unknown as User;
}

/**
 * Install a deterministic stub for the browser canvas/image pipeline used by
 * downloadAndOptimizeAvatar. The canvas path is fully stubbed so no real
 * rendering happens. `toBlobResult` controls what canvas.toBlob hands back.
 */
function stubCanvasPipeline(options?: {
  blobSize?: number;
  toBlobResult?: Blob | null;
  lowerQualityResult?: Blob | null;
  noContext?: boolean;
  bitmapDims?: { width: number; height: number };
}) {
  const {
    blobSize = 100,
    noContext = false,
    bitmapDims = { width: 512, height: 256 },
  } = options ?? {};

  const drawImage = vi.fn();
  const getContext = vi.fn(() => (noContext ? null : { drawImage }));

  // toBlob is called once (0.9 quality). If the optimized blob is over the max
  // size it is called a second time at 0.7 quality. We track invocations to
  // serve the right canned result for each call.
  let toBlobCall = 0;
  const primaryBlob =
    options && "toBlobResult" in options
      ? options.toBlobResult
      : ({ size: blobSize, type: "image/png" } as Blob);
  const secondaryBlob =
    options && "lowerQualityResult" in options
      ? options.lowerQualityResult
      : ({ size: 10, type: "image/png" } as Blob);

  const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
    toBlobCall += 1;
    cb(
      toBlobCall === 1
        ? (primaryBlob as Blob | null)
        : (secondaryBlob as Blob | null),
    );
  });

  const canvas = {
    width: 0,
    height: 0,
    getContext,
    toBlob,
  } as unknown as HTMLCanvasElement;

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas;
    }
    return {} as HTMLElement;
  });

  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: bitmapDims.width,
      height: bitmapDims.height,
      close: vi.fn(),
    })),
  );

  return { drawImage, getContext, toBlob, canvas };
}

/** Stub global fetch to resolve with a successful image response. */
function stubFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => ({ size: 999, type: "image/jpeg" }) as Blob,
    })),
  );
}

describe("avatarSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path supabase terminal resolutions.
    storageUpload.mockResolvedValue({ error: null });
    tableUpsert.mockResolvedValue({ error: null });
    tableMaybeSingle.mockResolvedValue({ data: null, error: null });
    // Silence the service's heavy console.debug/console.error chatter so the
    // test output stays readable; we still assert behaviour, not logs.
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // getProviderAvatarUrl
  // -------------------------------------------------------------------------
  describe("getProviderAvatarUrl", () => {
    it("returns the picture field for google", () => {
      const user = makeUser({
        provider: "google",
        userMetadata: { picture: "https://g/p.png" },
      });
      expect(getProviderAvatarUrl(user)).toBe("https://g/p.png");
    });

    it("returns the picture field for azure", () => {
      const user = makeUser({
        provider: "azure",
        userMetadata: { picture: "https://a/p.png" },
      });
      expect(getProviderAvatarUrl(user)).toBe("https://a/p.png");
    });

    it("returns the avatar_url field for github", () => {
      const user = makeUser({
        provider: "github",
        userMetadata: { avatar_url: "https://gh/a.png" },
      });
      expect(getProviderAvatarUrl(user)).toBe("https://gh/a.png");
    });

    it("returns null for apple (no OAuth picture)", () => {
      const user = makeUser({
        provider: "apple",
        userMetadata: { picture: "ignored" },
      });
      expect(getProviderAvatarUrl(user)).toBeNull();
    });

    it("returns null for an unknown provider (default branch)", () => {
      const user = makeUser({
        provider: "facebook",
        userMetadata: { picture: "x" },
      });
      expect(getProviderAvatarUrl(user)).toBeNull();
    });

    it("returns null when provider is missing", () => {
      const user = makeUser({
        provider: null,
        userMetadata: { picture: "x" },
      });
      expect(getProviderAvatarUrl(user)).toBeNull();
    });

    it("returns null when user_metadata is missing", () => {
      const user = makeUser({ provider: "google", userMetadata: null });
      expect(getProviderAvatarUrl(user)).toBeNull();
    });

    it("returns null when google metadata has no picture field", () => {
      const user = makeUser({ provider: "google", userMetadata: {} });
      expect(getProviderAvatarUrl(user)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // downloadAndOptimizeAvatar
  // -------------------------------------------------------------------------
  describe("downloadAndOptimizeAvatar", () => {
    it("downloads, scales onto a 256x256 canvas, and resolves the optimized blob", async () => {
      stubFetchOk();
      const { drawImage, toBlob, canvas } = stubCanvasPipeline({
        blobSize: 100,
      });

      const result = await downloadAndOptimizeAvatar("https://img/x.png");

      expect(result).toEqual({ size: 100, type: "image/png" });
      expect(canvas.width).toBe(256);
      expect(canvas.height).toBe(256);
      expect(drawImage).toHaveBeenCalledTimes(1);
      // 512x256 bitmap -> scale 0.5 -> centered vertically (x=0, y=64).
      const [, x, y, w, h] = drawImage.mock.calls[0];
      expect(x).toBe(0);
      expect(y).toBe(64);
      expect(w).toBe(256);
      expect(h).toBe(128);
      expect(toBlob).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith("https://img/x.png", {
        mode: "cors",
        credentials: "omit",
      });
    });

    it("re-encodes at lower quality when the optimized blob exceeds the max size", async () => {
      stubFetchOk();
      const { toBlob } = stubCanvasPipeline({
        blobSize: 600 * 1024, // > 500KB max
        lowerQualityResult: { size: 42, type: "image/png" } as Blob,
      });

      const result = await downloadAndOptimizeAvatar("https://img/big.png");

      expect(result).toEqual({ size: 42, type: "image/png" });
      expect(toBlob).toHaveBeenCalledTimes(2);
    });

    it("rejects when the lower-quality re-encode also fails", async () => {
      stubFetchOk();
      stubCanvasPipeline({
        blobSize: 600 * 1024,
        lowerQualityResult: null,
      });

      await expect(
        downloadAndOptimizeAvatar("https://img/big.png"),
      ).rejects.toThrow("Failed to create lower quality blob");
    });

    it("rejects when the primary toBlob produces no blob", async () => {
      stubFetchOk();
      stubCanvasPipeline({ toBlobResult: null });

      await expect(
        downloadAndOptimizeAvatar("https://img/x.png"),
      ).rejects.toThrow("Failed to create optimized blob");
    });

    it("throws when the canvas 2d context is unavailable", async () => {
      stubFetchOk();
      stubCanvasPipeline({ noContext: true });

      await expect(
        downloadAndOptimizeAvatar("https://img/x.png"),
      ).rejects.toThrow("Failed to get canvas context");
    });

    it("throws a descriptive error when the fetch response is not ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
          blob: async () => ({}) as Blob,
        })),
      );

      await expect(
        downloadAndOptimizeAvatar("https://img/missing.png"),
      ).rejects.toThrow("Failed to download avatar: 404 Not Found");
    });

    it("propagates a network/fetch rejection", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        }),
      );

      await expect(
        downloadAndOptimizeAvatar("https://img/x.png"),
      ).rejects.toThrow("network down");
    });
  });

  // -------------------------------------------------------------------------
  // uploadAvatarToStorage
  // -------------------------------------------------------------------------
  describe("uploadAvatarToStorage", () => {
    it("uploads the blob to the user's avatar path with upsert options", async () => {
      const blob = { size: 5, type: "image/png" } as Blob;

      await uploadAvatarToStorage("user-7", blob);

      expect(storageFrom).toHaveBeenCalledWith("profile-pictures");
      expect(storageUpload).toHaveBeenCalledWith("user-7/avatar", blob, {
        upsert: true,
        contentType: "image/png",
        cacheControl: "3600",
      });
    });

    it("throws when the storage upload returns an error", async () => {
      storageUpload.mockResolvedValue({ error: new Error("storage boom") });

      await expect(uploadAvatarToStorage("user-7", {} as Blob)).rejects.toThrow(
        "storage boom",
      );
    });
  });

  // -------------------------------------------------------------------------
  // getProfilePictureMetadata
  // -------------------------------------------------------------------------
  describe("getProfilePictureMetadata", () => {
    it("returns the metadata row on success", async () => {
      const row = {
        user_id: "user-1",
        source: "oauth",
        provider: "google",
        last_synced_at: null,
        created_at: "c",
        updated_at: "u",
      };
      tableMaybeSingle.mockResolvedValue({ data: row, error: null });

      const result = await getProfilePictureMetadata("user-1");

      expect(result).toBe(row);
      expect(tableFrom).toHaveBeenCalledWith("profile_picture_metadata");
      expect(tableSelect).toHaveBeenCalledWith("*");
      expect(tableEq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("returns null and swallows the PGRST116 (table missing) error", async () => {
      tableMaybeSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "x" },
      });

      expect(await getProfilePictureMetadata("user-1")).toBeNull();
    });

    it("returns null when the error message says the relation does not exist", async () => {
      tableMaybeSingle.mockResolvedValue({
        data: null,
        error: { code: "OTHER", message: "relation does not exist" },
      });

      expect(await getProfilePictureMetadata("user-1")).toBeNull();
    });

    it("returns null on a generic query error", async () => {
      tableMaybeSingle.mockResolvedValue({
        data: null,
        error: { code: "BAD", message: "permission denied" },
      });

      expect(await getProfilePictureMetadata("user-1")).toBeNull();
    });

    it("returns null when the query throws unexpectedly", async () => {
      tableMaybeSingle.mockRejectedValue(new Error("kaboom"));

      expect(await getProfilePictureMetadata("user-1")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateProfilePictureMetadata
  // -------------------------------------------------------------------------
  describe("updateProfilePictureMetadata", () => {
    it("upserts the metadata keyed on user_id", async () => {
      await updateProfilePictureMetadata("user-2", { source: "oauth" });

      expect(tableFrom).toHaveBeenCalledWith("profile_picture_metadata");
      expect(tableUpsert).toHaveBeenCalledWith(
        { user_id: "user-2", source: "oauth" },
        { onConflict: "user_id" },
      );
    });

    it("returns silently when the table is missing (PGRST116)", async () => {
      tableUpsert.mockResolvedValue({
        error: { code: "PGRST116", message: "x" },
      });

      await expect(
        updateProfilePictureMetadata("user-2", { source: "oauth" }),
      ).resolves.toBeUndefined();
    });

    it("returns silently when the error message says relation does not exist", async () => {
      tableUpsert.mockResolvedValue({
        error: { code: "OTHER", message: "relation does not exist" },
      });

      await expect(
        updateProfilePictureMetadata("user-2", { source: "oauth" }),
      ).resolves.toBeUndefined();
    });

    it("throws on a non-missing-table error", async () => {
      tableUpsert.mockResolvedValue({
        error: { code: "BAD", message: "write failed" },
      });

      await expect(
        updateProfilePictureMetadata("user-2", { source: "oauth" }),
      ).rejects.toMatchObject({ message: "write failed" });
    });
  });

  // -------------------------------------------------------------------------
  // syncOAuthAvatar
  //
  // The service keeps a module-level sessionSyncCache keyed by user id. Every
  // test here uses a UNIQUE user id so cached results from earlier tests never
  // leak in, keeping the suite deterministic regardless of execution order.
  // -------------------------------------------------------------------------
  describe("syncOAuthAvatar", () => {
    it("performs a full sync for a fresh google user and caches success", async () => {
      stubFetchOk();
      stubCanvasPipeline({ blobSize: 100 });
      const user = makeUser({
        id: "sync-full",
        provider: "google",
        userMetadata: { picture: "https://g/p.png" },
      });

      const result = await syncOAuthAvatar(user);

      expect(result).toBe(true);
      expect(storageUpload).toHaveBeenCalledTimes(1);
      expect(tableUpsert).toHaveBeenCalledTimes(1);
      const [payload] = tableUpsert.mock.calls[0];
      expect(payload).toMatchObject({
        user_id: "sync-full",
        source: "oauth",
        provider: "google",
      });
      expect(typeof payload.last_synced_at).toBe("string");

      // Second call within the hour short-circuits via the session cache and
      // does NOT trigger another upload.
      storageUpload.mockClear();
      const second = await syncOAuthAvatar(user);
      expect(second).toBe(true);
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it("skips and caches failure for a non-allowlisted provider (apple)", async () => {
      const user = makeUser({
        id: "sync-apple",
        provider: "apple",
        userMetadata: { picture: "x" },
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it("skips when no provider is present", async () => {
      const user = makeUser({
        id: "sync-noprovider",
        provider: null,
        userMetadata: {},
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
    });

    it("skips when the user has a manual upload", async () => {
      tableMaybeSingle.mockResolvedValue({
        data: { source: "upload" },
        error: null,
      });
      const user = makeUser({
        id: "sync-manual",
        provider: "github",
        userMetadata: { avatar_url: "https://gh/a.png" },
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it("skips when synced recently (within the 7-day interval) and caches success", async () => {
      const twoDaysAgo = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString();
      tableMaybeSingle.mockResolvedValue({
        data: { source: "oauth", last_synced_at: twoDaysAgo },
        error: null,
      });
      const user = makeUser({
        id: "sync-recent",
        provider: "google",
        userMetadata: { picture: "https://g/p.png" },
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it("re-syncs when the last sync is older than the 7-day interval", async () => {
      const tenDaysAgo = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      tableMaybeSingle.mockResolvedValue({
        data: { source: "oauth", last_synced_at: tenDaysAgo },
        error: null,
      });
      stubFetchOk();
      stubCanvasPipeline({ blobSize: 100 });
      const user = makeUser({
        id: "sync-stale",
        provider: "azure",
        userMetadata: { picture: "https://a/p.png" },
      });

      expect(await syncOAuthAvatar(user)).toBe(true);
      expect(storageUpload).toHaveBeenCalledTimes(1);
    });

    it("skips when the provider exposes no avatar URL", async () => {
      const user = makeUser({
        id: "sync-nourl",
        provider: "google",
        userMetadata: {}, // no picture
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it("returns false and caches failure when the download throws (graceful degrade)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("download failed");
        }),
      );
      const user = makeUser({
        id: "sync-downloadfail",
        provider: "github",
        userMetadata: { avatar_url: "https://gh/a.png" },
      });

      expect(await syncOAuthAvatar(user)).toBe(false);
    });
  });
});
