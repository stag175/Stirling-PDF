import { describe, expect, it, vi } from "vitest";

import { isScriptLoaded, loadScript } from "@app/utils/scriptLoader";

// loadScript keeps a module-level "loaded" set, so each test uses a unique id to avoid cross-test
// state. jsdom never fetches an injected <script>, so onload/onerror are fired manually.

describe("scriptLoader", () => {
  it("reports an unknown script as not loaded", () => {
    expect(isScriptLoaded("never-loaded-xyz")).toBe(false);
  });

  it("resolves immediately for a script already present in the DOM", async () => {
    const id = "preexisting-script";
    const existing = document.createElement("script");
    existing.id = id;
    document.head.appendChild(existing);

    await expect(loadScript({ src: "https://cdn.example.com/a.js", id })).resolves.toBeUndefined();
    expect(isScriptLoaded(id)).toBe(true);
  });

  it("injects + configures a script, resolves on load, then dedups subsequent loads", async () => {
    const id = "lifecycle-script";
    const onLoad = vi.fn();
    const promise = loadScript({
      src: "https://cdn.example.com/lib.js",
      id,
      async: true,
      defer: false,
      onLoad,
    });

    const el = document.getElementById(id) as HTMLScriptElement | null;
    expect(el).not.toBeNull();
    expect(el?.src).toContain("lib.js");
    expect(el?.async).toBe(true);

    el?.onload?.(new Event("load"));
    await promise;

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(isScriptLoaded(id)).toBe(true);

    // second load is a cache hit: resolves without injecting another element
    const countBefore = document.querySelectorAll(`script[id="${id}"]`).length;
    await loadScript({ src: "https://cdn.example.com/lib.js", id });
    expect(document.querySelectorAll(`script[id="${id}"]`).length).toBe(countBefore);
  });

  it("rejects when the script fails to load", async () => {
    const id = "failing-script";
    const promise = loadScript({ src: "https://cdn.example.com/broken.js", id });
    const el = document.getElementById(id) as HTMLScriptElement | null;
    el?.onerror?.(new Event("error"));
    await expect(promise).rejects.toThrow("Failed to load script");
  });
});
