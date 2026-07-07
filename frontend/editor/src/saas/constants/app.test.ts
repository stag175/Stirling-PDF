import { afterEach, describe, expect, it } from "vitest";

import {
  getBaseUrl,
  setBaseUrl,
  withBasePath,
} from "@app/constants/app";

// getBaseUrl/setBaseUrl read & write a window-global, so reset it between tests.
afterEach(() => {
  window.__STIRLING_PDF_BASE_URL__ = undefined;
});

describe("getBaseUrl / setBaseUrl", () => {
  it("falls back to the window origin when no base URL has been set", () => {
    expect(getBaseUrl()).toBe(window.location.origin);
  });

  it("returns the configured base URL once set", () => {
    setBaseUrl("https://api.example.test");
    expect(getBaseUrl()).toBe("https://api.example.test");
    expect(window.__STIRLING_PDF_BASE_URL__).toBe("https://api.example.test");
  });

  it("treats an empty configured value as unset and falls back to origin", () => {
    setBaseUrl("");
    expect(getBaseUrl()).toBe(window.location.origin);
  });
});

describe("core re-export overlay", () => {
  it("re-exports the core base-path helpers through the saas module", () => {
    expect(typeof withBasePath).toBe("function");
    expect(withBasePath("tools")).toBe(withBasePath("/tools"));
  });
});
