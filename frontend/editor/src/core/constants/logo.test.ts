import { describe, expect, it } from "vitest";

import {
  ensureLogoVariant,
  getLogoFolder,
  LOGO_FOLDER_BY_VARIANT,
} from "@app/constants/logo";

describe("ensureLogoVariant", () => {
  it("passes through the two known variants", () => {
    expect(ensureLogoVariant("classic")).toBe("classic");
    expect(ensureLogoVariant("modern")).toBe("modern");
  });

  it("treats only the exact string 'classic' as classic", () => {
    expect(ensureLogoVariant("Classic")).toBe("modern");
    expect(ensureLogoVariant("classic ")).toBe("modern");
    expect(ensureLogoVariant("anything-else")).toBe("modern");
  });

  it("defaults nullish input to modern", () => {
    expect(ensureLogoVariant(undefined)).toBe("modern");
    expect(ensureLogoVariant(null)).toBe("modern");
    expect(ensureLogoVariant("")).toBe("modern");
  });
});

describe("getLogoFolder", () => {
  it("maps each variant to its asset folder", () => {
    expect(getLogoFolder("classic")).toBe("classic-logo");
    expect(getLogoFolder("modern")).toBe("modern-logo");
  });

  it("falls back to the modern folder for nullish input", () => {
    expect(getLogoFolder(undefined)).toBe("modern-logo");
    expect(getLogoFolder(null)).toBe("modern-logo");
  });

  it("is consistent with the exported lookup table", () => {
    expect(LOGO_FOLDER_BY_VARIANT).toEqual({
      modern: "modern-logo",
      classic: "classic-logo",
    });
    expect(getLogoFolder("classic")).toBe(LOGO_FOLDER_BY_VARIANT.classic);
  });
});
