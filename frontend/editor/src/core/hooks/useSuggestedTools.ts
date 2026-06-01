import { useMemo } from "react";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useToolNavigation } from "@app/hooks/useToolNavigation";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId } from "@app/types/toolId";

export interface SuggestedTool {
  id: ToolId;
  title: string;
  /** Bare material-symbols icon name, rendered via LocalIcon at the call site. */
  icon: string;
  href: string;
  onClick: (e: React.MouseEvent) => void;
}

const ALL_SUGGESTED_TOOLS: Omit<SuggestedTool, "href" | "onClick">[] = [
  {
    id: "compress",
    title: "Compress",
    icon: "compress-rounded",
  },
  {
    id: "convert",
    title: "Convert",
    icon: "swap-horiz-rounded",
  },
  {
    id: "sanitize",
    title: "Sanitize",
    icon: "cleaning-services-rounded",
  },
  {
    id: "split",
    title: "Split",
    icon: "crop-rounded",
  },
  {
    id: "ocr",
    title: "OCR",
    icon: "text-fields-rounded",
  },
];

export function useSuggestedTools(): SuggestedTool[] {
  const { selectedTool } = useNavigationState();
  const { getToolNavigation } = useToolNavigation();
  const { getSelectedTool } = useToolWorkflow();

  return useMemo(() => {
    // Filter out the current tool
    const filteredTools = ALL_SUGGESTED_TOOLS.filter(
      (tool) => tool.id !== selectedTool,
    );

    // Add navigation props to each tool
    return filteredTools.map((tool) => {
      const toolRegistryEntry = getSelectedTool(tool.id);
      if (!toolRegistryEntry) {
        // Fallback for tools not in registry
        return {
          ...tool,
          href: `/${tool.id}`,
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
          },
        };
      }

      const navProps = getToolNavigation(tool.id, toolRegistryEntry);
      return {
        ...tool,
        ...navProps,
      };
    });
  }, [selectedTool, getToolNavigation, getSelectedTool]);
}
