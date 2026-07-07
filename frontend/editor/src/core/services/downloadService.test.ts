import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadFile, downloadFromUrl } from "@app/services/downloadService";

// Both download helpers synthesise a transient <a download> anchor, click it, then remove it.
// We spy on HTMLAnchorElement.prototype.click (jsdom's click is a no-op navigation-wise) and
// capture the anchor's download/href at click time, and stub the jsdom-unimplemented
// URL.createObjectURL / revokeObjectURL.
describe("downloadService", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let captured: { download?: string; href?: string };

  beforeEach(() => {
    captured = {};
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        captured.download = this.download;
        captured.href = this.getAttribute("href") ?? undefined;
      });
    URL.createObjectURL = vi.fn(
      () => "blob:mock/1",
    ) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  describe("downloadFile", () => {
    it("creates a blob URL, clicks an anchor named with the filename, and revokes the URL", async () => {
      const blob = new Blob(["x"]);
      const result = await downloadFile({
        data: blob,
        filename: "out.pdf",
        localPath: "/tmp/out.pdf",
      });

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(captured.download).toBe("out.pdf");
      expect(captured.href).toBe("blob:mock/1");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock/1");
      // The transient anchor is removed again.
      expect(document.body.querySelector("a")).toBeNull();
      expect(result).toEqual({ savedPath: "/tmp/out.pdf" });
    });

    it("returns an undefined savedPath when no localPath is given", async () => {
      const result = await downloadFile({
        data: new Blob(["y"]),
        filename: "x.pdf",
      });
      expect(result).toEqual({ savedPath: undefined });
    });
  });

  describe("downloadFromUrl", () => {
    it("clicks an anchor pointed at the url + filename without touching object URLs", async () => {
      const result = await downloadFromUrl(
        "/api/v1/file/123",
        "report.pdf",
        "/tmp/report.pdf",
      );

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(captured.href).toBe("/api/v1/file/123");
      expect(captured.download).toBe("report.pdf");
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      expect(document.body.querySelector("a")).toBeNull();
      expect(result).toEqual({ savedPath: "/tmp/report.pdf" });
    });

    it("returns an undefined savedPath when no localPath is given", async () => {
      const result = await downloadFromUrl("/api/file", "f.pdf");
      expect(result).toEqual({ savedPath: undefined });
    });
  });
});
