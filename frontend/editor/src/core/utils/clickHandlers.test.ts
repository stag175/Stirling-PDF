import type { MouseEvent as ReactMouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  handleUnlessSpecialClick,
  isSpecialClick,
} from "@app/utils/clickHandlers";

const evt = (
  over: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    button: number;
  }> = {},
): ReactMouseEvent =>
  ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    button: 0,
    preventDefault: vi.fn(),
    ...over,
  }) as unknown as ReactMouseEvent;

describe("isSpecialClick", () => {
  it("is true for modifier keys and middle-click", () => {
    expect(isSpecialClick(evt({ metaKey: true }))).toBe(true);
    expect(isSpecialClick(evt({ ctrlKey: true }))).toBe(true);
    expect(isSpecialClick(evt({ shiftKey: true }))).toBe(true);
    expect(isSpecialClick(evt({ button: 1 }))).toBe(true); // middle button
  });

  it("is false for a plain left click", () => {
    expect(isSpecialClick(evt())).toBe(false);
    expect(isSpecialClick(evt({ button: 0 }))).toBe(false);
  });
});

describe("handleUnlessSpecialClick", () => {
  it("lets the browser handle a special click (no preventDefault, no callback)", () => {
    const e = evt({ ctrlKey: true });
    const handleClick = vi.fn();
    const letBrowserHandle = handleUnlessSpecialClick(e, handleClick);
    expect(letBrowserHandle).toBe(true);
    expect(handleClick).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("intercepts a plain click (preventDefault + callback, returns false)", () => {
    const e = evt();
    const handleClick = vi.fn();
    const letBrowserHandle = handleUnlessSpecialClick(e, handleClick);
    expect(letBrowserHandle).toBe(false);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
