/**
 * File action icons for desktop builds.
 * Overrides the core implementation with desktop-appropriate icons.
 * The presence of `saveAsIconName` signals the WorkbenchBar to show the Save As button.
 *
 * All icon fields are bare material-symbols name strings, rendered by
 * consumers via the shared LocalIcon component.
 */
export function useFileActionIcons() {
  return {
    upload: "folder-open-rounded" as string,
    download: "save-rounded" as string,
    uploadIconName: "folder-rounded" as const,
    downloadIconName: "save-rounded" as const,
    // Returning this icon name causes WorkbenchBar to render the Save As button.
    // On desktop, downloadFile() without a localPath shows a native save dialog.
    saveAsIconName: "save-as-rounded" as string | undefined,
  };
}
