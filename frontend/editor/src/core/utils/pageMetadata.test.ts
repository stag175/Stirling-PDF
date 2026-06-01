/**
 * Unit tests for pageMetadata getters.
 *
 * These are pure, null-safe getters over plain metadata objects, so the tests
 * are fully deterministic: fixed input -> fixed output, with a focus on the
 * null/zero/missing-value edge cases that each branch handles.
 */

import { describe, it, expect } from "vitest";
import {
  getPageDimensions,
  getFirstPageDimensionsFromMetadata,
  getFirstPageDimensionsFromStub,
  getFirstPageAspectRatioFromMetadata,
  getFirstPageAspectRatioFromStub,
} from "@app/utils/pageMetadata";
import type {
  ProcessedFilePage,
  ProcessedFileMetadata,
  StirlingFileStub,
} from "@app/types/fileContext";

// Helper factories keep the intent of each test explicit while satisfying the
// (loosely typed) source interfaces.
const page = (overrides: Partial<ProcessedFilePage> = {}): ProcessedFilePage =>
  ({ ...overrides }) as ProcessedFilePage;

const metadata = (pages: ProcessedFilePage[]): ProcessedFileMetadata =>
  ({ pages }) as ProcessedFileMetadata;

const stub = (processedFile?: ProcessedFileMetadata): StirlingFileStub =>
  ({ processedFile }) as unknown as StirlingFileStub;

describe("pageMetadata", () => {
  describe("getPageDimensions", () => {
    it("returns positive width/height as-is", () => {
      expect(getPageDimensions(page({ width: 612, height: 792 }))).toEqual({
        width: 612,
        height: 792,
      });
    });

    it("preserves fractional positive values", () => {
      expect(getPageDimensions(page({ width: 595.5, height: 842.25 }))).toEqual(
        {
          width: 595.5,
          height: 842.25,
        },
      );
    });

    it("coerces zero dimensions to null", () => {
      expect(getPageDimensions(page({ width: 0, height: 0 }))).toEqual({
        width: null,
        height: null,
      });
    });

    it("coerces negative dimensions to null", () => {
      expect(getPageDimensions(page({ width: -10, height: -5 }))).toEqual({
        width: null,
        height: null,
      });
    });

    it("treats each dimension independently", () => {
      expect(getPageDimensions(page({ width: 100, height: 0 }))).toEqual({
        width: 100,
        height: null,
      });
      expect(getPageDimensions(page({ width: 0, height: 200 }))).toEqual({
        width: null,
        height: 200,
      });
    });

    it("coerces missing (undefined) dimensions to null", () => {
      expect(getPageDimensions(page({}))).toEqual({
        width: null,
        height: null,
      });
    });

    it("coerces non-number dimensions to null", () => {
      // The interface allows arbitrary keys, so guard against bad runtime data.
      const bad = {
        width: "612",
        height: null,
      } as unknown as ProcessedFilePage;
      expect(getPageDimensions(bad)).toEqual({ width: null, height: null });
    });

    it("returns null/null when page is undefined", () => {
      expect(getPageDimensions(undefined)).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns null/null when page is null", () => {
      expect(getPageDimensions(null)).toEqual({ width: null, height: null });
    });
  });

  describe("getFirstPageDimensionsFromMetadata", () => {
    it("returns dimensions of the first page only", () => {
      const meta = metadata([
        page({ width: 100, height: 200 }),
        page({ width: 999, height: 999 }),
      ]);
      expect(getFirstPageDimensionsFromMetadata(meta)).toEqual({
        width: 100,
        height: 200,
      });
    });

    it("applies the zero/negative coercion to the first page", () => {
      const meta = metadata([page({ width: 0, height: -3 })]);
      expect(getFirstPageDimensionsFromMetadata(meta)).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns null/null when there are no pages", () => {
      expect(getFirstPageDimensionsFromMetadata(metadata([]))).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns null/null when metadata is undefined", () => {
      expect(getFirstPageDimensionsFromMetadata(undefined)).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns null/null when metadata is null", () => {
      expect(getFirstPageDimensionsFromMetadata(null)).toEqual({
        width: null,
        height: null,
      });
    });
  });

  describe("getFirstPageDimensionsFromStub", () => {
    it("reads through stub.processedFile", () => {
      const file = stub(metadata([page({ width: 300, height: 400 })]));
      expect(getFirstPageDimensionsFromStub(file)).toEqual({
        width: 300,
        height: 400,
      });
    });

    it("returns null/null when stub has no processedFile", () => {
      expect(getFirstPageDimensionsFromStub(stub(undefined))).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns null/null when stub is undefined", () => {
      expect(getFirstPageDimensionsFromStub(undefined)).toEqual({
        width: null,
        height: null,
      });
    });
  });

  describe("getFirstPageAspectRatioFromMetadata", () => {
    it("computes height / width for valid dimensions", () => {
      const meta = metadata([page({ width: 100, height: 200 })]);
      expect(getFirstPageAspectRatioFromMetadata(meta)).toBe(2);
    });

    it("computes fractional ratios", () => {
      const meta = metadata([page({ width: 200, height: 100 })]);
      expect(getFirstPageAspectRatioFromMetadata(meta)).toBe(0.5);
    });

    it("returns null when width is missing/zero", () => {
      const meta = metadata([page({ width: 0, height: 200 })]);
      expect(getFirstPageAspectRatioFromMetadata(meta)).toBeNull();
    });

    it("returns null when height is missing/zero", () => {
      const meta = metadata([page({ width: 200, height: 0 })]);
      expect(getFirstPageAspectRatioFromMetadata(meta)).toBeNull();
    });

    it("returns null when there are no pages", () => {
      expect(getFirstPageAspectRatioFromMetadata(metadata([]))).toBeNull();
    });

    it("returns null when metadata is null/undefined", () => {
      expect(getFirstPageAspectRatioFromMetadata(null)).toBeNull();
      expect(getFirstPageAspectRatioFromMetadata(undefined)).toBeNull();
    });
  });

  describe("getFirstPageAspectRatioFromStub", () => {
    it("computes the aspect ratio through stub.processedFile", () => {
      const file = stub(metadata([page({ width: 400, height: 300 })]));
      expect(getFirstPageAspectRatioFromStub(file)).toBe(0.75);
    });

    it("returns null when stub has no processedFile", () => {
      expect(getFirstPageAspectRatioFromStub(stub(undefined))).toBeNull();
    });

    it("returns null when stub is undefined", () => {
      expect(getFirstPageAspectRatioFromStub(undefined)).toBeNull();
    });
  });
});
