package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Characterization tests for {@link ChapterBookmarkUtils} — the pure bookmark/chapter arithmetic
 * extracted from {@link SplitPdfByChaptersController}. These pin the existing behaviour (including
 * a known title-replacement quirk in the merge), so the extraction is verifiably
 * behaviour-preserving.
 */
class ChapterBookmarkUtilsTest {

    private static List<Bookmark> list(Bookmark... bms) {
        return new ArrayList<>(List.of(bms));
    }

    // ---- assignEndPages ---------------------------------------------------

    @Test
    void assignEndPages_setsEachEndToNextStart_lastToTotal() {
        List<Bookmark> bms =
                list(new Bookmark("a", 0, -2), new Bookmark("b", 3, -2), new Bookmark("c", 7, -2));
        ChapterBookmarkUtils.assignEndPages(bms, 10);
        assertEquals(3, bms.get(0).getEndPage());
        assertEquals(7, bms.get(1).getEndPage());
        assertEquals(10, bms.get(2).getEndPage());
    }

    @Test
    void assignEndPages_singleBookmarkGetsTotal() {
        List<Bookmark> bms = list(new Bookmark("only", 0, -2));
        ChapterBookmarkUtils.assignEndPages(bms, 5);
        assertEquals(5, bms.get(0).getEndPage());
    }

    @Test
    void assignEndPages_sameStartPageProducesZeroLengthChapter() {
        // Two bookmarks share page 2: the first one's end == its own start (zero-length).
        List<Bookmark> bms =
                list(new Bookmark("a", 2, -2), new Bookmark("b", 2, -2), new Bookmark("c", 5, -2));
        ChapterBookmarkUtils.assignEndPages(bms, 8);
        assertEquals(2, bms.get(0).getEndPage()); // start == end => zero-length
        assertEquals(5, bms.get(1).getEndPage());
        assertEquals(8, bms.get(2).getEndPage());
    }

    @Test
    void assignEndPages_emptyListIsNoOp() {
        List<Bookmark> bms = list();
        ChapterBookmarkUtils.assignEndPages(bms, 10);
        assertTrue(bms.isEmpty());
    }

    // ---- mergeBookmarksOnSamePage -----------------------------------------

    @Test
    void merge_noZeroLengthChapters_leavesListUnchanged() {
        List<Bookmark> bms = list(new Bookmark("a", 0, 3), new Bookmark("b", 3, 8));
        List<Bookmark> result = ChapterBookmarkUtils.mergeBookmarksOnSamePage(bms);
        assertEquals(2, result.size());
        assertEquals("a", result.get(0).getTitle());
        assertEquals("b", result.get(1).getTitle());
    }

    @Test
    void merge_foldsLeadingZeroLengthIntoNextChapter_replacingItsTitle() {
        // "intro" is zero-length (0==0); it folds into "ch1". QUIRK: ch1's own title is dropped,
        // replaced by the accumulated same-page title ("intro "). Page range is ch1's.
        List<Bookmark> bms = list(new Bookmark("intro", 0, 0), new Bookmark("ch1", 0, 5));
        List<Bookmark> result = ChapterBookmarkUtils.mergeBookmarksOnSamePage(bms);
        assertEquals(1, result.size());
        assertEquals("intro ", result.get(0).getTitle());
        assertEquals(0, result.get(0).getStartPage());
        assertEquals(5, result.get(0).getEndPage());
    }

    @Test
    void merge_foldsMultipleConsecutiveZeroLengthChapters() {
        List<Bookmark> bms =
                list(new Bookmark("x", 2, 2), new Bookmark("y", 2, 2), new Bookmark("z", 2, 9));
        List<Bookmark> result = ChapterBookmarkUtils.mergeBookmarksOnSamePage(bms);
        assertEquals(1, result.size());
        assertEquals("x y ", result.get(0).getTitle());
        assertEquals(2, result.get(0).getStartPage());
        assertEquals(9, result.get(0).getEndPage());
    }

    @Test
    void merge_trailingZeroLengthChapterIsDroppedWithNoSurvivorToAttachTo() {
        // A zero-length chapter at the end has no following normal chapter, so it is simply removed
        // and its title is lost (preserved behaviour).
        List<Bookmark> bms = list(new Bookmark("a", 0, 4), new Bookmark("tail", 4, 4));
        List<Bookmark> result = ChapterBookmarkUtils.mergeBookmarksOnSamePage(bms);
        assertEquals(1, result.size());
        assertEquals("a", result.get(0).getTitle());
    }

    @Test
    void merge_truncatesOverlongMergedTitleTo256Chars() {
        String longTitle = "a".repeat(300);
        List<Bookmark> bms = list(new Bookmark(longTitle, 1, 1), new Bookmark("real", 1, 5));
        List<Bookmark> result = ChapterBookmarkUtils.mergeBookmarksOnSamePage(bms);
        assertEquals(1, result.size());
        String merged = result.get(0).getTitle();
        assertEquals(256, merged.length());
        assertTrue(merged.endsWith("..."));
    }
}
