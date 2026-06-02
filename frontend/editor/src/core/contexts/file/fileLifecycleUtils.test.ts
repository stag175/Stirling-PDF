import { describe, it, expect } from "vitest";

import {
  BLOB_URL_PREFIX,
  isRevocableBlobUrl,
  collectRevocableBlobUrls,
} from "@app/contexts/file/fileLifecycleUtils";
import {
  StirlingFileStub,
  ProcessedFilePage,
} from "@app/types/fileContext";
import { FileId } from "@app/types/file";

/**
 * Unit tests for the *pure* file-lifecycle decision helpers. These functions
 * never touch URL.revokeObjectURL — they only decide which blob URLs are
 * eligible for revocation — so the tests need no DOM mocks, fake timers, or
 * React tree. They simply assert the returned list for a given record shape.
 */

const id = (s: string): FileId => s as FileId;

function makeStub(
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: id("a"),
    name: "a.pdf",
    type: "application/pdf",
    size: 1024,
    lastModified: 1000,
    createdAt: 2000,
    isLeaf: true,
    originalFileId: id("a"),
    versionNumber: 1,
    ...overrides,
  };
}

describe("isRevocableBlobUrl", () => {
  it("accepts blob: URLs", () => {
    expect(isRevocableBlobUrl("blob:http://localhost/abc")).toBe(true);
    expect(isRevocableBlobUrl(`${BLOB_URL_PREFIX}x`)).toBe(true);
  });

  it("rejects other schemes", () => {
    expect(isRevocableBlobUrl("https://cdn/x.pdf")).toBe(false);
    expect(isRevocableBlobUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isRevocableBlobUrl("file:///tmp/x.pdf")).toBe(false);
    expect(isRevocableBlobUrl("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isRevocableBlobUrl(undefined)).toBe(false);
    expect(isRevocableBlobUrl(null)).toBe(false);
    expect(isRevocableBlobUrl(123)).toBe(false);
    expect(isRevocableBlobUrl({})).toBe(false);
  });

  it("does NOT match a string that merely contains blob: later", () => {
    // startsWith semantics: the scheme must be at the very start.
    expect(isRevocableBlobUrl("https://x/blob:y")).toBe(false);
  });
});

describe("collectRevocableBlobUrls", () => {
  it("returns an empty array for null/undefined records", () => {
    expect(collectRevocableBlobUrls(null)).toEqual([]);
    expect(collectRevocableBlobUrls(undefined)).toEqual([]);
  });

  it("returns an empty array when the record has no URLs", () => {
    expect(collectRevocableBlobUrls(makeStub())).toEqual([]);
  });

  it("collects thumbnailUrl and blobUrl in field order", () => {
    const stub = makeStub({
      thumbnailUrl: "blob:thumb-a",
      blobUrl: "blob:main-a",
    });
    expect(collectRevocableBlobUrls(stub)).toEqual([
      "blob:thumb-a",
      "blob:main-a",
    ]);
  });

  it("skips non-blob thumbnailUrl and blobUrl schemes", () => {
    const stub = makeStub({
      thumbnailUrl: "data:image/png;base64,AAAA",
      blobUrl: "https://cdn/x.pdf",
    });
    expect(collectRevocableBlobUrls(stub)).toEqual([]);
  });

  it("collects processed-page thumbnails in page order, skipping non-blob and missing", () => {
    const pages: ProcessedFilePage[] = [
      { thumbnail: "blob:page-1" },
      { thumbnail: "https://not-a-blob/page-2" },
      { thumbnail: "blob:page-3" },
      {}, // no thumbnail at all
    ];
    const stub = makeStub({
      blobUrl: "blob:main-a",
      thumbnailUrl: "blob:thumb-a",
      processedFile: { pages },
    });

    expect(collectRevocableBlobUrls(stub)).toEqual([
      "blob:thumb-a",
      "blob:main-a",
      "blob:page-1",
      "blob:page-3",
    ]);
  });

  it("handles a record without a processedFile", () => {
    const stub = makeStub({ blobUrl: "blob:main-a" });
    expect(collectRevocableBlobUrls(stub)).toEqual(["blob:main-a"]);
  });

  it("handles a processedFile with an empty pages array", () => {
    const stub = makeStub({
      thumbnailUrl: "blob:thumb-a",
      processedFile: { pages: [] },
    });
    expect(collectRevocableBlobUrls(stub)).toEqual(["blob:thumb-a"]);
  });

  it("de-duplicates a URL referenced by multiple fields", () => {
    // The same object URL used as both the thumbnail and a page thumbnail must
    // only be returned once, so the caller revokes it a single time.
    const stub = makeStub({
      thumbnailUrl: "blob:shared",
      blobUrl: "blob:shared",
      processedFile: { pages: [{ thumbnail: "blob:shared" }] },
    });
    expect(collectRevocableBlobUrls(stub)).toEqual(["blob:shared"]);
  });

  it("de-duplicates repeated page thumbnails while preserving first-seen order", () => {
    const stub = makeStub({
      processedFile: {
        pages: [
          { thumbnail: "blob:p1" },
          { thumbnail: "blob:p2" },
          { thumbnail: "blob:p1" }, // duplicate of the first
        ],
      },
    });
    expect(collectRevocableBlobUrls(stub)).toEqual(["blob:p1", "blob:p2"]);
  });

  it("tolerates null/undefined entries inside the pages array", () => {
    const pages = [
      { thumbnail: "blob:p1" },
      null,
      undefined,
      { thumbnail: "blob:p2" },
    ] as unknown as ProcessedFilePage[];
    const stub = makeStub({ processedFile: { pages } });
    expect(collectRevocableBlobUrls(stub)).toEqual(["blob:p1", "blob:p2"]);
  });

  it("does not mutate the input record", () => {
    const pages: ProcessedFilePage[] = [{ thumbnail: "blob:p1" }];
    const stub = makeStub({
      thumbnailUrl: "blob:thumb-a",
      processedFile: { pages },
    });
    const snapshot = JSON.stringify(stub);
    collectRevocableBlobUrls(stub);
    expect(JSON.stringify(stub)).toBe(snapshot);
    expect(stub.processedFile?.pages).toHaveLength(1);
  });

  it("accepts a structurally-minimal record (Pick subset)", () => {
    // The function only requires thumbnailUrl/blobUrl/processedFile, matching
    // its Pick<> parameter type — a partial object is sufficient.
    const minimal = { blobUrl: "blob:only" };
    expect(collectRevocableBlobUrls(minimal)).toEqual(["blob:only"]);
  });
});
