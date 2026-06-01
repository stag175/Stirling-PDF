/**
 * Unit tests for urlRouting.
 *
 * The module reads window.location (pathname/search) and writes via
 * window.history.pushState / replaceState, then fires an analytics pixel.
 * To keep tests deterministic:
 *   - window.location is replaced with a controllable plain object so we can
 *     set pathname/search per test.
 *   - window.history.pushState / replaceState are spied (no real navigation).
 *   - firePixel (the only external side-effect dependency) is mocked.
 *   - @app/constants/app is mocked so BASE_PATH / withBasePath are deterministic
 *     and both the empty-base and non-empty-base branches can be exercised.
 *
 * The registry helpers (getToolWorkbench, getToolUrlPath), the ToolId type
 * guard and URL_TO_TOOL_MAP are pure, so they are exercised for real.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import {
  parseToolRoute,
  updateToolRoute,
  clearToolRoute,
  getToolDisplayName,
} from "@app/utils/urlRouting";
import type { ToolRegistry, ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import type { ToolId } from "@app/types/toolId";

// --- Mocks -----------------------------------------------------------------

const firePixelMock = vi.fn();
vi.mock("@app/utils/scarfTracking", () => ({
  firePixel: (pathname: string) => firePixelMock(pathname),
}));

// Mutable base-path state so individual tests can flip between the
// "no base path" and "subpath deployment" branches deterministically.
let mockBasePath = "";
vi.mock("@app/constants/app", () => ({
  get BASE_PATH() {
    return mockBasePath;
  },
  withBasePath: (path: string) => {
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${mockBasePath}${clean}`;
  },
}));

// --- Test helpers -----------------------------------------------------------

/** Build a minimal registry entry; only `name` and `workbench` are read. */
function makeEntry(
  overrides: Partial<ToolRegistryEntry> = {},
): ToolRegistryEntry {
  return {
    name: "Default Name",
    ...overrides,
  } as unknown as ToolRegistryEntry;
}

/**
 * Registry containing a spread of real ToolIds so the registry-iteration and
 * URL_TO_TOOL_MAP branches both have valid targets.
 */
function makeRegistry(): ToolRegistry {
  return {
    split: makeEntry({ name: "Split", workbench: "pageEditor" }),
    merge: makeEntry({ name: "Merge" }), // no workbench -> default fileEditor
    convert: makeEntry({ name: "Convert", workbench: "viewer" }),
    // timestampPdf is a valid ToolId whose url path (/timestamp-pdf) is NOT in
    // URL_TO_TOOL_MAP, forcing the registry-iteration fallback branch.
    timestampPdf: makeEntry({ name: "Timestamp", workbench: "myFiles" }),
  } as unknown as ToolRegistry;
}

let pushStateSpy: Mock;
let replaceStateSpy: Mock;
let originalLocation: Location;

/** Replace window.location with a controllable pathname/search. */
function setLocation(pathname: string, search = ""): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, pathname, search } as unknown as Location,
  });
}

beforeEach(() => {
  firePixelMock.mockReset();
  mockBasePath = "";

  originalLocation = window.location;
  setLocation("/", "");

  pushStateSpy = vi.fn();
  replaceStateSpy = vi.fn();
  vi.spyOn(window.history, "pushState").mockImplementation(pushStateSpy);
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceStateSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

// --- parseToolRoute --------------------------------------------------------

describe("parseToolRoute", () => {
  it("resolves a tool via URL_TO_TOOL_MAP alias", () => {
    // /split-pdfs is an alias mapping to "split" in URL_TO_TOOL_MAP.
    setLocation("/split-pdfs");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "pageEditor", toolId: "split" });
  });

  it("falls through the URL map when the mapped tool is absent from the registry", () => {
    // /redact maps to "redact" in URL_TO_TOOL_MAP, but our registry omits it,
    // so the mapping is skipped and we hit the default branch.
    setLocation("/redact");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "viewer", toolId: null });
  });

  it("resolves a tool by primary registry url path when not in the URL map", () => {
    // getToolUrlPath("timestampPdf") === "/timestamp-pdf", which is not an alias.
    setLocation("/timestamp-pdf");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "myFiles", toolId: "timestampPdf" });
  });

  it("resolves a tool from the ?tool= query parameter fallback", () => {
    setLocation("/some-unrelated-path", "?tool=merge");
    const route = parseToolRoute(makeRegistry());
    // merge has no workbench -> getDefaultToolWorkbench() === "fileEditor"
    expect(route).toEqual({ workbench: "fileEditor", toolId: "merge" });
  });

  it("ignores an invalid ?tool= value and returns the default route", () => {
    setLocation("/", "?tool=not-a-real-tool");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "viewer", toolId: null });
  });

  it("ignores a valid ?tool= value that is absent from the registry", () => {
    // "rotate" is a valid ToolId but is not present in our registry.
    setLocation("/", "?tool=rotate");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "viewer", toolId: null });
  });

  it("returns the default route for an unknown path", () => {
    setLocation("/totally-unknown");
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "viewer", toolId: null });
  });

  it("strips a non-empty BASE_PATH before matching the alias map", () => {
    mockBasePath = "/app";
    setLocation("/app/merge");
    const route = parseToolRoute(makeRegistry());
    // /app/merge -> /merge -> URL_TO_TOOL_MAP -> "merge" (default fileEditor)
    expect(route).toEqual({ workbench: "fileEditor", toolId: "merge" });
  });

  it("treats a path equal to BASE_PATH as the root '/' after stripping", () => {
    mockBasePath = "/app";
    setLocation("/app"); // slice yields "" -> "|| '/'" fallback
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "viewer", toolId: null });
  });

  it("does not strip when the path does not start with BASE_PATH", () => {
    mockBasePath = "/app";
    setLocation("/split-pdfs"); // does not start with /app, used verbatim
    const route = parseToolRoute(makeRegistry());
    expect(route).toEqual({ workbench: "pageEditor", toolId: "split" });
  });
});

// --- updateToolRoute -------------------------------------------------------

describe("updateToolRoute", () => {
  it("warns and does nothing when the tool is missing from the registry", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setLocation("/");
    updateToolRoute("doesNotExist" as ToolId, makeRegistry());
    expect(warnSpy).toHaveBeenCalledWith(
      "Tool doesNotExist not found in registry",
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).not.toHaveBeenCalled();
  });

  it("pushes the new path and fires the pixel when the path changes", () => {
    setLocation("/", "");
    updateToolRoute("split", makeRegistry());
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/split");
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).toHaveBeenCalledWith("/split");
  });

  it("uses replaceState when replace=true is passed", () => {
    setLocation("/", "");
    updateToolRoute("split", makeRegistry(), true);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/split");
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).toHaveBeenCalledWith("/split");
  });

  it("removes a pre-existing ?tool= param and preserves other query params", () => {
    setLocation("/", "?tool=merge&foo=bar");
    updateToolRoute("split", makeRegistry());
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/split?foo=bar");
    expect(firePixelMock).toHaveBeenCalledWith("/split");
  });

  it("does nothing when the resulting URL is identical to the current one", () => {
    // Already on /split with no query -> updateUrl detects no change.
    setLocation("/split", "");
    updateToolRoute("split", makeRegistry());
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).not.toHaveBeenCalled();
  });

  it("prefixes the configured BASE_PATH on the new path", () => {
    mockBasePath = "/app";
    setLocation("/app", "");
    updateToolRoute("merge", makeRegistry());
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/app/merge");
    expect(firePixelMock).toHaveBeenCalledWith("/app/merge");
  });
});

// --- clearToolRoute --------------------------------------------------------

describe("clearToolRoute", () => {
  it("navigates back to '/' and fires the pixel when leaving a tool", () => {
    setLocation("/split", "?tool=split");
    clearToolRoute();
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/");
    expect(firePixelMock).toHaveBeenCalledWith("/");
  });

  it("uses replaceState when replace=true is passed", () => {
    setLocation("/split", "");
    clearToolRoute(true);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/");
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).toHaveBeenCalledWith("/");
  });

  it("does nothing when already on the home path", () => {
    setLocation("/", "");
    clearToolRoute();
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(firePixelMock).not.toHaveBeenCalled();
  });

  it("preserves non-tool query params while clearing the tool route", () => {
    setLocation("/split", "?tool=split&keep=1");
    clearToolRoute();
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/?keep=1");
    expect(firePixelMock).toHaveBeenCalledWith("/");
  });
});

// --- getToolDisplayName ----------------------------------------------------

describe("getToolDisplayName", () => {
  it("returns the registry entry name when the tool exists", () => {
    expect(getToolDisplayName("split", makeRegistry())).toBe("Split");
  });

  it("falls back to the toolId when the tool is missing from the registry", () => {
    expect(getToolDisplayName("missingTool" as ToolId, makeRegistry())).toBe(
      "missingTool",
    );
  });
});
