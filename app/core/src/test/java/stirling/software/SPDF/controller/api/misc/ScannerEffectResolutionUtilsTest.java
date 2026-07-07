package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ScannerEffectResolutionUtils} — the pure render-resolution clamp (OOM/DoS
 * guard) extracted from {@link ScannerEffectController}. The "within limits" case is asserted
 * exactly; clamping cases are checked by invariant (the re-projected raster must fit the limits) to
 * stay robust against floating-point rounding in the scale computation.
 */
class ScannerEffectResolutionUtilsTest {

    private static final int MAX_W = 8192;
    private static final int MAX_H = 8192;
    private static final long MAX_PX = 16_777_216L; // 4096 x 4096

    private static int projected(float pts, int dpi) {
        return (int) Math.ceil(pts * dpi / 72.0);
    }

    @Test
    void withinLimits_returnsRequestedResolutionUnchanged() {
        // US-Letter (612 x 792 pt) at 72 DPI -> 612 x 792 px, well within limits.
        assertEquals(
                72,
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        612f, 792f, 72, MAX_W, MAX_H, MAX_PX));
        // Still within at a moderate DPI.
        assertEquals(
                150,
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        612f, 792f, 150, MAX_W, MAX_H, MAX_PX));
    }

    @Test
    void overPixelLimit_clampsDownAndResultFits() {
        // 612 x 792 pt at 600 DPI -> 5100 x 6600 px = 33.6M px > 16.7M, must clamp.
        int result =
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        612f, 792f, 600, MAX_W, MAX_H, MAX_PX);
        assertTrue(result >= 72 && result < 600, "clamped into (72, 600): " + result);
        assertResultFits(612f, 792f, result, MAX_W, MAX_H, MAX_PX);
    }

    @Test
    void overWidthLimit_clampsDownAndResultFits() {
        // Very wide page forces the width ratio to dominate.
        int result =
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        5000f, 200f, 300, MAX_W, MAX_H, MAX_PX);
        assertTrue(result >= 72 && result <= 300);
        assertResultFits(5000f, 200f, result, MAX_W, MAX_H, MAX_PX);
    }

    @Test
    void neverGoesBelow72_evenWhenLimitsTiny() {
        // Tiny limits would scale below 72, but the floor pins it at 72.
        int result =
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        720f, 720f, 72, 100, 100, 10_000L);
        assertEquals(72, result);
    }

    @Test
    void exactlyAtLimit_isNotClamped() {
        // Choose a page+DPI projecting to exactly MAX_W x something within MAX_H and MAX_PX.
        // 8192 px wide at 72 DPI needs 8192 pt width; height small so pixels stay under MAX_PX.
        int dpi = 72;
        float widthPt = 8192f; // -> ceil(8192*72/72) = 8192 == MAX_W (boundary, inclusive)
        float heightPt = 1000f; // -> 1000 px; 8192*1000 = 8.192M <= 16.7M
        assertEquals(
                dpi,
                ScannerEffectResolutionUtils.calculateSafeResolution(
                        widthPt, heightPt, dpi, MAX_W, MAX_H, MAX_PX));
    }

    private static void assertResultFits(
            float wPt, float hPt, int dpi, int maxW, int maxH, long maxPx) {
        int pw = projected(wPt, dpi);
        int ph = projected(hPt, dpi);
        long px = (long) pw * ph;
        assertTrue(pw <= maxW, "projected width " + pw + " <= " + maxW);
        assertTrue(ph <= maxH, "projected height " + ph + " <= " + maxH);
        assertTrue(px <= maxPx, "projected pixels " + px + " <= " + maxPx);
    }
}
