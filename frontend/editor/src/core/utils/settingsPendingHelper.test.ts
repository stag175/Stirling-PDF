/**
 * Unit tests for settingsPendingHelper
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mergePendingSettings,
  isFieldPending,
  hasPendingChanges,
  getPendingValue,
  getCurrentValue,
} from "@app/utils/settingsPendingHelper";

describe("settingsPendingHelper", () => {
  // The module logs via console.log; silence and inspect it deterministically.
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe("mergePendingSettings", () => {
    test("returns settings unchanged (without _pending) when no _pending block", () => {
      const settings = { enableLogin: false, csrfDisabled: true };
      const result = mergePendingSettings(settings);

      expect(result).toEqual({ enableLogin: false, csrfDisabled: true });
      expect("_pending" in result).toBe(false);
    });

    test("strips an empty _pending block and keeps the rest", () => {
      const settings = { enableLogin: false, _pending: {} as any };
      const result = mergePendingSettings(settings);

      // Empty object is falsy-check passes (truthy), so it deep merges nothing
      // but the _pending key is removed from the result either way.
      expect(result).toEqual({ enableLogin: false });
      expect("_pending" in result).toBe(false);
    });

    test("overlays pending top-level values on top of current values", () => {
      const settings = {
        enableLogin: false,
        csrfDisabled: true,
        _pending: { enableLogin: true },
      };
      const result = mergePendingSettings(settings);

      expect(result).toEqual({ enableLogin: true, csrfDisabled: true });
      expect("_pending" in result).toBe(false);
    });

    test("deep merges nested objects, keeping untouched sibling keys", () => {
      const settings = {
        oauth2: { clientId: "abc", clientSecret: "old", enabled: false },
        other: { keep: 1 },
        _pending: {
          oauth2: { clientSecret: "new" },
        },
      };
      const result = mergePendingSettings(settings) as any;

      expect(result.oauth2).toEqual({
        clientId: "abc",
        clientSecret: "new",
        enabled: false,
      });
      expect(result.other).toEqual({ keep: 1 });
      expect("_pending" in result).toBe(false);
    });

    test("does not mutate the original settings object", () => {
      const settings = {
        oauth2: { clientSecret: "old" },
        _pending: { oauth2: { clientSecret: "new" } },
      };
      const snapshot = JSON.parse(JSON.stringify(settings));

      mergePendingSettings(settings);

      expect(settings).toEqual(snapshot);
      expect(settings.oauth2.clientSecret).toBe("old");
    });

    test("pending array replaces (does not merge into) the existing array", () => {
      const settings = {
        hosts: ["a", "b"],
        _pending: { hosts: ["c"] },
      };
      const result = mergePendingSettings(settings) as any;

      expect(result.hosts).toEqual(["c"]);
    });

    test("pending non-object value overwrites an existing object value", () => {
      const settings = {
        config: { nested: true },
        _pending: { config: "replaced" },
      };
      const result = mergePendingSettings(settings) as any;

      expect(result.config).toBe("replaced");
    });

    test("handles undefined settings by returning an empty object", () => {
      const result = mergePendingSettings(undefined as any);
      expect(result).toEqual({});
    });

    test("handles null settings by returning an empty object", () => {
      const result = mergePendingSettings(null as any);
      expect(result).toEqual({});
    });

    test("adds a brand-new key that only exists in _pending", () => {
      const settings = {
        existing: 1,
        _pending: { brandNew: 42 },
      };
      const result = mergePendingSettings(settings) as any;

      expect(result).toEqual({ existing: 1, brandNew: 42 });
    });
  });

  describe("isFieldPending", () => {
    test("returns false when settings is null", () => {
      expect(isFieldPending(null, "enableLogin")).toBe(false);
    });

    test("returns false when settings is undefined", () => {
      expect(isFieldPending(undefined, "enableLogin")).toBe(false);
    });

    test("returns false when there is no _pending block and logs a message", () => {
      const settings = { enableLogin: false };
      expect(isFieldPending(settings, "enableLogin")).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(
        "[isFieldPending] No _pending block found for field: enableLogin",
      );
    });

    test("returns true for a top-level pending field and logs its value", () => {
      const settings = { _pending: { enableLogin: true } };
      expect(isFieldPending(settings, "enableLogin")).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        "[isFieldPending] Field enableLogin IS pending with value:",
        true,
      );
    });

    test("returns true for a nested pending field via dot-notation", () => {
      const settings = { _pending: { oauth2: { clientSecret: "new" } } };
      expect(isFieldPending(settings, "oauth2.clientSecret")).toBe(true);
    });

    test("returns false when the dot-path field is absent from _pending", () => {
      const settings = { _pending: { oauth2: { clientId: "abc" } } };
      expect(isFieldPending(settings, "oauth2.clientSecret")).toBe(false);
    });

    test("returns false when an intermediate path segment is missing", () => {
      const settings = { _pending: { oauth2: { clientId: "abc" } } };
      expect(isFieldPending(settings, "saml.entityId")).toBe(false);
    });

    test("treats a pending value of false as pending (undefined is the only non-pending sentinel)", () => {
      const settings = { _pending: { enableLogin: false } };
      expect(isFieldPending(settings, "enableLogin")).toBe(true);
    });

    test("treats a pending value of null as pending", () => {
      const settings = { _pending: { token: null } };
      expect(isFieldPending(settings, "token")).toBe(true);
    });

    test("returns false when the pending value is explicitly undefined", () => {
      const settings = { _pending: { token: undefined } };
      expect(isFieldPending(settings, "token")).toBe(false);
    });
  });

  describe("hasPendingChanges", () => {
    test("returns false when settings is null", () => {
      expect(hasPendingChanges(null)).toBe(false);
    });

    test("returns false when settings is undefined", () => {
      expect(hasPendingChanges(undefined)).toBe(false);
    });

    test("returns false when there is no _pending block", () => {
      expect(hasPendingChanges({ enableLogin: false })).toBe(false);
    });

    test("returns false when _pending is an empty object", () => {
      expect(hasPendingChanges({ _pending: {} })).toBe(false);
    });

    test("returns true when _pending has at least one key", () => {
      expect(hasPendingChanges({ _pending: { enableLogin: true } })).toBe(true);
    });

    test("returns true even when the only pending key holds an undefined value", () => {
      // hasPendingChanges only inspects key count, not values.
      expect(hasPendingChanges({ _pending: { token: undefined } })).toBe(true);
    });
  });

  describe("getPendingValue", () => {
    test("returns undefined when settings is null", () => {
      expect(getPendingValue(null, "enableLogin")).toBeUndefined();
    });

    test("returns undefined when settings is undefined", () => {
      expect(getPendingValue(undefined, "enableLogin")).toBeUndefined();
    });

    test("returns undefined when there is no _pending block", () => {
      expect(
        getPendingValue({ enableLogin: false }, "enableLogin"),
      ).toBeUndefined();
    });

    test("returns the top-level pending value when present", () => {
      const settings = { _pending: { enableLogin: true } };
      expect(getPendingValue(settings, "enableLogin")).toBe(true);
    });

    test("returns a nested pending value via dot-notation", () => {
      const settings = { _pending: { oauth2: { clientSecret: "new" } } };
      expect(getPendingValue(settings, "oauth2.clientSecret")).toBe("new");
    });

    test("returns undefined for a field not present in _pending", () => {
      const settings = { _pending: { oauth2: { clientId: "abc" } } };
      expect(getPendingValue(settings, "oauth2.clientSecret")).toBeUndefined();
    });

    test("returns falsy pending values verbatim (0, false, empty string)", () => {
      const settings = {
        _pending: { count: 0, flag: false, name: "" },
      };
      expect(getPendingValue(settings, "count")).toBe(0);
      expect(getPendingValue(settings, "flag")).toBe(false);
      expect(getPendingValue(settings, "name")).toBe("");
    });
  });

  describe("getCurrentValue", () => {
    test("returns undefined when settings is null", () => {
      expect(getCurrentValue(null, "enableLogin")).toBeUndefined();
    });

    test("returns undefined when settings is undefined", () => {
      expect(getCurrentValue(undefined, "enableLogin")).toBeUndefined();
    });

    test("returns the active top-level value ignoring any pending override", () => {
      const settings = {
        enableLogin: false,
        _pending: { enableLogin: true },
      };
      expect(getCurrentValue(settings, "enableLogin")).toBe(false);
    });

    test("returns a nested active value via dot-notation", () => {
      const settings = {
        oauth2: { clientSecret: "old" },
        _pending: { oauth2: { clientSecret: "new" } },
      };
      expect(getCurrentValue(settings, "oauth2.clientSecret")).toBe("old");
    });

    test("never reads from the _pending block even for pending-only keys", () => {
      const settings = {
        existing: 1,
        _pending: { brandNew: 42 },
      };
      expect(getCurrentValue(settings, "brandNew")).toBeUndefined();
    });

    test("returns undefined for a path that does not exist", () => {
      const settings = { oauth2: { clientId: "abc" } };
      expect(getCurrentValue(settings, "oauth2.missing")).toBeUndefined();
    });

    test("returns undefined when given an empty field path", () => {
      const settings = { enableLogin: true };
      expect(getCurrentValue(settings, "")).toBeUndefined();
    });
  });
});
