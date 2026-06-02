import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openFileDialog } from "@app/services/fileDialogService";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { pendingFilePathMappings } from "@app/services/pendingFilePathMappings";
import { getDocumentFileDialogFilter } from "@app/utils/fileDialogUtils";

// Mock only the native dialog; keep the real path-mapping Map and the real (pure) default filter.
vi.mock("@app/services/fileDialogService", () => ({
  openFileDialog: vi.fn(),
}));

const mockOpen = vi.mocked(openFileDialog);

beforeEach(() => {
  pendingFilePathMappings.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  pendingFilePathMappings.clear();
});

describe("openFilesFromDisk", () => {
  it("returns the selected files and records each quickKey -> path mapping", async () => {
    const a = new File(["a"], "a.pdf");
    const b = new File(["b"], "b.pdf");
    mockOpen.mockResolvedValue([
      { file: a, path: "/p/a.pdf", quickKey: "qa" },
      { file: b, path: "/p/b.pdf", quickKey: "qb" },
    ]);
    const onFallbackOpen = vi.fn();

    const result = await openFilesFromDisk({ onFallbackOpen });

    expect(result).toEqual([a, b]);
    expect(pendingFilePathMappings.get("qa")).toBe("/p/a.pdf");
    expect(pendingFilePathMappings.get("qb")).toBe("/p/b.pdf");
    expect(onFallbackOpen).not.toHaveBeenCalled();
  });

  it("returns [] and invokes onFallbackOpen when the dialog yields no files", async () => {
    mockOpen.mockResolvedValue([]);
    const onFallbackOpen = vi.fn();

    const result = await openFilesFromDisk({ onFallbackOpen });

    expect(result).toEqual([]);
    expect(onFallbackOpen).toHaveBeenCalledTimes(1);
    expect(pendingFilePathMappings.size).toBe(0);
  });

  it("does not throw when there is no fallback callback and no files", async () => {
    mockOpen.mockResolvedValue([]);
    await expect(openFilesFromDisk()).resolves.toEqual([]);
  });

  it("defaults to multiple=true and the document filter when options are omitted", async () => {
    mockOpen.mockResolvedValue([]);
    await openFilesFromDisk();
    expect(mockOpen).toHaveBeenCalledWith({
      multiple: true,
      filters: getDocumentFileDialogFilter(),
    });
  });

  it("passes an explicit multiple flag and custom filters through", async () => {
    mockOpen.mockResolvedValue([]);
    const filters = [{ name: "Images", extensions: ["png", "jpg"] }];
    await openFilesFromDisk({ multiple: false, filters });
    expect(mockOpen).toHaveBeenCalledWith({ multiple: false, filters });
  });
});
