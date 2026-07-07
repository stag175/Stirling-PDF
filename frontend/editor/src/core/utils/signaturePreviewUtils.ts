/**
 * Pure geometry for the text-signature preview, lifted out of {@link ./signaturePreview.ts}'s
 * canvas-coupled `buildSignaturePreview`. The padding-ratio rounding and the 1px-minimum
 * dimension clamps are easy to get subtly wrong, so they live here and are unit-tested in
 * isolation; `signaturePreview.ts` keeps the canvas measurement/draw and only feeds in the
 * measured text width.
 */
import {
  HORIZONTAL_PADDING_RATIO,
  VERTICAL_PADDING_RATIO,
} from "@app/constants/signConstants";

export interface TextSignatureDimensions {
  /** Horizontal padding (px) applied on each side; also the x-offset for the drawn text. */
  paddingX: number;
  /** Vertical padding (px) applied above and below the text. */
  paddingY: number;
  /** Canvas width (px), clamped to a 1px minimum. */
  width: number;
  /** Canvas height (px), clamped to a 1px minimum. */
  height: number;
}

/**
 * Compute the text-signature canvas dimensions from the already-measured text width and the
 * font size. Padding is `round(fontSize * ratio)` per axis; width/height add padding on both
 * sides and never drop below 1px. Pure.
 */
export function computeTextSignatureDimensions(
  textWidth: number,
  fontSize: number,
): TextSignatureDimensions {
  const paddingX = Math.round(fontSize * HORIZONTAL_PADDING_RATIO);
  const paddingY = Math.round(fontSize * VERTICAL_PADDING_RATIO);
  const width = Math.max(1, textWidth + paddingX * 2);
  const height = Math.max(1, Math.ceil(fontSize + paddingY * 2));
  return { paddingX, paddingY, width, height };
}
