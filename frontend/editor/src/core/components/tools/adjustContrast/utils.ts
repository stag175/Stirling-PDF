import {
  adjustPixel,
  ChannelAdjustments,
} from "@app/components/tools/adjustContrast/adjustPixelUtils";
import { AdjustContrastParameters } from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

export function applyAdjustmentsToCanvas(
  src: HTMLCanvasElement,
  params: AdjustContrastParameters,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  const adj: ChannelAdjustments = {
    contrast: params.contrast / 100, // 0..2
    brightness: params.brightness / 100, // 0..2
    saturation: params.saturation / 100, // 0..2
    redMul: params.red / 100, // 0..2
    greenMul: params.green / 100, // 0..2
    blueMul: params.blue / 100, // 0..2
  };

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = adjustPixel(data[i], data[i + 1], data[i + 2], adj);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}
