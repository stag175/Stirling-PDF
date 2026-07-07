import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the apiClient default export (axios instance). The custom processor
// calls apiClient.post<Blob>(...) — this is the only external dependency.
vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

import apiClient from "@app/services/apiClient";
import {
  buildPdfCommentAgentFormData,
  pdfCommentAgentOperationConfig,
  PDF_COMMENT_AGENT_ENDPOINT,
} from "@app/hooks/tools/pdfCommentAgent/pdfCommentAgentOperationConfig";
import {
  PdfCommentAgentParameters,
  defaultParameters,
} from "@app/hooks/tools/pdfCommentAgent/usePdfCommentAgentParameters";
import { ToolType } from "@app/hooks/tools/shared/toolOperationTypes";

const mockedPost = vi.mocked(apiClient.post);

const makeFile = (name = "report.pdf", body = "pdf-bytes"): File =>
  new File([body], name, { type: "application/pdf" });

const makeParams = (
  prompt = "summarise the doc",
): PdfCommentAgentParameters => ({
  prompt,
});

/**
 * Helper that resolves the mocked apiClient.post with a blob response carrying
 * the supplied content-disposition header and blob mime type.
 */
const stubResponse = (
  disposition: string | undefined,
  blobType = "application/pdf",
) => {
  const data = new Blob(["annotated"], blobType ? { type: blobType } : {});
  mockedPost.mockResolvedValueOnce({
    data,
    headers: disposition ? { "content-disposition": disposition } : {},
  } as never);
  return data;
};

const runProcessor = (params: PdfCommentAgentParameters, files: File[]) =>
  pdfCommentAgentOperationConfig.customProcessor(params, files);

describe("pdfCommentAgentOperationConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildPdfCommentAgentFormData", () => {
    test("appends fileInput and prompt to the FormData payload", () => {
      const file = makeFile("input.pdf");
      const formData = buildPdfCommentAgentFormData(
        makeParams("describe figures"),
        file,
      );

      expect(formData.get("fileInput")).toBe(file);
      expect(formData.get("prompt")).toBe("describe figures");
    });

    test("preserves an empty prompt string", () => {
      const file = makeFile();
      const formData = buildPdfCommentAgentFormData(makeParams(""), file);

      expect(formData.get("prompt")).toBe("");
      expect(formData.get("fileInput")).toBe(file);
    });
  });

  describe("operation config shape", () => {
    test("declares the custom tool type, endpoint and default parameters", () => {
      expect(pdfCommentAgentOperationConfig.toolType).toBe(ToolType.custom);
      expect(pdfCommentAgentOperationConfig.operationType).toBe(
        "pdfCommentAgent",
      );
      expect(pdfCommentAgentOperationConfig.endpoint).toBe(
        PDF_COMMENT_AGENT_ENDPOINT,
      );
      expect(PDF_COMMENT_AGENT_ENDPOINT).toBe(
        "/api/v1/ai/tools/pdf-comment-agent",
      );
      expect(pdfCommentAgentOperationConfig.defaultParameters).toBe(
        defaultParameters,
      );
      expect(typeof pdfCommentAgentOperationConfig.customProcessor).toBe(
        "function",
      );
    });
  });

  describe("customProcessor: early return", () => {
    test("returns no files when given an empty file list without calling the API", async () => {
      const result = await runProcessor(makeParams(), []);

      expect(result).toEqual({ files: [] });
      expect(mockedPost).not.toHaveBeenCalled();
    });
  });

  describe("customProcessor: request wiring", () => {
    test("POSTs FormData to the endpoint with a blob responseType", async () => {
      stubResponse('attachment; filename="out.pdf"');

      await runProcessor(makeParams("note headings"), [makeFile("in.pdf")]);

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body, options] = mockedPost.mock.calls[0];
      expect(url).toBe(PDF_COMMENT_AGENT_ENDPOINT);
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get("prompt")).toBe("note headings");
      expect(options).toEqual({ responseType: "blob" });
    });
  });

  describe("customProcessor: filename from Content-Disposition", () => {
    test("decodes the RFC 5987 extended form (filename*=UTF-8'')", async () => {
      stubResponse("attachment; filename*=UTF-8''my%20commented%20file.pdf");

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("my commented file.pdf");
    });

    test("falls back to the plain form when extended percent-decoding throws", async () => {
      // %E0%A4%A is malformed UTF-8 -> decodeURIComponent throws -> catch path.
      stubResponse(
        "attachment; filename*=UTF-8''%E0%A4%A; filename=\"safe-plain.pdf\"",
      );

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("safe-plain.pdf");
    });

    test("ignores an extended filename that sanitises to a path and uses the plain form", async () => {
      stubResponse(
        "attachment; filename*=UTF-8''..%2Fevil.pdf; filename=\"clean.pdf\"",
      );

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("clean.pdf");
    });

    test("ignores an extended filename that decodes to blank and uses the plain form", async () => {
      stubResponse("attachment; filename*=UTF-8''%20; filename=\"named.pdf\"");

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("named.pdf");
    });

    test("reads the plain quoted form", async () => {
      stubResponse('attachment; filename="quoted name.pdf"');

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("quoted name.pdf");
    });

    test("reads the plain unquoted form", async () => {
      stubResponse("attachment; filename=unquoted.pdf");

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].name).toBe("unquoted.pdf");
    });

    test("rejects a plain filename containing a path separator and uses the fallback", async () => {
      stubResponse('attachment; filename="../../etc/passwd.pdf"');

      const result = await runProcessor(makeParams(), [
        makeFile("original.pdf"),
      ]);

      // sanitiseFilename returns null for path separators -> fallback derived
      // from input name with the .pdf extension stripped.
      expect(result.files[0].name).toBe("original-commented.pdf");
    });
  });

  describe("customProcessor: fallback filename derivation", () => {
    test("derives the fallback when no Content-Disposition header is present", async () => {
      stubResponse(undefined);

      const result = await runProcessor(makeParams(), [
        makeFile("Annual Report.pdf"),
      ]);

      expect(result.files[0].name).toBe("Annual Report-commented.pdf");
    });

    test("derives the fallback when the header matches neither pattern", async () => {
      stubResponse("attachment; size=1024");

      const result = await runProcessor(makeParams(), [makeFile("doc.PDF")]);

      // Case-insensitive .pdf stripping in the fallback.
      expect(result.files[0].name).toBe("doc-commented.pdf");
    });

    test("appends -commented.pdf to an input name without a .pdf extension", async () => {
      stubResponse(undefined);

      const result = await runProcessor(makeParams(), [makeFile("scan")]);

      expect(result.files[0].name).toBe("scan-commented.pdf");
    });
  });

  describe("customProcessor: result blob type", () => {
    test("uses the blob's own mime type when present", async () => {
      stubResponse('attachment; filename="typed.pdf"', "application/pdf");

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].type).toBe("application/pdf");
    });

    test("defaults to application/pdf when the blob has no type", async () => {
      stubResponse('attachment; filename="untyped.pdf"', "");

      const result = await runProcessor(makeParams(), [makeFile("src.pdf")]);

      expect(result.files[0].type).toBe("application/pdf");
      expect(result.files).toHaveLength(1);
    });
  });

  describe("customProcessor: error propagation", () => {
    test("propagates an API rejection to the caller", async () => {
      mockedPost.mockRejectedValueOnce(new Error("network down"));

      await expect(
        runProcessor(makeParams(), [makeFile("src.pdf")]),
      ).rejects.toThrow("network down");
    });
  });
});
