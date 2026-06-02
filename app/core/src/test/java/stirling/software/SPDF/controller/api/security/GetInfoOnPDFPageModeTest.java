package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins GetInfoOnPDF.getPageModeDescription — the PDF page-mode label shown in the info report. A
 * null mode reports "Unknown"; otherwise the first leading slash is stripped (PDF names arrive as
 * "/UseNone" etc.). Only the first slash is removed (replaceFirst).
 */
class GetInfoOnPDFPageModeTest {

    @Test
    @DisplayName("null page mode reports Unknown")
    void nullMode() {
        assertEquals("Unknown", GetInfoOnPDF.getPageModeDescription(null));
    }

    @Test
    @DisplayName("a leading slash is stripped from the PDF name")
    void stripsLeadingSlash() {
        assertEquals("UseNone", GetInfoOnPDF.getPageModeDescription("/UseNone"));
        assertEquals("FullScreen", GetInfoOnPDF.getPageModeDescription("/FullScreen"));
    }

    @Test
    @DisplayName("a value without a slash is returned unchanged")
    void noSlashUnchanged() {
        assertEquals("UseOutlines", GetInfoOnPDF.getPageModeDescription("UseOutlines"));
    }

    @Test
    @DisplayName("only the first slash is removed")
    void onlyFirstSlash() {
        assertEquals("ab/c", GetInfoOnPDF.getPageModeDescription("a/b/c"));
        assertEquals("", GetInfoOnPDF.getPageModeDescription("/"));
    }

    @Test
    @DisplayName("empty string stays empty")
    void emptyString() {
        assertEquals("", GetInfoOnPDF.getPageModeDescription(""));
    }
}
