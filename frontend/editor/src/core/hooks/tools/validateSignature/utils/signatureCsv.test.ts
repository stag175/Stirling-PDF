/**
 * Unit tests for the signature-validation CSV formatter.
 *
 * `createCsvFile` is a pure formatter: it walks report entries, formats each
 * signature (or a single empty row when a file has no signatures) into CSV
 * cells via the already-tested signatureUtils helpers, escapes them, and wraps
 * the result in a `File`. There are no network/storage/Tauri dependencies, so
 * the tests are fully deterministic and require no mocking.
 *
 * The tests read the produced CSV back out of the File so they exercise the
 * real `escapeCsvValue`/`booleanToString`/`keyUsagesToString` composition
 * rather than re-stubbing them.
 */

import { describe, test, expect, beforeAll } from "vitest";
import { createCsvFile } from "@app/hooks/tools/validateSignature/utils/signatureCsv";
import { CSV_FILENAME } from "@app/hooks/tools/validateSignature/utils/signatureUtils";
import type {
  SignatureValidationReportEntry,
  SignatureValidationSignature,
} from "@app/types/validateSignature";

const HEADER_ROW =
  "fileName,signatureIndex,valid,chainValid,trustValid,notExpired," +
  "revocationChecked,revocationStatus,signerName,signatureDate,reason," +
  "location,issuerDN,subjectDN,serialNumber,validFrom,validUntil," +
  "signatureAlgorithm,keySize,version,keyUsages,selfSigned,errorMessage";

const COLUMN_COUNT = HEADER_ROW.split(",").length;

// A fully-populated signature with deterministic, "plain" (escape-free) values.
const makeSignature = (
  overrides: Partial<SignatureValidationSignature> = {},
): SignatureValidationSignature => ({
  id: "file-0",
  valid: true,
  chainValid: true,
  trustValid: true,
  notExpired: true,
  revocationChecked: true,
  revocationStatus: "good",
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
  ...overrides,
});

const makeEntry = (
  overrides: Partial<SignatureValidationReportEntry> = {},
): SignatureValidationReportEntry => ({
  fileId: "file-id",
  fileName: "doc.pdf",
  signatures: [],
  error: null,
  ...overrides,
});

// Read the File contents back to plain text. In jsdom, `Blob.text()` /
// `arrayBuffer()` do not faithfully return the original string parts, but
// `FileReader.readAsText` does — so use it for a deterministic round-trip.
const readCsv = (file: File): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const splitRows = (csv: string): string[] => csv.split("\r\n");

describe("signatureCsv", () => {
  let probeCsv: string;

  beforeAll(async () => {
    probeCsv = await readCsv(createCsvFile([]));
  });

  describe("createCsvFile - File metadata", () => {
    test("produces a File with the expected name and mime type", () => {
      const file = createCsvFile([]);
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(CSV_FILENAME);
      expect(file.name).toBe("signature-validation.csv");
      expect(file.type).toBe("text/csv;charset=utf-8;");
    });
  });

  describe("createCsvFile - header", () => {
    test("always emits the header row, even with no entries", () => {
      const rows = splitRows(probeCsv);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toBe(HEADER_ROW);
    });

    test("header has the documented 23 columns", () => {
      expect(COLUMN_COUNT).toBe(23);
    });
  });

  describe("createCsvFile - empty-signatures branch", () => {
    test("emits a single padded row with only fileName and error populated", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            fileName: "empty.pdf",
            signatures: [],
            error: "no signatures found",
          }),
        ]),
      );
      const rows = splitRows(csv);
      expect(rows).toHaveLength(2);

      const cells = rows[1].split(",");
      expect(cells).toHaveLength(COLUMN_COUNT);
      expect(cells[0]).toBe("empty.pdf");
      // All middle columns are blank in the empty branch.
      expect(cells.slice(1, COLUMN_COUNT - 1).every((c) => c === "")).toBe(
        true,
      );
      // Last column carries the file-level error.
      expect(cells[COLUMN_COUNT - 1]).toBe("no signatures found");
    });

    test("blanks the error column when there is no file-level error", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ fileName: "clean.pdf", signatures: [], error: null }),
        ]),
      );
      const cells = splitRows(csv)[1].split(",");
      expect(cells[0]).toBe("clean.pdf");
      expect(cells[COLUMN_COUNT - 1]).toBe("");
    });

    test("treats an undefined error the same as null (empty cell)", async () => {
      const entry = makeEntry({ fileName: "noerr.pdf", signatures: [] });
      delete (entry as { error?: unknown }).error;
      const csv = await readCsv(createCsvFile([entry]));
      const cells = splitRows(csv)[1].split(",");
      expect(cells[COLUMN_COUNT - 1]).toBe("");
    });
  });

  describe("createCsvFile - populated-signatures branch", () => {
    test("renders a fully-populated signature row deterministically", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ fileName: "doc.pdf", signatures: [makeSignature()] }),
        ]),
      );
      const rows = splitRows(csv);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toBe(
        [
          "doc.pdf",
          "1",
          "true",
          "true",
          "true",
          "true",
          "true",
          "good",
          "Alice",
          "2026-01-01",
          "Approval",
          "London",
          "CN=Issuer",
          "CN=Alice",
          "12345",
          "2025-01-01",
          "2027-01-01",
          "SHA256withRSA",
          "2048",
          "1",
          // keyUsages joined with "; " contains a semicolon -> quoted by escapeCsvValue
          '"digitalSignature; nonRepudiation"',
          "false",
          "",
        ].join(","),
      );
    });

    test("numbers signatures sequentially starting at 1 (signatureIndex)", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            fileName: "multi.pdf",
            signatures: [
              makeSignature({ signerName: "First" }),
              makeSignature({ signerName: "Second" }),
              makeSignature({ signerName: "Third" }),
            ],
          }),
        ]),
      );
      const rows = splitRows(csv);
      expect(rows).toHaveLength(4);
      expect(rows[1].split(",")[1]).toBe("1");
      expect(rows[2].split(",")[1]).toBe("2");
      expect(rows[3].split(",")[1]).toBe("3");
      expect(rows[1].split(",")[8]).toBe("First");
      expect(rows[2].split(",")[8]).toBe("Second");
      expect(rows[3].split(",")[8]).toBe("Third");
    });

    test("renders multiple entries in order, mixing empty and populated", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            fileName: "a.pdf",
            signatures: [makeSignature({ signerName: "A" })],
          }),
          makeEntry({
            fileName: "b.pdf",
            signatures: [],
            error: "broken",
          }),
          makeEntry({
            fileName: "c.pdf",
            signatures: [
              makeSignature({ signerName: "C1" }),
              makeSignature({ signerName: "C2" }),
            ],
          }),
        ]),
      );
      const rows = splitRows(csv);
      // header + 1 (a) + 1 (b empty) + 2 (c) = 5
      expect(rows).toHaveLength(5);
      expect(rows[1].split(",")[0]).toBe("a.pdf");
      expect(rows[2].split(",")[0]).toBe("b.pdf");
      expect(rows[2].split(",")[COLUMN_COUNT - 1]).toBe("broken");
      expect(rows[3].split(",")[0]).toBe("c.pdf");
      expect(rows[4].split(",")[0]).toBe("c.pdf");
      expect(rows[3].split(",")[1]).toBe("1");
      expect(rows[4].split(",")[1]).toBe("2");
    });
  });

  describe("createCsvFile - keySize formatting branches", () => {
    test("stringifies a positive keySize", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ signatures: [makeSignature({ keySize: 4096 })] }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[18]).toBe("4096");
    });

    test("stringifies a zero keySize (not treated as blank)", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ signatures: [makeSignature({ keySize: 0 })] }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[18]).toBe("0");
    });

    test("blanks the keySize cell when keySize is null", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ signatures: [makeSignature({ keySize: null })] }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[18]).toBe("");
    });

    test("blanks the keySize cell when keySize is undefined", async () => {
      const sig = makeSignature();
      delete (sig as { keySize?: unknown }).keySize;
      const csv = await readCsv(
        createCsvFile([makeEntry({ signatures: [sig] })]),
      );
      expect(splitRows(csv)[1].split(",")[18]).toBe("");
    });
  });

  describe("createCsvFile - boolean and nullable string branches", () => {
    test("renders false booleans and blanks null/undefined nullable booleans", async () => {
      const sig = makeSignature({
        valid: false,
        chainValid: false,
        trustValid: false,
        notExpired: false,
        revocationChecked: null,
      });
      const csv = await readCsv(
        createCsvFile([makeEntry({ signatures: [sig] })]),
      );
      const cells = splitRows(csv)[1].split(",");
      expect(cells[2]).toBe("false"); // valid
      expect(cells[3]).toBe("false"); // chainValid
      expect(cells[4]).toBe("false"); // trustValid
      expect(cells[5]).toBe("false"); // notExpired
      expect(cells[6]).toBe(""); // revocationChecked null -> ""
    });

    test("blanks nullable string fields when they are null/undefined", async () => {
      const sig = makeSignature({
        revocationStatus: null,
        signerName: "",
        signatureDate: "",
        reason: "",
        location: "",
        issuerDN: "",
        subjectDN: "",
        serialNumber: "",
        validFrom: "",
        validUntil: "",
        signatureAlgorithm: "",
        version: "",
        keyUsages: [],
      });
      const csv = await readCsv(
        createCsvFile([makeEntry({ signatures: [sig] })]),
      );
      const cells = splitRows(csv)[1].split(",");
      expect(cells[7]).toBe(""); // revocationStatus
      expect(cells[8]).toBe(""); // signerName
      expect(cells[20]).toBe(""); // keyUsages -> empty array -> ""
    });

    test("blanks keyUsages when the array is empty", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ signatures: [makeSignature({ keyUsages: [] })] }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[20]).toBe("");
    });

    test("emits a single keyUsage unquoted (no separator -> no semicolon)", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            signatures: [makeSignature({ keyUsages: ["digitalSignature"] })],
          }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[20]).toBe("digitalSignature");
    });
  });

  describe("createCsvFile - errorMessage fallback", () => {
    test("uses the signature errorMessage when present", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            error: "file level error",
            signatures: [makeSignature({ errorMessage: "sig level error" })],
          }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[COLUMN_COUNT - 1]).toBe(
        "sig level error",
      );
    });

    test("falls back to the file-level error when signature errorMessage is null", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            error: "file level error",
            signatures: [makeSignature({ errorMessage: null })],
          }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[COLUMN_COUNT - 1]).toBe(
        "file level error",
      );
    });

    test("blanks the error column when neither errorMessage nor file error exist", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            error: null,
            signatures: [makeSignature({ errorMessage: null })],
          }),
        ]),
      );
      expect(splitRows(csv)[1].split(",")[COLUMN_COUNT - 1]).toBe("");
    });
  });

  describe("createCsvFile - CSV escaping integration", () => {
    test("quotes a value containing a comma", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            signatures: [makeSignature({ signerName: "Doe, John" })],
          }),
        ]),
      );
      expect(csv).toContain('"Doe, John"');
    });

    test("doubles and quotes embedded double-quotes", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ signatures: [makeSignature({ reason: 'say "hi"' })] }),
        ]),
      );
      expect(csv).toContain('"say ""hi"""');
    });

    test("collapses newlines in a cell to spaces (no row corruption)", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({
            signatures: [makeSignature({ location: "line1\r\nline2\nline3" })],
          }),
        ]),
      );
      // The newline-bearing cell must not introduce extra data rows.
      expect(splitRows(csv)).toHaveLength(2);
      expect(csv).toContain("line1 line2 line3");
    });

    test("quotes a fileName containing a semicolon", async () => {
      const csv = await readCsv(
        createCsvFile([
          makeEntry({ fileName: "a;b.pdf", signatures: [makeSignature()] }),
        ]),
      );
      expect(csv).toContain('"a;b.pdf"');
    });
  });

  describe("createCsvFile - line endings", () => {
    test("joins rows with CRLF", async () => {
      const csv = await readCsv(
        createCsvFile([makeEntry({ signatures: [makeSignature()] })]),
      );
      expect(csv).toContain("\r\n");
      // Exactly one CRLF between the two rows (header + 1 data row).
      expect(csv.split("\r\n")).toHaveLength(2);
    });
  });
});
