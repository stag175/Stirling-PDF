import { describe, it, expect, vi } from "vitest";
import {
  clamp,
  addEventListenerWithCleanup,
  isClickOutside,
} from "@app/utils/genericUtils";

describe("clamp", () => {
  it("1) returns the value unchanged when it sits within the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("2) clamps to the minimum when below the range", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("3) clamps to the maximum when above the range", () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("4) returns the boundary value when equal to min or max", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("5) supports negative ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-20, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it("6) handles fractional values without rounding", () => {
    expect(clamp(1.25, 0, 2)).toBe(1.25);
    expect(clamp(2.5, 0, 2)).toBe(2);
  });

  it("7) collapses to the single point when min equals max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(-5, 3, 3)).toBe(3);
  });

  it("8) propagates NaN values (Math.min/Math.max semantics)", () => {
    expect(Number.isNaN(clamp(NaN, 0, 10))).toBe(true);
  });

  it("9) supports Infinity bounds", () => {
    expect(clamp(1e9, -Infinity, Infinity)).toBe(1e9);
    expect(clamp(5, -Infinity, 0)).toBe(0);
    expect(clamp(5, 10, Infinity)).toBe(10);
  });

  it("10) when min > max, the max wins because it is applied last", () => {
    // Math.min(Math.max(value, min), max): the outer min(., max) caps to max.
    expect(clamp(5, 10, 2)).toBe(2);
    expect(clamp(0, 10, 2)).toBe(2);
  });
});

describe("addEventListenerWithCleanup", () => {
  it("11) registers the handler so the event fires it", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    addEventListenerWithCleanup(target, "ping", handler);
    target.dispatchEvent(new Event("ping"));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("12) returns a cleanup function that removes the listener", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    const cleanup = addEventListenerWithCleanup(target, "ping", handler);
    target.dispatchEvent(new Event("ping"));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    target.dispatchEvent(new Event("ping"));
    // No additional invocation after cleanup.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("13) forwards the event object to the handler", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    const event = new Event("custom");

    addEventListenerWithCleanup(target, "custom", handler);
    target.dispatchEvent(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("14) passes options through to addEventListener (once)", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    addEventListenerWithCleanup(target, "ping", handler, { once: true });
    target.dispatchEvent(new Event("ping"));
    target.dispatchEvent(new Event("ping"));

    // The `once` option means the listener auto-removes after the first call.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("15) calls addEventListener with the exact arguments it was given", () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as EventTarget;
    const handler = vi.fn();
    const options = { capture: true };

    addEventListenerWithCleanup(target, "scroll", handler, options);

    expect(target.addEventListener).toHaveBeenCalledWith(
      "scroll",
      handler,
      options,
    );
  });

  it("16) cleanup calls removeEventListener with the same args", () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as EventTarget;
    const handler = vi.fn();
    const options = { capture: true };

    const cleanup = addEventListenerWithCleanup(
      target,
      "scroll",
      handler,
      options,
    );
    expect(target.removeEventListener).not.toHaveBeenCalled();

    cleanup();

    expect(target.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      handler,
      options,
    );
  });

  it("17) works on real DOM elements (jsdom)", () => {
    const el = document.createElement("div");
    const handler = vi.fn();

    const cleanup = addEventListenerWithCleanup(el, "click", handler);
    el.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    el.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("18) cleanup is idempotent and safe to call twice", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    const cleanup = addEventListenerWithCleanup(target, "ping", handler);
    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();

    target.dispatchEvent(new Event("ping"));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("isClickOutside", () => {
  it("19) returns true when the element is null", () => {
    const event = {
      target: document.createElement("span"),
    } as unknown as MouseEvent;
    expect(isClickOutside(event, null)).toBe(true);
  });

  it("20) returns false when the click target is the element itself", () => {
    const el = document.createElement("div");
    const event = { target: el } as unknown as MouseEvent;
    // Element.contains() returns true for the node itself.
    expect(isClickOutside(event, el)).toBe(false);
  });

  it("21) returns false when the click target is a descendant", () => {
    const parent = document.createElement("div");
    const child = document.createElement("button");
    parent.appendChild(child);
    const event = { target: child } as unknown as MouseEvent;

    expect(isClickOutside(event, parent)).toBe(false);
  });

  it("22) returns true when the click target is a sibling/unrelated node", () => {
    const el = document.createElement("div");
    const other = document.createElement("div");
    const event = { target: other } as unknown as MouseEvent;

    expect(isClickOutside(event, el)).toBe(true);
  });

  it("23) returns true for a deeply nested element not under the target", () => {
    const target = document.createElement("section");
    const outsideParent = document.createElement("section");
    const outsideChild = document.createElement("p");
    outsideParent.appendChild(outsideChild);
    const event = { target: outsideChild } as unknown as MouseEvent;

    expect(isClickOutside(event, target)).toBe(true);
  });

  it("24) handles a real DOM tree attached to the document", () => {
    const container = document.createElement("div");
    const inside = document.createElement("span");
    const outside = document.createElement("span");
    container.appendChild(inside);
    document.body.appendChild(container);
    document.body.appendChild(outside);

    try {
      expect(
        isClickOutside({ target: inside } as unknown as MouseEvent, container),
      ).toBe(false);
      expect(
        isClickOutside({ target: outside } as unknown as MouseEvent, container),
      ).toBe(true);
    } finally {
      container.remove();
      outside.remove();
    }
  });
});
