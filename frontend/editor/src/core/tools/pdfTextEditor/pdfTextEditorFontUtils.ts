/**
 * pdfTextEditorFontUtils — pure helpers for resolving embedded-font formats,
 * MIME types, `@font-face` format hints, CSS family names and font-cache lookup
 * keys used by the PDF text editor.
 *
 * Every function here is deterministic: input args → output, with no React,
 * DOM, window, I/O or external state. They were extracted from
 * `PdfTextEditorView.tsx` to keep that component focused and to allow direct
 * unit testing.
 */
import type { PdfJsonFont } from "@app/tools/pdfTextEditor/pdfTextEditorTypes";

/** Canonical font formats the editor knows how to load. */
export type NormalizedFontFormat = "ttf" | "otf" | "woff" | "woff2";

/**
 * Normalise an arbitrary (possibly null/undefined) font-format string from the
 * PDF JSON into one of the canonical {@link NormalizedFontFormat} values.
 *
 * Matching is case-insensitive and substring-based; `cff` is treated as `otf`.
 * Anything unrecognised (including empty/missing input) falls back to `ttf`.
 */
export const normalizeFontFormat = (format?: string | null): NormalizedFontFormat => {
  if (!format) {
    return "ttf";
  }
  const lower = format.toLowerCase();
  if (lower.includes("woff2")) {
    return "woff2";
  }
  if (lower.includes("woff")) {
    return "woff";
  }
  if (lower.includes("otf")) {
    return "otf";
  }
  if (lower.includes("cff")) {
    return "otf";
  }
  return "ttf";
};

/**
 * Map a canonical font format to the MIME type used when building a `Blob`
 * for the font data.
 */
export const getFontMimeType = (format: NormalizedFontFormat): string => {
  switch (format) {
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "otf":
      return "font/otf";
    default:
      return "font/ttf";
  }
};

/**
 * Map a canonical font format to the `format(...)` hint used in a CSS
 * `@font-face` `src` declaration, or `null` when no hint should be emitted.
 */
export const getFontFormatHint = (format: NormalizedFontFormat): string | null => {
  switch (format) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "otf":
      return "opentype";
    case "ttf":
      return "truetype";
    default:
      return null;
  }
};

/**
 * Build a deterministic, CSS-safe `font-family` name for an embedded font.
 *
 * Prefers the font's trimmed `baseName`; falls back to `uid`, then `id`, then
 * the literal `"font"`. The resulting identifier is sanitised to
 * `[a-zA-Z0-9_-]` and prefixed with `pdf-font-`.
 */
export const buildFontFamilyName = (font: PdfJsonFont): string => {
  const preferred = (font.baseName ?? "").trim();
  const identifier =
    preferred.length > 0
      ? preferred
      : (font.uid ?? font.id ?? "font").toString();
  return `pdf-font-${identifier.replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

/**
 * Convert a zero-based page index into a one-based page number, or `null` when
 * the index is missing/`NaN`.
 */
export const normalizePageNumber = (
  pageIndex: number | null | undefined,
): number | null => {
  if (
    pageIndex === null ||
    pageIndex === undefined ||
    Number.isNaN(pageIndex)
  ) {
    return null;
  }
  return pageIndex + 1;
};

/**
 * Build the ordered, de-duplicated list of cache keys used to look up a loaded
 * font family for a given font id / font / page index.
 *
 * Key order (most to least specific):
 *   1. `<pageNumber>:<fontId>` (when the page index resolves to a page number)
 *   2. `font.uid`
 *   3. `<font.pageNumber>:<font.id>`
 *   4. `fontId`
 *
 * Empty keys are dropped and duplicates removed while preserving first-seen
 * order.
 */
export const buildFontLookupKeys = (
  fontId: string,
  font: PdfJsonFont | null | undefined,
  pageIndex: number | null | undefined,
): string[] => {
  const keys: string[] = [];
  const pageNumber = normalizePageNumber(pageIndex);
  if (pageNumber !== null) {
    keys.push(`${pageNumber}:${fontId}`);
  }
  if (font?.uid) {
    keys.push(font.uid);
  }
  if (font?.pageNumber !== null && font?.pageNumber !== undefined && font?.id) {
    keys.push(`${font.pageNumber}:${font.id}`);
  }
  keys.push(fontId);
  return Array.from(new Set(keys.filter((value) => value && value.length > 0)));
};
