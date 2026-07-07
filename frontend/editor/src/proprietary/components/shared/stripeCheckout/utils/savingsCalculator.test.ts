import { describe, it, expect } from "vitest";
import { calculateSavings } from "@app/components/shared/stripeCheckout/utils/savingsCalculator";
import type { PlanTier, PlanTierGroup } from "@app/services/licenseService";

// ---------------------------------------------------------------------------
// Fixture builders. calculateSavings only reads `tier`, `monthly`, `yearly`
// and from each PlanTier `price`, `seatPrice`, `currency`. Everything else is
// padded with inert defaults so the objects satisfy the interfaces without
// influencing the arithmetic under test.
// ---------------------------------------------------------------------------

const makePlan = (overrides: Partial<PlanTier> = {}): PlanTier => ({
  id: "plan-id",
  name: "Plan",
  price: 0,
  currency: "usd",
  period: "monthly",
  features: [],
  highlights: [],
  lookupKey: "lookup:key",
  ...overrides,
});

const makeGroup = (overrides: Partial<PlanTierGroup> = {}): PlanTierGroup => ({
  tier: "server",
  name: "Group",
  monthly: null,
  yearly: null,
  features: [],
  highlights: [],
  ...overrides,
});

describe("calculateSavings", () => {
  describe("null guards (missing plan availability)", () => {
    it("returns null when monthly is missing", () => {
      const group = makeGroup({
        monthly: null,
        yearly: makePlan({ price: 100 }),
      });
      expect(calculateSavings(group, 1)).toBeNull();
    });

    it("returns null when yearly is missing", () => {
      const group = makeGroup({
        monthly: makePlan({ price: 10 }),
        yearly: null,
      });
      expect(calculateSavings(group, 1)).toBeNull();
    });

    it("returns null when both monthly and yearly are missing", () => {
      expect(calculateSavings(makeGroup(), 1)).toBeNull();
    });
  });

  describe("server branch (no seat pricing)", () => {
    it("computes annualized monthly vs yearly total and rounded percent", () => {
      // monthlyAnnual = 10 * 12 = 120; yearlyTotal = 100 => savings 20 (~16.67%).
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10, currency: "usd" }),
        yearly: makePlan({ price: 100, currency: "eur" }),
      });

      const result = calculateSavings(group, 1);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        amount: 20,
        percent: 17, // Math.round(20 / 120 * 100) = Math.round(16.66) = 17
        currency: "eur", // currency is sourced from the YEARLY plan
      });
    });

    it("ignores minimumSeats entirely on the server branch", () => {
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10 }),
        yearly: makePlan({ price: 100 }),
      });

      // Seat count must have no effect when seat pricing is absent.
      const oneSeat = calculateSavings(group, 1);
      const manySeats = calculateSavings(group, 250);
      const zeroSeats = calculateSavings(group, 0);

      expect(oneSeat).toEqual(manySeats);
      expect(oneSeat).toEqual(zeroSeats);
      expect(oneSeat?.amount).toBe(20);
    });

    it("uses the server branch even when seatPrice fields are present on a non-enterprise tier", () => {
      // seatPrice exists but tier !== 'enterprise', so seats are ignored.
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10, seatPrice: 5 }),
        yearly: makePlan({ price: 100, seatPrice: 5 }),
      });

      const result = calculateSavings(group, 10);

      // Still 10*12 - 100 = 20, NOT influenced by the 10 seats * 5.
      expect(result?.amount).toBe(20);
      expect(result?.percent).toBe(17);
    });

    it("produces negative savings and percent when yearly costs more than annualized monthly", () => {
      // monthlyAnnual = 5 * 12 = 60; yearlyTotal = 90 => savings -30 (-50%).
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 5 }),
        yearly: makePlan({ price: 90 }),
      });

      const result = calculateSavings(group, 1);

      expect(result?.amount).toBe(-30);
      expect(result?.percent).toBe(-50);
    });

    it("returns zero savings and zero percent when prices break even", () => {
      // monthlyAnnual = 10 * 12 = 120; yearlyTotal = 120 => savings 0 (0%).
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10 }),
        yearly: makePlan({ price: 120 }),
      });

      const result = calculateSavings(group, 1);

      expect(result?.amount).toBe(0);
      expect(result?.percent).toBe(0);
      expect(Object.is(result?.percent, -0)).toBe(false); // not negative zero
    });
  });

  describe("enterprise branch (seat pricing applied)", () => {
    it("scales base + per-seat cost by the seat count", () => {
      // seats = 5
      // monthlyAnnual = (100 + 10*5) * 12 = 150 * 12 = 1800
      // yearlyTotal   = 1000 + 80*5            = 1000 + 400 = 1400
      // savings = 400; percent = round(400/1800*100) = round(22.22) = 22
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10, currency: "usd" }),
        yearly: makePlan({ price: 1000, seatPrice: 80, currency: "gbp" }),
      });

      const result = calculateSavings(group, 5);

      expect(result).toEqual({
        amount: 400,
        percent: 22,
        currency: "gbp",
      });
    });

    it("defaults to 1 seat when minimumSeats is 0 (falsy)", () => {
      // minimumSeats || 1 => 1 seat.
      // monthlyAnnual = (100 + 10*1) * 12 = 110 * 12 = 1320
      // yearlyTotal   = 1000 + 80*1            = 1080
      // savings = 240
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10 }),
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });

      const zeroSeats = calculateSavings(group, 0);
      const oneSeat = calculateSavings(group, 1);

      expect(zeroSeats?.amount).toBe(240);
      expect(zeroSeats).toEqual(oneSeat);
    });

    it("seat count materially changes the result (10 seats vs 1 seat)", () => {
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10 }),
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });

      // 10 seats:
      // monthlyAnnual = (100 + 10*10) * 12 = 200 * 12 = 2400
      // yearlyTotal   = 1000 + 80*10            = 1800
      // savings = 600
      const tenSeats = calculateSavings(group, 10);
      const oneSeat = calculateSavings(group, 1);

      expect(tenSeats?.amount).toBe(600);
      expect(oneSeat?.amount).toBe(240);
      expect(tenSeats?.amount).not.toBe(oneSeat?.amount);
    });

    it("falls back to the server branch when monthly seatPrice is missing", () => {
      // Enterprise tier but monthly.seatPrice is undefined -> server formula.
      // monthlyAnnual = 100 * 12 = 1200; yearlyTotal = 1000 => savings 200.
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100 }), // no seatPrice
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });

      const result = calculateSavings(group, 5);

      expect(result?.amount).toBe(200); // seats NOT applied
      expect(result?.percent).toBe(17); // round(200/1200*100) = round(16.66)
    });

    it("falls back to the server branch when yearly seatPrice is missing", () => {
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10 }),
        yearly: makePlan({ price: 1000 }), // no seatPrice
      });

      const result = calculateSavings(group, 5);

      expect(result?.amount).toBe(200); // 100*12 - 1000, seats ignored
      expect(result?.percent).toBe(17);
    });

    it("falls back to the server branch when a seatPrice is 0 (falsy)", () => {
      // 0 is a valid number but falsy, so the enterprise `&&` guard fails and
      // the server branch is taken; the per-seat cost is therefore not added.
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 0 }),
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });

      const result = calculateSavings(group, 5);

      expect(result?.amount).toBe(200); // server formula
    });
  });

  describe("currency sourcing", () => {
    it("always reports the yearly plan's currency, regardless of branch", () => {
      const server = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10, currency: "usd" }),
        yearly: makePlan({ price: 100, currency: "jpy" }),
      });
      const enterprise = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10, currency: "usd" }),
        yearly: makePlan({ price: 1000, seatPrice: 80, currency: "cad" }),
      });

      expect(calculateSavings(server, 1)?.currency).toBe("jpy");
      expect(calculateSavings(enterprise, 3)?.currency).toBe("cad");
    });
  });

  describe("rounding behavior", () => {
    it("rounds the savings percent to the nearest whole number", () => {
      // monthlyAnnual = 10 * 12 = 120; yearlyTotal = 119 => savings 1.
      // round(1/120*100) = round(0.833) = 1
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 10 }),
        yearly: makePlan({ price: 119 }),
      });

      const result = calculateSavings(group, 1);

      expect(result?.amount).toBe(1);
      expect(result?.percent).toBe(1);
      expect(Number.isInteger(result?.percent)).toBe(true);
    });

    it("rounds .5 percent halves up (banker-free Math.round)", () => {
      // Choose values yielding exactly x.5 percent: savings/monthlyAnnual = 0.125
      // monthlyAnnual = 800 * 12 = 9600; yearly = 8400 => savings 1200.
      // 1200/9600*100 = 12.5 -> Math.round = 13
      const group = makeGroup({
        tier: "server",
        monthly: makePlan({ price: 800 }),
        yearly: makePlan({ price: 8400 }),
      });

      const result = calculateSavings(group, 1);

      expect(result?.amount).toBe(1200);
      expect(result?.percent).toBe(13);
    });
  });

  describe("purity", () => {
    it("does not mutate the input plan group", () => {
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10 }),
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });
      const snapshot = structuredClone(group);

      calculateSavings(group, 7);

      expect(group).toEqual(snapshot);
    });

    it("is referentially deterministic for identical inputs", () => {
      const group = makeGroup({
        tier: "enterprise",
        monthly: makePlan({ price: 100, seatPrice: 10 }),
        yearly: makePlan({ price: 1000, seatPrice: 80 }),
      });

      expect(calculateSavings(group, 4)).toEqual(calculateSavings(group, 4));
    });
  });
});
