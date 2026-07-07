package stirling.software.SPDF.service.pdfjson.util;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Unit tests for the numeric/graphics-state helpers extracted from PdfJsonConversionService. */
class PdfJsonGraphicsUtilsTest {

    @Test
    void safeFloat_returnsValueWhenFinite() {
        assertEquals(3.5f, PdfJsonGraphicsUtils.safeFloat(3.5f, 99f));
        assertEquals(0.0f, PdfJsonGraphicsUtils.safeFloat(0.0f, 99f));
        assertEquals(-12.25f, PdfJsonGraphicsUtils.safeFloat(-12.25f, 99f));
    }

    @Test
    void safeFloat_returnsDefaultForNullNaNOrInfinite() {
        assertEquals(99f, PdfJsonGraphicsUtils.safeFloat(null, 99f));
        assertEquals(99f, PdfJsonGraphicsUtils.safeFloat(Float.NaN, 99f));
        assertEquals(99f, PdfJsonGraphicsUtils.safeFloat(Float.POSITIVE_INFINITY, 99f));
        assertEquals(99f, PdfJsonGraphicsUtils.safeFloat(Float.NEGATIVE_INFINITY, 99f));
    }

    @Test
    void toMatrixValues_flattensAffineComponentsInOrder() {
        Matrix matrix = new Matrix(1f, 2f, 3f, 4f, 5f, 6f);

        float[] values = PdfJsonGraphicsUtils.toMatrixValues(matrix);

        assertArrayEquals(new float[] {1f, 2f, 3f, 4f, 5f, 6f}, values, 0.0f);
    }

    @ParameterizedTest
    @CsvSource({
        "0, FILL",
        "1, STROKE",
        "2, FILL_STROKE",
        "3, NEITHER",
        "4, FILL_CLIP",
        "5, STROKE_CLIP",
        "6, FILL_STROKE_CLIP",
        "7, NEITHER_CLIP",
    })
    void toRenderingMode_mapsEachCode(int code, RenderingMode expected) {
        assertEquals(expected, PdfJsonGraphicsUtils.toRenderingMode(code));
    }

    @Test
    void toRenderingMode_nullReturnsNull() {
        assertNull(PdfJsonGraphicsUtils.toRenderingMode(null));
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 8, 100, Integer.MIN_VALUE, Integer.MAX_VALUE})
    void toRenderingMode_outOfRangeReturnsNull(int code) {
        assertNull(PdfJsonGraphicsUtils.toRenderingMode(code));
    }
}
