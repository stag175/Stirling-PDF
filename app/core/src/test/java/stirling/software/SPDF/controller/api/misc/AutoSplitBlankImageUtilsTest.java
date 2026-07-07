package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AutoSplitBlankImageUtilsTest {

    @Test
    @DisplayName("empty pixel array is treated as blank")
    void emptyIsBlank() {
        assertTrue(AutoSplitBlankImageUtils.isBlankImage(new int[0]));
    }

    @Test
    @DisplayName("a single pixel is blank (nothing to compare against)")
    void singlePixelIsBlank() {
        assertTrue(AutoSplitBlankImageUtils.isBlankImage(new int[] {0xFFFFFF}));
    }

    @Test
    @DisplayName("a uniform image is blank")
    void uniformIsBlank() {
        int[] pixels = new int[100];
        Arrays.fill(pixels, 7);
        assertTrue(AutoSplitBlankImageUtils.isBlankImage(pixels));
    }

    @Test
    @DisplayName("a differing pixel at a sampled position is detected (not blank)")
    void sampledDifferenceIsDetected() {
        // length 40 -> step = 40/20 = 2 -> samples indices 2,4,6,...; index 2 is sampled.
        int[] pixels = new int[40];
        pixels[2] = 9;
        assertFalse(AutoSplitBlankImageUtils.isBlankImage(pixels));
    }

    @Test
    @DisplayName("a differing pixel between sample points is intentionally NOT detected")
    void unsampledDifferenceIsMissed() {
        // length 40 -> step 2 -> only even indices sampled; index 1 is never compared.
        int[] pixels = new int[40];
        pixels[1] = 9;
        assertTrue(AutoSplitBlankImageUtils.isBlankImage(pixels));
    }

    @Test
    @DisplayName("a differing first pixel makes the rest mismatch -> not blank")
    void differingFirstPixelIsNotBlank() {
        int[] pixels = new int[40]; // all zero
        pixels[0] = 9; // first differs; sampled zeros != 9
        assertFalse(AutoSplitBlankImageUtils.isBlankImage(pixels));
    }

    @Test
    @DisplayName("small images (< sample count) check every pixel")
    void smallImagesCheckEveryPixel() {
        // length 5 -> step = max(1, 5/20=0) = 1 -> samples indices 1..4 (all of them).
        int[] pixels = {0, 0, 0, 9, 0};
        assertFalse(AutoSplitBlankImageUtils.isBlankImage(pixels));
    }
}
