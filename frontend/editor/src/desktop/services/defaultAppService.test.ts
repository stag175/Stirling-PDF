/**
 * Unit tests for defaultAppService (desktop layer).
 *
 * The service is a plain object exposing default-PDF-handler helpers. Two of
 * its methods are thin wrappers around the Tauri `invoke` command (each with a
 * try/catch fallback), and the rest read/write a machine-specific dismiss flag
 * in localStorage plus a `shouldShowPrompt` decision that combines both.
 *
 * Determinism: the single external dependency, `invoke` from
 * `@tauri-apps/api/core`, is replaced with a vi.mock so no real Tauri runtime
 * is touched. localStorage is the jsdom implementation, cleared between tests;
 * its `getItem`/`setItem` are spied on (and made to throw) to exercise the
 * catch branches. console.error is silenced so the module's logging does not
 * pollute test output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- mocks ------------------------------------------------------------------
// invoke is the only external dependency; the module imports it at load time
// and calls it by command name.
const invoke = vi.fn<(cmd: string) => Promise<unknown>>();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => invoke(cmd),
}));

import { defaultAppService } from "@app/services/defaultAppService";

const DISMISS_KEY = "stirlingpdf_default_app_prompt_dismissed";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- isDefaultPdfHandler ----------------------------------------------------

describe("isDefaultPdfHandler", () => {
  it("returns the boolean resolved by the invoke command (true)", async () => {
    invoke.mockResolvedValue(true);
    expect(await defaultAppService.isDefaultPdfHandler()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("is_default_pdf_handler");
  });

  it("returns the boolean resolved by the invoke command (false)", async () => {
    invoke.mockResolvedValue(false);
    expect(await defaultAppService.isDefaultPdfHandler()).toBe(false);
  });

  it("returns false and logs when invoke rejects (catch branch)", async () => {
    invoke.mockRejectedValue(new Error("ipc down"));
    expect(await defaultAppService.isDefaultPdfHandler()).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

// --- setAsDefaultPdfHandler -------------------------------------------------

describe("setAsDefaultPdfHandler", () => {
  it("returns 'set_successfully' when the command sets the handler directly", async () => {
    invoke.mockResolvedValue("set_successfully");
    expect(await defaultAppService.setAsDefaultPdfHandler()).toBe(
      "set_successfully",
    );
    expect(invoke).toHaveBeenCalledWith("set_as_default_pdf_handler");
  });

  it("returns 'opened_dialog' when the command opens a system dialog", async () => {
    invoke.mockResolvedValue("opened_dialog");
    expect(await defaultAppService.setAsDefaultPdfHandler()).toBe(
      "opened_dialog",
    );
  });

  it("returns 'error' and logs when invoke rejects (catch branch)", async () => {
    invoke.mockRejectedValue(new Error("permission denied"));
    expect(await defaultAppService.setAsDefaultPdfHandler()).toBe("error");
    expect(console.error).toHaveBeenCalled();
  });
});

// --- hasUserDismissedPrompt -------------------------------------------------

describe("hasUserDismissedPrompt", () => {
  it("returns true only when the stored flag is exactly 'true'", () => {
    localStorage.setItem(DISMISS_KEY, "true");
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(true);
  });

  it("returns false when nothing has been stored", () => {
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(false);
  });

  it("returns false when the stored flag is 'false'", () => {
    localStorage.setItem(DISMISS_KEY, "false");
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(false);
  });

  it("returns false when getItem throws (catch branch)", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(false);
  });
});

// --- setPromptDismissed -----------------------------------------------------

describe("setPromptDismissed", () => {
  it("persists 'true' when dismissed is true", () => {
    defaultAppService.setPromptDismissed(true);
    expect(localStorage.getItem(DISMISS_KEY)).toBe("true");
  });

  it("persists 'false' when dismissed is false", () => {
    defaultAppService.setPromptDismissed(false);
    expect(localStorage.getItem(DISMISS_KEY)).toBe("false");
  });

  it("round-trips with hasUserDismissedPrompt", () => {
    defaultAppService.setPromptDismissed(true);
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(true);
    defaultAppService.setPromptDismissed(false);
    expect(defaultAppService.hasUserDismissedPrompt()).toBe(false);
  });

  it("logs and swallows when setItem throws (catch branch)", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => defaultAppService.setPromptDismissed(true)).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

// --- shouldShowPrompt -------------------------------------------------------

describe("shouldShowPrompt", () => {
  it("returns false immediately when the user has dismissed the prompt (never checks the handler)", async () => {
    localStorage.setItem(DISMISS_KEY, "true");
    expect(await defaultAppService.shouldShowPrompt()).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns true when not dismissed and the app is NOT the default handler", async () => {
    invoke.mockResolvedValue(false);
    expect(await defaultAppService.shouldShowPrompt()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("is_default_pdf_handler");
  });

  it("returns false when not dismissed but the app IS already the default handler", async () => {
    invoke.mockResolvedValue(true);
    expect(await defaultAppService.shouldShowPrompt()).toBe(false);
  });

  it("returns true when not dismissed and the handler check errors out (treated as not-default)", async () => {
    invoke.mockRejectedValue(new Error("ipc down"));
    expect(await defaultAppService.shouldShowPrompt()).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });
});
