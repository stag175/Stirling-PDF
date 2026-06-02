import { describe, expect, it } from "vitest";

import {
  createStirlingFile,
  extractFileIds,
  extractFiles,
  getFormFillFileId,
  isFileObject,
} from "@app/types/fileContext";

describe("getFormFillFileId", () => {
  it("returns null for null/undefined", () => {
    expect(getFormFillFileId(null)).toBeNull();
    expect(getFormFillFileId(undefined)).toBeNull();
  });

  it("keys a StirlingFile by its stirling fileId", () => {
    const sf = createStirlingFile(new File(["a"], "a.pdf"));
    expect(getFormFillFileId(sf)).toBe(`stirling-${sf.fileId}`);
  });

  it("keys a plain File by name/size/lastModified", () => {
    const file = new File(["abc"], "doc.pdf", { lastModified: 12345 });
    expect(getFormFillFileId(file)).toBe("file-doc.pdf-3-12345");
  });

  it("keys a non-File Blob by its size (defaulting to 0)", () => {
    expect(getFormFillFileId(new Blob(["xy"]))).toBe("blob-2");
    expect(getFormFillFileId(new Blob([]))).toBe("blob-0");
  });
});

describe("extractFileIds / extractFiles", () => {
  it("extractFileIds returns each file's fileId in order", () => {
    const a = createStirlingFile(new File(["a"], "a.pdf"));
    const b = createStirlingFile(new File(["b"], "b.pdf"));
    expect(extractFileIds([a, b])).toEqual([a.fileId, b.fileId]);
  });

  it("extractFiles returns the same array (identity cast to File[])", () => {
    const files = [createStirlingFile(new File(["a"], "a.pdf"))];
    expect(extractFiles(files)).toBe(files);
  });
});

describe("isFileObject", () => {
  it("is true for real File and StirlingFile objects", () => {
    expect(isFileObject(new File(["a"], "a.pdf"))).toBe(true);
    expect(isFileObject(createStirlingFile(new File(["a"], "a.pdf")))).toBe(true);
  });

  it("is true for a structurally file-like object", () => {
    const fileLike = {
      name: "x",
      size: 1,
      type: "text/plain",
      lastModified: 0,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    };
    expect(isFileObject(fileLike)).toBe(true);
  });

  it("is false when a required member is missing or wrong type", () => {
    expect(
      isFileObject({ name: "x", size: 1, type: "text/plain", lastModified: 0 }),
    ).toBe(false); // no arrayBuffer
    expect(
      isFileObject({ name: "x", size: "1", type: "t", lastModified: 0, arrayBuffer: () => {} }),
    ).toBe(false); // size is a string
  });

  it("is false for null and non-object primitives", () => {
    expect(isFileObject(null)).toBe(false);
    expect(isFileObject("a-file")).toBe(false);
    expect(isFileObject(123)).toBe(false);
    expect(isFileObject({})).toBe(false);
  });
});
