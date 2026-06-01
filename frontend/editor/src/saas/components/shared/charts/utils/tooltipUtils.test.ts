import { describe, it, expect, beforeEach } from "vitest";
import {
  createTooltipPositioner,
  createTooltipElement,
  type TooltipPosition,
} from "@app/components/shared/charts/utils/tooltipUtils";

/**
 * tooltipUtils.ts is pure DOM positioning math. Two concerns must be controlled
 * for determinism under jsdom:
 *
 *  1. `container.getBoundingClientRect()` — jsdom returns an all-zero rect by
 *     default, so we replace it with a fixed rect (top/left/width/height) so the
 *     clamping math (Math.min/Math.max against `bounds.width`) actually exercises
 *     its branches instead of always collapsing to 0.
 *  2. `tooltip.offsetWidth` / `tooltip.offsetHeight` — jsdom never lays out, so
 *     these are 0 unless we define them. We override the prototype getters via
 *     Object.defineProperty so the width/height feed into the position formulae.
 *
 * Both `event.clientX/clientY` are plain numbers we supply directly, so once the
 * rect and offset dims are fixed every output `px` string is fully deterministic.
 */

const CONTAINER_RECT = {
  top: 100,
  left: 200,
  width: 500,
  height: 400,
  right: 700,
  bottom: 500,
  x: 200,
  y: 100,
  toJSON: () => ({}),
} satisfies DOMRect;

const TOOLTIP_WIDTH = 80;
const TOOLTIP_HEIGHT = 40;
const GAP = 16;

/** Build a container whose getBoundingClientRect is pinned to CONTAINER_RECT. */
function makeContainer(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement("div");
  const merged = { ...CONTAINER_RECT, ...rect };
  el.getBoundingClientRect = () => merged as DOMRect;
  return el;
}

/** Build a tooltip whose offset dims are pinned via defineProperty. */
function makeTooltip(
  width = TOOLTIP_WIDTH,
  height = TOOLTIP_HEIGHT,
): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(el, "offsetHeight", {
    configurable: true,
    value: height,
  });
  return el;
}

/** Construct a MouseEvent carrying explicit client coordinates. */
function mouseAt(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent("mousemove", { clientX, clientY });
}

/** Parse a "<n>px" style string back to a number for arithmetic assertions. */
function px(value: string): number {
  expect(value.endsWith("px")).toBe(true);
  return Number(value.slice(0, -2));
}

describe("createTooltipPositioner", () => {
  it("returns an object exposing positionTooltip and hideTooltip functions", () => {
    const positioner = createTooltipPositioner("top");
    expect(typeof positioner.positionTooltip).toBe("function");
    expect(typeof positioner.hideTooltip).toBe("function");
  });

  describe("position = 'top'", () => {
    let positioner: ReturnType<typeof createTooltipPositioner>;
    let container: HTMLElement;
    let tooltip: HTMLElement;

    beforeEach(() => {
      positioner = createTooltipPositioner("top");
      container = makeContainer();
      tooltip = makeTooltip();
    });

    it("centers horizontally and sits above the cursor in the typical case", () => {
      // clientX 400 -> offsetX = 400 - 200 = 200; clientY 300 -> offsetY = 200.
      positioner.positionTooltip(mouseAt(400, 300), tooltip, container);

      // left = min(width - w - 10, max(10, offsetX - w/2))
      //      = min(500 - 80 - 10, max(10, 200 - 40)) = min(410, 160) = 160
      expect(px(tooltip.style.left)).toBe(160);
      // top = offsetY - h - gap = 200 - 40 - 16 = 144
      expect(px(tooltip.style.top)).toBe(200 - TOOLTIP_HEIGHT - GAP);
    });

    it("clamps left to the 10px minimum when the cursor is near the left edge", () => {
      // offsetX = 205 - 200 = 5 -> offsetX - w/2 = -35; max(10, -35) = 10.
      positioner.positionTooltip(mouseAt(205, 300), tooltip, container);
      expect(px(tooltip.style.left)).toBe(10);
    });

    it("clamps left to (width - tooltipWidth - 10) near the right edge", () => {
      // offsetX = 695 - 200 = 495 -> offsetX - w/2 = 455; max(10,455)=455
      // min(500 - 80 - 10, 455) = min(410, 455) = 410.
      positioner.positionTooltip(mouseAt(695, 300), tooltip, container);
      expect(px(tooltip.style.left)).toBe(500 - TOOLTIP_WIDTH - 10);
    });

    it("allows a negative top when the cursor is near the container top", () => {
      // offsetY = 110 - 100 = 10 -> top = 10 - 40 - 16 = -46 (no clamp for top).
      positioner.positionTooltip(mouseAt(400, 110), tooltip, container);
      expect(px(tooltip.style.top)).toBe(10 - TOOLTIP_HEIGHT - GAP);
    });
  });

  describe("position = 'bottom'", () => {
    it("shares the horizontal clamp with 'top' but drops below the cursor", () => {
      const positioner = createTooltipPositioner("bottom");
      const container = makeContainer();
      const tooltip = makeTooltip();

      // offsetX = 200, offsetY = 200.
      positioner.positionTooltip(mouseAt(400, 300), tooltip, container);

      // Same horizontal formula as 'top'.
      expect(px(tooltip.style.left)).toBe(160);
      // top = offsetY + gap = 200 + 16 = 216.
      expect(px(tooltip.style.top)).toBe(200 + GAP);
    });

    it("clamps the horizontal position to the right edge near the right side", () => {
      const positioner = createTooltipPositioner("bottom");
      const container = makeContainer();
      const tooltip = makeTooltip();

      positioner.positionTooltip(mouseAt(695, 300), tooltip, container);
      expect(px(tooltip.style.left)).toBe(500 - TOOLTIP_WIDTH - 10);
    });
  });

  describe("position = 'left'", () => {
    it("places the tooltip to the left of the cursor and vertically centered", () => {
      const positioner = createTooltipPositioner("left");
      const container = makeContainer();
      const tooltip = makeTooltip();

      // offsetX = 400 - 200 = 200, offsetY = 400 - 100 = 300.
      positioner.positionTooltip(mouseAt(400, 400), tooltip, container);

      // left = max(10, offsetX - w - gap) = max(10, 200 - 80 - 16) = max(10,104)=104
      expect(px(tooltip.style.left)).toBe(200 - TOOLTIP_WIDTH - GAP);
      // top = offsetY - h/2 = 300 - 20 = 280.
      expect(px(tooltip.style.top)).toBe(300 - TOOLTIP_HEIGHT / 2);
    });

    it("clamps left to the 10px minimum when the cursor hugs the left edge", () => {
      const positioner = createTooltipPositioner("left");
      const container = makeContainer();
      const tooltip = makeTooltip();

      // offsetX = 210 - 200 = 10 -> 10 - 80 - 16 = -86; max(10,-86)=10.
      positioner.positionTooltip(mouseAt(210, 400), tooltip, container);
      expect(px(tooltip.style.left)).toBe(10);
    });
  });

  describe("position = 'right'", () => {
    it("places the tooltip to the right of the cursor and vertically centered", () => {
      const positioner = createTooltipPositioner("right");
      const container = makeContainer();
      const tooltip = makeTooltip();

      // offsetX = 300 - 200 = 100, offsetY = 400 - 100 = 300.
      positioner.positionTooltip(mouseAt(300, 400), tooltip, container);

      // left = min(width - w - 10, offsetX + gap) = min(410, 100 + 16) = min(410,116)=116
      expect(px(tooltip.style.left)).toBe(100 + GAP);
      // top = offsetY - h/2 = 300 - 20 = 280.
      expect(px(tooltip.style.top)).toBe(300 - TOOLTIP_HEIGHT / 2);
    });

    it("clamps left to (width - tooltipWidth - 10) near the right edge", () => {
      const positioner = createTooltipPositioner("right");
      const container = makeContainer();
      const tooltip = makeTooltip();

      // offsetX = 695 - 200 = 495 -> 495 + 16 = 511; min(410, 511) = 410.
      positioner.positionTooltip(mouseAt(695, 400), tooltip, container);
      expect(px(tooltip.style.left)).toBe(500 - TOOLTIP_WIDTH - 10);
    });
  });

  describe("zero-size tooltip / container edge cases", () => {
    it("handles a zero-size tooltip in jsdom-default dimensions", () => {
      const positioner = createTooltipPositioner("top");
      const container = makeContainer();
      const tooltip = makeTooltip(0, 0);

      // offsetX = 200; left = min(500-0-10, max(10, 200-0)) = min(490,200)=200.
      positioner.positionTooltip(mouseAt(400, 300), tooltip, container);
      expect(px(tooltip.style.left)).toBe(200);
      // top = offsetY - 0 - gap = 200 - 16 = 184.
      expect(px(tooltip.style.top)).toBe(200 - GAP);
    });

    it("respects a non-zero container origin when computing offsets", () => {
      const positioner = createTooltipPositioner("bottom");
      // Shift the rect origin; offsets are relative to top/left.
      const container = makeContainer({ top: 50, left: 50 });
      const tooltip = makeTooltip();

      // offsetX = 400 - 50 = 350, offsetY = 300 - 50 = 250.
      positioner.positionTooltip(mouseAt(400, 300), tooltip, container);
      // left = min(500-80-10, max(10, 350-40)) = min(410, 310) = 310.
      expect(px(tooltip.style.left)).toBe(310);
      // top = offsetY + gap = 250 + 16 = 266.
      expect(px(tooltip.style.top)).toBe(250 + GAP);
    });
  });

  describe("hideTooltip", () => {
    it("sets opacity to '0'", () => {
      const positioner = createTooltipPositioner("top");
      const tooltip = makeTooltip();
      tooltip.style.opacity = "1";
      positioner.hideTooltip(tooltip);
      expect(tooltip.style.opacity).toBe("0");
    });
  });

  describe("determinism across positions", () => {
    const positions: TooltipPosition[] = ["top", "bottom", "left", "right"];

    it("produces identical output for repeated identical inputs", () => {
      for (const position of positions) {
        const positioner = createTooltipPositioner(position);
        const tooltipA = makeTooltip();
        const tooltipB = makeTooltip();
        const containerA = makeContainer();
        const containerB = makeContainer();

        positioner.positionTooltip(mouseAt(420, 310), tooltipA, containerA);
        positioner.positionTooltip(mouseAt(420, 310), tooltipB, containerB);

        expect(tooltipA.style.left).toBe(tooltipB.style.left);
        expect(tooltipA.style.top).toBe(tooltipB.style.top);
      }
    });
  });
});

describe("createTooltipElement", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("appends a single div tooltip child to the container", () => {
    const tooltip = createTooltipElement(container);
    expect(tooltip.tagName).toBe("DIV");
    expect(container.children.length).toBe(1);
    expect(container.firstElementChild).toBe(tooltip);
  });

  it("applies the expected absolute positioning baseline styles", () => {
    const tooltip = createTooltipElement(container);
    expect(tooltip.style.position).toBe("absolute");
    expect(tooltip.style.left).toBe("0px");
    expect(tooltip.style.top).toBe("0px");
  });

  it("starts hidden and non-interactive with the fade transition + high z-index", () => {
    const tooltip = createTooltipElement(container);
    expect(tooltip.style.pointerEvents).toBe("none");
    expect(tooltip.style.opacity).toBe("0");
    expect(tooltip.style.transition).toBe("opacity 120ms ease");
    expect(tooltip.style.zIndex).toBe("1000");
  });

  it("creates an independent element on each call", () => {
    const first = createTooltipElement(container);
    const second = createTooltipElement(container);
    expect(first).not.toBe(second);
    expect(container.children.length).toBe(2);
  });

  it("returns a tooltip whose default opacity matches what hideTooltip sets", () => {
    // Integration: a freshly created tooltip is already in the hidden state.
    const positioner = createTooltipPositioner("top");
    const tooltip = createTooltipElement(container);
    tooltip.style.opacity = "1";
    positioner.hideTooltip(tooltip);
    expect(tooltip.style.opacity).toBe("0");
  });
});
