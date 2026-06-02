import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeGeometry } from "@app/hooks/tools/useToolPanelGeometry";

const elWithRect = (rect: Partial<DOMRect>): HTMLDivElement =>
  ({ getBoundingClientRect: () => rect as DOMRect }) as unknown as HTMLDivElement;

const refTo = (el: HTMLDivElement | null): RefObject<HTMLDivElement | null> => ({
  current: el,
});

const setWindow = (innerWidth: number, innerHeight: number): void => {
  Object.defineProperty(window, "innerWidth", { value: innerWidth, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
};

describe("computeGeometry", () => {
  beforeEach(() => {
    setWindow(1200, 900);
    document.documentElement.dir = "ltr";
  });

  afterEach(() => {
    document.documentElement.dir = "";
  });

  it("LTR: expands leftward from the panel right edge to the quick-access right edge", () => {
    const panel = elWithRect({ right: 1000, top: 50, height: 600 });
    const quickAccess = refTo(elWithRect({ right: 200 }));
    expect(computeGeometry(panel, quickAccess)).toEqual({
      left: 200,
      top: 50,
      width: 800, // 1000 - 200
      height: 850, // max(600, 900 - 50)
    });
  });

  it("LTR: uses left offset 0 when there is no quick-access element", () => {
    const panel = elWithRect({ right: 1000, top: 50, height: 600 });
    expect(computeGeometry(panel, refTo(null))).toEqual({
      left: 0,
      top: 50,
      width: 1000,
      height: 850,
    });
  });

  it("clamps width to a 360px minimum", () => {
    const panel = elWithRect({ right: 300, top: 0, height: 100 });
    const quickAccess = refTo(elWithRect({ right: 200 }));
    const geo = computeGeometry(panel, quickAccess);
    expect(geo.width).toBe(360); // max(360, 300 - 200) = 360
  });

  it("RTL: expands rightward from the panel right edge", () => {
    document.documentElement.dir = "rtl";
    const panel = elWithRect({ right: 300, top: 0, height: 100 });
    const geo = computeGeometry(panel, refTo(null));
    expect(geo.left).toBe(300);
    expect(geo.width).toBe(900); // max(360, 1200 - 300)
    expect(geo.height).toBe(900); // max(100, 900 - 0)
  });
});
