package stirling.software.SPDF.controller.api;

import java.util.List;
import java.util.Set;

import stirling.software.SPDF.model.json.PdfJsonTextElement;

/**
 * Pure text-match splicing logic extracted from {@link EditTextController} so the
 * (off-by-one-prone) cross-element substring replacement can be unit-tested without running a regex
 * over a real PDF's extracted text. Behaviour is identical to the original private methods.
 *
 * <p>Text elements are joined into one string; {@code starts[i]}/{@code ends[i]} are the half-open
 * character span of element {@code i} in that joined string. A {@link MatchSpan} is a regex match's
 * half-open span plus the replacement text to write over it.
 */
public final class EditTextMatchUtils {

    private EditTextMatchUtils() {}

    /**
     * A regex match span in the joined string and the replacement to apply over {@code
     * [start,end)}.
     */
    public record MatchSpan(int start, int end, String replacement) {}

    /**
     * Returns the index of the element whose half-open span {@code [starts[i], ends[i])} contains
     * {@code charIndex}, or {@code -1} if none does.
     */
    public static int findElementForCharIndex(int[] starts, int[] ends, int charIndex) {
        for (int i = 0; i < starts.length; i++) {
            if (starts[i] <= charIndex && charIndex < ends[i]) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Applies {@code span}'s replacement across the elements it covers. For a single-element match,
     * the replacement is spliced into that element's text. For a cross-element match, the whole
     * replacement is written into the first element (after its un-matched prefix), intermediate
     * elements are emptied, and only the un-matched suffix of the last element is kept — so the
     * JSON→PDF rebuild lays the replacement out as one continuous run anchored at the first
     * element. Every touched element index is added to {@code modifiedIndices}.
     */
    public static void applyMatchToElements(
            List<PdfJsonTextElement> elements,
            int[] starts,
            MatchSpan span,
            int firstElement,
            int lastElement,
            Set<Integer> modifiedIndices) {
        if (firstElement == lastElement) {
            PdfJsonTextElement element = elements.get(firstElement);
            String text = nullToEmpty(element.getText());
            int matchStartInElement = span.start() - starts[firstElement];
            int matchEndInElement = span.end() - starts[firstElement];
            element.setText(
                    text.substring(0, matchStartInElement)
                            + span.replacement()
                            + text.substring(matchEndInElement));
            modifiedIndices.add(firstElement);
            return;
        }

        // Cross-element match: write the whole replacement into the first matched element, empty
        // any intermediate elements, and keep only the suffix of the last matched element. The
        // JSON->PDF rebuild concatenates per-token text, so the font lays out the replacement as
        // one continuous run anchored at the first element's X position.
        String firstText = nullToEmpty(elements.get(firstElement).getText());
        int firstSplit = span.start() - starts[firstElement];
        elements.get(firstElement).setText(firstText.substring(0, firstSplit) + span.replacement());
        modifiedIndices.add(firstElement);

        for (int mid = firstElement + 1; mid < lastElement; mid++) {
            elements.get(mid).setText("");
            modifiedIndices.add(mid);
        }

        String lastText = nullToEmpty(elements.get(lastElement).getText());
        int lastSplit = span.end() - starts[lastElement];
        elements.get(lastElement).setText(lastText.substring(lastSplit));
        modifiedIndices.add(lastElement);
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
