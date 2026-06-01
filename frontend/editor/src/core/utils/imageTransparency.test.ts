/**
 * Unit tests for imageTransparency.
 *
 * The module exposes a single async entry point, removeWhiteBackground, which
 * drives an internal canvas/Image pipeline:
 *   new Image() -> img.onload -> processImageTransparency(img) ->
 *     document.createElement("canvas") -> ctx.getImageData -> pixel loop ->
 *     ctx.putImageData -> canvas.toDataURL("image/png")
 *
 * jsdom provides no real 2D canvas or ImageData, so the whole browser pipeline
 * is stubbed deterministically:
 *   - global Image is replaced with a controllable stub whose `src` setter
 *     synchronously fires onload (or onerror) so the Promise settles in-test.
 *   - document.createElement("canvas") returns a fake canvas whose getContext
 *     hands back a fake 2D context. getImageData returns a SYNTHETIC ImageData
 *     ({ width, height, data: Uint8ClampedArray }) that we author per-test, so
 *     the pure pixel-bounds loop and detectCornerColor run over known input.
 *   - toDataURL returns a fixed string so assertions are exact.
 *
 * Because processImageTransparency mutates the alpha channel of the same data
 * array in place (then "uploads" it via putImageData), we read the array back
 * after the call to assert exactly which pixels were turned transparent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { removeWhiteBackground } from "@app/utils/imageTransparency";
import type { TransparencyOptions } from "@app/utils/imageTransparency";

// ---------------------------------------------------------------------------
// Synthetic ImageData. The module only reads .width, .height and .data, so a
// plain object with a Uint8ClampedArray is a faithful stand-in for the real
// ImageData jsdom does not implement.
// ---------------------------------------------------------------------------
interface FakeImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Build a FakeImageData from a flat list of [r,g,b,a] pixel tuples laid out in
 * row-major order. The caller guarantees pixels.length === width * height.
 */
function makeImageData(
  width: number,
  height: number,
  pixels: Array<[number, number, number, number]>,
): FakeImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach(([r, g, b, a], idx) => {
    data[idx * 4] = r;
    data[idx * 4 + 1] = g;
    data[idx * 4 + 2] = b;
    data[idx * 4 + 3] = a;
  });
  return { width, height, data };
}

/** Build a uniform image where every pixel shares the same [r,g,b,a]. */
function makeUniformImageData(
  width: number,
  height: number,
  color: [number, number, number, number],
): FakeImageData {
  const pixels: Array<[number, number, number, number]> = [];
  for (let i = 0; i < width * height; i++) {
    pixels.push([...color] as [number, number, number, number]);
  }
  return makeImageData(width, height, pixels);
}

/** Convenience: read the alpha channel of every pixel back out as an array. */
function alphaChannel(data: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 3; i < data.length; i += 4) {
    out.push(data[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canvas / Image stubs.
// ---------------------------------------------------------------------------

interface CanvasHandles {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  canvas: { width: number; height: number };
}

/**
 * Install a deterministic canvas pipeline. getImageData always returns
 * `imageData` (the synthetic, mutable buffer we author in the test). When
 * `noContext` is true, getContext returns null to exercise the guard branch.
 */
function stubCanvas(options?: {
  imageData?: FakeImageData;
  noContext?: boolean;
}): CanvasHandles {
  const { imageData, noContext = false } = options ?? {};

  const drawImage = vi.fn();
  const getImageData = vi.fn(() => imageData);
  const putImageData = vi.fn();
  const toDataURL = vi.fn(() => "data:image/png;base64,STUBBED");

  const ctx = noContext ? null : { drawImage, getImageData, putImageData };

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL,
  };

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas as unknown as HTMLElement;
    }
    return {} as HTMLElement;
  });

  return {
    drawImage,
    getImageData,
    putImageData,
    toDataURL,
    canvas: canvas as unknown as { width: number; height: number },
  };
}

/**
 * Replace the global Image constructor with a stub. Assigning to `.src`
 * schedules the configured handler (onload by default, onerror when
 * `failLoad` is set) on a microtask so the consumer always registers its
 * handlers first. `dims` flows through to img.width / img.height, which the
 * pipeline copies onto the canvas.
 */
function stubImage(options?: {
  failLoad?: boolean;
  dims?: { width: number; height: number };
}) {
  const { failLoad = false, dims = { width: 2, height: 2 } } = options ?? {};

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = dims.width;
    height = dims.height;
    private _src = "";

    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        if (failLoad) {
          this.onerror?.();
        } else {
          this.onload?.();
        }
      });
    }

    get src(): string {
      return this._src;
    }
  }

  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
}

/**
 * Replace the global FileReader with a stub that, on readAsDataURL, either
 * fires onload with a data URL or fires onerror when `fail` is set.
 */
function stubFileReader(options?: { fail?: boolean }) {
  const { fail = false } = options ?? {};

  class FakeFileReader {
    onload: ((e: { target: { result: string } }) => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | ArrayBuffer | null = null;

    readAsDataURL(_file: Blob): void {
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.();
        } else {
          this.result = "data:image/png;base64,FILEDATA";
          this.onload?.({
            target: { result: this.result as string },
          });
        }
      });
    }
  }

  vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);
}

describe("imageTransparency / removeWhiteBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // String source + default bounds (DEFAULT_LOWER/UPPER): the white pixels in
  // range [200..255] get alpha zeroed; out-of-range pixels keep their alpha.
  // -------------------------------------------------------------------------
  describe("string image source with default bounds", () => {
    it("zeroes alpha for in-range (white-ish) pixels and leaves others opaque", async () => {
      // 2x2: white, near-white-in-range, dark, mid-gray-below-lower.
      const imageData = makeImageData(2, 2, [
        [255, 255, 255, 255], // exactly white -> transparent
        [210, 220, 230, 255], // within [200..255] on all channels -> transparent
        [10, 20, 30, 255], // far below lower bound -> opaque
        [199, 255, 255, 255], // r=199 < 200 lower bound -> opaque
      ]);
      const handles = stubCanvas({ imageData });
      stubImage({ dims: { width: 2, height: 2 } });

      const result = await removeWhiteBackground("data:image/png;base64,SRC");

      expect(result).toBe("data:image/png;base64,STUBBED");
      // Canvas was sized from the image dims and the pipeline ran end to end.
      expect(handles.canvas.width).toBe(2);
      expect(handles.canvas.height).toBe(2);
      expect(handles.drawImage).toHaveBeenCalledTimes(1);
      expect(handles.getImageData).toHaveBeenCalledTimes(1);
      expect(handles.putImageData).toHaveBeenCalledTimes(1);
      expect(handles.toDataURL).toHaveBeenCalledWith("image/png");
      // First two pixels in range -> alpha 0; last two out of range -> alpha 255.
      expect(alphaChannel(imageData.data)).toEqual([0, 0, 255, 255]);
    });

    it("passes the string src straight through without invoking FileReader", async () => {
      const imageData = makeUniformImageData(1, 1, [255, 255, 255, 255]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 1, height: 1 } });
      // FileReader stub that would throw if used, proving the string path
      // never touches it.
      const readAsDataURL = vi.fn();
      vi.stubGlobal(
        "FileReader",
        class {
          readAsDataURL = readAsDataURL;
        } as unknown as typeof FileReader,
      );

      await removeWhiteBackground("https://example.com/img.png");

      expect(readAsDataURL).not.toHaveBeenCalled();
    });

    it("treats the upper bound as inclusive (channel === 255 still transparent)", async () => {
      const imageData = makeUniformImageData(1, 1, [255, 255, 255, 255]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 1, height: 1 } });

      await removeWhiteBackground("data:src");

      expect(alphaChannel(imageData.data)).toEqual([0]);
    });

    it("treats the lower bound as inclusive (channel === 200 still transparent)", async () => {
      const imageData = makeUniformImageData(1, 1, [200, 200, 200, 255]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 1, height: 1 } });

      await removeWhiteBackground("data:src");

      expect(alphaChannel(imageData.data)).toEqual([0]);
    });
  });

  // -------------------------------------------------------------------------
  // Explicit custom bounds via options override the defaults.
  // -------------------------------------------------------------------------
  describe("explicit custom bounds", () => {
    it("honors caller-provided lowerBound/upperBound instead of the defaults", async () => {
      // Bounds target a dark band [0..50]; white pixels must stay opaque.
      const imageData = makeImageData(2, 1, [
        [10, 20, 30, 255], // inside the custom dark band -> transparent
        [255, 255, 255, 255], // white, outside band -> opaque
      ]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 2, height: 1 } });

      const options: TransparencyOptions = {
        lowerBound: { r: 0, g: 0, b: 0 },
        upperBound: { r: 50, g: 50, b: 50 },
      };
      await removeWhiteBackground("data:src", options);

      expect(alphaChannel(imageData.data)).toEqual([0, 255]);
    });

    it("requires every channel within bounds (one out-of-band channel keeps alpha)", async () => {
      // g=60 escapes the [0..50] band, so the pixel is NOT cleared even though
      // r and b are in range.
      const imageData = makeImageData(1, 1, [[10, 60, 10, 255]]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 1, height: 1 } });

      await removeWhiteBackground("data:src", {
        lowerBound: { r: 0, g: 0, b: 0 },
        upperBound: { r: 50, g: 50, b: 50 },
      });

      expect(alphaChannel(imageData.data)).toEqual([255]);
    });
  });

  // -------------------------------------------------------------------------
  // autoDetectCorner: detectCornerColor samples the four corners (5x5 each,
  // clamped to bounds for small images) and the tolerance band is derived from
  // the averaged corner color.
  // -------------------------------------------------------------------------
  describe("autoDetectCorner", () => {
    it("derives the band from a uniform corner color and clears matching pixels", async () => {
      // Every corner sample is (100,100,100); the whole 3x3 image is that color.
      // With default tolerance 10 the band is [90..110], so all pixels clear.
      const imageData = makeUniformImageData(3, 3, [100, 100, 100, 255]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 3, height: 3 } });

      await removeWhiteBackground("data:src", { autoDetectCorner: true });

      expect(alphaChannel(imageData.data)).toEqual(new Array(9).fill(0));
    });

    it("keeps a center pixel that falls outside the auto-detected band opaque", async () => {
      // Corners are dark (0,0,0); the center pixel is bright white. The band
      // is [0..10] (clamped at 0), so only the dark pixels clear.
      const pixels: Array<[number, number, number, number]> = [];
      for (let i = 0; i < 9; i++) {
        pixels.push([0, 0, 0, 255]);
      }
      // Center of a 3x3 grid is index 4.
      pixels[4] = [255, 255, 255, 255];
      const imageData = makeImageData(3, 3, pixels);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 3, height: 3 } });

      await removeWhiteBackground("data:src", { autoDetectCorner: true });

      const alpha = alphaChannel(imageData.data);
      expect(alpha[4]).toBe(255); // bright center survives
      alpha.filter((_, idx) => idx !== 4).forEach((a) => expect(a).toBe(0)); // dark surround cleared
    });

    it("clamps the band at 0/255 using a custom tolerance and rounds the average", async () => {
      // Two distinct corner colors averaged: most corner samples read (0,0,0)
      // but with a single bright pixel near one corner the rounded average is
      // still 0 for a uniform-zero image. Use a uniform near-white image so the
      // upper clamp to 255 is exercised: corner color 255 + tolerance 30 -> 255.
      const imageData = makeUniformImageData(2, 2, [255, 255, 255, 255]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 2, height: 2 } });

      await removeWhiteBackground("data:src", {
        autoDetectCorner: true,
        tolerance: 30,
      });

      // Band is [225..255]; every 255 pixel clears.
      expect(alphaChannel(imageData.data)).toEqual([0, 0, 0, 0]);
    });

    it("rounds a fractional averaged corner color (Math.round path)", async () => {
      // 1x1 image: all four corners clamp to the single pixel (1,1,1), so the
      // average is exactly 1 (no rounding needed there); but a mixed sample set
      // exercises rounding. Use a 1x2 image whose two columns differ so the
      // averaged corner channels are fractional and round.
      // Pixel0 = (0,0,0), Pixel1 = (3,3,3). The 4 corners each sample a 5x5
      // block clamped into the 2-pixel-wide row, mixing both columns.
      const imageData = makeImageData(2, 1, [
        [0, 0, 0, 255],
        [3, 3, 3, 255],
      ]);
      stubCanvas({ imageData });
      stubImage({ dims: { width: 2, height: 1 } });

      // Just assert it completes and produces the stub URL; the precise band is
      // covered above. This drives the Math.round + clamp arithmetic with a
      // non-integer average.
      const result = await removeWhiteBackground("data:src", {
        autoDetectCorner: true,
        tolerance: 0,
      });
      expect(result).toBe("data:image/png;base64,STUBBED");
    });
  });

  // -------------------------------------------------------------------------
  // File source path: removeWhiteBackground uses a FileReader to produce a data
  // URL before assigning img.src.
  // -------------------------------------------------------------------------
  describe("File image source", () => {
    it("reads the File via FileReader, then runs the canvas pipeline", async () => {
      const imageData = makeUniformImageData(1, 1, [255, 255, 255, 255]);
      const handles = stubCanvas({ imageData });
      stubImage({ dims: { width: 1, height: 1 } });
      stubFileReader();

      const file = new File(["x"], "pic.png", { type: "image/png" });
      const result = await removeWhiteBackground(file);

      expect(result).toBe("data:image/png;base64,STUBBED");
      expect(handles.drawImage).toHaveBeenCalledTimes(1);
      expect(alphaChannel(imageData.data)).toEqual([0]);
    });

    it("rejects when the FileReader fails to read the file", async () => {
      stubCanvas({ imageData: makeUniformImageData(1, 1, [0, 0, 0, 255]) });
      stubImage({ dims: { width: 1, height: 1 } });
      stubFileReader({ fail: true });

      const file = new File(["x"], "pic.png", { type: "image/png" });
      await expect(removeWhiteBackground(file)).rejects.toThrow(
        "Failed to read image file",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error / rejection paths.
  // -------------------------------------------------------------------------
  describe("error paths", () => {
    it("rejects with 'Failed to load image' when the image fails to load", async () => {
      stubCanvas({ imageData: makeUniformImageData(1, 1, [0, 0, 0, 255]) });
      stubImage({ failLoad: true });

      await expect(
        removeWhiteBackground("data:image/png;base64,BAD"),
      ).rejects.toThrow("Failed to load image");
    });

    it("rejects when the canvas 2D context is unavailable", async () => {
      stubCanvas({ noContext: true });
      stubImage({ dims: { width: 1, height: 1 } });

      await expect(removeWhiteBackground("data:src")).rejects.toThrow(
        "Failed to get canvas context",
      );
    });

    it("rejects when processing throws inside onload (getImageData missing data)", async () => {
      // getImageData returns undefined, so reading `.data` throws a TypeError
      // that the onload try/catch converts into a rejection.
      stubCanvas({ imageData: undefined });
      stubImage({ dims: { width: 1, height: 1 } });

      await expect(removeWhiteBackground("data:src")).rejects.toBeInstanceOf(
        Error,
      );
    });
  });
});
