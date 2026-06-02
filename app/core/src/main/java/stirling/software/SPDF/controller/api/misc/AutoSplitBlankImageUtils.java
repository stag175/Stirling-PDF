package stirling.software.SPDF.controller.api.misc;

/**
 * Pure blank-image heuristic lifted out of {@link AutoSplitPdfController} so the sampling logic
 * (and its deliberate "only sample evenly-spaced pixels" trade-off) can be unit-tested in
 * isolation.
 */
public final class AutoSplitBlankImageUtils {

    private AutoSplitBlankImageUtils() {}

    /** Number of evenly-spaced samples used to judge blankness. */
    static final int BLANK_CHECK_SAMPLES = 20;

    /**
     * Quick check whether an image appears to be blank (single solid colour). Samples pixels at
     * evenly-spaced positions — if all samples match the first pixel the image is almost certainly
     * blank (e.g. a masked image that returned solid white). Because only ~{@value
     * #BLANK_CHECK_SAMPLES} positions are sampled, a lone differing pixel between sample points is
     * intentionally not detected. Pure.
     */
    public static boolean isBlankImage(int[] pixels) {
        if (pixels.length == 0) return true;
        int first = pixels[0];
        int step = Math.max(1, pixels.length / BLANK_CHECK_SAMPLES);
        for (int i = step; i < pixels.length; i += step) {
            if (pixels[i] != first) {
                return false;
            }
        }
        return true;
    }
}
