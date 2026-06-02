import { describe, expect, it } from "vitest";

import {
  PdfJsonDocument,
  PdfJsonImageElement,
  PdfJsonPage,
  PdfJsonTextElement,
} from "@app/tools/pdfTextEditor/pdfTextEditorTypes";
import {
  cloneImageElement,
  cloneTextElement,
  deepCloneDocument,
  getImageBounds,
  pageDimensions,
  valueOr,
} from "@app/tools/pdfTextEditor/pdfTextEditorUtils";

const img = (e: Partial<PdfJsonImageElement>): PdfJsonImageElement =>
  e as PdfJsonImageElement;
const page = (p: Partial<PdfJsonPage>): PdfJsonPage => p as PdfJsonPage;
const txt = (e: Partial<PdfJsonTextElement>): PdfJsonTextElement =>
  e as PdfJsonTextElement;

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
