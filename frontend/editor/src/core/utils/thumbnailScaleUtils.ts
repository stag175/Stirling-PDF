/**
 * Pure thumbnail-scale heuristic extracted from {@link ./thumbnailUtils} so it can be unit-tested
 * without importing the PDFium WASM service (which `thumbnailUtils` pulls in). Behaviour is identical
 * to the original function.
 */

/**
 * Picks a render scale factor for a thumbnail based on the source file size: full quality for small
 * files, degrading in steps for larger files so very large PDFs stay responsive. Returns a value in
 * {@code (0, 1]}.
 */
export function calculateScaleFromFileSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize < 10 * MB) return 1.0; // Full quality for small files
  if (fileSize < 50 * MB) return 0.8; // High quality for common file sizes
  if (fileSize < 200 * MB) return 0.6; // Good quality for typical large files
  if (fileSize < 500 * MB) return 0.4; // Readable quality for large but manageable files
  return 0.3; // Still usable quality, not tiny
}
