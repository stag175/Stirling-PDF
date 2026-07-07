import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import { folderSyncService } from "@app/services/folderSyncService";
import { parseFolderId, type FolderId } from "@app/types/folder";

/**
 * Unit tests for folderSyncService: a thin HTTP client over the Phase A folder
 * endpoints that maps wire DTOs into local FolderRecord shapes.
 *
 * Determinism strategy:
 * - The axios instance (apiClient) is auto-mocked with vi.mock so every verb
 *   (get/post/patch/delete) is a vi.fn() stub. No real network I/O occurs and
 *   request shape can be asserted directly. This matches the convention used by
 *   teamService.test.ts / userManagementService.test.ts.
 * - Time-dependent branches (parseTimestamp's null/empty fallback to Date.now())
 *   are pinned with vi.useFakeTimers() + setSystemTime so "now" is a fixed value.
 * - console.warn is silenced/observed so the missing-timestamp warning branch is
 *   exercised without polluting output.
 */

vi.mock("@app/services/apiClient");

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);

// Stable, valid v4-style UUIDs used across tests.
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

const FIXED_NOW = 1_700_000_000_000; // deterministic "now" for fallback branches.
const CREATED_ISO = "2023-01-02T03:04:05.000Z";
const CREATED_MS = Date.parse(CREATED_ISO);
const UPDATED_ISO = "2023-06-07T08:09:10.000Z";
const UPDATED_MS = Date.parse(UPDATED_ISO);

/** Build a well-formed ServerFolder DTO with sensible defaults. */
function serverFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_A,
    name: "Reports",
    parentFolderId: null,
    color: "#3b82f6",
    icon: "folder",
    version: 1,
    createdAt: CREATED_ISO,
    updatedAt: UPDATED_ISO,
    ...overrides,
  };
}

describe("folderSyncService", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("maps a fully-populated server folder into a FolderRecord", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ parentFolderId: UUID_B })],
      });

      const result = await folderSyncService.list();

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith("/api/v1/storage/folders");
      expect(result).toEqual([
        {
          id: UUID_A,
          name: "Reports",
          parentFolderId: UUID_B,
          color: "#3b82f6",
          icon: "folder",
          createdAt: CREATED_MS,
          updatedAt: UPDATED_MS,
        },
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("coerces null color/icon to undefined and keeps a null parent", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ parentFolderId: null, color: null, icon: null })],
      });

      const [record] = await folderSyncService.list();

      expect(record.parentFolderId).toBeNull();
      expect(record.color).toBeUndefined();
      expect(record.icon).toBeUndefined();
      // The keys exist but resolve to undefined via the `?? undefined` branch.
      expect(record).toMatchObject({ id: UUID_A, name: "Reports" });
    });

    it("defaults a null createdAt to Date.now() and warns", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ createdAt: null })],
      });

      const [record] = await folderSyncService.list();

      expect(record.createdAt).toBe(FIXED_NOW);
      expect(record.updatedAt).toBe(UPDATED_MS);
      expect(warnSpy).toHaveBeenCalledWith(
        "[folderSyncService] missing createdAt from server response; defaulting to now",
      );
    });

    it("defaults an empty-string updatedAt to Date.now() and warns", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ updatedAt: "" })],
      });

      const [record] = await folderSyncService.list();

      expect(record.updatedAt).toBe(FIXED_NOW);
      expect(warnSpy).toHaveBeenCalledWith(
        "[folderSyncService] missing updatedAt from server response; defaulting to now",
      );
    });

    it("throws when a timestamp is present but unparseable", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ createdAt: "not-a-date" })],
      });

      await expect(folderSyncService.list()).rejects.toThrow(
        "Invalid createdAt timestamp from server: not-a-date",
      );
    });

    it("throws when a folder id is not a UUID (trust-boundary validation)", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ id: "garbage" })],
      });

      await expect(folderSyncService.list()).rejects.toThrow(
        "Invalid FolderId: garbage",
      );
    });

    it("throws when a non-null parentFolderId is not a UUID", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [serverFolder({ parentFolderId: "nope" })],
      });

      await expect(folderSyncService.list()).rejects.toThrow(
        "Invalid FolderId: nope",
      );
    });

    it("returns an empty array when response.data is null (?? [] branch)", async () => {
      mockedGet.mockResolvedValueOnce({ data: null });

      const result = await folderSyncService.list();

      expect(result).toEqual([]);
    });

    it("propagates request errors", async () => {
      mockedGet.mockRejectedValueOnce(new Error("list boom"));

      await expect(folderSyncService.list()).rejects.toThrow("list boom");
    });
  });

  describe("create", () => {
    it("sends the supplied id and all optional fields", async () => {
      mockedPost.mockResolvedValueOnce({ data: serverFolder() });

      const result = await folderSyncService.create({
        id: UUID_A as FolderId,
        name: "Reports",
        parentFolderId: UUID_B as FolderId,
        color: "#10b981",
        icon: "star",
      });

      expect(mockedPost).toHaveBeenCalledWith("/api/v1/storage/folders", {
        id: UUID_A,
        name: "Reports",
        parentFolderId: UUID_B,
        color: "#10b981",
        icon: "star",
      });
      expect(result.id).toBe(UUID_A);
      expect(result.createdAt).toBe(CREATED_MS);
    });

    it("falls back to undefined id when none provided (id ?? undefined)", async () => {
      mockedPost.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.create({
        name: "Loose",
        parentFolderId: null,
      });

      expect(mockedPost).toHaveBeenCalledWith("/api/v1/storage/folders", {
        id: undefined,
        name: "Loose",
        parentFolderId: null,
        color: undefined,
        icon: undefined,
      });
    });

    it("maps the created server folder through toFolderRecord", async () => {
      mockedPost.mockResolvedValueOnce({
        data: serverFolder({ id: UUID_C, createdAt: null }),
      });

      const result = await folderSyncService.create({
        name: "X",
        parentFolderId: null,
      });

      expect(result.id).toBe(UUID_C);
      // Null createdAt routed through the fallback branch.
      expect(result.createdAt).toBe(FIXED_NOW);
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("create boom"));

      await expect(
        folderSyncService.create({ name: "X", parentFolderId: null }),
      ).rejects.toThrow("create boom");
    });
  });

  describe("update", () => {
    it("builds a body containing only the name when only name is set", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, { name: "Renamed" });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { name: "Renamed" },
      );
    });

    it("keeps an empty-string name (name !== undefined branch)", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, { name: "" });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { name: "" },
      );
    });

    it("adds reparent + explicit parentFolderId when reparent is true", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, {
        reparent: true,
        parentFolderId: UUID_B as FolderId,
      });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { reparent: true, parentFolderId: UUID_B },
      );
    });

    it("reparents to root with null when parentFolderId is omitted (?? null)", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, { reparent: true });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { reparent: true, parentFolderId: null },
      );
    });

    it("skips reparent fields when reparent is falsy even if parentFolderId is set", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, {
        reparent: false,
        parentFolderId: UUID_B as FolderId,
      });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        {},
      );
    });

    it("passes through a provided color/icon and empties null ones", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, {
        color: "#ef4444",
        icon: null,
      });

      // color present -> kept; icon explicitly null -> coerced to "".
      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { color: "#ef4444", icon: "" },
      );
    });

    it("coerces a null color to an empty string", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, { color: null });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        { color: "" },
      );
    });

    it("combines every patch field into one body", async () => {
      mockedPatch.mockResolvedValueOnce({ data: serverFolder() });

      await folderSyncService.update(UUID_A as FolderId, {
        name: "All",
        reparent: true,
        parentFolderId: UUID_B as FolderId,
        color: "#8b5cf6",
        icon: "tag",
      });

      expect(mockedPatch).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
        {
          name: "All",
          reparent: true,
          parentFolderId: UUID_B,
          color: "#8b5cf6",
          icon: "tag",
        },
      );
    });

    it("returns the mapped FolderRecord from the patch response", async () => {
      mockedPatch.mockResolvedValueOnce({
        data: serverFolder({ id: UUID_C, name: "Mapped" }),
      });

      const result = await folderSyncService.update(UUID_A as FolderId, {
        name: "Mapped",
      });

      expect(result).toEqual({
        id: UUID_C,
        name: "Mapped",
        parentFolderId: null,
        color: "#3b82f6",
        icon: "folder",
        createdAt: CREATED_MS,
        updatedAt: UPDATED_MS,
      });
    });

    it("propagates request errors", async () => {
      mockedPatch.mockRejectedValueOnce(new Error("update boom"));

      await expect(
        folderSyncService.update(UUID_A as FolderId, { name: "x" }),
      ).rejects.toThrow("update boom");
    });
  });

  describe("delete", () => {
    it("validates and returns the removed folder ids", async () => {
      mockedDelete.mockResolvedValueOnce({
        data: { removedFolderIds: [UUID_A, UUID_B] },
      });

      const result = await folderSyncService.delete(UUID_A as FolderId);

      expect(mockedDelete).toHaveBeenCalledWith(
        `/api/v1/storage/folders/${UUID_A}`,
      );
      expect(result).toEqual([UUID_A, UUID_B].map(parseFolderId));
    });

    it("returns [] when removedFolderIds is absent (?? [] branch)", async () => {
      mockedDelete.mockResolvedValueOnce({ data: {} });

      const result = await folderSyncService.delete(UUID_A as FolderId);

      expect(result).toEqual([]);
    });

    it("returns [] when response.data is null", async () => {
      mockedDelete.mockResolvedValueOnce({ data: null });

      const result = await folderSyncService.delete(UUID_A as FolderId);

      expect(result).toEqual([]);
    });

    it("throws when a removed id is not a UUID", async () => {
      mockedDelete.mockResolvedValueOnce({
        data: { removedFolderIds: [UUID_A, "bad-id"] },
      });

      await expect(
        folderSyncService.delete(UUID_A as FolderId),
      ).rejects.toThrow("Invalid FolderId: bad-id");
    });

    it("propagates request errors", async () => {
      mockedDelete.mockRejectedValueOnce(new Error("delete boom"));

      await expect(
        folderSyncService.delete(UUID_A as FolderId),
      ).rejects.toThrow("delete boom");
    });
  });

  describe("moveFileToFolder", () => {
    it("patches the file folder endpoint with a target folderId", async () => {
      mockedPatch.mockResolvedValueOnce({ data: undefined });

      await folderSyncService.moveFileToFolder(42, UUID_A as FolderId);

      expect(mockedPatch).toHaveBeenCalledWith(
        "/api/v1/storage/files/42/folder",
        { folderId: UUID_A },
      );
    });

    it("patches with a null folderId when moving to root", async () => {
      mockedPatch.mockResolvedValueOnce({ data: undefined });

      await folderSyncService.moveFileToFolder(7, null);

      expect(mockedPatch).toHaveBeenCalledWith(
        "/api/v1/storage/files/7/folder",
        { folderId: null },
      );
    });

    it("propagates request errors", async () => {
      mockedPatch.mockRejectedValueOnce(new Error("move boom"));

      await expect(folderSyncService.moveFileToFolder(1, null)).rejects.toThrow(
        "move boom",
      );
    });
  });

  describe("bulkMoveFiles", () => {
    it("sends the file ids and folder id and returns the response data", async () => {
      const payload = { movedFileIds: [1, 2], skippedFileIds: [3] };
      mockedPatch.mockResolvedValueOnce({ data: payload });

      const result = await folderSyncService.bulkMoveFiles(
        [1, 2, 3],
        UUID_A as FolderId,
      );

      expect(mockedPatch).toHaveBeenCalledWith("/api/v1/storage/files/folder", {
        folderId: UUID_A,
        fileIds: [1, 2, 3],
      });
      expect(result).toBe(payload);
    });

    it("supports moving to root with a null folder id", async () => {
      const payload = { movedFileIds: [], skippedFileIds: [] };
      mockedPatch.mockResolvedValueOnce({ data: payload });

      const result = await folderSyncService.bulkMoveFiles([], null);

      expect(mockedPatch).toHaveBeenCalledWith("/api/v1/storage/files/folder", {
        folderId: null,
        fileIds: [],
      });
      expect(result).toEqual(payload);
    });

    it("propagates request errors", async () => {
      mockedPatch.mockRejectedValueOnce(new Error("bulk boom"));

      await expect(folderSyncService.bulkMoveFiles([1], null)).rejects.toThrow(
        "bulk boom",
      );
    });
  });
});
