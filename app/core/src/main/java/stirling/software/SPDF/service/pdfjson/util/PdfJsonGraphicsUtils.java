package stirling.software.SPDF.service.pdfjson.util;

import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.util.Matrix;

/**
 * Stateless numeric / graphics-state coercion helpers extracted from {@code
 * PdfJsonConversionService} as part of decomposing that ~7k-line god-class (roadmap C1). These
 * convert PDF graphics primitives to/from the JSON-friendly representations used by the conversion
 * pipeline. Behaviour is identical to the original private methods; only the location changed.
 */
public final class PdfJsonGraphicsUtils {

    private PdfJsonGraphicsUtils() {}

    /** Returns {@code value} unless it is null/NaN/infinite, in which case {@code defaultValue}. */
    public static float safeFloat(Float value, float defaultValue) {
        if (value == null || Float.isNaN(value) || Float.isInfinite(value)) {
            return defaultValue;
        }
        return value;
    }

    /** Flattens a PDFBox {@link Matrix} into the 6-element affine array [a, b, c, d, e, f]. */
    public static float[] toMatrixValues(Matrix matrix) {
        return new float[] {
            matrix.getValue(0, 0),
            matrix.getValue(0, 1),
            matrix.getValue(1, 0),
            matrix.getValue(1, 1),
            matrix.getValue(2, 0),
            matrix.getValue(2, 1)
        };
    }

    /**
     * Maps a PDF text rendering-mode integer (0-7) to the PDFBox {@link RenderingMode} enum,
     * returning {@code null} for null input or an out-of-range value.
     */
    public static RenderingMode toRenderingMode(Integer renderingMode) {
        if (renderingMode == null) {
            return null;
        }
        switch (renderingMode) {
            case 0:
                return RenderingMode.FILL;
            case 1:
                return RenderingMode.STROKE;
            case 2:
                return RenderingMode.FILL_STROKE;
            case 3:
                return RenderingMode.NEITHER;
            case 4:
                return RenderingMode.FILL_CLIP;
            case 5:
                return RenderingMode.STROKE_CLIP;
            case 6:
                return RenderingMode.FILL_STROKE_CLIP;
            case 7:
                return RenderingMode.NEITHER_CLIP;
            default:
                return null;
        }
    }
}
