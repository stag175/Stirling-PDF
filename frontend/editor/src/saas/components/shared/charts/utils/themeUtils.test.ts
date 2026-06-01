import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectTheme,
  getChartThemeVars,
  applyTooltipStyles,
} from "@app/components/shared/charts/utils/themeUtils";

/**
 * themeUtils.ts reads two ambient inputs and writes element styles, all of
 * which jsdom (vitest's configured environment) makes controllable:
 *
 *  1. `document.documentElement.getAttribute("data-mantine-color-scheme")` —
 *     set/removed per test so the `schemeAttr ? ... : prefersDark` branch and
 *     the `schemeAttr === "dark"` comparison are both exercised.
 *  2. `window.matchMedia("(prefers-color-scheme: dark)").matches` — the saas
 *     setupTests already installs a `matchMedia` stub returning `matches:false`.
 *     We override it per test (saving/restoring the original) to drive the
 *     `prefersDark` fallback branch in both light and dark directions.
 *
 * `getChartThemeVars` is pure (isDark -> object), and `applyTooltipStyles`
 * delegates to it then writes deterministic style strings onto a real jsdom
 * element, so every assertion is fully deterministic. No network/storage/SDK
 * dependencies exist in this module, so nothing needs to be mocked beyond the
 * ambient DOM/matchMedia inputs above.
 */

const SCHEME_ATTR = "data-mantine-color-scheme";

/** Build a matchMedia stub whose `(prefers-color-scheme: dark)` reports `dark`. */
function matchMediaReturning(dark: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("themeUtils", () => {
  describe("detectTheme", () => {
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      // Start each test with no explicit scheme attribute.
      document.documentElement.removeAttribute(SCHEME_ATTR);
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      document.documentElement.removeAttribute(SCHEME_ATTR);
    });

    it("reports dark when the mantine color-scheme attribute is 'dark'", () => {
      // System preference is light to prove the attribute wins over matchMedia.
      window.matchMedia = matchMediaReturning(false);
      document.documentElement.setAttribute(SCHEME_ATTR, "dark");

      const info = detectTheme();

      expect(info.isDark).toBe(true);
      expect(info.schemeAttr).toBe("dark");
      expect(info.prefersDark).toBe(false);
    });

    it("reports light when the attribute is 'light' even if the system prefers dark", () => {
      // matchMedia says dark, but the explicit attribute overrides it.
      window.matchMedia = matchMediaReturning(true);
      document.documentElement.setAttribute(SCHEME_ATTR, "light");

      const info = detectTheme();

      expect(info.isDark).toBe(false);
      expect(info.schemeAttr).toBe("light");
      // prefersDark is still surfaced verbatim regardless of the override.
      expect(info.prefersDark).toBe(true);
    });

    it("treats any non-'dark' attribute value (e.g. 'auto') as light", () => {
      window.matchMedia = matchMediaReturning(true);
      document.documentElement.setAttribute(SCHEME_ATTR, "auto");

      const info = detectTheme();

      // schemeAttr is truthy but !== "dark", so isDark resolves to false.
      expect(info.isDark).toBe(false);
      expect(info.schemeAttr).toBe("auto");
    });

    it("falls back to system dark preference when no attribute is present", () => {
      window.matchMedia = matchMediaReturning(true);

      const info = detectTheme();

      // No attribute -> schemeAttr is null -> isDark follows prefersDark (true).
      expect(info.schemeAttr).toBeNull();
      expect(info.prefersDark).toBe(true);
      expect(info.isDark).toBe(true);
    });

    it("falls back to system light preference when no attribute is present", () => {
      window.matchMedia = matchMediaReturning(false);

      const info = detectTheme();

      expect(info.schemeAttr).toBeNull();
      expect(info.prefersDark).toBe(false);
      expect(info.isDark).toBe(false);
    });

    it("queries matchMedia specifically for the prefers-color-scheme: dark feature", () => {
      const stub = matchMediaReturning(false);
      window.matchMedia = stub;

      detectTheme();

      expect(stub).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    });

    it("yields a falsy prefersDark when matchMedia is unavailable", () => {
      // The `window.matchMedia && ...` short-circuit guards a missing API: it
      // returns `window.matchMedia` itself (undefined here), so prefersDark is
      // undefined rather than literal false — assert falsiness, not equality.
      // @ts-expect-error -- intentionally removing the API to hit the guard.
      window.matchMedia = undefined;

      const info = detectTheme();

      expect(info.prefersDark).toBeFalsy();
      // No attribute + falsy prefersDark -> not dark.
      expect(info.isDark).toBeFalsy();
    });

    it("still honors a 'dark' attribute when matchMedia is unavailable", () => {
      // @ts-expect-error -- intentionally removing the API to hit the guard.
      window.matchMedia = undefined;
      document.documentElement.setAttribute(SCHEME_ATTR, "dark");

      const info = detectTheme();

      expect(info.prefersDark).toBeFalsy();
      // The explicit "dark" attribute takes precedence over the fallback.
      expect(info.isDark).toBe(true);
    });

    it("is deterministic for repeated calls with identical ambient inputs", () => {
      window.matchMedia = matchMediaReturning(true);
      document.documentElement.setAttribute(SCHEME_ATTR, "dark");

      expect(detectTheme()).toEqual(detectTheme());
    });
  });

  describe("getChartThemeVars", () => {
    it("returns dark-specific border and boxShadow when isDark is true", () => {
      const vars = getChartThemeVars(true);

      expect(vars).toEqual({
        background: "var(--bg-surface)",
        textPrimary: "var(--text-primary)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "none",
        inactive: "var(--usage-inactive)",
        cardBorder: "var(--api-keys-card-border)",
      });
    });

    it("returns light-specific border and boxShadow when isDark is false", () => {
      const vars = getChartThemeVars(false);

      expect(vars).toEqual({
        background: "var(--bg-surface)",
        textPrimary: "var(--text-primary)",
        border: "1px solid transparent",
        boxShadow: "var(--shadow-md)",
        inactive: "var(--usage-inactive)",
        cardBorder: "var(--api-keys-card-border)",
      });
    });

    it("keeps the theme-independent vars identical across both themes", () => {
      const dark = getChartThemeVars(true);
      const light = getChartThemeVars(false);

      expect(dark.background).toBe(light.background);
      expect(dark.textPrimary).toBe(light.textPrimary);
      expect(dark.inactive).toBe(light.inactive);
      expect(dark.cardBorder).toBe(light.cardBorder);
    });

    it("only the border and boxShadow differ between dark and light", () => {
      const dark = getChartThemeVars(true);
      const light = getChartThemeVars(false);

      expect(dark.border).not.toBe(light.border);
      expect(dark.boxShadow).not.toBe(light.boxShadow);
    });
  });

  describe("applyTooltipStyles", () => {
    let tooltip: HTMLElement;

    beforeEach(() => {
      tooltip = document.createElement("div");
    });

    it("applies the dark-theme border and removes the box shadow", () => {
      applyTooltipStyles(tooltip, true);

      expect(tooltip.style.border).toBe("1px solid var(--border-subtle)");
      expect(tooltip.style.boxShadow).toBe("none");
    });

    it("applies the light-theme transparent border and the elevation shadow", () => {
      applyTooltipStyles(tooltip, false);

      expect(tooltip.style.border).toBe("1px solid transparent");
      expect(tooltip.style.boxShadow).toBe("var(--shadow-md)");
    });

    it("sets the theme-independent background and text color from the vars", () => {
      applyTooltipStyles(tooltip, false);

      expect(tooltip.style.background).toBe("var(--bg-surface)");
      expect(tooltip.style.color).toBe("var(--text-primary)");
    });

    it("sets the fixed typography and spacing styles regardless of theme", () => {
      applyTooltipStyles(tooltip, true);

      expect(tooltip.style.padding).toBe("8px 10px");
      expect(tooltip.style.fontSize).toBe("12px");
      expect(tooltip.style.lineHeight).toBe("1.25");
      expect(tooltip.style.borderRadius).toBe("8px");
    });

    it("overwrites previously set styles on a second application (theme switch)", () => {
      applyTooltipStyles(tooltip, true);
      expect(tooltip.style.boxShadow).toBe("none");

      // Re-apply with the opposite theme; the light values must replace the dark.
      applyTooltipStyles(tooltip, false);
      expect(tooltip.style.border).toBe("1px solid transparent");
      expect(tooltip.style.boxShadow).toBe("var(--shadow-md)");
    });

    it("derives its border/shadow from getChartThemeVars for the same isDark", () => {
      // Cross-check that the writer mirrors the pure var generator exactly.
      const vars = getChartThemeVars(true);
      applyTooltipStyles(tooltip, true);

      expect(tooltip.style.background).toBe(vars.background);
      expect(tooltip.style.color).toBe(vars.textPrimary);
      expect(tooltip.style.border).toBe(vars.border);
      expect(tooltip.style.boxShadow).toBe(vars.boxShadow);
    });
  });
});
