import { afterEach, describe, expect, it, vi } from "vitest";

import { withViewTransition } from "@app/utils/viewTransition";

// Standalone (not intersected with Document) so we can assign a simplified mock without clashing
// with the DOM lib's stricter built-in startViewTransition signature.
type WritableSVT = {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

describe("withViewTransition", () => {
  afterEach(() => {
    delete (document as unknown as WritableSVT).startViewTransition;
  });

  it("runs the update and resolves when startViewTransition is unavailable", async () => {
    // jsdom does not implement document.startViewTransition -> fallback path.
    const update = vi.fn();
    await expect(withViewTransition(update)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("delegates to document.startViewTransition when it exists", async () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (document as unknown as WritableSVT).startViewTransition = startViewTransition;

    await withViewTransition(update);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
