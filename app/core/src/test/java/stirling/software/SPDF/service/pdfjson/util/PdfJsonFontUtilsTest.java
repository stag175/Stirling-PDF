package stirling.software.SPDF.service.pdfjson.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonFontConversionStatus;

/**
 * Unit tests for the font-format classifiers in {@link PdfJsonFontUtils}, extracted from
 * PdfJsonConversionService. (parseToUnicodeCodepoint is covered by
 * PdfJsonConversionServiceUnicodeParsingTest.)
 */
class PdfJsonFontUtilsTest {

    @Test
    void isType1Format_trueForType1AndPfb() {
        assertTrue(PdfJsonFontUtils.isType1Format("type1"));
        assertTrue(PdfJsonFontUtils.isType1Format("pfb"));
        assertTrue(PdfJsonFontUtils.isType1Format("MyFont.pfb"));
    }

    @Test
    void isType1Format_falseForNullEmptyAndOthers() {
        assertFalse(PdfJsonFontUtils.isType1Format(null));
        assertFalse(PdfJsonFontUtils.isType1Format(""));
        // case-sensitive equals: only lowercase "type1" matches
        assertFalse(PdfJsonFontUtils.isType1Format("TYPE1"));
        assertFalse(PdfJsonFontUtils.isType1Format("Type1"));
        // type1c is a CFF format, not Type1
        assertFalse(PdfJsonFontUtils.isType1Format("type1c"));
        assertFalse(PdfJsonFontUtils.isType1Format("cff"));
        assertFalse(PdfJsonFontUtils.isType1Format("truetype"));
    }

    @Test
    void isCffFormat_trueForCffType1cAndCidVariants_caseInsensitive() {
        assertTrue(PdfJsonFontUtils.isCffFormat("cff"));
        assertTrue(PdfJsonFontUtils.isCffFormat("CFF"));
        assertTrue(PdfJsonFontUtils.isCffFormat("type1c"));
        assertTrue(PdfJsonFontUtils.isCffFormat("Type1C"));
        assertTrue(PdfJsonFontUtils.isCffFormat("cidfonttype0c"));
        assertTrue(PdfJsonFontUtils.isCffFormat("CIDFontType0C"));
        // substring matches anywhere for the "contains" variants
        assertTrue(PdfJsonFontUtils.isCffFormat("embedded-type1c-program"));
    }

    @Test
    void isCffFormat_falseForNullEmptyAndNonCff() {
        assertFalse(PdfJsonFontUtils.isCffFormat(null));
        assertFalse(PdfJsonFontUtils.isCffFormat(""));
        assertFalse(PdfJsonFontUtils.isCffFormat("type1"));
        assertFalse(PdfJsonFontUtils.isCffFormat("truetype"));
        // exact-equals branch for "cff" does not tolerate trailing whitespace
        assertFalse(PdfJsonFontUtils.isCffFormat("cff "));
    }

    @Test
    void conversionStatusPriority_ordersSuccessThenWarningThenOther() {
        for (PdfJsonFontConversionStatus status : PdfJsonFontConversionStatus.values()) {
            int priority = PdfJsonFontUtils.conversionStatusPriority(status);
            switch (status) {
                case SUCCESS -> assertEquals(0, priority);
                case WARNING -> assertEquals(1, priority);
                default -> assertEquals(2, priority);
            }
        }
    }

    @Test
    void isGlyphCoveredByType3Font_nullOrEmptyCoverageCoversEverything() {
        assertTrue(PdfJsonFontUtils.isGlyphCoveredByType3Font(null, 65));
        assertTrue(PdfJsonFontUtils.isGlyphCoveredByType3Font(Set.of(), 65));
    }

    @Test
    void isGlyphCoveredByType3Font_directAndPrivateUseMapping() {
        assertTrue(PdfJsonFontUtils.isGlyphCoveredByType3Font(Set.of(65), 65));
        // a low byte is also covered via the 0xF000 private-use mapping PDFBox uses for Type3
        assertTrue(PdfJsonFontUtils.isGlyphCoveredByType3Font(Set.of(0xF041), 0x41));
        assertFalse(PdfJsonFontUtils.isGlyphCoveredByType3Font(Set.of(66), 65));
        // codepoints above 0xFF have no private-use fallback
        assertFalse(PdfJsonFontUtils.isGlyphCoveredByType3Font(Set.of(1), 0x1234));
    }

    @Test
    void fontFormatPreference_ranksKnownFormatsAndDefaults() {
        assertEquals(5, PdfJsonFontUtils.fontFormatPreference(null, "origin"));
        assertEquals(0, PdfJsonFontUtils.fontFormatPreference("ttf", "o"));
        assertEquals(1, PdfJsonFontUtils.fontFormatPreference("truetype", "o"));
        assertEquals(2, PdfJsonFontUtils.fontFormatPreference("otf", "o"));
        assertEquals(2, PdfJsonFontUtils.fontFormatPreference("cff", "o"));
        assertEquals(2, PdfJsonFontUtils.fontFormatPreference("type1c", "o"));
        assertEquals(2, PdfJsonFontUtils.fontFormatPreference("cidfonttype0c", "o"));
        assertEquals(4, PdfJsonFontUtils.fontFormatPreference("woff2", "o"));
    }
}
