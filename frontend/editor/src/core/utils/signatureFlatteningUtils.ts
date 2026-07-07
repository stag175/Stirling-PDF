/**
 * Pure coordinate resolution for signature flattening, lifted out of
 * {@link ./signatureFlattening.ts}'s PDFium/canvas-coupled `flattenSignatures`.
 *
 * The viewer hands back loosely-typed annotation rects whose position/size live under several
 * possible keys, and the box must be flipped from the viewer's CSS top-left origin to PDF's
 * bottom-left origin. That fallback resolution and the y-axis flip are exactly the kind of
 * off-by-one geometry worth testing in isolation, so they live here; the coupled function only
 * feeds in the probed rect and the page height.
 */

/** Loosely-typed annotation rect as probed from the viewer (many version-specific shapes). */
export interface RawAnnotationRect {
  origin?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface SignaturePdfRect {
  /** Left edge in PDF user space (unchanged from the viewer's x). */
  pdfX: number;
  /** Bottom edge in PDF user space (top-left origin flipped about pageHeight). */
  pdfY: number;
  width: number;
  height: number;
}

/**
 * Resolve a signature annotation's PDF-space rectangle from a loosely-typed viewer rect.
 *
 * Position falls back `origin.{x,y}` → `{x,y}` → `{left,top}` → `0`; size falls back
 * `size.{width,height}` → `{width,height}` → `100`/`50`. All fallbacks use `||` (so a literal
 * `0` width/height intentionally falls through to the default, matching the original behaviour).
 * The box is converted from CSS top-left origin to PDF bottom-left origin via
 * `pdfY = pageHeight - originalY - height`. Pure.
 */
export function resolveSignaturePdfRect(
  rect: RawAnnotationRect,
  pageHeight: number,
): SignaturePdfRect {
  const originalX = rect.origin?.x || rect.x || rect.left || 0;
  const originalY = rect.origin?.y || rect.y || rect.top || 0;
  const width = rect.size?.width || rect.width || 100;
  const height = rect.size?.height || rect.height || 50;
  return {
    pdfX: originalX,
    pdfY: pageHeight - originalY - height,
    width,
    height,
  };
}
