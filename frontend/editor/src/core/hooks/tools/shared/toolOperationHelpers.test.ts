/**
 * Unit tests for toolOperationHelpers.
 *
 * buildInputTracking() and buildOutputPairs() are pure array builders that take
 * injected selectors / factory functions. They have no I/O, so the only "external"
 * dependency exercised here is the imported `createStirlingFile` / `createNewStirlingFileStub`
 * from the fileContext types module (pure functions) plus a console.warn fallback,
 * which is spied on for determinism. No network / storage / Tauri mocking is needed.
 */

import { describe, test, expect, vi, afterEach } from "vitest";
import {
  buildInputTracking,
  buildOutputPairs,
} from "@app/hooks/tools/shared/toolOperationHelpers";
import {
  StirlingFile,
  StirlingFileStub,
  FileId,
  ProcessedFileMetadata,
  createStirlingFile,
  isStirlingFile,
} from "@app/types/fileContext";

/**
 * Build a StirlingFile whose embedded fileId is deterministic, so assertions can
 * reference the id directly rather than a randomly generated one.
 */
function makeStirlingFile(
  name: string,
  id: string,
  content = "test content",
): StirlingFile {
  const file = new File([content], name, { type: "application/pdf" });
  return createStirlingFile(file, id as FileId);
}

/**
 * Minimal StirlingFileStub for selector return values. Only the identity fields
 * matter for these tests; everything else is a deterministic placeholder.
 */
function makeStub(id: string, name = `${id}.pdf`): StirlingFileStub {
  return {
    id: id as FileId,
    name,
    type: "application/pdf",
    size: 123,
    lastModified: 0,
    originalFileId: id,
    isLeaf: true,
    versionNumber: 1,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toolOperationHelpers", () => {
  describe("buildInputTracking", () => {
    test("returns empty parallel arrays for an empty input list", () => {
      const getStirlingFileStub = vi.fn();

      const result = buildInputTracking([], { getStirlingFileStub });

      expect(result.inputFileIds).toEqual([]);
      expect(result.inputStirlingFileStubs).toEqual([]);
      expect(getStirlingFileStub).not.toHaveBeenCalled();
    });

    test("uses the stub returned by the selector when one is found", () => {
      const fileA = makeStirlingFile("a.pdf", "id-a");
      const stubA = makeStub("id-a");
      const getStirlingFileStub = vi.fn((id: FileId) =>
        id === ("id-a" as FileId) ? stubA : undefined,
      );

      const result = buildInputTracking([fileA], { getStirlingFileStub });

      expect(getStirlingFileStub).toHaveBeenCalledTimes(1);
      expect(getStirlingFileStub).toHaveBeenCalledWith("id-a" as FileId);
      expect(result.inputFileIds).toEqual(["id-a"]);
      // The exact stub object reference is preserved, not a copy.
      expect(result.inputStirlingFileStubs).toEqual([stubA]);
      expect(result.inputStirlingFileStubs[0]).toBe(stubA);
    });

    test("preserves input order and parallel index alignment across multiple files", () => {
      const fileA = makeStirlingFile("a.pdf", "id-a");
      const fileB = makeStirlingFile("b.pdf", "id-b");
      const fileC = makeStirlingFile("c.pdf", "id-c");
      const stubs: Record<string, StirlingFileStub> = {
        "id-a": makeStub("id-a"),
        "id-b": makeStub("id-b"),
        "id-c": makeStub("id-c"),
      };
      const getStirlingFileStub = vi.fn((id: FileId) => stubs[id]);

      const result = buildInputTracking([fileA, fileB, fileC], {
        getStirlingFileStub,
      });

      expect(result.inputFileIds).toEqual(["id-a", "id-b", "id-c"]);
      // Stub at each index corresponds to the file at that same index.
      expect(result.inputStirlingFileStubs.map((s) => s.id)).toEqual([
        "id-a",
        "id-b",
        "id-c",
      ]);
      // The two parallel arrays have matching lengths.
      expect(result.inputFileIds).toHaveLength(
        result.inputStirlingFileStubs.length,
      );
    });

    test("falls back to a fresh stub and warns when the selector returns undefined", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const fileMissing = makeStirlingFile("missing.pdf", "id-missing");
      const getStirlingFileStub = vi.fn(() => undefined);

      const result = buildInputTracking([fileMissing], { getStirlingFileStub });

      // The fileId still gets tracked even on the fallback path.
      expect(result.inputFileIds).toEqual(["id-missing"]);
      // A fresh stub is synthesized from the file, carrying its fileId as the stub id.
      expect(result.inputStirlingFileStubs).toHaveLength(1);
      const stub = result.inputStirlingFileStubs[0];
      expect(stub.id).toBe("id-missing");
      expect(stub.name).toBe("missing.pdf");
      expect(stub.type).toBe("application/pdf");
      expect(stub.isLeaf).toBe(true);
      expect(stub.versionNumber).toBe(1);
      // The fallback object is brand new, not any selector-provided reference.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "No file stub found for file: missing.pdf",
      );
    });

    test("mixes found and fallback files while keeping ids aligned by index", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const found = makeStirlingFile("found.pdf", "id-found");
      const missing = makeStirlingFile("gone.pdf", "id-gone");
      const knownStub = makeStub("id-found");
      const getStirlingFileStub = vi.fn((id: FileId) =>
        id === ("id-found" as FileId) ? knownStub : undefined,
      );

      const result = buildInputTracking([found, missing], {
        getStirlingFileStub,
      });

      expect(result.inputFileIds).toEqual(["id-found", "id-gone"]);
      // Index 0 = the existing stub object; index 1 = the synthesized fallback.
      expect(result.inputStirlingFileStubs[0]).toBe(knownStub);
      expect(result.inputStirlingFileStubs[1]).not.toBe(knownStub);
      expect(result.inputStirlingFileStubs[1].id).toBe("id-gone");
      // Only the missing file triggers a warning.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "No file stub found for file: gone.pdf",
      );
    });

    test("does not mutate the input file array", () => {
      const fileA = makeStirlingFile("a.pdf", "id-a");
      const input = [fileA];
      const getStirlingFileStub = vi.fn(() => makeStub("id-a"));

      buildInputTracking(input, { getStirlingFileStub });

      expect(input).toEqual([fileA]);
      expect(input[0]).toBe(fileA);
    });
  });

  describe("buildOutputPairs", () => {
    test("returns empty arrays and never calls the factory for empty input", () => {
      const stubFactory = vi.fn();

      const result = buildOutputPairs([], [], [], stubFactory);

      expect(result.outputStirlingFileStubs).toEqual([]);
      expect(result.outputStirlingFiles).toEqual([]);
      expect(stubFactory).not.toHaveBeenCalled();
    });

    test("invokes the factory once per file with the aligned thumbnail, metadata and index", () => {
      const file0 = new File(["a"], "out0.pdf", { type: "application/pdf" });
      const file1 = new File(["b"], "out1.pdf", { type: "application/pdf" });
      const thumbnails = ["thumb0", "thumb1"];
      const meta0: ProcessedFileMetadata = { pages: [], totalPages: 1 };
      const meta1: ProcessedFileMetadata = { pages: [], totalPages: 2 };
      const metadataArray = [meta0, meta1];

      const stubFactory = vi.fn(
        (
          file: File,
          _thumb: string,
          _meta: ProcessedFileMetadata | undefined,
          index: number,
        ) => makeStub(`out-${index}`, file.name),
      );

      buildOutputPairs([file0, file1], thumbnails, metadataArray, stubFactory);

      expect(stubFactory).toHaveBeenCalledTimes(2);
      expect(stubFactory).toHaveBeenNthCalledWith(1, file0, "thumb0", meta0, 0);
      expect(stubFactory).toHaveBeenNthCalledWith(2, file1, "thumb1", meta1, 1);
    });

    test("builds StirlingFiles whose fileId equals the matching stub id", () => {
      const file0 = new File(["a"], "out0.pdf", { type: "application/pdf" });
      const file1 = new File(["b"], "out1.pdf", { type: "application/pdf" });

      const stubFactory = vi.fn(
        (file: File, _thumb: string, _meta, index: number) =>
          makeStub(`stub-${index}`, file.name),
      );

      const result = buildOutputPairs(
        [file0, file1],
        ["t0", "t1"],
        [undefined, undefined],
        stubFactory,
      );

      expect(result.outputStirlingFileStubs.map((s) => s.id)).toEqual([
        "stub-0",
        "stub-1",
      ]);
      // Each output StirlingFile carries the id of the stub at the same index.
      expect(result.outputStirlingFiles).toHaveLength(2);
      expect(result.outputStirlingFiles.every(isStirlingFile)).toBe(true);
      expect(result.outputStirlingFiles.map((f) => f.fileId)).toEqual([
        "stub-0",
        "stub-1",
      ]);
      // Names are preserved through createStirlingFile.
      expect(result.outputStirlingFiles.map((f) => f.name)).toEqual([
        "out0.pdf",
        "out1.pdf",
      ]);
    });

    test("passes undefined to the factory when thumbnail or metadata index is absent", () => {
      const file0 = new File(["a"], "out0.pdf", { type: "application/pdf" });
      // thumbnails / metadataArray shorter than processedFiles -> out-of-range reads.
      const stubFactory = vi.fn((file: File, _thumb, _meta, index: number) =>
        makeStub(`s-${index}`, file.name),
      );

      buildOutputPairs([file0], [], [], stubFactory);

      expect(stubFactory).toHaveBeenCalledTimes(1);
      expect(stubFactory).toHaveBeenCalledWith(file0, undefined, undefined, 0);
    });

    test("propagates errors thrown by the stub factory", () => {
      const file0 = new File(["a"], "boom.pdf", { type: "application/pdf" });
      const stubFactory = vi.fn(() => {
        throw new Error("factory failure");
      });

      expect(() =>
        buildOutputPairs([file0], ["t"], [undefined], stubFactory),
      ).toThrow("factory failure");
    });

    test("does not mutate the processedFiles input array", () => {
      const file0 = new File(["a"], "out0.pdf", { type: "application/pdf" });
      const input = [file0];
      const stubFactory = vi.fn((file: File, _thumb, _meta, index: number) =>
        makeStub(`s-${index}`, file.name),
      );

      buildOutputPairs(input, ["t"], [undefined], stubFactory);

      expect(input).toEqual([file0]);
      expect(input[0]).toBe(file0);
    });
  });
});
