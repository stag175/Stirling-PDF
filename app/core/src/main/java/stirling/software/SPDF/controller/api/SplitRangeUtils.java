package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.List;

import stirling.software.common.util.ExceptionUtils;

/**
 * Pure page-range partitioning used by {@link SplitPdfBySizeController} for the by-page-count and
 * by-document-count split modes. Extracted from the controller so the integer-partition arithmetic
 * can be unit-tested directly against hand-computed ranges without loading a PDF — behaviour is
 * identical to the original private methods (same {@link ExceptionUtils} validation messages).
 *
 * <p>Each returned {@code int[]} is a contiguous, 0-based, inclusive page-index range.
 */
public final class SplitRangeUtils {

    private SplitRangeUtils() {}

    /** Splits {@code totalPages} into contiguous ranges of at most {@code pageCount} pages each. */
    public static List<int[]> pageCountRanges(int totalPages, int pageCount) {
        if (pageCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "Invalid argument: {0}", "page count: " + pageCount);
        }
        List<int[]> ranges = new ArrayList<>();
        int start = 0;
        while (start < totalPages) {
            int end = Math.min(start + pageCount - 1, totalPages - 1);
            ranges.add(buildRange(start, end));
            start = end + 1;
        }
        return ranges;
    }

    /**
     * Splits {@code totalPages} into {@code documentCount} contiguous ranges as evenly as possible;
     * the first {@code totalPages % documentCount} ranges get one extra page. Empty ranges (when
     * there are fewer pages than documents) are skipped.
     */
    public static List<int[]> docCountRanges(int totalPages, int documentCount) {
        if (documentCount <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "document count: " + documentCount);
        }
        int pagesPerDocument = totalPages / documentCount;
        int extraPages = totalPages % documentCount;
        List<int[]> ranges = new ArrayList<>();
        int cursor = 0;
        for (int i = 0; i < documentCount; i++) {
            int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);
            if (pagesToAdd == 0) {
                continue;
            }
            int end = cursor + pagesToAdd - 1;
            ranges.add(buildRange(cursor, end));
            cursor = end + 1;
        }
        return ranges;
    }

    static int[] buildRange(int start, int end) {
        int[] range = new int[end - start + 1];
        for (int i = 0; i < range.length; i++) {
            range[i] = start + i;
        }
        return range;
    }
}
