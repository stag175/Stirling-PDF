import { describe, expect, it } from "vitest";
import {
  computeBoxes,
  Box,
  Sheet,
} from "@app/components/tools/pageLayout/utils/computeBoxes";
import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

// A pure-geometry helper that mirrors the layout fields consumed by computeBoxes.
// computeBoxes only reads mode / arrangement / readingDirection / pagesPerSheet /
// rows / cols, so the remaining PageLayoutParameters fields are filled with
// inert defaults to satisfy the type without affecting the output.
function makeParams(
  overrides: Partial<PageLayoutParameters>,
): PageLayoutParameters {
  return {
    mode: "DEFAULT",
    pagesPerSheet: 4,
    rows: 1,
    cols: 1,
    orientation: "PORTRAIT",
    arrangement: "BY_COLUMNS",
    readingDirection: "LTR",
    addBorder: false,
    innerMargin: 0,
    topMargin: 0,
    bottomMargin: 0,
    leftMargin: 0,
    rightMargin: 0,
    borderWidth: 1,
    ...overrides,
  };
}

// Project a box down to the geometric fields we want to assert on, so labels can
// be checked separately and floating point comparisons stay exact for the round
// numbers used in these fixtures.
function geom(box: Box) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

const UNIT_SHEET: Sheet = { x: 0, y: 0, width: 100, height: 100 };

describe("computeBoxes", () => {
  describe("DEFAULT mode grid derivation", () => {
    it("derives a 2x2 grid for 4 pages-per-sheet", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({ mode: "DEFAULT", pagesPerSheet: 4 }),
      );

      // cols = ceil(sqrt(4)) = 2, rows = ceil(4/2) = 2 -> exactly 4 boxes.
      expect(boxes).toHaveLength(4);
      // cellWidth = cellHeight = 100/2 = 50, margin = min(50,50)*0.1 = 5.
      for (const box of boxes) {
        expect(box.width).toBe(40);
        expect(box.height).toBe(40);
      }
    });

    it("derives a 3x3 grid for 9 pages-per-sheet with no remainder", () => {
      const boxes = computeBoxes(
        { x: 0, y: 0, width: 90, height: 90 },
        makeParams({ mode: "DEFAULT", pagesPerSheet: 9 }),
      );

      // cols = ceil(sqrt(9)) = 3, rows = ceil(9/3) = 3.
      expect(boxes).toHaveLength(9);
      // cellWidth = cellHeight = 90/3 = 30, margin = 3, inner size = 24.
      expect(geom(boxes[0])).toEqual({ x: 3, y: 3, width: 24, height: 24 });
      // Last box sits in the bottom-right cell: col=2, row=2 -> 60 + 3 = 63.
      expect(geom(boxes[8])).toEqual({ x: 63, y: 63, width: 24, height: 24 });
    });

    it("derives a 2x3 grid for 5 pages-per-sheet (ceil rounding)", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 5,
          arrangement: "BY_ROWS",
          readingDirection: "LTR",
        }),
      );

      // cols = ceil(sqrt(5)) = 3, rows = ceil(5/3) = 2.
      // pagesPerSheet stays at the requested 5 (NOT cols*rows = 6).
      expect(boxes).toHaveLength(5);
      // cellWidth = 100/3, cellHeight = 100/2 = 50, margin = min(33.33, 50)*0.1.
      const cellWidth = 100 / 3;
      const cellHeight = 50;
      const margin = Math.min(cellWidth, cellHeight) * 0.1;
      // Index 4 (BY_ROWS, LTR): row = floor(4/3) = 1, col = 4 % 3 = 1.
      expect(boxes[4].x).toBeCloseTo(0 + 1 * cellWidth + margin, 10);
      expect(boxes[4].y).toBeCloseTo(0 + 1 * cellHeight + margin, 10);
      expect(boxes[4].width).toBeCloseTo(cellWidth - margin * 2, 10);
      expect(boxes[4].label).toBe(5);
    });
  });

  describe("BY_ROWS arrangement", () => {
    it("fills left-to-right across each row for LTR", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 4,
          arrangement: "BY_ROWS",
          readingDirection: "LTR",
        }),
      );

      // 2x2 grid, margin 5, inner size 40.
      expect(geom(boxes[0])).toEqual({ x: 5, y: 5, width: 40, height: 40 });
      expect(geom(boxes[1])).toEqual({ x: 55, y: 5, width: 40, height: 40 });
      expect(geom(boxes[2])).toEqual({ x: 5, y: 55, width: 40, height: 40 });
      expect(geom(boxes[3])).toEqual({ x: 55, y: 55, width: 40, height: 40 });
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4]);
    });

    it("mirrors columns right-to-left for RTL while keeping rows top-down", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 4,
          arrangement: "BY_ROWS",
          readingDirection: "RTL",
        }),
      );

      // RTL: col = cols-1-(i%cols). Row order unchanged.
      expect(geom(boxes[0])).toEqual({ x: 55, y: 5, width: 40, height: 40 });
      expect(geom(boxes[1])).toEqual({ x: 5, y: 5, width: 40, height: 40 });
      expect(geom(boxes[2])).toEqual({ x: 55, y: 55, width: 40, height: 40 });
      expect(geom(boxes[3])).toEqual({ x: 5, y: 55, width: 40, height: 40 });
      // Labels still follow source page order regardless of mirroring.
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4]);
    });
  });

  describe("BY_COLUMNS arrangement", () => {
    it("fills top-to-bottom down each column for LTR", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 4,
          arrangement: "BY_COLUMNS",
          readingDirection: "LTR",
        }),
      );

      // BY_COLUMNS LTR: row = i % rows, col = floor(i / rows).
      expect(geom(boxes[0])).toEqual({ x: 5, y: 5, width: 40, height: 40 });
      expect(geom(boxes[1])).toEqual({ x: 5, y: 55, width: 40, height: 40 });
      expect(geom(boxes[2])).toEqual({ x: 55, y: 5, width: 40, height: 40 });
      expect(geom(boxes[3])).toEqual({ x: 55, y: 55, width: 40, height: 40 });
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4]);
    });

    it("mirrors columns right-to-left for RTL while keeping rows top-down", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 4,
          arrangement: "BY_COLUMNS",
          readingDirection: "RTL",
        }),
      );

      // BY_COLUMNS RTL: row = i % rows, col = cols-1-floor(i / rows).
      expect(geom(boxes[0])).toEqual({ x: 55, y: 5, width: 40, height: 40 });
      expect(geom(boxes[1])).toEqual({ x: 55, y: 55, width: 40, height: 40 });
      expect(geom(boxes[2])).toEqual({ x: 5, y: 5, width: 40, height: 40 });
      expect(geom(boxes[3])).toEqual({ x: 5, y: 55, width: 40, height: 40 });
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4]);
    });
  });

  describe("CUSTOM mode", () => {
    it("uses rows/cols directly and computes pages-per-sheet as cols*rows", () => {
      const boxes = computeBoxes(
        { x: 0, y: 0, width: 120, height: 60 },
        makeParams({
          mode: "CUSTOM",
          rows: 2,
          cols: 3,
          // pagesPerSheet is ignored entirely in CUSTOM mode.
          pagesPerSheet: 999,
          arrangement: "BY_ROWS",
          readingDirection: "LTR",
        }),
      );

      // cols=3, rows=2 -> 6 boxes regardless of pagesPerSheet.
      expect(boxes).toHaveLength(6);
      // cellWidth = 120/3 = 40, cellHeight = 60/2 = 30, margin = 3.
      // Box 0: row 0, col 0.
      expect(geom(boxes[0])).toEqual({ x: 3, y: 3, width: 34, height: 24 });
      // Box 5: BY_ROWS LTR -> row = floor(5/3) = 1, col = 5 % 3 = 2.
      expect(geom(boxes[5])).toEqual({ x: 83, y: 33, width: 34, height: 24 });
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("respects non-square aspect ratios when picking the margin", () => {
      // Wide, short cells: cellHeight is the smaller dimension, so it drives margin.
      const boxes = computeBoxes(
        { x: 0, y: 0, width: 200, height: 20 },
        makeParams({ mode: "CUSTOM", rows: 1, cols: 2 }),
      );

      // cellWidth = 100, cellHeight = 20, margin = min(100, 20) * 0.1 = 2.
      expect(boxes).toHaveLength(2);
      expect(geom(boxes[0])).toEqual({ x: 2, y: 2, width: 96, height: 16 });
      // BY_COLUMNS LTR (the makeParams default): col = floor(1/1) = 1.
      expect(geom(boxes[1])).toEqual({ x: 102, y: 2, width: 96, height: 16 });
    });
  });

  describe("sheet offset and edge cases", () => {
    it("translates every box by the sheet origin", () => {
      const boxes = computeBoxes(
        { x: 10, y: 20, width: 100, height: 100 },
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 4,
          arrangement: "BY_ROWS",
          readingDirection: "LTR",
        }),
      );

      // Same 2x2 grid as the unit sheet, shifted by (10, 20).
      expect(geom(boxes[0])).toEqual({ x: 15, y: 25, width: 40, height: 40 });
      expect(geom(boxes[3])).toEqual({ x: 65, y: 75, width: 40, height: 40 });
    });

    it("produces a single full-sheet box for a 1x1 layout", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({ mode: "DEFAULT", pagesPerSheet: 1 }),
      );

      // cols = ceil(sqrt(1)) = 1, rows = ceil(1/1) = 1.
      // cellWidth = cellHeight = 100, margin = 10, inner = 80.
      expect(boxes).toHaveLength(1);
      expect(geom(boxes[0])).toEqual({ x: 10, y: 10, width: 80, height: 80 });
      expect(boxes[0].label).toBe(1);
    });

    it("returns an empty array when the grid has no cells", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({ mode: "CUSTOM", rows: 0, cols: 0 }),
      );

      // pagesPerSheet = cols * rows = 0, so the loop never runs.
      expect(boxes).toEqual([]);
    });

    it("assigns 1-based sequential labels across the whole sheet", () => {
      const boxes = computeBoxes(
        UNIT_SHEET,
        makeParams({
          mode: "DEFAULT",
          pagesPerSheet: 6,
          arrangement: "BY_COLUMNS",
          readingDirection: "RTL",
        }),
      );

      // cols = ceil(sqrt(6)) = 3, rows = ceil(6/3) = 2 -> 6 pages.
      expect(boxes.map((b) => b.label)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });
});
