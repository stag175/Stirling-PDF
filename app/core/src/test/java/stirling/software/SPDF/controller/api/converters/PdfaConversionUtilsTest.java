package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

/**
 * Direct unit tests for the pure helpers extracted from {@link ConvertPDFToPDFA} (roadmap C2).
 * These previously lived as private methods on the ~2,565-LoC controller; extracting them lets us
 * test the logic directly instead of via reflection.
 */
class PdfaConversionUtilsTest {

    @Test
    void countGlyphs_countsLeadingSlashes() {
        assertEquals(0, PdfaConversionUtils.countGlyphs(null));
        assertEquals(0, PdfaConversionUtils.countGlyphs(""));
        assertEquals(0, PdfaConversionUtils.countGlyphs("abc")); // no slashes
        assertEquals(3, PdfaConversionUtils.countGlyphs("/a/b/c"));
        assertEquals(1, PdfaConversionUtils.countGlyphs("/space"));
    }

    @Test
    void stripNonPrintableAscii_removesOutsidePrintableRange() {
        assertNull(PdfaConversionUtils.stripNonPrintableAscii(null));
        assertEquals("abc", PdfaConversionUtils.stripNonPrintableAscii("abc"));
        // 0x01 (control), 0x7F (DEL), tab and newline are all outside 0x20-0x7E -> stripped.
        assertEquals("ab", PdfaConversionUtils.stripNonPrintableAscii("ab"));
        assertEquals("HelloWorld", PdfaConversionUtils.stripNonPrintableAscii("Hello\tWorld\n"));
        // Printable punctuation/space is preserved.
        assertEquals("a b!~", PdfaConversionUtils.stripNonPrintableAscii("a b!~"));
    }

    @Test
    void detectMimeTypeFromFilename_mapsKnownExtensionsCaseInsensitively() {
        assertEquals("image/png", PdfaConversionUtils.detectMimeTypeFromFilename("logo.png"));
        assertEquals("image/jpeg", PdfaConversionUtils.detectMimeTypeFromFilename("photo.JPEG"));
        assertEquals("application/pdf", PdfaConversionUtils.detectMimeTypeFromFilename("DOC.PDF"));
        assertEquals(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                PdfaConversionUtils.detectMimeTypeFromFilename("report.docx"));
    }

    @Test
    void detectMimeTypeFromFilename_fallsBackToDefault() {
        String dflt = "application/octet-stream";
        assertEquals(dflt, PdfaConversionUtils.detectMimeTypeFromFilename(null));
        assertEquals(dflt, PdfaConversionUtils.detectMimeTypeFromFilename(""));
        assertEquals(dflt, PdfaConversionUtils.detectMimeTypeFromFilename("archive.xyz"));
        assertEquals(dflt, PdfaConversionUtils.detectMimeTypeFromFilename("noextension"));
    }
}
