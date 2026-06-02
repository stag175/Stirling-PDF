package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.Color;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScannerEffectGradientUtils} — the pure gradient LUT maths extracted from
 * {@link ScannerEffectController}. Expected packed-RGB values are hand-computed.
 */
class ScannerEffectGradientUtilsTest {

    @Test
    void verticalGradient_blackToWhite_interpolatesWithHalfUpRounding() {
        // size = height = 3; fracs 0, 0.5, 1.0. Midpoint rounds 127.5 -> 128.
        int[] lut =
                ScannerEffectGradientUtils.createGradientLUT(2, 3, true, Color.BLACK, Color.WHITE);
        assertArrayEquals(new int[] {0x000000, 0x808080, 0xFFFFFF}, lut);
    }

    @Test
    void horizontalGradient_usesWidthAsSize_singleChannel() {
        // size = width = 4; blue 0..255 at fracs 0, 1/3, 2/3, 1 -> 0, 85, 170, 255.
        int[] lut =
                ScannerEffectGradientUtils.createGradientLUT(
                        4, 2, false, Color.BLACK, new Color(0, 0, 255));
        assertArrayEquals(new int[] {0x000000, 0x000055, 0x0000AA, 0x0000FF}, lut);
    }

    @Test
    void sizeOne_noDivideByZero_yieldsStartColor() {
        // width 1 horizontal => size 1 => max(1, size-1) guards the division; entry is the start.
        int[] lut =
                ScannerEffectGradientUtils.createGradientLUT(
                        1, 5, false, new Color(12, 34, 56), Color.WHITE);
        assertEquals(1, lut.length);
        assertEquals((12 << 16) | (34 << 8) | 56, lut[0]);
    }

    @Test
    void createGradientLUT_endColorReachedExactlyAtLastEntry() {
        int[] lut =
                ScannerEffectGradientUtils.createGradientLUT(
                        3, 2, false, Color.BLACK, new Color(255, 128, 0));
        assertEquals(0x000000, lut[0]);
        assertEquals(0xFF8000, lut[lut.length - 1]);
    }

    @Test
    void fillWithGradient_vertical_floodsEachRowWithItsLutEntry() {
        int width = 2;
        int height = 3;
        int[] pixels = new int[width * height];
        int[] lut = {10, 20, 30};
        ScannerEffectGradientUtils.fillWithGradient(pixels, width, height, lut, true);
        assertArrayEquals(new int[] {10, 10, 20, 20, 30, 30}, pixels);
    }

    @Test
    void fillWithGradient_horizontal_copiesLutIntoEachRow() {
        int width = 3;
        int height = 2;
        int[] pixels = new int[width * height];
        int[] lut = {1, 2, 3};
        ScannerEffectGradientUtils.fillWithGradient(pixels, width, height, lut, false);
        assertArrayEquals(new int[] {1, 2, 3, 1, 2, 3}, pixels);
    }
}
