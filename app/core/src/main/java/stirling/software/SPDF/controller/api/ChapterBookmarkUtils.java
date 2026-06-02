package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure bookmark/chapter list arithmetic extracted from {@link SplitPdfByChaptersController} so it
 * can be unit-tested without opening a PDF. Behaviour is identical to the original private methods.
 *
 * <p>Operates on the package-private {@link Bookmark} ({@code title}, {@code startPage}, {@code
 * endPage}); page indices are 0-based.
 */
public final class ChapterBookmarkUtils {

    private ChapterBookmarkUtils() {}

    /**
     * Assigns each bookmark's {@code endPage} to the start page of the next bookmark at or after it
     * (the next chapter boundary), or {@code totalPages} for the last bookmark. Mutates the
     * elements of {@code bookmarks} in place.
     */
    public static void assignEndPages(List<Bookmark> bookmarks, int totalPages) {
        for (int i = 0; i < bookmarks.size(); i++) {
            Bookmark current = bookmarks.get(i);
            int next = -1;
            for (int j = i + 1; j < bookmarks.size(); j++) {
                if (bookmarks.get(j).getStartPage() >= current.getStartPage()) {
                    next = bookmarks.get(j).getStartPage();
                    break;
                }
            }
            current.setEndPage(next == -1 ? totalPages : next);
        }
    }

    /**
     * Merges zero-length chapters (those whose {@code startPage == endPage}, i.e. the next chapter
     * begins on the same page) into the following non-empty chapter. The accumulated same-page
     * titles are space-joined and truncated to 256 chars ({@code 253 + "..."}) if longer.
     *
     * <p><b>Behaviour note (preserved from the original):</b> the surviving chapter's title is
     * <em>replaced</em> by the accumulated same-page titles — its own title is not appended. This
     * mutates and returns the same list instance.
     */
    public static List<Bookmark> mergeBookmarksOnSamePage(List<Bookmark> bookmarks) {
        String mergedTitle = "";
        List<Bookmark> chaptersToBeRemoved = new ArrayList<>();
        for (Bookmark bookmark : bookmarks) {
            if (bookmark.getStartPage() == bookmark.getEndPage()) {
                mergedTitle = mergedTitle.concat(bookmark.getTitle().concat(" "));
                chaptersToBeRemoved.add(bookmark);
            } else {
                if (!mergedTitle.isEmpty()) {
                    if (mergedTitle.length() > 255) {
                        mergedTitle = mergedTitle.substring(0, 253) + "...";
                    }

                    bookmarks.set(
                            bookmarks.indexOf(bookmark),
                            new Bookmark(
                                    mergedTitle, bookmark.getStartPage(), bookmark.getEndPage()));
                }
                mergedTitle = "";
            }
        }
        bookmarks.removeAll(chaptersToBeRemoved);
        return bookmarks;
    }
}
