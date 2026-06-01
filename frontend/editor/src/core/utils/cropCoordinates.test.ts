import { describe, it, expect } from "vitest";
import {
  type PDFBounds,
  type Rectangle,
  isRectangle,
  calculatePDFBounds,
  domToPDFCoordinates,
  pdfToDOMCoordinates,
  constrainCropAreaToPDF,
  constrainDOMRectToThumbnail,
  isPointInThumbnail,
  createFullPDFCropArea,
  roundCropArea,
} from "@app/utils/cropCoordinates";

// A landscape container around a portrait-ish PDF so scaleY is the limiting
// factor and the thumbnail is centered horizontally with offsetX > 0.
const buildBounds = (overrides: Partial<PDFBounds> = {}): PDFBounds => ({
  actualWidth: 200,
  actualHeight: 100,
  thumbnailWidth: 200,
  thumbnailHeight: 100,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  ...overrides,
});

describe("isRectangle", () => {
  it("1) accepts a well-formed rectangle", () => {
    expect(isRectangle({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
  });

  it("2) accepts zero width/height", () => {
    expect(isRectangle({ x: 0, y: 0, width: 0, height: 0 })).toBe(true);
  });

  it("3) accepts negative x/y but requires non-negative size", () => {
    expect(isRectangle({ x: -5, y: -10, width: 1, height: 1 })).toBe(true);
  });

  it("4) rejects null and non-objects", () => {
    expect(isRectangle(null)).toBe(false);
    expect(isRectangle(undefined)).toBe(false);
    expect(isRectangle(42)).toBe(false);
    expect(isRectangle("rect")).toBe(false);
  });

  it("5) rejects missing fields", () => {
    expect(isRectangle({ x: 1, y: 2, width: 3 })).toBe(false);
  });

  it("6) rejects non-finite numbers", () => {
    expect(isRectangle({ x: NaN, y: 0, width: 1, height: 1 })).toBe(false);
    expect(isRectangle({ x: 0, y: 0, width: Infinity, height: 1 })).toBe(false);
  });

  it("7) rejects negative width or height", () => {
    expect(isRectangle({ x: 0, y: 0, width: -1, height: 1 })).toBe(false);
    expect(isRectangle({ x: 0, y: 0, width: 1, height: -1 })).toBe(false);
  });

  it("8) rejects fields of the wrong type", () => {
    expect(isRectangle({ x: "1", y: 2, width: 3, height: 4 })).toBe(false);
  });
});

describe("calculatePDFBounds", () => {
  it("9) scales by the limiting dimension (height-limited) and centers", () => {
    // PDF 200x100, container 1000x100 => scaleX=5, scaleY=1 => scale=1
    const b = calculatePDFBounds(200, 100, 1000, 100);
    expect(b.scale).toBe(1);
    expect(b.thumbnailWidth).toBe(200);
    expect(b.thumbnailHeight).toBe(100);
    expect(b.offsetX).toBe((1000 - 200) / 2);
    expect(b.offsetY).toBe(0);
    expect(b.actualWidth).toBe(200);
    expect(b.actualHeight).toBe(100);
  });

  it("10) scales by the limiting dimension (width-limited)", () => {
    // PDF 200x100, container 100x1000 => scaleX=0.5, scaleY=10 => scale=0.5
    const b = calculatePDFBounds(200, 100, 100, 1000);
    expect(b.scale).toBe(0.5);
    expect(b.thumbnailWidth).toBe(100);
    expect(b.thumbnailHeight).toBe(50);
    expect(b.offsetX).toBe(0);
    expect(b.offsetY).toBe((1000 - 50) / 2);
  });

  it("11) handles equal scale factors with no offset", () => {
    const b = calculatePDFBounds(200, 100, 200, 100);
    expect(b.scale).toBe(1);
    expect(b.offsetX).toBe(0);
    expect(b.offsetY).toBe(0);
  });
});

describe("domToPDFCoordinates / pdfToDOMCoordinates", () => {
  it("12) converts DOM rect to PDF coordinates flipping the Y-axis", () => {
    const bounds = buildBounds({ scale: 2, offsetX: 10, offsetY: 20 });
    // actualWidth=200, actualHeight=100, scale=2
    const dom: Rectangle = { x: 30, y: 40, width: 20, height: 10 };
    const pdf = domToPDFCoordinates(dom, bounds);
    // thumbX = 30-10 = 20 -> pdfX = 20/2 = 10
    // thumbY = 40-20 = 20 -> pdfY = 100 - (20+10)/2 = 100 - 15 = 85
    expect(pdf).toEqual({ x: 10, y: 85, width: 10, height: 5 });
  });

  it("13) pdfToDOM is the inverse of domToPDF (round-trip)", () => {
    const bounds = buildBounds({ scale: 2, offsetX: 10, offsetY: 20 });
    const dom: Rectangle = { x: 30, y: 40, width: 20, height: 10 };
    const back = pdfToDOMCoordinates(domToPDFCoordinates(dom, bounds), bounds);
    expect(back.x).toBeCloseTo(dom.x, 10);
    expect(back.y).toBeCloseTo(dom.y, 10);
    expect(back.width).toBeCloseTo(dom.width, 10);
    expect(back.height).toBeCloseTo(dom.height, 10);
  });

  it("14) pdfToDOMCoordinates applies scale, Y-flip, and offsets", () => {
    const bounds = buildBounds({ scale: 2, offsetX: 10, offsetY: 20 });
    const crop: Rectangle = { x: 10, y: 85, width: 5, height: 5 };
    const dom = pdfToDOMCoordinates(crop, bounds);
    // thumbX = 10*2 = 20 -> +offsetX 10 = 30
    // thumbY = (100 - 85 - 5)*2 = 20 -> +offsetY 20 = 40
    expect(dom).toEqual({ x: 30, y: 40, width: 10, height: 10 });
  });

  it("15) identity-ish conversion with scale 1 and no offset", () => {
    const bounds = buildBounds();
    const dom: Rectangle = { x: 50, y: 25, width: 40, height: 20 };
    const pdf = domToPDFCoordinates(dom, bounds);
    // pdfY = 100 - (25 + 20) = 55
    expect(pdf).toEqual({ x: 50, y: 55, width: 40, height: 20 });
  });
});

describe("constrainCropAreaToPDF", () => {
  it("16) leaves an in-bounds crop area unchanged", () => {
    const bounds = buildBounds();
    const crop: Rectangle = { x: 10, y: 10, width: 50, height: 30 };
    expect(constrainCropAreaToPDF(crop, bounds)).toEqual(crop);
  });

  it("17) clamps position so the crop stays within the PDF", () => {
    const bounds = buildBounds(); // 200x100
    const crop: Rectangle = { x: 250, y: 150, width: 40, height: 20 };
    const result = constrainCropAreaToPDF(crop, bounds);
    // maxX = 200-40 = 160, maxY = 100-20 = 80
    expect(result.x).toBe(160);
    expect(result.y).toBe(80);
  });

  it("18) clamps negative positions to zero", () => {
    const bounds = buildBounds();
    const crop: Rectangle = { x: -50, y: -10, width: 30, height: 20 };
    const result = constrainCropAreaToPDF(crop, bounds);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    // width/height limited by actual - max(0, x) = 200 - 0 = 200, so unchanged
    expect(result.width).toBe(30);
    expect(result.height).toBe(20);
  });

  it("19) shrinks width/height that overflow from a positive origin", () => {
    const bounds = buildBounds(); // 200x100
    const crop: Rectangle = { x: 180, y: 90, width: 50, height: 50 };
    const result = constrainCropAreaToPDF(crop, bounds);
    // maxX = max(0, 200-50) = 150 -> x = min(180, 150) = 150
    // width = min(50, 200 - max(0,180)) = min(50, 20) = 20
    expect(result.x).toBe(150);
    expect(result.width).toBe(20);
    // maxY = max(0, 100-50) = 50 -> y = min(90, 50) = 50
    // height = min(50, 100 - max(0,90)) = min(50, 10) = 10
    expect(result.y).toBe(50);
    expect(result.height).toBe(10);
  });

  it("20) clamps position to 0 when crop is wider than the PDF", () => {
    const bounds = buildBounds(); // 200x100
    const crop: Rectangle = { x: 10, y: 10, width: 300, height: 200 };
    const result = constrainCropAreaToPDF(crop, bounds);
    // maxX = max(0, 200-300) = 0 -> x = min(10, 0) = 0
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    // width = min(300, 200 - max(0,10)) = 190
    expect(result.width).toBe(190);
    expect(result.height).toBe(90);
  });
});

describe("constrainDOMRectToThumbnail", () => {
  const bounds = buildBounds({
    thumbnailWidth: 200,
    thumbnailHeight: 100,
    offsetX: 50,
    offsetY: 30,
  });
  // thumbnail spans x:[50,250], y:[30,130]

  it("21) leaves an in-bounds DOM rect unchanged", () => {
    const rect: Rectangle = { x: 60, y: 40, width: 50, height: 20 };
    expect(constrainDOMRectToThumbnail(rect, bounds)).toEqual(rect);
  });

  it("22) pushes a rect that overshoots the right/bottom edge back inside", () => {
    const rect: Rectangle = { x: 300, y: 200, width: 40, height: 20 };
    const result = constrainDOMRectToThumbnail(rect, bounds);
    // maxX = max(50, 250-40) = 210; maxY = max(30, 130-20) = 110
    expect(result.x).toBe(210);
    expect(result.y).toBe(110);
    // maxWidth = 250-210 = 40 -> width min(40,40)=40
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
  });

  it("23) clamps to the thumbnail's top-left corner", () => {
    const rect: Rectangle = { x: 0, y: 0, width: 30, height: 15 };
    const result = constrainDOMRectToThumbnail(rect, bounds);
    expect(result.x).toBe(50);
    expect(result.y).toBe(30);
    expect(result.width).toBe(30);
    expect(result.height).toBe(15);
  });

  it("24) shrinks a rect larger than the thumbnail to fit", () => {
    const rect: Rectangle = { x: 60, y: 40, width: 500, height: 500 };
    const result = constrainDOMRectToThumbnail(rect, bounds);
    // x stays 60 (maxX = max(50, 250-500)=50 -> min(60,50)? no: 60 vs maxX 50)
    // maxX = max(50, 250-500) = 50 -> constrainedX = max(50, min(60, 50)) = 50
    expect(result.x).toBe(50);
    expect(result.y).toBe(30);
    // maxWidth = 250 - 50 = 200; maxHeight = 130 - 30 = 100
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });
});

describe("isPointInThumbnail", () => {
  const bounds = buildBounds({
    thumbnailWidth: 200,
    thumbnailHeight: 100,
    offsetX: 50,
    offsetY: 30,
  });
  // thumbnail spans x:[50,250], y:[30,130]

  it("25) returns true for a point inside the thumbnail", () => {
    expect(isPointInThumbnail(100, 80, bounds)).toBe(true);
  });

  it("26) returns true on the inclusive boundaries", () => {
    expect(isPointInThumbnail(50, 30, bounds)).toBe(true);
    expect(isPointInThumbnail(250, 130, bounds)).toBe(true);
  });

  it("27) returns false outside the thumbnail (in the container margin)", () => {
    expect(isPointInThumbnail(10, 10, bounds)).toBe(false);
    expect(isPointInThumbnail(300, 80, bounds)).toBe(false);
    expect(isPointInThumbnail(100, 200, bounds)).toBe(false);
  });
});

describe("createFullPDFCropArea", () => {
  it("28) creates a crop area covering the full PDF at origin", () => {
    const bounds = buildBounds({ actualWidth: 612, actualHeight: 792 });
    expect(createFullPDFCropArea(bounds)).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
    });
  });
});

describe("roundCropArea", () => {
  it("29) rounds each field to 0.1 precision", () => {
    const crop: Rectangle = {
      x: 1.234,
      y: 5.678,
      width: 9.999,
      height: 0.04,
    };
    expect(roundCropArea(crop)).toEqual({
      x: 1.2,
      y: 5.7,
      width: 10,
      height: 0,
    });
  });

  it("30) leaves already-rounded values intact", () => {
    const crop: Rectangle = { x: 1.5, y: 2.5, width: 3.5, height: 4.5 };
    expect(roundCropArea(crop)).toEqual(crop);
  });

  it("31) rounds half-up at the 0.1 boundary", () => {
    // 0.05 * 10 = 0.5 -> Math.round -> 1 -> /10 = 0.1
    expect(roundCropArea({ x: 0.05, y: 0, width: 0, height: 0 }).x).toBe(0.1);
  });
});
