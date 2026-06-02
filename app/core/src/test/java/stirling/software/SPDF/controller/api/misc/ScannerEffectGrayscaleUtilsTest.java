package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScannerEffectGrayscaleUtils} — the pure grayscale conversion extracted from
 * {@link ScannerEffectController}. Expected values are hand-computed from {@code (r + g + b) / 3}.
 */
class ScannerEffectGrayscaleUtilsTest {

    private static int gray(int v) {
        return (v << 16) | (v << 8) | v;
    }

    @Test
    void toGrayPacked_pureColors_averageEachChannel() {
        // pure red 255,0,0 -> (255+0+0)/3 = 85
        assertEquals(gray(85), ScannerEffectGrayscaleUtils.toGrayPacked(0xFF0000));
        // pure green 0,255,0 -> 85
        assertEquals(gray(85), ScannerEffectGrayscaleUtils.toGrayPacked(0x00FF00));
        // pure blue 0,0,255 -> 85
        assertEquals(gray(85), ScannerEffectGrayscaleUtils.toGrayPacked(0x0000FF));
    }

    @Test
    void toGrayPacked_blackWhiteAndMidGray() {
        assertEquals(gray(0), ScannerEffectGrayscaleUtils.toGrayPacked(0x000000));
        assertEquals(gray(255), ScannerEffectGrayscaleUtils.toGrayPacked(0xFFFFFF));
        assertEquals(gray(128), ScannerEffectGrayscaleUtils.toGrayPacked(0x808080));
    }

    @Test
    void toGrayPacked_truncatesTowardZero() {
        // 0+0+1 = 1 / 3 = 0 (integer truncation)
        assertEquals(gray(0), ScannerEffectGrayscaleUtils.toGrayPacked(0x000001));
        // 1+1+1 = 3 / 3 = 1
        assertEquals(gray(1), ScannerEffectGrayscaleUtils.toGrayPacked(0x010101));
        // 10+20+33 = 63 / 3 = 21
        assertEquals(
                gray(21), ScannerEffectGrayscaleUtils.toGrayPacked((10 << 16) | (20 << 8) | 33));
    }

    @Test
    void toGrayPacked_ignoresAlphaBits() {
        // high (alpha) byte set must not affect the result
        assertEquals(
                ScannerEffectGrayscaleUtils.toGrayPacked(0x00808080),
                ScannerEffectGrayscaleUtils.toGrayPacked(0xFF808080));
    }

    @Test
    void convertToGrayscale_appliesPerPixelInPlace() {
        BufferedImage img = new BufferedImage(2, 1, BufferedImage.TYPE_INT_RGB);
        int[] pixels = ((DataBufferInt) img.getRaster().getDataBuffer()).getData();
        pixels[0] = 0xFF0000; // red -> gray 85
        pixels[1] = 0xFFFFFF; // white -> gray 255
        ScannerEffectGrayscaleUtils.convertToGrayscale(img);
        assertEquals(gray(85), pixels[0] & 0xFFFFFF);
        assertEquals(gray(255), pixels[1] & 0xFFFFFF);
    }
}
