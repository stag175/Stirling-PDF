package stirling.software.SPDF.controller.api.misc;

import java.util.Locale;

import lombok.extern.slf4j.Slf4j;

/**
 * Pure compression-level tuning maths extracted from {@link CompressController} so the level→scale,
 * level→JPEG-quality, target-ratio→level, and level-increment policies can be unit-tested directly.
 * Behaviour is identical to the original private methods.
 *
 * <p>Optimisation levels run 1 (lightest) … 9 (most aggressive).
 */
@Slf4j
public final class CompressionLevelUtils {

    private CompressionLevelUtils() {}

    /** Image down-scaling factor for a level (1.0 = no resize; smaller = more shrink). */
    public static double getScaleFactorForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 1 -> 0.98; // negligible resizing
            case 2 -> 0.95;
            case 3 -> 0.88;
            case 4 -> 0.78;
            case 5 -> 0.68;
            case 6 -> 0.58;
            case 7 -> 0.48;
            case 8 -> 0.38;
            case 9 -> 0.28;
            default -> 1.0;
        };
    }

    /** JPEG re-encode quality for a level (1.0 = best; lower = smaller/lossier). */
    public static float getJpegQualityForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 1 -> 0.92f; // very light
            case 2 -> 0.88f;
            case 3 -> 0.85f;
            case 4 -> 0.80f;
            case 5 -> 0.72f;
            case 6 -> 0.65f;
            case 7 -> 0.55f;
            case 8 -> 0.45f;
            case 9 -> 0.35f; // aggressive
            default -> 0.75f;
        };
    }

    /**
     * Picks a starting optimisation level from the requested size-reduction ratio
     * (target/original): a ratio near 1 needs little compression (low level); a small ratio needs
     * aggressive compression (high level).
     */
    public static int determineOptimizeLevel(double sizeReductionRatio) {
        if (sizeReductionRatio > 0.9) return 1;
        if (sizeReductionRatio > 0.8) return 2;
        if (sizeReductionRatio > 0.7) return 3;
        if (sizeReductionRatio > 0.6) return 4;
        if (sizeReductionRatio > 0.3) return 5;
        if (sizeReductionRatio > 0.2) return 6;
        if (sizeReductionRatio > 0.15) return 7;
        if (sizeReductionRatio > 0.1) return 8;
        return 9;
    }

    /**
     * Escalates the optimisation level when a pass is still over the target size: the further over
     * (currentSize/targetSize), the bigger the jump, capped at 9.
     */
    public static int incrementOptimizeLevel(int currentLevel, long currentSize, long targetSize) {
        double currentRatio = currentSize / (double) targetSize;
        log.info("Current compression ratio: {}", String.format(Locale.ROOT, "%.2f", currentRatio));

        if (currentRatio > 2.0) {
            return Math.min(9, currentLevel + 3);
        } else if (currentRatio > 1.5) {
            return Math.min(9, currentLevel + 2);
        }
        return Math.min(9, currentLevel + 1);
    }
}
