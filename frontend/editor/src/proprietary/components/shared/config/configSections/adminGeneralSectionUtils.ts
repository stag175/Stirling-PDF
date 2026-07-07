/**
 * Pure helpers extracted from AdminGeneralSection.
 *
 * Every function here is deterministic: inputs -> output only, with no
 * React/hooks/DOM/I/O/network access and no mutation of its arguments.
 * They are unit-tested directly in adminGeneralSectionUtils.test.ts.
 *
 * All network / state-mutation / I/O side effects deliberately stay in the
 * component; only the pure data transforms live here.
 */

/** Pipeline / operations custom-path block edited by the component. */
export interface GeneralCustomPaths {
  pipeline?: {
    pipelineDir?: string;
    watchedFoldersDir?: string;
    watchedFoldersDirs?: string[];
    finishedFoldersDir?: string;
  };
  operations?: {
    weasyprint?: string;
    unoconvert?: string;
  };
}

/** Premium custom-metadata block. */
export interface GeneralCustomMetadata {
  autoUpdateMetadata?: boolean;
  author?: string;
  creator?: string;
  producer?: string;
}

/**
 * The UI-facing general settings shape the component edits in state.
 * Mirrors what `combineGeneralFetchData` returns (minus `_pending`) and what
 * `buildGeneralSettingsSaveDelta` consumes.
 */
export interface GeneralSettingsLike {
  ui?: {
    appNameNavbar?: string;
    languages?: string[];
    logoStyle?: "modern" | "classic";
    hideDisabledTools?: {
      googleDrive?: boolean;
      mobileQRScanner?: boolean;
    };
  };
  system?: {
    defaultLocale?: string;
    showUpdate?: boolean;
    showUpdateOnlyAdmin?: boolean;
    customHTMLFiles?: boolean;
    fileUploadLimit?: string;
    frontendUrl?: string;
  };
  customPaths?: GeneralCustomPaths;
  customMetadata?: GeneralCustomMetadata;
}

/** The combined settings object surfaced to the component, with optional pending overlay. */
export type CombinedGeneralSettings = GeneralSettingsLike & {
  _pending?: Record<string, unknown>;
};

/**
 * Raw `/ui` section body. Carries the UI scalars plus an optional `_pending`
 * overlay and any extra fields the backend may add.
 */
export type RawUiSectionData = {
  _pending?: Record<string, unknown>;
  languages?: unknown;
} & Record<string, unknown>;

/**
 * Raw `/system` section body. Custom paths live under `customPaths`, with an
 * optional `_pending` overlay carrying its own `customPaths` block.
 */
export type RawSystemSectionData = {
  _pending?: {
    customPaths?: unknown;
  } & Record<string, unknown>;
  customPaths?: GeneralCustomPaths;
} & Record<string, unknown>;

/**
 * Raw `/premium` section body. Custom metadata lives under
 * `proFeatures.customMetadata`, both in the active body and the `_pending`
 * overlay.
 */
export type RawPremiumSectionData = {
  _pending?: {
    proFeatures?: {
      customMetadata?: unknown;
    };
  } & Record<string, unknown>;
  proFeatures?: {
    customMetadata?: GeneralCustomMetadata;
  } & Record<string, unknown>;
} & Record<string, unknown>;

/** Default empty custom-metadata block, used when premium has none. */
const DEFAULT_CUSTOM_METADATA: GeneralCustomMetadata = {
  autoUpdateMetadata: false,
  author: "",
  creator: "",
  producer: "",
};

/**
 * Parse the watched-folders textarea value into a deduplicated list of paths.
 *
 * Behaviour preserved exactly from the previous inline
 * `parseWatchedFoldersInput`:
 *  - Splits on any run of newline / comma / semicolon characters.
 *  - Trims each entry and drops empties.
 *  - Deduplicates case-sensitively (exact match), preserving first-seen order.
 */
export function parseWatchedFoldersInput(value: string): string[] {
  const paths = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Deduplicate paths (case-sensitive, exact match)
  return Array.from(new Set(paths));
}

/**
 * Normalize a filesystem path for comparison: convert backslashes to forward
 * slashes and strip trailing slashes. Used by `validateWatchedFolders`.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Validate the configured watched folders against each other and the finished
 * folder, returning a list of human-readable warnings (or `null` if none).
 *
 * Mirrors the previous inline `watchedFoldersValidation` memo exactly:
 *  - Paths are normalized (backslash -> slash, trailing slashes trimmed) before
 *    comparison so Windows and Unix paths compare consistently.
 *  - When two or more watched paths are present, every unordered pair is checked
 *    for exact duplication and for one being nested inside the other.
 *  - When a finished path and at least one watched path are present, each watched
 *    path is checked against the finished path for equality and nesting in both
 *    directions, with the loop-causing cases flagged as CRITICAL.
 *  - Returns `null` rather than an empty array when there are no warnings.
 */
export function validateWatchedFolders(
  paths: readonly string[],
  finishedPath: string,
): string[] | null {
  const warnings: string[] = [];

  // Check for overlapping watched folders
  if (paths.length >= 2) {
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const path1 = normalizePath(paths[i]);
        const path2 = normalizePath(paths[j]);

        if (path1 === path2) {
          warnings.push(`Duplicate path detected: '${paths[i]}'`);
        } else if (path1.startsWith(path2 + "/")) {
          warnings.push(
            `'${paths[i]}' is nested inside '${paths[j]}' - may cause duplicate processing`,
          );
        } else if (path2.startsWith(path1 + "/")) {
          warnings.push(
            `'${paths[j]}' is nested inside '${paths[i]}' - may cause duplicate processing`,
          );
        }
      }
    }
  }

  // Check for conflicts with finished folder
  if (finishedPath && paths.length > 0) {
    const normalizedFinished = normalizePath(finishedPath);
    for (const watchedPath of paths) {
      const normalizedWatched = normalizePath(watchedPath);

      if (normalizedWatched === normalizedFinished) {
        warnings.push(
          `CRITICAL: Watched folder '${watchedPath}' is the same as finished folder - will cause processing loops!`,
        );
      } else if (normalizedFinished.startsWith(normalizedWatched + "/")) {
        warnings.push(
          `Finished folder is nested inside watched folder '${watchedPath}' - may cause issues`,
        );
      } else if (normalizedWatched.startsWith(normalizedFinished + "/")) {
        warnings.push(
          `CRITICAL: Watched folder '${watchedPath}' is nested inside finished folder - will cause processing loops!`,
        );
      }
    }
  }

  return warnings.length > 0 ? warnings : null;
}

/** A single `{ value, label }` option for the language/locale selectors. */
export interface LocaleOption {
  value: string;
  label: string;
}

/**
 * Filter the full list of locale options down to those allowed by the selected
 * languages.
 *
 * Mirrors the previous inline `defaultLocaleOptions` memo exactly: when no
 * languages are selected (empty / nullish list) all options are returned
 * unchanged; otherwise only options whose `value` is in the selected list are
 * kept (original order preserved).
 */
export function filterDefaultLocaleOptions(
  options: readonly LocaleOption[],
  selectedLanguages: readonly string[] | null | undefined,
): LocaleOption[] {
  if (!selectedLanguages || selectedLanguages.length === 0) {
    return [...options];
  }
  return options.filter((option) => selectedLanguages.includes(option.value));
}

/**
 * Build the flat delta-settings object sent to the admin save endpoint.
 *
 * Mirrors the previous inline `saveTransformer` body exactly:
 *  - The UI, system and premium-metadata scalar keys are ALWAYS emitted (even
 *    when the value is `undefined`), so falsy `0`/`false`/`""` values are
 *    written verbatim rather than dropped.
 *  - The `system.customPaths.*` and `system.customPaths.operations.*` keys are
 *    only added when a `customPaths` block is present.
 */
export function buildGeneralSettingsSaveDelta(
  settings: GeneralSettingsLike,
): Record<string, unknown> {
  const deltaSettings: Record<string, unknown> = {
    // UI settings
    "ui.appNameNavbar": settings.ui?.appNameNavbar,
    "ui.languages": settings.ui?.languages,
    "ui.logoStyle": settings.ui?.logoStyle,
    "ui.hideDisabledTools.googleDrive":
      settings.ui?.hideDisabledTools?.googleDrive,
    "ui.hideDisabledTools.mobileQRScanner":
      settings.ui?.hideDisabledTools?.mobileQRScanner,
    // System settings
    "system.defaultLocale": settings.system?.defaultLocale,
    "system.showUpdate": settings.system?.showUpdate,
    "system.showUpdateOnlyAdmin": settings.system?.showUpdateOnlyAdmin,
    "system.customHTMLFiles": settings.system?.customHTMLFiles,
    "system.fileUploadLimit": settings.system?.fileUploadLimit,
    "system.frontendUrl": settings.system?.frontendUrl,
    // Premium custom metadata
    "premium.proFeatures.customMetadata.autoUpdateMetadata":
      settings.customMetadata?.autoUpdateMetadata,
    "premium.proFeatures.customMetadata.author": settings.customMetadata?.author,
    "premium.proFeatures.customMetadata.creator":
      settings.customMetadata?.creator,
    "premium.proFeatures.customMetadata.producer":
      settings.customMetadata?.producer,
  };

  if (settings.customPaths) {
    deltaSettings["system.customPaths.pipeline.pipelineDir"] =
      settings.customPaths?.pipeline?.pipelineDir;
    deltaSettings["system.customPaths.pipeline.watchedFoldersDir"] =
      settings.customPaths?.pipeline?.watchedFoldersDir;
    deltaSettings["system.customPaths.pipeline.watchedFoldersDirs"] =
      settings.customPaths?.pipeline?.watchedFoldersDirs;
    deltaSettings["system.customPaths.pipeline.finishedFoldersDir"] =
      settings.customPaths?.pipeline?.finishedFoldersDir;
    deltaSettings["system.customPaths.operations.weasyprint"] =
      settings.customPaths?.operations?.weasyprint;
    deltaSettings["system.customPaths.operations.unoconvert"] =
      settings.customPaths?.operations?.unoconvert;
  }

  return deltaSettings;
}

/**
 * Combine the three admin section responses (ui / system / premium) into the
 * single settings object the component renders.
 *
 * This is the pure data-combining half of the previous inline
 * `fetchTransformer`; all of the network fetches stay in the component, which
 * passes its `toUnderscoreLanguages` helper in as `normalizeLanguages`.
 *
 * Behaviour preserved exactly:
 *  - `null`/`undefined` section bodies are treated as `{}`, matching the
 *    component's `response.data || {}` guard.
 *  - `ui.languages` is normalized via `normalizeLanguages` when it is an array,
 *    otherwise reset to `[]`.
 *  - `customPaths.pipeline.watchedFoldersDirs` prefers the array form; when
 *    empty it falls back to a single-element list built from the legacy
 *    `watchedFoldersDir`, else `[]`. The remaining pipeline / operations path
 *    scalars default to `""`.
 *  - `customMetadata` comes from `premium.proFeatures.customMetadata` or a
 *    default empty block.
 *  - The three `_pending` overlays are merged (ui -> system -> system.customPaths
 *    -> premium.customMetadata) and attached only when non-empty.
 */
export function combineGeneralFetchData(
  uiData: RawUiSectionData | null | undefined,
  systemData: RawSystemSectionData | null | undefined,
  premiumData: RawPremiumSectionData | null | undefined,
  normalizeLanguages: (languages: string[]) => string[],
): CombinedGeneralSettings {
  const ui: RawUiSectionData = { ...(uiData ?? {}) };
  const system: RawSystemSectionData = { ...(systemData ?? {}) };
  const premium: RawPremiumSectionData = { ...(premiumData ?? {}) };

  ui.languages = Array.isArray(ui.languages)
    ? normalizeLanguages(ui.languages as string[])
    : [];

  const pipelinePaths = system.customPaths?.pipeline || {};
  const watchedFoldersDirs = Array.isArray(pipelinePaths.watchedFoldersDirs)
    ? pipelinePaths.watchedFoldersDirs
    : [];
  const normalizedWatchedFoldersDirs =
    watchedFoldersDirs.length > 0
      ? watchedFoldersDirs
      : pipelinePaths.watchedFoldersDir
        ? [pipelinePaths.watchedFoldersDir]
        : [];

  const result: CombinedGeneralSettings = {
    // The full raw section bodies are preserved verbatim (matching the original
    // inline transformer); only the narrow typed view is surfaced here.
    ui: ui as GeneralSettingsLike["ui"],
    system: system as GeneralSettingsLike["system"],
    customPaths: {
      ...(system.customPaths || {}),
      pipeline: {
        ...pipelinePaths,
        pipelineDir: pipelinePaths.pipelineDir || "",
        watchedFoldersDir: pipelinePaths.watchedFoldersDir || "",
        watchedFoldersDirs: normalizedWatchedFoldersDirs,
        finishedFoldersDir: pipelinePaths.finishedFoldersDir || "",
      },
      operations: {
        ...(system.customPaths?.operations || {}),
        weasyprint: system.customPaths?.operations?.weasyprint || "",
        unoconvert: system.customPaths?.operations?.unoconvert || "",
      },
    },
    customMetadata:
      premium.proFeatures?.customMetadata || { ...DEFAULT_CUSTOM_METADATA },
  };

  // Merge pending blocks from all three endpoints
  const pendingBlock: Record<string, unknown> = {};
  if (ui._pending) {
    pendingBlock.ui = ui._pending;
  }
  if (system._pending) {
    pendingBlock.system = system._pending;
  }
  if (system._pending?.customPaths) {
    pendingBlock.customPaths = system._pending.customPaths;
  }
  if (premium._pending?.proFeatures?.customMetadata) {
    pendingBlock.customMetadata = premium._pending.proFeatures.customMetadata;
  }

  if (Object.keys(pendingBlock).length > 0) {
    result._pending = pendingBlock;
  }

  return result;
}
