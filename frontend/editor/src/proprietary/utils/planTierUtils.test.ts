import { describe, it, expect } from "vitest";
import {
  getTierLevel,
  isCurrentTier,
  isDowngrade,
  isEnterpriseBlockedForFree,
  type PlanTier,
} from "@app/utils/planTierUtils";

describe("planTierUtils", () => {
  describe("getTierLevel", () => {
    it("maps each known tier to its hierarchy level", () => {
      expect(getTierLevel("free")).toBe(1);
      expect(getTierLevel("server")).toBe(2);
      expect(getTierLevel("enterprise")).toBe(3);
    });

    it("returns 1 for null", () => {
      expect(getTierLevel(null)).toBe(1);
    });

    it("returns 1 for undefined", () => {
      expect(getTierLevel(undefined)).toBe(1);
    });

    it("returns 1 for an empty string (falsy)", () => {
      expect(getTierLevel("")).toBe(1);
    });

    it("returns 1 for an unknown non-empty tier string", () => {
      expect(getTierLevel("premium")).toBe(1);
      expect(getTierLevel("Free")).toBe(1); // case-sensitive lookup misses
      expect(getTierLevel("unknown-tier")).toBe(1);
    });
  });

  describe("isCurrentTier", () => {
    it("returns true when both tiers map to the same level", () => {
      expect(isCurrentTier("free", "free")).toBe(true);
      expect(isCurrentTier("server", "server")).toBe(true);
      expect(isCurrentTier("enterprise", "enterprise")).toBe(true);
    });

    it("returns false when tiers differ", () => {
      expect(isCurrentTier("free", "server")).toBe(false);
      expect(isCurrentTier("enterprise", "server")).toBe(false);
    });

    it("treats null/undefined current tier as free (level 1)", () => {
      expect(isCurrentTier(null, "free")).toBe(true);
      expect(isCurrentTier(undefined, "free")).toBe(true);
      expect(isCurrentTier(null, "server")).toBe(false);
    });

    it("treats unknown tier strings as level 1, matching free", () => {
      expect(isCurrentTier("mystery", "free")).toBe(true);
      expect(isCurrentTier("mystery", "another-unknown")).toBe(true);
      expect(isCurrentTier("mystery", "enterprise")).toBe(false);
    });
  });

  describe("isDowngrade", () => {
    it("returns true when current tier outranks the target", () => {
      expect(isDowngrade("enterprise", "server")).toBe(true);
      expect(isDowngrade("enterprise", "free")).toBe(true);
      expect(isDowngrade("server", "free")).toBe(true);
    });

    it("returns false for equal tiers", () => {
      expect(isDowngrade("server", "server")).toBe(false);
      expect(isDowngrade("free", "free")).toBe(false);
    });

    it("returns false for upgrades", () => {
      expect(isDowngrade("free", "server")).toBe(false);
      expect(isDowngrade("server", "enterprise")).toBe(false);
      expect(isDowngrade("free", "enterprise")).toBe(false);
    });

    it("treats null/undefined current tier as free, so it is never a downgrade", () => {
      expect(isDowngrade(null, "free")).toBe(false);
      expect(isDowngrade(null, "server")).toBe(false);
      expect(isDowngrade(undefined, "enterprise")).toBe(false);
    });

    it("treats unknown target tiers as level 1 when comparing", () => {
      expect(isDowngrade("server", "mystery")).toBe(true);
      expect(isDowngrade("free", "mystery")).toBe(false);
    });
  });

  describe("isEnterpriseBlockedForFree", () => {
    it("returns true only for free current tier targeting enterprise", () => {
      expect(isEnterpriseBlockedForFree("free", "enterprise")).toBe(true);
    });

    it("returns false when current tier is not exactly the string 'free'", () => {
      expect(isEnterpriseBlockedForFree("server", "enterprise")).toBe(false);
      expect(isEnterpriseBlockedForFree("enterprise", "enterprise")).toBe(
        false,
      );
      expect(isEnterpriseBlockedForFree(null, "enterprise")).toBe(false);
      expect(isEnterpriseBlockedForFree(undefined, "enterprise")).toBe(false);
    });

    it("returns false when target is not exactly the string 'enterprise'", () => {
      expect(isEnterpriseBlockedForFree("free", "server")).toBe(false);
      expect(isEnterpriseBlockedForFree("free", "free")).toBe(false);
    });

    it("uses strict string equality, not tier-level comparison", () => {
      // An unknown tier resolves to level 1 like free, but the guard is
      // string-based, so it must NOT be treated as blocked.
      expect(
        isEnterpriseBlockedForFree("unknown-but-level-1", "enterprise"),
      ).toBe(false);
    });
  });

  describe("PlanTier type usage", () => {
    it("accepts the canonical tier values", () => {
      const tiers: PlanTier[] = ["free", "server", "enterprise"];
      expect(tiers.map(getTierLevel)).toEqual([1, 2, 3]);
    });
  });
});
