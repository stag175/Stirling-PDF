package stirling.software.SPDF.controller.api.misc;

import java.awt.Color;
import java.util.Arrays;

/**
 * Pure gradient lookup-table maths extracted from {@link ScannerEffectController} so the RGB
 * interpolation and the per-row pixel fill can be unit-tested without constructing AWT images.
 * Behaviour is identical to the original private methods (parameters are decomposed from the
 * controller's {@code GradientConfig} record to avoid a nestmate dependency).
 *
 * <p>Each LUT entry is a packed {@code 0xRRGGBB} int (no alpha), suitable for writing straight into
 * a {@code TYPE_INT_RGB} raster's backing array.
 */
public final class ScannerEffectGradientUtils {

    private ScannerEffectGradientUtils() {}

    /**
     * Builds a linear gradient lookup table from {@code startColor} to {@code endColor}. The table
     * length is {@code height} for a vertical gradient or {@code width} for a horizontal one; entry
     * {@code i} is the colour at fraction {@code i / (size - 1)} (the lone entry of a size-1 table
     * is {@code startColor}).
     */
    public static int[] createGradientLUT(
            int width, int height, boolean vertical, Color startColor, Color endColor) {
        int size = vertical ? height : width;
        int[] lut = new int[size];

        int rStart = startColor.getRed();
        int gStart = startColor.getGreen();
        int bStart = startColor.getBlue();
        int rDiff = endColor.getRed() - rStart;
        int gDiff = endColor.getGreen() - gStart;
        int bDiff = endColor.getBlue() - bStart;

        for (int i = 0; i < size; i++) {
            float frac = (float) i / Math.max(1, size - 1);
            int r = Math.round(rStart + rDiff * frac);
            int g = Math.round(gStart + gDiff * frac);
            int b = Math.round(bStart + bDiff * frac);
            lut[i] = (r << 16) | (g << 8) | b;
        }

        return lut;
    }

    /**
     * Fills the {@code width × height} {@code pixels} raster from {@code gradientLUT}. For a
     * vertical gradient each row {@code y} is flooded with {@code gradientLUT[y]}; for a horizontal
     * gradient the whole LUT is copied into each row.
     */
    public static void fillWithGradient(
            int[] pixels, int width, int height, int[] gradientLUT, boolean vertical) {
        if (vertical) {
            for (int y = 0; y < height; y++) {
                Arrays.fill(pixels, y * width, (y + 1) * width, gradientLUT[y]);
            }
        } else {
            for (int y = 0; y < height; y++) {
                System.arraycopy(gradientLUT, 0, pixels, y * width, width);
            }
        }
    }
}
