import { describe, expect, test } from "vitest";
import JSZip from "jszip";

import type { ShareBundleManifest } from "@app/services/serverStorageBundle";
import {
  extractLatestFilesFromBundle,
  getShareBundleEntryRootId,
  isZipBundle,
  loadShareBundleEntries,
  parseContentDispositionFilename,
  resolveShareBundleOrder,
} from "@app/services/shareBundleUtils";

const MANIFEST_FILENAME = "stirling-share.json";

type ManifestEntry = ShareBundleManifest["entries"][number];

/**
 * Build a minimal manifest entry. Only the fields the utilities read
 * (rootLogicalId, versionNumber, filePath, name, type, lastModified) carry
 * meaning here; the rest are filled with deterministic placeholder values so
 * the object satisfies the ShareBundleEntry shape.
 */
function makeEntry(overrides: Partial<ManifestEntry>): ManifestEntry {
  return {
    logicalId: overrides.logicalId ?? "logical-0",
    rootLogicalId: overrides.rootLogicalId ?? "root-0",
    parentLogicalId: overrides.parentLogicalId,
    versionNumber: overrides.versionNumber ?? 1,
    name: overrides.name ?? "file.pdf",
    type: overrides.type ?? "application/pdf",
    size: overrides.size ?? 0,
    lastModified: overrides.lastModified ?? 0,
    toolHistory: overrides.toolHistory,
    filePath: overrides.filePath ?? "files/logical-0/file.pdf",
    isLeaf: overrides.isLeaf ?? true,
  };
}

function makeManifest(
  overrides: Partial<ShareBundleManifest>,
): ShareBundleManifest {
  return {
    schemaVersion: 1,
    rootLogicalId: overrides.rootLogicalId ?? "root-0",
    rootLogicalIds: overrides.rootLogicalIds ?? [],
    createdAt: overrides.createdAt ?? 0,
    entries: overrides.entries ?? [],
  };
}

/**
 * Produce a real in-memory zip blob: optionally embed the manifest JSON, and
 * add a file blob for every filePath in `fileContents`. JSZip round-trips
 * through actual blob bytes, keeping the loaders fully deterministic.
 */
async function buildZipBlob(options: {
  manifest?: ShareBundleManifest;
  fileContents?: Record<string, string>;
  extraFiles?: Record<string, string>;
}): Promise<Blob> {
  const zip = new JSZip();
  if (options.manifest) {
    zip.file(MANIFEST_FILENAME, JSON.stringify(options.manifest));
  }
  for (const [path, content] of Object.entries(options.fileContents ?? {})) {
    zip.file(path, content);
  }
  for (const [path, content] of Object.entries(options.extraFiles ?? {})) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "blob" });
}

describe("parseContentDispositionFilename", () => {
  test("returns null when the header is undefined", () => {
    expect(parseContentDispositionFilename(undefined)).toBeNull();
  });

  test("returns null for an empty string header", () => {
    expect(parseContentDispositionFilename("")).toBeNull();
  });

  test('extracts a quoted filename="..." value', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="report.pdf"'),
    ).toBe("report.pdf");
  });

  test("matches the filename token case-insensitively", () => {
    expect(
      parseContentDispositionFilename('attachment; FileName="MyDoc.pdf"'),
    ).toBe("MyDoc.pdf");
  });

  test("prefers the quoted filename over the UTF-8 form when both exist", () => {
    const disposition =
      "attachment; filename=\"ascii.pdf\"; filename*=UTF-8''utf8name.pdf";
    expect(parseContentDispositionFilename(disposition)).toBe("ascii.pdf");
  });

  test("decodes a UTF-8 filename* value when no quoted filename is present", () => {
    const disposition = "attachment; filename*=UTF-8''na%C3%AFve%20file.pdf";
    expect(parseContentDispositionFilename(disposition)).toBe("naïve file.pdf");
  });

  test("falls back to the raw UTF-8 value when decoding throws", () => {
    // A lone "%" is invalid percent-encoding and makes decodeURIComponent throw.
    const disposition = "attachment; filename*=UTF-8''bad%name.pdf";
    expect(parseContentDispositionFilename(disposition)).toBe("bad%name.pdf");
  });

  test("returns null when no filename token is present", () => {
    expect(parseContentDispositionFilename("inline")).toBeNull();
  });
});

describe("isZipBundle", () => {
  test("is true when the content type mentions zip", () => {
    expect(isZipBundle("application/zip", "bundle.bin")).toBe(true);
  });

  test("is true when the filename ends with .zip regardless of case", () => {
    expect(isZipBundle("application/octet-stream", "Bundle.ZIP")).toBe(true);
  });

  test("is false for a plain pdf with a non-zip content type", () => {
    expect(isZipBundle("application/pdf", "document.pdf")).toBe(false);
  });

  test("is false when neither signal indicates zip", () => {
    expect(isZipBundle("", "")).toBe(false);
  });
});

describe("getShareBundleEntryRootId", () => {
  test("uses the entry's own rootLogicalId when set", () => {
    const manifest = makeManifest({ rootLogicalId: "manifest-root" });
    const entry = makeEntry({ rootLogicalId: "entry-root" });
    expect(getShareBundleEntryRootId(manifest, entry)).toBe("entry-root");
  });

  test("falls back to the manifest rootLogicalId when the entry value is empty", () => {
    const manifest = makeManifest({ rootLogicalId: "manifest-root" });
    const entry = makeEntry({ rootLogicalId: "" });
    expect(getShareBundleEntryRootId(manifest, entry)).toBe("manifest-root");
  });
});

describe("resolveShareBundleOrder", () => {
  test("honors explicit rootLogicalIds order and sorts entries by versionNumber", () => {
    const manifest = makeManifest({
      rootLogicalIds: ["root-b", "root-a"],
      entries: [
        makeEntry({ rootLogicalId: "root-a", versionNumber: 2, name: "a2" }),
        makeEntry({ rootLogicalId: "root-b", versionNumber: 1, name: "b1" }),
        makeEntry({ rootLogicalId: "root-a", versionNumber: 1, name: "a1" }),
        makeEntry({ rootLogicalId: "root-b", versionNumber: 2, name: "b2" }),
      ],
    });

    const { rootOrder, sortedEntries } = resolveShareBundleOrder(manifest);

    expect(rootOrder).toEqual(["root-b", "root-a"]);
    expect(sortedEntries.map((entry) => entry.name)).toEqual([
      "b1",
      "b2",
      "a1",
      "a2",
    ]);
  });

  test("derives the root order from entries (dedup, first-seen) when rootLogicalIds is empty", () => {
    const manifest = makeManifest({
      rootLogicalIds: [],
      entries: [
        makeEntry({ rootLogicalId: "root-x", versionNumber: 1, name: "x1" }),
        makeEntry({ rootLogicalId: "root-y", versionNumber: 1, name: "y1" }),
        makeEntry({ rootLogicalId: "root-x", versionNumber: 2, name: "x2" }),
      ],
    });

    const { rootOrder, sortedEntries } = resolveShareBundleOrder(manifest);

    expect(rootOrder).toEqual(["root-x", "root-y"]);
    expect(sortedEntries.map((entry) => entry.name)).toEqual([
      "x1",
      "x2",
      "y1",
    ]);
  });

  test("uses the manifest rootLogicalId fallback for entries with no own root id", () => {
    const manifest = makeManifest({
      rootLogicalId: "fallback-root",
      rootLogicalIds: [],
      entries: [
        makeEntry({ rootLogicalId: "", versionNumber: 2, name: "v2" }),
        makeEntry({ rootLogicalId: "", versionNumber: 1, name: "v1" }),
      ],
    });

    const { rootOrder, sortedEntries } = resolveShareBundleOrder(manifest);

    expect(rootOrder).toEqual(["fallback-root"]);
    expect(sortedEntries.map((entry) => entry.name)).toEqual(["v1", "v2"]);
  });

  test("returns empty order and entries for an empty manifest", () => {
    const manifest = makeManifest({ rootLogicalIds: [], entries: [] });
    const { rootOrder, sortedEntries } = resolveShareBundleOrder(manifest);
    expect(rootOrder).toEqual([]);
    expect(sortedEntries).toEqual([]);
  });
});

describe("loadShareBundleEntries", () => {
  test("returns null when the zip has no manifest file", async () => {
    const blob = await buildZipBlob({
      extraFiles: { "files/orphan.pdf": "data" },
    });
    expect(await loadShareBundleEntries(blob)).toBeNull();
  });

  test("loads files in resolved order with correct File metadata", async () => {
    const manifest = makeManifest({
      rootLogicalIds: ["root-a"],
      entries: [
        makeEntry({
          rootLogicalId: "root-a",
          versionNumber: 2,
          name: "second.pdf",
          type: "application/pdf",
          lastModified: 222,
          filePath: "files/a/second.pdf",
        }),
        makeEntry({
          rootLogicalId: "root-a",
          versionNumber: 1,
          name: "first.pdf",
          type: "application/pdf",
          lastModified: 111,
          filePath: "files/a/first.pdf",
        }),
      ],
    });
    const blob = await buildZipBlob({
      manifest,
      fileContents: {
        "files/a/second.pdf": "SECOND",
        "files/a/first.pdf": "FIRST",
      },
    });

    const result = await loadShareBundleEntries(blob);

    expect(result).not.toBeNull();
    expect(result!.rootOrder).toEqual(["root-a"]);
    // Sorted ascending by versionNumber: first (v1) then second (v2).
    expect(result!.files.map((file) => file.name)).toEqual([
      "first.pdf",
      "second.pdf",
    ]);
    expect(result!.files[0].lastModified).toBe(111);
    expect(result!.files[1].lastModified).toBe(222);
    expect(result!.files[0].type).toBe("application/pdf");
    // Each File is constructed from the real unzipped blob, so it carries the
    // entry's byte length (5 chars: "FIRST" / "SECOND" minus one).
    expect(result!.files[0].size).toBe("FIRST".length);
    expect(result!.files[1].size).toBe("SECOND".length);
  });

  test("throws when a manifest entry references a missing file path", async () => {
    const manifest = makeManifest({
      rootLogicalIds: ["root-a"],
      entries: [
        makeEntry({
          rootLogicalId: "root-a",
          versionNumber: 1,
          name: "ghost.pdf",
          filePath: "files/a/ghost.pdf",
        }),
      ],
    });
    // Manifest present, but the referenced file path is absent from the zip.
    const blob = await buildZipBlob({ manifest });

    await expect(loadShareBundleEntries(blob)).rejects.toThrow(
      "Missing file entry files/a/ghost.pdf",
    );
  });
});

describe("extractLatestFilesFromBundle", () => {
  test("wraps a non-zip blob into a single File without unzipping", async () => {
    const blob = new Blob(["raw pdf bytes"], { type: "application/pdf" });
    const files = await extractLatestFilesFromBundle(
      blob,
      "document.pdf",
      "application/pdf",
    );

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("document.pdf");
    expect(files[0].type).toBe("application/pdf");
    // The original blob bytes are passed straight through into the File.
    expect(files[0].size).toBe(blob.size);
  });

  test("falls back to the blob's own type when contentType is empty", async () => {
    const blob = new Blob(["bytes"], { type: "application/x-blobtype" });
    const files = await extractLatestFilesFromBundle(blob, "plain.bin", "");

    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("application/x-blobtype");
  });

  test("returns the latest file per root in root order for a real bundle", async () => {
    const manifest = makeManifest({
      rootLogicalIds: ["root-a", "root-b"],
      entries: [
        makeEntry({
          rootLogicalId: "root-a",
          versionNumber: 1,
          name: "a-v1.pdf",
          filePath: "files/a/a-v1.pdf",
        }),
        makeEntry({
          rootLogicalId: "root-a",
          versionNumber: 2,
          name: "a-v2.pdf",
          filePath: "files/a/a-v2.pdf",
        }),
        makeEntry({
          rootLogicalId: "root-b",
          versionNumber: 1,
          name: "b-v1.pdf",
          filePath: "files/b/b-v1.pdf",
        }),
      ],
    });
    const blob = await buildZipBlob({
      manifest,
      fileContents: {
        "files/a/a-v1.pdf": "A1",
        "files/a/a-v2.pdf": "A2",
        "files/b/b-v1.pdf": "B1",
      },
    });

    const files = await extractLatestFilesFromBundle(
      blob,
      "bundle.zip",
      "application/zip",
    );

    // Latest version per root, ordered by rootOrder: a-v2 (root-a) then b-v1 (root-b).
    expect(files.map((file) => file.name)).toEqual(["a-v2.pdf", "b-v1.pdf"]);
    // Each selected File carries its unzipped byte length ("A2" and "B1").
    expect(files[0].size).toBe("A2".length);
    expect(files[1].size).toBe("B1".length);
  });

  test("treats a zip without a manifest as a single passthrough file", async () => {
    const blob = await buildZipBlob({
      extraFiles: { "files/orphan.pdf": "data" },
    });

    const files = await extractLatestFilesFromBundle(
      blob,
      "no-manifest.zip",
      "application/zip",
    );

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("no-manifest.zip");
    expect(files[0].type).toBe("application/zip");
  });

  test("falls back to wrapping the blob when the manifest has no entries", async () => {
    const manifest = makeManifest({ rootLogicalIds: [], entries: [] });
    const blob = await buildZipBlob({ manifest });

    const files = await extractLatestFilesFromBundle(
      blob,
      "empty-bundle.zip",
      "application/zip",
    );

    // No latest files resolved -> single fallback File named after the bundle.
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("empty-bundle.zip");
    expect(files[0].type).toBe("application/zip");
  });
});
