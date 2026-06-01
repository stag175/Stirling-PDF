import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectLeafIds,
  readPdfLayers,
  type LayerInfo,
} from "@app/components/viewer/layerUtils";

/**
 * Unit tests for layerUtils.
 *
 * The two public functions exercised here are pure / deterministic once their
 * single external dependency (pdfjs-dist, loaded via a dynamic import inside
 * readPdfLayers) is mocked:
 *
 *   - readPdfLayers      drives the private buildLayerTree recursion via the
 *                        getOrder() shape returned by a fake OptionalContent
 *                        config, so every order-parsing branch (string id,
 *                        visited-dedup, missing group, nested array, named
 *                        group with / without children, name + visible
 *                        defaults) runs through the public API.
 *   - collectLeafIds     a pure tree walk, tested directly.
 *
 * pdfjs-dist is replaced with a factory mock so no real PDF.js worker, network
 * call, or wasm/binary is ever touched.
 */

// Shared mock surface for the dynamically-imported pdfjs module. Tests mutate
// these between cases to steer readPdfLayers down each branch.
const mockState: {
  ocConfig: unknown;
  destroy: ReturnType<typeof vi.fn>;
  loadingTaskPromise: Promise<unknown> | null;
} = {
  ocConfig: null,
  destroy: vi.fn().mockResolvedValue(undefined),
  loadingTaskPromise: null,
};

const globalWorkerOptions: { workerSrc: string } = { workerSrc: "" };

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: globalWorkerOptions,
  getDocument: vi.fn(() => ({
    promise:
      mockState.loadingTaskPromise ??
      Promise.resolve({
        getOptionalContentConfig: vi.fn().mockResolvedValue(mockState.ocConfig),
        destroy: mockState.destroy,
      }),
  })),
}));

/**
 * Builds a fake OptionalContentConfig. It is iterable (pdfjs v5 style:
 * `for (const [id, group] of ocConfig)`) and optionally exposes getOrder().
 */
function makeOcConfig(
  groups: Record<string, unknown>,
  getOrder?: () => unknown,
) {
  return {
    [Symbol.iterator]() {
      return Object.entries(groups)[Symbol.iterator]();
    },
    ...(getOrder ? { getOrder } : {}),
  };
}

/** A minimal Blob-like object exposing arrayBuffer() for readPdfLayers. */
function makeFile(): Blob {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  } as unknown as Blob;
}

beforeEach(() => {
  mockState.ocConfig = null;
  mockState.loadingTaskPromise = null;
  mockState.destroy = vi.fn().mockResolvedValue(undefined);
  globalWorkerOptions.workerSrc = "";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("readPdfLayers - early returns and worker setup", () => {
  it("sets GlobalWorkerOptions.workerSrc when it is empty", async () => {
    mockState.ocConfig = null; // null config -> [] early return
    await readPdfLayers(makeFile());
    expect(globalWorkerOptions.workerSrc).not.toBe("");
    expect(globalWorkerOptions.workerSrc).toContain(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    );
  });

  it("leaves a preset workerSrc untouched", async () => {
    globalWorkerOptions.workerSrc = "preset://worker.js";
    mockState.ocConfig = makeOcConfig({});
    await readPdfLayers(makeFile());
    expect(globalWorkerOptions.workerSrc).toBe("preset://worker.js");
  });

  it("returns [] when getOptionalContentConfig yields no config", async () => {
    mockState.ocConfig = null;
    await expect(readPdfLayers(makeFile())).resolves.toEqual([]);
    expect(mockState.destroy).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the config has zero groups", async () => {
    mockState.ocConfig = makeOcConfig({});
    await expect(readPdfLayers(makeFile())).resolves.toEqual([]);
    expect(mockState.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("readPdfLayers - flat fallback (no usable order)", () => {
  it("returns a flat list when getOrder is absent", async () => {
    mockState.ocConfig = makeOcConfig({
      L1: { name: "Layer 1", visible: true },
      L2: { name: "Layer 2", visible: false },
    });
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([
      { id: "L1", name: "Layer 1", visible: true },
      { id: "L2", name: "Layer 2", visible: false },
    ]);
  });

  it("applies name/visible defaults in the flat fallback", async () => {
    mockState.ocConfig = makeOcConfig({
      L1: {}, // no name -> id, no visible -> true
    });
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "L1", name: "L1", visible: true }]);
  });

  it("falls back to flat list when getOrder returns an empty array", async () => {
    mockState.ocConfig = makeOcConfig(
      { L1: { name: "Only", visible: true } },
      () => [],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "L1", name: "Only", visible: true }]);
  });

  it("falls back to flat list when getOrder returns a non-array", async () => {
    mockState.ocConfig = makeOcConfig(
      { L1: { name: "Only", visible: true } },
      () => ({ not: "an array" }),
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "L1", name: "Only", visible: true }]);
  });

  it("swallows a throwing getOrder and falls back to flat list", async () => {
    mockState.ocConfig = makeOcConfig(
      { L1: { name: "Only", visible: true } },
      () => {
        throw new Error("getOrder unsupported");
      },
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "L1", name: "Only", visible: true }]);
  });
});

describe("readPdfLayers - buildLayerTree via getOrder", () => {
  it("builds a flat tree from string OCG ids", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
        b: { name: "Beta", visible: false },
      },
      () => ["a", "b"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([
      { id: "a", name: "Alpha", visible: true },
      { id: "b", name: "Beta", visible: false },
    ]);
  });

  it("applies name/visible defaults for string ids", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: {}, // missing name + visible
      },
      () => ["a"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "a", visible: true }]);
  });

  it("dedupes repeated ids via the visited set", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
      },
      () => ["a", "a", "a"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "Alpha", visible: true }]);
  });

  it("skips string ids that have no matching group", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
      },
      () => ["a", "ghost"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "Alpha", visible: true }]);
  });

  it("flattens nested (unlabeled) array groups", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
        b: { name: "Beta", visible: true },
      },
      () => ["a", ["b"]],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([
      { id: "a", name: "Alpha", visible: true },
      { id: "b", name: "Beta", visible: true },
    ]);
  });

  it("builds a named group node with children", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
        b: { name: "Beta", visible: true },
      },
      () => [{ name: "Group A", order: ["a", "b"] }],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([
      {
        id: "group-Group A",
        name: "Group A",
        visible: true,
        children: [
          { id: "a", name: "Alpha", visible: true },
          { id: "b", name: "Beta", visible: true },
        ],
      },
    ]);
  });

  it("marks a named group invisible when any child is hidden", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
        b: { name: "Beta", visible: false },
      },
      () => [{ name: "Mixed", order: ["a", "b"] }],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([
      {
        id: "group-Mixed",
        name: "Mixed",
        visible: false,
        children: [
          { id: "a", name: "Alpha", visible: true },
          { id: "b", name: "Beta", visible: false },
        ],
      },
    ]);
  });

  it("flattens a named group that has no resolvable children", async () => {
    // name present but children empty (ghost ids only) -> spread children only
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
      },
      () => [{ name: "Empty", order: ["ghost"] }, "a"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "Alpha", visible: true }]);
  });

  it("flattens an object group with no name (children spread)", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
      },
      () => [{ order: ["a"] }],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "Alpha", visible: true }]);
  });

  it("treats an object group with no order as empty (no children)", async () => {
    mockState.ocConfig = makeOcConfig(
      {
        a: { name: "Alpha", visible: true },
      },
      () => [{ name: "NoOrder" }, "a"],
    );
    const layers = await readPdfLayers(makeFile());
    expect(layers).toEqual([{ id: "a", name: "Alpha", visible: true }]);
  });

  it("destroys the document even when parsing succeeds", async () => {
    mockState.ocConfig = makeOcConfig(
      { a: { name: "Alpha", visible: true } },
      () => ["a"],
    );
    await readPdfLayers(makeFile());
    expect(mockState.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("collectLeafIds", () => {
  it("returns ids of a flat layer list", () => {
    const layers: LayerInfo[] = [
      { id: "a", name: "A", visible: true },
      { id: "b", name: "B", visible: false },
    ];
    expect(collectLeafIds(layers)).toEqual(["a", "b"]);
  });

  it("descends into children and skips synthetic group ids", () => {
    const layers: LayerInfo[] = [
      {
        id: "group-G",
        name: "G",
        visible: true,
        children: [
          { id: "a", name: "A", visible: true },
          { id: "b", name: "B", visible: true },
        ],
      },
      { id: "c", name: "C", visible: true },
    ];
    expect(collectLeafIds(layers)).toEqual(["a", "b", "c"]);
  });

  it("recurses through deeply nested groups", () => {
    const layers: LayerInfo[] = [
      {
        id: "group-outer",
        name: "Outer",
        visible: true,
        children: [
          {
            id: "group-inner",
            name: "Inner",
            visible: true,
            children: [{ id: "leaf", name: "Leaf", visible: true }],
          },
        ],
      },
    ];
    expect(collectLeafIds(layers)).toEqual(["leaf"]);
  });

  it("treats a node with an empty children array as a leaf", () => {
    const layers: LayerInfo[] = [
      { id: "node", name: "Node", visible: true, children: [] },
    ];
    expect(collectLeafIds(layers)).toEqual(["node"]);
  });

  it("returns an empty array for no layers", () => {
    expect(collectLeafIds([])).toEqual([]);
  });
});
