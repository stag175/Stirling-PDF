import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutomationForm } from "@app/hooks/tools/automate/useAutomationForm";
import { AutomationConfig, AutomationMode } from "@app/types/automation";
import { AUTOMATION_CONSTANTS } from "@app/constants/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

// Deterministic translation mock: echoes the fallback when one is given so we
// can assert on it, otherwise returns the key.
const mockT = vi.fn((key: string, fallback?: string) => fallback ?? key);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Minimal stub registry — only the fields useAutomationForm reads:
//   - name                          (getToolName)
//   - operationConfig.defaultParameters (getToolDefaultParameters)
//   - automationSettings            (configured/auto-configured branch)
const registry = {
  // Has a name AND default parameters AND a settings component => needs config.
  merge: {
    name: "Merge PDFs",
    automationSettings: () => null,
    operationConfig: {
      defaultParameters: { generateToc: false, sortType: "byName" },
    },
  },
  // Has a name, NO settings component => auto-configured. No defaultParameters.
  compress: {
    name: "Compress",
    automationSettings: null,
    operationConfig: {},
  },
  // No name at all => getToolName falls back to translation. Settings present.
  ocr: {
    automationSettings: () => null,
    operationConfig: { defaultParameters: { language: "eng" } },
  },
} as unknown as Partial<ToolRegistry>;

const FIXED_NOW = 1_700_000_000_000;

beforeEach(() => {
  mockT.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const renderForm = (
  mode: AutomationMode,
  existingAutomation?: AutomationConfig,
  reg: Partial<ToolRegistry> = registry,
) =>
  renderHook(() =>
    useAutomationForm({ mode, existingAutomation, toolRegistry: reg }),
  );

describe("useAutomationForm", () => {
  describe("CREATE mode initialization", () => {
    test("seeds DEFAULT_TOOL_COUNT empty tool slots with default state", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      expect(result.current.selectedTools).toHaveLength(
        AUTOMATION_CONSTANTS.DEFAULT_TOOL_COUNT,
      );
      for (const tool of result.current.selectedTools) {
        expect(tool.operation).toBe("");
        expect(tool.configured).toBe(false);
        expect(tool.parameters).toEqual({});
        // Fallback string from the translation mock.
        expect(tool.name).toBe("Select a tool...");
      }
      // Default form scalars.
      expect(result.current.automationName).toBe("");
      expect(result.current.automationDescription).toBe("");
      expect(result.current.automationIcon).toBe("SettingsIcon");
    });

    test("does not re-seed once tools already exist", () => {
      const { result, rerender } = renderForm(AutomationMode.CREATE);

      act(() => {
        result.current.addTool("compress");
      });
      const lengthAfterAdd = result.current.selectedTools.length;

      rerender();

      expect(result.current.selectedTools).toHaveLength(lengthAfterAdd);
    });
  });

  describe("getToolName", () => {
    test("returns the registry name when present", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.getToolName("merge")).toBe("Merge PDFs");
    });

    test("falls back to translation when the tool has no name", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      // ocr entry has no name; mock returns the fallback (the operation key).
      expect(result.current.getToolName("ocr")).toBe("ocr");
    });

    test("falls back to translation for an unknown operation", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.getToolName("doesNotExist")).toBe("doesNotExist");
    });
  });

  describe("getToolDefaultParameters", () => {
    test("clones defaultParameters when present", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      const params = result.current.getToolDefaultParameters("merge");
      expect(params).toEqual({ generateToc: false, sortType: "byName" });
      // Must be a fresh clone, not the registry's own object.
      expect(params).not.toBe(
        (registry.merge as any).operationConfig.defaultParameters,
      );
    });

    test("returns empty object when operationConfig has no defaultParameters", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.getToolDefaultParameters("compress")).toEqual({});
    });

    test("returns empty object for an unknown operation", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.getToolDefaultParameters("nope")).toEqual({});
    });
  });

  describe("addTool", () => {
    test("auto-configures a tool that has no settings component", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      const before = result.current.selectedTools.length;

      act(() => {
        result.current.addTool("compress");
      });

      expect(result.current.selectedTools).toHaveLength(before + 1);
      const added = result.current.selectedTools[before];
      expect(added.operation).toBe("compress");
      expect(added.name).toBe("Compress");
      expect(added.configured).toBe(true);
      expect(added.parameters).toEqual({});
      expect(added.id).toBe(`compress-${FIXED_NOW}`);
    });

    test("marks a tool with a settings component as not configured and seeds params", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      act(() => {
        result.current.addTool("merge");
      });

      const added = result.current.selectedTools.at(-1)!;
      expect(added.operation).toBe("merge");
      expect(added.configured).toBe(false);
      expect(added.parameters).toEqual({
        generateToc: false,
        sortType: "byName",
      });
    });
  });

  describe("removeTool", () => {
    test("removes a tool once count exceeds MIN_TOOL_COUNT", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      // Start at DEFAULT_TOOL_COUNT (== MIN). Add one so removal is allowed.
      act(() => {
        result.current.addTool("compress");
      });
      const lenBefore = result.current.selectedTools.length;
      expect(lenBefore).toBeGreaterThan(AUTOMATION_CONSTANTS.MIN_TOOL_COUNT);

      act(() => {
        result.current.removeTool(0);
      });

      expect(result.current.selectedTools).toHaveLength(lenBefore - 1);
    });

    test("is a no-op when at or below MIN_TOOL_COUNT", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      // Fresh CREATE form has exactly MIN_TOOL_COUNT tools.
      const lenBefore = result.current.selectedTools.length;
      expect(lenBefore).toBe(AUTOMATION_CONSTANTS.MIN_TOOL_COUNT);

      act(() => {
        result.current.removeTool(0);
      });

      expect(result.current.selectedTools).toHaveLength(lenBefore);
    });
  });

  describe("updateTool", () => {
    test("merges partial updates into the tool at the given index", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      act(() => {
        result.current.updateTool(0, {
          operation: "merge",
          name: "Merge PDFs",
          configured: true,
        });
      });

      const tool = result.current.selectedTools[0];
      expect(tool.operation).toBe("merge");
      expect(tool.name).toBe("Merge PDFs");
      expect(tool.configured).toBe(true);
      // Untouched siblings remain unchanged.
      expect(result.current.selectedTools[1].operation).toBe("");
    });
  });

  describe("setters", () => {
    test("updates name, description and icon", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      act(() => {
        result.current.setAutomationName("My flow");
        result.current.setAutomationDescription("does things");
        result.current.setAutomationIcon("CompressIcon");
      });

      expect(result.current.automationName).toBe("My flow");
      expect(result.current.automationDescription).toBe("does things");
      expect(result.current.automationIcon).toBe("CompressIcon");
    });

    test("setSelectedTools replaces the whole list", () => {
      const { result } = renderForm(AutomationMode.CREATE);

      act(() => {
        result.current.setSelectedTools([
          {
            id: "x",
            operation: "merge",
            name: "Merge PDFs",
            configured: true,
            parameters: {},
          },
        ]);
      });

      expect(result.current.selectedTools).toHaveLength(1);
      expect(result.current.selectedTools[0].id).toBe("x");
    });
  });

  describe("hasUnsavedChanges", () => {
    test("false for an untouched CREATE form", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.hasUnsavedChanges()).toBe(false);
    });

    test("true once a name is entered", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.setAutomationName("Something");
      });
      expect(result.current.hasUnsavedChanges()).toBe(true);
    });

    test("ignores whitespace-only names", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.setAutomationName("   ");
      });
      expect(result.current.hasUnsavedChanges()).toBe(false);
    });

    test("true once a tool has an operation selected", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.updateTool(0, { operation: "merge" });
      });
      expect(result.current.hasUnsavedChanges()).toBe(true);
    });

    test("true once a tool is marked configured even without an operation", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.updateTool(0, { configured: true });
      });
      expect(result.current.hasUnsavedChanges()).toBe(true);
    });
  });

  describe("canSaveAutomation", () => {
    test("false for an untouched CREATE form (empty operations)", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      expect(result.current.canSaveAutomation()).toBe(false);
    });

    test("false when name is set but tools are not fully configured", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.setAutomationName("Flow");
        result.current.updateTool(0, {
          operation: "merge",
          configured: false,
        });
      });
      expect(result.current.canSaveAutomation()).toBe(false);
    });

    test("true when name set and every tool is configured with an operation", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.setAutomationName("Flow");
      });
      // Each updateTool reads the latest selectedTools from its render closure,
      // so consecutive edits to different indices must run in separate commits.
      act(() => {
        result.current.updateTool(0, {
          operation: "merge",
          configured: true,
        });
      });
      act(() => {
        result.current.updateTool(1, {
          operation: "compress",
          configured: true,
        });
      });
      expect(result.current.canSaveAutomation()).toBe(true);
    });

    test("false when there are zero tools", () => {
      const { result } = renderForm(AutomationMode.CREATE);
      act(() => {
        result.current.setAutomationName("Flow");
        result.current.setSelectedTools([]);
      });
      expect(result.current.canSaveAutomation()).toBe(false);
    });
  });

  describe("EDIT mode initialization", () => {
    const editAutomation: AutomationConfig = {
      id: "auto-1",
      name: "Edit Me",
      description: "an existing flow",
      icon: "CustomIcon",
      operations: [
        { operation: "merge", parameters: { generateToc: true } },
        { operation: "compress", parameters: {} },
      ],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
    };

    test("hydrates scalar fields and merges default + saved parameters", () => {
      const { result } = renderForm(AutomationMode.EDIT, editAutomation);

      expect(result.current.automationName).toBe("Edit Me");
      expect(result.current.automationDescription).toBe("an existing flow");
      expect(result.current.automationIcon).toBe("CustomIcon");
      expect(result.current.selectedTools).toHaveLength(2);

      const [first, second] = result.current.selectedTools;
      // Saved parameter overrides the registry default (generateToc).
      expect(first.operation).toBe("merge");
      expect(first.parameters).toEqual({
        generateToc: true,
        sortType: "byName",
      });
      // EDIT mode marks every tool configured regardless of settings component.
      expect(first.configured).toBe(true);
      expect(second.configured).toBe(true);
      expect(second.operation).toBe("compress");
    });

    test("falls back to SettingsIcon and empty strings for missing fields", () => {
      const sparse: AutomationConfig = {
        id: "auto-2",
        name: "",
        operations: [],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      };
      const { result } = renderForm(AutomationMode.EDIT, sparse);

      expect(result.current.automationName).toBe("");
      expect(result.current.automationDescription).toBe("");
      expect(result.current.automationIcon).toBe("SettingsIcon");
      expect(result.current.selectedTools).toHaveLength(0);
    });
  });

  describe("SUGGESTED mode initialization", () => {
    test("auto-configures tools without a settings component, leaves others unconfigured", () => {
      const suggested: AutomationConfig = {
        id: "sug-1",
        name: "Suggested",
        operations: [
          { operation: "merge", parameters: {} }, // has settings => unconfigured
          { operation: "compress", parameters: {} }, // no settings => configured
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      };
      const { result } = renderForm(AutomationMode.SUGGESTED, suggested);

      const [merge, compress] = result.current.selectedTools;
      expect(merge.configured).toBe(false);
      expect(compress.configured).toBe(true);
    });

    test("handles operations given as plain strings", () => {
      const suggested = {
        id: "sug-2",
        name: "String ops",
        operations: [
          "merge",
          "compress",
        ] as unknown as AutomationConfig["operations"],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      } as AutomationConfig;

      const { result } = renderForm(AutomationMode.SUGGESTED, suggested);

      expect(result.current.selectedTools).toHaveLength(2);
      const [merge, compress] = result.current.selectedTools;
      expect(merge.operation).toBe("merge");
      // String op => parameters come purely from registry defaults.
      expect(merge.parameters).toEqual({
        generateToc: false,
        sortType: "byName",
      });
      expect(compress.operation).toBe("compress");
      expect(compress.parameters).toEqual({});
    });

    test("treats missing operations array as empty", () => {
      const suggested = {
        id: "sug-3",
        name: "No ops",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      } as unknown as AutomationConfig;

      const { result } = renderForm(AutomationMode.SUGGESTED, suggested);
      expect(result.current.selectedTools).toHaveLength(0);
    });
  });
});
