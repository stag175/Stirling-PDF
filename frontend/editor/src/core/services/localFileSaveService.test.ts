import { describe, expect, it } from "vitest";

import {
  saveMultipleFilesWithPrompt,
  saveToLocalPath,
  showSaveDialog,
} from "@app/services/localFileSaveService";

// These are the CORE (web) stubs; the desktop layer overrides them with real Tauri saves.
// The contract that matters: in web mode they must clearly report "not saved" rather than
// silently claim success (which would lose the user's file). These tests guard that.
describe("localFileSaveService web-mode stubs", () => {
  it("saveToLocalPath reports failure, never a silent success", async () => {
    const result = await saveToLocalPath(new Blob(["x"]), "/tmp/x.pdf");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available in web mode/i);
  });

  it("showSaveDialog returns null (no native dialog in web mode)", async () => {
    expect(await showSaveDialog("out.pdf")).toBeNull();
    expect(await showSaveDialog("out.pdf", "/some/dir")).toBeNull();
  });

  it("saveMultipleFilesWithPrompt reports failure with savedCount 0", async () => {
    const result = await saveMultipleFilesWithPrompt([
      new Blob(["a"]),
      new Blob(["b"]),
    ]);
    expect(result).toEqual({
      success: false,
      savedCount: 0,
      error: "Multi-file save not available in web mode",
    });
  });

  it("saveMultipleFilesWithPrompt reports failure even for an empty file list", async () => {
    const result = await saveMultipleFilesWithPrompt([]);
    expect(result.success).toBe(false);
    expect(result.savedCount).toBe(0);
  });
});
