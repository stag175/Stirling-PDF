import { describe, it, expect } from "vitest";
import {
  buildGeneralSettingsSaveDelta,
  combineGeneralFetchData,
  filterDefaultLocaleOptions,
  parseWatchedFoldersInput,
  validateWatchedFolders,
  type GeneralSettingsLike,
  type LocaleOption,
  type RawPremiumSectionData,
  type RawSystemSectionData,
  type RawUiSectionData,
} from "@app/components/shared/config/configSections/adminGeneralSectionUtils";

describe("adminGeneralSectionUtils", () => {
  describe("parseWatchedFoldersInput", () => {
    it("returns an empty array for an empty / whitespace-only string", () => {
      expect(parseWatchedFoldersInput("")).toEqual([]);
      expect(parseWatchedFoldersInput("   \n  \t ")).toEqual([]);
    });

    it("splits on newlines, commas and semicolons", () => {
      expect(parseWatchedFoldersInput("/a\n/b,/c;/d")).toEqual([
        "/a",
        "/b",
        "/c",
        "/d",
      ]);
    });

    it("collapses runs of separators and trims each entry", () => {
      expect(parseWatchedFoldersInput("/a\n\n\n , ; /b  ,,  /c")).toEqual([
        "/a",
        "/b",
        "/c",
      ]);
    });

    it("deduplicates exact (case-sensitive) matches, keeping first-seen order", () => {
      expect(parseWatchedFoldersInput("/a\n/b\n/a\n/c\n/b")).toEqual([
        "/a",
        "/b",
        "/c",
      ]);
    });

    it("treats differently-cased paths as distinct (case-sensitive)", () => {
      expect(parseWatchedFoldersInput("/A\n/a")).toEqual(["/A", "/a"]);
    });

    it("preserves backslashes verbatim (no path normalization here)", () => {
      expect(parseWatchedFoldersInput("C:\\watched\nC:\\watched")).toEqual([
        "C:\\watched",
      ]);
    });
  });

  describe("validateWatchedFolders", () => {
    it("returns null when there are no warnings", () => {
      expect(validateWatchedFolders([], "")).toBeNull();
      expect(validateWatchedFolders(["/only"], "")).toBeNull();
      expect(validateWatchedFolders(["/a", "/b"], "/c")).toBeNull();
    });

    it("does not run pairwise checks with fewer than two watched paths", () => {
      expect(validateWatchedFolders(["/a"], "")).toBeNull();
    });

    it("flags exact duplicate watched paths", () => {
      expect(validateWatchedFolders(["/a", "/a"], "")).toEqual([
        "Duplicate path detected: '/a'",
      ]);
    });

    it("treats trailing slashes and backslashes as equivalent when comparing", () => {
      expect(validateWatchedFolders(["/a/", "/a"], "")).toEqual([
        "Duplicate path detected: '/a/'",
      ]);
      expect(validateWatchedFolders(["C:\\a", "C:/a"], "")).toEqual([
        "Duplicate path detected: 'C:\\a'",
      ]);
    });

    it("flags a watched path nested inside another (first inside second)", () => {
      expect(validateWatchedFolders(["/a/b", "/a"], "")).toEqual([
        "'/a/b' is nested inside '/a' - may cause duplicate processing",
      ]);
    });

    it("flags a watched path nested inside another (second inside first)", () => {
      expect(validateWatchedFolders(["/a", "/a/b"], "")).toEqual([
        "'/a/b' is nested inside '/a' - may cause duplicate processing",
      ]);
    });

    it("does not flag sibling paths that merely share a prefix substring", () => {
      // '/foobar' starts with '/foo' but not '/foo/' so it must NOT be flagged.
      expect(validateWatchedFolders(["/foo", "/foobar"], "")).toBeNull();
    });

    it("flags an exact watched/finished collision as CRITICAL", () => {
      expect(validateWatchedFolders(["/done"], "/done")).toEqual([
        "CRITICAL: Watched folder '/done' is the same as finished folder - will cause processing loops!",
      ]);
    });

    it("flags finished folder nested inside a watched folder (non-critical)", () => {
      expect(validateWatchedFolders(["/watched"], "/watched/finished")).toEqual([
        "Finished folder is nested inside watched folder '/watched' - may cause issues",
      ]);
    });

    it("flags a watched folder nested inside the finished folder as CRITICAL", () => {
      expect(validateWatchedFolders(["/finished/watched"], "/finished")).toEqual(
        [
          "CRITICAL: Watched folder '/finished/watched' is nested inside finished folder - will cause processing loops!",
        ],
      );
    });

    it("skips finished-folder checks when finishedPath is empty", () => {
      expect(validateWatchedFolders(["/a", "/b"], "")).toBeNull();
    });

    it("accumulates multiple warnings across both checks", () => {
      const warnings = validateWatchedFolders(
        ["/a", "/a/b", "/done"],
        "/done",
      );
      expect(warnings).toEqual([
        "'/a/b' is nested inside '/a' - may cause duplicate processing",
        "CRITICAL: Watched folder '/done' is the same as finished folder - will cause processing loops!",
      ]);
    });

    it("does not mutate the input array", () => {
      const input = ["/a", "/a"];
      const snapshot = [...input];
      validateWatchedFolders(input, "");
      expect(input).toEqual(snapshot);
    });
  });

  describe("filterDefaultLocaleOptions", () => {
    const OPTIONS: LocaleOption[] = [
      { value: "en_GB", label: "English (en-GB)" },
      { value: "fr_FR", label: "French (fr-FR)" },
      { value: "de_DE", label: "German (de-DE)" },
    ];

    it("returns all options (as a copy) when no languages are selected", () => {
      const resultNull = filterDefaultLocaleOptions(OPTIONS, null);
      const resultUndef = filterDefaultLocaleOptions(OPTIONS, undefined);
      const resultEmpty = filterDefaultLocaleOptions(OPTIONS, []);
      expect(resultNull).toEqual(OPTIONS);
      expect(resultUndef).toEqual(OPTIONS);
      expect(resultEmpty).toEqual(OPTIONS);
      // Must be a copy, not the same reference.
      expect(resultNull).not.toBe(OPTIONS);
    });

    it("keeps only options whose value is in the selected list, preserving order", () => {
      expect(
        filterDefaultLocaleOptions(OPTIONS, ["de_DE", "en_GB"]),
      ).toEqual([
        { value: "en_GB", label: "English (en-GB)" },
        { value: "de_DE", label: "German (de-DE)" },
      ]);
    });

    it("returns an empty array when no selected language matches", () => {
      expect(filterDefaultLocaleOptions(OPTIONS, ["xx_XX"])).toEqual([]);
    });

    it("does not mutate the input options array", () => {
      const snapshot = [...OPTIONS];
      filterDefaultLocaleOptions(OPTIONS, ["en_GB"]);
      expect(OPTIONS).toEqual(snapshot);
    });
  });

  describe("buildGeneralSettingsSaveDelta", () => {
    const ALWAYS_PRESENT_KEYS = [
      "ui.appNameNavbar",
      "ui.languages",
      "ui.logoStyle",
      "ui.hideDisabledTools.googleDrive",
      "ui.hideDisabledTools.mobileQRScanner",
      "system.defaultLocale",
      "system.showUpdate",
      "system.showUpdateOnlyAdmin",
      "system.customHTMLFiles",
      "system.fileUploadLimit",
      "system.frontendUrl",
      "premium.proFeatures.customMetadata.autoUpdateMetadata",
      "premium.proFeatures.customMetadata.author",
      "premium.proFeatures.customMetadata.creator",
      "premium.proFeatures.customMetadata.producer",
    ];

    it("emits exactly the always-present keys (all undefined) for empty input", () => {
      const delta = buildGeneralSettingsSaveDelta({});
      expect(Object.keys(delta).sort()).toEqual([...ALWAYS_PRESENT_KEYS].sort());
      for (const key of ALWAYS_PRESENT_KEYS) {
        expect(delta[key]).toBeUndefined();
      }
      // No customPaths keys when customPaths is absent.
      expect(
        Object.keys(delta).some((k) => k.startsWith("system.customPaths.")),
      ).toBe(false);
    });

    it("maps UI, system and metadata scalars to their backend paths", () => {
      const settings: GeneralSettingsLike = {
        ui: {
          appNameNavbar: "Stirling",
          languages: ["en_GB", "fr_FR"],
          logoStyle: "modern",
          hideDisabledTools: { googleDrive: true, mobileQRScanner: false },
        },
        system: {
          defaultLocale: "en_GB",
          showUpdate: true,
          showUpdateOnlyAdmin: false,
          customHTMLFiles: true,
          fileUploadLimit: "100MB",
          frontendUrl: "https://example.com",
        },
        customMetadata: {
          autoUpdateMetadata: true,
          author: "Alice",
          creator: "Creator",
          producer: "Producer",
        },
      };
      const delta = buildGeneralSettingsSaveDelta(settings);
      expect(delta["ui.appNameNavbar"]).toBe("Stirling");
      expect(delta["ui.languages"]).toEqual(["en_GB", "fr_FR"]);
      expect(delta["ui.logoStyle"]).toBe("modern");
      expect(delta["ui.hideDisabledTools.googleDrive"]).toBe(true);
      expect(delta["ui.hideDisabledTools.mobileQRScanner"]).toBe(false);
      expect(delta["system.defaultLocale"]).toBe("en_GB");
      expect(delta["system.showUpdate"]).toBe(true);
      expect(delta["system.showUpdateOnlyAdmin"]).toBe(false);
      expect(delta["system.customHTMLFiles"]).toBe(true);
      expect(delta["system.fileUploadLimit"]).toBe("100MB");
      expect(delta["system.frontendUrl"]).toBe("https://example.com");
      expect(
        delta["premium.proFeatures.customMetadata.autoUpdateMetadata"],
      ).toBe(true);
      expect(delta["premium.proFeatures.customMetadata.author"]).toBe("Alice");
      expect(delta["premium.proFeatures.customMetadata.creator"]).toBe(
        "Creator",
      );
      expect(delta["premium.proFeatures.customMetadata.producer"]).toBe(
        "Producer",
      );
    });

    it("preserves falsy scalar values verbatim (not dropped)", () => {
      const delta = buildGeneralSettingsSaveDelta({
        ui: { appNameNavbar: "" },
        system: { showUpdate: false, fileUploadLimit: "" },
        customMetadata: { autoUpdateMetadata: false, author: "" },
      });
      expect(delta["ui.appNameNavbar"]).toBe("");
      expect(delta["system.showUpdate"]).toBe(false);
      expect(delta["system.fileUploadLimit"]).toBe("");
      expect(
        delta["premium.proFeatures.customMetadata.autoUpdateMetadata"],
      ).toBe(false);
      expect(delta["premium.proFeatures.customMetadata.author"]).toBe("");
    });

    it("adds customPaths keys only when a customPaths block is present", () => {
      const delta = buildGeneralSettingsSaveDelta({
        customPaths: {
          pipeline: {
            pipelineDir: "/p",
            watchedFoldersDir: "/w",
            watchedFoldersDirs: ["/w1", "/w2"],
            finishedFoldersDir: "/f",
          },
          operations: { weasyprint: "/wp", unoconvert: "/uc" },
        },
      });
      expect(delta["system.customPaths.pipeline.pipelineDir"]).toBe("/p");
      expect(delta["system.customPaths.pipeline.watchedFoldersDir"]).toBe("/w");
      expect(delta["system.customPaths.pipeline.watchedFoldersDirs"]).toEqual([
        "/w1",
        "/w2",
      ]);
      expect(delta["system.customPaths.pipeline.finishedFoldersDir"]).toBe("/f");
      expect(delta["system.customPaths.operations.weasyprint"]).toBe("/wp");
      expect(delta["system.customPaths.operations.unoconvert"]).toBe("/uc");
    });

    it("emits customPaths keys (as undefined) for an empty customPaths object", () => {
      const delta = buildGeneralSettingsSaveDelta({ customPaths: {} });
      expect(
        Object.prototype.hasOwnProperty.call(
          delta,
          "system.customPaths.pipeline.pipelineDir",
        ),
      ).toBe(true);
      expect(delta["system.customPaths.pipeline.pipelineDir"]).toBeUndefined();
    });

    it("does not mutate the input settings object", () => {
      const settings: GeneralSettingsLike = {
        ui: { appNameNavbar: "X" },
        customPaths: { pipeline: { pipelineDir: "/p" } },
      };
      const snapshot = JSON.parse(JSON.stringify(settings));
      buildGeneralSettingsSaveDelta(settings);
      expect(settings).toEqual(snapshot);
    });
  });

  describe("combineGeneralFetchData", () => {
    const identity = (langs: string[]): string[] => langs;
    const upper = (langs: string[]): string[] =>
      langs.map((l) => l.toUpperCase());

    it("treats null/undefined section bodies as empty objects", () => {
      const result = combineGeneralFetchData(null, undefined, null, identity);
      expect(result.ui).toEqual({ languages: [] });
      expect(result.system).toEqual({});
      expect(result.customPaths?.pipeline).toEqual({
        pipelineDir: "",
        watchedFoldersDir: "",
        watchedFoldersDirs: [],
        finishedFoldersDir: "",
      });
      expect(result.customPaths?.operations).toEqual({
        weasyprint: "",
        unoconvert: "",
      });
      expect(result.customMetadata).toEqual({
        autoUpdateMetadata: false,
        author: "",
        creator: "",
        producer: "",
      });
      expect(result._pending).toBeUndefined();
    });

    it("normalizes ui.languages via the supplied normalizer when it is an array", () => {
      const result = combineGeneralFetchData(
        { languages: ["en", "fr"] },
        null,
        null,
        upper,
      );
      expect((result.ui as { languages: string[] }).languages).toEqual([
        "EN",
        "FR",
      ]);
    });

    it("resets ui.languages to [] when it is not an array", () => {
      const result = combineGeneralFetchData(
        { languages: "not-an-array" } as RawUiSectionData,
        null,
        null,
        identity,
      );
      expect((result.ui as { languages: string[] }).languages).toEqual([]);
    });

    it("prefers the watchedFoldersDirs array when non-empty", () => {
      const system: RawSystemSectionData = {
        customPaths: {
          pipeline: {
            watchedFoldersDir: "/legacy",
            watchedFoldersDirs: ["/a", "/b"],
          },
        },
      };
      const result = combineGeneralFetchData(null, system, null, identity);
      expect(result.customPaths?.pipeline?.watchedFoldersDirs).toEqual([
        "/a",
        "/b",
      ]);
    });

    it("falls back to the legacy single watchedFoldersDir when the array is empty", () => {
      const system: RawSystemSectionData = {
        customPaths: {
          pipeline: { watchedFoldersDir: "/legacy", watchedFoldersDirs: [] },
        },
      };
      const result = combineGeneralFetchData(null, system, null, identity);
      expect(result.customPaths?.pipeline?.watchedFoldersDirs).toEqual([
        "/legacy",
      ]);
    });

    it("yields an empty watchedFoldersDirs when neither array nor legacy value exists", () => {
      const system: RawSystemSectionData = {
        customPaths: { pipeline: {} },
      };
      const result = combineGeneralFetchData(null, system, null, identity);
      expect(result.customPaths?.pipeline?.watchedFoldersDirs).toEqual([]);
    });

    it("uses premium custom metadata when present", () => {
      const premium: RawPremiumSectionData = {
        proFeatures: {
          customMetadata: { autoUpdateMetadata: true, author: "Bob" },
        },
      };
      const result = combineGeneralFetchData(null, null, premium, identity);
      expect(result.customMetadata).toEqual({
        autoUpdateMetadata: true,
        author: "Bob",
      });
    });

    it("merges _pending overlays from all three endpoints in order", () => {
      const ui: RawUiSectionData = { _pending: { appNameNavbar: "x" } };
      const system: RawSystemSectionData = {
        _pending: { showUpdate: true, customPaths: { pipeline: {} } },
      };
      const premium: RawPremiumSectionData = {
        _pending: { proFeatures: { customMetadata: { author: "p" } } },
      };
      const result = combineGeneralFetchData(ui, system, premium, identity);
      expect(result._pending).toEqual({
        ui: { appNameNavbar: "x" },
        system: { showUpdate: true, customPaths: { pipeline: {} } },
        customPaths: { pipeline: {} },
        customMetadata: { author: "p" },
      });
    });

    it("omits _pending entirely when no overlay is present", () => {
      const result = combineGeneralFetchData(
        { languages: [] },
        { customPaths: {} },
        { proFeatures: { customMetadata: {} } },
        identity,
      );
      expect(result._pending).toBeUndefined();
    });

    it("does not mutate the input section bodies", () => {
      const ui: RawUiSectionData = { languages: ["en"] };
      const system: RawSystemSectionData = {
        customPaths: { pipeline: { watchedFoldersDir: "/legacy" } },
      };
      const premium: RawPremiumSectionData = {
        proFeatures: { customMetadata: { author: "Bob" } },
      };
      const uiSnap = JSON.parse(JSON.stringify(ui));
      const systemSnap = JSON.parse(JSON.stringify(system));
      const premiumSnap = JSON.parse(JSON.stringify(premium));
      combineGeneralFetchData(ui, system, premium, upper);
      expect(ui).toEqual(uiSnap);
      expect(system).toEqual(systemSnap);
      expect(premium).toEqual(premiumSnap);
    });
  });
});
