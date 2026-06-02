package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link SectionGridGeometry} — the pure grid-cell geometry extracted from {@link
 * SplitPdfBySectionsController}. Expected sizes and translate offsets are hand-computed from the
 * controller's original formula: {@code translateX = -subW*horizIndex}, {@code translateY =
 * -subH*(totalVert-1-vertIndex)}. {@code vertIndex} counts rows top→bottom (row 0 is the top), so
 * the bottom row gets {@code translateY == 0} and the top row the most-negative.
 */
class SectionGridGeometryTest {

    private static final float EPS = 1e-4f;

    @Test
    void subPageSize_dividesPageEvenly() {
        SectionGridGeometry geo = SectionGridGeometry.cell(600f, 800f, 2, 4, 0, 0);
        assertEquals(300f, geo.subPageWidth(), EPS);
        assertEquals(200f, geo.subPageHeight(), EPS);
    }

    @Test
    void bottomLeftCell_hasZeroTranslation() {
        // Bottom row is vertIndex = totalVert-1. Bottom-left of a 3x2 grid: column 0, row 1 — the
        // page is already aligned at the origin, so no shift in either axis.
        SectionGridGeometry geo = SectionGridGeometry.cell(600f, 800f, 3, 2, 0, 1);
        assertEquals(0f, geo.translateX(), EPS);
        assertEquals(0f, geo.translateY(), EPS);
    }

    @Test
    void topRow_translatesDownByFullColumnHeight() {
        // 2 rows, subH = 400. Top row (vertIndex 0) must be shifted down a full sub-height to land
        // in the [0, subH] clip box; bottom row (vertIndex 1) needs no vertical shift.
        SectionGridGeometry top = SectionGridGeometry.cell(600f, 800f, 1, 2, 0, 0);
        SectionGridGeometry bottom = SectionGridGeometry.cell(600f, 800f, 1, 2, 0, 1);
        assertEquals(-400f, top.translateY(), EPS);
        assertEquals(0f, bottom.translateY(), EPS);
    }

    @Test
    void horizIndex_shiftsLeftByMultiplesOfSubWidth() {
        SectionGridGeometry col0 = SectionGridGeometry.cell(900f, 300f, 3, 1, 0, 0);
        SectionGridGeometry col1 = SectionGridGeometry.cell(900f, 300f, 3, 1, 1, 0);
        SectionGridGeometry col2 = SectionGridGeometry.cell(900f, 300f, 3, 1, 2, 0);
        assertEquals(0f, col0.translateX(), EPS);
        assertEquals(-300f, col1.translateX(), EPS);
        assertEquals(-600f, col2.translateX(), EPS);
    }

    @Test
    void interiorCell_combinesBothOffsets() {
        // 3x3 grid over 300x300 => sub 100x100.
        // Bottom-right cell (col=2, row vertIndex=2): translateX=-100*2=-200;
        // translateY=-100*(3-1-2)=0.
        SectionGridGeometry br = SectionGridGeometry.cell(300f, 300f, 3, 3, 2, 2);
        assertEquals(100f, br.subPageWidth(), EPS);
        assertEquals(100f, br.subPageHeight(), EPS);
        assertEquals(-200f, br.translateX(), EPS);
        assertEquals(0f, br.translateY(), EPS);
        // Top-left cell (col=0, row vertIndex=0): translateX=0; translateY=-100*(3-1-0)=-200.
        SectionGridGeometry tl = SectionGridGeometry.cell(300f, 300f, 3, 3, 0, 0);
        assertEquals(0f, tl.translateX(), EPS);
        assertEquals(-200f, tl.translateY(), EPS);
    }

    @Test
    void nonDivisiblePage_keepsFloatPrecision() {
        SectionGridGeometry geo = SectionGridGeometry.cell(100f, 100f, 3, 3, 1, 1);
        assertEquals(100f / 3f, geo.subPageWidth(), EPS);
        assertEquals(100f / 3f, geo.subPageHeight(), EPS);
        assertEquals(-(100f / 3f) * 1, geo.translateX(), EPS);
        // middle row of 3 => translateY = -(100/3)*(3-1-1) = -(100/3).
        assertEquals(-(100f / 3f) * (3 - 1 - 1), geo.translateY(), EPS);
    }

    @Test
    void singleCellGrid_isWholePageNoShift() {
        SectionGridGeometry geo = SectionGridGeometry.cell(612f, 792f, 1, 1, 0, 0);
        assertEquals(612f, geo.subPageWidth(), EPS);
        assertEquals(792f, geo.subPageHeight(), EPS);
        assertEquals(0f, geo.translateX(), EPS);
        assertEquals(0f, geo.translateY(), EPS);
    }
}
