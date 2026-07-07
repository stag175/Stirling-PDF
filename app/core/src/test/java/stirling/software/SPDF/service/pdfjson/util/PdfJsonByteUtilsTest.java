package stirling.software.SPDF.service.pdfjson.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Unit tests for the byte helpers extracted from PdfJsonConversionService. (countCodesProtected and
 * CodeReader are covered by PdfJsonConversionServiceUnicodeParsingTest.)
 */
class PdfJsonByteUtilsTest {

    @Test
    void isStrippedControlByte_nulIsStripped() {
        assertTrue(PdfJsonByteUtils.isStrippedControlByte((byte) 0x00));
    }

    @ParameterizedTest
    @ValueSource(ints = {0x09, 0x0A, 0x0D})
    void isStrippedControlByte_tabLfCrAreKept(int b) {
        assertFalse(PdfJsonByteUtils.isStrippedControlByte((byte) b));
    }

    @ParameterizedTest
    @ValueSource(ints = {0x01, 0x07, 0x08, 0x0B, 0x0C, 0x1F})
    void isStrippedControlByte_otherC0ControlsAreStripped(int b) {
        assertTrue(PdfJsonByteUtils.isStrippedControlByte((byte) b));
    }

    @ParameterizedTest
    @ValueSource(ints = {0x20, 0x41, 0x7E, 0x7F, 0xFF})
    void isStrippedControlByte_printableAndHighBytesAreKept(int b) {
        assertFalse(PdfJsonByteUtils.isStrippedControlByte((byte) b));
    }
}
