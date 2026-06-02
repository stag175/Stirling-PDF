import { describe, expect, it } from "vitest";

import {
  PdfJsonDocument,
  PdfJsonImageElement,
  PdfJsonPage,
  PdfJsonTextElement,
  TextGroup,
} from "@app/tools/pdfTextEditor/pdfTextEditorTypes";
import {
  cloneImageElement,
  cloneTextElement,
  createMergedElement,
  deepCloneDocument,
  extractDocumentImages,
  extractPageImages,
  getImageBounds,
  pageDimensions,
  valueOr,
} from "@app/tools/pdfTextEditor/pdfTextEditorUtils";

const img = (e: Partial<PdfJsonImageElement>): PdfJsonImageElement =>
  e as PdfJsonImageElement;
const page = (p: Partial<PdfJsonPage>): PdfJsonPage => p as PdfJsonPage;
const txt = (e: Partial<PdfJsonTextElement>): PdfJsonTextElement =>
  e as PdfJsonTextElement;
const group = (g: Partial<TextGroup>): TextGroup => g as TextGroup;

describe("valueOr", () => {
  it("returns the value when it is a real number (including 0 and negatives)", () => {
    expect(valueOr(5)).toBe(5);
    expect(valueOr(0)).toBe(0);
    expect(valueOr(-3)).toBe(-3);
  });

  it("returns the fallback for null / undefined / NaN", () => {
    expect(valueOr(null)).toBe(0);
    expect(valueOr(undefined)).toBe(0);
    expect(valueOr(Number.NaN)).toBe(0);
    expect(valueOr(null, 7)).toBe(7);
    expect(valueOr(undefined, -1)).toBe(-1);
  });
});

describe("getImageBounds", () => {
  it("uses explicit left/right/bottom/top directly", () => {
    expect(getImageBounds(img({ left: 10, right: 50, bottom: 20, top: 60 }))).toEqual({
      left: 10,
      right: 50,
      bottom: 20,
      top: 60,
    });
  });

  it("falls back to x/y + width/height when left/right/top/bottom absent", () => {
    expect(getImageBounds(img({ x: 5, y: 8, width: 30, height: 40 }))).toEqual({
      left: 5,
      right: 35, // x + width
      bottom: 8,
      top: 48, // y + height
    });
  });

  it("derives right/top from left+width and bottom+height", () => {
    expect(
      getImageBounds(img({ left: 10, width: 25, bottom: 5, height: 15 })),
    ).toEqual({ left: 10, right: 35, bottom: 5, top: 20 });
  });

  it("derives width/height from left+right and bottom+top when size absent", () => {
    expect(
      getImageBounds(img({ left: 10, right: 40, bottom: 0, top: 30 })),
    ).toEqual({ left: 10, right: 40, bottom: 0, top: 30 });
  });

  it("defaults everything to zero for an empty element", () => {
    expect(getImageBounds(img({}))).toEqual({
      left: 0,
      right: 0,
      bottom: 0,
      top: 0,
    });
  });
});

describe("pageDimensions", () => {
  it("returns US-Letter defaults for null/undefined pages", () => {
    expect(pageDimensions(null)).toEqual({ width: 612, height: 792 });
    expect(pageDimensions(undefined)).toEqual({ width: 612, height: 792 });
  });

  it("uses the page's explicit dimensions when present", () => {
    expect(pageDimensions(page({ width: 300, height: 400 }))).toEqual({
      width: 300,
      height: 400,
    });
  });

  it("falls back to defaults for null dimension fields", () => {
    expect(pageDimensions(page({ width: null, height: null }))).toEqual({
      width: 612,
      height: 792,
    });
  });
});

describe("cloneTextElement", () => {
  it("copies textMatrix into an independent array", () => {
    const original = txt({ text: "hello", textMatrix: [1, 2, 3, 4, 5, 6] });
    const clone = cloneTextElement(original);
    expect(clone).toEqual(original);
    expect(clone.textMatrix).not.toBe(original.textMatrix); // distinct array
    clone.textMatrix![0] = 99;
    expect(original.textMatrix![0]).toBe(1); // mutation isolated
  });

  it("normalizes a null/undefined textMatrix to undefined", () => {
    expect(cloneTextElement(txt({ text: "x", textMatrix: null })).textMatrix).toBeUndefined();
    expect(cloneTextElement(txt({ text: "x" })).textMatrix).toBeUndefined();
  });
});

describe("cloneImageElement", () => {
  it("copies transform into an independent array", () => {
    const original = img({ transform: [1, 0, 0, 1, 10, 20] });
    const clone = cloneImageElement(original);
    expect(clone).toEqual(original);
    expect(clone.transform).not.toBe(original.transform);
    clone.transform![4] = 999;
    expect(original.transform![4]).toBe(10);
  });

  it("normalizes a null/undefined transform to undefined", () => {
    expect(cloneImageElement(img({ transform: null })).transform).toBeUndefined();
    expect(cloneImageElement(img({})).transform).toBeUndefined();
  });
});

describe("deepCloneDocument", () => {
  it("produces a deep copy whose nested mutations do not affect the original", () => {
    const original = {
      pages: [{ width: 100, height: 200, textElements: [{ text: "a" }] }],
    } as unknown as PdfJsonDocument;
    const clone = deepCloneDocument(original);
    expect(clone).toEqual(original);
    expect(clone.pages).not.toBe(original.pages);

    // mutate deeply nested data in the clone
    (clone.pages as unknown as { width: number }[])[0].width = 555;
    expect(
      (original.pages as unknown as { width: number }[])[0].width,
    ).toBe(100);
  });
});

describe("extractPageImages", () => {
  it("returns an empty array for a null/undefined page", () => {
    expect(extractPageImages(null, 0)).toEqual([]);
    expect(extractPageImages(undefined, 3)).toEqual([]);
  });

  it("preserves an existing image id", () => {
    const result = extractPageImages(
      page({ imageElements: [img({ id: "keep-me", transform: [1, 0, 0, 1, 0, 0] })] }),
      0,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keep-me");
  });

  it("assigns a deterministic id when missing or blank", () => {
    const result = extractPageImages(
      page({ imageElements: [img({}), img({ id: "   " })] }),
      2,
    );
    expect(result[0].id).toBe("page-2-image-0");
    expect(result[1].id).toBe("page-2-image-1");
  });

  it("returns clones (mutating the result does not affect the source)", () => {
    const source = img({ id: "x", transform: [1, 0, 0, 1, 5, 5] });
    const result = extractPageImages(page({ imageElements: [source] }), 0);
    result[0].transform![4] = 999;
    expect(source.transform![4]).toBe(5);
  });
});

describe("extractDocumentImages", () => {
  it("returns an empty array for a null/undefined document", () => {
    expect(extractDocumentImages(null)).toEqual([]);
    expect(extractDocumentImages(undefined)).toEqual([]);
  });

  it("maps each page to its images with per-page deterministic ids", () => {
    const doc = {
      pages: [
        { imageElements: [img({ id: "a" }), img({})] },
        { imageElements: [] },
      ],
    } as unknown as PdfJsonDocument;
    const result = extractDocumentImages(doc);
    expect(result).toHaveLength(2);
    expect(result[0].map((i) => i.id)).toEqual(["a", "page-0-image-1"]);
    expect(result[1]).toEqual([]);
  });
});

describe("createMergedElement", () => {
  it("uses the first original element as the template and sets the merged text", () => {
    const reference = txt({ text: "original", textMatrix: [1, 2, 3, 4, 5, 6] });
    const merged = createMergedElement(
      group({ originalElements: [reference], text: "merged text" }),
    );
    expect(merged.text).toBe("merged text");
    expect(merged).not.toBe(reference); // it's a clone
    expect(reference.text).toBe("original"); // source untouched
  });

  it("strips newlines from the merged text", () => {
    const merged = createMergedElement(
      group({
        originalElements: [txt({ text: "x" })],
        text: "line1\nline2\r\nline3",
      }),
    );
    expect(merged.text).toBe("line1line2line3");
  });

  it("copies a 6-element textMatrix into an independent array", () => {
    const reference = txt({ text: "x", textMatrix: [1, 0, 0, 1, 10, 20] });
    const merged = createMergedElement(
      group({ originalElements: [reference], text: "y" }),
    );
    expect(merged.textMatrix).toEqual([1, 0, 0, 1, 10, 20]);
    merged.textMatrix![4] = 999;
    expect(reference.textMatrix![4]).toBe(10); // mutation isolated
  });

  it("clears glyph hints (charCodes) on the merged element", () => {
    const merged = createMergedElement(
      group({
        originalElements: [txt({ text: "x", charCodes: [10, 20, 30] })],
        text: "y",
      }),
    );
    expect(merged.charCodes).toBeUndefined();
  });

  it("treats empty group text as empty string", () => {
    const merged = createMergedElement(
      group({ originalElements: [txt({ text: "x" })], text: "" }),
    );
    expect(merged.text).toBe("");
  });
});
