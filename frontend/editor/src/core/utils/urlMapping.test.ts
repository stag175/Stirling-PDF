import { describe, expect, it } from "vitest";

import { URL_TO_TOOL_MAP } from "@app/utils/urlMapping";

describe("URL_TO_TOOL_MAP", () => {
  it("maps canonical tool routes to their tool ids", () => {
    expect(URL_TO_TOOL_MAP["/split"]).toBe("split");
    expect(URL_TO_TOOL_MAP["/merge"]).toBe("merge");
    expect(URL_TO_TOOL_MAP["/compress"]).toBe("compress");
    expect(URL_TO_TOOL_MAP["/rotate"]).toBe("rotate");
    expect(URL_TO_TOOL_MAP["/add-password"]).toBe("addPassword");
    expect(URL_TO_TOOL_MAP["/view-pdf"]).toBe("read");
  });

  it("routes split aliases all to the split tool", () => {
    for (const url of [
      "/split",
      "/split-pdfs",
      "/split-by-size-or-count",
      "/split-pdf-by-sections",
      "/split-pdf-by-chapters",
    ]) {
      expect(URL_TO_TOOL_MAP[url]).toBe("split");
    }
  });

  it("routes the various converter routes to the convert tool", () => {
    for (const url of [
      "/convert",
      "/file-to-pdf",
      "/pdf-to-word",
      "/img-to-pdf",
      "/pdf-to-markdown",
    ]) {
      expect(URL_TO_TOOL_MAP[url]).toBe("convert");
    }
  });

  it("every key is an absolute path and every value is a non-empty tool id", () => {
    for (const [url, toolId] of Object.entries(URL_TO_TOOL_MAP)) {
      expect(url.startsWith("/")).toBe(true);
      expect(url).not.toMatch(/\s/); // no whitespace in routes
      expect(typeof toolId).toBe("string");
      expect((toolId as string).length).toBeGreaterThan(0);
    }
  });

  it("preserves the legacy sitemap mappings", () => {
    expect(URL_TO_TOOL_MAP["/pdf-organizer"]).toBe("reorganizePages");
    expect(URL_TO_TOOL_MAP["/stamp"]).toBe("addStamp");
    expect(URL_TO_TOOL_MAP["/auto-redact"]).toBe("redact");
  });
});
