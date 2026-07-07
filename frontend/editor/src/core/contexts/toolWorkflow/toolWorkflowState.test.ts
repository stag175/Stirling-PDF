import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import type { PageEditorFunctions } from "@app/types/pageEditor";

/**
 * Deterministic unit tests for the toolWorkflow reducer + createInitialState.
 *
 * preferencesService is mocked so createInitialState() has a fixed, controllable
 * return value (no localStorage / server-default dependency), letting us assert
 * the exact ToolPanelMode the initial state is seeded with.
 */
const mockGetPreference = vi.fn<(key: string) => unknown>();
vi.mock("@app/services/preferencesService", () => ({
  preferencesService: {
    getPreference: (key: string) => mockGetPreference(key),
  },
}));

import {
  baseState,
  createInitialState,
  toolWorkflowReducer,
  type ToolWorkflowAction,
  type ToolWorkflowState,
} from "@app/contexts/toolWorkflow/toolWorkflowState";

// A non-default state used to prove every handler produces a NEW object and
// leaves all unrelated fields untouched.
const makeState = (
  overrides: Partial<ToolWorkflowState> = {},
): ToolWorkflowState => ({
  sidebarsVisible: false,
  leftPanelView: "toolContent",
  readerMode: true,
  toolPanelMode: "fullscreen",
  previewFile: new File(["seed"], "seed.pdf", { type: "application/pdf" }),
  pageEditorFunctions: { tag: "pe" } as unknown as PageEditorFunctions,
  searchQuery: "seed-query",
  ...overrides,
});

beforeEach(() => {
  mockGetPreference.mockReset();
  mockGetPreference.mockReturnValue("sidebar" satisfies ToolPanelMode);
});

describe("baseState", () => {
  it("holds the documented UI defaults and omits toolPanelMode", () => {
    expect(baseState).toEqual({
      sidebarsVisible: true,
      leftPanelView: "toolPicker",
      readerMode: false,
      previewFile: null,
      pageEditorFunctions: null,
      searchQuery: "",
    });
    expect("toolPanelMode" in baseState).toBe(false);
  });
});

describe("createInitialState", () => {
  it("spreads baseState and seeds toolPanelMode from the preference", () => {
    const state = createInitialState();

    expect(mockGetPreference).toHaveBeenCalledTimes(1);
    expect(mockGetPreference).toHaveBeenCalledWith("defaultToolPanelMode");
    expect(state).toEqual({
      ...baseState,
      toolPanelMode: "sidebar",
    });
  });

  it("reflects a different preference value (fullscreen)", () => {
    mockGetPreference.mockReturnValue("fullscreen" satisfies ToolPanelMode);

    const state = createInitialState();

    expect(state.toolPanelMode).toBe("fullscreen");
    // baseState-derived fields are still the defaults.
    expect(state.sidebarsVisible).toBe(true);
    expect(state.leftPanelView).toBe("toolPicker");
  });

  it("returns a fresh object each call (does not alias baseState)", () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a).not.toBe(b);
    expect(a).not.toBe(baseState);
  });
});

describe("toolWorkflowReducer - individual SET_* handlers", () => {
  it("SET_SIDEBARS_VISIBLE sets the flag and preserves the rest", () => {
    const state = makeState({ sidebarsVisible: false });
    const next = toolWorkflowReducer(state, {
      type: "SET_SIDEBARS_VISIBLE",
      payload: true,
    });

    expect(next).not.toBe(state);
    expect(next.sidebarsVisible).toBe(true);
    expect(next.leftPanelView).toBe(state.leftPanelView);
    expect(next.readerMode).toBe(state.readerMode);
    expect(next.toolPanelMode).toBe(state.toolPanelMode);
    expect(next.previewFile).toBe(state.previewFile);
    expect(next.pageEditorFunctions).toBe(state.pageEditorFunctions);
    expect(next.searchQuery).toBe(state.searchQuery);
    // input not mutated
    expect(state.sidebarsVisible).toBe(false);
  });

  it.each<["toolPicker" | "toolContent" | "hidden"]>([
    ["toolPicker"],
    ["toolContent"],
    ["hidden"],
  ])("SET_LEFT_PANEL_VIEW handles %s", (view) => {
    const state = makeState({ leftPanelView: "toolContent" });
    const next = toolWorkflowReducer(state, {
      type: "SET_LEFT_PANEL_VIEW",
      payload: view,
    });

    expect(next).not.toBe(state);
    expect(next.leftPanelView).toBe(view);
    expect(next.sidebarsVisible).toBe(state.sidebarsVisible);
  });

  it.each([[true], [false]])("SET_READER_MODE handles %s", (value) => {
    const state = makeState({ readerMode: !value });
    const next = toolWorkflowReducer(state, {
      type: "SET_READER_MODE",
      payload: value,
    });

    expect(next).not.toBe(state);
    expect(next.readerMode).toBe(value);
    expect(next.searchQuery).toBe(state.searchQuery);
  });

  it.each<[ToolPanelMode]>([["sidebar"], ["fullscreen"]])(
    "SET_TOOL_PANEL_MODE handles %s",
    (mode) => {
      const state = makeState({ toolPanelMode: "sidebar" });
      const next = toolWorkflowReducer(state, {
        type: "SET_TOOL_PANEL_MODE",
        payload: mode,
      });

      expect(next).not.toBe(state);
      expect(next.toolPanelMode).toBe(mode);
      expect(next.readerMode).toBe(state.readerMode);
    },
  );

  it("SET_PREVIEW_FILE sets a File payload", () => {
    const state = makeState({ previewFile: null });
    const file = new File(["abc"], "doc.pdf", { type: "application/pdf" });
    const next = toolWorkflowReducer(state, {
      type: "SET_PREVIEW_FILE",
      payload: file,
    });

    expect(next).not.toBe(state);
    expect(next.previewFile).toBe(file);
  });

  it("SET_PREVIEW_FILE clears to null", () => {
    const state = makeState();
    const next = toolWorkflowReducer(state, {
      type: "SET_PREVIEW_FILE",
      payload: null,
    });

    expect(next.previewFile).toBeNull();
    expect(next.searchQuery).toBe(state.searchQuery);
  });

  it("SET_PAGE_EDITOR_FUNCTIONS sets functions and clears to null", () => {
    const fns = { editor: true } as unknown as PageEditorFunctions;
    const state = makeState({ pageEditorFunctions: null });

    const withFns = toolWorkflowReducer(state, {
      type: "SET_PAGE_EDITOR_FUNCTIONS",
      payload: fns,
    });
    expect(withFns).not.toBe(state);
    expect(withFns.pageEditorFunctions).toBe(fns);

    const cleared = toolWorkflowReducer(withFns, {
      type: "SET_PAGE_EDITOR_FUNCTIONS",
      payload: null,
    });
    expect(cleared.pageEditorFunctions).toBeNull();
  });

  it.each([["report"], [""], ["  trimmed?  "]])(
    "SET_SEARCH_QUERY handles %j",
    (query) => {
      const state = makeState({ searchQuery: "old" });
      const next = toolWorkflowReducer(state, {
        type: "SET_SEARCH_QUERY",
        payload: query,
      });

      expect(next).not.toBe(state);
      expect(next.searchQuery).toBe(query);
      expect(next.leftPanelView).toBe(state.leftPanelView);
    },
  );
});

describe("toolWorkflowReducer - RESET_UI_STATE", () => {
  it("resets UI to baseState but preserves toolPanelMode and searchQuery", () => {
    const state = makeState({
      sidebarsVisible: false,
      leftPanelView: "hidden",
      readerMode: true,
      toolPanelMode: "fullscreen",
      previewFile: new File(["x"], "x.pdf"),
      pageEditorFunctions: { keep: false } as unknown as PageEditorFunctions,
      searchQuery: "preserve-me",
    });

    const next = toolWorkflowReducer(state, { type: "RESET_UI_STATE" });

    expect(next).not.toBe(state);
    // Preserved fields.
    expect(next.toolPanelMode).toBe("fullscreen");
    expect(next.searchQuery).toBe("preserve-me");
    // Reset-to-baseState fields.
    expect(next.sidebarsVisible).toBe(true);
    expect(next.leftPanelView).toBe("toolPicker");
    expect(next.readerMode).toBe(false);
    expect(next.previewFile).toBeNull();
    expect(next.pageEditorFunctions).toBeNull();
  });

  it("preserves a sidebar toolPanelMode and an empty searchQuery", () => {
    const state = makeState({
      toolPanelMode: "sidebar",
      searchQuery: "",
    });

    const next = toolWorkflowReducer(state, { type: "RESET_UI_STATE" });

    expect(next.toolPanelMode).toBe("sidebar");
    expect(next.searchQuery).toBe("");
    expect(next).toEqual({
      ...baseState,
      toolPanelMode: "sidebar",
      searchQuery: "",
    });
  });
});

describe("toolWorkflowReducer - default / unknown action", () => {
  it("returns the identical state reference for an unrecognized action", () => {
    const state = makeState();
    const next = toolWorkflowReducer(state, {
      type: "TOTALLY_UNKNOWN",
    } as unknown as ToolWorkflowAction);

    expect(next).toBe(state);
  });
});

describe("toolWorkflowReducer - sequenced reductions", () => {
  it("applies a chain of actions starting from createInitialState", () => {
    let state = createInitialState();

    state = toolWorkflowReducer(state, {
      type: "SET_SEARCH_QUERY",
      payload: "merge",
    });
    state = toolWorkflowReducer(state, {
      type: "SET_TOOL_PANEL_MODE",
      payload: "fullscreen",
    });
    state = toolWorkflowReducer(state, {
      type: "SET_READER_MODE",
      payload: true,
    });
    state = toolWorkflowReducer(state, {
      type: "SET_LEFT_PANEL_VIEW",
      payload: "toolContent",
    });

    expect(state.searchQuery).toBe("merge");
    expect(state.toolPanelMode).toBe("fullscreen");
    expect(state.readerMode).toBe(true);
    expect(state.leftPanelView).toBe("toolContent");

    // RESET keeps toolPanelMode + searchQuery, drops the rest.
    const reset = toolWorkflowReducer(state, { type: "RESET_UI_STATE" });
    expect(reset.searchQuery).toBe("merge");
    expect(reset.toolPanelMode).toBe("fullscreen");
    expect(reset.readerMode).toBe(false);
    expect(reset.leftPanelView).toBe("toolPicker");
  });
});
