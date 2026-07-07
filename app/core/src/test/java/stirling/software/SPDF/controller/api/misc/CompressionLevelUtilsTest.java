package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link CompressionLevelUtils} — the pure compression-level tuning maths extracted
 * from {@link CompressController}. Expected values are read straight from the original
 * switch/ladder.
 */
class CompressionLevelUtilsTest {

    // ---- getScaleFactorForLevel -------------------------------------------

    @Test
    void scaleFactor_perLevelAndDefault() {
        assertEquals(0.98, CompressionLevelUtils.getScaleFactorForLevel(1), 1e-9);
        assertEquals(0.68, CompressionLevelUtils.getScaleFactorForLevel(5), 1e-9);
        assertEquals(0.28, CompressionLevelUtils.getScaleFactorForLevel(9), 1e-9);
        // out-of-range levels fall back to 1.0 (no scaling)
        assertEquals(1.0, CompressionLevelUtils.getScaleFactorForLevel(0), 1e-9);
        assertEquals(1.0, CompressionLevelUtils.getScaleFactorForLevel(10), 1e-9);
        assertEquals(1.0, CompressionLevelUtils.getScaleFactorForLevel(-1), 1e-9);
    }

    @Test
    void scaleFactor_monotonicNonIncreasingOverLevels() {
        double prev = CompressionLevelUtils.getScaleFactorForLevel(1);
        for (int level = 2; level <= 9; level++) {
            double cur = CompressionLevelUtils.getScaleFactorForLevel(level);
            org.junit.jupiter.api.Assertions.assertTrue(cur < prev, "scale must shrink with level");
            prev = cur;
        }
    }

    // ---- getJpegQualityForLevel -------------------------------------------

    @Test
    void jpegQuality_perLevelAndDefault() {
        assertEquals(0.92f, CompressionLevelUtils.getJpegQualityForLevel(1), 1e-6f);
        assertEquals(0.72f, CompressionLevelUtils.getJpegQualityForLevel(5), 1e-6f);
        assertEquals(0.35f, CompressionLevelUtils.getJpegQualityForLevel(9), 1e-6f);
        assertEquals(0.75f, CompressionLevelUtils.getJpegQualityForLevel(0), 1e-6f);
        assertEquals(0.75f, CompressionLevelUtils.getJpegQualityForLevel(42), 1e-6f);
    }

    // ---- determineOptimizeLevel -------------------------------------------

    @Test
    void determineLevel_acrossRatioLadder() {
        assertEquals(1, CompressionLevelUtils.determineOptimizeLevel(0.95));
        assertEquals(2, CompressionLevelUtils.determineOptimizeLevel(0.85));
        assertEquals(3, CompressionLevelUtils.determineOptimizeLevel(0.75));
        assertEquals(4, CompressionLevelUtils.determineOptimizeLevel(0.65));
        assertEquals(5, CompressionLevelUtils.determineOptimizeLevel(0.5));
        assertEquals(6, CompressionLevelUtils.determineOptimizeLevel(0.25));
        assertEquals(7, CompressionLevelUtils.determineOptimizeLevel(0.18));
        assertEquals(8, CompressionLevelUtils.determineOptimizeLevel(0.12));
        assertEquals(9, CompressionLevelUtils.determineOptimizeLevel(0.05));
    }

    @Test
    void determineLevel_boundariesAreExclusiveUpper() {
        // ladder uses strict > comparisons, so exact boundary falls to the next bucket
        assertEquals(2, CompressionLevelUtils.determineOptimizeLevel(0.9));
        assertEquals(9, CompressionLevelUtils.determineOptimizeLevel(0.1));
    }

    // ---- incrementOptimizeLevel -------------------------------------------

    @Test
    void increment_jumpScalesWithOversizeRatio() {
        assertEquals(
                6, CompressionLevelUtils.incrementOptimizeLevel(3, 300, 100)); // ratio 3.0 -> +3
        assertEquals(
                5, CompressionLevelUtils.incrementOptimizeLevel(3, 160, 100)); // ratio 1.6 -> +2
        assertEquals(
                4, CompressionLevelUtils.incrementOptimizeLevel(3, 120, 100)); // ratio 1.2 -> +1
        assertEquals(
                6, CompressionLevelUtils.incrementOptimizeLevel(5, 80, 100)); // under target -> +1
    }

    @Test
    void increment_capsAtNine() {
        assertEquals(
                9, CompressionLevelUtils.incrementOptimizeLevel(8, 300, 100)); // 8+3 capped to 9
        assertEquals(
                9, CompressionLevelUtils.incrementOptimizeLevel(9, 110, 100)); // 9+1 capped to 9
    }

    @Test
    void increment_zeroTargetDoesNotThrow_treatedAsHeavilyOversized() {
        // currentSize/0.0 == Infinity > 2.0 -> +3 path, no ArithmeticException for double division
        assertEquals(6, CompressionLevelUtils.incrementOptimizeLevel(3, 100, 0));
    }
}
