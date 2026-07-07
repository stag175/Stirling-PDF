import { describe, it, expect } from "vitest";
import {
  calculateMonthlyEquivalent,
  calculateTotalWithSeats,
  formatPrice,
  calculateDisplayPricing,
} from "@app/components/shared/stripeCheckout/utils/pricingUtils";

describe("pricingUtils", () => {
  describe("calculateMonthlyEquivalent", () => {
    it("divides a yearly price by 12", () => {
      expect(calculateMonthlyEquivalent(120)).toBe(10);
      expect(calculateMonthlyEquivalent(60)).toBe(5);
    });

    it("returns a fractional result when 12 does not divide evenly", () => {
      expect(calculateMonthlyEquivalent(100)).toBeCloseTo(8.3333333, 6);
    });

    it("returns 0 for a yearly price of 0", () => {
      expect(calculateMonthlyEquivalent(0)).toBe(0);
    });

    it("handles negative prices (e.g. a credit)", () => {
      expect(calculateMonthlyEquivalent(-24)).toBe(-2);
    });
  });

  describe("calculateTotalWithSeats", () => {
    it("adds seatPrice * seatCount to the base price", () => {
      expect(calculateTotalWithSeats(100, 10, 3)).toBe(130);
    });

    it("returns only the base price when seatPrice is undefined", () => {
      // The undefined branch short-circuits before any seat math.
      expect(calculateTotalWithSeats(100, undefined, 5)).toBe(100);
    });

    it("returns the base price when seatPrice is defined but seatCount is 0", () => {
      expect(calculateTotalWithSeats(100, 10, 0)).toBe(100);
    });

    it("treats a seatPrice of 0 as a real value (not the undefined branch)", () => {
      // 0 !== undefined, so the seat term is evaluated and contributes nothing.
      expect(calculateTotalWithSeats(50, 0, 10)).toBe(50);
    });

    it("supports a base price of 0 with paid seats", () => {
      expect(calculateTotalWithSeats(0, 7, 4)).toBe(28);
    });

    it("produces floating point sums for decimal inputs", () => {
      expect(calculateTotalWithSeats(9.99, 2.5, 2)).toBeCloseTo(14.99, 5);
    });
  });

  describe("formatPrice", () => {
    it("prefixes the currency and fixes to 2 decimals by default", () => {
      expect(formatPrice(9.5, "£")).toBe("£9.50");
      expect(formatPrice(10, "$")).toBe("$10.00");
    });

    it("respects a custom decimals argument", () => {
      expect(formatPrice(9.999, "£", 0)).toBe("£10");
      expect(formatPrice(9.5, "$", 3)).toBe("$9.500");
    });

    it("rounds to the requested precision via toFixed", () => {
      expect(formatPrice(1.005, "€", 2)).toBe("€1.00");
      expect(formatPrice(1.235, "€", 2)).toBe("€1.24");
    });

    it("formats zero and negative amounts", () => {
      expect(formatPrice(0, "£")).toBe("£0.00");
      expect(formatPrice(-3.5, "$")).toBe("$-3.50");
    });

    it("works with a multi-character or empty currency string", () => {
      expect(formatPrice(5, "USD ")).toBe("USD 5.00");
      expect(formatPrice(5, "")).toBe("5.00");
    });
  });

  describe("calculateDisplayPricing", () => {
    it("falls back to monthly pricing when no yearly plan exists", () => {
      const result = calculateDisplayPricing({
        price: 12,
        seatPrice: 4,
        currency: "$",
      });

      expect(result).toEqual({
        displayPrice: 12,
        displaySeatPrice: 4,
        displayCurrency: "$",
      });
    });

    it("uses 0 price and £ currency defaults when both plans are missing", () => {
      const result = calculateDisplayPricing();

      expect(result).toEqual({
        displayPrice: 0,
        displaySeatPrice: undefined,
        displayCurrency: "£",
      });
    });

    it("falls back to £ currency when monthly omits currency", () => {
      const result = calculateDisplayPricing({
        price: 20,
        currency: "",
      });

      // Empty currency string is falsy, so the "£" default applies.
      expect(result.displayCurrency).toBe("£");
      expect(result.displayPrice).toBe(20);
      expect(result.displaySeatPrice).toBeUndefined();
    });

    it("preserves an undefined monthly seatPrice in the fallback", () => {
      const result = calculateDisplayPricing({ price: 5, currency: "€" });

      expect(result.displaySeatPrice).toBeUndefined();
      expect(result.displayPrice).toBe(5);
      expect(result.displayCurrency).toBe("€");
    });

    it("divides yearly price by 12 when a yearly plan exists, ignoring monthly", () => {
      const result = calculateDisplayPricing(
        { price: 999, seatPrice: 99, currency: "$" },
        { price: 120, seatPrice: 48, currency: "€" },
      );

      // Yearly wins entirely: price/12 and seatPrice/12, with yearly currency.
      expect(result.displayPrice).toBe(10);
      expect(result.displaySeatPrice).toBe(4);
      expect(result.displayCurrency).toBe("€");
    });

    it("returns undefined seat price when the yearly plan has no seatPrice", () => {
      const result = calculateDisplayPricing(undefined, {
        price: 240,
        currency: "£",
      });

      expect(result.displayPrice).toBe(20);
      expect(result.displaySeatPrice).toBeUndefined();
      expect(result.displayCurrency).toBe("£");
    });

    it("treats a yearly seatPrice of 0 as falsy, yielding an undefined display seat price", () => {
      // The implementation uses `yearly.seatPrice ? ... : undefined`, so 0 -> undefined.
      const result = calculateDisplayPricing(undefined, {
        price: 120,
        seatPrice: 0,
        currency: "$",
      });

      expect(result.displayPrice).toBe(10);
      expect(result.displaySeatPrice).toBeUndefined();
    });

    it("uses the yearly branch even when its price is 0 (yearly is defined)", () => {
      // Presence of the yearly object — not its price — selects the branch.
      const result = calculateDisplayPricing(
        { price: 50, currency: "$" },
        { price: 0, currency: "£" },
      );

      expect(result.displayPrice).toBe(0);
      expect(result.displayCurrency).toBe("£");
    });

    it("produces a fractional monthly equivalent from an odd yearly price", () => {
      const result = calculateDisplayPricing(undefined, {
        price: 100,
        seatPrice: 50,
        currency: "$",
      });

      expect(result.displayPrice).toBeCloseTo(8.3333333, 6);
      expect(result.displaySeatPrice).toBeCloseTo(4.1666667, 6);
    });
  });
});
