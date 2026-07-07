import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import {
  validateEmail,
  getModalTitle,
} from "@app/components/shared/stripeCheckout/utils/checkoutUtils";
import type { CheckoutStage } from "@app/components/shared/stripeCheckout/types/checkout";

// ---------------------------------------------------------------------------
// Deterministic i18next stub. getModalTitle only invokes t(key, defaultValue,
// options?) and returns its string result. The stub records the call and
// renders the defaultValue, interpolating {{planName}} from options so the
// returned string is fully predictable without a real i18n runtime.
// ---------------------------------------------------------------------------

type TCall = {
  key: string;
  defaultValue: string;
  options?: Record<string, unknown>;
};

const makeT = (): { t: TFunction; calls: TCall[] } => {
  const calls: TCall[] = [];
  const t = ((
    key: string,
    defaultValue: string,
    options?: Record<string, unknown>,
  ): string => {
    calls.push({ key, defaultValue, options });
    return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const value = options?.[name];
      return value === undefined ? "" : String(value);
    });
  }) as unknown as TFunction;
  return { t, calls };
};

describe("checkoutUtils", () => {
  describe("validateEmail", () => {
    it("accepts a standard well-formed address", () => {
      expect(validateEmail("user@example.com")).toEqual({
        valid: true,
        error: "",
      });
    });

    it("accepts addresses with subdomains and plus tags", () => {
      expect(validateEmail("john.doe+tag@mail.example.co.uk")).toEqual({
        valid: true,
        error: "",
      });
    });

    it("accepts a minimal single-character local/domain/tld address", () => {
      expect(validateEmail("a@b.c")).toEqual({ valid: true, error: "" });
    });

    it("rejects an empty string", () => {
      expect(validateEmail("")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects a string with no @ separator", () => {
      expect(validateEmail("plainaddress")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address missing the domain part", () => {
      expect(validateEmail("user@")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address missing the local part", () => {
      expect(validateEmail("@example.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address with no top-level domain (no dot)", () => {
      expect(validateEmail("user@example")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address containing whitespace", () => {
      expect(validateEmail("user name@example.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
      expect(validateEmail("user@exa mple.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
      expect(validateEmail(" user@example.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address with multiple @ signs", () => {
      expect(validateEmail("user@@example.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
      expect(validateEmail("a@b@example.com")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });

    it("rejects an address whose tld segment is empty (trailing dot)", () => {
      expect(validateEmail("user@example.")).toEqual({
        valid: false,
        error: "Please enter a valid email address",
      });
    });
  });

  describe("getModalTitle", () => {
    it("renders the email stage title with the interpolated plan name", () => {
      const { t, calls } = makeT();

      expect(getModalTitle("email", "Pro", t)).toBe("Get Started - Pro");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        key: "payment.emailStage.modalTitle",
        defaultValue: "Get Started - {{planName}}",
        options: { planName: "Pro" },
      });
    });

    it("renders the plan-selection stage title", () => {
      const { t, calls } = makeT();

      expect(getModalTitle("plan-selection", "Team", t)).toBe(
        "Select Billing Period - Team",
      );
      expect(calls[0].key).toBe("payment.planStage.modalTitle");
      expect(calls[0].options).toEqual({ planName: "Team" });
    });

    it("renders the payment stage title", () => {
      const { t, calls } = makeT();

      expect(getModalTitle("payment", "Enterprise", t)).toBe(
        "Complete Payment - Enterprise",
      );
      expect(calls[0].key).toBe("payment.paymentStage.modalTitle");
      expect(calls[0].options).toEqual({ planName: "Enterprise" });
    });

    it("renders the success stage title without interpolation", () => {
      const { t, calls } = makeT();

      expect(getModalTitle("success", "Pro", t)).toBe("Payment Successful!");
      // The success branch passes no options object.
      expect(calls[0]).toEqual({
        key: "payment.success",
        defaultValue: "Payment Successful!",
        options: undefined,
      });
    });

    it("renders the error stage title without interpolation", () => {
      const { t, calls } = makeT();

      expect(getModalTitle("error", "Pro", t)).toBe("Payment Error");
      expect(calls[0]).toEqual({
        key: "payment.error",
        defaultValue: "Payment Error",
        options: undefined,
      });
    });

    it("falls back to the upgrade title for an unrecognized stage", () => {
      const { t, calls } = makeT();

      // Force an out-of-union value to exercise the default switch branch.
      const unknownStage = "unknown" as CheckoutStage;
      expect(getModalTitle(unknownStage, "Pro", t)).toBe("Upgrade to Pro");
      expect(calls[0]).toEqual({
        key: "payment.upgradeTitle",
        defaultValue: "Upgrade to {{planName}}",
        options: { planName: "Pro" },
      });
    });

    it("interpolates an empty plan name without throwing", () => {
      const { t } = makeT();

      expect(getModalTitle("email", "", t)).toBe("Get Started - ");
    });

    it("passes the raw plan name through to the t options for each interpolated stage", () => {
      const stages: Array<{ stage: CheckoutStage; expected: string }> = [
        { stage: "email", expected: "Get Started - Acme & Co" },
        {
          stage: "plan-selection",
          expected: "Select Billing Period - Acme & Co",
        },
        { stage: "payment", expected: "Complete Payment - Acme & Co" },
      ];

      for (const { stage, expected } of stages) {
        const { t } = makeT();
        expect(getModalTitle(stage, "Acme & Co", t)).toBe(expected);
      }
    });
  });
});
