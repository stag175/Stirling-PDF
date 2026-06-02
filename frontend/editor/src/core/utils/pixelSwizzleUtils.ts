/**
 * Pure RGBA→BGRA pixel swizzle extracted from {@link ./pdfiumBitmapUtils} (which is coupled to the
 * PDFium WASM heap) so the byte-reordering can be unit-tested in isolation. Behaviour is identical to
 * the fast-path loop in {@code copyRgbaToBgraHeap}.
 *
 * Each 4-byte pixel {@code [R, G, B, A]} becomes {@code [B, G, R, A]} — red and blue are swapped while
 * green and alpha keep their positions. Input length is assumed to be a multiple of 4.
 */
export function rgbaToBgra(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const bgra = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2]; // B
    bgra[i + 1] = rgba[i + 1]; // G
    bgra[i + 2] = rgba[i]; // R
    bgra[i + 3] = rgba[i + 3]; // A
  }
  return bgra;
}
