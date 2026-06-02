import { describe, expect, it } from "vitest";

import { getDocumentFileDialogFilter } from "@app/utils/fileDialogUtils";

describe("getDocumentFileDialogFilter", () => {
  it("returns a single 'Documents' filter group", () => {
    const filters = getDocumentFileDialogFilter();
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe("Documents");
  });

  it("accepts the expected document/image/archive extensions", () => {
    const { extensions } = getDocumentFileDialogFilter()[0];
    expect(extensions).toEqual([
      "pdf",
      "jpg",
      "jpeg",
      "png",
      "gif",
      "tiff",
      "bmp",
      "html",
      "zip",
    ]);
  });

  it("includes the primary pdf type and has no duplicate extensions", () => {
    const { extensions } = getDocumentFileDialogFilter()[0];
    expect(extensions).toContain("pdf");
    expect(new Set(extensions).size).toBe(extensions.length);
  });
});
