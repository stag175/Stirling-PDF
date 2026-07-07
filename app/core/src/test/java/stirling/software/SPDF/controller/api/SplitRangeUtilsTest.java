package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link SplitRangeUtils} — the pure page-range partitioning extracted from {@link
 * SplitPdfBySizeController}. Expected ranges are hand-computed.
 */
class SplitRangeUtilsTest {

    // ---- pageCountRanges --------------------------------------------------

    @Test
    void pageCount_evenlyDivisible() {
        List<int[]> ranges = SplitRangeUtils.pageCountRanges(6, 2);
        assertEquals(3, ranges.size());
        assertArrayEquals(new int[] {0, 1}, ranges.get(0));
        assertArrayEquals(new int[] {2, 3}, ranges.get(1));
        assertArrayEquals(new int[] {4, 5}, ranges.get(2));
    }

    @Test
    void pageCount_withRemainderTrailingShortRange() {
        List<int[]> ranges = SplitRangeUtils.pageCountRanges(10, 3);
        assertEquals(4, ranges.size());
        assertArrayEquals(new int[] {0, 1, 2}, ranges.get(0));
        assertArrayEquals(new int[] {3, 4, 5}, ranges.get(1));
        assertArrayEquals(new int[] {6, 7, 8}, ranges.get(2));
        assertArrayEquals(new int[] {9}, ranges.get(3));
    }

    @Test
    void pageCount_largerThanTotalYieldsSingleRange() {
        List<int[]> ranges = SplitRangeUtils.pageCountRanges(5, 10);
        assertEquals(1, ranges.size());
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, ranges.get(0));
    }

    @Test
    void pageCount_singlePage() {
        List<int[]> ranges = SplitRangeUtils.pageCountRanges(1, 1);
        assertEquals(1, ranges.size());
        assertArrayEquals(new int[] {0}, ranges.get(0));
    }

    @Test
    void pageCount_zeroTotalYieldsNoRanges() {
        assertTrue(SplitRangeUtils.pageCountRanges(0, 3).isEmpty());
    }

    @Test
    void pageCount_nonPositiveThrows() {
        assertThrows(IllegalArgumentException.class, () -> SplitRangeUtils.pageCountRanges(10, 0));
        assertThrows(IllegalArgumentException.class, () -> SplitRangeUtils.pageCountRanges(10, -1));
    }

    // ---- docCountRanges ---------------------------------------------------

    @Test
    void docCount_evenlyDivisible() {
        List<int[]> ranges = SplitRangeUtils.docCountRanges(9, 3);
        assertEquals(3, ranges.size());
        assertArrayEquals(new int[] {0, 1, 2}, ranges.get(0));
        assertArrayEquals(new int[] {3, 4, 5}, ranges.get(1));
        assertArrayEquals(new int[] {6, 7, 8}, ranges.get(2));
    }

    @Test
    void docCount_remainderFrontLoadsExtraPages() {
        // 10 pages / 3 docs => 3 each + 1 extra on the first doc.
        List<int[]> ranges = SplitRangeUtils.docCountRanges(10, 3);
        assertEquals(3, ranges.size());
        assertArrayEquals(new int[] {0, 1, 2, 3}, ranges.get(0));
        assertArrayEquals(new int[] {4, 5, 6}, ranges.get(1));
        assertArrayEquals(new int[] {7, 8, 9}, ranges.get(2));
    }

    @Test
    void docCount_unevenTwoWaySplit() {
        // 7 pages / 2 docs => 4 + 3.
        List<int[]> ranges = SplitRangeUtils.docCountRanges(7, 2);
        assertEquals(2, ranges.size());
        assertArrayEquals(new int[] {0, 1, 2, 3}, ranges.get(0));
        assertArrayEquals(new int[] {4, 5, 6}, ranges.get(1));
    }

    @Test
    void docCount_moreDocsThanPagesSkipsEmptyRanges() {
        // 2 pages / 5 docs => first two docs get 1 page, remaining three are skipped.
        List<int[]> ranges = SplitRangeUtils.docCountRanges(2, 5);
        assertEquals(2, ranges.size());
        assertArrayEquals(new int[] {0}, ranges.get(0));
        assertArrayEquals(new int[] {1}, ranges.get(1));
    }

    @Test
    void docCount_zeroTotalYieldsNoRanges() {
        assertTrue(SplitRangeUtils.docCountRanges(0, 3).isEmpty());
    }

    @Test
    void docCount_nonPositiveThrows() {
        assertThrows(IllegalArgumentException.class, () -> SplitRangeUtils.docCountRanges(10, 0));
        assertThrows(IllegalArgumentException.class, () -> SplitRangeUtils.docCountRanges(10, -2));
    }

    // ---- buildRange + partition invariants --------------------------------

    @Test
    void buildRange_inclusiveContiguous() {
        assertArrayEquals(new int[] {0}, SplitRangeUtils.buildRange(0, 0));
        assertArrayEquals(new int[] {2, 3, 4, 5}, SplitRangeUtils.buildRange(2, 5));
    }

    @Test
    void partitionsCoverEveryPageExactlyOnce() {
        for (int total = 0; total <= 13; total++) {
            assertContiguousFullCover(SplitRangeUtils.pageCountRanges(total, 4), total);
            for (int docs = 1; docs <= 6; docs++) {
                assertContiguousFullCover(SplitRangeUtils.docCountRanges(total, docs), total);
            }
        }
    }

    private static void assertContiguousFullCover(List<int[]> ranges, int total) {
        int expected = 0;
        for (int[] range : ranges) {
            for (int page : range) {
                assertEquals(expected, page, "pages must be contiguous and 0-based");
                expected++;
            }
        }
        assertEquals(total, expected, "ranges must cover every page exactly once");
    }
}
