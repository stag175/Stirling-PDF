package stirling.software.SPDF.service.pdfjson.util;

import java.util.Locale;

/**
 * Stateless, pure helpers extracted from {@code PdfJsonConversionService} as the first step of
 * decomposing that ~7k-line god-class (roadmap C1). This class is the landing zone for low-level,
 * side-effect-free font/encoding helpers that have no dependency on conversion-service instance
 * state; grow it as further pure clusters are pulled out of the service.
 *
 * <p>Behaviour is identical to the original private methods; only the location changed, so the
 * helpers can be unit-tested in isolation.
 */
public final class PdfJsonFontUtils {

    private PdfJsonFontUtils() {}

    /** Returns true when the font program format string denotes a Type1 / PFB program. */
    public static boolean isType1Format(String format) {
        if (format == null) {
            return false;
        }
        return "type1".equals(format) || format.endsWith("pfb");
    }

    /**
     * Returns true when the font program format string denotes a CFF / Type1C / CIDFontType0C
     * program.
     */
    public static boolean isCffFormat(String format) {
        if (format == null) {
            return false;
        }
        String normalized = format.toLowerCase(Locale.ROOT);
        return normalized.contains("type1c")
                || normalized.contains("cidfonttype0c")
                || "cff".equals(normalized);
    }

    /**
     * Parse a hex string from a PDF ToUnicode CMap into a single Unicode codepoint. Handles three
     * cases: a single BMP code unit (4 hex chars), a UTF-16 surrogate pair encoding a supplementary
     * codepoint above U+FFFF (8 hex chars, e.g. {@code D837DF0E} for U+1F40E), and multi-codepoint
     * mappings (longer; returns the first codepoint as a best-effort representative).
     *
     * <p>Without this, {@code Integer.parseInt("D837DF0E", 16)} overflows because the value is ~3.6
     * billion, throwing {@link NumberFormatException} and forcing the conversion to fall back to a
     * raw ToUnicode payload that the JSON&rarr;PDF rebuild then fails to use efficiently.
     */
    public static int parseToUnicodeCodepoint(String hex) {
        if (hex == null || hex.isEmpty()) {
            throw new NumberFormatException("Empty ToUnicode hex value");
        }
        if (hex.length() <= 4) {
            return Integer.parseInt(hex, 16);
        }
        // Treat the hex string as UTF-16BE: pairs of hex digits form bytes, four hex digits form
        // one UTF-16 code unit. The PDF ToUnicode CMap convention requires an even number of bytes
        // (i.e. a multiple of four hex characters) for multi-unit values.
        if (hex.length() % 4 != 0) {
            throw new NumberFormatException(
                    "ToUnicode hex value not a multiple of 4 chars: " + hex);
        }
        int unitCount = hex.length() / 4;
        char[] units = new char[unitCount];
        for (int i = 0; i < unitCount; i++) {
            units[i] = (char) Integer.parseInt(hex.substring(i * 4, i * 4 + 4), 16);
        }
        // codePointAt assembles a surrogate pair into a supplementary codepoint when the
        // high/low surrogates appear in sequence; for any other multi-unit sequence it returns
        // the first BMP codepoint, which is the right best-effort fallback for ligature
        // decompositions (one charCode -> several Unicode chars).
        return new String(units).codePointAt(0);
    }
}
