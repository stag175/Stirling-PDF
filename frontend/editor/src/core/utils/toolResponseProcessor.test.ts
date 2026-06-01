/**
 * Unit tests for toolResponseProcessor.processResponse
 *
 * The only external dependency is getFilenameFromHeaders, which we mock so the
 * Content-Disposition parsing is deterministic and we can drive every branch of
 * processResponse from the test (responseHandler, header path, default prefix).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { processResponse } from "@app/utils/toolResponseProcessor";
import { getFilenameFromHeaders } from "@app/utils/fileResponseUtils";

vi.mock("@app/utils/fileResponseUtils", () => ({
  getFilenameFromHeaders: vi.fn(),
}));

const mockedGetFilenameFromHeaders = vi.mocked(getFilenameFromHeaders);

beforeEach(() => {
  mockedGetFilenameFromHeaders.mockReset();
});

describe("processResponse", () => {
  describe("responseHandler branch", () => {
    test("returns the array produced by an array-returning responseHandler", async () => {
      const blob = new Blob(["handler-content"], { type: "application/pdf" });
      const original = new File(["orig"], "input.pdf", {
        type: "application/pdf",
      });
      const produced = [
        new File(["a"], "a.pdf", { type: "application/pdf" }),
        new File(["b"], "b.pdf", { type: "application/pdf" }),
      ];

      const handler = vi.fn().mockResolvedValue(produced);

      const result = await processResponse(
        blob,
        [original],
        "ignored_",
        handler,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(blob, [original]);
      expect(result).toBe(produced);
      expect(result).toHaveLength(2);
      // getFilenameFromHeaders must NOT be consulted on this path.
      expect(mockedGetFilenameFromHeaders).not.toHaveBeenCalled();
    });

    test("wraps a single File returned by the responseHandler into an array", async () => {
      const blob = new Blob(["single"], { type: "application/pdf" });
      const original = new File(["orig"], "input.pdf");
      const single = new File(["only"], "only.pdf", {
        type: "application/pdf",
      });

      // Synchronous (non-Promise) return value to exercise the non-async path.
      const handler = vi.fn().mockReturnValue(single);

      const result = await processResponse(
        blob,
        [original],
        undefined,
        handler,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(single);
    });

    test("responseHandler takes precedence even when responseHeaders are present", async () => {
      const blob = new Blob(["x"]);
      const original = new File(["o"], "o.pdf");
      const single = new File(["h"], "from-handler.pdf");
      const handler = vi.fn().mockResolvedValue([single]);

      const result = await processResponse(blob, [original], "p_", handler, {
        "content-disposition": 'attachment; filename="ignored.pdf"',
      });

      expect(result).toEqual([single]);
      expect(mockedGetFilenameFromHeaders).not.toHaveBeenCalled();
    });
  });

  describe("Content-Disposition header branch", () => {
    test("uses backend filename and blob.type when blob has a type", async () => {
      mockedGetFilenameFromHeaders.mockReturnValue("backend.pdf");
      const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
      const original = new File(["orig"], "input.docx");

      const result = await processResponse(
        blob,
        [original],
        "prefix_",
        undefined,
        {
          "content-disposition": 'attachment; filename="backend.pdf"',
          "content-type": "text/plain",
        },
      );

      expect(mockedGetFilenameFromHeaders).toHaveBeenCalledWith(
        'attachment; filename="backend.pdf"',
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("backend.pdf");
      // blob.type wins over content-type header when present.
      expect(result[0].type).toBe("application/pdf");
      // The blob bytes are carried through into the produced File.
      expect(result[0].size).toBe(blob.size);
    });

    test("falls back to content-type header when blob has no type", async () => {
      mockedGetFilenameFromHeaders.mockReturnValue("server.csv");
      const blob = new Blob(["csv-bytes"]); // no type
      const original = new File(["orig"], "input.xlsx");

      const result = await processResponse(
        blob,
        [original],
        undefined,
        undefined,
        {
          "content-disposition": 'attachment; filename="server.csv"',
          "content-type": "text/csv",
        },
      );

      expect(result[0].name).toBe("server.csv");
      expect(result[0].type).toBe("text/csv");
    });

    test("defaults to application/octet-stream when no blob.type and no content-type", async () => {
      mockedGetFilenameFromHeaders.mockReturnValue("blob.bin");
      const blob = new Blob(["bytes"]); // no type
      const original = new File(["orig"], "input.pdf");

      const result = await processResponse(
        blob,
        [original],
        undefined,
        undefined,
        {
          "content-disposition": 'attachment; filename="blob.bin"',
        },
      );

      expect(result[0].name).toBe("blob.bin");
      expect(result[0].type).toBe("application/octet-stream");
    });

    test("falls back to default behavior when headers present but no filename parsed", async () => {
      mockedGetFilenameFromHeaders.mockReturnValue(null);
      const blob = new Blob(["data"], { type: "application/pdf" });
      const original = new File(["orig"], "original.pdf");

      const result = await processResponse(
        blob,
        [original],
        "stamped_",
        undefined,
        {
          "content-disposition": "attachment; invalid=format",
        },
      );

      // No backend filename => prefix + original name path.
      expect(mockedGetFilenameFromHeaders).toHaveBeenCalledWith(
        "attachment; invalid=format",
      );
      expect(result[0].name).toBe("stamped_original.pdf");
      expect(result[0].type).toBe("application/pdf");
    });

    test("falls back to default behavior when content-disposition is missing entirely", async () => {
      mockedGetFilenameFromHeaders.mockReturnValue(null);
      const blob = new Blob(["data"], { type: "application/pdf" });
      const original = new File(["orig"], "doc.pdf");

      const result = await processResponse(blob, [original], "", undefined, {
        "content-type": "application/pdf",
      });

      // contentDisposition is undefined here; helper still invoked with undefined.
      expect(mockedGetFilenameFromHeaders).toHaveBeenCalledWith(undefined);
      // Empty prefix preserves the original name.
      expect(result[0].name).toBe("doc.pdf");
    });
  });

  describe("default filePrefix branch", () => {
    test("prepends a non-empty prefix to the first original file's name", async () => {
      const blob = new Blob(["content"], { type: "application/pdf" });
      const original = new File(["orig"], "report.pdf", {
        type: "application/pdf",
      });

      const result = await processResponse(blob, [original], "compressed_");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("compressed_report.pdf");
      expect(result[0].type).toBe("application/pdf");
      // Header helper is never consulted when responseHeaders is undefined.
      expect(mockedGetFilenameFromHeaders).not.toHaveBeenCalled();
    });

    test("preserves the original filename when prefix is an empty string", async () => {
      const blob = new Blob(["content"], { type: "application/pdf" });
      const original = new File(["orig"], "keep-name.pdf");

      const result = await processResponse(blob, [original], "");

      expect(result[0].name).toBe("keep-name.pdf");
    });

    test("preserves the original filename when prefix is undefined", async () => {
      const blob = new Blob(["content"], { type: "image/png" });
      const original = new File(["orig"], "picture.png");

      const result = await processResponse(blob, [original]);

      expect(result[0].name).toBe("picture.png");
      expect(result[0].type).toBe("image/png");
    });

    test("uses 'result.pdf' fallback when there are no original files", async () => {
      const blob = new Blob(["content"]); // no type

      const result = await processResponse(blob, []);

      expect(result[0].name).toBe("result.pdf");
      // No blob.type => default octet-stream.
      expect(result[0].type).toBe("application/octet-stream");
    });

    test("applies prefix to the 'result.pdf' fallback when no original files", async () => {
      const blob = new Blob(["content"], { type: "application/pdf" });

      const result = await processResponse(blob, [], "out_");

      expect(result[0].name).toBe("out_result.pdf");
    });
  });

  describe("lastModified stamping on the default branch", () => {
    let nowSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      nowSpy?.mockRestore();
    });

    test("sets lastModified to the current time on the default path", async () => {
      const fixed = 1_700_000_000_000;
      nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixed);

      const blob = new Blob(["content"], { type: "application/pdf" });
      const original = new File(["orig"], "stamp.pdf");

      const result = await processResponse(blob, [original]);

      expect(result[0].lastModified).toBe(fixed);
      expect(Date.now).toHaveBeenCalled();
    });
  });
});
