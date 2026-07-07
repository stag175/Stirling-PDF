/**
 * Unit tests for signature validation utility converters/formatters.
 *
 * These are pure functions with no external dependencies, so the tests are
 * fully deterministic and require no mocking.
 */

import { describe, test, expect } from "vitest";
import {
  RESULT_JSON_FILENAME,
  CSV_FILENAME,
  REPORT_PDF_FILENAME,
  coerceString,
  coerceNumber,
  escapeCsvValue,
  booleanToString,
  keyUsagesToString,
  normalizeBackendResult,
} from "@app/hooks/tools/validateSignature/utils/signatureUtils";
import type { SignatureValidationBackendResult } from "@app/types/validateSignature";
import type { StirlingFile } from "@app/types/fileContext";

// The normalizer only reads `stirlingFile.fileId`, so a minimal stub cast to
// StirlingFile keeps the test deterministic and free of File/Blob internals.
const makeStirlingFile = (fileId: string): StirlingFile =>
  ({ fileId }) as unknown as StirlingFile;

describe("signatureUtils", () => {
  describe("exported filename constants", () => {
    test("expose the expected output filenames", () => {
      expect(RESULT_JSON_FILENAME).toBe("signature-validation.json");
      expect(CSV_FILENAME).toBe("signature-validation.csv");
      expect(REPORT_PDF_FILENAME).toBe("signature-validation-report.pdf");
    });
  });

  describe("coerceString", () => {
    test("returns empty string for null", () => {
      expect(coerceString(null)).toBe("");
    });

    test("returns empty string for undefined", () => {
      expect(coerceString(undefined)).toBe("");
    });

    test("passes through a string unchanged", () => {
      expect(coerceString("hello")).toBe("hello");
    });

    test("preserves an empty string", () => {
      expect(coerceString("")).toBe("");
    });

    test("stringifies a number", () => {
      expect(coerceString(42)).toBe("42");
    });

    test("stringifies zero", () => {
      expect(coerceString(0)).toBe("0");
    });
  });

  describe("coerceNumber", () => {
    test("returns a finite number as-is", () => {
      expect(coerceNumber(2048)).toBe(2048);
    });

    test("returns zero (finite) unchanged", () => {
      expect(coerceNumber(0)).toBe(0);
    });

    test("returns negative finite numbers unchanged", () => {
      expect(coerceNumber(-7)).toBe(-7);
    });

    test("returns null for non-finite numbers (NaN)", () => {
      expect(coerceNumber(Number.NaN)).toBe(null);
    });

    test("returns null for Infinity", () => {
      expect(coerceNumber(Number.POSITIVE_INFINITY)).toBe(null);
    });

    test("parses a numeric string", () => {
      expect(coerceNumber("4096")).toBe(4096);
    });

    test("parses leading digits of a mixed string", () => {
      expect(coerceNumber("256bit")).toBe(256);
    });

    test("returns null for a non-numeric string", () => {
      expect(coerceNumber("abc")).toBe(null);
    });

    test("returns null for an empty string", () => {
      expect(coerceNumber("")).toBe(null);
    });

    test("returns null for null", () => {
      expect(coerceNumber(null)).toBe(null);
    });

    test("returns null for undefined", () => {
      expect(coerceNumber(undefined)).toBe(null);
    });
  });

  describe("escapeCsvValue", () => {
    test("returns a plain value unchanged", () => {
      expect(escapeCsvValue("plain")).toBe("plain");
    });

    test("returns empty string for an empty input", () => {
      expect(escapeCsvValue("")).toBe("");
    });

    test("collapses a LF newline to a space", () => {
      expect(escapeCsvValue("line1\nline2")).toBe("line1 line2");
    });

    test("collapses a CRLF newline to a single space", () => {
      expect(escapeCsvValue("line1\r\nline2")).toBe("line1 line2");
    });

    test("collapses a lone CR to a space", () => {
      expect(escapeCsvValue("line1\rline2")).toBe("line1 line2");
    });

    test("doubles embedded quotes and wraps in quotes", () => {
      expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    });

    test("wraps a value containing a comma in quotes", () => {
      expect(escapeCsvValue("a,b")).toBe('"a,b"');
    });

    test("wraps a value containing a semicolon in quotes", () => {
      expect(escapeCsvValue("a;b")).toBe('"a;b"');
    });

    test("escapes and wraps a value with both quotes and a comma", () => {
      expect(escapeCsvValue('a,"b"')).toBe('"a,""b"""');
    });
  });

  describe("booleanToString", () => {
    test("returns 'true' for true", () => {
      expect(booleanToString(true)).toBe("true");
    });

    test("returns 'false' for false", () => {
      expect(booleanToString(false)).toBe("false");
    });

    test("returns empty string for null", () => {
      expect(booleanToString(null)).toBe("");
    });

    test("returns empty string for undefined", () => {
      expect(booleanToString(undefined)).toBe("");
    });
  });

  describe("keyUsagesToString", () => {
    test("joins multiple usages with a semicolon separator", () => {
      expect(keyUsagesToString(["digitalSignature", "keyEncipherment"])).toBe(
        "digitalSignature; keyEncipherment",
      );
    });

    test("returns a single usage unchanged", () => {
      expect(keyUsagesToString(["digitalSignature"])).toBe("digitalSignature");
    });

    test("returns empty string for an empty array", () => {
      expect(keyUsagesToString([])).toBe("");
    });

    test("returns empty string for undefined", () => {
      expect(keyUsagesToString(undefined)).toBe("");
    });
  });

  describe("normalizeBackendResult", () => {
    test("normalizes a fully-populated backend result", () => {
      const item: SignatureValidationBackendResult = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        revocationChecked: true,
        revocationStatus: "good",
        validationTimeSource: "timestamp",
        signerName: "Alice",
        signatureDate: "2026-01-01",
        reason: "Approval",
        location: "London",
        issuerDN: "CN=Issuer",
        subjectDN: "CN=Alice",
        serialNumber: "12345",
        validFrom: "2025-01-01",
        validUntil: "2027-01-01",
        signatureAlgorithm: "SHA256withRSA",
        keySize: 2048,
        version: "1",
        keyUsages: ["digitalSignature", "nonRepudiation"],
        selfSigned: false,
        errorMessage: null,
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-a"),
        0,
      );

      expect(result).toEqual({
        id: "file-a-0",
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        revocationChecked: true,
        revocationStatus: "good",
        validationTimeSource: "timestamp",
        signerName: "Alice",
        signatureDate: "2026-01-01",
        reason: "Approval",
        location: "London",
        issuerDN: "CN=Issuer",
        subjectDN: "CN=Alice",
        serialNumber: "12345",
        validFrom: "2025-01-01",
        validUntil: "2027-01-01",
        signatureAlgorithm: "SHA256withRSA",
        keySize: 2048,
        version: "1",
        keyUsages: ["digitalSignature", "nonRepudiation"],
        selfSigned: false,
        errorMessage: null,
      });
    });

    test("coerces falsy/missing optional fields to defaults", () => {
      const item: SignatureValidationBackendResult = {
        valid: false,
        chainValid: false,
        trustValid: false,
        notExpired: false,
        // revocationChecked omitted -> null branch
        // revocationStatus / validationTimeSource omitted -> null branch
        // all string fields omitted -> coerceString returns ""
        keySize: "1024",
        // version omitted -> ""
        // keyUsages omitted -> [] (non-array branch)
        selfSigned: false,
        // errorMessage omitted -> null
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-b"),
        3,
      );

      expect(result.id).toBe("file-b-3");
      expect(result.valid).toBe(false);
      expect(result.chainValid).toBe(false);
      expect(result.trustValid).toBe(false);
      expect(result.notExpired).toBe(false);
      expect(result.revocationChecked).toBe(null);
      expect(result.revocationStatus).toBe(null);
      expect(result.validationTimeSource).toBe(null);
      expect(result.signerName).toBe("");
      expect(result.signatureDate).toBe("");
      expect(result.reason).toBe("");
      expect(result.location).toBe("");
      expect(result.issuerDN).toBe("");
      expect(result.subjectDN).toBe("");
      expect(result.serialNumber).toBe("");
      expect(result.validFrom).toBe("");
      expect(result.validUntil).toBe("");
      expect(result.signatureAlgorithm).toBe("");
      expect(result.keySize).toBe(1024);
      expect(result.version).toBe("");
      expect(result.keyUsages).toEqual([]);
      expect(result.selfSigned).toBe(false);
      expect(result.errorMessage).toBe(null);
    });

    test("treats explicit null revocationChecked as null", () => {
      const item: SignatureValidationBackendResult = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        revocationChecked: null,
        selfSigned: true,
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-c"),
        1,
      );

      expect(result.revocationChecked).toBe(null);
      expect(result.selfSigned).toBe(true);
    });

    test("coerces a false revocationChecked to a boolean false (not null)", () => {
      const item: SignatureValidationBackendResult = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        revocationChecked: false,
        selfSigned: false,
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-d"),
        2,
      );

      expect(result.revocationChecked).toBe(false);
    });

    test("filters falsy entries out of keyUsages and coerces survivors", () => {
      const item = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        keyUsages: ["digitalSignature", "", null, "keyCertSign", undefined],
        selfSigned: false,
      } as unknown as SignatureValidationBackendResult;

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-e"),
        0,
      );

      expect(result.keyUsages).toEqual(["digitalSignature", "keyCertSign"]);
    });

    test("returns null keySize when keySize is a non-numeric string", () => {
      const item: SignatureValidationBackendResult = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        keySize: "unknown",
        selfSigned: false,
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-f"),
        0,
      );

      expect(result.keySize).toBe(null);
    });

    test("preserves a non-empty errorMessage", () => {
      const item: SignatureValidationBackendResult = {
        valid: false,
        chainValid: false,
        trustValid: false,
        notExpired: false,
        errorMessage: "certificate expired",
        selfSigned: false,
      };

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-g"),
        5,
      );

      expect(result.errorMessage).toBe("certificate expired");
      expect(result.id).toBe("file-g-5");
    });

    test("coerces a numeric version to a string", () => {
      const item = {
        valid: true,
        chainValid: true,
        trustValid: true,
        notExpired: true,
        version: 3,
        selfSigned: false,
      } as unknown as SignatureValidationBackendResult;

      const result = normalizeBackendResult(
        item,
        makeStirlingFile("file-h"),
        0,
      );

      expect(result.version).toBe("3");
    });
  });
});
