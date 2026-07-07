import { describe, it, expect } from "vitest";
import {
  mapBrowserLanguageToOcr,
  getOcrDisplayName,
  getOcrCodeFromDisplayName,
  getBrowserLanguagesForOcr,
  getAutoOcrLanguage,
  getAllLanguageDefinitions,
  tempOcrLanguages,
} from "@app/utils/languageMapping";

describe("languageMapping", () => {
  describe("mapBrowserLanguageToOcr", () => {
    it("1) returns null for empty string input", () => {
      expect(mapBrowserLanguageToOcr("")).toBeNull();
    });

    it("2) returns null for missing/undefined-like falsy input", () => {
      // The function guards with `if (!browserLanguage)` before any lookup.
      expect(
        mapBrowserLanguageToOcr(undefined as unknown as string),
      ).toBeNull();
      expect(mapBrowserLanguageToOcr(null as unknown as string)).toBeNull();
    });

    it("3) maps an exact lowercase base code", () => {
      expect(mapBrowserLanguageToOcr("en")).toBe("eng");
      expect(mapBrowserLanguageToOcr("fr")).toBe("fra");
      expect(mapBrowserLanguageToOcr("de")).toBe("deu");
    });

    it("4) maps an exact region-qualified code (case insensitive)", () => {
      // Stored as 'en-GB' but lookup normalizes to lowercase.
      expect(mapBrowserLanguageToOcr("en-GB")).toBe("eng");
      expect(mapBrowserLanguageToOcr("EN-GB")).toBe("eng");
      expect(mapBrowserLanguageToOcr("en-gb")).toBe("eng");
    });

    it("5) normalizes underscores to hyphens before matching", () => {
      // 'zh_CN' -> 'zh-cn' matches stored 'zh-CN'.
      expect(mapBrowserLanguageToOcr("zh_CN")).toBe("chi_sim");
      expect(mapBrowserLanguageToOcr("zh-TW")).toBe("chi_tra");
    });

    it("6) falls back to the base language when region is unknown", () => {
      // 'en-US' is NOT in the table, but base 'en' is.
      expect(mapBrowserLanguageToOcr("en-US")).toBe("eng");
      // 'de-LI' unknown region, base 'de' resolves to 'deu'.
      expect(mapBrowserLanguageToOcr("de-LI")).toBe("deu");
    });

    it("7) returns null when neither full code nor base code is known", () => {
      expect(mapBrowserLanguageToOcr("xx")).toBeNull();
      expect(mapBrowserLanguageToOcr("xx-YY")).toBeNull();
      expect(mapBrowserLanguageToOcr("zz_ZZ")).toBeNull();
    });

    it("8) handles script-tagged codes that are stored directly", () => {
      // 'zh-Hans' is stored against chi_sim; 'zh-Hant' against chi_tra.
      expect(mapBrowserLanguageToOcr("zh-Hans")).toBe("chi_sim");
      expect(mapBrowserLanguageToOcr("zh-hant")).toBe("chi_tra");
      // Serbian Latin script variant.
      expect(mapBrowserLanguageToOcr("sr-Latn")).toBe("srp_latn");
    });

    it("9) maps all Norwegian browser variants to a single OCR code", () => {
      for (const code of ["no", "nb", "nn", "no-NO", "nb-NO", "nn-NO"]) {
        expect(mapBrowserLanguageToOcr(code)).toBe("nor");
      }
    });

    it("10) base-code fallback prefers the base when a script suffix is unknown", () => {
      // 'sr-Cyrl' is not stored, but base 'sr' is Serbian.
      expect(mapBrowserLanguageToOcr("sr-Cyrl")).toBe("srp");
    });
  });

  describe("getOcrDisplayName", () => {
    it("11) returns the display name for a known OCR code", () => {
      expect(getOcrDisplayName("deu")).toBe("German");
      expect(getOcrDisplayName("eng")).toBe("English");
      expect(getOcrDisplayName("chi_sim")).toBe("Chinese (Simplified)");
    });

    it("12) returns the original code unchanged when unknown", () => {
      expect(getOcrDisplayName("zzz")).toBe("zzz");
      expect(getOcrDisplayName("")).toBe("");
    });

    it("13) is case sensitive for OCR codes (no normalization applied)", () => {
      // ocrToDisplayMap stores the exact 'deu' key, so 'DEU' is a miss.
      expect(getOcrDisplayName("DEU")).toBe("DEU");
    });

    it("14) preserves multi-part display names with punctuation", () => {
      expect(getOcrDisplayName("nld")).toBe("Dutch; Flemish");
      expect(getOcrDisplayName("ron")).toBe("Romanian, Moldavian, Moldovan");
    });
  });

  describe("getOcrCodeFromDisplayName", () => {
    it("15) maps a display name back to its OCR code", () => {
      expect(getOcrCodeFromDisplayName("German")).toBe("deu");
      expect(getOcrCodeFromDisplayName("English")).toBe("eng");
    });

    it("16) is case insensitive on the display name", () => {
      expect(getOcrCodeFromDisplayName("german")).toBe("deu");
      expect(getOcrCodeFromDisplayName("CHINESE (SIMPLIFIED)")).toBe("chi_sim");
    });

    it("17) returns null for an unknown display name", () => {
      expect(getOcrCodeFromDisplayName("Klingon")).toBeNull();
      expect(getOcrCodeFromDisplayName("")).toBeNull();
    });

    it("18) round-trips OCR code -> display name -> OCR code", () => {
      const display = getOcrDisplayName("fra");
      expect(getOcrCodeFromDisplayName(display)).toBe("fra");
    });
  });

  describe("getBrowserLanguagesForOcr", () => {
    it("19) returns the full browser-code list for a known OCR code", () => {
      expect(getBrowserLanguagesForOcr("deu")).toEqual([
        "de",
        "de-DE",
        "de-AT",
        "de-CH",
      ]);
    });

    it("20) returns an empty array for OCR codes with no browser mapping", () => {
      // 'aze_cyrl' is defined with browserCodes: [].
      expect(getBrowserLanguagesForOcr("aze_cyrl")).toEqual([]);
    });

    it("21) returns an empty array for an unknown OCR code", () => {
      expect(getBrowserLanguagesForOcr("zzz")).toEqual([]);
    });

    it("22) every returned browser code maps back to the same OCR code", () => {
      const codes = getBrowserLanguagesForOcr("nor");
      expect(codes.length).toBeGreaterThan(0);
      for (const code of codes) {
        expect(mapBrowserLanguageToOcr(code)).toBe("nor");
      }
    });
  });

  describe("getAutoOcrLanguage", () => {
    it("23) wraps a matched OCR code in a single-element array", () => {
      expect(getAutoOcrLanguage("de-DE")).toEqual(["deu"]);
      expect(getAutoOcrLanguage("en-GB")).toEqual(["eng"]);
    });

    it("24) uses base-code fallback through mapBrowserLanguageToOcr", () => {
      expect(getAutoOcrLanguage("en-US")).toEqual(["eng"]);
    });

    it("25) returns an empty array for unknown or empty input", () => {
      expect(getAutoOcrLanguage("unknown")).toEqual([]);
      expect(getAutoOcrLanguage("")).toEqual([]);
    });
  });

  describe("getAllLanguageDefinitions", () => {
    it("26) returns a non-empty array of well-formed definitions", () => {
      const defs = getAllLanguageDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) {
        expect(typeof def.ocrCode).toBe("string");
        expect(typeof def.displayName).toBe("string");
        expect(Array.isArray(def.browserCodes)).toBe(true);
      }
    });

    it("27) returns a defensive copy (new array each call)", () => {
      const first = getAllLanguageDefinitions();
      const second = getAllLanguageDefinitions();
      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });

    it("28) mutating the returned array does not affect later calls", () => {
      const defs = getAllLanguageDefinitions();
      const originalLength = defs.length;
      defs.push({
        ocrCode: "fake",
        displayName: "Fake",
        browserCodes: [],
      });
      expect(getAllLanguageDefinitions()).toHaveLength(originalLength);
    });

    it("29) every definition's ocrCode resolves through getOcrDisplayName", () => {
      for (const def of getAllLanguageDefinitions()) {
        expect(getOcrDisplayName(def.ocrCode)).toBe(def.displayName);
      }
    });
  });

  describe("tempOcrLanguages (legacy compatibility)", () => {
    it("30) exposes a lang map keyed by OCR code with display-name values", () => {
      expect(tempOcrLanguages.lang.eng).toBe("English");
      expect(tempOcrLanguages.lang.chi_sim).toBe("Chinese (Simplified)");
    });

    it("31) lang map contains one entry per language definition", () => {
      const defs = getAllLanguageDefinitions();
      expect(Object.keys(tempOcrLanguages.lang)).toHaveLength(defs.length);
    });

    it("32) does not include unknown OCR codes", () => {
      expect(tempOcrLanguages.lang.zzz).toBeUndefined();
    });
  });
});
