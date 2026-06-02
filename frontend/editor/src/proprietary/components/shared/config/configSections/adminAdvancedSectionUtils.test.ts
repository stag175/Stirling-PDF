import { describe, it, expect } from "vitest";
import {
  buildAdvancedSettingsSaveDelta,
  buildManualTessdataDownloadLinks,
  computeAvailableTessdataLanguages,
  mergeAdvancedSettingsPending,
  sanitizeTessdataLang,
  type AdvancedSettingsLike,
} from "@app/components/shared/config/configSections/adminAdvancedSectionUtils";

describe("adminAdvancedSectionUtils", () => {
  describe("buildAdvancedSettingsSaveDelta", () => {
    it("always emits the five system scalar keys, even when undefined", () => {
      const delta = buildAdvancedSettingsSaveDelta({});
      expect(delta).toEqual({
        "system.enableAlphaFunctionality": undefined,
        "system.maxDPI": undefined,
        "system.enableUrlToPDF": undefined,
        "system.tessdataDir": undefined,
        "system.disableSanitize": undefined,
      });
      // The keys must exist (with undefined values), matching prior behaviour.
      expect(Object.keys(delta).sort()).toEqual(
        [
          "system.disableSanitize",
          "system.enableAlphaFunctionality",
          "system.enableUrlToPDF",
          "system.maxDPI",
          "system.tessdataDir",
        ].sort(),
      );
    });

    it("preserves falsy scalar values verbatim (0, false, empty string)", () => {
      const delta = buildAdvancedSettingsSaveDelta({
        enableAlphaFunctionality: false,
        maxDPI: 0,
        enableUrlToPDF: false,
        tessdataDir: "",
        disableSanitize: false,
      });
      expect(delta["system.enableAlphaFunctionality"]).toBe(false);
      expect(delta["system.maxDPI"]).toBe(0);
      expect(delta["system.enableUrlToPDF"]).toBe(false);
      expect(delta["system.tessdataDir"]).toBe("");
      expect(delta["system.disableSanitize"]).toBe(false);
    });

    it("flattens all tempFileManagement fields when the block is present", () => {
      const delta = buildAdvancedSettingsSaveDelta({
        tempFileManagement: {
          baseTmpDir: "/tmp/base",
          libreofficeDir: "/tmp/lo",
          systemTempDir: "/tmp/sys",
          prefix: "sp-",
          maxAgeHours: 12,
          cleanupIntervalMinutes: 15,
          startupCleanup: false,
          cleanupSystemTemp: true,
        },
      });
      expect(delta["system.tempFileManagement.baseTmpDir"]).toBe("/tmp/base");
      expect(delta["system.tempFileManagement.libreofficeDir"]).toBe("/tmp/lo");
      expect(delta["system.tempFileManagement.systemTempDir"]).toBe("/tmp/sys");
      expect(delta["system.tempFileManagement.prefix"]).toBe("sp-");
      expect(delta["system.tempFileManagement.maxAgeHours"]).toBe(12);
      expect(delta["system.tempFileManagement.cleanupIntervalMinutes"]).toBe(
        15,
      );
      expect(delta["system.tempFileManagement.startupCleanup"]).toBe(false);
      expect(delta["system.tempFileManagement.cleanupSystemTemp"]).toBe(true);
    });

    it("emits tempFileManagement keys (with undefined values) when the block is an empty object", () => {
      const delta = buildAdvancedSettingsSaveDelta({ tempFileManagement: {} });
      expect("system.tempFileManagement.baseTmpDir" in delta).toBe(true);
      expect(delta["system.tempFileManagement.baseTmpDir"]).toBeUndefined();
      expect(delta["system.tempFileManagement.startupCleanup"]).toBeUndefined();
    });

    it("omits tempFileManagement keys entirely when the block is absent", () => {
      const delta = buildAdvancedSettingsSaveDelta({});
      expect("system.tempFileManagement.baseTmpDir" in delta).toBe(false);
    });

    it("namespaces each processExecutor sessionLimit key", () => {
      const delta = buildAdvancedSettingsSaveDelta({
        processExecutor: {
          sessionLimit: {
            libreOfficeSessionLimit: 2,
            qpdfSessionLimit: 4,
          },
        },
      });
      expect(delta["processExecutor.sessionLimit.libreOfficeSessionLimit"]).toBe(
        2,
      );
      expect(delta["processExecutor.sessionLimit.qpdfSessionLimit"]).toBe(4);
    });

    it("namespaces each processExecutor timeoutMinutes key", () => {
      const delta = buildAdvancedSettingsSaveDelta({
        processExecutor: {
          timeoutMinutes: {
            libreOfficetimeoutMinutes: 30,
            ocrMyPdfTimeoutMinutes: 45,
          },
        },
      });
      expect(
        delta["processExecutor.timeoutMinutes.libreOfficetimeoutMinutes"],
      ).toBe(30);
      expect(delta["processExecutor.timeoutMinutes.ocrMyPdfTimeoutMinutes"]).toBe(
        45,
      );
    });

    it("handles a processExecutor with neither sessionLimit nor timeoutMinutes", () => {
      const delta = buildAdvancedSettingsSaveDelta({ processExecutor: {} });
      const peKeys = Object.keys(delta).filter((k) =>
        k.startsWith("processExecutor."),
      );
      expect(peKeys).toEqual([]);
    });

    it("does not mutate the input settings object", () => {
      const settings: AdvancedSettingsLike = {
        maxDPI: 300,
        tempFileManagement: { prefix: "x-" },
        processExecutor: { sessionLimit: { qpdfSessionLimit: 1 } },
      };
      const snapshot = JSON.parse(JSON.stringify(settings));
      buildAdvancedSettingsSaveDelta(settings);
      expect(settings).toEqual(snapshot);
    });
  });

  describe("mergeAdvancedSettingsPending", () => {
    it("returns undefined when there is nothing pending", () => {
      expect(mergeAdvancedSettingsPending(undefined, undefined)).toBeUndefined();
      expect(mergeAdvancedSettingsPending(null, null)).toBeUndefined();
      expect(mergeAdvancedSettingsPending({}, undefined)).toBeUndefined();
    });

    it("copies defined scalar system pending fields", () => {
      const result = mergeAdvancedSettingsPending(
        {
          enableAlphaFunctionality: true,
          maxDPI: 600,
          enableUrlToPDF: false,
          tessdataDir: "/data",
          disableSanitize: true,
        },
        undefined,
      );
      expect(result).toEqual({
        enableAlphaFunctionality: true,
        maxDPI: 600,
        enableUrlToPDF: false,
        tessdataDir: "/data",
        disableSanitize: true,
      });
    });

    it("preserves pending scalar values that are falsy but defined", () => {
      const result = mergeAdvancedSettingsPending(
        { enableUrlToPDF: false, maxDPI: 0, tessdataDir: "" },
        undefined,
      );
      expect(result).toEqual({
        enableUrlToPDF: false,
        maxDPI: 0,
        tessdataDir: "",
      });
    });

    it("omits scalar system fields that are undefined", () => {
      const result = mergeAdvancedSettingsPending(
        { enableAlphaFunctionality: undefined, maxDPI: 600 },
        undefined,
      );
      expect(result).toEqual({ maxDPI: 600 });
      expect(result && "enableAlphaFunctionality" in result).toBe(false);
    });

    it("includes tempFileManagement only when truthy", () => {
      const withBlock = mergeAdvancedSettingsPending(
        { tempFileManagement: { prefix: "y-" } },
        undefined,
      );
      expect(withBlock).toEqual({ tempFileManagement: { prefix: "y-" } });

      const withoutBlock = mergeAdvancedSettingsPending(
        { tempFileManagement: undefined },
        undefined,
      );
      expect(withoutBlock).toBeUndefined();
    });

    it("includes processExecutor pending only when truthy", () => {
      const pe = { sessionLimit: { qpdfSessionLimit: 2 } };
      expect(mergeAdvancedSettingsPending(undefined, pe)).toEqual({
        processExecutor: pe,
      });
      expect(mergeAdvancedSettingsPending(undefined, null)).toBeUndefined();
      expect(mergeAdvancedSettingsPending(undefined, 0)).toBeUndefined();
    });

    it("merges system and processExecutor pending into one block", () => {
      const pe = { timeoutMinutes: { qpdfTimeoutMinutes: 10 } };
      const result = mergeAdvancedSettingsPending(
        { maxDPI: 300, tempFileManagement: { prefix: "z-" } },
        pe,
      );
      expect(result).toEqual({
        maxDPI: 300,
        tempFileManagement: { prefix: "z-" },
        processExecutor: pe,
      });
    });

    it("passes the processExecutor pending object through by reference", () => {
      const pe = { sessionLimit: { qpdfSessionLimit: 2 } };
      const result = mergeAdvancedSettingsPending(undefined, pe);
      expect(result?.processExecutor).toBe(pe);
    });
  });

  describe("computeAvailableTessdataLanguages", () => {
    it("returns available languages that are not installed, preserving order", () => {
      expect(
        computeAvailableTessdataLanguages(
          ["eng", "deu"],
          ["fra", "eng", "spa", "deu"],
        ),
      ).toEqual(["fra", "spa"]);
    });

    it("returns all available when nothing is installed", () => {
      expect(computeAvailableTessdataLanguages([], ["eng", "fra"])).toEqual([
        "eng",
        "fra",
      ]);
    });

    it("returns an empty array when everything is installed", () => {
      expect(
        computeAvailableTessdataLanguages(["eng", "fra"], ["eng", "fra"]),
      ).toEqual([]);
    });

    it("returns an empty array when there are no available languages", () => {
      expect(computeAvailableTessdataLanguages(["eng"], [])).toEqual([]);
    });

    it("keeps duplicate available entries that are not installed", () => {
      expect(
        computeAvailableTessdataLanguages(["eng"], ["fra", "fra", "eng"]),
      ).toEqual(["fra", "fra"]);
    });

    it("does not mutate its inputs", () => {
      const installed = ["eng"];
      const available = ["eng", "fra"];
      computeAvailableTessdataLanguages(installed, available);
      expect(installed).toEqual(["eng"]);
      expect(available).toEqual(["eng", "fra"]);
    });
  });

  describe("sanitizeTessdataLang", () => {
    it("leaves safe characters untouched", () => {
      expect(sanitizeTessdataLang("eng")).toBe("eng");
      expect(sanitizeTessdataLang("chi_sim")).toBe("chi_sim");
      expect(sanitizeTessdataLang("script-Latin")).toBe("script-Latin");
      expect(sanitizeTessdataLang("a+b_C-9")).toBe("a+b_C-9");
    });

    it("strips path traversal and separator characters", () => {
      expect(sanitizeTessdataLang("../../etc/passwd")).toBe("etcpasswd");
      expect(sanitizeTessdataLang("eng/../deu")).toBe("engdeu");
    });

    it("strips spaces, dots and query characters", () => {
      expect(sanitizeTessdataLang("eng .traineddata?x=1")).toBe(
        "engtraineddatax1",
      );
    });

    it("returns an empty string when no safe characters remain", () => {
      expect(sanitizeTessdataLang("../")).toBe("");
      expect(sanitizeTessdataLang("")).toBe("");
    });
  });

  describe("buildManualTessdataDownloadLinks", () => {
    it("builds GitHub raw URLs for each language", () => {
      expect(buildManualTessdataDownloadLinks(["eng", "deu"])).toEqual([
        "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata",
        "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/deu.traineddata",
      ]);
    });

    it("sanitizes each language before composing the URL", () => {
      expect(buildManualTessdataDownloadLinks(["../../etc/passwd"])).toEqual([
        "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/etcpasswd.traineddata",
      ]);
    });

    it("returns an empty array for an empty input", () => {
      expect(buildManualTessdataDownloadLinks([])).toEqual([]);
    });

    it("does not mutate its input", () => {
      const langs = ["eng", "fra"];
      buildManualTessdataDownloadLinks(langs);
      expect(langs).toEqual(["eng", "fra"]);
    });
  });
});
