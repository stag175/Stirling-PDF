import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSVG,
  createClipPath,
  animateClipReveal,
  createRoundedRectPath,
  createScale,
  debounce,
} from "@app/components/shared/charts/utils/d3Utils";

/**
 * d3Utils.ts is a collection of small, pure-ish D3 helpers. The most
 * interesting target is createRoundedRectPath — pure deterministic SVG-path
 * string math whose corner branches and zero-size guard we assert against
 * exact, hand-computed path strings. The DOM helpers (createSVG/createClipPath/
 * animateClipReveal) operate on real elements via jsdom (vitest's configured
 * environment), and createScale wraps d3.scaleLinear. debounce is exercised
 * deterministically with fake timers. No network/storage/SDK deps exist in
 * this module, so nothing needs to be mocked for determinism.
 */
describe("d3Utils", () => {
  describe("createRoundedRectPath", () => {
    it("builds the full all-corners path with exact arc commands", () => {
      // x=10 y=20 w=100 h=50 r=5, all four corners rounded (defaults).
      // Hand-computed below; this pins every branch's emitted substring.
      const path = createRoundedRectPath(10, 20, 100, 50, 5);
      expect(path).toBe(
        "M 15 20" +
          " L 105 20 A 5 5 0 0 1 110 25" + // topRight
          " L 110 65 A 5 5 0 0 1 105 70" + // bottomRight
          " L 15 70 A 5 5 0 0 1 10 65" + // bottomLeft
          " L 10 25 A 5 5 0 0 1 15 20" + // topLeft
          " Z",
      );
    });

    it("always starts with the move command offset by the top-left radius", () => {
      const path = createRoundedRectPath(0, 0, 40, 30, 8);
      expect(path.startsWith("M 8 0")).toBe(true);
    });

    it("always terminates the path with a close (Z) command", () => {
      const path = createRoundedRectPath(0, 0, 40, 30, 8);
      expect(path.endsWith(" Z")).toBe(true);
    });

    it("returns an empty string when width is zero (zero-size guard)", () => {
      expect(createRoundedRectPath(0, 0, 0, 50, 5)).toBe("");
    });

    it("returns an empty string when height is zero (zero-size guard)", () => {
      expect(createRoundedRectPath(0, 0, 50, 0, 5)).toBe("");
    });

    it("returns an empty string for negative width", () => {
      expect(createRoundedRectPath(0, 0, -10, 50, 5)).toBe("");
    });

    it("returns an empty string for negative height", () => {
      expect(createRoundedRectPath(0, 0, 50, -10, 5)).toBe("");
    });

    it("emits straight lines (no arcs) when every corner is disabled", () => {
      const path = createRoundedRectPath(0, 0, 100, 60, 5, {
        topLeft: false,
        topRight: false,
        bottomLeft: false,
        bottomRight: false,
      });
      // Move uses topLeftRadius=0, so it starts at the bare x.
      expect(path).toBe(
        "M 0 0" +
          " L 100 0" + // topRight false branch
          " L 100 60" + // bottomRight false branch
          " L 0 60" + // bottomLeft false branch
          " L 0 0" + // topLeft false branch
          " Z",
      );
      expect(path).not.toContain("A ");
    });

    it("rounds only the top corners (bar-chart style) when bottoms are disabled", () => {
      const path = createRoundedRectPath(0, 0, 20, 10, 4, {
        bottomLeft: false,
        bottomRight: false,
      });
      expect(path).toBe(
        "M 4 0" +
          " L 16 0 A 4 4 0 0 1 20 4" + // topRight (rounded)
          " L 20 10" + // bottomRight (straight)
          " L 0 10" + // bottomLeft (straight)
          " L 0 4 A 4 4 0 0 1 4 0" + // topLeft (rounded)
          " Z",
      );
    });

    it("rounds only the top-left corner, leaving the other three square", () => {
      const path = createRoundedRectPath(0, 0, 50, 50, 6, {
        topLeft: true,
        topRight: false,
        bottomLeft: false,
        bottomRight: false,
      });
      expect(path).toBe(
        "M 6 0" +
          " L 50 0" + // topRight straight
          " L 50 50" + // bottomRight straight
          " L 0 50" + // bottomLeft straight
          " L 0 6 A 6 6 0 0 1 6 0" + // topLeft rounded
          " Z",
      );
      // Exactly one arc command should be present.
      expect(path.match(/A /g)?.length).toBe(1);
    });

    it("is deterministic for repeated calls with identical args", () => {
      const a = createRoundedRectPath(3, 7, 22, 9, 2, { topRight: false });
      const b = createRoundedRectPath(3, 7, 22, 9, 2, { topRight: false });
      expect(a).toBe(b);
    });

    it("supports fractional coordinates and radii without rounding them", () => {
      const path = createRoundedRectPath(1.5, 2.5, 10, 4, 0.5);
      // Start point = x + topLeftRadius = 1.5 + 0.5 = 2 (no implicit rounding).
      expect(path.startsWith("M 2 2.5")).toBe(true);
    });
  });

  describe("createScale", () => {
    it("maps the domain endpoints to the range endpoints", () => {
      const scale = createScale([0, 100], [0, 500]);
      expect(scale(0)).toBe(0);
      expect(scale(100)).toBe(500);
    });

    it("linearly interpolates an interior domain value", () => {
      const scale = createScale([0, 100], [0, 500]);
      expect(scale(50)).toBe(250);
      expect(scale(25)).toBe(125);
    });

    it("exposes the configured domain and range", () => {
      const scale = createScale([10, 20], [200, 400]);
      expect(scale.domain()).toEqual([10, 20]);
      expect(scale.range()).toEqual([200, 400]);
    });

    it("handles an inverted range (descending output)", () => {
      const scale = createScale([0, 10], [100, 0]);
      expect(scale(0)).toBe(100);
      expect(scale(10)).toBe(0);
      expect(scale(5)).toBe(50);
    });

    it("extrapolates beyond the domain by default", () => {
      const scale = createScale([0, 10], [0, 100]);
      expect(scale(20)).toBe(200);
      expect(scale(-5)).toBe(-50);
    });
  });

  describe("createSVG (jsdom)", () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it("appends a single <svg> to the container with the expected attributes", () => {
      const svg = createSVG(container, { width: 300, height: 150 }, "my-chart");
      const node = svg.node();
      expect(node).not.toBeNull();
      expect(node?.tagName.toLowerCase()).toBe("svg");
      expect(container.querySelectorAll("svg").length).toBe(1);
      expect(node?.getAttribute("width")).toBe("100%");
      expect(node?.getAttribute("height")).toBe("150");
      expect(node?.getAttribute("viewBox")).toBe("0 0 300 150");
      expect(node?.getAttribute("class")).toBe("my-chart");
    });

    it("falls back to an empty class attribute when className is omitted", () => {
      const svg = createSVG(container, { width: 100, height: 80 });
      expect(svg.node()?.getAttribute("class")).toBe("");
    });
  });

  describe("createClipPath (jsdom)", () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it("creates a <defs><clipPath><rect> structure with width starting at 0", () => {
      const svg = createSVG(container, { width: 200, height: 120 });
      const clipRect = createClipPath(svg, "clip-123", {
        width: 200,
        height: 120,
      });

      const rectNode = clipRect.node();
      expect(rectNode?.tagName.toLowerCase()).toBe("rect");
      expect(rectNode?.getAttribute("x")).toBe("0");
      expect(rectNode?.getAttribute("y")).toBe("0");
      // Width begins collapsed (animated open later by animateClipReveal).
      expect(rectNode?.getAttribute("width")).toBe("0");
      expect(rectNode?.getAttribute("height")).toBe("120");

      const clipPathEl = svg.node()?.querySelector("defs clipPath");
      expect(clipPathEl?.getAttribute("id")).toBe("clip-123");
      expect(clipPathEl?.querySelector("rect")).toBe(rectNode);
    });
  });

  describe("animateClipReveal (jsdom)", () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    // Note: d3 transitions are driven by d3-timer's own internal clock
    // (requestAnimationFrame / performance.now), not Node's setTimeout, so
    // vitest fake timers can't deterministically advance them to completion.
    // We instead assert deterministic, observable side effects: the helper
    // runs the default-easing and custom-easing branches without throwing and
    // registers a pending d3 transition on the element (the `__transition`
    // marker d3 attaches when `.transition()` is scheduled).

    it("schedules a transition on the clip rect without throwing (default easing)", () => {
      const svg = createSVG(container, { width: 400, height: 100 });
      const clipRect = createClipPath(svg, "reveal-clip", {
        width: 400,
        height: 100,
      });
      const node = clipRect.node() as SVGRectElement & {
        __transition?: unknown;
      };

      expect(() =>
        animateClipReveal(clipRect, 400, { duration: 200 }),
      ).not.toThrow();

      // d3 attaches a `__transition` schedule object once a transition starts.
      expect(node.__transition).toBeDefined();
    });

    it("runs the custom-easing branch without throwing", () => {
      const svg = createSVG(container, { width: 400, height: 100 });
      const clipRect = createClipPath(svg, "reveal-clip-2", {
        width: 400,
        height: 100,
      });
      const node = clipRect.node() as SVGRectElement & {
        __transition?: unknown;
      };

      const linear = (t: number) => t;
      expect(() =>
        animateClipReveal(clipRect, 250, { duration: 100, easing: linear }),
      ).not.toThrow();

      expect(node.__transition).toBeDefined();
    });
  });

  describe("debounce (fake timers)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it("invokes the wrapped function only once after the wait elapses", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets the timer on each call (trailing-edge behavior)", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(60);
      debounced(); // resets the 100ms window
      vi.advanceTimersByTime(60); // 120ms total but only 60ms since last call
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(40); // now 100ms since the last call
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("forwards the most recent arguments to the wrapped function", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced("a", 1);
      debounced("b", 2);
      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("b", 2);
    });

    it("fires again for a call made after a previous invocation settled", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 30);

      debounced();
      vi.advanceTimersByTime(30);
      expect(fn).toHaveBeenCalledTimes(1);

      debounced();
      vi.advanceTimersByTime(30);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
