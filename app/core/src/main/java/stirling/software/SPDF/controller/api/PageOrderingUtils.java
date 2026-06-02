package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure page-ordering algorithms extracted from {@link RearrangePagesPDFController} (roadmap C2/A3 —
 * thinning the controller + giving these tricky, off-by-one-prone algorithms direct test coverage
 * they previously lacked). Every method maps a page count to a list of 0-based page indices in the
 * desired output order; none touch PDFBox, I/O, or controller state, so they are unit-tested
 * directly (see {@code PageOrderingUtilsTest}).
 */
public final class PageOrderingUtils {

    private PageOrderingUtils() {}

    /**
     * Drop the first page: pages {@code 2..n} (0-based {@code 1..n-1}). Empty when {@code n <= 1}.
     */
    public static List<Integer> removeFirst(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i <= totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    /**
     * Drop the last page: pages {@code 1..n-1} (0-based {@code 0..n-2}). Empty when {@code n <= 1}.
     */
    public static List<Integer> removeLast(int totalPages) {
        if (totalPages <= 1) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    /** Drop both first and last pages. Empty when {@code n <= 2}. */
    public static List<Integer> removeFirstAndLast(int totalPages) {
        if (totalPages <= 2) return new ArrayList<>();
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 2; i < totalPages; i++) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    /** Reverse page order: {@code n-1, n-2, ..., 0}. */
    public static List<Integer> reverseOrder(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = totalPages; i >= 1; i--) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }

    /** Duplex collation: interleave front-half with back-half (handles odd counts). */
    public static List<Integer> duplexSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        int half = (totalPages + 1) / 2; // This ensures proper behavior with odd numbers of pages
        for (int i = 1; i <= half; i++) {
            newPageOrder.add(i - 1);
            if (i <= totalPages - half) { // Avoid going out of bounds
                newPageOrder.add(totalPages - i);
            }
        }
        return newPageOrder;
    }

    /** Saddle-stitch booklet imposition: outer pair, next pair, ... */
    public static List<Integer> bookletSort(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < totalPages / 2; i++) {
            newPageOrder.add(i);
            newPageOrder.add(totalPages - i - 1);
        }
        return newPageOrder;
    }

    /** Side-stitch booklet imposition in 4-page signatures. */
    public static List<Integer> sideStitchBooklet(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 0; i < (totalPages + 3) / 4; i++) {
            int begin = i * 4;
            newPageOrder.add(Math.min(begin + 3, totalPages - 1));
            newPageOrder.add(Math.min(begin, totalPages - 1));
            newPageOrder.add(Math.min(begin + 1, totalPages - 1));
            newPageOrder.add(Math.min(begin + 2, totalPages - 1));
        }
        return newPageOrder;
    }

    /** Odd pages first (1,3,5,...) then even pages (2,4,6,...), all as 0-based indices. */
    public static List<Integer> oddEvenSplit(int totalPages) {
        List<Integer> newPageOrder = new ArrayList<>();
        for (int i = 1; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        for (int i = 2; i <= totalPages; i += 2) {
            newPageOrder.add(i - 1);
        }
        return newPageOrder;
    }
}
