/**
 * Pure helpers extracted from AdminAdvancedSection.
 *
 * Every function here is deterministic: inputs -> output only, with no
 * React/hooks/DOM/I/O/network access and no mutation of its arguments.
 * They are unit-tested directly in adminAdvancedSectionUtils.test.ts.
 */

export interface TempFileManagementSettings {
  baseTmpDir?: string;
  libreofficeDir?: string;
  systemTempDir?: string;
  prefix?: string;
  maxAgeHours?: number;
  cleanupIntervalMinutes?: number;
  startupCleanup?: boolean;
  cleanupSystemTemp?: boolean;
}

export interface ProcessExecutorSettings {
  sessionLimit?: Record<string, number | undefined>;
  timeoutMinutes?: Record<string, number | undefined>;
}

export interface AdvancedSettingsLike {
  enableAlphaFunctionality?: boolean;
  maxDPI?: number;
  enableUrlToPDF?: boolean;
  tessdataDir?: string;
  disableSanitize?: boolean;
  tempFileManagement?: TempFileManagementSettings;
  processExecutor?: ProcessExecutorSettings;
}

/**
 * Shape of the `_pending` overlay returned by the system/processExecutor admin
 * endpoints. Only the fields the Advanced section cares about are typed; the
 * values themselves are passed through untouched, so they stay `unknown`.
 */
export interface SystemPendingData {
  enableAlphaFunctionality?: unknown;
  maxDPI?: unknown;
  enableUrlToPDF?: unknown;
  tessdataDir?: unknown;
  disableSanitize?: unknown;
  tempFileManagement?: unknown;
}

/**
 * Build the flat delta-settings object sent to the admin save endpoint.
 *
 * Mirrors the previous inline `saveTransformer` body exactly: feature flags and
 * `maxDPI`/`tessdataDir` are always written, while `tempFileManagement` and the
 * `processExecutor` session-limit / timeout maps are only written when present.
 */
export function buildAdvancedSettingsSaveDelta(
  settings: AdvancedSettingsLike,
): Record<string, unknown> {
  const deltaSettings: Record<string, unknown> = {
    "system.enableAlphaFunctionality": settings.enableAlphaFunctionality,
    "system.maxDPI": settings.maxDPI,
    "system.enableUrlToPDF": settings.enableUrlToPDF,
    "system.tessdataDir": settings.tessdataDir,
    "system.disableSanitize": settings.disableSanitize,
  };

  if (settings.tempFileManagement) {
    const tfm = settings.tempFileManagement;
    deltaSettings["system.tempFileManagement.baseTmpDir"] = tfm.baseTmpDir;
    deltaSettings["system.tempFileManagement.libreofficeDir"] =
      tfm.libreofficeDir;
    deltaSettings["system.tempFileManagement.systemTempDir"] =
      tfm.systemTempDir;
    deltaSettings["system.tempFileManagement.prefix"] = tfm.prefix;
    deltaSettings["system.tempFileManagement.maxAgeHours"] = tfm.maxAgeHours;
    deltaSettings["system.tempFileManagement.cleanupIntervalMinutes"] =
      tfm.cleanupIntervalMinutes;
    deltaSettings["system.tempFileManagement.startupCleanup"] =
      tfm.startupCleanup;
    deltaSettings["system.tempFileManagement.cleanupSystemTemp"] =
      tfm.cleanupSystemTemp;
  }

  if (settings.processExecutor?.sessionLimit) {
    Object.entries(settings.processExecutor.sessionLimit).forEach(
      ([key, value]) => {
        deltaSettings[`processExecutor.sessionLimit.${key}`] = value;
      },
    );
  }
  if (settings.processExecutor?.timeoutMinutes) {
    Object.entries(settings.processExecutor.timeoutMinutes).forEach(
      ([key, value]) => {
        deltaSettings[`processExecutor.timeoutMinutes.${key}`] = value;
      },
    );
  }

  return deltaSettings;
}

/**
 * Merge the `_pending` overlays from the `system` and `processExecutor`
 * endpoints into a single pending block.
 *
 * Scalar system fields are copied only when defined (so an explicit
 * `null`/`false` pending value is preserved, but a missing one is omitted).
 * `tempFileManagement` and the whole `processExecutor` pending object are copied
 * only when truthy, matching the original inline behaviour.
 *
 * Returns `undefined` (not an empty object) when nothing is pending, so callers
 * can decide whether to attach a `_pending` block at all.
 */
export function mergeAdvancedSettingsPending(
  systemPending: SystemPendingData | null | undefined,
  processExecutorPending: unknown,
): Record<string, unknown> | undefined {
  const pendingBlock: Record<string, unknown> = {};

  if (systemPending) {
    if (systemPending.enableAlphaFunctionality !== undefined) {
      pendingBlock.enableAlphaFunctionality =
        systemPending.enableAlphaFunctionality;
    }
    if (systemPending.maxDPI !== undefined) {
      pendingBlock.maxDPI = systemPending.maxDPI;
    }
    if (systemPending.enableUrlToPDF !== undefined) {
      pendingBlock.enableUrlToPDF = systemPending.enableUrlToPDF;
    }
    if (systemPending.tessdataDir !== undefined) {
      pendingBlock.tessdataDir = systemPending.tessdataDir;
    }
    if (systemPending.disableSanitize !== undefined) {
      pendingBlock.disableSanitize = systemPending.disableSanitize;
    }
    if (systemPending.tempFileManagement) {
      pendingBlock.tempFileManagement = systemPending.tempFileManagement;
    }
  }

  if (processExecutorPending) {
    pendingBlock.processExecutor = processExecutorPending;
  }

  return Object.keys(pendingBlock).length > 0 ? pendingBlock : undefined;
}

/**
 * Compute the set of tessdata languages that are available to download but not
 * already installed (preserving the order of `available`).
 */
export function computeAvailableTessdataLanguages(
  installed: readonly string[],
  available: readonly string[],
): string[] {
  const installedSet = new Set(installed);
  return available.filter((lang) => !installedSet.has(lang));
}

// Matches any character outside the safe tessdata language set.
// Constructed via `new RegExp` (rather than a literal) so the trailing `-`
// stays escaped without tripping the no-useless-escape lint rule, preserving
// the exact pattern that the original inline code used.
const SAFE_TESSDATA_LANG_REGEX = new RegExp("[^A-Za-z0-9_+\\-]", "g");

/**
 * Sanitize a tessdata language code, stripping any character outside the safe
 * set `[A-Za-z0-9_+-]` to prevent path/URL injection.
 */
export function sanitizeTessdataLang(lang: string): string {
  return lang.replace(SAFE_TESSDATA_LANG_REGEX, "");
}

/**
 * Build the GitHub raw `.traineddata` download URLs for a list of tessdata
 * languages, sanitizing each language code first.
 */
export function buildManualTessdataDownloadLinks(
  languages: readonly string[],
): string[] {
  return languages.map(
    (lang) =>
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/${sanitizeTessdataLang(
        lang,
      )}.traineddata`,
  );
}
