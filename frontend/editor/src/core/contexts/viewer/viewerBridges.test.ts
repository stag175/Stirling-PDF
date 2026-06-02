import { describe, expect, it } from "vitest";

import {
  type BridgeKey,
  createBridgeRegistry,
  getBridgeApi,
  getBridgeState,
  type PanAPIWrapper,
  type ScrollAPIWrapper,
  type ScrollState,
  registerBridge,
  type ZoomAPIWrapper,
  type ZoomState,
} from "@app/contexts/viewer/viewerBridges";

const ALL_KEYS: BridgeKey[] = [
  "scroll",
  "zoom",
  "pan",
  "selection",
  "spread",
  "rotation",
  "search",
  "thumbnail",
  "export",
  "bookmark",
  "attachment",
  "print",
  "permissions",
];

// API wrappers are objects of viewer methods we don't need to exercise here; identity-stub them.
const scrollApi = { __marker: "scroll" } as unknown as ScrollAPIWrapper;
const zoomApi = { __marker: "zoom" } as unknown as ZoomAPIWrapper;
const panApi = { __marker: "pan" } as unknown as PanAPIWrapper;

describe("createBridgeRegistry", () => {
  it("creates a registry with every bridge key initialised to null", () => {
    const registry = createBridgeRegistry();
    expect(Object.keys(registry).sort()).toEqual([...ALL_KEYS].sort());
    for (const key of ALL_KEYS) {
      expect(registry[key]).toBeNull();
    }
  });

  it("returns an independent registry on each call", () => {
    const a = createBridgeRegistry();
    const b = createBridgeRegistry();
    registerBridge(a, "pan", { state: { isPanning: true }, api: panApi });
    // Registering into `a` must not leak into `b`.
    expect(getBridgeApi(b, "pan")).toBeNull();
  });
});

describe("getBridgeState", () => {
  it("returns the fallback when the bridge is not registered", () => {
    const fallback: ScrollState = { currentPage: 1, totalPages: 1 };
    expect(getBridgeState(createBridgeRegistry(), "scroll", fallback)).toBe(
      fallback,
    );
  });

  it("returns the registered bridge's state over the fallback", () => {
    const registry = createBridgeRegistry();
    const state: ScrollState = { currentPage: 3, totalPages: 10 };
    registerBridge(registry, "scroll", { state, api: scrollApi });
    expect(
      getBridgeState(registry, "scroll", { currentPage: 0, totalPages: 0 }),
    ).toBe(state);
  });
});

describe("getBridgeApi", () => {
  it("returns null when the bridge is not registered", () => {
    expect(getBridgeApi(createBridgeRegistry(), "zoom")).toBeNull();
  });

  it("returns the registered bridge's api", () => {
    const registry = createBridgeRegistry();
    const state: ZoomState = { currentZoom: 1, zoomPercent: 100 };
    registerBridge(registry, "zoom", { state, api: zoomApi });
    expect(getBridgeApi(registry, "zoom")).toBe(zoomApi);
  });
});

describe("registerBridge", () => {
  it("overwrites a previously registered bridge", () => {
    const registry = createBridgeRegistry();
    registerBridge(registry, "scroll", {
      state: { currentPage: 1, totalPages: 2 },
      api: scrollApi,
    });
    const newState: ScrollState = { currentPage: 5, totalPages: 9 };
    registerBridge(registry, "scroll", { state: newState, api: scrollApi });
    expect(
      getBridgeState(registry, "scroll", { currentPage: 0, totalPages: 0 }),
    ).toBe(newState);
  });

  it("clears a bridge back to null, restoring fallback/null lookups", () => {
    const registry = createBridgeRegistry();
    registerBridge(registry, "zoom", {
      state: { currentZoom: 2, zoomPercent: 200 },
      api: zoomApi,
    });
    registerBridge(registry, "zoom", null);

    const fallback: ZoomState = { currentZoom: 1, zoomPercent: 100 };
    expect(getBridgeState(registry, "zoom", fallback)).toBe(fallback);
    expect(getBridgeApi(registry, "zoom")).toBeNull();
  });
});
