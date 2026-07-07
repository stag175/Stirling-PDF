package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins ScannerEffectController.calculateRotation — the per-page skew used by the scanner effect.
 * The output is randomised, so the invariants tested are the deterministic shortcuts and the
 * variance envelope: rotation must stay within {@code [base - variance, base + variance)} so a
 * sign/scaling regression can't fling pages past the requested skew.
 */
class ScannerEffectRotationTest {

    @Test
    @DisplayName("zero base and zero variance short-circuits to exactly 0")
    void zeroBaseZeroVariance() {
        assertEquals(0.0, ScannerEffectController.calculateRotation(0, 0));
    }

    @Test
    @DisplayName("zero variance pins the rotation to exactly the base angle")
    void zeroVarianceIsExactlyBase() {
        // base != 0 skips the shortcut, but (rand*2-1)*0 == 0, so the result is exactly the base.
        assertEquals(45.0, ScannerEffectController.calculateRotation(45, 0));
        assertEquals(-30.0, ScannerEffectController.calculateRotation(-30, 0));
    }

    @Test
    @DisplayName("rotation stays within the [base-variance, base+variance) envelope")
    void rotationWithinVarianceEnvelope() {
        final int base = 10;
        final int variance = 5;
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < 1000; i++) {
            double r = ScannerEffectController.calculateRotation(base, variance);
            assertTrue(r >= base - variance, "below envelope: " + r);
            assertTrue(r < base + variance, "at/above envelope: " + r);
            min = Math.min(min, r);
            max = Math.max(max, r);
        }
        // Over 1000 samples it should actually vary (not stuck on a constant).
        assertTrue(max > min, "expected variation across samples");
    }

    @Test
    @DisplayName("variance applies symmetrically around a zero base")
    void symmetricAroundZeroBase() {
        for (int i = 0; i < 1000; i++) {
            double r = ScannerEffectController.calculateRotation(0, 3);
            assertTrue(r >= -3 && r < 3, "outside [-3,3): " + r);
        }
    }
}
