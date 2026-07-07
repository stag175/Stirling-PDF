package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure saddle-stitch booklet-imposition arithmetic extracted from {@link
 * BookletImpositionController} so the (off-by-one-prone) sheet/side page ordering can be
 * unit-tested without PDFBox. Behaviour is identical to the original private methods.
 *
 * <p>Page indices are 0-based; {@code -1} marks a blank cell (padding pages added to reach a
 * multiple of 4). Each {@link Side} is one printed face holding a {@code left} and {@code right}
 * page.
 */
public final class BookletImpositionUtils {

    private BookletImpositionUtils() {}

    /** One printed face of a folded sheet: a left page, a right page, and front/back marker. */
    public record Side(int left, int right, boolean isBack) {}

    /** Rounds {@code n} up to the next multiple of 4 (a booklet needs 4 pages per sheet). */
    public static int padToMultipleOf4(int n) {
        return (n + 3) / 4 * 4;
    }

    /**
     * Computes the saddle-stitch imposition order: for each folded sheet, the front face pairs the
     * last and first remaining pages and the back face the next inner pair, walking inward. Indices
     * at or beyond {@code totalPagesOriginal} become {@code -1} (blank padding).
     *
     * @param totalPagesOriginal real page count before padding
     * @param doubleSided whether the job is duplex (affects the short-edge swap)
     * @param duplexPass {@code "BOTH"} | {@code "FIRST"} (fronts only) | {@code "SECOND"} (backs
     *     only)
     * @param flipOnShortEdge when duplex + short-edge, the back face's left/right are swapped
     */
    public static List<Side> saddleStitchSides(
            int totalPagesOriginal,
            boolean doubleSided,
            String duplexPass,
            boolean flipOnShortEdge) {
        int N = padToMultipleOf4(totalPagesOriginal);
        List<Side> out = new ArrayList<>();
        int sheets = N / 4;

        for (int s = 0; s < sheets; s++) {
            int a = N - 1 - (s * 2); // left, front
            int b = (s * 2); // right, front
            int c = (s * 2) + 1; // left, back
            int d = N - 2 - (s * 2); // right, back

            // clamp to -1 (blank) if >= totalPagesOriginal
            a = (a < totalPagesOriginal) ? a : -1;
            b = (b < totalPagesOriginal) ? b : -1;
            c = (c < totalPagesOriginal) ? c : -1;
            d = (d < totalPagesOriginal) ? d : -1;

            // Handle duplex pass selection
            boolean includeFront = "BOTH".equals(duplexPass) || "FIRST".equals(duplexPass);
            boolean includeBack = "BOTH".equals(duplexPass) || "SECOND".equals(duplexPass);

            if (includeFront) {
                out.add(new Side(a, b, false)); // front side
            }

            if (includeBack) {
                // For short-edge duplex, swap back-side left/right
                // Note: flipOnShortEdge is ignored in manual duplex mode since users physically
                // flip the stack
                if (doubleSided && flipOnShortEdge) {
                    out.add(new Side(d, c, true)); // swapped back side (automatic duplex only)
                } else {
                    out.add(new Side(c, d, true)); // normal back side
                }
            }
        }
        return out;
    }
}
