import { describe, expect, it, vi } from "vitest";

// Mock the PDFium-backed doc builder so the transitive `rgb` import used by
// `pdfPalette` resolves to a trivial, deterministic stub instead of loading the
// PDFium WASM service graph. `rgb` is a pure factory in production code, so the
// stub mirrors its shape exactly.
vi.mock("@app/services/pdfiumDocBuilder", () => ({
  rgb: (r: number, g: number, b: number) => ({ _r: r, _g: g, _b: b }),
}));

import {
  computeSignatureStatus,
  statusKindToPdfColor,
  type SignatureStatusKind,
} from "@app/hooks/tools/validateSignature/utils/signatureStatus";
import { colorPalette } from "@app/hooks/tools/validateSignature/utils/pdfPalette";
import type { SignatureValidationSignature } from "@app/types/validateSignature";

// A deterministic stub for i18next's `t`: returns the provided default string
// so assertions do not depend on translation resources. Cast through unknown to
// satisfy the rich TFunction type without pulling in i18n machinery.
const t = ((_key: string, fallback?: string) =>
  fallback ?? _key) as unknown as Parameters<typeof computeSignatureStatus>[1];

// Build a fully-valid signature; individual tests override only the fields
// relevant to the branch under test.
const makeSignature = (
  overrides: Partial<SignatureValidationSignature> = {},
): SignatureValidationSignature => ({
  id: "sig-1",
  valid: true,
  chainValid: true,
  trustValid: true,
  notExpired: true,
  signerName: "Jane Doe",
  signatureDate: "2026-01-01",
  reason: "Approval",
  location: "Earth",
  issuerDN: "CN=Issuer",
  subjectDN: "CN=Subject",
  serialNumber: "01",
  validFrom: "2025-01-01",
  validUntil: "2027-01-01",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "1",
  keyUsages: ["digitalSignature"],
  selfSigned: false,
  errorMessage: null,
  ...overrides,
});

describe("computeSignatureStatus", () => {
  it("returns invalid with the error message when errorMessage is present (short-circuit)", () => {
    const status = computeSignatureStatus(
      makeSignature({ errorMessage: "Boom: parse failure" }),
      t,
    );

    expect(status.kind).toBe("invalid");
    expect(status.label).toBe("Invalid");
    expect(status.details).toEqual(["Boom: parse failure"]);
  });

  it("short-circuits on errorMessage even when other validity flags would also fail", () => {
    const status = computeSignatureStatus(
      makeSignature({
        errorMessage: "fatal",
        valid: false,
        chainValid: false,
        trustValid: false,
        notExpired: false,
        revocationStatus: "revoked",
      }),
      t,
    );

    // Only the error message branch runs; no aggregated trust issues.
    expect(status.kind).toBe("invalid");
    expect(status.details).toEqual(["fatal"]);
  });

  it("returns valid with no details for a fully-valid signature", () => {
    const status = computeSignatureStatus(makeSignature(), t);

    expect(status.kind).toBe("valid");
    expect(status.label).toBe("Valid");
    expect(status.details).toEqual([]);
  });

  it("marks invalid when cryptographic check fails and surfaces the crypto issue first", () => {
    const status = computeSignatureStatus(makeSignature({ valid: false }), t);

    expect(status.kind).toBe("invalid");
    expect(status.label).toBe("Invalid");
    // The crypto-failure message is pushed before trust issues are appended.
    expect(status.details).toEqual(["Signature cryptographic check failed"]);
  });

  it("stays valid but reports a chain issue when chainValid is false", () => {
    const status = computeSignatureStatus(
      makeSignature({ chainValid: false }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate chain invalid"]);
  });

  it("stays valid but reports a trust issue when trustValid is false", () => {
    const status = computeSignatureStatus(
      makeSignature({ trustValid: false }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate not trusted"]);
  });

  it("stays valid but reports expiry when notExpired is false", () => {
    const status = computeSignatureStatus(
      makeSignature({ notExpired: false }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate expired"]);
  });

  it("reports a revoked certificate when revocationStatus is 'revoked'", () => {
    const status = computeSignatureStatus(
      makeSignature({ revocationStatus: "revoked" }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate revoked"]);
  });

  it("reports unknown revocation when revocationStatus is 'soft-fail'", () => {
    const status = computeSignatureStatus(
      makeSignature({ revocationStatus: "soft-fail" }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate revocation status unknown"]);
  });

  it("adds no revocation issue for 'good' status", () => {
    const status = computeSignatureStatus(
      makeSignature({ revocationStatus: "good" }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual([]);
  });

  it("defaults revocationStatus to 'unknown' (no revocation issue) when null", () => {
    const status = computeSignatureStatus(
      makeSignature({ revocationStatus: null }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual([]);
  });

  it("defaults revocationStatus to 'unknown' (no revocation issue) when undefined", () => {
    const status = computeSignatureStatus(
      makeSignature({ revocationStatus: undefined }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual([]);
  });

  it("aggregates every trust issue in declaration order when valid stays true", () => {
    const status = computeSignatureStatus(
      makeSignature({
        chainValid: false,
        trustValid: false,
        notExpired: false,
        revocationStatus: "revoked",
      }),
      t,
    );

    expect(status.kind).toBe("valid");
    expect(status.details).toEqual([
      "Certificate chain invalid",
      "Certificate not trusted",
      "Certificate expired",
      "Certificate revoked",
    ]);
  });

  it("orders crypto issue ahead of all aggregated trust issues when marked invalid", () => {
    const status = computeSignatureStatus(
      makeSignature({
        valid: false,
        chainValid: false,
        trustValid: false,
        notExpired: false,
        revocationStatus: "soft-fail",
      }),
      t,
    );

    expect(status.kind).toBe("invalid");
    expect(status.label).toBe("Invalid");
    expect(status.details).toEqual([
      "Signature cryptographic check failed",
      "Certificate chain invalid",
      "Certificate not trusted",
      "Certificate expired",
      "Certificate revocation status unknown",
    ]);
  });

  it("treats an empty-string errorMessage as falsy and continues normal evaluation", () => {
    const status = computeSignatureStatus(
      makeSignature({ errorMessage: "", chainValid: false }),
      t,
    );

    // Empty string is falsy => the errorMessage short-circuit is skipped.
    expect(status.kind).toBe("valid");
    expect(status.details).toEqual(["Certificate chain invalid"]);
  });

  it("forwards the real translation key/fallback pairs to t()", () => {
    const tSpy = vi.fn(
      (key: string, fallback?: string) => `${key}|${fallback}`,
    ) as unknown as Parameters<typeof computeSignatureStatus>[1];

    const status = computeSignatureStatus(
      makeSignature({ valid: false }),
      tSpy,
    );

    expect(status.label).toBe("validateSignature.status.invalid|Invalid");
    expect(status.details).toEqual([
      "validateSignature.issue.signatureInvalid|Signature cryptographic check failed",
    ]);
    expect(tSpy).toHaveBeenCalledWith(
      "validateSignature.issue.signatureInvalid",
      "Signature cryptographic check failed",
    );
  });
});

describe("statusKindToPdfColor", () => {
  it("maps 'valid' to the success palette color", () => {
    expect(statusKindToPdfColor("valid")).toBe(colorPalette.success);
  });

  it("maps 'warning' to the warning palette color", () => {
    expect(statusKindToPdfColor("warning")).toBe(colorPalette.warning);
  });

  it("maps 'invalid' to the danger palette color", () => {
    expect(statusKindToPdfColor("invalid")).toBe(colorPalette.danger);
  });

  it("maps 'neutral' to the neutral palette color", () => {
    expect(statusKindToPdfColor("neutral")).toBe(colorPalette.neutral);
  });

  it("falls back to the neutral palette color for any unrecognized kind", () => {
    expect(statusKindToPdfColor("totally-unknown" as SignatureStatusKind)).toBe(
      colorPalette.neutral,
    );
  });
});
