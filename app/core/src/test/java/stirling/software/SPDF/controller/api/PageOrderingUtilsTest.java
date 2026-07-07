package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Tests for the pure page-ordering algorithms extracted from {@link RearrangePagesPDFController}
 * (roadmap C2/A3). These imposition/collation algorithms are off-by-one-prone and previously had no
 * direct coverage; expected outputs below are hand-computed (0-based page indices).
 */
class PageOrderingUtilsTest {

    @Test
    void removeFirst() {
        assertTrue(PageOrderingUtils.removeFirst(1).isEmpty());
        assertEquals(List.of(1, 2), PageOrderingUtils.removeFirst(3));
    }

    @Test
    void removeLast() {
        assertTrue(PageOrderingUtils.removeLast(1).isEmpty());
        assertEquals(List.of(0, 1), PageOrderingUtils.removeLast(3));
    }

    @Test
    void removeFirstAndLast() {
        assertTrue(PageOrderingUtils.removeFirstAndLast(2).isEmpty());
        assertEquals(List.of(1, 2), PageOrderingUtils.removeFirstAndLast(4));
    }

    @Test
    void reverseOrder() {
        assertEquals(List.of(2, 1, 0), PageOrderingUtils.reverseOrder(3));
        assertEquals(List.of(0), PageOrderingUtils.reverseOrder(1));
    }

    @Test
    void duplexSort() {
        assertEquals(List.of(0, 3, 1, 2), PageOrderingUtils.duplexSort(4));
        assertEquals(List.of(0, 2, 1), PageOrderingUtils.duplexSort(3)); // odd count, no OOB
        assertEquals(List.of(0), PageOrderingUtils.duplexSort(1));
    }

    @Test
    void bookletSort() {
        assertEquals(List.of(0, 3, 1, 2), PageOrderingUtils.bookletSort(4));
        assertEquals(List.of(0, 2), PageOrderingUtils.bookletSort(3)); // middle page dropped (n/2)
    }

    @Test
    void sideStitchBooklet() {
        assertEquals(List.of(3, 0, 1, 2), PageOrderingUtils.sideStitchBooklet(4));
        // n=5: second 4-page signature clamps every index to the last page (4).
        assertEquals(List.of(3, 0, 1, 2, 4, 4, 4, 4), PageOrderingUtils.sideStitchBooklet(5));
    }

    @Test
    void oddEvenSplit() {
        assertEquals(List.of(0, 2, 4, 1, 3), PageOrderingUtils.oddEvenSplit(5));
        assertEquals(List.of(0, 2, 1, 3), PageOrderingUtils.oddEvenSplit(4));
    }
}
