import { describe, expect, test } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCropParameters,
  defaultParameters,
  CropParameters,
} from "@app/hooks/tools/crop/useCropParameters";
import { PDFBounds, Rectangle } from "@app/utils/cropCoordinates";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";

// A4-sized PDF bounds used across the bounds-aware branches.
const a4Bounds: PDFBounds = {
  actualWidth: 595,
  actualHeight: 842,
  thumbnailWidth: 297.5,
  thumbnailHeight: 421,
  offsetX: 10,
  offsetY: 20,
  scale: 0.5,
};

describe("useCropParameters", () => {
  test("should initialize with default parameters", () => {
    const { result } = renderHook(() => useCropParameters());

    expect(result.current.parameters).toStrictEqual(defaultParameters);
    expect(result.current.parameters.autoCrop).toBe(false);
    expect(result.current.parameters.cropArea).toStrictEqual(DEFAULT_CROP_AREA);
  });

  test("should return correct endpoint name", () => {
    const { result } = renderHook(() => useCropParameters());

    expect(result.current.getEndpointName()).toBe("crop");
  });

  test("getCropArea returns the current crop area", () => {
    const { result } = renderHook(() => useCropParameters());

    expect(result.current.getCropArea()).toStrictEqual(DEFAULT_CROP_AREA);
  });

  test("setCropArea rounds coordinates to 0.1 precision without bounds", () => {
    const { result } = renderHook(() => useCropParameters());

    act(() => {
      result.current.setCropArea({
        x: 1.23,
        y: 4.56,
        width: 10.04,
        height: 20.06,
      });
    });

    // roundCropArea rounds each value to one decimal place.
    expect(result.current.getCropArea()).toStrictEqual({
      x: 1.2,
      y: 4.6,
      width: 10,
      height: 20.1,
    });
  });

  test("setCropArea constrains the crop area when PDF bounds are provided", () => {
    const { result } = renderHook(() => useCropParameters());

    // Oversized + offset rect that must be clamped into the A4 bounds.
    act(() => {
      result.current.setCropArea(
        { x: 700, y: 900, width: 400, height: 500 },
        a4Bounds,
      );
    });

    const area = result.current.getCropArea();
    // After rounding the input is unchanged; constrainCropAreaToPDF clamps it.
    expect(area.x).toBeGreaterThanOrEqual(0);
    expect(area.y).toBeGreaterThanOrEqual(0);
    expect(area.x + area.width).toBeLessThanOrEqual(
      a4Bounds.actualWidth + 0.01,
    );
    expect(area.y + area.height).toBeLessThanOrEqual(
      a4Bounds.actualHeight + 0.01,
    );
  });

  test("setCropArea keeps an in-bounds rect intact when bounds are provided", () => {
    const { result } = renderHook(() => useCropParameters());

    act(() => {
      result.current.setCropArea(
        { x: 10, y: 20, width: 100, height: 200 },
        a4Bounds,
      );
    });

    expect(result.current.getCropArea()).toStrictEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  test("resetToFullPDF sets the crop area to cover the entire PDF", () => {
    const { result } = renderHook(() => useCropParameters());

    // Move away from full coverage first.
    act(() => {
      result.current.setCropArea({ x: 5, y: 5, width: 50, height: 50 });
    });
    expect(result.current.getCropArea()).not.toStrictEqual({
      x: 0,
      y: 0,
      width: a4Bounds.actualWidth,
      height: a4Bounds.actualHeight,
    });

    act(() => {
      result.current.resetToFullPDF(a4Bounds);
    });

    expect(result.current.getCropArea()).toStrictEqual({
      x: 0,
      y: 0,
      width: a4Bounds.actualWidth,
      height: a4Bounds.actualHeight,
    });
    expect(result.current.isFullPDFCrop(a4Bounds)).toBe(true);
  });

  describe("isCropAreaValid", () => {
    test("returns true for a valid default crop area without bounds", () => {
      const { result } = renderHook(() => useCropParameters());

      expect(result.current.isCropAreaValid()).toBe(true);
    });

    test.each<{
      description: string;
      area: Rectangle;
      expected: boolean;
    }>([
      {
        description: "negative x",
        area: { x: -1, y: 0, width: 10, height: 10 },
        expected: false,
      },
      {
        description: "negative y",
        area: { x: 0, y: -1, width: 10, height: 10 },
        expected: false,
      },
      {
        description: "zero width",
        area: { x: 0, y: 0, width: 0, height: 10 },
        expected: false,
      },
      {
        description: "zero height",
        area: { x: 0, y: 0, width: 10, height: 0 },
        expected: false,
      },
      {
        description: "positive area",
        area: { x: 1, y: 1, width: 10, height: 10 },
        expected: true,
      },
    ])(
      "basic validation without bounds: $description",
      ({ area, expected }) => {
        const { result } = renderHook(() => useCropParameters());

        act(() => {
          // Use setParameters to bypass clamping so the raw area is validated.
          result.current.setParameters((prev: CropParameters) => ({
            ...prev,
            cropArea: area,
          }));
        });

        expect(result.current.isCropAreaValid()).toBe(expected);
      },
    );

    test("returns true when crop area fits within PDF bounds", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0, y: 0, width: 595, height: 842 },
        }));
      });

      expect(result.current.isCropAreaValid(a4Bounds)).toBe(true);
    });

    test("returns false when crop area exceeds PDF width", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 100, y: 0, width: 600, height: 100 },
        }));
      });

      expect(result.current.isCropAreaValid(a4Bounds)).toBe(false);
    });

    test("returns false when crop area exceeds PDF height", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0, y: 100, width: 100, height: 800 },
        }));
      });

      expect(result.current.isCropAreaValid(a4Bounds)).toBe(false);
    });

    test("tolerance allows a crop area marginally over bounds", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0, y: 0, width: 595.005, height: 842 },
        }));
      });

      // 595.005 <= 595 + 0.01 tolerance -> still valid.
      expect(result.current.isCropAreaValid(a4Bounds)).toBe(true);
    });
  });

  describe("isFullPDFCrop", () => {
    test("returns false when no bounds are provided", () => {
      const { result } = renderHook(() => useCropParameters());

      expect(result.current.isFullPDFCrop()).toBe(false);
    });

    test("returns true for an exact full-page crop area", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.resetToFullPDF(a4Bounds);
      });

      expect(result.current.isFullPDFCrop(a4Bounds)).toBe(true);
    });

    test("returns true within the 0.5 point tolerance", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0.4, y: 0.4, width: 594.7, height: 841.7 },
        }));
      });

      expect(result.current.isFullPDFCrop(a4Bounds)).toBe(true);
    });

    test("returns false when offset exceeds tolerance", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 5, y: 0, width: 595, height: 842 },
        }));
      });

      expect(result.current.isFullPDFCrop(a4Bounds)).toBe(false);
    });

    test("returns false when dimensions differ beyond tolerance", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0, y: 0, width: 100, height: 100 },
        }));
      });

      expect(result.current.isFullPDFCrop(a4Bounds)).toBe(false);
    });
  });

  describe("updateCropAreaConstrained", () => {
    test("merges a partial update into the current crop area", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setCropArea({ x: 10, y: 10, width: 100, height: 100 });
      });

      act(() => {
        result.current.updateCropAreaConstrained({ width: 200 });
      });

      expect(result.current.getCropArea()).toStrictEqual({
        x: 10,
        y: 10,
        width: 200,
        height: 100,
      });
    });

    test("applies PDF bound constraints to the merged crop area", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setCropArea({ x: 10, y: 10, width: 100, height: 100 });
      });

      act(() => {
        result.current.updateCropAreaConstrained({ width: 5000 }, a4Bounds);
      });

      const area = result.current.getCropArea();
      expect(area.x + area.width).toBeLessThanOrEqual(
        a4Bounds.actualWidth + 0.01,
      );
    });
  });

  describe("validateParameters", () => {
    test("is true for the default (full A4) parameters", () => {
      const { result } = renderHook(() => useCropParameters());

      expect(result.current.validateParameters()).toBe(true);
    });

    test("is false when the crop area has non-positive dimensions", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: 0, y: 0, width: 0, height: 0 },
        }));
      });

      expect(result.current.validateParameters()).toBe(false);
    });

    test("is false when the crop area has negative coordinates", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.setParameters((prev: CropParameters) => ({
          ...prev,
          cropArea: { x: -10, y: -10, width: 100, height: 100 },
        }));
      });

      expect(result.current.validateParameters()).toBe(false);
    });
  });

  describe("updateParameter override", () => {
    test("clamps negative rectangle coordinates to the 0.1 minimum", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.updateParameter("cropArea", {
          x: -5,
          y: -8,
          width: 50,
          height: 60,
        });
      });

      const area = result.current.getCropArea();
      // The override forces x to at least the 0.1 minimum.
      expect(area.x).toBeGreaterThanOrEqual(0.1);
      expect(area.width).toBe(50);
      expect(area.height).toBe(60);
    });

    test("leaves a negative-dimension rect untouched (fails the type guard)", () => {
      const { result } = renderHook(() => useCropParameters());

      // isRectangle rejects negative width/height, so the clamping branch is
      // skipped and the raw value is stored as-is.
      act(() => {
        result.current.updateParameter("cropArea", {
          x: 3,
          y: 4,
          width: -10,
          height: -20,
        });
      });

      const area = result.current.getCropArea();
      expect(area.width).toBe(-10);
      expect(area.height).toBe(-20);
    });

    test("keeps non-negative width and height for a valid rectangle", () => {
      const { result } = renderHook(() => useCropParameters());

      // A valid rectangle (width/height >= 0) exercises the clamping branch
      // where Math.max(0, ...) is a no-op for the already-positive sizes.
      act(() => {
        result.current.updateParameter("cropArea", {
          x: 2,
          y: 3,
          width: 0,
          height: 5,
        });
      });

      const area = result.current.getCropArea();
      expect(area.width).toBe(0);
      expect(area.height).toBe(5);
    });

    test("passes non-rectangle values through unchanged", () => {
      const { result } = renderHook(() => useCropParameters());

      act(() => {
        result.current.updateParameter("autoCrop", true);
      });

      expect(result.current.parameters.autoCrop).toBe(true);
    });
  });

  test("resetParameters restores the default crop parameters", () => {
    const { result } = renderHook(() => useCropParameters());

    act(() => {
      result.current.updateParameter("autoCrop", true);
      result.current.setCropArea({ x: 1, y: 1, width: 10, height: 10 });
    });

    expect(result.current.parameters.autoCrop).toBe(true);

    act(() => {
      result.current.resetParameters();
    });

    expect(result.current.parameters).toStrictEqual(defaultParameters);
  });
});
