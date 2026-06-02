package stirling.software.SPDF.controller.api.misc;

/**
 * Pure render-resolution clamping extracted from {@link ScannerEffectController} so the OOM/DoS
 * guard (which caps the rasterised image dimensions/pixel count for a page) can be unit-tested
 * without rendering. Behaviour is identical to the original private method; the image limits are
 * passed in as parameters rather than read from the controller's constants so the maths is fully
 * pure.
 */
public final class ScannerEffectResolutionUtils {

    private ScannerEffectResolutionUtils() {}

    /**
     * Returns a DPI that keeps the page's projected raster within {@code maxWidth × maxHeight} and
     * {@code maxPixels}. If the requested {@code resolution} already fits it is returned unchanged;
     * otherwise it is scaled down by the tightest of the width/height/pixel ratios, floored at 72
     * DPI.
     *
     * @param pageWidthPts page width in PDF points
     * @param pageHeightPts page height in PDF points
     * @param resolution requested DPI
     * @param maxWidth max projected width in pixels
     * @param maxHeight max projected height in pixels
     * @param maxPixels max projected pixel count
     */
    public static int calculateSafeResolution(
            float pageWidthPts,
            float pageHeightPts,
            int resolution,
            int maxWidth,
            int maxHeight,
            long maxPixels) {
        int projectedWidth = (int) Math.ceil(pageWidthPts * resolution / 72.0);
        int projectedHeight = (int) Math.ceil(pageHeightPts * resolution / 72.0);
        long projectedPixels = (long) projectedWidth * projectedHeight;

        if (projectedWidth <= maxWidth
                && projectedHeight <= maxHeight
                && projectedPixels <= maxPixels) {
            return resolution;
        }

        double widthScale = (double) maxWidth / projectedWidth;
        double heightScale = (double) maxHeight / projectedHeight;
        double pixelScale = Math.sqrt((double) maxPixels / projectedPixels);
        double minScale = Math.min(Math.min(widthScale, heightScale), pixelScale);

        return (int) Math.max(72, resolution * minScale);
    }
}
