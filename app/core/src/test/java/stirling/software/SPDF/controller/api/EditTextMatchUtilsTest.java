package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.controller.api.EditTextMatchUtils.MatchSpan;
import stirling.software.SPDF.model.json.PdfJsonTextElement;

/**
 * Unit tests for {@link EditTextMatchUtils} — the pure text-match splicing extracted from {@link
 * EditTextController}. Expected splices are hand-computed.
 */
class EditTextMatchUtilsTest {

    private static List<PdfJsonTextElement> elements(String... texts) {
        List<PdfJsonTextElement> list = new ArrayList<>();
        for (String t : texts) {
            list.add(PdfJsonTextElement.builder().text(t).build());
        }
        return list;
    }

    private static List<String> texts(List<PdfJsonTextElement> elements) {
        List<String> out = new ArrayList<>();
        for (PdfJsonTextElement e : elements) {
            out.add(e.getText());
        }
        return out;
    }

    // ---- findElementForCharIndex ------------------------------------------

    @Test
    void findElementForCharIndex_locatesCoveringElementOrMinusOne() {
        int[] starts = {0, 5, 10};
        int[] ends = {5, 10, 15};
        assertEquals(0, EditTextMatchUtils.findElementForCharIndex(starts, ends, 0));
        assertEquals(0, EditTextMatchUtils.findElementForCharIndex(starts, ends, 4));
        assertEquals(1, EditTextMatchUtils.findElementForCharIndex(starts, ends, 5));
        assertEquals(1, EditTextMatchUtils.findElementForCharIndex(starts, ends, 9));
        assertEquals(2, EditTextMatchUtils.findElementForCharIndex(starts, ends, 10));
        assertEquals(2, EditTextMatchUtils.findElementForCharIndex(starts, ends, 14));
        assertEquals(-1, EditTextMatchUtils.findElementForCharIndex(starts, ends, 15));
        assertEquals(-1, EditTextMatchUtils.findElementForCharIndex(starts, ends, -1));
    }

    // ---- single-element splice --------------------------------------------

    @Test
    void singleElement_replacesTrailingSpan() {
        List<PdfJsonTextElement> els = elements("Hello World");
        Set<Integer> modified = new HashSet<>();
        // replace "World" (joined chars 6..11) with "There"
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0}, new MatchSpan(6, 11, "There"), 0, 0, modified);
        assertEquals(List.of("Hello There"), texts(els));
        assertEquals(Set.of(0), modified);
    }

    @Test
    void singleElement_replacesInteriorSpan() {
        List<PdfJsonTextElement> els = elements("abcdef");
        Set<Integer> modified = new HashSet<>();
        // replace "cd" (2..4) with "XY"
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0}, new MatchSpan(2, 4, "XY"), 0, 0, modified);
        assertEquals(List.of("abXYef"), texts(els));
    }

    @Test
    void singleElement_nullTextTreatedAsEmpty() {
        List<PdfJsonTextElement> els = elements((String) null);
        Set<Integer> modified = new HashSet<>();
        // zero-length span at 0 inserts the replacement into an empty (null) element
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0}, new MatchSpan(0, 0, "INS"), 0, 0, modified);
        assertEquals(List.of("INS"), texts(els));
    }

    // ---- cross-element splice ---------------------------------------------

    @Test
    void crossElement_twoElements_writesReplacementIntoFirst_keepsSuffixOfLast() {
        List<PdfJsonTextElement> els = elements("Hello", "World"); // joined "HelloWorld"
        Set<Integer> modified = new HashSet<>();
        // replace joined chars 3..8 ("loWor") with "X"; first elem [0,5), last elem [5,10)
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0, 5}, new MatchSpan(3, 8, "X"), 0, 1, modified);
        assertEquals(List.of("HelX", "ld"), texts(els));
        assertEquals(Set.of(0, 1), modified);
    }

    @Test
    void crossElement_emptiesIntermediateElements() {
        List<PdfJsonTextElement> els = elements("AAA", "BBB", "CCC"); // joined "AAABBBCCC"
        Set<Integer> modified = new HashSet<>();
        // replace chars 1..8 with "Z"; first [0,3), mid [3,6), last [6,9)
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0, 3, 6}, new MatchSpan(1, 8, "Z"), 0, 2, modified);
        assertEquals(List.of("AZ", "", "C"), texts(els));
        assertEquals(Set.of(0, 1, 2), modified);
    }

    @Test
    void modifiedIndices_areAddedNotReplaced() {
        List<PdfJsonTextElement> els = elements("Hello World");
        Set<Integer> modified = new HashSet<>(Set.of(99)); // pre-existing entry
        EditTextMatchUtils.applyMatchToElements(
                els, new int[] {0}, new MatchSpan(0, 5, "Howdy"), 0, 0, modified);
        assertEquals(List.of("Howdy World"), texts(els));
        assertTrue(modified.contains(99), "pre-existing modified index preserved");
        assertTrue(modified.contains(0), "newly modified index added");
    }
}
