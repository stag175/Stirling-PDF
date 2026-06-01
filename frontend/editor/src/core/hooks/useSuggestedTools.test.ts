import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ToolId } from "@app/types/toolId";

/**
 * Unit tests for useSuggestedTools.
 *
 * The hook composes three other hooks (NavigationContext, useToolNavigation,
 * useToolWorkflow). We mock all three so the suite is deterministic and
 * exercises every statement: the current-tool filter, the registry-miss
 * fallback branch (including its onClick handler), and the registry-hit
 * branch that spreads navigation props.
 */

// ---- Mocks for the three external hook dependencies ----
const mockUseNavigationState = vi.fn();
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => mockUseNavigationState(),
}));

const mockGetToolNavigation = vi.fn();
vi.mock("@app/hooks/useToolNavigation", () => ({
  useToolNavigation: () => ({ getToolNavigation: mockGetToolNavigation }),
}));

const mockGetSelectedTool = vi.fn();
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({ getSelectedTool: mockGetSelectedTool }),
}));

import { useSuggestedTools } from "@app/hooks/useSuggestedTools";

// The static list inside the module, in declaration order.
const ALL_IDS: ToolId[] = ["compress", "convert", "sanitize", "split", "ocr"];

describe("useSuggestedTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no tool selected, no registry entries (forces fallback branch).
    mockUseNavigationState.mockReturnValue({ selectedTool: null });
    mockGetSelectedTool.mockReturnValue(null);
    mockGetToolNavigation.mockReturnValue({
      href: "/nav-href",
      onClick: vi.fn(),
    });
  });

  test("returns all five suggested tools when none is selected", () => {
    const { result } = renderHook(() => useSuggestedTools());

    expect(result.current).toHaveLength(5);
    expect(result.current.map((t) => t.id)).toEqual(ALL_IDS);
  });

  test("preserves static title and icon metadata for each tool", () => {
    const { result } = renderHook(() => useSuggestedTools());

    const byId = Object.fromEntries(result.current.map((t) => [t.id, t]));
    expect(byId.compress).toMatchObject({
      title: "Compress",
      icon: "compress-rounded",
    });
    expect(byId.convert).toMatchObject({
      title: "Convert",
      icon: "swap-horiz-rounded",
    });
    expect(byId.sanitize).toMatchObject({
      title: "Sanitize",
      icon: "cleaning-services-rounded",
    });
    expect(byId.split).toMatchObject({
      title: "Split",
      icon: "crop-rounded",
    });
    expect(byId.ocr).toMatchObject({
      title: "OCR",
      icon: "text-fields-rounded",
    });
  });

  test("filters out the currently selected tool", () => {
    mockUseNavigationState.mockReturnValue({ selectedTool: "convert" });

    const { result } = renderHook(() => useSuggestedTools());

    expect(result.current).toHaveLength(4);
    expect(result.current.map((t) => t.id)).not.toContain("convert");
    expect(result.current.map((t) => t.id)).toEqual([
      "compress",
      "sanitize",
      "split",
      "ocr",
    ]);
  });

  test("does not change the list when the selected tool is not in the suggested set", () => {
    mockUseNavigationState.mockReturnValue({ selectedTool: "merge" });

    const { result } = renderHook(() => useSuggestedTools());

    expect(result.current.map((t) => t.id)).toEqual(ALL_IDS);
  });

  test("uses the fallback branch when the tool is missing from the registry", () => {
    mockUseNavigationState.mockReturnValue({ selectedTool: null });
    mockGetSelectedTool.mockReturnValue(null);

    const { result } = renderHook(() => useSuggestedTools());

    // getSelectedTool consulted for each tool; getToolNavigation never reached.
    expect(mockGetSelectedTool).toHaveBeenCalledTimes(5);
    expect(mockGetToolNavigation).not.toHaveBeenCalled();

    // Fallback builds href from the id and a preventDefault onClick.
    const compress = result.current.find((t) => t.id === "compress")!;
    expect(compress.href).toBe("/compress");
    expect(typeof compress.onClick).toBe("function");

    const preventDefault = vi.fn();
    compress.onClick({ preventDefault } as unknown as React.MouseEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  test("builds id-based fallback hrefs for every tool", () => {
    const { result } = renderHook(() => useSuggestedTools());

    for (const tool of result.current) {
      expect(tool.href).toBe(`/${tool.id}`);
    }
  });

  test("uses navigation props when the tool exists in the registry", () => {
    const registryEntry = { name: "Compress", icon: null };
    mockGetSelectedTool.mockReturnValue(registryEntry);

    const navOnClick = vi.fn();
    mockGetToolNavigation.mockReturnValue({
      href: "/tools/compress",
      onClick: navOnClick,
    });

    const { result } = renderHook(() => useSuggestedTools());

    // getToolNavigation called once per tool with the id and its registry entry.
    expect(mockGetToolNavigation).toHaveBeenCalledTimes(5);
    expect(mockGetToolNavigation).toHaveBeenCalledWith(
      "compress",
      registryEntry,
    );

    const compress = result.current.find((t) => t.id === "compress")!;
    expect(compress.href).toBe("/tools/compress");
    expect(compress.onClick).toBe(navOnClick);
    // Static metadata still present (spread happened before navProps).
    expect(compress.title).toBe("Compress");
    expect(compress.icon).toBe("compress-rounded");
  });

  test("mixes fallback and registry branches per tool", () => {
    // Only "split" is in the registry; the rest hit the fallback path.
    mockGetSelectedTool.mockImplementation((id: ToolId | null) =>
      id === "split" ? { name: "Split", icon: null } : null,
    );
    mockGetToolNavigation.mockReturnValue({
      href: "/tools/split",
      onClick: vi.fn(),
    });

    const { result } = renderHook(() => useSuggestedTools());

    const split = result.current.find((t) => t.id === "split")!;
    const compress = result.current.find((t) => t.id === "compress")!;

    expect(split.href).toBe("/tools/split");
    expect(compress.href).toBe("/compress");
    expect(mockGetToolNavigation).toHaveBeenCalledTimes(1);
    expect(mockGetToolNavigation).toHaveBeenCalledWith(
      "split",
      expect.anything(),
    );
  });

  test("memoizes the result across re-renders with identical inputs", () => {
    const { result, rerender } = renderHook(() => useSuggestedTools());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
