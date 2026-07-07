/**
 * Pure helpers backing the read-aloud feature in {@link useViewerReadAloud}.
 *
 * Every function here is deterministic: given the same inputs it returns the
 * same output, with no DOM access, no `window` / speech-synthesis I/O, no
 * network, and no mutation of its arguments. The hook supplies the impure
 * inputs (a snapshot of available voices, parsed PDF text items, etc.) and
 * consumes the results.
 */

/**
 * Minimal positional shape of a PDF.js text item plus the page viewport
 * transform captured at parse time. Only the fields the read-aloud ordering /
 * merging logic depends on are modelled.
 *
 * `transform` is the standard PDF.js `[a, b, c, d, e, f]` matrix where index 4
 * is the x translation and index 5 is the y translation.
 */
export interface ReadAloudTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  viewportTransform: number[];
}

/** Items on lines whose y differs by less than this are treated as co-linear. */
const SAME_LINE_Y_THRESHOLD = 5;

/**
 * Horizontal gap (px) under which two adjacent same-line items are merged into
 * one. Fixes PDFs that emit individual characters / syllables as separate text
 * items, which would otherwise be spoken (and counted for highlighting) as
 * separate words.
 */
const CHAR_MERGE_THRESHOLD = 5;

/**
 * Pick the best speech-synthesis voice for a BCP-47 language code from a
 * supplied list of voices.
 *
 * Resolution order:
 *   1. Exact `lang` match (e.g. "es-ES").
 *   2. Same base language (e.g. any "es-*" for a requested "es-ES").
 *   3. Any English voice as a fallback.
 *   4. The first available voice.
 *
 * Returns `null` only when the list is empty.
 */
export function pickVoiceForLanguage(
  voices: readonly SpeechSynthesisVoice[],
  languageCode: string,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const exactMatch = voices.find((v) => v.lang === languageCode);
  if (exactMatch) return exactMatch;

  const baseLang = languageCode.split("-")[0];
  const baseMatch = voices.find((v) => v.lang.startsWith(baseLang));
  if (baseMatch) return baseMatch;

  const englishMatch = voices.find((v) => v.lang.startsWith("en"));
  if (englishMatch) return englishMatch;

  return voices[0] ?? null;
}

/**
 * Derive the set of language codes that are speakable given the available
 * voices. Each voice contributes both its full `lang` (e.g. "fr-CA") and its
 * base language (e.g. "fr"). English ("en", "en-GB", "en-US") is always
 * included because the speech engine falls back to it.
 */
export function collectSupportedLanguageCodes(
  voices: readonly SpeechSynthesisVoice[],
): Set<string> {
  const supportedCodes = new Set<string>();

  for (const voice of voices) {
    supportedCodes.add(voice.lang);
    supportedCodes.add(voice.lang.split("-")[0]);
  }

  supportedCodes.add("en");
  supportedCodes.add("en-GB");
  supportedCodes.add("en-US");

  return supportedCodes;
}

/**
 * Return a new array of text items ordered for natural reading: top-to-bottom
 * (descending PDF y), then left-to-right (ascending x) within a line. Items
 * whose y differs by at most {@link SAME_LINE_Y_THRESHOLD} are considered the
 * same line. The input array is not mutated.
 */
export function sortTextItemsByReadingOrder<T extends ReadAloudTextItem>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const yA = a.transform[5] ?? 0;
    const yB = b.transform[5] ?? 0;
    const xA = a.transform[4] ?? 0;
    const xB = b.transform[4] ?? 0;

    if (Math.abs(yA - yB) > SAME_LINE_Y_THRESHOLD) {
      return yB - yA; // top-to-bottom
    }
    return xA - xB; // left-to-right
  });
}

/**
 * Merge adjacent same-line text items that are horizontally close, using PDF
 * spaces as hard word boundaries. Produces a new array; neither the input
 * array nor its items are mutated.
 *
 * Whitespace-only items are preserved as standalone boundary markers. A
 * non-space item is merged into the previous (non-space, same-line, near)
 * item by concatenating `str` and growing `width` to span the gap.
 */
export function mergeAdjacentTextItems<T extends ReadAloudTextItem>(
  sortedItems: readonly T[],
): T[] {
  const mergedItems: T[] = [];

  for (const item of sortedItems) {
    const isSpace = item.str.trim() === "";

    if (isSpace) {
      // Clone so callers never see a shared reference from the input array.
      mergedItems.push({ ...item });
      continue;
    }

    const lastItem = mergedItems[mergedItems.length - 1];

    if (lastItem && lastItem.str.trim()) {
      const yDiff = Math.abs(
        (lastItem.transform[5] ?? 0) - (item.transform[5] ?? 0),
      );
      const xGap =
        (item.transform[4] ?? 0) -
        ((lastItem.transform[4] ?? 0) + (lastItem.width ?? 0));

      if (yDiff < SAME_LINE_Y_THRESHOLD && xGap < CHAR_MERGE_THRESHOLD) {
        lastItem.str += item.str;
        lastItem.width =
          (lastItem.width ?? 0) + Math.max(0, xGap) + (item.width ?? 0);
        continue;
      }
    }

    mergedItems.push({ ...item });
  }

  return mergedItems;
}

/**
 * Build the spoken string for a page from its (already merged) text items:
 * join with single spaces, collapse runs of whitespace, and trim.
 */
export function buildSpokenText(
  items: readonly ReadAloudTextItem[],
): string {
  return items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clamp a requested highlight word index into the valid `[0, wordCount - 1]`
 * range. An empty word list clamps to 0.
 */
export function clampHighlightWordIndex(
  requestedIndex: number,
  wordCount: number,
): number {
  return Math.max(0, Math.min(requestedIndex, Math.max(wordCount - 1, 0)));
}

/**
 * Given the absolute character offset reported by a speech boundary event and
 * the ordered list of spoken words, return the index of the word that contains
 * that offset. Words are assumed to be separated by exactly one space in the
 * spoken text (matching how {@link buildSpokenText} joins them), so word `i`
 * occupies `[start, start + len)` and the following space occupies one char.
 *
 * Returns -1 when the offset falls outside every word (e.g. it lands on a
 * separating space or is past the end), mirroring "no word to highlight".
 */
export function findWordIndexAtCharIndex(
  words: readonly string[],
  absoluteCharIndex: number,
): number {
  let charCount = 0;
  for (let i = 0; i < words.length; i++) {
    const wordStart = charCount;
    const wordEnd = charCount + words[i].length;
    if (absoluteCharIndex >= wordStart && absoluteCharIndex < wordEnd) {
      return i;
    }
    charCount = wordEnd + 1;
  }
  return -1;
}
