package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.api.ai.AuditDiscrepancy;
import stirling.software.proprietary.model.api.ai.AuditSeverity;
import stirling.software.proprietary.model.api.ai.DiscrepancyKind;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.model.api.ai.Requisition;
import stirling.software.proprietary.model.api.ai.Verdict;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link MathAuditorOrchestrator}. All four collaborators are mocked except the
 * Jackson {@link ObjectMapper}, which is the real (production-flavour, tools.jackson) JsonMapper so
 * the manifest serialization and engine-response deserialization are exercised for real. PDFs are
 * built in memory and loaded with PDFBox; no network, DB, Spring context, or native tooling.
 *
 * <p>Page-index convention under test: Python (Requisition/Folio/Verdict) page numbers are 0-based,
 * while {@code PdfContentExtractor} is called 1-based. {@code fulfil} drops pages that are {@code <
 * 0} or {@code >= totalPages}.
 */
@ExtendWith(MockitoExtension.class)
class MathAuditorOrchestratorTest {

    private static final String EXAMINE_PATH = "/api/v1/ai/math-auditor-agent/examine";
    private static final String DELIBERATE_PREFIX = "/api/v1/ai/math-auditor-agent/deliberate";

    @Mock private AiEngineClient aiEngineClient;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfContentExtractor pdfContentExtractor;

    private ObjectMapper objectMapper;
    private MathAuditorOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        orchestrator =
                new MathAuditorOrchestrator(
                        aiEngineClient, pdfDocumentFactory, pdfContentExtractor, objectMapper);
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------

    @Test
    void happyPathClassifiesFulfilsTextAndTablesAndReturnsVerdict() throws IOException {
        MockMultipartFile input = pdf("report.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());

        // Classification of all 3 pages (1-based calls).
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.MIXED);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(3)))
                .thenReturn(FolioType.IMAGE);

        // Requisition: page 0 needs text, page 1 needs tables (0-based).
        Requisition requisition =
                new Requisition(
                        "requisition",
                        List.of(0),
                        List.of(1),
                        List.of(),
                        "need text on cover, tables on body");
        Verdict verdict =
                new Verdict(
                        "verdict",
                        "ignored-session",
                        List.of(
                                discrepancy(0, AuditSeverity.ERROR),
                                discrepancy(1, AuditSeverity.WARNING)),
                        List.of(0, 1),
                        2,
                        "one error, one warning",
                        false,
                        List.of());

        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdict));

        // Page 0 (0-based) -> extractor page 1; page 1 -> extractor page 2.
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("Cover text");
        when(pdfContentExtractor.extractTablesAsCsv(any(PDDocument.class), eq(2)))
                .thenReturn(List.of("a,b\n1,2"));

        Verdict result = orchestrator.audit(input, new BigDecimal("0.01"));

        assertNotNull(result);
        assertEquals(verdict.type(), result.type());
        assertEquals(1, result.errorCount());
        assertEquals(1, result.warningCount());
        assertFalse(result.clean());

        // All pages classified exactly once.
        verify(pdfContentExtractor).classifyPage(any(PDDocument.class), eq(1));
        verify(pdfContentExtractor).classifyPage(any(PDDocument.class), eq(2));
        verify(pdfContentExtractor).classifyPage(any(PDDocument.class), eq(3));
        // Text requested only for page 0; tables only for page 1.
        verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(1));
        verify(pdfContentExtractor).extractTablesAsCsv(any(PDDocument.class), eq(2));
        verify(pdfContentExtractor, never()).extractPageTextRaw(any(PDDocument.class), eq(2));
        verify(pdfContentExtractor, never()).extractTablesAsCsv(any(PDDocument.class), eq(1));
    }

    @Test
    void manifestSentToExamineCarriesPageCountAndClassifications() throws IOException {
        MockMultipartFile input = pdf("m.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        Requisition empty = new Requisition("requisition", List.of(), List.of(), List.of(), "none");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(empty));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        orchestrator.audit(input, BigDecimal.TEN);

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(eq(EXAMINE_PATH), bodyCaptor.capture());
        String manifestJson = bodyCaptor.getValue();
        assertTrue(manifestJson.contains("\"pageCount\":3"), manifestJson);
        assertTrue(manifestJson.contains("\"round\":1"), manifestJson);
        // FolioType serializes lowercase via @JsonValue.
        assertTrue(manifestJson.contains("text"), manifestJson);
    }

    @Test
    void deliberateCalledWithToleranceAsPlainStringAndFinalRoundTrue() throws IOException {
        MockMultipartFile input = pdf("t.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("body");

        Requisition requisition =
                new Requisition("requisition", List.of(0), List.of(), List.of(), "text");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        // Scientific notation would appear with toString(); toPlainString() must be used.
        orchestrator.audit(input, new BigDecimal("0.0000001"));

        ArgumentCaptor<String> pathCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        // post() is called twice (examine then deliberate); inspect the deliberate call.
        verify(aiEngineClient, org.mockito.Mockito.times(2))
                .post(pathCaptor.capture(), bodyCaptor.capture());
        int di = pathCaptor.getAllValues().get(0).startsWith(DELIBERATE_PREFIX) ? 0 : 1;
        assertEquals(DELIBERATE_PREFIX + "?tolerance=0.0000001", pathCaptor.getAllValues().get(di));
        // Evidence body carries finalRound=true and round=2.
        String evidenceJson = bodyCaptor.getAllValues().get(di);
        assertTrue(evidenceJson.contains("\"finalRound\":true"), evidenceJson);
        assertTrue(evidenceJson.contains("\"round\":2"), evidenceJson);
    }

    // ------------------------------------------------------------------
    // Fulfilment edge cases: union, dedup, ordering, bounds, contains
    // ------------------------------------------------------------------

    @Test
    void unionDeduplicatesAndSortsPagesAndOcrMarksUnauditable() throws IOException {
        MockMultipartFile input = pdf("u.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.MIXED);

        // Overlapping page sets (page 1 appears in text and tables) plus OCR on page 2.
        Requisition requisition =
                new Requisition(
                        "requisition",
                        List.of(1, 0),
                        List.of(1),
                        List.of(2),
                        "overlap + ocr");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), anyInt()))
                .thenReturn("text");
        when(pdfContentExtractor.extractTablesAsCsv(any(PDDocument.class), anyInt()))
                .thenReturn(List.of("csv"));

        orchestrator.audit(input, BigDecimal.ONE);

        // Page 0 -> extractor 1, page 1 -> extractor 2 both get text (text needs {0,1}).
        verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(1));
        verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(2));
        // Tables only on page 1 -> extractor 2; never on page 0 -> extractor 1.
        verify(pdfContentExtractor).extractTablesAsCsv(any(PDDocument.class), eq(2));
        verify(pdfContentExtractor, never()).extractTablesAsCsv(any(PDDocument.class), eq(1));

        // Evidence echoes unauditable page 2 (OCR requested, not wired). Capture deliberate body.
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(matchesDeliberate(), bodyCaptor.capture());
        String evidenceJson = bodyCaptor.getValue();
        assertTrue(evidenceJson.contains("\"unauditablePages\":[2]"), evidenceJson);
        // Page 2 is OCR-only -> no text/tables fetched, no folio for it. Two folios (pages 0,1).
        assertTrue(evidenceJson.contains("\"page\":0"), evidenceJson);
        assertTrue(evidenceJson.contains("\"page\":1"), evidenceJson);
    }

    @Test
    void outOfBoundsPagesAreFilteredOut() throws IOException {
        MockMultipartFile input = pdf("oob.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        // Only page 0 is valid (totalPages=1). -5 and 3 are out of bounds.
        Requisition requisition =
                new Requisition(
                        "requisition", List.of(-5, 0, 3), List.of(), List.of(), "mixed bounds");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("only page");

        orchestrator.audit(input, BigDecimal.ONE);

        // Only the in-bounds page (0 -> extractor 1) is extracted; never -4 or 4.
        verify(pdfContentExtractor, times(1))
                .extractPageTextRaw(any(PDDocument.class), eq(1));
        verify(pdfContentExtractor, never()).extractPageTextRaw(any(PDDocument.class), eq(-4));
        verify(pdfContentExtractor, never()).extractPageTextRaw(any(PDDocument.class), eq(4));
    }

    @Test
    void allPagesOutOfBoundsProducesEmptyEvidenceButStillDeliberates() throws IOException {
        MockMultipartFile input = pdf("empty.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.IMAGE);

        // totalPages=1, so pages 5 and 9 are all out of bounds -> allPages empty (warn branch).
        Requisition requisition =
                new Requisition(
                        "requisition", List.of(5), List.of(9), List.of(), "all oob");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        Verdict result = orchestrator.audit(input, BigDecimal.ONE);

        assertNotNull(result);
        // No extraction happened at all.
        verify(pdfContentExtractor, never())
                .extractPageTextRaw(any(PDDocument.class), anyInt());
        verify(pdfContentExtractor, never())
                .extractTablesAsCsv(any(PDDocument.class), anyInt());
        // Deliberate still invoked with empty folios.
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(matchesDeliberate(), bodyCaptor.capture());
        assertTrue(bodyCaptor.getValue().contains("\"folios\":[]"), bodyCaptor.getValue());
    }

    @Test
    void emptyRequisitionProducesNoFoliosAndNoExtraction() throws IOException {
        MockMultipartFile input = pdf("none.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        Requisition requisition =
                new Requisition("requisition", List.of(), List.of(), List.of(), "nothing");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        orchestrator.audit(input, BigDecimal.ONE);

        verify(pdfContentExtractor, never())
                .extractPageTextRaw(any(PDDocument.class), anyInt());
        verify(pdfContentExtractor, never())
                .extractTablesAsCsv(any(PDDocument.class), anyInt());
    }

    @Test
    void nullRequisitionListsAreToleratedByUnionAndContains() throws IOException {
        MockMultipartFile input = pdf("nulls.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        // needText present; needTables and needOcr are null (exercises the null branches).
        Requisition requisition =
                new Requisition("requisition", List.of(2), null, null, "null lists");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(3)))
                .thenReturn("page three text");

        Verdict result = orchestrator.audit(input, BigDecimal.ONE);

        assertNotNull(result);
        // Page 2 (0-based) -> extractor 3 gets text; tables never requested.
        verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(3));
        verify(pdfContentExtractor, never())
                .extractTablesAsCsv(any(PDDocument.class), anyInt());
    }

    @Test
    void ocrOnlyPageYieldsUnauditableButNoFolio() throws IOException {
        MockMultipartFile input = pdf("ocr.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(threePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.IMAGE);

        // Page 0 OCR only -> unauditable, no text/tables, no folio.
        Requisition requisition =
                new Requisition("requisition", List.of(), List.of(), List.of(0), "ocr only");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        orchestrator.audit(input, BigDecimal.ONE);

        verify(pdfContentExtractor, never())
                .extractPageTextRaw(any(PDDocument.class), anyInt());
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(matchesDeliberate(), bodyCaptor.capture());
        String evidenceJson = bodyCaptor.getValue();
        assertTrue(evidenceJson.contains("\"unauditablePages\":[0]"), evidenceJson);
        assertTrue(evidenceJson.contains("\"folios\":[]"), evidenceJson);
    }

    // ------------------------------------------------------------------
    // Error / exception paths
    // ------------------------------------------------------------------

    @Test
    void nullVerdictFromDeliberateThrowsIllegalState() throws IOException {
        MockMultipartFile input = pdf("nullv.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        Requisition requisition =
                new Requisition("requisition", List.of(), List.of(), List.of(), "x");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        // JSON literal null deserializes to a null Verdict.
        when(aiEngineClient.post(matchesDeliberate(), anyString())).thenReturn("null");

        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class,
                        () -> orchestrator.audit(input, BigDecimal.ONE));
        assertTrue(ex.getMessage().contains("null Verdict"), ex.getMessage());
    }

    @Test
    void ioExceptionFromExtractorPropagates() throws IOException {
        MockMultipartFile input = pdf("io.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenThrow(new IOException("classify boom"));

        IOException ex =
                assertThrows(
                        IOException.class, () -> orchestrator.audit(input, BigDecimal.ONE));
        assertEquals("classify boom", ex.getMessage());
        // Never reached the engine.
        verify(aiEngineClient, never()).post(anyString(), anyString());
    }

    @Test
    void ioExceptionFromEngineExamineCallPropagates() throws IOException {
        MockMultipartFile input = pdf("engine.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenThrow(new IOException("engine down"));

        IOException ex =
                assertThrows(
                        IOException.class, () -> orchestrator.audit(input, BigDecimal.ONE));
        assertEquals("engine down", ex.getMessage());
        // Deliberate is never reached.
        verify(aiEngineClient, never()).post(matchesDeliberate(), anyString());
    }

    @Test
    void factoryLoadFailurePropagatesAndShortCircuits() throws IOException {
        MockMultipartFile input = pdf("bad.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("corrupt pdf"));

        IOException ex =
                assertThrows(
                        IOException.class, () -> orchestrator.audit(input, BigDecimal.ONE));
        assertEquals("corrupt pdf", ex.getMessage());
        verify(pdfContentExtractor, never()).classifyPage(any(PDDocument.class), anyInt());
        verify(aiEngineClient, never()).post(anyString(), anyString());
    }

    @Test
    void cleanVerdictWithNoDiscrepanciesReportsZeroCounts() throws IOException {
        MockMultipartFile input = pdf("clean.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(onePagePdf());
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt()))
                .thenReturn(FolioType.TEXT);

        Requisition requisition =
                new Requisition("requisition", List.of(), List.of(), List.of(), "x");
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString()))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(matchesDeliberate(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(verdictClean()));

        Verdict result = orchestrator.audit(input, BigDecimal.ONE);

        assertNotNull(result);
        assertTrue(result.clean());
        assertEquals(0, result.errorCount());
        assertEquals(0, result.warningCount());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Mockito matcher for any deliberate path (which carries a ?tolerance= query string). */
    private static String matchesDeliberate() {
        return org.mockito.ArgumentMatchers.startsWith(DELIBERATE_PREFIX);
    }

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile(
                "fileInput",
                filename,
                MediaType.APPLICATION_PDF_VALUE,
                "%PDF-1.4\n%%EOF".getBytes());
    }

    private static PDDocument onePagePdf() throws IOException {
        return Loader.loadPDF(pdfBytes(1));
    }

    private static PDDocument threePagePdf() throws IOException {
        return Loader.loadPDF(pdfBytes(3));
    }

    private static byte[] pdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static AuditDiscrepancy discrepancy(int page, AuditSeverity severity) {
        return new AuditDiscrepancy(
                page,
                DiscrepancyKind.ARITHMETIC,
                severity,
                "mismatch",
                "10",
                "12",
                "row " + page);
    }

    private static Verdict verdictClean() {
        return new Verdict(
                "verdict",
                "session",
                List.of(),
                List.of(),
                1,
                "all good",
                true,
                List.of());
    }
}
