package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.pdf.parser.PdfIngester;
import stirling.software.SPDF.pdf.parser.PdfModels.Bounds;
import stirling.software.SPDF.pdf.parser.PdfModels.ParsedPage;
import stirling.software.SPDF.pdf.parser.PdfModels.RawLine;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.PdfModels.TextFragment;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.common.util.PdfUtils;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.service.PdfContentExtractor.ArtifactKind;
import stirling.software.proprietary.service.PdfContentExtractor.ExtractedFileText;
import stirling.software.proprietary.service.PdfContentExtractor.ExtractedTextArtifact;
import stirling.software.proprietary.service.PdfContentExtractor.LoadedFile;
import stirling.software.proprietary.service.PdfContentExtractor.PageLayoutArtifact;
import stirling.software.proprietary.service.PdfContentExtractor.PageLayoutFileResult;
import stirling.software.proprietary.service.PdfContentExtractor.PdfContentResult;
import stirling.software.proprietary.service.PdfContentExtractor.ToolReportArtifact;
import stirling.software.proprietary.service.PdfContentExtractor.WorkflowArtifact;

/**
 * Unit tests for {@link PdfContentExtractor}.
 *
 * <p>Collaborators ({@link TabulaTableParser}, {@link PdfIngester}) are Mockito mocks. Text
 * extraction is exercised against tiny real in-memory {@link PDDocument}s built with PDFBox content
 * streams (no files, no native tools). {@code PdfUtils} is a Lombok {@code @UtilityClass} so
 * {@code hasImagesOnPage} is a static method — it is stubbed with {@link MockedStatic} for the
 * {@link FolioType} classification paths.
 *
 * <p>Most of the workflow logic ({@code extractContent}, {@code buildArtifacts}, {@code
 * selectPages}, {@code clip}, layout building) lives in package-private methods, so the test sits in
 * the same package and calls them directly.
 */
@ExtendWith(MockitoExtension.class)
class PdfContentExtractorTest {

    @Mock private TabulaTableParser tabulaTableParser;
    @Mock private PdfIngester pdfIngester;

    private PdfContentExtractor extractor() {
        return new PdfContentExtractor(tabulaTableParser, pdfIngester);
    }

    // ------------------------------------------------------------------
    // PDF building helpers
    // ------------------------------------------------------------------

    /** Single page carrying the given text on each page. Caller closes the document. */
    private static PDDocument pdfWithText(String... pageTexts) throws IOException {
        PDDocument doc = new PDDocument();
        for (String text : pageTexts) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 700);
                cs.showText(text);
                cs.endText();
            }
        }
        return doc;
    }

    private static PDDocument emptyPagePdf() {
        PDDocument doc = new PDDocument();
        doc.addPage(new PDPage());
        return doc;
    }

    private static AiWorkflowFileRequest fileRequest(
            List<Integer> pageNumbers, AiPdfContentType... contentTypes) {
        AiWorkflowFileRequest req = new AiWorkflowFileRequest();
        if (pageNumbers != null) {
            req.setPageNumbers(pageNumbers);
        }
        if (contentTypes != null && contentTypes.length > 0) {
            req.setContentTypes(List.of(contentTypes));
        }
        return req;
    }

    // ==================================================================
    // classifyPage
    // ==================================================================

    @Test
    void classifyPage_textPresentNoImages_returnsTEXT() throws IOException {
        try (PDDocument doc =
                pdfWithText("This page has plenty of selectable text well beyond the threshold")) {
            try (MockedStatic<PdfUtils> pdfUtils = mockStatic(PdfUtils.class)) {
                pdfUtils.when(() -> PdfUtils.hasImagesOnPage(any())).thenReturn(false);
                assertEquals(FolioType.TEXT, extractor().classifyPage(doc, 1));
            }
        }
    }

    @Test
    void classifyPage_textAndImages_returnsMIXED() throws IOException {
        try (PDDocument doc =
                pdfWithText("This page has plenty of selectable text well beyond the threshold")) {
            try (MockedStatic<PdfUtils> pdfUtils = mockStatic(PdfUtils.class)) {
                pdfUtils.when(() -> PdfUtils.hasImagesOnPage(any())).thenReturn(true);
                assertEquals(FolioType.MIXED, extractor().classifyPage(doc, 1));
            }
        }
    }

    @Test
    void classifyPage_noTextNoImages_returnsIMAGE() throws IOException {
        // Below TEXT_PRESENCE_THRESHOLD (20 chars) and no images => IMAGE.
        try (PDDocument doc = pdfWithText("short")) {
            try (MockedStatic<PdfUtils> pdfUtils = mockStatic(PdfUtils.class)) {
                pdfUtils.when(() -> PdfUtils.hasImagesOnPage(any())).thenReturn(false);
                assertEquals(FolioType.IMAGE, extractor().classifyPage(doc, 1));
            }
        }
    }

    @Test
    void classifyPage_imageOnlyEmptyText_returnsIMAGE() throws IOException {
        // No text at all but images present: hasText=false short-circuits MIXED -> IMAGE.
        try (PDDocument doc = emptyPagePdf()) {
            try (MockedStatic<PdfUtils> pdfUtils = mockStatic(PdfUtils.class)) {
                pdfUtils.when(() -> PdfUtils.hasImagesOnPage(any())).thenReturn(true);
                assertEquals(FolioType.IMAGE, extractor().classifyPage(doc, 1));
            }
        }
    }

    // ==================================================================
    // extractPageTextRaw
    // ==================================================================

    @Test
    void extractPageTextRaw_returnsTrimmedPageText() throws IOException {
        try (PDDocument doc = pdfWithText("Hello world from page one")) {
            String text = extractor().extractPageTextRaw(doc, 1);
            assertEquals("Hello world from page one", text);
        }
    }

    @Test
    void extractPageTextRaw_selectsCorrectPage() throws IOException {
        try (PDDocument doc = pdfWithText("first page text", "second page text")) {
            assertEquals("second page text", extractor().extractPageTextRaw(doc, 2));
        }
    }

    // ==================================================================
    // extractTablesAsCsv
    // ==================================================================

    @Test
    void extractTablesAsCsv_noTables_returnsEmptyList() throws IOException {
        try (PDDocument doc = emptyPagePdf()) {
            when(tabulaTableParser.parse(doc, 1)).thenReturn(List.of());
            assertTrue(extractor().extractTablesAsCsv(doc, 1).isEmpty());
        }
    }

    @Test
    void extractTablesAsCsv_buildsQuotedCsvPerTable() throws IOException {
        try (PDDocument doc = emptyPagePdf()) {
            TableFragment t1 =
                    tableFragment(List.of(List.of("a", "b"), List.of("c", "d")));
            TableFragment t2 = tableFragment(List.of(List.of("x")));
            when(tabulaTableParser.parse(doc, 1)).thenReturn(List.of(t1, t2));

            List<String> csv = extractor().extractTablesAsCsv(doc, 1);

            assertEquals(2, csv.size());
            // QuoteMode.ALL quotes every field; rows are CRLF-separated (CSVFormat.EXCEL).
            assertEquals("\"a\",\"b\"\r\n\"c\",\"d\"\r\n", csv.get(0));
            assertEquals("\"x\"\r\n", csv.get(1));
        }
    }

    @Test
    void extractTablesAsCsv_multiRowMultiTable_csvCountMatchesFragments() throws IOException {
        try (PDDocument doc = emptyPagePdf()) {
            TableFragment t1 = tableFragment(List.of(List.of("h1", "h2"), List.of("v1", "v2")));
            TableFragment t2 = tableFragment(List.of(List.of("only")));
            TableFragment t3 = tableFragment(List.of(List.of("p", "q"), List.of("r", "s")));
            when(tabulaTableParser.parse(doc, 1)).thenReturn(List.of(t1, t2, t3));

            List<String> csv = extractor().extractTablesAsCsv(doc, 1);

            // One CSV string per table fragment, in order.
            assertEquals(3, csv.size());
            assertEquals("\"h1\",\"h2\"\r\n\"v1\",\"v2\"\r\n", csv.get(0));
            assertEquals("\"only\"\r\n", csv.get(1));
            assertEquals("\"p\",\"q\"\r\n\"r\",\"s\"\r\n", csv.get(2));
        }
    }

    private static TableFragment tableFragment(List<List<String>> rawRows) {
        return new TableFragment(
                "tbl-1",
                1,
                new Bounds(0f, 0f, 10f, 10f),
                List.of(),
                List.of(),
                rawRows,
                rawRows.isEmpty() ? 0 : rawRows.get(0).size(),
                1.0f,
                List.of(),
                null);
    }

    // ==================================================================
    // extractContent  (budget + dispatch)
    // ==================================================================

    @Test
    void extractContent_defaultsToPageTextWhenRequestAbsent() throws IOException {
        try (PDDocument doc = pdfWithText("alpha beta gamma", "delta epsilon zeta")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);

            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf), Map.of(), 10, 10_000);

            assertEquals(1, results.size());
            ExtractedFileText text = assertInstanceOf(ExtractedFileText.class, results.get(0));
            assertEquals("doc.pdf", text.getFileName());
            assertEquals(2, text.getPages().size());
            assertEquals(ArtifactKind.EXTRACTED_TEXT, text.getArtifactKind());
        }
    }

    @Test
    void extractContent_emptyContentTypesListAlsoDefaultsToPageText() throws IOException {
        try (PDDocument doc = pdfWithText("alpha beta gamma")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            // Request present but with an empty contentTypes list -> still defaults to PAGE_TEXT.
            AiWorkflowFileRequest req = new AiWorkflowFileRequest();

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            assertEquals(1, results.size());
            assertInstanceOf(ExtractedFileText.class, results.get(0));
        }
    }

    @Test
    void extractContent_respectsRequestedPages() throws IOException {
        try (PDDocument doc = pdfWithText("page one text", "page two text", "page three text")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            AiWorkflowFileRequest req =
                    fileRequest(List.of(3, 1), AiPdfContentType.PAGE_TEXT);

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            ExtractedFileText text = assertInstanceOf(ExtractedFileText.class, results.get(0));
            // selectPages preserves requested order (LinkedHashSet): 3 then 1.
            assertEquals(2, text.getPages().size());
            assertEquals(3, text.getPages().get(0).getPageNumber());
            assertEquals("page three text", text.getPages().get(0).getText());
            assertEquals(1, text.getPages().get(1).getPageNumber());
        }
    }

    @Test
    void extractContent_stopsAtZeroRemainingPages() throws IOException {
        // First file consumes the entire page budget; the second file is skipped by the break.
        try (PDDocument doc1 = pdfWithText("file one only page");
                PDDocument doc2 = pdfWithText("file two only page")) {
            LoadedFile lf1 = new LoadedFile("id-1", "one.pdf", doc1);
            LoadedFile lf2 = new LoadedFile("id-2", "two.pdf", doc2);

            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf1, lf2), Map.of(), 1, 10_000);

            assertEquals(1, results.size());
            assertEquals("one.pdf", ((ExtractedFileText) results.get(0)).getFileName());
        }
    }

    @Test
    void extractContent_unimplementedContentTypeIsSkipped() throws IOException {
        try (PDDocument doc = pdfWithText("some content")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            // FULL_TEXT maps to text extraction; DOCUMENT_METADATA hits the default -> skipped.
            AiWorkflowFileRequest req =
                    fileRequest(null, AiPdfContentType.DOCUMENT_METADATA);

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            assertTrue(results.isEmpty());
        }
    }

    @Test
    void extractContent_fullTextBehavesLikePageText() throws IOException {
        try (PDDocument doc = pdfWithText("full text content here")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(null, AiPdfContentType.FULL_TEXT);

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            assertEquals(1, results.size());
            assertInstanceOf(ExtractedFileText.class, results.get(0));
        }
    }

    @Test
    void extractContent_returnsEmptyWhenNoExtractableText() throws IOException {
        // Empty page -> extractPageText yields nothing -> extractText returns null -> no result.
        try (PDDocument doc = emptyPagePdf()) {
            LoadedFile lf = new LoadedFile("id-1", "blank.pdf", doc);

            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf), Map.of(), 10, 10_000);

            assertTrue(results.isEmpty());
        }
    }

    @Test
    void extractContent_characterBudgetClipsExtractedText() throws IOException {
        // Tight character budget forces clip() to truncate the page text.
        String longText = "abcdefghijklmnopqrstuvwxyz0123456789"; // 36 chars
        try (PDDocument doc = pdfWithText(longText)) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);

            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf), Map.of(), 10, 8);

            ExtractedFileText text = assertInstanceOf(ExtractedFileText.class, results.get(0));
            assertEquals(1, text.getPages().size());
            String clipped = text.getPages().get(0).getText();
            assertEquals(8, clipped.length());
            assertEquals("abcdefgh", clipped);
            // charactersConsumed reflects the clipped length.
            assertEquals(8, text.charactersConsumed());
        }
    }

    @Test
    void extractContent_layoutContentTypeUsesIngesterAndBuildsLayout() throws IOException {
        try (PDDocument doc = pdfWithText("layout page")) {
            LoadedFile lf = new LoadedFile("id-1", "layout.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(null, AiPdfContentType.PAGE_LAYOUT);

            TextFragment frag =
                    new TextFragment(
                            "f1",
                            "Heading",
                            new Bounds(10f, 20f, 100f, 14f),
                            22f,
                            14f,
                            "Helvetica-Bold",
                            true);
            RawLine line =
                    new RawLine("l1", List.of(frag), new Bounds(10f, 20f, 100f, 14f), 1);
            ParsedPage parsed = new ParsedPage(1, 600f, 800f, List.of(), List.of(line));
            when(pdfIngester.parse(eq(doc), anyInt())).thenReturn(List.of(parsed));

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            PageLayoutFileResult layout =
                    assertInstanceOf(PageLayoutFileResult.class, results.get(0));
            assertEquals("layout.pdf", layout.getFileName());
            assertEquals(1, layout.getPages().size());
            assertEquals(ArtifactKind.PAGE_LAYOUT, layout.getArtifactKind());
            assertEquals(1, layout.pagesConsumed());

            var layoutPage = layout.getPages().get(0);
            assertEquals(1, layoutPage.pageNumber());
            assertEquals(1, layoutPage.lines().size());
            var layoutFragment = layoutPage.lines().get(0).fragments().get(0);
            assertEquals("Heading", layoutFragment.text());
            assertEquals(10f, layoutFragment.x());
            assertEquals(20f, layoutFragment.y());
            assertEquals(100f, layoutFragment.width());
            assertEquals(14f, layoutFragment.fontSize());
            assertTrue(layoutFragment.bold());
        }
    }

    @Test
    void extractContent_layoutSkipsPagesWithoutLayoutLines() throws IOException {
        try (PDDocument doc = pdfWithText("p1", "p2")) {
            LoadedFile lf = new LoadedFile("id-1", "layout.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(null, AiPdfContentType.PAGE_LAYOUT);

            ParsedPage empty = new ParsedPage(1, 600f, 800f, List.of(), List.of());
            TextFragment frag =
                    new TextFragment(
                            "f1", "X", new Bounds(1f, 2f, 3f, 4f), 2f, 10f, "Helvetica", false);
            RawLine line = new RawLine("l1", List.of(frag), new Bounds(1f, 2f, 3f, 4f), 2);
            ParsedPage withLines = new ParsedPage(2, 600f, 800f, List.of(), List.of(line));
            when(pdfIngester.parse(eq(doc), anyInt()))
                    .thenReturn(List.of(empty, withLines));

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            PageLayoutFileResult layout =
                    assertInstanceOf(PageLayoutFileResult.class, results.get(0));
            // Only the page that had layout lines is kept.
            assertEquals(1, layout.getPages().size());
            assertEquals(2, layout.getPages().get(0).pageNumber());
        }
    }

    @Test
    void extractContent_layoutReturnsNoResultWhenAllPagesEmpty() throws IOException {
        try (PDDocument doc = pdfWithText("p1")) {
            LoadedFile lf = new LoadedFile("id-1", "layout.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(null, AiPdfContentType.PAGE_LAYOUT);

            when(pdfIngester.parse(eq(doc), anyInt()))
                    .thenReturn(List.of(new ParsedPage(1, 600f, 800f, List.of(), List.of())));

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 10, 10_000);

            assertTrue(results.isEmpty());
        }
    }

    @Test
    void extractContent_doesNotTouchCollaboratorsWhenBudgetIsZero() throws IOException {
        try (PDDocument doc = pdfWithText("never read")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);

            // remainingPages starts at 0 => loop breaks before any work.
            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf), Map.of(), 0, 10_000);

            assertTrue(results.isEmpty());
            verify(pdfIngester, never()).parse(any(), anyInt());
        }
    }

    // ==================================================================
    // selectPages — invalid page numbers / no pages (via extractContent)
    // ==================================================================

    @Test
    void selectPages_documentWithNoPages_throwsIllegalArgument() throws IOException {
        // A PDF with zero pages drives selectPages into ExceptionUtils.createPdfNoPages().
        try (PDDocument doc = new PDDocument()) {
            LoadedFile lf = new LoadedFile("id-1", "empty.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(null, AiPdfContentType.PAGE_TEXT);

            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            extractor()
                                    .extractContent(
                                            List.of(lf), Map.of("id-1", req), 10, 10_000));
        }
    }

    @Test
    void selectPages_requestedPageOutOfRange_throwsIllegalArgument() throws IOException {
        try (PDDocument doc = pdfWithText("only one page")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(List.of(5), AiPdfContentType.PAGE_TEXT);

            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () ->
                                    extractor()
                                            .extractContent(
                                                    List.of(lf), Map.of("id-1", req), 10, 10_000));
            assertNotNull(ex.getMessage());
        }
    }

    @Test
    void selectPages_requestedPageZero_throwsIllegalArgument() throws IOException {
        try (PDDocument doc = pdfWithText("page a", "page b")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            AiWorkflowFileRequest req = fileRequest(List.of(0), AiPdfContentType.PAGE_TEXT);

            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            extractor()
                                    .extractContent(
                                            List.of(lf), Map.of("id-1", req), 10, 10_000));
        }
    }

    @Test
    void selectPages_maxPagesCapsAutoSelection() throws IOException {
        // No requested pages and maxPages smaller than the doc => first N pages only.
        try (PDDocument doc = pdfWithText("uno", "dos", "tres", "cuatro")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);

            List<PdfContentResult> results =
                    extractor().extractContent(List.of(lf), Map.of(), 2, 10_000);

            ExtractedFileText text = assertInstanceOf(ExtractedFileText.class, results.get(0));
            assertEquals(2, text.getPages().size());
            assertEquals(1, text.getPages().get(0).getPageNumber());
            assertEquals(2, text.getPages().get(1).getPageNumber());
        }
    }

    @Test
    void selectPages_maxPagesCapsRequestedPages() throws IOException {
        try (PDDocument doc = pdfWithText("a1", "b2", "c3")) {
            LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
            AiWorkflowFileRequest req =
                    fileRequest(List.of(1, 2, 3), AiPdfContentType.PAGE_TEXT);

            List<PdfContentResult> results =
                    extractor()
                            .extractContent(List.of(lf), Map.of("id-1", req), 2, 10_000);

            ExtractedFileText text = assertInstanceOf(ExtractedFileText.class, results.get(0));
            // maxPages=2 limits the selection even though 3 pages were requested.
            assertEquals(2, text.getPages().size());
        }
    }

    // ==================================================================
    // buildArtifacts
    // ==================================================================

    @Test
    void buildArtifacts_groupsTextResultsIntoExtractedTextArtifact() {
        ExtractedFileText a = new ExtractedFileText();
        a.setFileName("a.pdf");
        ExtractedFileText b = new ExtractedFileText();
        b.setFileName("b.pdf");

        List<WorkflowArtifact> artifacts =
                extractor().buildArtifacts(List.of(a, b));

        assertEquals(1, artifacts.size());
        ExtractedTextArtifact artifact =
                assertInstanceOf(ExtractedTextArtifact.class, artifacts.get(0));
        assertEquals(ArtifactKind.EXTRACTED_TEXT, artifact.getKind());
        assertEquals(2, artifact.getFiles().size());
    }

    @Test
    void buildArtifacts_groupsLayoutResultsIntoPageLayoutArtifact() {
        PageLayoutFileResult layout = new PageLayoutFileResult();
        layout.setFileName("layout.pdf");

        List<WorkflowArtifact> artifacts = extractor().buildArtifacts(List.of(layout));

        assertEquals(1, artifacts.size());
        PageLayoutArtifact artifact =
                assertInstanceOf(PageLayoutArtifact.class, artifacts.get(0));
        assertEquals(ArtifactKind.PAGE_LAYOUT, artifact.getKind());
        assertEquals(1, artifact.getFiles().size());
    }

    @Test
    void buildArtifacts_mixedKindsProduceMultipleArtifacts() {
        ExtractedFileText text = new ExtractedFileText();
        text.setFileName("t.pdf");
        PageLayoutFileResult layout = new PageLayoutFileResult();
        layout.setFileName("l.pdf");

        List<WorkflowArtifact> artifacts =
                extractor().buildArtifacts(List.of(text, layout));

        assertEquals(2, artifacts.size());
        assertTrue(
                artifacts.stream().anyMatch(ExtractedTextArtifact.class::isInstance),
                "expected an ExtractedTextArtifact");
        assertTrue(
                artifacts.stream().anyMatch(PageLayoutArtifact.class::isInstance),
                "expected a PageLayoutArtifact");
    }

    @Test
    void buildArtifacts_emptyInputProducesNoArtifacts() {
        assertTrue(extractor().buildArtifacts(List.of()).isEmpty());
    }

    @Test
    void buildArtifacts_toolReportKindThrows() {
        // A PdfContentResult reporting TOOL_REPORT is never produced here; buildArtifact rejects it.
        PdfContentResult toolReportResult = () -> ArtifactKind.TOOL_REPORT;

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> extractor().buildArtifacts(List.of(toolReportResult)));
        assertTrue(ex.getMessage().contains("TOOL_REPORT"));
    }

    // ==================================================================
    // Result/artifact value semantics
    // ==================================================================

    @Test
    void extractedFileText_consumptionCountsReflectPagesAndChars() {
        ExtractedFileText text = new ExtractedFileText();
        AiWorkflowTextSelection p1 = new AiWorkflowTextSelection();
        p1.setPageNumber(1);
        p1.setText("12345");
        AiWorkflowTextSelection p2 = new AiWorkflowTextSelection();
        p2.setPageNumber(2);
        p2.setText("678");
        text.setPages(List.of(p1, p2));

        assertEquals(2, text.pagesConsumed());
        assertEquals(8, text.charactersConsumed());
    }

    @Test
    void pdfContentResult_defaultConsumptionsAreZero() {
        PdfContentResult result = () -> ArtifactKind.EXTRACTED_TEXT;
        assertEquals(0, result.pagesConsumed());
        assertEquals(0, result.charactersConsumed());
    }

    @Test
    void artifactKind_jsonValuesMatchContract() {
        assertEquals("extracted_text", ArtifactKind.EXTRACTED_TEXT.getValue());
        assertEquals("page_layout", ArtifactKind.PAGE_LAYOUT.getValue());
        assertEquals("tool_report", ArtifactKind.TOOL_REPORT.getValue());
    }

    @Test
    void toolReportArtifact_constructorPopulatesFields() {
        ToolReportArtifact artifact = new ToolReportArtifact("/api/v1/general/rotate-pdf", null);
        assertEquals(ArtifactKind.TOOL_REPORT, artifact.getKind());
        assertEquals("/api/v1/general/rotate-pdf", artifact.getSourceTool());
        assertNull(artifact.getReport());

        ToolReportArtifact empty = new ToolReportArtifact();
        assertEquals(ArtifactKind.TOOL_REPORT, empty.getKind());
        assertNull(empty.getSourceTool());
    }
}
