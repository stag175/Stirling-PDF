import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { MutableRefObject } from "react";
import { createViewerActions } from "@app/contexts/viewer/viewerActions";
import {
  createBridgeRegistry,
  type ViewerBridgeRegistry,
  type ScrollState,
  type ZoomState,
} from "@app/contexts/viewer/viewerBridges";

/**
 * Deterministic unit tests for createViewerActions.
 *
 * The builder wires ~11 action bundles over a mutable registry ref and a set
 * of state callbacks. No real PDF rendering is required: every bridge API is a
 * plain object of vi.fn() spies, and the registry ref is a simple
 * { current } object we mutate per-test. This lets us exercise both the
 * "api present" and "api absent / method missing" branches of every action,
 * plus the success / error / dev-warning paths.
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type Registry = ViewerBridgeRegistry;

function makeRegistryRef(
  initial?: Partial<Registry>,
): MutableRefObject<Registry> {
  const base = createBridgeRegistry();
  return { current: { ...base, ...(initial as Registry) } };
}

function makeScrollState(overrides?: Partial<ScrollState>): ScrollState {
  return { currentPage: 1, totalPages: 10, ...overrides };
}

function makeZoomState(overrides?: Partial<ZoomState>): ZoomState {
  return { currentZoom: 1, zoomPercent: 100, ...overrides };
}

interface Harness {
  registryRef: MutableRefObject<Registry>;
  getScrollState: ReturnType<typeof vi.fn>;
  getZoomState: ReturnType<typeof vi.fn>;
  triggerImmediateZoomUpdate: ReturnType<typeof vi.fn>;
  actions: ReturnType<typeof createViewerActions>;
}

function buildActions(opts?: {
  registry?: Partial<Registry>;
  scrollState?: Partial<ScrollState>;
  zoomState?: Partial<ZoomState>;
}): Harness {
  const registryRef = makeRegistryRef(opts?.registry);
  const getScrollState = vi.fn(() => makeScrollState(opts?.scrollState));
  const getZoomState = vi.fn(() => makeZoomState(opts?.zoomState));
  const triggerImmediateZoomUpdate = vi.fn();

  const actions = createViewerActions({
    registry: registryRef,
    getScrollState,
    getZoomState,
    triggerImmediateZoomUpdate,
  });

  return {
    registryRef,
    getScrollState,
    getZoomState,
    triggerImmediateZoomUpdate,
    actions,
  };
}

// A throwing function we can reuse for the error/catch branches.
const throwing = () => {
  throw new Error("Strategy not found");
};

describe("createViewerActions", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  test("returns all eleven action bundles with their methods", () => {
    const { actions } = buildActions();

    expect(Object.keys(actions).sort()).toEqual(
      [
        "scrollActions",
        "zoomActions",
        "panActions",
        "selectionActions",
        "spreadActions",
        "rotationActions",
        "searchActions",
        "exportActions",
        "bookmarkActions",
        "attachmentActions",
        "printActions",
      ].sort(),
    );

    // Spot-check that each bundle exposes the expected callable methods.
    expect(typeof actions.scrollActions.scrollToPage).toBe("function");
    expect(typeof actions.zoomActions.zoomIn).toBe("function");
    expect(typeof actions.panActions.togglePan).toBe("function");
    expect(typeof actions.selectionActions.getSelectedText).toBe("function");
    expect(typeof actions.spreadActions.toggleSpreadMode).toBe("function");
    expect(typeof actions.rotationActions.getRotation).toBe("function");
    expect(typeof actions.searchActions.search).toBe("function");
    expect(typeof actions.exportActions.saveAsCopy).toBe("function");
    expect(typeof actions.bookmarkActions.fetchBookmarks).toBe("function");
    expect(typeof actions.attachmentActions.getAttachments).toBe("function");
    expect(typeof actions.printActions.print).toBe("function");
  });

  // -------------------------------------------------------------------------
  // Scroll actions
  // -------------------------------------------------------------------------

  describe("scrollActions", () => {
    test("scrollToPage forwards page + default behavior, and explicit behavior", () => {
      const scrollToPage = vi.fn();
      const { actions } = buildActions({
        registry: { scroll: { state: {}, api: { scrollToPage } } as any },
      });

      actions.scrollActions.scrollToPage(5);
      expect(scrollToPage).toHaveBeenCalledWith({
        pageNumber: 5,
        behavior: "smooth",
      });

      actions.scrollActions.scrollToPage(7, "instant");
      expect(scrollToPage).toHaveBeenLastCalledWith({
        pageNumber: 7,
        behavior: "instant",
      });
    });

    test("scrollToPage no-ops when api / method is missing", () => {
      const { actions } = buildActions();
      expect(() => actions.scrollActions.scrollToPage(2)).not.toThrow();

      const withApiNoMethod = buildActions({
        registry: { scroll: { state: {}, api: {} } as any },
      });
      expect(() =>
        withApiNoMethod.actions.scrollActions.scrollToPage(2),
      ).not.toThrow();
    });

    test("scrollToPage swallows errors and warns only in development", () => {
      const { actions } = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToPage: throwing } } as any,
        },
      });

      process.env.NODE_ENV = "production";
      expect(() => actions.scrollActions.scrollToPage(3)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = "development";
      expect(() => actions.scrollActions.scrollToPage(3)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    test("scrollToFirstPage scrolls to page 1, handles missing + error", () => {
      const scrollToPage = vi.fn();
      const { actions } = buildActions({
        registry: { scroll: { state: {}, api: { scrollToPage } } as any },
      });
      actions.scrollActions.scrollToFirstPage();
      expect(scrollToPage).toHaveBeenCalledWith({ pageNumber: 1 });

      // missing api
      expect(() =>
        buildActions().actions.scrollActions.scrollToFirstPage(),
      ).not.toThrow();

      // error path + dev warn
      process.env.NODE_ENV = "development";
      const erroring = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToPage: throwing } } as any,
        },
      });
      expect(() =>
        erroring.actions.scrollActions.scrollToFirstPage(),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    test("scrollToPreviousPage calls api, handles missing + error", () => {
      const scrollToPreviousPage = vi.fn();
      const { actions } = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToPreviousPage } } as any,
        },
      });
      actions.scrollActions.scrollToPreviousPage();
      expect(scrollToPreviousPage).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.scrollActions.scrollToPreviousPage(),
      ).not.toThrow();

      process.env.NODE_ENV = "development";
      const erroring = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToPreviousPage: throwing } } as any,
        },
      });
      expect(() =>
        erroring.actions.scrollActions.scrollToPreviousPage(),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    test("scrollToNextPage calls api, handles missing + error", () => {
      const scrollToNextPage = vi.fn();
      const { actions } = buildActions({
        registry: { scroll: { state: {}, api: { scrollToNextPage } } as any },
      });
      actions.scrollActions.scrollToNextPage();
      expect(scrollToNextPage).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.scrollActions.scrollToNextPage(),
      ).not.toThrow();

      process.env.NODE_ENV = "development";
      const erroring = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToNextPage: throwing } } as any,
        },
      });
      expect(() =>
        erroring.actions.scrollActions.scrollToNextPage(),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    test("scrollToLastPage uses totalPages from state when > 0", () => {
      const scrollToPage = vi.fn();
      const { actions, getScrollState } = buildActions({
        registry: { scroll: { state: {}, api: { scrollToPage } } as any },
        scrollState: { totalPages: 42 },
      });
      actions.scrollActions.scrollToLastPage();
      expect(getScrollState).toHaveBeenCalled();
      expect(scrollToPage).toHaveBeenCalledWith({ pageNumber: 42 });
    });

    test("scrollToLastPage no-ops when totalPages is 0", () => {
      const scrollToPage = vi.fn();
      const { actions } = buildActions({
        registry: { scroll: { state: {}, api: { scrollToPage } } as any },
        scrollState: { totalPages: 0 },
      });
      actions.scrollActions.scrollToLastPage();
      expect(scrollToPage).not.toHaveBeenCalled();
    });

    test("scrollToLastPage no-ops when api missing and warns on error in dev", () => {
      expect(() =>
        buildActions({
          scrollState: { totalPages: 5 },
        }).actions.scrollActions.scrollToLastPage(),
      ).not.toThrow();

      process.env.NODE_ENV = "development";
      const erroring = buildActions({
        registry: {
          scroll: { state: {}, api: { scrollToPage: throwing } } as any,
        },
        scrollState: { totalPages: 5 },
      });
      expect(() =>
        erroring.actions.scrollActions.scrollToLastPage(),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Zoom actions
  // -------------------------------------------------------------------------

  describe("zoomActions", () => {
    test("zoomIn computes capped percent, triggers update, calls api", () => {
      const zoomIn = vi.fn();
      const { actions, triggerImmediateZoomUpdate } = buildActions({
        registry: { zoom: { state: {}, api: { zoomIn } } as any },
        zoomState: { zoomPercent: 100 },
      });
      actions.zoomActions.zoomIn();
      // round(100 * 1.2) = 120, capped at 300
      expect(triggerImmediateZoomUpdate).toHaveBeenCalledWith(120);
      expect(zoomIn).toHaveBeenCalledTimes(1);
    });

    test("zoomIn caps the percent at 300", () => {
      const zoomIn = vi.fn();
      const { actions, triggerImmediateZoomUpdate } = buildActions({
        registry: { zoom: { state: {}, api: { zoomIn } } as any },
        zoomState: { zoomPercent: 290 },
      });
      actions.zoomActions.zoomIn();
      // round(290 * 1.2) = 348 -> capped to 300
      expect(triggerImmediateZoomUpdate).toHaveBeenCalledWith(300);
    });

    test("zoomIn no-ops when api missing", () => {
      const { actions, triggerImmediateZoomUpdate } = buildActions();
      actions.zoomActions.zoomIn();
      expect(triggerImmediateZoomUpdate).not.toHaveBeenCalled();
    });

    test("zoomOut computes floored percent, triggers update, calls api", () => {
      const zoomOut = vi.fn();
      const { actions, triggerImmediateZoomUpdate } = buildActions({
        registry: { zoom: { state: {}, api: { zoomOut } } as any },
        zoomState: { zoomPercent: 120 },
      });
      actions.zoomActions.zoomOut();
      // round(120 / 1.2) = 100, floor at 20
      expect(triggerImmediateZoomUpdate).toHaveBeenCalledWith(100);
      expect(zoomOut).toHaveBeenCalledTimes(1);
    });

    test("zoomOut floors the percent at 20", () => {
      const zoomOut = vi.fn();
      const { actions, triggerImmediateZoomUpdate } = buildActions({
        registry: { zoom: { state: {}, api: { zoomOut } } as any },
        zoomState: { zoomPercent: 20 },
      });
      actions.zoomActions.zoomOut();
      // round(20 / 1.2) = 17 -> floored to 20
      expect(triggerImmediateZoomUpdate).toHaveBeenCalledWith(20);
    });

    test("zoomOut no-ops when api missing", () => {
      const { actions, triggerImmediateZoomUpdate } = buildActions();
      actions.zoomActions.zoomOut();
      expect(triggerImmediateZoomUpdate).not.toHaveBeenCalled();
    });

    test("toggleMarqueeZoom calls api when present, no-ops otherwise", () => {
      const toggleMarqueeZoom = vi.fn();
      const { actions } = buildActions({
        registry: { zoom: { state: {}, api: { toggleMarqueeZoom } } as any },
      });
      actions.zoomActions.toggleMarqueeZoom();
      expect(toggleMarqueeZoom).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.zoomActions.toggleMarqueeZoom(),
      ).not.toThrow();
    });

    test("requestZoom forwards level + center, no-ops otherwise", () => {
      const requestZoom = vi.fn();
      const { actions } = buildActions({
        registry: { zoom: { state: {}, api: { requestZoom } } as any },
      });
      const center = { x: 1, y: 2 };
      actions.zoomActions.requestZoom(1.5, center);
      expect(requestZoom).toHaveBeenCalledWith(1.5, center);

      expect(() =>
        buildActions().actions.zoomActions.requestZoom(2),
      ).not.toThrow();
    });

    test("setZoomLevel triggers percent update then requests zoom", () => {
      const requestZoom = vi.fn();
      const { actions, triggerImmediateZoomUpdate } = buildActions({
        registry: { zoom: { state: {}, api: { requestZoom } } as any },
      });
      actions.zoomActions.setZoomLevel(1.5);
      expect(triggerImmediateZoomUpdate).toHaveBeenCalledWith(150);
      expect(requestZoom).toHaveBeenCalledWith(1.5);
    });

    test("setZoomLevel no-ops when requestZoom missing", () => {
      const { actions, triggerImmediateZoomUpdate } = buildActions();
      actions.zoomActions.setZoomLevel(2);
      expect(triggerImmediateZoomUpdate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Pan actions
  // -------------------------------------------------------------------------

  describe("panActions", () => {
    test("enable / disable / toggle call api when present", () => {
      const enable = vi.fn();
      const disable = vi.fn();
      const toggle = vi.fn();
      const { actions } = buildActions({
        registry: {
          pan: { state: {}, api: { enable, disable, toggle } } as any,
        },
      });
      actions.panActions.enablePan();
      actions.panActions.disablePan();
      actions.panActions.togglePan();
      expect(enable).toHaveBeenCalledTimes(1);
      expect(disable).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    test("pan actions no-op when api missing", () => {
      const { actions } = buildActions();
      expect(() => {
        actions.panActions.enablePan();
        actions.panActions.disablePan();
        actions.panActions.togglePan();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Selection actions
  // -------------------------------------------------------------------------

  describe("selectionActions", () => {
    test("copyToClipboard calls api when present, no-ops otherwise", () => {
      const copyToClipboard = vi.fn();
      const { actions } = buildActions({
        registry: { selection: { state: {}, api: { copyToClipboard } } as any },
      });
      actions.selectionActions.copyToClipboard();
      expect(copyToClipboard).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.selectionActions.copyToClipboard(),
      ).not.toThrow();
    });

    test("getSelectedText returns text, empty for nullish or missing api", () => {
      const withText = buildActions({
        registry: {
          selection: {
            state: {},
            api: { getSelectedText: () => "hello" },
          } as any,
        },
      });
      expect(withText.actions.selectionActions.getSelectedText()).toBe("hello");

      const withNull = buildActions({
        registry: {
          selection: {
            state: {},
            api: { getSelectedText: () => null },
          } as any,
        },
      });
      expect(withNull.actions.selectionActions.getSelectedText()).toBe("");

      const missing = buildActions();
      expect(missing.actions.selectionActions.getSelectedText()).toBe("");
    });

    test("getFormattedSelection returns api result, null when missing", () => {
      const formatted = { runs: [] };
      const withApi = buildActions({
        registry: {
          selection: {
            state: {},
            api: { getFormattedSelection: () => formatted },
          } as any,
        },
      });
      expect(withApi.actions.selectionActions.getFormattedSelection()).toBe(
        formatted,
      );

      const missing = buildActions();
      expect(
        missing.actions.selectionActions.getFormattedSelection(),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Spread actions
  // -------------------------------------------------------------------------

  describe("spreadActions", () => {
    test("setSpreadMode forwards the mode, no-ops otherwise", () => {
      const setSpreadMode = vi.fn();
      const { actions } = buildActions({
        registry: { spread: { state: {}, api: { setSpreadMode } } as any },
      });
      actions.spreadActions.setSpreadMode("Odd" as any);
      expect(setSpreadMode).toHaveBeenCalledWith("Odd");

      expect(() =>
        buildActions().actions.spreadActions.setSpreadMode("None" as any),
      ).not.toThrow();
    });

    test("getSpreadMode returns api value, null when missing", () => {
      const withApi = buildActions({
        registry: {
          spread: { state: {}, api: { getSpreadMode: () => "Even" } } as any,
        },
      });
      expect(withApi.actions.spreadActions.getSpreadMode()).toBe("Even");

      const missing = buildActions();
      expect(missing.actions.spreadActions.getSpreadMode()).toBeNull();
    });

    test("toggleSpreadMode calls api when present, no-ops otherwise", () => {
      const toggleSpreadMode = vi.fn();
      const { actions } = buildActions({
        registry: { spread: { state: {}, api: { toggleSpreadMode } } as any },
      });
      actions.spreadActions.toggleSpreadMode();
      expect(toggleSpreadMode).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.spreadActions.toggleSpreadMode(),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Rotation actions
  // -------------------------------------------------------------------------

  describe("rotationActions", () => {
    test("rotateForward / rotateBackward call api when present", () => {
      const rotateForward = vi.fn();
      const rotateBackward = vi.fn();
      const { actions } = buildActions({
        registry: {
          rotation: {
            state: {},
            api: { rotateForward, rotateBackward },
          } as any,
        },
      });
      actions.rotationActions.rotateForward();
      actions.rotationActions.rotateBackward();
      expect(rotateForward).toHaveBeenCalledTimes(1);
      expect(rotateBackward).toHaveBeenCalledTimes(1);
    });

    test("rotate actions no-op when api missing", () => {
      const { actions } = buildActions();
      expect(() => {
        actions.rotationActions.rotateForward();
        actions.rotationActions.rotateBackward();
      }).not.toThrow();
    });

    test("setRotation forwards value, no-ops otherwise", () => {
      const setRotation = vi.fn();
      const { actions } = buildActions({
        registry: { rotation: { state: {}, api: { setRotation } } as any },
      });
      actions.rotationActions.setRotation(90);
      expect(setRotation).toHaveBeenCalledWith(90);

      expect(() =>
        buildActions().actions.rotationActions.setRotation(180),
      ).not.toThrow();
    });

    test("getRotation returns api value, 0 when missing", () => {
      const withApi = buildActions({
        registry: {
          rotation: { state: {}, api: { getRotation: () => 270 } } as any,
        },
      });
      expect(withApi.actions.rotationActions.getRotation()).toBe(270);

      const missing = buildActions();
      expect(missing.actions.rotationActions.getRotation()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Search actions
  // -------------------------------------------------------------------------

  describe("searchActions", () => {
    test("search returns the api promise, undefined when missing", async () => {
      const result = [{ pageIndex: 0 }];
      const search = vi.fn(() => Promise.resolve(result));
      const { actions } = buildActions({
        registry: { search: { state: {}, api: { search } } as any },
      });
      const promise = actions.searchActions.search("query");
      expect(search).toHaveBeenCalledWith("query");
      await expect(promise).resolves.toBe(result);

      const missing = buildActions();
      expect(missing.actions.searchActions.search("q")).toBeUndefined();
    });

    test("next / previous / clear / goToResult forward to api", () => {
      const next = vi.fn();
      const previous = vi.fn();
      const clear = vi.fn();
      const goToResult = vi.fn();
      const { actions } = buildActions({
        registry: {
          search: {
            state: {},
            api: { next, previous, clear, goToResult },
          } as any,
        },
      });
      actions.searchActions.next();
      actions.searchActions.previous();
      actions.searchActions.clear();
      actions.searchActions.goToResult(3);
      expect(next).toHaveBeenCalledTimes(1);
      expect(previous).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(goToResult).toHaveBeenCalledWith(3);
    });

    test("search non-promise methods no-op when api missing", () => {
      const { actions } = buildActions();
      expect(() => {
        actions.searchActions.next();
        actions.searchActions.previous();
        actions.searchActions.clear();
        actions.searchActions.goToResult(0);
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Export actions
  // -------------------------------------------------------------------------

  describe("exportActions", () => {
    test("saveAsCopy resolves the api promise result", async () => {
      const buffer = new ArrayBuffer(8);
      const saveAsCopy = vi.fn(() => ({
        toPromise: () => Promise.resolve(buffer),
      }));
      const { actions } = buildActions({
        registry: { export: { state: {}, api: { saveAsCopy } } as any },
      });
      const result = await actions.exportActions.saveAsCopy();
      expect(saveAsCopy).toHaveBeenCalledTimes(1);
      expect(result).toBe(buffer);
    });

    test("saveAsCopy returns null and logs when the api throws", async () => {
      const saveAsCopy = vi.fn(() => {
        throw new Error("boom");
      });
      const { actions } = buildActions({
        registry: { export: { state: {}, api: { saveAsCopy } } as any },
      });
      const result = await actions.exportActions.saveAsCopy();
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    test("saveAsCopy returns null and logs when toPromise rejects", async () => {
      const saveAsCopy = vi.fn(() => ({
        toPromise: () => Promise.reject(new Error("reject")),
      }));
      const { actions } = buildActions({
        registry: { export: { state: {}, api: { saveAsCopy } } as any },
      });
      const result = await actions.exportActions.saveAsCopy();
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    test("saveAsCopy returns null when api missing", async () => {
      const { actions } = buildActions();
      await expect(actions.exportActions.saveAsCopy()).resolves.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Bookmark actions
  // -------------------------------------------------------------------------

  describe("bookmarkActions", () => {
    test("fetchBookmarks returns api result, null when missing", async () => {
      const bookmarks = [{ title: "B" }];
      const fetchBookmarks = vi.fn(() => Promise.resolve(bookmarks));
      const { actions } = buildActions({
        registry: { bookmark: { state: {}, api: { fetchBookmarks } } as any },
      });
      await expect(actions.bookmarkActions.fetchBookmarks()).resolves.toBe(
        bookmarks,
      );

      const missing = buildActions();
      await expect(
        missing.actions.bookmarkActions.fetchBookmarks(),
      ).resolves.toBeNull();
    });

    test("clearBookmarks calls api when present, no-ops otherwise", () => {
      const clearBookmarks = vi.fn();
      const { actions } = buildActions({
        registry: { bookmark: { state: {}, api: { clearBookmarks } } as any },
      });
      actions.bookmarkActions.clearBookmarks();
      expect(clearBookmarks).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.bookmarkActions.clearBookmarks(),
      ).not.toThrow();
    });

    test("setLocalBookmarks forwards bookmarks + default null error", () => {
      const setLocalBookmarks = vi.fn();
      const { actions } = buildActions({
        registry: {
          bookmark: { state: {}, api: { setLocalBookmarks } } as any,
        },
      });
      const bms = [{ title: "B" }] as any;
      actions.bookmarkActions.setLocalBookmarks(bms);
      expect(setLocalBookmarks).toHaveBeenCalledWith(bms, null);

      // explicit error + null bookmarks coalesce path
      actions.bookmarkActions.setLocalBookmarks(null, "oops");
      expect(setLocalBookmarks).toHaveBeenLastCalledWith(null, "oops");

      expect(() =>
        buildActions().actions.bookmarkActions.setLocalBookmarks(bms),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Attachment actions
  // -------------------------------------------------------------------------

  describe("attachmentActions", () => {
    test("getAttachments returns api result, null when missing", async () => {
      const attachments = [{ name: "a.txt" }];
      const getAttachments = vi.fn(() => Promise.resolve(attachments));
      const { actions } = buildActions({
        registry: { attachment: { state: {}, api: { getAttachments } } as any },
      });
      await expect(actions.attachmentActions.getAttachments()).resolves.toBe(
        attachments,
      );

      const missing = buildActions();
      await expect(
        missing.actions.attachmentActions.getAttachments(),
      ).resolves.toBeNull();
    });

    test("downloadAttachment forwards the attachment, no-ops otherwise", () => {
      const downloadAttachment = vi.fn();
      const { actions } = buildActions({
        registry: {
          attachment: { state: {}, api: { downloadAttachment } } as any,
        },
      });
      const att = { name: "a.txt" } as any;
      actions.attachmentActions.downloadAttachment(att);
      expect(downloadAttachment).toHaveBeenCalledWith(att);

      expect(() =>
        buildActions().actions.attachmentActions.downloadAttachment(att),
      ).not.toThrow();
    });

    test("clearAttachments calls api when present, no-ops otherwise", () => {
      const clearAttachments = vi.fn();
      const { actions } = buildActions({
        registry: {
          attachment: { state: {}, api: { clearAttachments } } as any,
        },
      });
      actions.attachmentActions.clearAttachments();
      expect(clearAttachments).toHaveBeenCalledTimes(1);

      expect(() =>
        buildActions().actions.attachmentActions.clearAttachments(),
      ).not.toThrow();
    });

    test("setLocalAttachments forwards attachments + default null error", () => {
      const setLocalAttachments = vi.fn();
      const { actions } = buildActions({
        registry: {
          attachment: { state: {}, api: { setLocalAttachments } } as any,
        },
      });
      const atts = [{ name: "a.txt" }] as any;
      actions.attachmentActions.setLocalAttachments(atts);
      expect(setLocalAttachments).toHaveBeenCalledWith(atts, null);

      actions.attachmentActions.setLocalAttachments(null, "err");
      expect(setLocalAttachments).toHaveBeenLastCalledWith(null, "err");

      expect(() =>
        buildActions().actions.attachmentActions.setLocalAttachments(atts),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Print actions
  // -------------------------------------------------------------------------

  describe("printActions", () => {
    test("print calls api when present, no-ops otherwise", () => {
      const print = vi.fn();
      const { actions } = buildActions({
        registry: { print: { state: {}, api: { print } } as any },
      });
      actions.printActions.print();
      expect(print).toHaveBeenCalledTimes(1);

      expect(() => buildActions().actions.printActions.print()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Late binding via the mutable registry ref
  // -------------------------------------------------------------------------

  test("actions read the registry ref live (late-bound bridges)", () => {
    const { actions, registryRef } = buildActions();

    // No bridge registered yet -> no-op.
    expect(() => actions.zoomActions.zoomIn()).not.toThrow();

    // Register a bridge after the actions bundle was created.
    const zoomIn = vi.fn();
    registryRef.current.zoom = { state: {}, api: { zoomIn } } as any;
    actions.zoomActions.zoomIn();
    expect(zoomIn).toHaveBeenCalledTimes(1);
  });
});
