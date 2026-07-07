package stirling.software.SPDF.controller.api;

import java.util.HashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.common.PDRectangle;

import stirling.software.common.util.ExceptionUtils;

/**
 * Pure named-page-size resolution extracted from {@link ScalePagesController} so the size lookup
 * and the landscape orientation swap can be unit-tested without a PDF. Behaviour is identical to
 * the original private methods (the controller still handles the {@code "KEEP"} case, which needs
 * the source document).
 */
public final class ScalePagesSizeUtils {

    private ScalePagesSizeUtils() {}

    /**
     * Resolves a named page size (e.g. {@code "A4"}, {@code "LETTER"}) to a {@link PDRectangle},
     * swapping width/height when {@code orientation} is {@code "LANDSCAPE"} (case-insensitive; a
     * {@code null}/other orientation yields portrait). Throws for an unknown size name.
     */
    public static PDRectangle resolveNamedSize(String targetPDRectangle, String orientation) {
        PDRectangle base = sizeMap().get(targetPDRectangle);
        if (base == null) {
            throw ExceptionUtils.createInvalidPageSizeException(targetPDRectangle);
        }

        if ("LANDSCAPE".equalsIgnoreCase(orientation)) {
            return new PDRectangle(base.getHeight(), base.getWidth());
        }
        return base;
    }

    private static Map<String, PDRectangle> sizeMap() {
        Map<String, PDRectangle> sizeMap = new HashMap<>();
        sizeMap.put("A0", PDRectangle.A0);
        sizeMap.put("A1", PDRectangle.A1);
        sizeMap.put("A2", PDRectangle.A2);
        sizeMap.put("A3", PDRectangle.A3);
        sizeMap.put("A4", PDRectangle.A4);
        sizeMap.put("A5", PDRectangle.A5);
        sizeMap.put("A6", PDRectangle.A6);
        sizeMap.put("LETTER", PDRectangle.LETTER);
        sizeMap.put("LEGAL", PDRectangle.LEGAL);
        return sizeMap;
    }
}
