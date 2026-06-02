package stirling.software.SPDF.controller.api;

/**
 * Pure geometry for one cell of the grid that {@link SplitPdfBySectionsController} lays over a page
 * when splitting it into sections. Extracted from the controller so the sub-page sizing and the
 * (off-by-one-prone) PDF bottom-left-origin translate offsets can be unit-tested without PDFBox.
 *
 * <p>A page of {@code pageWidth × pageHeight} is divided into a {@code totalHoriz × totalVert}
 * grid. Cell {@code (horizIndex, vertIndex)} — with {@code horizIndex} counting columns left→right
 * (column 0 is leftmost) and {@code vertIndex} counting rows top→bottom (row 0 is the topmost) — is
 * rendered onto a sub-page of size {@code subPageWidth × subPageHeight} by translating the imported
 * full page by {@code (translateX, translateY)} so the desired cell lands in the sub-page's origin
 * box.
 *
 * @param subPageWidth width of each sub-page ({@code pageWidth / totalHoriz})
 * @param subPageHeight height of each sub-page ({@code pageHeight / totalVert})
 * @param translateX horizontal translation applied to the imported page (≤ 0); {@code 0} for the
 *     leftmost column
 * @param translateY vertical translation applied to the imported page (≤ 0); {@code 0} for the
 *     bottom row and most-negative for the top row — the {@code totalVert - 1 - vertIndex} term
 *     accounts for PDF's bottom-left origin (the top row must be shifted furthest down)
 */
public record SectionGridGeometry(
        float subPageWidth, float subPageHeight, float translateX, float translateY) {

    public static SectionGridGeometry cell(
            float pageWidth,
            float pageHeight,
            int totalHoriz,
            int totalVert,
            int horizIndex,
            int vertIndex) {
        float subPageWidth = pageWidth / totalHoriz;
        float subPageHeight = pageHeight / totalVert;
        float translateX = -subPageWidth * horizIndex;
        float translateY = -subPageHeight * (totalVert - 1 - vertIndex);
        return new SectionGridGeometry(subPageWidth, subPageHeight, translateX, translateY);
    }
}
