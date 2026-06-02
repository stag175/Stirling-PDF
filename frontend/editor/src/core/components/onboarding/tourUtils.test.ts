import { afterEach, describe, expect, it } from "vitest";

import { waitForElement } from "@app/components/onboarding/tourUtils";

// waitForElement is best-effort: it resolves (never rejects) when the selector is already present,
// when it appears later (via MutationObserver), or after the timeout if it never appears.
// (waitForHighlightable additionally depends on getClientRects/ResizeObserver layout, which jsdom
// does not model reliably, so it is intentionally not covered here.)
describe("waitForElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves immediately when the element is already present", async () => {
    document.body.innerHTML = '<div id="target"></div>';
    await expect(waitForElement("#target")).resolves.toBeUndefined();
  });

  it("resolves once a matching element is inserted later", async () => {
    const pending = waitForElement("#late");
    const el = document.createElement("div");
    el.id = "late";
    document.body.appendChild(el);
    await expect(pending).resolves.toBeUndefined();
  });

  it("resolves (without throwing) after the timeout when the element never appears", async () => {
    // Short real timeout: confirms the no-throw, best-effort timeout branch.
    await expect(waitForElement("#never", 30)).resolves.toBeUndefined();
  });
});
