/**
 * Unit tests for automationExecutor: sequence/operation orchestration.
 *
 * Exercises single- vs multi-file dispatch, ZIP vs single-PDF responses,
 * prefix handling, custom processors, step callbacks and error wrapping.
 * All external deps (apiClient, processResponse, AutomationFileProcessor)
 * are mocked for determinism.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// --- Mock external dependencies -----------------------------------------

vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@app/utils/toolResponseProcessor", () => ({
  processResponse: vi.fn(),
}));

vi.mock("@app/utils/automationFileProcessor", () => ({
  AutomationFileProcessor: {
    extractAutomationZipFiles: vi.fn(),
  },
}));

import apiClient from "@app/services/apiClient";
import { processResponse } from "@app/utils/toolResponseProcessor";
import { AutomationFileProcessor } from "@app/utils/automationFileProcessor";
import { ToolType } from "@app/hooks/tools/shared/useToolOperation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import {
  executeToolOperation,
  executeToolOperationWithPrefix,
  executeAutomationSequence,
} from "@app/utils/automationExecutor";

const mockedPost = vi.mocked(apiClient.post);
const mockedProcessResponse = vi.mocked(processResponse);
const mockedExtractZip = vi.mocked(
  AutomationFileProcessor.extractAutomationZipFiles,
);

// --- Helpers ------------------------------------------------------------

const makeFile = (name: string, type = "application/pdf"): File =>
  new File(["x"], name, { type });

const pdfBlob = () => new Blob(["pdf"], { type: "application/pdf" });
const zipBlob = () => new Blob(["zip"], { type: "application/zip" });

/** Cast an arbitrary stub object into a ToolRegistry for the executor. */
const asRegistry = (obj: Record<string, unknown>): ToolRegistry =>
  obj as unknown as ToolRegistry;

beforeEach(() => {
  vi.clearAllMocks();
  // Silence the executor's diagnostic logging during tests.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("automationExecutor", () => {
  describe("executeToolOperationWithPrefix", () => {
    test("throws when the operation is not in the registry", async () => {
      await expect(
        executeToolOperationWithPrefix(
          "nope",
          {},
          [makeFile("a.pdf")],
          asRegistry({}),
        ),
      ).rejects.toThrow("Tool operation not supported: nope");
    });

    test("custom processor short-circuits and returns its files", async () => {
      const out = [makeFile("custom.pdf")];
      const customProcessor = vi.fn().mockResolvedValue({ files: out });
      const registry = asRegistry({
        convert: {
          operationConfig: {
            customProcessor,
            defaultParameters: { foo: "default" },
          },
        },
      });

      const result = await executeToolOperationWithPrefix(
        "convert",
        { bar: "override" },
        [makeFile("in.pdf")],
        registry,
      );

      expect(result).toBe(out);
      // defaultParameters merged with caller parameters.
      expect(customProcessor).toHaveBeenCalledWith(
        { foo: "default", bar: "override" },
        [expect.any(File)],
      );
      expect(mockedPost).not.toHaveBeenCalled();
    });

    test("multi-file op posts once with all files and extracts a ZIP response", async () => {
      mockedPost.mockResolvedValue({
        data: zipBlob(),
        headers: { "content-type": "application/zip" },
      });
      mockedExtractZip.mockResolvedValue({
        files: [makeFile("prefixA_doc1.pdf"), makeFile("prefixB_doc2.pdf")],
        errors: [],
        success: true,
      });

      const buildFormData = vi.fn(() => new FormData());
      const registry = asRegistry({
        merge: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/merge-pdfs",
            buildFormData,
          },
        },
      });

      const files = [makeFile("a.pdf"), makeFile("b.pdf")];
      const result = await executeToolOperationWithPrefix(
        "merge",
        {},
        files,
        registry,
        "RUN_",
      );

      // Single call carrying all files.
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(buildFormData).toHaveBeenCalledWith({}, files);
      const [endpoint, , opts] = mockedPost.mock.calls[0];
      expect(endpoint).toBe("/api/v1/general/merge-pdfs");
      expect(opts).toMatchObject({ responseType: "blob" });
      // Prefix replaces the existing prefix on each extracted file.
      expect(result.map((f) => f.name)).toEqual([
        "RUN_doc1.pdf",
        "RUN_doc2.pdf",
      ]);
    });

    test("ZIP response with warnings logs and keeps files; empty prefix leaves names untouched", async () => {
      mockedPost.mockResolvedValue({
        data: zipBlob(),
        headers: {},
      });
      mockedExtractZip.mockResolvedValue({
        files: [makeFile("orig_only.pdf")],
        errors: ["bad entry"],
        success: true,
      });

      const registry = asRegistry({
        merge: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/merge-pdfs",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const result = await executeToolOperationWithPrefix(
        "merge",
        {},
        [makeFile("a.pdf")],
        registry,
        "", // empty prefix => result.files returned verbatim
      );

      expect(console.warn).toHaveBeenCalled();
      expect(result.map((f) => f.name)).toEqual(["orig_only.pdf"]);
    });

    test("multi-file op with preserveBackendFilename returns extracted files verbatim", async () => {
      mockedPost.mockResolvedValue({
        data: zipBlob(),
        headers: {},
      });
      const extracted = [makeFile("server_name.pdf")];
      mockedExtractZip.mockResolvedValue({
        files: extracted,
        errors: [],
        success: true,
      });

      const registry = asRegistry({
        split: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/split",
            preserveBackendFilename: true,
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const result = await executeToolOperationWithPrefix(
        "split",
        {},
        [makeFile("a.pdf")],
        registry,
        "WILLBEIGNORED_",
      );

      // preserveBackendFilename => prefix branch skipped, names unchanged.
      expect(result.map((f) => f.name)).toEqual(["server_name.pdf"]);
    });

    test("single-PDF response (by blob type) routes through processResponse", async () => {
      mockedPost.mockResolvedValue({
        data: pdfBlob(),
        headers: { "content-disposition": 'attachment; filename="x.pdf"' },
      });
      const processed = [makeFile("processed.pdf")];
      mockedProcessResponse.mockResolvedValue(processed);

      const registry = asRegistry({
        split: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/split",
            preserveBackendFilename: true,
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const inputFiles = [makeFile("a.pdf")];
      const result = await executeToolOperationWithPrefix(
        "split",
        {},
        inputFiles,
        registry,
        "PFX_",
      );

      expect(mockedExtractZip).not.toHaveBeenCalled();
      // preserveBackendFilename=true => headers forwarded to processResponse.
      expect(mockedProcessResponse).toHaveBeenCalledWith(
        expect.any(Blob),
        inputFiles,
        "PFX_",
        undefined,
        { "content-disposition": 'attachment; filename="x.pdf"' },
      );
      expect(result).toBe(processed);
    });

    test("single-PDF response detected via content-type header (octet blob) and no preserveBackendFilename", async () => {
      // Blob type is generic, but header says PDF -> still single-PDF path.
      mockedPost.mockResolvedValue({
        data: new Blob(["x"], { type: "application/octet-stream" }),
        headers: { "content-type": "application/pdf" },
      });
      mockedProcessResponse.mockResolvedValue([makeFile("p.pdf")]);

      const registry = asRegistry({
        split: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/split",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      await executeToolOperationWithPrefix(
        "split",
        {},
        [makeFile("a.pdf")],
        registry,
        "PFX_",
      );

      // Without preserveBackendFilename, headers arg is undefined.
      expect(mockedProcessResponse).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.any(Array),
        "PFX_",
        undefined,
        undefined,
      );
    });

    test("single-file op iterates each file, calls a function endpoint, and concatenates results", async () => {
      mockedPost.mockResolvedValue({
        data: zipBlob(),
        headers: {},
      });
      // Each call yields one file; collected across the loop.
      mockedExtractZip
        .mockResolvedValueOnce({
          files: [makeFile("r1.pdf")],
          errors: [],
          success: true,
        })
        .mockResolvedValueOnce({
          files: [makeFile("r2.pdf")],
          errors: [],
          success: true,
        });

      const endpoint = vi.fn(
        (params: { rotation: number }) => `/api/v1/rotate/${params.rotation}`,
      );
      const buildFormData = vi.fn(() => new FormData());
      const registry = asRegistry({
        rotate: {
          operationConfig: {
            toolType: ToolType.singleFile,
            endpoint,
            buildFormData,
            defaultParameters: { rotation: 90 },
          },
        },
      });

      const files = [makeFile("a.pdf"), makeFile("b.pdf")];
      const result = await executeToolOperationWithPrefix(
        "rotate",
        {},
        files,
        registry,
        "", // empty prefix keeps extracted names
      );

      // One POST per input file.
      expect(mockedPost).toHaveBeenCalledTimes(2);
      // Function endpoint resolved with merged params.
      expect(endpoint).toHaveBeenCalledWith({ rotation: 90 });
      expect(mockedPost.mock.calls[0][0]).toBe("/api/v1/rotate/90");
      // buildFormData receives a single file per iteration.
      expect(buildFormData).toHaveBeenNthCalledWith(
        1,
        { rotation: 90 },
        files[0],
      );
      expect(buildFormData).toHaveBeenNthCalledWith(
        2,
        { rotation: 90 },
        files[1],
      );
      expect(result.map((f) => f.name)).toEqual(["r1.pdf", "r2.pdf"]);
    });

    test("wraps API errors using error.response.data when present", async () => {
      const apiError = Object.assign(new Error("network"), {
        response: { data: "Backend exploded" },
      });
      mockedPost.mockRejectedValue(apiError);

      const registry = asRegistry({
        merge: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/merge-pdfs",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      await expect(
        executeToolOperationWithPrefix(
          "merge",
          {},
          [makeFile("a.pdf")],
          registry,
        ),
      ).rejects.toThrow("merge operation failed: Backend exploded");

      // Original error preserved as cause.
      try {
        await executeToolOperationWithPrefix(
          "merge",
          {},
          [makeFile("a.pdf")],
          registry,
        );
        throw new Error("should have thrown");
      } catch (e) {
        expect((e as Error).cause).toBe(apiError);
      }
    });

    test("wraps API errors using error.message when response.data is absent", async () => {
      mockedPost.mockRejectedValue(new Error("timeout exceeded"));

      const registry = asRegistry({
        merge: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/merge-pdfs",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      await expect(
        executeToolOperationWithPrefix(
          "merge",
          {},
          [makeFile("a.pdf")],
          registry,
        ),
      ).rejects.toThrow("merge operation failed: timeout exceeded");
    });
  });

  describe("executeToolOperation", () => {
    test("delegates to executeToolOperationWithPrefix using the default FILE_PREFIX", async () => {
      mockedPost.mockResolvedValue({ data: zipBlob(), headers: {} });
      // The extracted file already has a prefix segment so we can observe the
      // default "automated_" prefix being applied (prefix replacement).
      mockedExtractZip.mockResolvedValue({
        files: [makeFile("response_thing.pdf")],
        errors: [],
        success: true,
      });

      const registry = asRegistry({
        merge: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/general/merge-pdfs",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const result = await executeToolOperation(
        "merge",
        {},
        [makeFile("a.pdf")],
        registry,
      );

      expect(result.map((f) => f.name)).toEqual(["automated_thing.pdf"]);
    });
  });

  describe("executeAutomationSequence", () => {
    test("throws when there are no operations", async () => {
      await expect(
        executeAutomationSequence(
          { name: "Empty", operations: [] },
          [makeFile("a.pdf")],
          asRegistry({}),
        ),
      ).rejects.toThrow("No operations in automation");
    });

    test("throws when an object lacks an operations array", async () => {
      // Object with a name but no operations hits the guard clause.
      await expect(
        executeAutomationSequence(
          { name: "NoOps" },
          [makeFile("a.pdf")],
          asRegistry({}),
        ),
      ).rejects.toThrow("No operations in automation");
    });

    test("runs each step, threads files forward, fires callbacks, and prefixes only the final step", async () => {
      mockedPost.mockResolvedValue({ data: zipBlob(), headers: {} });
      const step1Out = [makeFile("first_step1.pdf")];
      const step2Out = [makeFile("first_step2.pdf")];
      mockedExtractZip
        .mockResolvedValueOnce({ files: step1Out, errors: [], success: true })
        .mockResolvedValueOnce({ files: step2Out, errors: [], success: true });

      const buildFormData = vi.fn(() => new FormData());
      const registry = asRegistry({
        rotate: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/rotate",
            buildFormData,
          },
        },
        compress: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/compress",
            buildFormData,
          },
        },
      });

      const onStepStart = vi.fn();
      const onStepComplete = vi.fn();
      const onStepError = vi.fn();

      const automation = {
        name: "MyFlow",
        operations: [
          { operation: "rotate", parameters: { angle: 90 } },
          { operation: "compress" }, // no parameters => defaults to {}
        ],
      };
      const initial = [makeFile("in.pdf")];

      const result = await executeAutomationSequence(
        automation,
        initial,
        registry,
        onStepStart,
        onStepComplete,
        onStepError,
      );

      // Callbacks invoked per step with correct indices.
      expect(onStepStart).toHaveBeenNthCalledWith(1, 0, "rotate");
      expect(onStepStart).toHaveBeenNthCalledWith(2, 1, "compress");
      expect(onStepComplete).toHaveBeenNthCalledWith(1, 0, step1Out);
      expect(onStepComplete).toHaveBeenNthCalledWith(2, 1, step2Out);
      expect(onStepError).not.toHaveBeenCalled();

      // Step 2 received the output of step 1 (files threaded forward).
      expect(buildFormData).toHaveBeenNthCalledWith(2, {}, step1Out);

      // Non-final step uses empty prefix; final step uses "<name>_".
      // step1 had no prefix applied (empty prefix -> verbatim name).
      expect(step1Out[0].name).toBe("first_step1.pdf");
      // step2 (final) gets "MyFlow_" applied, replacing the leading segment.
      // The prefix branch creates new File objects, so compare by name.
      expect(result.map((f) => f.name)).toEqual(["MyFlow_step2.pdf"]);
      expect(result).toHaveLength(1);
    });

    test("uses 'automated_' prefix on the final step when the automation has no name", async () => {
      mockedPost.mockResolvedValue({ data: zipBlob(), headers: {} });
      mockedExtractZip.mockResolvedValue({
        files: [makeFile("seg_final.pdf")],
        errors: [],
        success: true,
      });

      const registry = asRegistry({
        rotate: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/rotate",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const result = await executeAutomationSequence(
        { operations: [{ operation: "rotate", parameters: {} }] },
        [makeFile("in.pdf")],
        registry,
      );

      expect(result.map((f) => f.name)).toEqual(["automated_final.pdf"]);
    });

    test("propagates step errors and reports them via onStepError", async () => {
      mockedPost.mockRejectedValue(new Error("boom"));

      const registry = asRegistry({
        rotate: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/rotate",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const onStepError = vi.fn();
      const onStepComplete = vi.fn();

      await expect(
        executeAutomationSequence(
          {
            name: "Flow",
            operations: [{ operation: "rotate", parameters: {} }],
          },
          [makeFile("in.pdf")],
          registry,
          undefined,
          onStepComplete,
          onStepError,
        ),
      ).rejects.toThrow("rotate operation failed: boom");

      expect(onStepError).toHaveBeenCalledWith(
        0,
        "rotate operation failed: boom",
      );
      expect(onStepComplete).not.toHaveBeenCalled();
    });

    test("works without optional callbacks (no throw on undefined hooks)", async () => {
      mockedPost.mockResolvedValue({ data: zipBlob(), headers: {} });
      mockedExtractZip.mockResolvedValue({
        files: [makeFile("done.pdf")],
        errors: [],
        success: true,
      });

      const registry = asRegistry({
        rotate: {
          operationConfig: {
            toolType: ToolType.multiFile,
            endpoint: "/api/v1/rotate",
            buildFormData: vi.fn(() => new FormData()),
          },
        },
      });

      const result = await executeAutomationSequence(
        { name: "NoCallbacks", operations: [{ operation: "rotate" }] },
        [makeFile("in.pdf")],
        registry,
      );

      expect(result).toHaveLength(1);
    });
  });
});
