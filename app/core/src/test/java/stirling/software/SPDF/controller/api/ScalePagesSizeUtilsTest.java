package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScalePagesSizeUtils} — the pure named-page-size resolution extracted from
 * {@link ScalePagesController}. Expected dimensions are compared against the PDFBox constants.
 */
class ScalePagesSizeUtilsTest {

    private static final float EPS = 1e-3f;

    @Test
    void portrait_returnsBaseDimensions() {
        PDRectangle r = ScalePagesSizeUtils.resolveNamedSize("A4", "PORTRAIT");
        assertEquals(PDRectangle.A4.getWidth(), r.getWidth(), EPS);
        assertEquals(PDRectangle.A4.getHeight(), r.getHeight(), EPS);
    }

    @Test
    void landscape_swapsWidthAndHeight() {
        PDRectangle r = ScalePagesSizeUtils.resolveNamedSize("A4", "LANDSCAPE");
        assertEquals(PDRectangle.A4.getHeight(), r.getWidth(), EPS);
        assertEquals(PDRectangle.A4.getWidth(), r.getHeight(), EPS);
    }

    @Test
    void landscape_isCaseInsensitive() {
        PDRectangle r = ScalePagesSizeUtils.resolveNamedSize("LETTER", "landscape");
        assertEquals(PDRectangle.LETTER.getHeight(), r.getWidth(), EPS);
        assertEquals(PDRectangle.LETTER.getWidth(), r.getHeight(), EPS);
    }

    @Test
    void nullOrientation_treatedAsPortrait() {
        PDRectangle r = ScalePagesSizeUtils.resolveNamedSize("A3", null);
        assertEquals(PDRectangle.A3.getWidth(), r.getWidth(), EPS);
        assertEquals(PDRectangle.A3.getHeight(), r.getHeight(), EPS);
    }

    @Test
    void unrecognizedOrientation_treatedAsPortrait() {
        PDRectangle r = ScalePagesSizeUtils.resolveNamedSize("A5", "DIAGONAL");
        assertEquals(PDRectangle.A5.getWidth(), r.getWidth(), EPS);
        assertEquals(PDRectangle.A5.getHeight(), r.getHeight(), EPS);
    }

    @Test
    void allNamedSizesResolve() {
        for (String name :
                new String[] {"A0", "A1", "A2", "A3", "A4", "A5", "A6", "LETTER", "LEGAL"}) {
            PDRectangle r = ScalePagesSizeUtils.resolveNamedSize(name, "PORTRAIT");
            assertTrue(
                    r.getWidth() > 0 && r.getHeight() > 0, name + " must have positive dimensions");
        }
    }

    @Test
    void unknownSize_throws() {
        assertThrows(
                IllegalArgumentException.class,
                () -> ScalePagesSizeUtils.resolveNamedSize("NOT_A_SIZE", "PORTRAIT"));
        // "KEEP" is handled by the controller, not the util — the util treats it as unknown.
        assertThrows(
                IllegalArgumentException.class,
                () -> ScalePagesSizeUtils.resolveNamedSize("KEEP", "PORTRAIT"));
    }
}
