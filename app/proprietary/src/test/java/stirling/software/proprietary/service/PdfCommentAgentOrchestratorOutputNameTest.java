package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the pure filename helpers on PdfCommentAgentOrchestrator. {@code safeName} strips CR/LF (a
 * header/log-injection guard) and maps null to "&lt;unnamed&gt;"; {@code buildOutputFileName}
 * derives "&lt;base&gt;-commented.pdf" from the original name, falling back to
 * "document-commented.pdf" when there's nothing usable.
 */
class PdfCommentAgentOrchestratorOutputNameTest {

    // ---- safeName -------------------------------------------------------------------------

    @Test
    @DisplayName("null name maps to the <unnamed> sentinel")
    void safeNameNull() {
        assertEquals("<unnamed>", PdfCommentAgentOrchestrator.safeName(null));
    }

    @Test
    @DisplayName("CR and LF are replaced with underscores (injection guard)")
    void safeNameStripsNewlines() {
        assertEquals("a_b.pdf", PdfCommentAgentOrchestrator.safeName("a\nb.pdf"));
        assertEquals("a_b", PdfCommentAgentOrchestrator.safeName("a\rb"));
        assertEquals("a__b", PdfCommentAgentOrchestrator.safeName("a\r\nb"));
    }

    @Test
    @DisplayName("a clean name is returned unchanged")
    void safeNameClean() {
        assertEquals("report.pdf", PdfCommentAgentOrchestrator.safeName("report.pdf"));
    }

    // ---- buildOutputFileName --------------------------------------------------------------

    @Test
    @DisplayName("derives <base>-commented.pdf from a normal filename")
    void buildFromNormalName() {
        assertEquals(
                "report-commented.pdf",
                PdfCommentAgentOrchestrator.buildOutputFileName("report.pdf"));
    }

    @Test
    @DisplayName("strips any directory path to the base name")
    void buildStripsPath() {
        assertEquals(
                "doc-commented.pdf",
                PdfCommentAgentOrchestrator.buildOutputFileName("/path/to/doc.pdf"));
    }

    @Test
    @DisplayName("newlines in the name are sanitised before building")
    void buildSanitisesNewlines() {
        assertEquals(
                "a_b-commented.pdf", PdfCommentAgentOrchestrator.buildOutputFileName("a\nb.pdf"));
    }

    @Test
    @DisplayName("null/blank/<unnamed> fall back to document-commented.pdf")
    void buildFallback() {
        assertEquals(
                "document-commented.pdf", PdfCommentAgentOrchestrator.buildOutputFileName(null));
        assertEquals("document-commented.pdf", PdfCommentAgentOrchestrator.buildOutputFileName(""));
        assertEquals(
                "document-commented.pdf",
                PdfCommentAgentOrchestrator.buildOutputFileName("<unnamed>"));
    }

    @Test
    @DisplayName("an extension-only name yields the 'document' base")
    void buildExtensionOnly() {
        assertEquals(
                "document-commented.pdf", PdfCommentAgentOrchestrator.buildOutputFileName(".pdf"));
    }
}
