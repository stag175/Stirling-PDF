import { describe, it, expect, beforeEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import databaseManagementService, {
  type DatabaseData,
} from "@app/services/databaseManagementService";

// Auto-mock the apiClient (axios instance) so get/post become vi.fn() stubs.
// This matches the mocking convention used by userManagementService.test.ts
// and workflowService.test.ts in this same directory.
vi.mock("@app/services/apiClient");

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

/** Pull the FormData passed as the body of the most recent apiClient.post call. */
function lastPostFormData(): FormData {
  const call = mockedPost.mock.calls[mockedPost.mock.calls.length - 1];
  return call[1] as FormData;
}

const sampleDatabaseData: DatabaseData = {
  backupFiles: [
    {
      fileName: "backup_2026_06_01.sql",
      filePath: "/backups/backup_2026_06_01.sql",
      formattedCreationDate: "2026-06-01 00:00:00",
      formattedFileSize: "1.2 MB",
      creationDate: "2026-06-01T00:00:00Z",
      fileSize: 1258291,
    },
  ],
  databaseVersion: "H2 2.2.224",
  versionUnknown: false,
};

describe("databaseManagementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDatabaseData", () => {
    it("GETs the ui-data endpoint with suppressed error toast and returns the data", async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleDatabaseData });

      const result = await databaseManagementService.getDatabaseData();

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/database",
        { suppressErrorToast: true },
      );
      expect(result).toBe(sampleDatabaseData);
    });

    it("returns versionUnknown data shapes verbatim", async () => {
      const unknownVersion: DatabaseData = {
        backupFiles: [],
        databaseVersion: "",
        versionUnknown: true,
      };
      mockedGet.mockResolvedValueOnce({ data: unknownVersion });

      const result = await databaseManagementService.getDatabaseData();

      expect(result).toEqual(unknownVersion);
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("ui-data boom"));

      await expect(databaseManagementService.getDatabaseData()).rejects.toThrow(
        "ui-data boom",
      );
    });
  });

  describe("createBackup", () => {
    it("GETs the createDatabaseBackup endpoint and resolves to undefined", async () => {
      mockedGet.mockResolvedValueOnce({ data: undefined });

      const result = await databaseManagementService.createBackup();

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/createDatabaseBackup",
      );
      expect(result).toBeUndefined();
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("create failed"));

      await expect(databaseManagementService.createBackup()).rejects.toThrow(
        "create failed",
      );
    });
  });

  describe("importFromFileName", () => {
    it("GETs the import endpoint with the file name appended verbatim when safe", async () => {
      mockedGet.mockResolvedValueOnce({ data: undefined });

      await databaseManagementService.importFromFileName("backup.sql");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/import-database-file/backup.sql",
      );
    });

    it("URL-encodes special characters in the file name", async () => {
      mockedGet.mockResolvedValueOnce({ data: undefined });

      await databaseManagementService.importFromFileName(
        "my backup (1)+final.sql",
      );

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/import-database-file/my%20backup%20(1)%2Bfinal.sql",
      );
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("import failed"));

      await expect(
        databaseManagementService.importFromFileName("x.sql"),
      ).rejects.toThrow("import failed");
    });
  });

  describe("uploadAndImport", () => {
    it("POSTs a FormData with the file under the fileInput field", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      const file = new File(["sql-bytes"], "restore.sql", {
        type: "application/sql",
      });

      await databaseManagementService.uploadAndImport(file);

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/database/import-database");
      expect(body).toBeInstanceOf(FormData);

      const fd = lastPostFormData();
      expect(fd.get("fileInput")).toBe(file);
    });

    it("propagates errors from the api client", async () => {
      mockedPost.mockRejectedValueOnce(new Error("upload failed"));

      const file = new File(["x"], "x.sql");

      await expect(
        databaseManagementService.uploadAndImport(file),
      ).rejects.toThrow("upload failed");
    });
  });

  describe("deleteBackup", () => {
    it("GETs the delete endpoint with the file name appended verbatim when safe", async () => {
      mockedGet.mockResolvedValueOnce({ data: undefined });

      await databaseManagementService.deleteBackup("old-backup.sql");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/delete/old-backup.sql",
      );
    });

    it("URL-encodes special characters in the file name", async () => {
      mockedGet.mockResolvedValueOnce({ data: undefined });

      await databaseManagementService.deleteBackup("a/b c?d.sql");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/delete/a%2Fb%20c%3Fd.sql",
      );
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("delete failed"));

      await expect(
        databaseManagementService.deleteBackup("x.sql"),
      ).rejects.toThrow("delete failed");
    });
  });

  describe("downloadBackup", () => {
    it("GETs the download endpoint as a blob and returns the blob data", async () => {
      const blob = new Blob(["backup-bytes"], { type: "application/sql" });
      mockedGet.mockResolvedValueOnce({ data: blob });

      const result =
        await databaseManagementService.downloadBackup("backup.sql");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/download/backup.sql",
        { responseType: "blob" },
      );
      expect(result).toBe(blob);
    });

    it("URL-encodes special characters in the file name", async () => {
      const blob = new Blob(["bytes"]);
      mockedGet.mockResolvedValueOnce({ data: blob });

      await databaseManagementService.downloadBackup("weird name&v=2.sql");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/database/download/weird%20name%26v%3D2.sql",
        { responseType: "blob" },
      );
    });

    it("propagates errors from the api client", async () => {
      mockedGet.mockRejectedValueOnce(new Error("download failed"));

      await expect(
        databaseManagementService.downloadBackup("x.sql"),
      ).rejects.toThrow("download failed");
    });
  });
});
