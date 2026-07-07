/**
 * Pure helpers extracted from AdminSecuritySection.
 *
 * Every function here is deterministic: inputs -> output only, with no
 * React/hooks/DOM/I/O/network access and no mutation of its arguments.
 * They are unit-tested directly in adminSecuritySectionUtils.test.ts.
 *
 * All network / console.log / I/O side effects deliberately stay in the
 * component; only the pure data transforms live here.
 */

/** JWT-related security scalars. */
export interface JwtSettings {
  persistence?: boolean;
  enableKeyRotation?: boolean;
  enableKeyCleanup?: boolean;
  tokenExpiryMinutes?: number;
  desktopTokenExpiryMinutes?: number;
  allowedClockSkewSeconds?: number;
  refreshGraceMinutes?: number;
  secureCookie?: boolean;
}

/** Premium audit-trail settings. */
export interface AuditSettings {
  enabled?: boolean;
  level?: number;
  retentionDays?: number;
  captureFileHash?: boolean;
  capturePdfAuthor?: boolean;
  captureOperationResults?: boolean;
}

/** SSRF / URL-security policy under `system.html.urlSecurity`. */
export interface UrlSecuritySettings {
  enabled?: boolean;
  level?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  internalTlds?: string[];
  blockPrivateNetworks?: boolean;
  blockLocalhost?: boolean;
  blockLinkLocal?: boolean;
  blockCloudMetadata?: boolean;
}

/** `system.html` block (only the URL-security policy is consumed here). */
export interface HtmlSettings {
  urlSecurity?: UrlSecuritySettings;
}

/**
 * The flat, UI-facing security settings shape the component edits in state.
 * Mirrors what `combineSecurityFetchData` returns (minus `_pending`) and what
 * `buildSecuritySettingsSaveDelta` consumes.
 */
export interface SecuritySettingsLike {
  enableLogin?: boolean;
  loginMethod?: string;
  loginAttemptCount?: number;
  loginResetTimeMinutes?: number;
  xFrameOptions?: string;
  jwt?: JwtSettings;
  audit?: AuditSettings;
  html?: HtmlSettings;
}

/** The combined settings object surfaced to the component, with optional pending overlay. */
export type CombinedSecuritySettings = SecuritySettingsLike & {
  _pending?: Record<string, unknown>;
};

/**
 * Raw `/security` section body. Carries the security scalars/JWT plus an
 * optional `_pending` overlay and any extra fields the backend may add.
 */
export type RawSecuritySectionData = {
  _pending?: Record<string, unknown>;
} & SecuritySettingsLike &
  Record<string, unknown>;

/**
 * Raw `/premium` section body. Audit lives under `enterpriseFeatures.audit`,
 * both in the active body and inside the `_pending` overlay.
 */
export type RawPremiumSectionData = {
  _pending?: {
    enterpriseFeatures?: {
      audit?: unknown;
    };
  } & Record<string, unknown>;
  enterpriseFeatures?: {
    audit?: AuditSettings;
  } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * Raw `/system` section body. The HTML / URL-security policy lives under
 * `html`, both in the active body and inside the `_pending` overlay.
 */
export type RawSystemSectionData = {
  _pending?: {
    html?: unknown;
  } & Record<string, unknown>;
  html?: HtmlSettings;
} & Record<string, unknown>;

/**
 * Build the flat delta-settings object sent to the admin save endpoint.
 *
 * Mirrors the previous inline `saveTransformer` body exactly:
 *  - The security, JWT and premium-audit scalar keys are ALWAYS emitted (even
 *    when the value is `undefined`), so falsy `0`/`false`/`""` values are
 *    written verbatim rather than dropped.
 *  - The `system.html.urlSecurity.*` keys are only added when
 *    `html.urlSecurity` is present.
 */
export function buildSecuritySettingsSaveDelta(
  settings: SecuritySettingsLike,
): Record<string, unknown> {
  const { audit, html, ...securitySettings } = settings;

  const deltaSettings: Record<string, unknown> = {
    // Security settings
    "security.enableLogin": securitySettings.enableLogin,
    "security.loginMethod": securitySettings.loginMethod,
    "security.loginAttemptCount": securitySettings.loginAttemptCount,
    "security.loginResetTimeMinutes": securitySettings.loginResetTimeMinutes,
    "security.xFrameOptions": securitySettings.xFrameOptions,
    // JWT settings
    "security.jwt.persistence": securitySettings.jwt?.persistence,
    "security.jwt.enableKeyRotation": securitySettings.jwt?.enableKeyRotation,
    "security.jwt.enableKeyCleanup": securitySettings.jwt?.enableKeyCleanup,
    "security.jwt.tokenExpiryMinutes": securitySettings.jwt?.tokenExpiryMinutes,
    "security.jwt.desktopTokenExpiryMinutes":
      securitySettings.jwt?.desktopTokenExpiryMinutes,
    "security.jwt.allowedClockSkewSeconds":
      securitySettings.jwt?.allowedClockSkewSeconds,
    "security.jwt.refreshGraceMinutes":
      securitySettings.jwt?.refreshGraceMinutes,
    "security.jwt.secureCookie": securitySettings.jwt?.secureCookie,
    // Premium audit settings
    "premium.enterpriseFeatures.audit.enabled": audit?.enabled,
    "premium.enterpriseFeatures.audit.level": audit?.level,
    "premium.enterpriseFeatures.audit.retentionDays": audit?.retentionDays,
    "premium.enterpriseFeatures.audit.captureFileHash": audit?.captureFileHash,
    "premium.enterpriseFeatures.audit.capturePdfAuthor":
      audit?.capturePdfAuthor,
    "premium.enterpriseFeatures.audit.captureOperationResults":
      audit?.captureOperationResults,
  };

  // System HTML settings
  if (html?.urlSecurity) {
    deltaSettings["system.html.urlSecurity.enabled"] = html.urlSecurity.enabled;
    deltaSettings["system.html.urlSecurity.level"] = html.urlSecurity.level;
    deltaSettings["system.html.urlSecurity.allowedDomains"] =
      html.urlSecurity.allowedDomains;
    deltaSettings["system.html.urlSecurity.blockedDomains"] =
      html.urlSecurity.blockedDomains;
    deltaSettings["system.html.urlSecurity.internalTlds"] =
      html.urlSecurity.internalTlds;
    deltaSettings["system.html.urlSecurity.blockPrivateNetworks"] =
      html.urlSecurity.blockPrivateNetworks;
    deltaSettings["system.html.urlSecurity.blockLocalhost"] =
      html.urlSecurity.blockLocalhost;
    deltaSettings["system.html.urlSecurity.blockLinkLocal"] =
      html.urlSecurity.blockLinkLocal;
    deltaSettings["system.html.urlSecurity.blockCloudMetadata"] =
      html.urlSecurity.blockCloudMetadata;
  }

  return deltaSettings;
}

/**
 * Combine the three admin section responses (security / premium / system) into
 * the single settings object the component renders.
 *
 * This is the pure data-combining half of the previous inline
 * `fetchTransformer`; all of the network fetches and `console.log` calls stay
 * in the component.
 *
 * Behaviour preserved exactly:
 *  - Each section's `_pending` overlay is stripped off the active body.
 *  - The combined active object spreads the security active fields, attaches
 *    `audit` only when `premium.enterpriseFeatures.audit` exists, and attaches
 *    `html` only when `system.html` exists.
 *  - The three `_pending` overlays are merged in order
 *    (security -> premium audit -> system html), and `_pending` is attached to
 *    the result only when the merged overlay is non-empty.
 *
 * `null`/`undefined` section bodies are treated as `{}`, matching the
 * component's `response.data || {}` guard.
 */
export function combineSecurityFetchData(
  securityData: RawSecuritySectionData | null | undefined,
  premiumData: RawPremiumSectionData | null | undefined,
  systemData: RawSystemSectionData | null | undefined,
): CombinedSecuritySettings {
  const { _pending: securityPending, ...securityActive } = securityData ?? {};
  const { _pending: premiumPending, ...premiumActive } = premiumData ?? {};
  const { _pending: systemPending, ...systemActive } = systemData ?? {};

  const combined: CombinedSecuritySettings = {
    ...securityActive,
  };

  // Only add audit if it exists (don't create defaults)
  if (premiumActive.enterpriseFeatures?.audit) {
    combined.audit = premiumActive.enterpriseFeatures.audit;
  }

  // Only add html if it exists (don't create defaults)
  if (systemActive.html) {
    combined.html = systemActive.html;
  }

  // Merge all _pending blocks
  const mergedPending: Record<string, unknown> = {};
  if (securityPending) {
    Object.assign(mergedPending, securityPending);
  }
  if (premiumPending?.enterpriseFeatures?.audit) {
    mergedPending.audit = premiumPending.enterpriseFeatures.audit;
  }
  if (systemPending?.html) {
    mergedPending.html = systemPending.html;
  }

  if (Object.keys(mergedPending).length > 0) {
    combined._pending = mergedPending;
  }

  return combined;
}
