package stirling.software.SPDF.service.pdfjson.util;

import java.util.Locale;
import java.util.Set;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;

/**
 * Stateless, pure helpers extracted from {@code PdfJsonConversionService} as the first step of
 * decomposing that ~7k-line god-class (roadmap C1). This class is the landing zone for low-level,
 * side-effect-free font/encoding helpers that have no dependency on conversion-service instance
 * state; grow it as further pure clusters are pulled out of the service.
 *
 * <p>Behaviour is identical to the original private methods; only the location changed, so the
 * helpers can be unit-tested in isolation.
 */
@Slf4j
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

    /**
     * Priority for a font conversion status (lower = preferred): SUCCESS &lt; WARNING &lt; other.
     */
    public static int conversionStatusPriority(PdfJsonFontConversionStatus status) {
        return switch (status) {
            case SUCCESS -> 0;
            case WARNING -> 1;
            default -> 2;
        };
    }

    /**
     * Returns true if the Type3 glyph {@code coverage} set covers {@code codePoint}. An empty/null
     * coverage means "covers everything"; low bytes are also matched against the 0xF000 private-use
     * range PDFBox uses for Type3 glyphs.
     */
    public static boolean isGlyphCoveredByType3Font(Set<Integer> coverage, int codePoint) {
        if (coverage == null || coverage.isEmpty()) {
            return true;
        }
        if (coverage.contains(codePoint)) {
            return true;
        }
        if (codePoint >= 0 && codePoint <= 0xFF) {
            return coverage.contains(0xF000 | (codePoint & 0xFF));
        }
        return false;
    }

    /** Preference ranking (lower = preferred) for embedding a given font program format. */
    public static int fontFormatPreference(String format, String origin) {
        if (format == null) {
            return 5;
        }
        switch (format) {
            case "ttf":
                return 0;
            case "truetype":
                return 1;
            case "otf":
            case "cff":
            case "type1c":
            case "cidfonttype0c":
                return 2;
            default:
                log.debug("[FONT-DEBUG] Unknown font format '{}' from {}", format, origin);
                return 4;
        }
    }
}
