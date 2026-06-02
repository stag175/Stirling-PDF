import { describe, expect, it } from "vitest";

import { isImageFile } from "@app/utils/imageToPdfUtils";

const fileOfType = (type: string): File =>
  new File([new Uint8Array([0])], "f", { type });

describe("isImageFile", () => {
  it("is true for image/* MIME types", () => {
    expect(isImageFile(fileOfType("image/png"))).toBe(true);
    expect(isImageFile(fileOfType("image/jpeg"))).toBe(true);
    expect(isImageFile(fileOfType("image/svg+xml"))).toBe(true);
    expect(isImageFile(fileOfType("image/"))).toBe(true); // prefix boundary
  });

  it("is false for non-image MIME types", () => {
    expect(isImageFile(fileOfType("application/pdf"))).toBe(false);
    expect(isImageFile(fileOfType("text/plain"))).toBe(false);
    expect(isImageFile(fileOfType("video/mp4"))).toBe(false);
  });

  it("is false for an empty or missing type", () => {
    expect(isImageFile(fileOfType(""))).toBe(false);
  });

  it("requires the literal 'image/' prefix (slash required, must be a prefix)", () => {
    // NB: the File/Blob constructor lowercases the MIME type, so an uppercase input is
    // normalised to "image/png" before isImageFile sees it — case can't be exercised here.
    expect(isImageFile(fileOfType("image"))).toBe(false); // no trailing slash
    expect(isImageFile(fileOfType("x-image/png"))).toBe(false); // not a prefix
  });
});
