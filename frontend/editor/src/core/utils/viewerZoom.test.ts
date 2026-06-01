import { describe, it, expect } from "vitest";
import {
  DEFAULT_VISIBILITY_THRESHOLD,
  DEFAULT_FALLBACK_ZOOM,
  determineAutoZoom,
  type AutoZoomParams,
} from "@app/utils/viewerZoom";

// Baseline params kept intentionally minimal; each test overrides what it needs.
const buildParams = (
  overrides: Partial<AutoZoomParams> = {},
): AutoZoomParams => ({
  viewportWidth: 1000,
  viewportHeight: 800,
  fitWidthZoom: 1,
  pagesPerSpread: 1,
  pageRect: null,
  metadataAspectRatio: null,
  ...overrides,
});

describe("determineAutoZoom - fallback branch (no usable aspect ratio)", () => {
  it("1) falls back when neither pageRect nor metadata provide a ratio", () => {
    const result = determineAutoZoom(buildParams({ fitWidthZoom: 2 }));
    // min(fitWidthZoom=2, fallbackZoom=1.44) === 1.44
    expect(result).toEqual({ type: "fallback", zoom: DEFAULT_FALLBACK_ZOOM });
  });

  it("2) fallback clamps to fitWidthZoom when fitWidth is the smaller value", () => {
    const result = determineAutoZoom(
      buildParams({ fitWidthZoom: 0.5, metadataAspectRatio: null }),
    );
    // min(0.5, 1.44) === 0.5
    expect(result).toEqual({ type: "fallback", zoom: 0.5 });
  });

  it("3) fallback respects a custom fallbackZoom", () => {
    const result = determineAutoZoom(
      buildParams({ fitWidthZoom: 5, fallbackZoom: 2.5 }),
    );
    expect(result).toEqual({ type: "fallback", zoom: 2.5 });
  });

  it("4) treats a zero pageRect width as no ratio and falls back", () => {
    const result = determineAutoZoom(
      buildParams({
        fitWidthZoom: 3,
        pageRect: { width: 0, height: 500 },
      }),
    );
    expect(result).toEqual({ type: "fallback", zoom: DEFAULT_FALLBACK_ZOOM });
  });

  it("5) falls back when metadata aspect ratio is zero", () => {
    const result = determineAutoZoom(
      buildParams({ fitWidthZoom: 3, metadataAspectRatio: 0 }),
    );
    expect(result).toEqual({ type: "fallback", zoom: DEFAULT_FALLBACK_ZOOM });
  });

  it("6) falls back when metadata aspect ratio is negative", () => {
    const result = determineAutoZoom(
      buildParams({ fitWidthZoom: 3, metadataAspectRatio: -2 }),
    );
    expect(result).toEqual({ type: "fallback", zoom: DEFAULT_FALLBACK_ZOOM });
  });
});

describe("determineAutoZoom - aspect ratio source precedence", () => {
  it("7) prefers pageRect ratio over metadata when pageRect width > 0", () => {
    // pageRect ratio = 1100/850 ~= 1.294 (portrait). If metadata (a huge
    // landscape ratio) were used instead, the result would differ.
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 800,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 850, height: 1100 },
      metadataAspectRatio: 0.1,
    });
    const result = determineAutoZoom(params);

    const aspectRatio = 1100 / 850;
    const pageHeightAtFitWidth = (1000 / 1) * aspectRatio;
    const heightBasedZoom =
      (1 * (800 / pageHeightAtFitWidth)) / (DEFAULT_VISIBILITY_THRESHOLD / 100);
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
  });

  it("8) uses metadata ratio when pageRect is null", () => {
    const aspectRatio = 1.2941; // arbitrary portrait ratio
    const params = buildParams({
      pageRect: null,
      metadataAspectRatio: aspectRatio,
    });
    const result = determineAutoZoom(params);

    const pageHeightAtFitWidth = (1000 / 1) * aspectRatio;
    const heightBasedZoom =
      (1 * (800 / pageHeightAtFitWidth)) / (DEFAULT_VISIBILITY_THRESHOLD / 100);
    // heightBasedZoom < fitWidthZoom(1) -> adjust
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
  });
});

describe("determineAutoZoom - portrait pages (aspectRatio > 1)", () => {
  it("8a) zooms out (adjust) when fitWidth would not show enough height", () => {
    // Tall portrait page in a short viewport -> must zoom out.
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 400,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 500, height: 1000 }, // ratio 2.0
    });
    const result = determineAutoZoom(params);

    const aspectRatio = 2.0;
    const pageHeightAtFitWidth = 1000 * aspectRatio; // 2000
    const heightBasedZoom =
      (1 * (400 / pageHeightAtFitWidth)) / (DEFAULT_VISIBILITY_THRESHOLD / 100);
    expect(result.type).toBe("adjust");
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
    expect(heightBasedZoom).toBeLessThan(1);
  });

  it("9) returns fitWidth when fitWidth already shows enough height", () => {
    // Short portrait page in a tall viewport -> width is the binding constraint.
    const params = buildParams({
      viewportWidth: 100,
      viewportHeight: 5000,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 800, height: 900 }, // ratio 1.125 portrait
    });
    const result = determineAutoZoom(params);
    expect(result).toEqual({ type: "fitWidth" });
  });

  it("10) honors a custom visibilityThreshold for portrait pages", () => {
    const aspectRatio = 1.4;
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 800,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      metadataAspectRatio: aspectRatio,
      visibilityThreshold: 50,
    });
    const result = determineAutoZoom(params);

    const pageHeightAtFitWidth = 1000 * aspectRatio; // 1400
    const heightBasedZoom = (1 * (800 / pageHeightAtFitWidth)) / (50 / 100);
    // With threshold 50, heightBasedZoom ~= 1.142 >= 1 -> fitWidth.
    expect(heightBasedZoom).toBeGreaterThanOrEqual(1);
    expect(result).toEqual({ type: "fitWidth" });
  });
});

describe("determineAutoZoom - landscape pages (aspectRatio < 1)", () => {
  it("11) requires 100% visibility, ignoring visibilityThreshold", () => {
    // Landscape page; targetVisibility forced to 100 regardless of threshold.
    const aspectRatio = 0.5; // landscape (wide)
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 300,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 1000, height: 500 }, // ratio 0.5
      visibilityThreshold: 10, // should be ignored for landscape
    });
    const result = determineAutoZoom(params);

    const pageHeightAtFitWidth = 1000 * aspectRatio; // 500
    const heightBasedZoom = (1 * (300 / pageHeightAtFitWidth)) / (100 / 100);
    // 0.6 < 1 -> adjust; uses 100% visibility, not the threshold of 10.
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
    expect(heightBasedZoom).toBeCloseTo(0.6, 10);
  });

  it("12) returns fitWidth for a landscape page in a tall viewport", () => {
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 2000,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 1000, height: 500 }, // ratio 0.5
    });
    const result = determineAutoZoom(params);
    // pageHeightAtFitWidth = 500; heightBasedZoom = (2000/500) = 4 >= 1
    expect(result).toEqual({ type: "fitWidth" });
  });
});

describe("determineAutoZoom - square pages and spread handling", () => {
  it("13) treats a square page (ratio === 1) as portrait (uses threshold)", () => {
    // ratio === 1 is NOT < 1, so isLandscape is false -> threshold applies.
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 500,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 600, height: 600 }, // ratio 1.0
      visibilityThreshold: 70,
    });
    const result = determineAutoZoom(params);

    const pageHeightAtFitWidth = 1000 * 1; // 1000
    const heightBasedZoom = (1 * (500 / pageHeightAtFitWidth)) / (70 / 100);
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
  });

  it("14) divides viewport width by pagesPerSpread for two-up spreads", () => {
    const aspectRatio = 1.3;
    const params = buildParams({
      viewportWidth: 2000,
      viewportHeight: 800,
      fitWidthZoom: 1,
      pagesPerSpread: 2,
      metadataAspectRatio: aspectRatio,
    });
    const result = determineAutoZoom(params);

    const pageHeightAtFitWidth = (2000 / 2) * aspectRatio; // 1300
    const heightBasedZoom =
      (1 * (800 / pageHeightAtFitWidth)) / (DEFAULT_VISIBILITY_THRESHOLD / 100);
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
  });
});

describe("determineAutoZoom - boundary between adjust and fitWidth", () => {
  it("15) returns fitWidth at the exact equality boundary (not strictly less)", () => {
    // Construct params so heightBasedZoom === fitWidthZoom exactly.
    // heightBasedZoom = fitWidthZoom * (vh / (vw*ratio)) / (target/100)
    // Pick ratio=1, target=100, vw=1000, vh=1000 -> heightBasedZoom = 1 = fitWidthZoom
    // ratio=1 is portrait, so set threshold=100 to drive target to 100.
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 1000,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 700, height: 700 }, // ratio 1
      visibilityThreshold: 100,
    });
    const result = determineAutoZoom(params);
    // heightBasedZoom === 1 is NOT < fitWidthZoom(1) -> fitWidth.
    expect(result).toEqual({ type: "fitWidth" });
  });

  it("16) returns adjust just below the boundary", () => {
    // Slightly taller page than the boundary case -> heightBasedZoom < 1.
    const params = buildParams({
      viewportWidth: 1000,
      viewportHeight: 990,
      fitWidthZoom: 1,
      pagesPerSpread: 1,
      pageRect: { width: 700, height: 700 }, // ratio 1
      visibilityThreshold: 100,
    });
    const result = determineAutoZoom(params);

    const heightBasedZoom = (1 * (990 / 1000)) / (100 / 100); // 0.99
    expect(result).toEqual({ type: "adjust", zoom: heightBasedZoom });
    expect(heightBasedZoom).toBeLessThan(1);
  });
});

describe("determineAutoZoom - exported defaults", () => {
  it("17) exposes the documented default constants", () => {
    expect(DEFAULT_VISIBILITY_THRESHOLD).toBe(70);
    expect(DEFAULT_FALLBACK_ZOOM).toBe(1.44);
  });
});
