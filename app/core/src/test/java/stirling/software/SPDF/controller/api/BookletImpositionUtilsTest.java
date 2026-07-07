package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.controller.api.BookletImpositionUtils.Side;

/**
 * Unit tests for {@link BookletImpositionUtils} — the pure saddle-stitch imposition arithmetic
 * extracted from {@link BookletImpositionController}. Expected sheet/side orderings are
 * hand-traced.
 */
class BookletImpositionUtilsTest {

    private static void assertSide(Side side, int left, int right, boolean isBack) {
        assertEquals(left, side.left(), "left");
        assertEquals(right, side.right(), "right");
        assertEquals(isBack, side.isBack(), "isBack");
    }

    // ---- padToMultipleOf4 -------------------------------------------------

    @Test
    void padToMultipleOf4_roundsUp() {
        assertEquals(0, BookletImpositionUtils.padToMultipleOf4(0));
        assertEquals(4, BookletImpositionUtils.padToMultipleOf4(1));
        assertEquals(4, BookletImpositionUtils.padToMultipleOf4(4));
        assertEquals(8, BookletImpositionUtils.padToMultipleOf4(5));
        assertEquals(8, BookletImpositionUtils.padToMultipleOf4(7));
        assertEquals(8, BookletImpositionUtils.padToMultipleOf4(8));
        assertEquals(12, BookletImpositionUtils.padToMultipleOf4(9));
    }

    // ---- saddleStitchSides: basic ordering --------------------------------

    @Test
    void singleSheet_fourPages_pairsOuterThenInner() {
        // 4 pages, one sheet: front = [last, first] = [3,0]; back = [1,2].
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(4, false, "BOTH", false);
        assertEquals(2, sides.size());
        assertSide(sides.get(0), 3, 0, false);
        assertSide(sides.get(1), 1, 2, true);
    }

    @Test
    void twoSheets_eightPages_walkInward() {
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(8, false, "BOTH", false);
        assertEquals(4, sides.size());
        assertSide(sides.get(0), 7, 0, false);
        assertSide(sides.get(1), 1, 6, true);
        assertSide(sides.get(2), 5, 2, false);
        assertSide(sides.get(3), 3, 4, true);
    }

    // ---- padding to a multiple of 4 ---------------------------------------

    @Test
    void fivePages_padsToEight_withBlanksAsMinusOne() {
        // pages 0..4 real; indices 5,6,7 are blank (-1).
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(5, false, "BOTH", false);
        assertEquals(4, sides.size());
        assertSide(sides.get(0), -1, 0, false); // index 7 -> blank
        assertSide(sides.get(1), 1, -1, true); // index 6 -> blank
        assertSide(sides.get(2), -1, 2, false); // index 5 -> blank
        assertSide(sides.get(3), 3, 4, true);
    }

    // ---- duplex pass selection --------------------------------------------

    @Test
    void duplexFirst_emitsOnlyFrontFaces() {
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(8, true, "FIRST", false);
        assertEquals(2, sides.size());
        assertSide(sides.get(0), 7, 0, false);
        assertSide(sides.get(1), 5, 2, false);
    }

    @Test
    void duplexSecond_emitsOnlyBackFaces() {
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(8, true, "SECOND", false);
        assertEquals(2, sides.size());
        assertSide(sides.get(0), 1, 6, true);
        assertSide(sides.get(1), 3, 4, true);
    }

    // ---- short-edge flip ---------------------------------------------------

    @Test
    void shortEdgeFlip_whenDuplex_swapsBackLeftRight() {
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(4, true, "BOTH", true);
        assertEquals(2, sides.size());
        assertSide(sides.get(0), 3, 0, false); // front unchanged
        assertSide(sides.get(1), 2, 1, true); // back swapped (normal would be 1,2)
    }

    @Test
    void shortEdgeFlag_ignoredWhenNotDoubleSided() {
        // flipOnShortEdge requires doubleSided too; single-sided keeps the normal back order.
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(4, false, "BOTH", true);
        assertEquals(2, sides.size());
        assertSide(sides.get(1), 1, 2, true);
    }

    // ---- edge cases --------------------------------------------------------

    @Test
    void zeroPages_yieldsNoSides() {
        assertTrue(BookletImpositionUtils.saddleStitchSides(0, false, "BOTH", false).isEmpty());
    }

    @Test
    void everyRealPageAppearsExactlyOnceAcrossSides() {
        int pages = 6; // pads to 8
        List<Side> sides = BookletImpositionUtils.saddleStitchSides(pages, false, "BOTH", false);
        boolean[] seen = new boolean[pages];
        int realCount = 0;
        for (Side side : sides) {
            for (int idx : new int[] {side.left(), side.right()}) {
                if (idx >= 0) {
                    assertTrue(idx < pages, "index in range");
                    assertTrue(!seen[idx], "page " + idx + " placed only once");
                    seen[idx] = true;
                    realCount++;
                }
            }
        }
        assertEquals(pages, realCount, "all real pages placed");
    }
}
