import type { NonPdfFileType } from "@app/utils/fileUtils";

export interface FileTypeMeta {
  label: string;
  /** Bare material-symbols icon name, rendered via LocalIcon at the call site. */
  icon: string;
  color: string; // Mantine color name (e.g. 'teal', 'violet')
  accentColor: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}

// Shared neutral color scheme for all file type badges — consistent in light & dark mode
const BADGE_COLORS = {
  color: "gray" as const,
  accentColor: "var(--mantine-color-gray-6)",
  borderColor: "var(--mantine-color-gray-3)",
  bgColor: "var(--mantine-color-gray-0)",
  textColor: "var(--mantine-color-gray-9)",
};

export function getFileTypeMeta(
  type: NonPdfFileType,
  fileName?: string,
): FileTypeMeta {
  switch (type) {
    case "image":
      return {
        label: "Image",
        icon: "image-rounded",
        ...BADGE_COLORS,
      };
    case "csv":
      return {
        label: "Spreadsheet",
        icon: "table-chart",
        ...BADGE_COLORS,
      };
    case "json":
      return {
        label: "JSON",
        icon: "data-object-rounded",
        ...BADGE_COLORS,
      };
    case "markdown":
      return {
        label: "Markdown",
        icon: "code-rounded",
        ...BADGE_COLORS,
      };
    case "html":
      return {
        label: "HTML",
        icon: "html-rounded",
        ...BADGE_COLORS,
      };
    case "text":
      return {
        label: "Text",
        icon: "article-rounded",
        ...BADGE_COLORS,
      };
    default: {
      // For unknown types, derive label from the file extension (e.g. ".docx" → "DOCX")
      const ext = fileName?.split(".").pop()?.toUpperCase();
      const label = ext || "File";
      return {
        label,
        icon: "article-rounded",
        ...BADGE_COLORS,
      };
    }
  }
}
