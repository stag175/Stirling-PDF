import { describe, it, expect } from "vitest";
import { formatUTC } from "@app/components/shared/utils/date";

/**
 * formatUTC() is a pure function that formats an ISO date string using a fixed
 * `Intl.DateTimeFormat("en-US", { ..., timeZone: "UTC" })` configuration. It has
 * no external dependencies, so the only determinism concern is locale/timezone
 * data — both are pinned inside the function (en-US + UTC), so results do not
 * depend on the machine's local timezone. We assert exact strings for typical,
 * edge, and the invalid-date fallback branches.
 */
describe("formatUTC", () => {
  describe("date-only (withTime = false)", () => {
    it("formats a UTC instant as 'Mon D, YYYY'", () => {
      expect(formatUTC("2024-01-15T00:00:00Z", false)).toBe("Jan 15, 2024");
    });

    it("does not append a ' UTC' suffix", () => {
      const result = formatUTC("2024-06-30T12:00:00Z", false);
      expect(result).toBe("Jun 30, 2024");
      expect(result).not.toContain("UTC");
    });

    it("renders the day without zero-padding (numeric day)", () => {
      // day is "numeric", so single-digit days have no leading zero.
      expect(formatUTC("2024-03-05T10:00:00Z", false)).toBe("Mar 5, 2024");
    });

    it("uses the abbreviated (short) month name", () => {
      expect(formatUTC("2024-09-01T00:00:00Z", false)).toBe("Sep 1, 2024");
      expect(formatUTC("2024-12-25T00:00:00Z", false)).toBe("Dec 25, 2024");
    });
  });

  describe("date + time (withTime = true)", () => {
    it("appends ' UTC' and renders 24-hour HH:MM", () => {
      expect(formatUTC("2024-01-15T13:45:00Z", true)).toBe(
        "Jan 15, 2024, 13:45 UTC",
      );
    });

    it("formats midnight as 00:00 (hour12 = false)", () => {
      expect(formatUTC("2024-01-15T00:00:00Z", true)).toBe(
        "Jan 15, 2024, 00:00 UTC",
      );
    });

    it("zero-pads single-digit hours and minutes (2-digit)", () => {
      expect(formatUTC("2024-07-04T09:05:00Z", true)).toBe(
        "Jul 4, 2024, 09:05 UTC",
      );
    });

    it("renders late-evening times in 24-hour form", () => {
      expect(formatUTC("2024-11-30T23:59:00Z", true)).toBe(
        "Nov 30, 2024, 23:59 UTC",
      );
    });
  });

  describe("timezone independence", () => {
    it("normalizes an offset-bearing input to UTC for date-only output", () => {
      // 2024-01-15T23:30:00-05:00 === 2024-01-16T04:30:00Z
      expect(formatUTC("2024-01-15T23:30:00-05:00", false)).toBe(
        "Jan 16, 2024",
      );
    });

    it("normalizes an offset-bearing input to UTC for date+time output", () => {
      // 2024-01-15T23:30:00-05:00 === 2024-01-16T04:30:00Z
      expect(formatUTC("2024-01-15T23:30:00-05:00", true)).toBe(
        "Jan 16, 2024, 04:30 UTC",
      );
    });

    it("treats an explicit +00:00 offset identically to a 'Z' suffix", () => {
      expect(formatUTC("2024-01-15T13:45:00+00:00", true)).toBe(
        formatUTC("2024-01-15T13:45:00Z", true),
      );
    });
  });

  describe("invalid-date fallback", () => {
    it("returns '-' for a non-date string (withTime = false)", () => {
      expect(formatUTC("not-a-date", false)).toBe("-");
    });

    it("returns '-' for a non-date string (withTime = true)", () => {
      // The fallback short-circuits before the ' UTC' suffix is applied.
      expect(formatUTC("not-a-date", true)).toBe("-");
    });

    it("returns '-' for an empty string", () => {
      expect(formatUTC("", false)).toBe("-");
    });

    it("returns '-' for a calendar-invalid date", () => {
      // Month 13 / day 45 produce an Invalid Date.
      expect(formatUTC("2024-13-45T00:00:00Z", false)).toBe("-");
    });

    it("never appends ' UTC' to the invalid-date fallback", () => {
      const result = formatUTC("garbage", true);
      expect(result).toBe("-");
      expect(result).not.toContain("UTC");
    });
  });

  describe("determinism", () => {
    it("returns identical output for repeated calls with the same input", () => {
      const iso = "2024-02-29T08:15:00Z"; // leap day
      const a = formatUTC(iso, true);
      const b = formatUTC(iso, true);
      expect(a).toBe(b);
      expect(a).toBe("Feb 29, 2024, 08:15 UTC");
    });
  });
});
