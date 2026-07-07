import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isStripeConfigured,
  isSecureContext,
  getCheckoutMode,
  canUseEmbeddedCheckout,
} from "@app/utils/protocolDetection";

/**
 * protocolDetection.ts branches purely on two stubbable inputs:
 *   - import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY (read at call time)
 *   - window.location.protocol / the presence of `window` itself
 *
 * Both are read inside the functions (not at module load), so we can stub
 * per-test without resetting modules. We use vi.stubEnv for the env var and
 * either override window.location.protocol or remove `window` entirely to
 * drive every branch deterministically. jsdom defaults the protocol to
 * "http:", so each test sets the inputs it cares about explicitly.
 */

const ENV_KEY = "VITE_STRIPE_PUBLISHABLE_KEY";

/** Force window.location.protocol to a known value for the SecureContext path. */
function setProtocol(protocol: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...window.location, protocol },
  });
}

describe("protocolDetection", () => {
  beforeEach(() => {
    // Start each test from a known, insecure-by-default baseline.
    setProtocol("http:");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("isStripeConfigured", () => {
    it("returns true for a well-formed test publishable key", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc123");
      expect(isStripeConfigured()).toBe(true);
    });

    it("returns true for a live publishable key (also pk_-prefixed)", () => {
      vi.stubEnv(ENV_KEY, "pk_live_xyz789");
      expect(isStripeConfigured()).toBe(true);
    });

    it("returns false when the env var is an empty string", () => {
      vi.stubEnv(ENV_KEY, "");
      expect(isStripeConfigured()).toBe(false);
    });

    it("returns false when the key has the wrong prefix (e.g. a secret key)", () => {
      vi.stubEnv(ENV_KEY, "sk_test_secret");
      expect(isStripeConfigured()).toBe(false);
    });

    it("returns false for a key that merely contains 'pk_' but does not start with it", () => {
      vi.stubEnv(ENV_KEY, "xpk_test_abc");
      expect(isStripeConfigured()).toBe(false);
    });

    it("is case-sensitive: an uppercase prefix is not accepted", () => {
      vi.stubEnv(ENV_KEY, "PK_test_abc");
      expect(isStripeConfigured()).toBe(false);
    });

    it("accepts the bare prefix 'pk_' with no remainder", () => {
      // startsWith("pk_") is satisfied and the string is truthy.
      vi.stubEnv(ENV_KEY, "pk_");
      expect(isStripeConfigured()).toBe(true);
    });
  });

  describe("isSecureContext", () => {
    it("returns true when the protocol is https:", () => {
      setProtocol("https:");
      expect(isSecureContext()).toBe(true);
    });

    it("returns false when the protocol is http:", () => {
      setProtocol("http:");
      expect(isSecureContext()).toBe(false);
    });

    it("returns false for localhost over http (no localhost carve-out is active)", () => {
      // The localhost shortcut is commented out in the source, so an http
      // localhost must still be treated as insecure.
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...window.location, protocol: "http:", hostname: "localhost" },
      });
      expect(isSecureContext()).toBe(false);
    });

    it("returns false for other protocols such as file:", () => {
      setProtocol("file:");
      expect(isSecureContext()).toBe(false);
    });

    it("returns false in an SSR-like context where window is undefined", () => {
      vi.stubGlobal("window", undefined);
      expect(isSecureContext()).toBe(false);
    });
  });

  describe("getCheckoutMode", () => {
    it("returns 'embedded' when configured AND on https", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      setProtocol("https:");
      expect(getCheckoutMode()).toBe("embedded");
    });

    it("returns 'hosted' when configured but on http", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      setProtocol("http:");
      expect(getCheckoutMode()).toBe("hosted");
    });

    it("returns 'hosted' when no key is configured even on https", () => {
      // Missing key forces hosted regardless of protocol.
      vi.stubEnv(ENV_KEY, "");
      setProtocol("https:");
      expect(getCheckoutMode()).toBe("hosted");
    });

    it("returns 'hosted' when no key is configured and on http", () => {
      vi.stubEnv(ENV_KEY, "");
      setProtocol("http:");
      expect(getCheckoutMode()).toBe("hosted");
    });

    it("short-circuits to 'hosted' for an invalid-prefix key on https", () => {
      // isStripeConfigured() is false, so protocol is never consulted.
      vi.stubEnv(ENV_KEY, "sk_test_secret");
      setProtocol("https:");
      expect(getCheckoutMode()).toBe("hosted");
    });
  });

  describe("canUseEmbeddedCheckout", () => {
    it("returns true only when secure context AND configured key are both present", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      setProtocol("https:");
      expect(canUseEmbeddedCheckout()).toBe(true);
    });

    it("returns false when secure but no valid key", () => {
      vi.stubEnv(ENV_KEY, "sk_test_secret");
      setProtocol("https:");
      expect(canUseEmbeddedCheckout()).toBe(false);
    });

    it("returns false when key is valid but context is insecure (http)", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      setProtocol("http:");
      expect(canUseEmbeddedCheckout()).toBe(false);
    });

    it("returns false when neither condition is met", () => {
      vi.stubEnv(ENV_KEY, "");
      setProtocol("http:");
      expect(canUseEmbeddedCheckout()).toBe(false);
    });

    it("returns false in an SSR context regardless of key (window undefined)", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      vi.stubGlobal("window", undefined);
      expect(canUseEmbeddedCheckout()).toBe(false);
    });

    it("stays consistent with getCheckoutMode === 'embedded'", () => {
      vi.stubEnv(ENV_KEY, "pk_test_abc");
      setProtocol("https:");
      // The two helpers encode the same condition from different angles.
      expect(canUseEmbeddedCheckout()).toBe(getCheckoutMode() === "embedded");

      setProtocol("http:");
      expect(canUseEmbeddedCheckout()).toBe(getCheckoutMode() === "embedded");
    });
  });
});
