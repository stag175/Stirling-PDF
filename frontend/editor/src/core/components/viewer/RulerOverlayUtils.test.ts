import { describe, expect, it } from "vitest";
import {
  angleDeg,
  dist,
  formatDist,
  formatImperialFromFeet,
  formatInches,
  formatMetricFromMetres,
  formatScaled,
  isImperialUnit,
  midpoint,
  perpUnit,
  pickScale,
  scaledCross,
  type MeasureScale,
  type PageMeasureScales,
  type PageScaleInfo,
} from "@app/components/viewer/RulerOverlayUtils";

describe("dist", () => {
  it("returns 0 for identical points", () => {
    expect(dist({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it("computes a 3-4-5 right triangle hypotenuse", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = { x: -2, y: 7 };
    const b = { x: 5, y: -1 };
    expect(dist(a, b)).toBe(dist(b, a));
  });

  it("handles negative coordinates", () => {
    expect(dist({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("midpoint", () => {
  it("returns the point itself when both are equal", () => {
    expect(midpoint({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  });

  it("averages coordinates", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it("handles negative coordinates producing fractional results", () => {
    expect(midpoint({ x: -1, y: -3 }, { x: 2, y: 0 })).toEqual({
      x: 0.5,
      y: -1.5,
    });
  });
});

describe("perpUnit", () => {
  it("returns a unit-length perpendicular vector for a horizontal line", () => {
    // Direction (1,0) → perpendicular (0,1). Use += 0 to normalise the signed
    // zero that -dy/len produces when dy === 0.
    const { nx, ny } = perpUnit({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(nx + 0).toBe(0);
    expect(ny).toBe(1);
  });

  it("returns a unit-length perpendicular vector for a vertical line", () => {
    // Direction (0,1) → perpendicular (-1,0)
    const { nx, ny } = perpUnit({ x: 0, y: 0 }, { x: 0, y: 5 });
    expect(nx).toBe(-1);
    expect(ny + 0).toBe(0);
  });

  it("produces a vector of length 1 for an arbitrary direction", () => {
    const { nx, ny } = perpUnit({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(nx, ny)).toBeCloseTo(1, 12);
  });

  it("is orthogonal to the input direction (dot product 0)", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 6, y: -3 };
    const { nx, ny } = perpUnit(a, b);
    const dot = (b.x - a.x) * nx + (b.y - a.y) * ny;
    expect(dot).toBeCloseTo(0, 12);
  });

  it("avoids division by zero for identical points (len falls back to 1)", () => {
    const { nx, ny } = perpUnit({ x: 4, y: 4 }, { x: 4, y: 4 });
    // -0/0 are normalised with += 0; the point is the result is finite (not NaN).
    expect(nx + 0).toBe(0);
    expect(ny + 0).toBe(0);
  });
});

describe("angleDeg", () => {
  it("is 0 for a horizontal line", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });

  it("is 90 for a vertical line", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it("is 45 for a diagonal line", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 5, y: 5 })).toBeCloseTo(45, 10);
  });

  it("collapses all four quadrants to the 0-90 range (uses absolute deltas)", () => {
    const ne = angleDeg({ x: 0, y: 0 }, { x: 3, y: 4 });
    const sw = angleDeg({ x: 0, y: 0 }, { x: -3, y: -4 });
    const se = angleDeg({ x: 0, y: 0 }, { x: 3, y: -4 });
    expect(ne).toBeCloseTo(sw, 10);
    expect(ne).toBeCloseTo(se, 10);
    expect(ne).toBeGreaterThanOrEqual(0);
    expect(ne).toBeLessThanOrEqual(90);
  });
});

describe("formatDist (metric from PDF points)", () => {
  it("formats sub-100mm in millimetres with one decimal", () => {
    // 72 pts = 1 in = 25.4 mm
    expect(formatDist(72)).toBe("25.4 mm");
  });

  it("uses centimetres at the 100mm boundary", () => {
    // mm == 100 is NOT < 100, so it switches to cm
    const ptsFor100mm = (100 / 25.4) * 72;
    expect(formatDist(ptsFor100mm)).toBe("10.0 cm");
  });

  it("formats hundreds of mm in centimetres", () => {
    // 720 pts = 10 in = 254 mm = 25.4 cm
    expect(formatDist(720)).toBe("25.4 cm");
  });

  it("uses metres at the 1000mm boundary", () => {
    const ptsFor1000mm = (1000 / 25.4) * 72;
    expect(formatDist(ptsFor1000mm)).toBe("1.00 m");
  });

  it("formats large distances in metres with two decimals", () => {
    // 7200 pts = 100 in = 2540 mm = 2.54 m
    expect(formatDist(7200)).toBe("2.54 m");
  });

  it("formats zero as 0.0 mm", () => {
    expect(formatDist(0)).toBe("0.0 mm");
  });
});

describe("formatInches (imperial from PDF points)", () => {
  it("formats sub-foot values in inches with two decimals", () => {
    expect(formatInches(72)).toBe("1.00 in");
  });

  it("uses inches just under one foot", () => {
    // 11 in worth of points
    expect(formatInches(11 * 72)).toBe("11.00 in");
  });

  it("switches to feet at exactly 12 inches", () => {
    // 12 in is NOT < 12, so feet
    expect(formatInches(12 * 72)).toBe("1.00 ft");
  });

  it("formats multiple feet", () => {
    expect(formatInches(30 * 72)).toBe("2.50 ft");
  });

  it("formats zero as 0.00 in", () => {
    expect(formatInches(0)).toBe("0.00 in");
  });
});

describe("isImperialUnit", () => {
  it.each(["ft", "in", "yd", "mi"])("recognises imperial unit %s", (u) => {
    expect(isImperialUnit(u)).toBe(true);
  });

  it.each(["m", "cm", "mm", "km", "pt"])(
    "rejects metric/unknown unit %s",
    (u) => {
      expect(isImperialUnit(u)).toBe(false);
    },
  );

  it("is case-insensitive and trims whitespace", () => {
    expect(isImperialUnit("  FT ")).toBe(true);
    expect(isImperialUnit("In")).toBe(true);
    expect(isImperialUnit(" M ")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isImperialUnit("")).toBe(false);
  });
});

describe("formatScaled (real-world value with adaptive precision)", () => {
  const scale: MeasureScale = { factor: 1, unit: "m", ratioLabel: "" };

  it("uses 0 decimals at or above 1000", () => {
    expect(formatScaled(1000, scale)).toBe("1000 m");
    expect(formatScaled(2500.7, scale)).toBe("2501 m");
  });

  it("uses 1 decimal in [100, 1000)", () => {
    expect(formatScaled(100, scale)).toBe("100.0 m");
    expect(formatScaled(999.99, scale)).toBe("1000.0 m");
  });

  it("uses 2 decimals in [10, 100)", () => {
    expect(formatScaled(10, scale)).toBe("10.00 m");
    expect(formatScaled(42.5, scale)).toBe("42.50 m");
  });

  it("uses 3 decimals below 10", () => {
    expect(formatScaled(1, scale)).toBe("1.000 m");
    expect(formatScaled(0, scale)).toBe("0.000 m");
  });

  it("applies the scale factor and unit label", () => {
    const ft: MeasureScale = { factor: 0.5, unit: "ft", ratioLabel: "" };
    // 24 * 0.5 = 12 → [10,100) bucket
    expect(formatScaled(24, ft)).toBe("12.00 ft");
  });
});

describe("formatMetricFromMetres", () => {
  it("formats kilometres at/above 1000 m", () => {
    expect(formatMetricFromMetres(1000)).toBe("1.00 km");
    expect(formatMetricFromMetres(2540)).toBe("2.54 km");
  });

  it("formats metres in [1, 1000)", () => {
    expect(formatMetricFromMetres(1)).toBe("1.0 m");
    expect(formatMetricFromMetres(3.048)).toBe("3.0 m");
  });

  it("formats centimetres in [0.1, 1)", () => {
    expect(formatMetricFromMetres(0.1)).toBe("10.0 cm");
    expect(formatMetricFromMetres(0.5)).toBe("50.0 cm");
  });

  it("formats millimetres below 0.1 m", () => {
    expect(formatMetricFromMetres(0.05)).toBe("50.0 mm");
    expect(formatMetricFromMetres(0)).toBe("0.0 mm");
  });
});

describe("formatImperialFromFeet", () => {
  it("formats feet at/above 1 ft", () => {
    expect(formatImperialFromFeet(1)).toBe("1.00 ft");
    expect(formatImperialFromFeet(10)).toBe("10.00 ft");
  });

  it("formats inches below 1 ft", () => {
    expect(formatImperialFromFeet(0.5)).toBe("6.00 in");
    expect(formatImperialFromFeet(0)).toBe("0.00 in");
  });
});

describe("scaledCross (value in the opposite unit system)", () => {
  it("returns metric for an imperial scale", () => {
    // 72 pts at 0.138889 ft/pt ≈ 10 ft = 3.048 m → "3.0 m"
    const ft: MeasureScale = {
      factor: 0.138889,
      unit: "ft",
      ratioLabel: "",
    };
    expect(scaledCross(72, ft)).toBe("3.0 m");
  });

  it("returns imperial for a metric scale", () => {
    // 72 pts at 1 m/pt = 72 m = 236.22 ft → "236.22 ft"
    const m: MeasureScale = { factor: 1, unit: "m", ratioLabel: "" };
    expect(scaledCross(72, m)).toBe("236.22 ft");
  });

  it("returns null for an unrecognised unit", () => {
    const px: MeasureScale = { factor: 1, unit: "px", ratioLabel: "" };
    expect(scaledCross(100, px)).toBeNull();
  });

  it("normalises unit casing/whitespace when looking up the conversion", () => {
    const m: MeasureScale = { factor: 0.0254, unit: " MM ", ratioLabel: "" };
    // mm is metric → cross result is imperial; non-null proves the lookup hit
    expect(scaledCross(72, m)).not.toBeNull();
  });

  it("returns metric km for very large imperial values", () => {
    // mi scale: factor maps 1 pt → 1 mi; 1 pt → 1609.344 m → "1.61 km"
    const mi: MeasureScale = { factor: 1, unit: "mi", ratioLabel: "" };
    expect(scaledCross(1, mi)).toBe("1.61 km");
  });
});

describe("pickScale", () => {
  const fullPageScale: MeasureScale = {
    factor: 2,
    unit: "m",
    ratioLabel: "full",
  };
  const regionScale: MeasureScale = {
    factor: 5,
    unit: "ft",
    ratioLabel: "region",
  };

  it("returns null when start and end are on different pages", () => {
    const scales: PageMeasureScales = new Map();
    expect(
      pickScale(
        { pageIndex: 0, x: 1, y: 1 },
        { pageIndex: 1, x: 2, y: 2 },
        scales,
      ),
    ).toBeNull();
  });

  it("returns null when the page has no scale info", () => {
    const scales: PageMeasureScales = new Map();
    expect(
      pickScale(
        { pageIndex: 0, x: 1, y: 1 },
        { pageIndex: 0, x: 2, y: 2 },
        scales,
      ),
    ).toBeNull();
  });

  it("returns null when the page has an empty viewports array", () => {
    const info: PageScaleInfo = { viewports: [], pageHeight: 800 };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 1, y: 1 },
        { pageIndex: 0, x: 2, y: 2 },
        scales,
      ),
    ).toBeNull();
  });

  it("returns the whole-page scale for a null bbox immediately", () => {
    const info: PageScaleInfo = {
      viewports: [{ bbox: null, scale: fullPageScale }],
      pageHeight: 800,
    };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 100, y: 100 },
        { pageIndex: 0, x: 200, y: 200 },
        scales,
      ),
    ).toBe(fullPageScale);
  });

  it("selects the viewport whose bbox contains the flipped-y midpoint", () => {
    // Midpoint screen coords: mx = (100+200)/2 = 150; my = pageHeight - 150 = 650
    // bbox covers x[100,200], y[600,700] in PDF (bottom-left origin) → contains (150,650)
    const info: PageScaleInfo = {
      viewports: [{ bbox: [100, 600, 200, 700], scale: regionScale }],
      pageHeight: 800,
    };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 100, y: 100 },
        { pageIndex: 0, x: 200, y: 200 },
        scales,
      ),
    ).toBe(regionScale);
  });

  it("returns null when no bbox contains the midpoint", () => {
    const info: PageScaleInfo = {
      viewports: [{ bbox: [0, 0, 50, 50], scale: regionScale }],
      pageHeight: 800,
    };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 100, y: 100 },
        { pageIndex: 0, x: 200, y: 200 },
        scales,
      ),
    ).toBeNull();
  });

  it("tolerates inverted bbox corners via min/max normalisation", () => {
    // Same region but with corners swapped (x1<x0, y1<y0)
    const info: PageScaleInfo = {
      viewports: [{ bbox: [200, 700, 100, 600], scale: regionScale }],
      pageHeight: 800,
    };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 100, y: 100 },
        { pageIndex: 0, x: 200, y: 200 },
        scales,
      ),
    ).toBe(regionScale);
  });

  it("picks the first matching viewport when several overlap", () => {
    const second: MeasureScale = { factor: 9, unit: "m", ratioLabel: "2nd" };
    const info: PageScaleInfo = {
      viewports: [
        { bbox: [0, 0, 1000, 1000], scale: regionScale },
        { bbox: [0, 0, 1000, 1000], scale: second },
      ],
      pageHeight: 800,
    };
    const scales: PageMeasureScales = new Map([[0, info]]);
    expect(
      pickScale(
        { pageIndex: 0, x: 100, y: 100 },
        { pageIndex: 0, x: 200, y: 200 },
        scales,
      ),
    ).toBe(regionScale);
  });
});
