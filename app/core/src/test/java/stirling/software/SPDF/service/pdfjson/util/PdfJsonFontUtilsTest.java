package stirling.software.SPDF.service.pdfjson.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

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
}
