import { describe, expect, it } from "vitest";

import {
  SidebarRefs,
  SidebarState,
} from "@app/types/sidebar";
import { getSidebarInfo } from "@app/utils/sidebarUtils";

const makeRect = (left: number): DOMRect =>
  ({
    left,
    top: 0,
    right: left + 10,
    bottom: 10,
    width: 10,
    height: 10,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const refTo = (rect: DOMRect | null) => ({
  current: rect
    ? ({ getBoundingClientRect: () => rect } as unknown as HTMLDivElement)
    : null,
});

const refs = (quick: DOMRect | null, tool: DOMRect | null): SidebarRefs =>
  ({ quickAccessRef: refTo(quick), toolPanelRef: refTo(tool) }) as SidebarRefs;

const state = (overrides: Partial<SidebarState> = {}): SidebarState => ({
  sidebarsVisible: true,
  leftPanelView: "toolPicker",
  readerMode: false,
  ...overrides,
});

describe("getSidebarInfo", () => {
  it("uses the tool-panel rect when the panel is active and present", () => {
    const toolRect = makeRect(100);
    const info = getSidebarInfo(refs(makeRect(5), toolRect), state());
    expect(info.isToolPanelActive).toBe(true);
    expect(info.rect).toBe(toolRect);
  });

  it("falls back to the quick-access rect when active but the tool panel is absent", () => {
    const quickRect = makeRect(5);
    const info = getSidebarInfo(refs(quickRect, null), state());
    expect(info.isToolPanelActive).toBe(true);
    expect(info.rect).toBe(quickRect);
  });

  it("reader mode deactivates the tool panel and falls back to quick access", () => {
    const quickRect = makeRect(5);
    const info = getSidebarInfo(
      refs(quickRect, makeRect(100)),
      state({ readerMode: true }),
    );
    expect(info.isToolPanelActive).toBe(false);
    expect(info.rect).toBe(quickRect);
  });

  it("hidden sidebars deactivate the tool panel", () => {
    const info = getSidebarInfo(
      refs(null, makeRect(100)),
      state({ sidebarsVisible: false }),
    );
    expect(info.isToolPanelActive).toBe(false);
    expect(info.rect).toBeNull();
  });

  it("returns a null rect when no refs are mounted", () => {
    const info = getSidebarInfo(refs(null, null), state());
    expect(info.rect).toBeNull();
  });

  it("passes the sidebar state through unchanged", () => {
    const s = state();
    expect(getSidebarInfo(refs(null, null), s).sidebarState).toBe(s);
  });
});
