import { describe, it, expect } from "vitest";
import {
  buildSecuritySettingsSaveDelta,
  combineSecurityFetchData,
  type RawPremiumSectionData,
  type RawSecuritySectionData,
  type RawSystemSectionData,
  type SecuritySettingsLike,
} from "@app/components/shared/config/configSections/adminSecuritySectionUtils";

describe("adminSecuritySectionUtils", () => {
  describe("buildSecuritySettingsSaveDelta", () => {
    const ALWAYS_PRESENT_KEYS = [
      "security.enableLogin",
      "security.loginMethod",
      "security.loginAttemptCount",
      "security.loginResetTimeMinutes",
      "security.xFrameOptions",
      "security.jwt.persistence",
      "security.jwt.enableKeyRotation",
      "security.jwt.enableKeyCleanup",
      "security.jwt.tokenExpiryMinutes",
      "security.jwt.desktopTokenExpiryMinutes",
      "security.jwt.allowedClockSkewSeconds",
      "security.jwt.refreshGraceMinutes",
      "security.jwt.secureCookie",
      "premium.enterpriseFeatures.audit.enabled",
      "premium.enterpriseFeatures.audit.level",
      "premium.enterpriseFeatures.audit.retentionDays",
      "premium.enterpriseFeatures.audit.captureFileHash",
      "premium.enterpriseFeatures.audit.capturePdfAuthor",
      "premium.enterpriseFeatures.audit.captureOperationResults",
    ];

    it("emits exactly the always-present keys (all undefined) for empty input", () => {
      const delta = buildSecuritySettingsSaveDelta({});
      expect(Object.keys(delta).sort()).toEqual([...ALWAYS_PRESENT_KEYS].sort());
      for (const key of ALWAYS_PRESENT_KEYS) {
        expect(delta[key]).toBeUndefined();
      }
      // No urlSecurity keys when html is absent.
      expect(
        Object.keys(delta).some((k) => k.startsWith("system.html.urlSecurity.")),
      ).toBe(false);
    });

    it("maps top-level security scalars to their backend paths", () => {
      const delta = buildSecuritySettingsSaveDelta({
        enableLogin: true,
        loginMethod: "normal",
        loginAttemptCount: 5,
        loginResetTimeMinutes: 30,
        xFrameOptions: "DENY",
      });
      expect(delta["security.enableLogin"]).toBe(true);
      expect(delta["security.loginMethod"]).toBe("normal");
      expect(delta["security.loginAttemptCount"]).toBe(5);
      expect(delta["security.loginResetTimeMinutes"]).toBe(30);
      expect(delta["security.xFrameOptions"]).toBe("DENY");
    });

    it("maps every JWT field to its security.jwt.* path", () => {
      const delta = buildSecuritySettingsSaveDelta({
        jwt: {
          persistence: true,
          enableKeyRotation: false,
          enableKeyCleanup: true,
          tokenExpiryMinutes: 60,
          desktopTokenExpiryMinutes: 120,
          allowedClockSkewSeconds: 30,
          refreshGraceMinutes: 5,
          secureCookie: true,
        },
      });
      expect(delta["security.jwt.persistence"]).toBe(true);
      expect(delta["security.jwt.enableKeyRotation"]).toBe(false);
      expect(delta["security.jwt.enableKeyCleanup"]).toBe(true);
      expect(delta["security.jwt.tokenExpiryMinutes"]).toBe(60);
      expect(delta["security.jwt.desktopTokenExpiryMinutes"]).toBe(120);
      expect(delta["security.jwt.allowedClockSkewSeconds"]).toBe(30);
      expect(delta["security.jwt.refreshGraceMinutes"]).toBe(5);
      expect(delta["security.jwt.secureCookie"]).toBe(true);
    });

    it("maps every audit field to its premium.enterpriseFeatures.audit.* path", () => {
      const delta = buildSecuritySettingsSaveDelta({
        audit: {
          enabled: true,
          level: 2,
          retentionDays: 90,
          captureFileHash: true,
          capturePdfAuthor: false,
          captureOperationResults: true,
        },
      });
      expect(delta["premium.enterpriseFeatures.audit.enabled"]).toBe(true);
      expect(delta["premium.enterpriseFeatures.audit.level"]).toBe(2);
      expect(delta["premium.enterpriseFeatures.audit.retentionDays"]).toBe(90);
      expect(delta["premium.enterpriseFeatures.audit.captureFileHash"]).toBe(
        true,
      );
      expect(delta["premium.enterpriseFeatures.audit.capturePdfAuthor"]).toBe(
        false,
      );
      expect(
        delta["premium.enterpriseFeatures.audit.captureOperationResults"],
      ).toBe(true);
    });

    it("preserves falsy scalar values verbatim (0, false, empty string)", () => {
      const delta = buildSecuritySettingsSaveDelta({
        enableLogin: false,
        loginMethod: "",
        loginAttemptCount: 0,
        loginResetTimeMinutes: 0,
        xFrameOptions: "",
        jwt: {
          persistence: false,
          tokenExpiryMinutes: 0,
          allowedClockSkewSeconds: 0,
          secureCookie: false,
        },
        audit: {
          enabled: false,
          level: 0,
          retentionDays: 0,
        },
      });
      expect(delta["security.enableLogin"]).toBe(false);
      expect(delta["security.loginMethod"]).toBe("");
      expect(delta["security.loginAttemptCount"]).toBe(0);
      expect(delta["security.loginResetTimeMinutes"]).toBe(0);
      expect(delta["security.xFrameOptions"]).toBe("");
      expect(delta["security.jwt.persistence"]).toBe(false);
      expect(delta["security.jwt.tokenExpiryMinutes"]).toBe(0);
      expect(delta["security.jwt.allowedClockSkewSeconds"]).toBe(0);
      expect(delta["security.jwt.secureCookie"]).toBe(false);
      expect(delta["premium.enterpriseFeatures.audit.enabled"]).toBe(false);
      expect(delta["premium.enterpriseFeatures.audit.level"]).toBe(0);
      expect(delta["premium.enterpriseFeatures.audit.retentionDays"]).toBe(0);
    });

    it("adds all urlSecurity keys when html.urlSecurity is present", () => {
      const delta = buildSecuritySettingsSaveDelta({
        html: {
          urlSecurity: {
            enabled: true,
            level: "strict",
            allowedDomains: ["a.com"],
            blockedDomains: ["b.com"],
            internalTlds: [".internal"],
            blockPrivateNetworks: true,
            blockLocalhost: false,
            blockLinkLocal: true,
            blockCloudMetadata: false,
          },
        },
      });
      expect(delta["system.html.urlSecurity.enabled"]).toBe(true);
      expect(delta["system.html.urlSecurity.level"]).toBe("strict");
      expect(delta["system.html.urlSecurity.allowedDomains"]).toEqual([
        "a.com",
      ]);
      expect(delta["system.html.urlSecurity.blockedDomains"]).toEqual([
        "b.com",
      ]);
      expect(delta["system.html.urlSecurity.internalTlds"]).toEqual([
        ".internal",
      ]);
      expect(delta["system.html.urlSecurity.blockPrivateNetworks"]).toBe(true);
      expect(delta["system.html.urlSecurity.blockLocalhost"]).toBe(false);
      expect(delta["system.html.urlSecurity.blockLinkLocal"]).toBe(true);
      expect(delta["system.html.urlSecurity.blockCloudMetadata"]).toBe(false);
    });

    it("emits urlSecurity keys (with undefined values) when urlSecurity is an empty object", () => {
      const delta = buildSecuritySettingsSaveDelta({ html: { urlSecurity: {} } });
      expect("system.html.urlSecurity.enabled" in delta).toBe(true);
      expect(delta["system.html.urlSecurity.enabled"]).toBeUndefined();
      expect(delta["system.html.urlSecurity.allowedDomains"]).toBeUndefined();
      expect(delta["system.html.urlSecurity.blockCloudMetadata"]).toBeUndefined();
    });

    it("omits urlSecurity keys entirely when html is present but urlSecurity is missing", () => {
      const delta = buildSecuritySettingsSaveDelta({ html: {} });
      expect(
        Object.keys(delta).some((k) => k.startsWith("system.html.urlSecurity.")),
      ).toBe(false);
    });

    it("omits urlSecurity keys entirely when html is absent", () => {
      const delta = buildSecuritySettingsSaveDelta({ enableLogin: true });
      expect("system.html.urlSecurity.enabled" in delta).toBe(false);
    });

    it("does not mutate the input settings object", () => {
      const settings: SecuritySettingsLike = {
        enableLogin: true,
        jwt: { tokenExpiryMinutes: 60 },
        audit: { enabled: true },
        html: { urlSecurity: { level: "strict", allowedDomains: ["a.com"] } },
      };
      const snapshot = JSON.parse(JSON.stringify(settings));
      buildSecuritySettingsSaveDelta(settings);
      expect(settings).toEqual(snapshot);
    });
  });

  describe("combineSecurityFetchData", () => {
    it("treats null/undefined section bodies as empty objects", () => {
      expect(combineSecurityFetchData(undefined, undefined, undefined)).toEqual(
        {},
      );
      expect(combineSecurityFetchData(null, null, null)).toEqual({});
    });

    it("spreads the security active fields onto the combined object", () => {
      const combined = combineSecurityFetchData(
        {
          enableLogin: true,
          loginMethod: "normal",
          jwt: { tokenExpiryMinutes: 60 },
        },
        {},
        {},
      );
      expect(combined).toEqual({
        enableLogin: true,
        loginMethod: "normal",
        jwt: { tokenExpiryMinutes: 60 },
      });
    });

    it("strips _pending off each active section body", () => {
      const securityData: RawSecuritySectionData = {
        enableLogin: true,
        _pending: { enableLogin: false },
      };
      const combined = combineSecurityFetchData(securityData, {}, {});
      // _pending value must not leak into the active fields beyond the overlay.
      expect(combined.enableLogin).toBe(true);
      expect(combined._pending).toEqual({ enableLogin: false });
    });

    it("attaches audit only when premium.enterpriseFeatures.audit exists", () => {
      const withAudit = combineSecurityFetchData(
        {},
        { enterpriseFeatures: { audit: { enabled: true } } },
        {},
      );
      expect(withAudit.audit).toEqual({ enabled: true });

      const noAuditNode = combineSecurityFetchData(
        {},
        { enterpriseFeatures: {} },
        {},
      );
      expect("audit" in noAuditNode).toBe(false);

      const noEnterprise = combineSecurityFetchData({}, {}, {});
      expect("audit" in noEnterprise).toBe(false);
    });

    it("attaches html only when system.html exists", () => {
      const withHtml = combineSecurityFetchData(
        {},
        {},
        { html: { urlSecurity: { enabled: true } } },
      );
      expect(withHtml.html).toEqual({ urlSecurity: { enabled: true } });

      const noHtml = combineSecurityFetchData({}, {}, {});
      expect("html" in noHtml).toBe(false);
    });

    it("does not attach _pending when nothing is pending", () => {
      const combined = combineSecurityFetchData(
        { enableLogin: true },
        { enterpriseFeatures: { audit: { enabled: true } } },
        { html: { urlSecurity: {} } },
      );
      expect("_pending" in combined).toBe(false);
    });

    it("merges security, premium-audit and system-html pending overlays", () => {
      const combined = combineSecurityFetchData(
        { _pending: { enableLogin: false, loginMethod: "normal" } },
        { _pending: { enterpriseFeatures: { audit: { enabled: true } } } },
        { _pending: { html: { urlSecurity: { level: "strict" } } } },
      );
      expect(combined._pending).toEqual({
        enableLogin: false,
        loginMethod: "normal",
        audit: { enabled: true },
        html: { urlSecurity: { level: "strict" } },
      });
    });

    it("merges pending overlays in security -> audit -> html order", () => {
      // security pending sets an `audit` key that should then be overwritten by
      // the premium pending audit (security is Object.assign'd first).
      const combined = combineSecurityFetchData(
        { _pending: { audit: { enabled: false }, foo: 1 } },
        { _pending: { enterpriseFeatures: { audit: { enabled: true } } } },
        {},
      );
      expect(combined._pending).toEqual({
        audit: { enabled: true },
        foo: 1,
      });
    });

    it("omits premium pending audit when enterpriseFeatures.audit is absent", () => {
      const combined = combineSecurityFetchData(
        { _pending: { enableLogin: false } },
        { _pending: { enterpriseFeatures: {} } },
        {},
      );
      expect(combined._pending).toEqual({ enableLogin: false });
      expect(combined._pending && "audit" in combined._pending).toBe(false);
    });

    it("omits system pending html when html is absent", () => {
      const combined = combineSecurityFetchData(
        { _pending: { enableLogin: false } },
        {},
        { _pending: {} },
      );
      expect(combined._pending).toEqual({ enableLogin: false });
      expect(combined._pending && "html" in combined._pending).toBe(false);
    });

    it("combines active fields and pending overlays together", () => {
      const combined = combineSecurityFetchData(
        { enableLogin: true, _pending: { enableLogin: false } },
        {
          enterpriseFeatures: { audit: { enabled: false } },
          _pending: { enterpriseFeatures: { audit: { enabled: true } } },
        },
        {
          html: { urlSecurity: { level: "off" } },
          _pending: { html: { urlSecurity: { level: "strict" } } },
        },
      );
      expect(combined.enableLogin).toBe(true);
      expect(combined.audit).toEqual({ enabled: false });
      expect(combined.html).toEqual({ urlSecurity: { level: "off" } });
      expect(combined._pending).toEqual({
        enableLogin: false,
        audit: { enabled: true },
        html: { urlSecurity: { level: "strict" } },
      });
    });

    it("does not mutate the input section bodies", () => {
      const securityData: RawSecuritySectionData = {
        enableLogin: true,
        _pending: { enableLogin: false },
      };
      const premiumData: RawPremiumSectionData = {
        enterpriseFeatures: { audit: { enabled: true } },
        _pending: { enterpriseFeatures: { audit: { enabled: false } } },
      };
      const systemData: RawSystemSectionData = {
        html: { urlSecurity: { level: "strict" } },
        _pending: { html: { urlSecurity: { level: "off" } } },
      };
      const securitySnap = JSON.parse(JSON.stringify(securityData));
      const premiumSnap = JSON.parse(JSON.stringify(premiumData));
      const systemSnap = JSON.parse(JSON.stringify(systemData));

      combineSecurityFetchData(securityData, premiumData, systemData);

      expect(securityData).toEqual(securitySnap);
      expect(premiumData).toEqual(premiumSnap);
      expect(systemData).toEqual(systemSnap);
    });
  });
});
