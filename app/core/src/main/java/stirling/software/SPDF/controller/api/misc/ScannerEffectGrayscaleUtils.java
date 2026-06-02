package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;

/**
 * Pure grayscale conversion extracted from {@link ScannerEffectController}. The per-pixel transform
 * {@link #toGrayPacked(int)} is a pure int→int function (unit-testable without an image), and
 * {@link #convertToGrayscale(BufferedImage)} applies it in place over a {@code TYPE_INT_RGB}
 * raster. Behaviour is identical to the original private method (simple-average grayscale, alpha
 * ignored).
 */
public final class ScannerEffectGrayscaleUtils {

    private ScannerEffectGrayscaleUtils() {}

    /**
     * Returns the packed {@code 0xRRGGBB} value of the simple-average grayscale of {@code rgb}
     * ({@code gray = (r + g + b) / 3}, integer truncation; alpha bits ignored).
     */
    public static int toGrayPacked(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        int gray = (r + g + b) / 3;
        return (gray << 16) | (gray << 8) | gray;
    }

    /**
     * Converts a {@code TYPE_INT_RGB} image to grayscale in place via {@link #toGrayPacked(int)}.
     */
    public static void convertToGrayscale(BufferedImage image) {
        int[] pixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        for (int i = 0; i < pixels.length; i++) {
            pixels[i] = toGrayPacked(pixels[i]);
        }
    }
}
