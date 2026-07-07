import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getApiBaseUrl } from "@app/services/apiClientConfig";

// getApiBaseUrl resolves the API base URL by priority:
//   1. window.STIRLING_PDF_API_BASE_URL (runtime override)
//   2. import.meta.env.VITE_API_BASE_URL (build-time env)
// The runtime override exists precisely because VITE_API_BASE_URL is baked into the build.
describe("getApiBaseUrl", () => {
  beforeEach(() => {
    delete window.STIRLING_PDF_API_BASE_URL;
  });

  afterEach(() => {
    delete window.STIRLING_PDF_API_BASE_URL;
    vi.unstubAllEnvs();
  });

  it("returns the runtime window override when set", () => {
    window.STIRLING_PDF_API_BASE_URL = "http://runtime:9000";
    expect(getApiBaseUrl()).toBe("http://runtime:9000");
  });

  it("falls back to VITE_API_BASE_URL when no runtime override is set", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api-base");
    expect(getApiBaseUrl()).toBe("/api-base");
  });

  it("prefers the runtime override over the build-time env var", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/env");
    window.STIRLING_PDF_API_BASE_URL = "http://override";
    expect(getApiBaseUrl()).toBe("http://override");
  });

  it("treats an empty-string override as unset and falls back to the env var", () => {
    // The guard is `&& window.STIRLING_PDF_API_BASE_URL`, so "" (falsy) falls through.
    vi.stubEnv("VITE_API_BASE_URL", "/fallback");
    window.STIRLING_PDF_API_BASE_URL = "";
    expect(getApiBaseUrl()).toBe("/fallback");
  });
});
