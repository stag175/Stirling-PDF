/**
 * fileLifecycleUtils - Pure decision logic for file resource cleanup.
 *
 * These helpers contain the *pure* part of memory/lifecycle management: given a
 * file's metadata stub, decide WHICH blob URLs are eligible for revocation.
 * They never call URL.revokeObjectURL, .destroy(), worker.terminate() or
 * dispatch — the side effects stay in FileLifecycleManager (lifecycle.ts) and
 * the React component. Keeping the "what should we release?" decision separate
 * from the "release it" execution is what makes this crash-prone area unit
 * testable (see fileLifecycleUtils.test.ts).
 */

import type { StirlingFileStub } from "@app/types/fileContext";

/** A blob URL begins with this scheme; anything else must not be revoked. */
export const BLOB_URL_PREFIX = "blob:";

/**
 * True iff `value` is a non-empty string that names a blob: object URL.
 *
 * Object URLs created with other schemes (https:, data:, file:) must never be
 * passed to URL.revokeObjectURL, so callers gate revocation on this predicate.
 */
export function isRevocableBlobUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(BLOB_URL_PREFIX);
}

/**
 * Collect every blob: URL referenced by a file stub that is eligible for
 * revocation, in a deterministic order:
 *   1. the generated thumbnail URL,
 *   2. the file-access blob URL,
 *   3. each processed-page thumbnail (in page order).
 *
 * Non-blob schemes and missing/empty values are skipped. The result is
 * de-duplicated so the same underlying object URL is only revoked once even if
 * it is referenced by multiple fields (revoking the same URL twice is harmless
 * but wasteful, and de-duping keeps revocation counts predictable in tests).
 *
 * This is a *pure* function: it reads the record and returns a list. It does
 * not revoke anything. The caller is responsible for invoking
 * URL.revokeObjectURL on the returned URLs (and for swallowing any errors).
 */
export function collectRevocableBlobUrls(
  record: Pick<StirlingFileStub, "thumbnailUrl" | "blobUrl" | "processedFile"> | null | undefined,
): string[] {
  if (!record) {
    return [];
  }

  const urls: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: unknown): void => {
    if (isRevocableBlobUrl(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
    }
  };

  push(record.thumbnailUrl);
  push(record.blobUrl);

  const pages = record.processedFile?.pages;
  if (pages) {
    for (const page of pages) {
      push(page?.thumbnail);
    }
  }

  return urls;
}
