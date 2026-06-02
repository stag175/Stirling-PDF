import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOMATION_CONSTANTS } from "@app/constants/automation";
import { ResourceManager } from "@app/utils/resourceManager";

// jsdom does not implement URL.createObjectURL / revokeObjectURL, so we install
// deterministic fakes. createObjectURL returns a counter-based fake blob URL;
// revokeObjectURL is a spy so we can assert tracking/cleanup behaviour.
describe("ResourceManager", () => {
  let createSpy: ReturnType<typeof vi.fn>;
  let revokeSpy: ReturnType<typeof vi.fn>;
  let counter: number;

  beforeEach(() => {
    counter = 0;
    createSpy = vi.fn(() => `blob:mock/${++counter}`);
    revokeSpy = vi.fn();
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    // Drop any URLs left in the shared static set so tests stay independent.
    ResourceManager.revokeAllBlobUrls();
    vi.restoreAllMocks();
  });

  describe("createResultFile", () => {
    it("uses the default processed-file prefix and PDF type", () => {
      const file = ResourceManager.createResultFile("data", "doc.pdf");
      expect(file.name).toBe(
        `${AUTOMATION_CONSTANTS.PROCESSED_FILE_PREFIX}doc.pdf`,
      );
      expect(file.type).toBe("application/pdf");
    });

    it("honours a custom prefix and type", () => {
      const file = ResourceManager.createResultFile(
        "data",
        "x.txt",
        "out_",
        "text/plain",
      );
      expect(file.name).toBe("out_x.txt");
      expect(file.type).toBe("text/plain");
    });
  });

  describe("createTimestampedFile", () => {
    it("names the file with the timestamp + default .pdf extension", () => {
      vi.spyOn(Date, "now").mockReturnValue(1730000000000);
      const file = ResourceManager.createTimestampedFile("data", "scan_");
      expect(file.name).toBe("scan_1730000000000.pdf");
      expect(file.type).toBe("application/pdf");
    });

    it("honours a custom extension and type", () => {
      vi.spyOn(Date, "now").mockReturnValue(42);
      const file = ResourceManager.createTimestampedFile(
        "data",
        "img_",
        ".png",
        "image/png",
      );
      expect(file.name).toBe("img_42.png");
      expect(file.type).toBe("image/png");
    });
  });

  describe("blob URL tracking", () => {
    it("createBlobUrl creates and returns a tracked blob URL", () => {
      const blob = new Blob(["x"]);
      const url = ResourceManager.createBlobUrl(blob);
      expect(createSpy).toHaveBeenCalledWith(blob);
      expect(url).toBe("blob:mock/1");
    });

    it("revokeBlobUrl revokes and untracks a tracked URL (idempotent after)", () => {
      const url = ResourceManager.createBlobUrl(new Blob(["x"]));
      ResourceManager.revokeBlobUrl(url);
      expect(revokeSpy).toHaveBeenCalledWith(url);

      // Already untracked: a second revoke is a no-op.
      revokeSpy.mockClear();
      ResourceManager.revokeBlobUrl(url);
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("revokeBlobUrl ignores a URL it never created", () => {
      ResourceManager.revokeBlobUrl("blob:never-created");
      expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("revokeAllBlobUrls revokes every tracked URL then clears tracking", () => {
      const u1 = ResourceManager.createBlobUrl(new Blob(["a"]));
      const u2 = ResourceManager.createBlobUrl(new Blob(["b"]));

      ResourceManager.revokeAllBlobUrls();
      expect(revokeSpy).toHaveBeenCalledWith(u1);
      expect(revokeSpy).toHaveBeenCalledWith(u2);
      expect(revokeSpy).toHaveBeenCalledTimes(2);

      // Set is now empty: a subsequent sweep revokes nothing.
      revokeSpy.mockClear();
      ResourceManager.revokeAllBlobUrls();
      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });
});
