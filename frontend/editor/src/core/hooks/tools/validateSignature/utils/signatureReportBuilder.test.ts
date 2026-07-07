/**
 * Unit tests for `buildReportEntries`, the pure mapper that enriches raw
 * signature-validation file results into report rows.
 *
 * The function is dependency-light: it reads file metadata through the
 * `FileContextSelectors` (`getFile` / `getStirlingFileStub`), optionally derives
 * a status label through `deriveEntryStatus`, and stamps a `summaryGeneratedAt`.
 * Everything is deterministic except `Date#toLocaleString`, which is
 * locale/timezone dependent — so the `createdAtLabel` assertions compare against
 * `new Date(ts).toLocaleString()` computed the same way rather than a hardcoded
 * string.
 *
 * `deriveEntryStatus` transitively imports `pdfPalette`, which imports `rgb`
 * from the PDFium-backed doc builder. We mock that module (mirroring the sibling
 * `signatureStatus.test.ts`) so the PDFium WASM service graph never loads.
 */

import { describe, test, expect, vi } from "vitest";

// Stub the PDFium doc builder so the transitive `rgb` import in `pdfPalette`
// resolves to a trivial, deterministic factory instead of the WASM service.
vi.mock("@app/services/pdfiumDocBuilder", () => ({
  rgb: (r: number, g: number, b: number) => ({ _r: r, _g: g, _b: b }),
}));

import { buildReportEntries } from "@app/hooks/tools/validateSignature/utils/signatureReportBuilder";
import type {
  SignatureValidationFileResult,
  SignatureValidationSignature,
} from "@app/types/validateSignature";
import type { FileContextSelectors } from "@app/types/fileContext";
import type { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

// Deterministic i18next `t`: echoes the provided fallback so assertions never
// depend on translation resources. Cast through unknown to satisfy TFunction.
type BuildT = NonNullable<Parameters<typeof buildReportEntries>[0]["t"]>;
const t = ((_key: string, fallback?: string) =>
  fallback ?? _key) as unknown as BuildT;

// A fully-valid signature; tests override only the fields they exercise.
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

const makeResult = (
  overrides: Partial<SignatureValidationFileResult> = {},
): SignatureValidationFileResult => ({
  fileId: "file-1",
  fileName: "doc.pdf",
  signatures: [],
  error: null,
  ...overrides,
});

// A minimal stub; only the metadata fields `buildReportEntries` reads matter.
const makeStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub =>
  ({
    id: "file-1" as FileId,
    name: "doc.pdf",
    size: 1234,
    type: "application/pdf",
    lastModified: 1000,
    ...overrides,
  }) as StirlingFileStub;

// A minimal File-like object; the mapper only reads `size` and `lastModified`.
const makeFile = (size: number, lastModified: number): StirlingFile =>
  ({ size, lastModified }) as unknown as StirlingFile;

// Build a selectors object backed by simple per-id maps so tests can register
// (or omit) the file/stub for a given id and exercise the fallback chains.
const makeSelectors = (
  fileById: Record<string, StirlingFile> = {},
  stubById: Record<string, StirlingFileStub> = {},
): FileContextSelectors =>
  ({
    getFile: (id: FileId) => fileById[id as string],
    getStirlingFileStub: (id: FileId) => stubById[id as string],
  }) as unknown as FileContextSelectors;

describe("buildReportEntries", () => {
  describe("shape and pass-through", () => {
    test("returns one entry per result, preserving order and base fields", () => {
      const results = [
        makeResult({ fileId: "a", fileName: "a.pdf" }),
        makeResult({ fileId: "b", fileName: "b.pdf" }),
        makeResult({ fileId: "c", fileName: "c.pdf" }),
      ];
      const entries = buildReportEntries({
        results,
        selectors: makeSelectors(),
        generatedAt: 42,
      });

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.fileName)).toEqual([
        "a.pdf",
        "b.pdf",
        "c.pdf",
      ]);
    });

    test("spreads the original entry fields and stamps summaryGeneratedAt", () => {
      const sig = makeSignature();
      const [entry] = buildReportEntries({
        results: [makeResult({ signatures: [sig], error: "boom" })],
        selectors: makeSelectors(),
        generatedAt: 999,
      });

      // Original fields survive the spread.
      expect(entry.fileId).toBe("file-1");
      expect(entry.fileName).toBe("doc.pdf");
      expect(entry.signatures).toEqual([sig]);
      expect(entry.error).toBe("boom");
      // The generatedAt timestamp is stamped onto every entry.
      expect(entry.summaryGeneratedAt).toBe(999);
    });

    test("returns an empty array for empty results", () => {
      expect(
        buildReportEntries({
          results: [],
          selectors: makeSelectors(),
          generatedAt: 1,
        }),
      ).toEqual([]);
    });
  });

  describe("createdAtLabel branch", () => {
    test("formats createdAt via toLocaleString when the stub has a timestamp", () => {
      const ts = 1_700_000_000_000;
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors({}, { "file-1": makeStub({ createdAt: ts }) }),
        generatedAt: 0,
      });

      expect(entry.createdAtLabel).toBe(new Date(ts).toLocaleString());
    });

    test("leaves createdAtLabel null when the stub is absent", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.createdAtLabel).toBeNull();
    });

    test("leaves createdAtLabel null when the stub has no createdAt", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors({}, { "file-1": makeStub() }),
        generatedAt: 0,
      });

      expect(entry.createdAtLabel).toBeNull();
    });

    test("treats a zero createdAt as falsy (no label)", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors({}, { "file-1": makeStub({ createdAt: 0 }) }),
        generatedAt: 0,
      });

      // `0` is falsy, so the `if (createdTimestamp)` branch is skipped.
      expect(entry.createdAtLabel).toBeNull();
    });
  });

  describe("fileSize fallback chain", () => {
    test("prefers the live file size over stub and entry sizes", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ fileSize: 30 })],
        selectors: makeSelectors(
          { "file-1": makeFile(10, 0) },
          { "file-1": makeStub({ size: 20 }) },
        ),
        generatedAt: 0,
      });

      expect(entry.fileSize).toBe(10);
    });

    test("falls back to the stub size when no live file exists", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ fileSize: 30 })],
        selectors: makeSelectors({}, { "file-1": makeStub({ size: 20 }) }),
        generatedAt: 0,
      });

      expect(entry.fileSize).toBe(20);
    });

    test("falls back to the entry fileSize when neither file nor stub exist", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ fileSize: 30 })],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.fileSize).toBe(30);
    });

    test("resolves to null when no size is available anywhere", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.fileSize).toBeNull();
    });

    test("treats a zero live-file size as a present value (not a fallback trigger)", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ fileSize: 30 })],
        selectors: makeSelectors(
          { "file-1": makeFile(0, 0) },
          { "file-1": makeStub({ size: 20 }) },
        ),
        generatedAt: 0,
      });

      // `0 ?? ...` keeps 0; nullish coalescing only falls through on null/undefined.
      expect(entry.fileSize).toBe(0);
    });
  });

  describe("lastModified fallback chain", () => {
    test("prefers the live file lastModified over stub and entry values", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ lastModified: 3000 })],
        selectors: makeSelectors(
          { "file-1": makeFile(0, 1000) },
          { "file-1": makeStub({ lastModified: 2000 }) },
        ),
        generatedAt: 0,
      });

      expect(entry.lastModified).toBe(1000);
    });

    test("falls back to the stub lastModified when no live file exists", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ lastModified: 3000 })],
        selectors: makeSelectors(
          {},
          { "file-1": makeStub({ lastModified: 2000 }) },
        ),
        generatedAt: 0,
      });

      expect(entry.lastModified).toBe(2000);
    });

    test("falls back to the entry lastModified when neither file nor stub exist", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ lastModified: 3000 })],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.lastModified).toBe(3000);
    });

    test("resolves to null when no lastModified is available anywhere", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.lastModified).toBeNull();
    });
  });

  describe("thumbnailUrl", () => {
    test("copies the stub thumbnailUrl when present", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors(
          {},
          { "file-1": makeStub({ thumbnailUrl: "blob:thumb" }) },
        ),
        generatedAt: 0,
      });

      expect(entry.thumbnailUrl).toBe("blob:thumb");
    });

    test("resolves thumbnailUrl to null when the stub is absent", () => {
      const [entry] = buildReportEntries({
        results: [makeResult()],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.thumbnailUrl).toBeNull();
    });
  });

  describe("statusText via deriveEntryStatus", () => {
    test("leaves statusText null when no TFunction is provided", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ signatures: [makeSignature()] })],
        selectors: makeSelectors(),
        generatedAt: 0,
      });

      expect(entry.statusText).toBeNull();
    });

    test("labels a file with a file-level error as Invalid", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ error: "broken", signatures: [] })],
        selectors: makeSelectors(),
        generatedAt: 0,
        t,
      });

      expect(entry.statusText).toBe("Invalid");
    });

    test("labels a file with no signatures as 'No signatures'", () => {
      const [entry] = buildReportEntries({
        results: [makeResult({ error: null, signatures: [] })],
        selectors: makeSelectors(),
        generatedAt: 0,
        t,
      });

      expect(entry.statusText).toBe("No signatures");
    });

    test("labels a file with all-valid signatures as Valid", () => {
      const [entry] = buildReportEntries({
        results: [
          makeResult({
            signatures: [makeSignature(), makeSignature({ id: "sig-2" })],
          }),
        ],
        selectors: makeSelectors(),
        generatedAt: 0,
        t,
      });

      expect(entry.statusText).toBe("Valid");
    });

    test("labels a file with any invalid signature as Invalid", () => {
      const [entry] = buildReportEntries({
        results: [
          makeResult({
            signatures: [makeSignature(), makeSignature({ valid: false })],
          }),
        ],
        selectors: makeSelectors(),
        generatedAt: 0,
        t,
      });

      expect(entry.statusText).toBe("Invalid");
    });
  });

  describe("integration: all enrichment paths in one pass", () => {
    test("enriches a multi-file batch with mixed metadata sources", () => {
      const createdAt = 1_700_000_000_000;
      const results = [
        makeResult({ fileId: "live", fileName: "live.pdf", fileSize: 99 }),
        makeResult({
          fileId: "stubbed",
          fileName: "stubbed.pdf",
          error: "oops",
        }),
        makeResult({
          fileId: "bare",
          fileName: "bare.pdf",
          fileSize: 7,
          lastModified: 8,
          signatures: [makeSignature()],
        }),
      ];

      const selectors = makeSelectors(
        { live: makeFile(500, 600) },
        {
          live: makeStub({ id: "live" as FileId, thumbnailUrl: "blob:a" }),
          stubbed: makeStub({
            id: "stubbed" as FileId,
            size: 250,
            lastModified: 260,
            createdAt,
          }),
        },
      );

      const entries = buildReportEntries({
        results,
        selectors,
        generatedAt: 12345,
        t,
      });

      // Live file: file metadata wins, stub provides the thumbnail.
      expect(entries[0]).toMatchObject({
        fileName: "live.pdf",
        fileSize: 500,
        lastModified: 600,
        thumbnailUrl: "blob:a",
        createdAtLabel: null,
        statusText: "No signatures",
        summaryGeneratedAt: 12345,
      });

      // Stubbed file: stub metadata + formatted createdAt + error status.
      expect(entries[1]).toMatchObject({
        fileName: "stubbed.pdf",
        fileSize: 250,
        lastModified: 260,
        thumbnailUrl: null,
        createdAtLabel: new Date(createdAt).toLocaleString(),
        statusText: "Invalid",
        summaryGeneratedAt: 12345,
      });

      // Bare file: entry-level fallbacks, valid signature.
      expect(entries[2]).toMatchObject({
        fileName: "bare.pdf",
        fileSize: 7,
        lastModified: 8,
        thumbnailUrl: null,
        createdAtLabel: null,
        statusText: "Valid",
        summaryGeneratedAt: 12345,
      });
    });
  });
});
