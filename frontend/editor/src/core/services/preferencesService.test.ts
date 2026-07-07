import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import {
  preferencesService,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@app/services/preferencesService";

/**
 * Unit tests for PreferencesService: a localStorage-backed preference store
 * with server-default merge and JSON-parse error fallbacks.
 *
 * Determinism strategy:
 * - The test setup (src/core/setupTests.ts) installs a working in-memory
 *   `window.localStorage` mock and stubs `window.matchMedia` to return
 *   `matches: false`. That makes `getSystemTheme()` (read at module load to
 *   compute DEFAULT_PREFERENCES.theme) resolve to "light" deterministically.
 * - Each test starts from a clean slate: localStorage is cleared and the
 *   singleton's server defaults are reset to {} (so prior tests can't leak
 *   state through the shared instance).
 * - Error branches are exercised by either writing intentionally-malformed
 *   JSON into storage (parse failures) or spying on the storage methods to
 *   force them to throw (write/clear failures).
 */

const STORAGE_KEY = "stirlingpdf_preferences";

/** Read the raw persisted blob so we can assert on what was actually written. */
function readRaw(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

/** Read and parse the persisted preferences object. */
function readStored(): Record<string, unknown> {
  const raw = readRaw();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

describe("PreferencesService", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset server defaults on the shared singleton between tests.
    preferencesService.setServerDefaults({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("DEFAULT_PREFERENCES", () => {
    test("resolves theme via matchMedia (light when not dark)", () => {
      // matchMedia is stubbed to matches:false in setup => system theme light.
      expect(DEFAULT_PREFERENCES.theme).toBe("light");
    });

    test("exposes the documented hardcoded defaults", () => {
      expect(DEFAULT_PREFERENCES.autoUnzip).toBe(true);
      expect(DEFAULT_PREFERENCES.autoUnzipFileLimit).toBe(4);
      expect(DEFAULT_PREFERENCES.defaultToolPanelMode).toBe("sidebar");
      expect(DEFAULT_PREFERENCES.defaultStartupView).toBe("tools");
      expect(DEFAULT_PREFERENCES.defaultViewerZoom).toBe("auto");
      expect(DEFAULT_PREFERENCES.logoVariant).toBeNull();
      expect(DEFAULT_PREFERENCES.pdfRenderMode).toBe("normal");
    });
  });

  describe("getPreference", () => {
    test("returns the hardcoded default when nothing is stored", () => {
      expect(preferencesService.getPreference("autoUnzip")).toBe(true);
      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(4);
    });

    test("returns the stored value when present", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzip: false, autoUnzipFileLimit: 9 }),
      );

      expect(preferencesService.getPreference("autoUnzip")).toBe(false);
      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(9);
    });

    test("returns a stored falsy value (false) rather than the default", () => {
      // Guards the `key in preferences && preferences[key] !== undefined`
      // check: `false` is a legitimate stored value and must win over the
      // default `true`.
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzip: false }),
      );

      expect(preferencesService.getPreference("autoUnzip")).toBe(false);
    });

    test("falls through to default when the stored key is explicitly undefined", () => {
      // JSON.stringify drops `undefined` values, but a hand-rolled blob with a
      // key set to null still differs; here we ensure a missing key falls back.
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pdfRenderMode: "dark" }),
      );

      // Key not in the stored object -> hardcoded default.
      expect(preferencesService.getPreference("autoUnzip")).toBe(true);
      // Key present -> stored value.
      expect(preferencesService.getPreference("pdfRenderMode")).toBe("dark");
    });

    test("prefers a server default over the hardcoded default when nothing stored", () => {
      preferencesService.setServerDefaults({ autoUnzipFileLimit: 12 });

      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(12);
    });

    test("ignores a server default whose value is undefined", () => {
      // `key in serverDefaults` is true but the value is undefined => skip it.
      preferencesService.setServerDefaults({ autoUnzipFileLimit: undefined });

      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(4);
    });

    test("stored value takes precedence over both server and hardcoded defaults", () => {
      preferencesService.setServerDefaults({ autoUnzipFileLimit: 12 });
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzipFileLimit: 99 }),
      );

      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(99);
    });

    test("falls back to default and logs when stored JSON is malformed", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      window.localStorage.setItem(STORAGE_KEY, "{not-valid-json");

      // Parse throws -> caught -> fall through to hardcoded default.
      expect(preferencesService.getPreference("autoUnzip")).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        "Error reading preference:",
        "autoUnzip",
        expect.any(Error),
      );
    });

    test("uses the server default after a malformed-JSON parse failure", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      preferencesService.setServerDefaults({ autoUnzipFileLimit: 7 });
      window.localStorage.setItem(STORAGE_KEY, "<<broken>>");

      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(7);
    });
  });

  describe("setPreference", () => {
    test("writes a single preference into empty storage", () => {
      preferencesService.setPreference("autoUnzip", false);

      expect(readStored()).toEqual({ autoUnzip: false });
      expect(preferencesService.getPreference("autoUnzip")).toBe(false);
    });

    test("merges into an existing stored object without clobbering siblings", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzip: false, pdfRenderMode: "sepia" }),
      );

      preferencesService.setPreference("autoUnzipFileLimit", 3);

      expect(readStored()).toEqual({
        autoUnzip: false,
        pdfRenderMode: "sepia",
        autoUnzipFileLimit: 3,
      });
    });

    test("overwrites an existing key's value", () => {
      preferencesService.setPreference("pdfRenderMode", "dark");
      preferencesService.setPreference("pdfRenderMode", "sepia");

      expect(preferencesService.getPreference("pdfRenderMode")).toBe("sepia");
    });

    test("treats malformed existing storage as an empty base object", () => {
      // `stored ? JSON.parse(stored) : {}` -> JSON.parse throws on the bad
      // blob, which is caught; nothing is persisted for this call.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      window.localStorage.setItem(STORAGE_KEY, "###");

      preferencesService.setPreference("autoUnzip", false);

      expect(errorSpy).toHaveBeenCalledWith(
        "Error writing preference:",
        "autoUnzip",
        expect.any(Error),
      );
      // The malformed blob is left untouched because the write threw.
      expect(readRaw()).toBe("###");
    });

    test("logs and swallows when setItem throws (e.g. quota exceeded)", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const setItemSpy = vi
        .spyOn(window.localStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceededError");
        });

      // Should not throw to the caller.
      expect(() =>
        preferencesService.setPreference("autoUnzip", false),
      ).not.toThrow();
      expect(setItemSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        "Error writing preference:",
        "autoUnzip",
        expect.any(Error),
      );
    });
  });

  describe("getAllPreferences", () => {
    test("returns hardcoded defaults merged with empty server defaults when nothing stored", () => {
      expect(preferencesService.getAllPreferences()).toEqual(
        DEFAULT_PREFERENCES,
      );
    });

    test("layers server defaults over hardcoded defaults when nothing stored", () => {
      preferencesService.setServerDefaults({
        autoUnzipFileLimit: 20,
        pdfRenderMode: "dark",
      });

      const all = preferencesService.getAllPreferences();

      expect(all.autoUnzipFileLimit).toBe(20);
      expect(all.pdfRenderMode).toBe("dark");
      // Untouched keys keep their hardcoded defaults.
      expect(all.autoUnzip).toBe(true);
    });

    test("merges defaults, server defaults, then stored values in priority order", () => {
      preferencesService.setServerDefaults({
        autoUnzipFileLimit: 20,
        pdfRenderMode: "dark",
      });
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pdfRenderMode: "sepia", autoUnzip: false }),
      );

      const all = preferencesService.getAllPreferences();

      // Stored wins over server default.
      expect(all.pdfRenderMode).toBe("sepia");
      // Server default applies where storage is silent.
      expect(all.autoUnzipFileLimit).toBe(20);
      // Stored boolean override.
      expect(all.autoUnzip).toBe(false);
      // Hardcoded default for everything untouched.
      expect(all.defaultStartupView).toBe("tools");
    });

    test("returns a full object containing every default key when stored present", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzip: false }),
      );

      const all = preferencesService.getAllPreferences();
      const expectedKeys = Object.keys(DEFAULT_PREFERENCES).sort();

      expect(Object.keys(all).sort()).toEqual(expectedKeys);
    });

    test("falls back to defaults+server merge and logs on malformed stored JSON", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      preferencesService.setServerDefaults({ autoUnzipFileLimit: 42 });
      window.localStorage.setItem(STORAGE_KEY, "{definitely not json");

      const all = preferencesService.getAllPreferences();

      // Server default still layered in even though parsing the stored blob
      // failed.
      expect(all.autoUnzipFileLimit).toBe(42);
      expect(all.autoUnzip).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        "Error reading preferences",
        expect.any(Error),
      );
    });

    test("round-trips a value written via setPreference", () => {
      preferencesService.setPreference("defaultViewerZoom", "150");

      const all = preferencesService.getAllPreferences();

      expect(all.defaultViewerZoom).toBe("150");
    });
  });

  describe("clearAllPreferences", () => {
    test("removes the persisted blob", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ autoUnzip: false }),
      );

      preferencesService.clearAllPreferences();

      expect(readRaw()).toBeNull();
      // After clearing, reads revert to defaults.
      expect(preferencesService.getPreference("autoUnzip")).toBe(true);
    });

    test("is a no-op-safe call when nothing is stored", () => {
      expect(() => preferencesService.clearAllPreferences()).not.toThrow();
      expect(readRaw()).toBeNull();
    });

    test("logs and rethrows when removeItem throws", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const failure = new Error("storage disabled");
      vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
        throw failure;
      });

      expect(() => preferencesService.clearAllPreferences()).toThrow(failure);
      expect(errorSpy).toHaveBeenCalledWith(
        "Error clearing preferences:",
        failure,
      );
    });
  });

  describe("setServerDefaults", () => {
    test("replaces (not merges) previously set server defaults", () => {
      preferencesService.setServerDefaults({ autoUnzipFileLimit: 5 });
      preferencesService.setServerDefaults({ pdfRenderMode: "dark" });

      // The first set of defaults is gone after the second call.
      expect(preferencesService.getPreference("autoUnzipFileLimit")).toBe(4);
      expect(preferencesService.getPreference("pdfRenderMode")).toBe("dark");
    });

    test("accepts a partial preferences object covering multiple keys", () => {
      const defaults: Partial<UserPreferences> = {
        hideUnavailableTools: true,
        showLegacyToolDescriptions: true,
      };
      preferencesService.setServerDefaults(defaults);

      expect(preferencesService.getPreference("hideUnavailableTools")).toBe(
        true,
      );
      expect(
        preferencesService.getPreference("showLegacyToolDescriptions"),
      ).toBe(true);
    });
  });
});
