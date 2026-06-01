/**
 * File action icons for web builds.
 * Desktop builds override this file via TypeScript path aliases to provide
 * different icons (e.g. Save icon instead of Download, and a Save As icon).
 *
 * All icon fields are bare material-symbols name strings, rendered by
 * consumers via the shared LocalIcon component.
 */
export function useFileActionIcons() {
  return {
    upload: "upload-rounded" as string,
    download: "download-rounded" as string,
    uploadIconName: "upload" as const,
    downloadIconName: "download" as const,
    // Web builds do not expose a Save As icon — the button is hidden when this is undefined.
    // Desktop builds override this file and return a real icon name.
    saveAsIconName: undefined as string | undefined,
  };
}
