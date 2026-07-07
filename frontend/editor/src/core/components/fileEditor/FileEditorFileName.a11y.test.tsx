import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import FileEditorFileName from "@app/components/fileEditor/FileEditorFileName";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage from
 * the shared/ components to a fileEditor presentational component rendered under
 * MantineProvider.
 */
describe("FileEditorFileName accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const file: StirlingFileStub = {
      id: "file-1" as FileId,
      name: "report.pdf",
      type: "application/pdf",
      size: 1024,
      lastModified: 0,
      isLeaf: true,
      originalFileId: "file-1",
      versionNumber: 1,
    };

    const { container } = render(
      <MantineProvider>
        <FileEditorFileName file={file} />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
