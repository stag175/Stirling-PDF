/**
 * Pure per-pixel colour adjustment extracted from {@link ./utils} so the channel-multiplier →
 * contrast → brightness → saturation (HSL round-trip) maths can be unit-tested without a canvas or
 * DOM. Behaviour is identical to the original inline loop in `applyAdjustmentsToCanvas`.
 *
 * Multipliers are the already-normalised values (the UI's 0..200 percentages divided by 100, i.e.
 * 1.0 = no change). Inputs and outputs are 0..255 channel values.
 */

export interface ChannelAdjustments {
  contrast: number;
  brightness: number;
  saturation: number;
  redMul: number;
  greenMul: number;
  blueMul: number;
}

const clamp = (v: number): number => Math.min(255, Math.max(0, v));

const hue2rgb = (p: number, q: number, t: number): number => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

/**
 * Applies the adjustments to a single RGB pixel and returns the new {@code [r, g, b]} (each 0..255,
 * rounded). Alpha is not touched by the caller.
 */
export function adjustPixel(
  r0: number,
  g0: number,
  b0: number,
  adj: ChannelAdjustments,
): [number, number, number] {
  let r = r0 * adj.redMul;
  let g = g0 * adj.greenMul;
  let b = b0 * adj.blueMul;

  // Contrast (centered at 128)
  r = clamp((r - 128) * adj.contrast + 128);
  g = clamp((g - 128) * adj.contrast + 128);
  b = clamp((b - 128) * adj.contrast + 128);

  // Brightness
  r = clamp(r * adj.brightness);
  g = clamp(g * adj.brightness);
  b = clamp(b * adj.brightness);

  // Saturation via HSL
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  s = Math.min(1, Math.max(0, s * adj.saturation));
  let r2: number, g2: number, b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1 / 3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1 / 3);
  }
  return [clamp(Math.round(r2 * 255)), clamp(Math.round(g2 * 255)), clamp(Math.round(b2 * 255))];
}
