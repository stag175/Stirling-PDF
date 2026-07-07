/**
 * Pure page-layout maths for image→PDF conversion, extracted from {@link ./imageToPdfUtils} so the
 * page-dimension/orientation resolution and the aspect-ratio-preserving image placement can be
 * unit-tested without the PDFium WASM module or a canvas. Behaviour is identical to the original
 * inline logic in `convertImageToPdf`. All dimensions are in PDF points.
 */

export const PAGE_SIZES = {
  A4: [595.276, 841.89] as [number, number],
  Letter: [612, 792] as [number, number],
};

export interface PageDimensions {
  pageWidth: number;
  pageHeight: number;
}

export interface ImagePlacement {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
}

/**
 * Resolves the output page size for the chosen format, rotating the page to match the image's
 * orientation (landscape image → landscape page). {@code "keep"} uses the image's own pixel
 * dimensions; {@code "letter"} uses US-Letter; anything else uses A4.
 */
export function resolvePageDimensions(
  pageFormat: string,
  imageWidth: number,
  imageHeight: number,
): PageDimensions {
  let pageWidth: number;
  let pageHeight: number;

  if (pageFormat === "keep") {
    pageWidth = imageWidth;
    pageHeight = imageHeight;
  } else if (pageFormat === "letter") {
    [pageWidth, pageHeight] = PAGE_SIZES.Letter;
  } else {
    [pageWidth, pageHeight] = PAGE_SIZES.A4;
  }

  // Adjust orientation to match image
  if (pageFormat !== "keep") {
    const imageIsLandscape = imageWidth > imageHeight;
    const pageIsLandscape = pageWidth > pageHeight;
    if (imageIsLandscape !== pageIsLandscape) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }
  }

  return { pageWidth, pageHeight };
}

/**
 * Computes where to draw the image on the page. When stretching (or {@code "keep"}) the image fills
 * the page; otherwise it is scaled to fit while preserving aspect ratio and centred on the
 * letterbox/pillarbox axis.
 */
export function calculateImagePlacement(
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
  stretchToFit: boolean,
  pageFormat: string,
): ImagePlacement {
  if (stretchToFit || pageFormat === "keep") {
    return { drawX: 0, drawY: 0, drawWidth: pageWidth, drawHeight: pageHeight };
  }

  const imageAspectRatio = imageWidth / imageHeight;
  const pageAspectRatio = pageWidth / pageHeight;

  let drawX: number;
  let drawY: number;
  let drawWidth: number;
  let drawHeight: number;

  if (imageAspectRatio > pageAspectRatio) {
    drawWidth = pageWidth;
    drawHeight = pageWidth / imageAspectRatio;
    drawX = 0;
    drawY = (pageHeight - drawHeight) / 2;
  } else {
    drawHeight = pageHeight;
    drawWidth = pageHeight * imageAspectRatio;
    drawY = 0;
    drawX = (pageWidth - drawWidth) / 2;
  }

  return { drawX, drawY, drawWidth, drawHeight };
}
