import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  type BookmarkNode,
  type BookmarkPayload,
  createBookmarkNode,
  hydrateBookmarkPayload,
  serializeBookmarkNodes,
} from "@app/utils/editTableOfContents";

// generateId is the only external dependency. Mock it with a deterministic
// monotonic counter so generated ids are stable and assertable across runs.
let idCounter = 0;
const generateIdMock = vi.fn(() => `id-${++idCounter}`);

vi.mock("@app/utils/generateId", () => ({
  generateId: () => generateIdMock(),
}));

beforeEach(() => {
  idCounter = 0;
  generateIdMock.mockClear();
});

describe("createBookmarkNode", () => {
  it("fills every field with defaults when given no argument", () => {
    const node = createBookmarkNode();

    expect(node).toEqual({
      id: "id-1",
      title: "",
      pageNumber: 1,
      children: [],
      expanded: true,
    });
    expect(generateIdMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a provided id and does not call generateId for it", () => {
    const node = createBookmarkNode({ id: "fixed-id" });

    expect(node.id).toBe("fixed-id");
    expect(generateIdMock).not.toHaveBeenCalled();
  });

  it("keeps explicitly provided primitive fields", () => {
    const node = createBookmarkNode({
      id: "a",
      title: "Chapter 1",
      pageNumber: 42,
      expanded: false,
    });

    expect(node).toEqual({
      id: "a",
      title: "Chapter 1",
      pageNumber: 42,
      children: [],
      expanded: false,
    });
  });

  it("treats falsy-but-defined title/pageNumber via nullish coalescing", () => {
    // "" and 0 are not null/undefined, so ?? keeps them as-is.
    const node = createBookmarkNode({ title: "", pageNumber: 0 });

    expect(node.title).toBe("");
    expect(node.pageNumber).toBe(0);
  });

  it("defaults expanded to true only when undefined, keeping explicit false", () => {
    expect(createBookmarkNode({ expanded: false }).expanded).toBe(false);
    expect(createBookmarkNode({ expanded: true }).expanded).toBe(true);
    expect(createBookmarkNode({}).expanded).toBe(true);
  });

  it("recursively builds nested children, assigning ids depth-first", () => {
    const node = createBookmarkNode({
      id: "root",
      title: "Root",
      children: [
        { title: "Child A", children: [{ title: "Grandchild" }] },
        { title: "Child B" },
      ] as unknown as BookmarkNode[],
    });

    expect(node.id).toBe("root");
    expect(node.children).toHaveLength(2);

    const [childA, childB] = node.children;
    // Depth-first traversal: Child A (id-1), then its grandchild (id-2),
    // then Child B (id-3).
    expect(childA.id).toBe("id-1");
    expect(childA.children[0].id).toBe("id-2");
    expect(childA.children[0].title).toBe("Grandchild");
    expect(childA.children[0].children).toEqual([]);
    expect(childB.id).toBe("id-3");
    expect(childB.children).toEqual([]);
    expect(generateIdMock).toHaveBeenCalledTimes(3);
  });

  it("treats an empty children array as a leaf (no generated child ids)", () => {
    const node = createBookmarkNode({ id: "x", children: [] });

    expect(node.children).toEqual([]);
    expect(generateIdMock).not.toHaveBeenCalled();
  });
});

describe("hydrateBookmarkPayload", () => {
  it("returns an empty array for the default (no) argument", () => {
    expect(hydrateBookmarkPayload()).toEqual([]);
    expect(generateIdMock).not.toHaveBeenCalled();
  });

  it("returns an empty array for an explicitly empty payload", () => {
    expect(hydrateBookmarkPayload([])).toEqual([]);
  });

  it("hydrates a flat payload, generating ids and forcing expanded true", () => {
    const payload: BookmarkPayload[] = [
      { title: "First", pageNumber: 3 },
      { title: "Second", pageNumber: 7 },
    ];

    const nodes = hydrateBookmarkPayload(payload);

    expect(nodes).toEqual([
      {
        id: "id-1",
        title: "First",
        pageNumber: 3,
        expanded: true,
        children: [],
      },
      {
        id: "id-2",
        title: "Second",
        pageNumber: 7,
        expanded: true,
        children: [],
      },
    ]);
  });

  it("clamps non-positive, non-numeric, or missing page numbers to 1", () => {
    const payload = [
      { title: "zero", pageNumber: 0 },
      { title: "negative", pageNumber: -5 },
      { title: "nan", pageNumber: Number.NaN },
      { title: "missing" } as BookmarkPayload,
      { title: "string", pageNumber: "4" } as unknown as BookmarkPayload,
    ];

    const pages = hydrateBookmarkPayload(payload).map((n) => n.pageNumber);

    // 0, -5, NaN, undefined, and a non-number all fall back to 1.
    expect(pages).toEqual([1, 1, 1, 1, 1]);
  });

  it("keeps a valid positive page number", () => {
    const nodes = hydrateBookmarkPayload([{ title: "ok", pageNumber: 99 }]);
    expect(nodes[0].pageNumber).toBe(99);
  });

  it("coalesces a missing title to an empty string", () => {
    const nodes = hydrateBookmarkPayload([
      { pageNumber: 2 } as BookmarkPayload,
    ]);
    expect(nodes[0].title).toBe("");
  });

  it("recursively hydrates nested children depth-first", () => {
    const payload: BookmarkPayload[] = [
      {
        title: "Parent",
        pageNumber: 1,
        children: [
          {
            title: "Child",
            pageNumber: 2,
            children: [{ title: "Grandchild", pageNumber: 3 }],
          },
        ],
      },
    ];

    const [parent] = hydrateBookmarkPayload(payload);

    expect(parent.id).toBe("id-1");
    expect(parent.children[0].id).toBe("id-2");
    expect(parent.children[0].children[0].id).toBe("id-3");
    expect(parent.children[0].children[0].title).toBe("Grandchild");
    expect(parent.children[0].children[0].pageNumber).toBe(3);
    expect(parent.children[0].children[0].children).toEqual([]);
    expect(generateIdMock).toHaveBeenCalledTimes(3);
  });
});

describe("serializeBookmarkNodes", () => {
  it("returns an empty array for no nodes", () => {
    expect(serializeBookmarkNodes([])).toEqual([]);
  });

  it("drops id and expanded, keeping only title/pageNumber/children", () => {
    const nodes: BookmarkNode[] = [
      {
        id: "id-1",
        title: "Only",
        pageNumber: 5,
        expanded: false,
        children: [],
      },
    ];

    expect(serializeBookmarkNodes(nodes)).toEqual([
      { title: "Only", pageNumber: 5, children: [] },
    ]);
  });

  it("always emits a children array, even for leaves", () => {
    const node: BookmarkNode = {
      id: "x",
      title: "Leaf",
      pageNumber: 1,
      expanded: true,
      children: [],
    };

    const [serialized] = serializeBookmarkNodes([node]);
    expect(serialized.children).toEqual([]);
    expect(Array.isArray(serialized.children)).toBe(true);
  });

  it("recursively serializes nested children", () => {
    const tree: BookmarkNode[] = [
      {
        id: "1",
        title: "Parent",
        pageNumber: 1,
        expanded: true,
        children: [
          {
            id: "2",
            title: "Child",
            pageNumber: 2,
            expanded: false,
            children: [
              {
                id: "3",
                title: "Grandchild",
                pageNumber: 3,
                expanded: true,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    expect(serializeBookmarkNodes(tree)).toEqual([
      {
        title: "Parent",
        pageNumber: 1,
        children: [
          {
            title: "Child",
            pageNumber: 2,
            children: [{ title: "Grandchild", pageNumber: 3, children: [] }],
          },
        ],
      },
    ]);
  });
});

describe("round-trip between hydrate and serialize", () => {
  it("preserves titles, page numbers, and nesting structure", () => {
    const payload: BookmarkPayload[] = [
      {
        title: "Intro",
        pageNumber: 1,
        children: [{ title: "Section", pageNumber: 2 }],
      },
      { title: "Outro", pageNumber: 10 },
    ];

    const hydrated = hydrateBookmarkPayload(payload);
    const serialized = serializeBookmarkNodes(hydrated);

    expect(serialized).toEqual([
      {
        title: "Intro",
        pageNumber: 1,
        children: [{ title: "Section", pageNumber: 2, children: [] }],
      },
      { title: "Outro", pageNumber: 10, children: [] },
    ]);
  });

  it("normalizes invalid page numbers during the round-trip", () => {
    const payload = [{ title: "bad", pageNumber: -1 }] as BookmarkPayload[];

    const serialized = serializeBookmarkNodes(hydrateBookmarkPayload(payload));

    // The hydrate step clamps -1 to 1, and serialize echoes that value back.
    expect(serialized).toEqual([{ title: "bad", pageNumber: 1, children: [] }]);
  });
});
