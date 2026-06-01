/**
 * Unit tests for FileHasher (fileHash.ts).
 *
 * Determinism notes:
 * - `crypto.subtle.digest` is mocked in setupTests.ts to always resolve to a
 *   fixed 32-byte buffer containing bytes 0..31, so any content/hybrid hash that
 *   reaches the Web Crypto path produces a known hex string.
 * - We never use real File slicing; instead each test builds a fully controlled
 *   fake File whose `slice`/`arrayBuffer` are deterministic, which also lets us
 *   assert the exact slice offsets the hasher requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileHasher } from "@app/utils/fileHash";

const CHUNK_SIZE = 64 * 1024; // mirrors FileHasher.CHUNK_SIZE

// Hex string produced by the mocked crypto.subtle.digest (bytes 0..31).
const MOCK_DIGEST_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

interface SliceCall {
  start?: number;
  end?: number;
}

/**
 * Build a fully controlled fake File. The returned object records every
 * `slice()` call and returns a fake Blob whose `arrayBuffer()` yields a buffer
 * of exactly the requested byte length, so combineChunks math stays exact.
 */
function makeFile(
  opts: {
    name?: string;
    size?: number;
    lastModified?: number;
    type?: string;
  } = {},
): { file: File; sliceCalls: SliceCall[] } {
  const {
    name = "doc.pdf",
    size = 100,
    lastModified = 1700000000000,
    type = "application/pdf",
  } = opts;

  const sliceCalls: SliceCall[] = [];

  const slice = (start?: number, end?: number) => {
    sliceCalls.push({ start, end });
    const realStart = start ?? 0;
    const realEnd = end ?? size;
    const length = Math.max(0, realEnd - realStart);
    return {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(length)),
    } as unknown as Blob;
  };

  const file = {
    name,
    size,
    lastModified,
    type,
    slice,
    // Used by generateContentHash on the first chunk path of small files.
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(Math.min(size, 8))),
  } as unknown as File;

  return { file, sliceCalls };
}

describe("FileHasher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateMetadataHash", () => {
    it("is deterministic for identical metadata", () => {
      const a = makeFile({
        name: "report.pdf",
        size: 2048,
        lastModified: 1700000000000,
        type: "application/pdf",
      }).file;
      const b = makeFile({
        name: "report.pdf",
        size: 2048,
        lastModified: 1700000000000,
        type: "application/pdf",
      }).file;

      expect(FileHasher.generateMetadataHash(a)).toBe(
        FileHasher.generateMetadataHash(b),
      );
    });

    it("produces the exact known hash for a fixed input", () => {
      const file = makeFile({
        name: "report.pdf",
        size: 2048,
        lastModified: 1700000000000,
        type: "application/pdf",
      }).file;

      // simpleHash("report.pdf-2048-1700000000000-application/pdf")
      expect(FileHasher.generateMetadataHash(file)).toBe("5e914a66");
    });

    it("changes when any single metadata field changes", () => {
      const base = makeFile({
        name: "a.pdf",
        size: 10,
        lastModified: 1,
        type: "application/pdf",
      }).file;
      const baseHash = FileHasher.generateMetadataHash(base);

      const diffName = FileHasher.generateMetadataHash(
        makeFile({ name: "b.pdf", size: 10, lastModified: 1 }).file,
      );
      const diffSize = FileHasher.generateMetadataHash(
        makeFile({ name: "a.pdf", size: 11, lastModified: 1 }).file,
      );
      const diffModified = FileHasher.generateMetadataHash(
        makeFile({ name: "a.pdf", size: 10, lastModified: 2 }).file,
      );
      const diffType = FileHasher.generateMetadataHash(
        makeFile({
          name: "a.pdf",
          size: 10,
          lastModified: 1,
          type: "text/plain",
        }).file,
      );

      expect(diffName).not.toBe(baseHash);
      expect(diffSize).not.toBe(baseHash);
      expect(diffModified).not.toBe(baseHash);
      expect(diffType).not.toBe(baseHash);
    });

    it("returns a lowercase hex string (base-16, no negative sign)", () => {
      const hash = FileHasher.generateMetadataHash(makeFile().file);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("generateContentHash", () => {
    it("hashes a single first chunk for a small file (size <= CHUNK_SIZE)", async () => {
      const { file, sliceCalls } = makeFile({ size: 100 });

      const hash = await FileHasher.generateContentHash(file);

      expect(hash).toBe(MOCK_DIGEST_HEX);
      // Only the first chunk is read for a small file.
      expect(sliceCalls).toEqual([{ start: 0, end: 100 }]);
      expect(crypto.subtle.digest).toHaveBeenCalledTimes(1);
    });

    it("returns an empty-content hash unchanged for a zero-byte file", async () => {
      const { file, sliceCalls } = makeFile({ size: 0 });

      const hash = await FileHasher.generateContentHash(file);

      // No chunks are read; combined buffer is empty but still hashed.
      expect(sliceCalls).toEqual([]);
      expect(hash).toBe(MOCK_DIGEST_HEX);
    });

    it("reads first + last chunks for a medium file (> CHUNK_SIZE, <= 2*CHUNK_SIZE)", async () => {
      const size = CHUNK_SIZE + 1000; // between 1x and 2x chunk size
      const { file, sliceCalls } = makeFile({ size });

      await FileHasher.generateContentHash(file);

      // First chunk [0, CHUNK_SIZE]; no middle chunk; last chunk from
      // max(size - CHUNK_SIZE, CHUNK_SIZE) to end.
      expect(sliceCalls).toEqual([
        { start: 0, end: CHUNK_SIZE },
        { start: CHUNK_SIZE, end: undefined },
      ]);
    });

    it("reads first + middle + last chunks for a large file (> 2*CHUNK_SIZE)", async () => {
      const size = CHUNK_SIZE * 4;
      const { file, sliceCalls } = makeFile({ size });

      await FileHasher.generateContentHash(file);

      const middleStart = Math.floor(size / 2) - Math.floor(CHUNK_SIZE / 2);
      const middleEnd = middleStart + CHUNK_SIZE;
      const lastStart = Math.max(size - CHUNK_SIZE, CHUNK_SIZE);

      expect(sliceCalls).toEqual([
        { start: 0, end: CHUNK_SIZE }, // first
        { start: middleStart, end: middleEnd }, // middle
        { start: lastStart, end: undefined }, // last
      ]);
    });

    it("combines all chunk bytes into the buffer passed to digest", async () => {
      const size = CHUNK_SIZE * 4;
      const { file } = makeFile({ size });

      await FileHasher.generateContentHash(file);

      const digestArg = (crypto.subtle.digest as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as ArrayBuffer;
      // first(CHUNK_SIZE) + middle(CHUNK_SIZE) + last(CHUNK_SIZE) = 3 chunks.
      expect(digestArg.byteLength).toBe(CHUNK_SIZE * 3);
    });
  });

  describe("generateHybridHash", () => {
    it("combines metadata + full content hash for small files (<= 1MB)", async () => {
      const { file, sliceCalls } = makeFile({
        name: "small.pdf",
        size: 500,
        lastModified: 123,
        type: "application/pdf",
      });
      const expectedMeta = FileHasher.generateMetadataHash(file);

      const hash = await FileHasher.generateHybridHash(file);

      expect(hash).toBe(`${expectedMeta}-${MOCK_DIGEST_HEX}`);
      // Small-file branch goes through generateContentHash -> getFileChunks.
      expect(sliceCalls).toEqual([{ start: 0, end: 500 }]);
    });

    it("uses metadata + first-chunk hash for large files (> 1MB)", async () => {
      const size = 2 * 1024 * 1024; // 2MB -> large path
      const { file, sliceCalls } = makeFile({
        name: "big.pdf",
        size,
        lastModified: 999,
      });
      const expectedMeta = FileHasher.generateMetadataHash(file);

      const hash = await FileHasher.generateHybridHash(file);

      expect(hash).toBe(`${expectedMeta}-${MOCK_DIGEST_HEX}`);
      // Large-file branch slices exactly one first chunk of CHUNK_SIZE.
      expect(sliceCalls).toEqual([{ start: 0, end: CHUNK_SIZE }]);
      expect(crypto.subtle.digest).toHaveBeenCalledTimes(1);
    });

    it("treats the 1MB boundary (exactly 1MB) as a small file", async () => {
      const size = 1024 * 1024; // exactly 1MB, condition is <= 1MB
      const { file, sliceCalls } = makeFile({ size });

      await FileHasher.generateHybridHash(file);

      // Small path: getFileChunks reads first + middle + last for a >2*CHUNK file.
      const middleStart = Math.floor(size / 2) - Math.floor(CHUNK_SIZE / 2);
      const lastStart = Math.max(size - CHUNK_SIZE, CHUNK_SIZE);
      expect(sliceCalls).toEqual([
        { start: 0, end: CHUNK_SIZE },
        { start: middleStart, end: middleStart + CHUNK_SIZE },
        { start: lastStart, end: undefined },
      ]);
    });
  });

  describe("validateFileHash", () => {
    it("returns true when the recomputed hybrid hash matches", async () => {
      const { file } = makeFile({ size: 500 });
      const expected = await FileHasher.generateHybridHash(file);

      await expect(FileHasher.validateFileHash(file, expected)).resolves.toBe(
        true,
      );
    });

    it("returns false when the expected hash does not match", async () => {
      const { file } = makeFile({ size: 500 });

      await expect(
        FileHasher.validateFileHash(file, "definitely-not-the-hash"),
      ).resolves.toBe(false);
    });

    it("returns false and logs when hashing throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const failing = {
        name: "x.pdf",
        size: 10,
        lastModified: 1,
        type: "application/pdf",
        slice: () => {
          throw new Error("boom");
        },
      } as unknown as File;

      await expect(
        FileHasher.validateFileHash(failing, "anything"),
      ).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "Hash validation failed:",
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });
  });

  describe("crypto.subtle fallback", () => {
    const originalCrypto = globalThis.crypto;

    afterEach(() => {
      Object.defineProperty(globalThis, "crypto", {
        value: originalCrypto,
        writable: true,
        configurable: true,
      });
    });

    it("falls back to simpleHash when crypto.subtle is unavailable", async () => {
      // Remove subtle to exercise the non-WebCrypto branch in hashArrayBuffer.
      Object.defineProperty(globalThis, "crypto", {
        value: {},
        writable: true,
        configurable: true,
      });

      const { file } = makeFile({ size: 100 });
      const hash = await FileHasher.generateContentHash(file);

      // simpleHash over the joined bytes; for an all-zero 100-byte buffer the
      // joined string is "0,0,...,0", which is non-empty and hashes to a hex
      // string (not the 32-byte web-crypto digest).
      expect(hash).not.toBe(MOCK_DIGEST_HEX);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });
});
