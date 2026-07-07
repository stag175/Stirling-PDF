import { describe, it, expect } from "vitest";
import { isValidFileId } from "@app/utils/fileIdSafety";

describe("isValidFileId", () => {
  describe("valid UUID-format strings", () => {
    it("1) accepts a canonical lowercase UUID", () => {
      expect(isValidFileId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    });

    it("2) accepts an uppercase UUID (case-insensitive)", () => {
      expect(isValidFileId("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
    });

    it("3) accepts a mixed-case UUID", () => {
      expect(isValidFileId("123e4567-E89b-12D3-a456-426614174abc")).toBe(true);
    });

    it("4) accepts the nil UUID (all zeros)", () => {
      expect(isValidFileId("00000000-0000-0000-0000-000000000000")).toBe(true);
    });

    it("5) accepts all-f hex digits", () => {
      expect(isValidFileId("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(true);
    });

    it("6) accepts non-v4 version/variant nibbles (format-only check)", () => {
      // The regex enforces 8-4-4-4-12 hex layout only, not RFC 4122 v4
      // version (3rd group must start with 4) or variant bits.
      expect(isValidFileId("123e4567-e89b-72d3-c456-426614174000")).toBe(true);
    });
  });

  describe("malformed strings", () => {
    it("7) rejects an empty string", () => {
      expect(isValidFileId("")).toBe(false);
    });

    it("8) rejects a UUID missing all hyphens", () => {
      expect(isValidFileId("123e4567e89b12d3a456426614174000")).toBe(false);
    });

    it("9) rejects a UUID with non-hex characters", () => {
      expect(isValidFileId("123e4567-e89b-12d3-a456-42661417400g")).toBe(false);
    });

    it("10) rejects a group that is too short", () => {
      expect(isValidFileId("123e456-e89b-12d3-a456-426614174000")).toBe(false);
    });

    it("11) rejects a group that is too long", () => {
      expect(isValidFileId("123e45678-e89b-12d3-a456-426614174000")).toBe(
        false,
      );
    });

    it("12) rejects leading whitespace (anchored ^)", () => {
      expect(isValidFileId(" 123e4567-e89b-12d3-a456-426614174000")).toBe(
        false,
      );
    });

    it("13) rejects trailing whitespace (anchored $)", () => {
      expect(isValidFileId("123e4567-e89b-12d3-a456-426614174000 ")).toBe(
        false,
      );
    });

    it("14) rejects a trailing newline (anchors are not multiline)", () => {
      expect(isValidFileId("123e4567-e89b-12d3-a456-426614174000\n")).toBe(
        false,
      );
    });

    it("15) rejects a valid UUID with extra trailing text", () => {
      expect(isValidFileId("123e4567-e89b-12d3-a456-426614174000-extra")).toBe(
        false,
      );
    });

    it("16) rejects an arbitrary non-UUID string", () => {
      expect(isValidFileId("not-a-uuid")).toBe(false);
    });

    it("17) rejects hyphens placed at the wrong offsets", () => {
      expect(isValidFileId("123e456-7e89b-12d3-a456-426614174000")).toBe(false);
    });

    it("18) rejects when hyphens are replaced by other separators", () => {
      expect(isValidFileId("123e4567_e89b_12d3_a456_426614174000")).toBe(false);
    });
  });

  describe("type guard narrowing", () => {
    it("19) narrows a string to FileId in the truthy branch", () => {
      const candidate: string = "123e4567-e89b-12d3-a456-426614174000";
      if (isValidFileId(candidate)) {
        // Inside this branch `candidate` is narrowed to FileId. Assigning it
        // to a branded-typed binding compiles only if narrowing holds.
        const narrowed = candidate;
        expect(narrowed).toBe(candidate);
      } else {
        // Should never reach here for a well-formed UUID.
        expect.unreachable("valid UUID should be recognised as a FileId");
      }
    });
  });
});
