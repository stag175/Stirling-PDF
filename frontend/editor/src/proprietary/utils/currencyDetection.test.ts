import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectCurrencyFromLocale,
  getCachedCurrency,
  setCachedCurrency,
  getPreferredCurrency,
} from "@app/utils/currencyDetection";

const STORAGE_KEY = "preferredCurrency";

describe("currencyDetection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("detectCurrencyFromLocale", () => {
    it("returns the exact-match currency for mapped locales", () => {
      expect(detectCurrencyFromLocale("en-US")).toBe("usd");
      expect(detectCurrencyFromLocale("en-GB")).toBe("gbp");
      expect(detectCurrencyFromLocale("de-DE")).toBe("eur");
      expect(detectCurrencyFromLocale("zh-CN")).toBe("cny");
      expect(detectCurrencyFromLocale("hi-IN")).toBe("inr");
      expect(detectCurrencyFromLocale("pt-BR")).toBe("brl");
      expect(detectCurrencyFromLocale("id-ID")).toBe("idr");
    });

    it("maps major non-Western locales that intentionally default to USD", () => {
      expect(detectCurrencyFromLocale("ja-JP")).toBe("usd");
      expect(detectCurrencyFromLocale("ko-KR")).toBe("usd");
      expect(detectCurrencyFromLocale("ru-RU")).toBe("usd");
      expect(detectCurrencyFromLocale("tr-TR")).toBe("usd");
    });

    it("distinguishes region variants that share a language but differ in currency", () => {
      // en-* spans several currencies depending on region.
      expect(detectCurrencyFromLocale("en-CA")).toBe("usd");
      expect(detectCurrencyFromLocale("en-IE")).toBe("eur");
      expect(detectCurrencyFromLocale("en-IN")).toBe("inr");
      // pt-PT (eur) vs pt-BR (brl)
      expect(detectCurrencyFromLocale("pt-PT")).toBe("eur");
      expect(detectCurrencyFromLocale("pt-BR")).toBe("brl");
    });

    it("falls back to the first language-prefix match for an unmapped region", () => {
      // No exact "de-XX" entry, but the language code "de" matches "de-DE" (eur),
      // which is the first "de-" key in insertion order.
      expect(detectCurrencyFromLocale("de-XX")).toBe("eur");
      // "fr-XX" -> first "fr-" key is "fr-FR" (eur).
      expect(detectCurrencyFromLocale("fr-XX")).toBe("eur");
      // "zh-XX" -> first "zh-" key is "zh-CN" (cny).
      expect(detectCurrencyFromLocale("zh-XX")).toBe("cny");
    });

    it("falls back to the language prefix when given only a bare language code", () => {
      // "en" has no exact entry; the prefix search finds the first "en-" key
      // ("en-US" -> usd) in insertion order.
      expect(detectCurrencyFromLocale("en")).toBe("usd");
      // "de" prefix-matches "de-DE" -> eur.
      expect(detectCurrencyFromLocale("de")).toBe("eur");
    });

    it("defaults to USD for an entirely unknown language code", () => {
      expect(detectCurrencyFromLocale("xx-YY")).toBe("usd");
      expect(detectCurrencyFromLocale("zz")).toBe("usd");
    });

    it("defaults to USD for an empty locale string", () => {
      // "".split("-")[0] is "", and the exact lookup misses; the prefix search
      // would match the first key, but the empty-string exact key is falsy so
      // we land on the empty-prefix branch returning the first key (en-US -> usd).
      expect(detectCurrencyFromLocale("")).toBe("usd");
    });

    it("is case-sensitive: a differently-cased locale falls through to prefix/default", () => {
      // "EN-US" has no exact entry and "EN" prefix-matches nothing, so default USD.
      expect(detectCurrencyFromLocale("EN-US")).toBe("usd");
      // "DE-de" -> language code "DE" matches no key -> default USD.
      expect(detectCurrencyFromLocale("DE-de")).toBe("usd");
    });
  });

  describe("getCachedCurrency", () => {
    it("returns null when nothing is cached", () => {
      expect(getCachedCurrency()).toBeNull();
    });

    it("returns the cached value when present", () => {
      localStorage.setItem(STORAGE_KEY, "gbp");
      expect(getCachedCurrency()).toBe("gbp");
    });

    it("returns null and warns when localStorage.getItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const getItemSpy = vi
        .spyOn(window.localStorage, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });

      expect(getCachedCurrency()).toBeNull();
      expect(warnSpy).toHaveBeenCalled();

      getItemSpy.mockRestore();
    });
  });

  describe("setCachedCurrency", () => {
    it("persists the currency to localStorage", () => {
      setCachedCurrency("eur");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("eur");
    });

    it("overwrites a previously cached value", () => {
      setCachedCurrency("usd");
      setCachedCurrency("cny");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("cny");
    });

    it("swallows errors and warns when localStorage.setItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const setItemSpy = vi
        .spyOn(window.localStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("quota exceeded");
        });

      expect(() => setCachedCurrency("eur")).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      setItemSpy.mockRestore();
    });
  });

  describe("getPreferredCurrency", () => {
    it("returns the cached currency without consulting locale detection", () => {
      localStorage.setItem(STORAGE_KEY, "gbp");
      // Pass a locale that would detect to "eur" to prove the cache wins.
      expect(getPreferredCurrency("de-DE")).toBe("gbp");
      // The cache must be untouched (still the user preference).
      expect(localStorage.getItem(STORAGE_KEY)).toBe("gbp");
    });

    it("detects from locale and caches the result when nothing is cached", () => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      const result = getPreferredCurrency("en-GB");

      expect(result).toBe("gbp");
      // Detection result is written back for future visits.
      expect(localStorage.getItem(STORAGE_KEY)).toBe("gbp");
    });

    it("caches the USD fallback when the locale is unknown", () => {
      const result = getPreferredCurrency("xx-YY");

      expect(result).toBe("usd");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("usd");
    });

    it("returns the freshly detected value on the second call (now from cache)", () => {
      // First call detects + caches.
      expect(getPreferredCurrency("de-DE")).toBe("eur");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("eur");

      // Second call should return the cached value even if locale changes.
      expect(getPreferredCurrency("zh-CN")).toBe("eur");
    });

    it("falls through to detection when reading the cache throws, without crashing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const getItemSpy = vi
        .spyOn(window.localStorage, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });

      // getCachedCurrency returns null on error, so detection runs.
      expect(getPreferredCurrency("en-GB")).toBe("gbp");
      expect(warnSpy).toHaveBeenCalled();

      getItemSpy.mockRestore();
    });
  });
});
