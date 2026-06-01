import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isMacLike,
  isModifierCode,
  bindingEquals,
  bindingMatchesEvent,
  eventToBinding,
  getDisplayParts,
  serializeBindings,
  deserializeBindings,
  normalizeBinding,
  type HotkeyBinding,
} from "@app/utils/hotkeys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal KeyboardEvent-shaped object. The module only ever reads
 * `code`, `altKey`, `ctrlKey`, `metaKey` and `shiftKey`, so a plain object cast
 * is deterministic and avoids jsdom KeyboardEvent constructor quirks.
 */
const makeEvent = (
  partial: Partial<{
    code: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }>,
): KeyboardEvent =>
  ({
    code: partial.code ?? "",
    altKey: partial.altKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  }) as KeyboardEvent;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// isMacLike
// ---------------------------------------------------------------------------

describe("isMacLike", () => {
  it("1) returns true when navigator.platform matches mac", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Some/UA");
    expect(isMacLike()).toBe(true);
  });

  it("2) returns true for an iPhone platform", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("iPhone");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("");
    expect(isMacLike()).toBe(true);
  });

  it("3) returns true when only the userAgent matches (iPad)", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPad; CPU OS) Safari",
    );
    expect(isMacLike()).toBe(true);
  });

  it("4) returns false for a Windows platform and UA", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0)",
    );
    expect(isMacLike()).toBe(false);
  });

  it("5) treats undefined platform/userAgent as empty strings (false)", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(
      undefined as unknown as string,
    );
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      undefined as unknown as string,
    );
    expect(isMacLike()).toBe(false);
  });

  it("6) returns false when navigator is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isMacLike()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isModifierCode
// ---------------------------------------------------------------------------

describe("isModifierCode", () => {
  it("7) returns true for every known modifier code", () => {
    const codes = [
      "ShiftLeft",
      "ShiftRight",
      "ControlLeft",
      "ControlRight",
      "AltLeft",
      "AltRight",
      "MetaLeft",
      "MetaRight",
    ];
    for (const code of codes) {
      expect(isModifierCode(code)).toBe(true);
    }
  });

  it("8) returns false for non-modifier codes", () => {
    expect(isModifierCode("KeyA")).toBe(false);
    expect(isModifierCode("Digit1")).toBe(false);
    expect(isModifierCode("")).toBe(false);
    expect(isModifierCode("Shift")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bindingEquals
// ---------------------------------------------------------------------------

describe("bindingEquals", () => {
  it("9) returns true when both bindings are null/undefined", () => {
    expect(bindingEquals(null, null)).toBe(true);
    expect(bindingEquals(undefined, undefined)).toBe(true);
    expect(bindingEquals(null, undefined)).toBe(true);
  });

  it("10) returns false when exactly one side is missing", () => {
    const b: HotkeyBinding = { code: "KeyA" };
    expect(bindingEquals(b, null)).toBe(false);
    expect(bindingEquals(null, b)).toBe(false);
    expect(bindingEquals(b, undefined)).toBe(false);
    expect(bindingEquals(undefined, b)).toBe(false);
  });

  it("11) returns true for identical bindings", () => {
    const a: HotkeyBinding = { code: "KeyS", ctrl: true, shift: true };
    const b: HotkeyBinding = { code: "KeyS", ctrl: true, shift: true };
    expect(bindingEquals(a, b)).toBe(true);
  });

  it("12) treats missing modifier flags as false (coercion)", () => {
    const a: HotkeyBinding = { code: "KeyS" };
    const b: HotkeyBinding = {
      code: "KeyS",
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
    };
    expect(bindingEquals(a, b)).toBe(true);
  });

  it("13) returns false when codes differ", () => {
    expect(bindingEquals({ code: "KeyA" }, { code: "KeyB" })).toBe(false);
  });

  it("14) returns false when any single modifier differs", () => {
    const base: HotkeyBinding = {
      code: "KeyA",
      alt: true,
      ctrl: true,
      meta: true,
      shift: true,
    };
    expect(bindingEquals(base, { ...base, alt: false })).toBe(false);
    expect(bindingEquals(base, { ...base, ctrl: false })).toBe(false);
    expect(bindingEquals(base, { ...base, meta: false })).toBe(false);
    expect(bindingEquals(base, { ...base, shift: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bindingMatchesEvent
// ---------------------------------------------------------------------------

describe("bindingMatchesEvent", () => {
  it("15) matches when code and all modifiers line up", () => {
    const binding: HotkeyBinding = { code: "KeyS", ctrl: true };
    const event = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(bindingMatchesEvent(binding, event)).toBe(true);
  });

  it("16) requires absent modifiers to also be absent on the event", () => {
    const binding: HotkeyBinding = { code: "KeyS", ctrl: true };
    // Event additionally has shift held -> no match.
    const event = makeEvent({ code: "KeyS", ctrlKey: true, shiftKey: true });
    expect(bindingMatchesEvent(binding, event)).toBe(false);
  });

  it("17) returns false when the code differs", () => {
    const binding: HotkeyBinding = { code: "KeyS", ctrl: true };
    const event = makeEvent({ code: "KeyD", ctrlKey: true });
    expect(bindingMatchesEvent(binding, event)).toBe(false);
  });

  it("18) returns false when a required modifier is missing on the event", () => {
    const binding: HotkeyBinding = { code: "KeyS", ctrl: true, alt: true };
    const event = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(bindingMatchesEvent(binding, event)).toBe(false);
  });

  it("19) matches an all-modifiers-true binding against a matching event", () => {
    const binding: HotkeyBinding = {
      code: "KeyZ",
      alt: true,
      ctrl: true,
      meta: true,
      shift: true,
    };
    const event = makeEvent({
      code: "KeyZ",
      altKey: true,
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
    });
    expect(bindingMatchesEvent(binding, event)).toBe(true);
  });

  it("20) matches a no-modifier binding only when the event has none", () => {
    const binding: HotkeyBinding = { code: "Enter" };
    expect(bindingMatchesEvent(binding, makeEvent({ code: "Enter" }))).toBe(
      true,
    );
    expect(
      bindingMatchesEvent(binding, makeEvent({ code: "Enter", metaKey: true })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// eventToBinding
// ---------------------------------------------------------------------------

describe("eventToBinding", () => {
  it("21) returns null when the event has no code", () => {
    expect(eventToBinding(makeEvent({ code: "" }))).toBeNull();
  });

  it("22) returns null for a bare modifier code", () => {
    expect(
      eventToBinding(makeEvent({ code: "ShiftLeft", shiftKey: true })),
    ).toBeNull();
    expect(
      eventToBinding(makeEvent({ code: "ControlRight", ctrlKey: true })),
    ).toBeNull();
  });

  it("23) returns null when no alt/ctrl/meta modifier is held", () => {
    // Plain letter, no modifiers -> rejected to avoid clashing with typing.
    expect(eventToBinding(makeEvent({ code: "KeyA" }))).toBeNull();
  });

  it("24) returns null when only shift is held (shift alone is insufficient)", () => {
    expect(
      eventToBinding(makeEvent({ code: "KeyA", shiftKey: true })),
    ).toBeNull();
  });

  it("25) builds a binding when ctrl is held", () => {
    const result = eventToBinding(makeEvent({ code: "KeyS", ctrlKey: true }));
    expect(result).toEqual({
      code: "KeyS",
      alt: false,
      ctrl: true,
      meta: false,
      shift: false,
    });
  });

  it("26) builds a binding when alt is held", () => {
    const result = eventToBinding(makeEvent({ code: "KeyF", altKey: true }));
    expect(result).toEqual({
      code: "KeyF",
      alt: true,
      ctrl: false,
      meta: false,
      shift: false,
    });
  });

  it("27) builds a binding when meta is held", () => {
    const result = eventToBinding(makeEvent({ code: "KeyP", metaKey: true }));
    expect(result).toEqual({
      code: "KeyP",
      alt: false,
      ctrl: false,
      meta: true,
      shift: false,
    });
  });

  it("28) captures shift alongside a primary modifier", () => {
    const result = eventToBinding(
      makeEvent({ code: "KeyZ", ctrlKey: true, shiftKey: true }),
    );
    expect(result).toEqual({
      code: "KeyZ",
      alt: false,
      ctrl: true,
      meta: false,
      shift: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getDisplayParts (and its private getKeyLabel via the public surface)
// ---------------------------------------------------------------------------

describe("getDisplayParts", () => {
  it("29) returns an empty array for null/undefined bindings", () => {
    expect(getDisplayParts(null, true)).toEqual([]);
    expect(getDisplayParts(undefined, false)).toEqual([]);
  });

  it("30) renders mac modifier glyphs in meta/ctrl/alt/shift order", () => {
    const binding: HotkeyBinding = {
      code: "KeyA",
      meta: true,
      ctrl: true,
      alt: true,
      shift: true,
    };
    expect(getDisplayParts(binding, true)).toEqual(["⌘", "⌃", "⌥", "⇧", "A"]);
  });

  it("31) renders non-mac modifier words", () => {
    const binding: HotkeyBinding = {
      code: "KeyA",
      meta: true,
      ctrl: true,
      alt: true,
      shift: true,
    };
    expect(getDisplayParts(binding, false)).toEqual([
      "Win",
      "Ctrl",
      "Alt",
      "Shift",
      "A",
    ]);
  });

  it("32) omits modifier glyphs that are not set", () => {
    expect(getDisplayParts({ code: "KeyB", ctrl: true }, false)).toEqual([
      "Ctrl",
      "B",
    ]);
    expect(getDisplayParts({ code: "KeyB" }, true)).toEqual(["B"]);
  });

  it("33) maps punctuation codes through CODE_LABEL_MAP", () => {
    const cases: Array<[string, string]> = [
      ["Minus", "-"],
      ["Equal", "="],
      ["Backquote", "`"],
      ["BracketLeft", "["],
      ["BracketRight", "]"],
      ["Backslash", "\\"],
      ["IntlBackslash", "\\"],
      ["Semicolon", ";"],
      ["Quote", "'"],
      ["Comma", ","],
      ["Period", "."],
      ["Slash", "/"],
      ["Space", "Space"],
      ["Tab", "Tab"],
      ["Escape", "Esc"],
      ["Enter", "Enter"],
    ];
    for (const [code, label] of cases) {
      expect(getDisplayParts({ code }, false)).toEqual([label]);
    }
  });

  it("34) maps the numpad named codes through CODE_LABEL_MAP", () => {
    const cases: Array<[string, string]> = [
      ["NumpadEnter", "Num Enter"],
      ["NumpadAdd", "Num +"],
      ["NumpadSubtract", "Num -"],
      ["NumpadMultiply", "Num *"],
      ["NumpadDivide", "Num /"],
      ["NumpadDecimal", "Num ."],
      ["NumpadComma", "Num ,"],
      ["NumpadEqual", "Num ="],
    ];
    for (const [code, label] of cases) {
      expect(getDisplayParts({ code }, false)).toEqual([label]);
    }
  });

  it("35) strips the Key prefix from letter codes", () => {
    expect(getDisplayParts({ code: "KeyZ" }, false)).toEqual(["Z"]);
  });

  it("36) strips the Digit prefix from number-row codes", () => {
    expect(getDisplayParts({ code: "Digit7" }, false)).toEqual(["7"]);
  });

  it("37) labels numeric numpad codes as 'Num N'", () => {
    expect(getDisplayParts({ code: "Numpad0" }, false)).toEqual(["Num 0"]);
    expect(getDisplayParts({ code: "Numpad9" }, false)).toEqual(["Num 9"]);
  });

  it("38) labels non-numeric numpad codes (no CODE_LABEL_MAP entry) as 'Num X'", () => {
    // "NumpadX" is not in the map and the remainder is not a digit, hitting the
    // second `Num ${remainder}` branch inside the Numpad handler.
    expect(getDisplayParts({ code: "NumpadX" }, false)).toEqual(["Num X"]);
  });

  it("39) returns function key codes unchanged (F1-F12)", () => {
    expect(getDisplayParts({ code: "F1" }, false)).toEqual(["F1"]);
    expect(getDisplayParts({ code: "F12" }, false)).toEqual(["F12"]);
  });

  it("40) maps the four arrow codes to glyphs", () => {
    expect(getDisplayParts({ code: "ArrowUp" }, false)).toEqual(["↑"]);
    expect(getDisplayParts({ code: "ArrowDown" }, false)).toEqual(["↓"]);
    expect(getDisplayParts({ code: "ArrowLeft" }, false)).toEqual(["←"]);
    expect(getDisplayParts({ code: "ArrowRight" }, false)).toEqual(["→"]);
  });

  it("41) falls back to the raw code for anything unrecognised", () => {
    expect(getDisplayParts({ code: "Home" }, false)).toEqual(["Home"]);
    expect(getDisplayParts({ code: "PageDown" }, false)).toEqual(["PageDown"]);
    // F0 / F123 are outside the F\d{1,2} pattern -> raw fallthrough.
    expect(getDisplayParts({ code: "F123" }, false)).toEqual(["F123"]);
  });

  it("42) combines modifiers with a mapped key label", () => {
    expect(
      getDisplayParts({ code: "Slash", ctrl: true, shift: true }, true),
    ).toEqual(["⌃", "⇧", "/"]);
  });
});

// ---------------------------------------------------------------------------
// serializeBindings / deserializeBindings round-trip
// ---------------------------------------------------------------------------

describe("serializeBindings", () => {
  it("43) serialises a binding map to JSON", () => {
    const map: Record<string, HotkeyBinding> = {
      save: { code: "KeyS", ctrl: true },
    };
    expect(serializeBindings(map)).toBe(JSON.stringify(map));
  });

  it("44) serialises an empty map", () => {
    expect(serializeBindings({})).toBe("{}");
  });
});

describe("deserializeBindings", () => {
  it("45) returns an empty object for null/undefined/empty input", () => {
    expect(deserializeBindings(null)).toEqual({});
    expect(deserializeBindings(undefined)).toEqual({});
    expect(deserializeBindings("")).toEqual({});
  });

  it("46) parses a valid JSON object", () => {
    const map: Record<string, HotkeyBinding> = {
      undo: { code: "KeyZ", ctrl: true },
      redo: { code: "KeyY", ctrl: true },
    };
    expect(deserializeBindings(JSON.stringify(map))).toEqual(map);
  });

  it("47) returns an empty object when JSON parses to null", () => {
    expect(deserializeBindings("null")).toEqual({});
  });

  it("48) returns an empty object when JSON parses to a non-object", () => {
    expect(deserializeBindings("42")).toEqual({});
    expect(deserializeBindings('"a string"')).toEqual({});
  });

  it("49) logs a warning and returns an empty object on malformed JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deserializeBindings("{not valid json")).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Failed to parse stored hotkey bindings",
      expect.any(Error),
    );
  });

  it("50) round-trips through serialize -> deserialize", () => {
    const map: Record<string, HotkeyBinding> = {
      save: { code: "KeyS", ctrl: true, shift: false },
      open: { code: "KeyO", meta: true },
    };
    expect(deserializeBindings(serializeBindings(map))).toEqual(map);
  });
});

// ---------------------------------------------------------------------------
// normalizeBinding
// ---------------------------------------------------------------------------

describe("normalizeBinding", () => {
  it("51) fills in all modifier flags as explicit booleans", () => {
    expect(normalizeBinding({ code: "KeyA" })).toEqual({
      code: "KeyA",
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
    });
  });

  it("52) coerces truthy/falsy modifier values to booleans", () => {
    const input = {
      code: "KeyB",
      alt: 1 as unknown as boolean,
      ctrl: 0 as unknown as boolean,
      meta: true,
      shift: undefined,
    };
    expect(normalizeBinding(input)).toEqual({
      code: "KeyB",
      alt: true,
      ctrl: false,
      meta: true,
      shift: false,
    });
  });

  it("53) preserves the code verbatim", () => {
    expect(normalizeBinding({ code: "ArrowLeft", shift: true }).code).toBe(
      "ArrowLeft",
    );
  });

  it("54) produces an equal binding that passes bindingEquals", () => {
    const raw: HotkeyBinding = { code: "KeyS", ctrl: true };
    expect(bindingEquals(normalizeBinding(raw), raw)).toBe(true);
  });
});
