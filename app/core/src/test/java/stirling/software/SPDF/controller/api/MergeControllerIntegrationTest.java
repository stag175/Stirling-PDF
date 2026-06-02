package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

/**
 * Integration-level test for the core merge logic (roadmap A3 — bridging unit tests and Cucumber
 * e2e for a top PDF endpoint). Unlike the existing reflection/DTO unit tests, this exercises the
 * <em>real</em> PDFBox page-merging across multiple documents end-to-end. Merge is a stateless,
 * in-memory PDFBox operation, so it needs no Testcontainers/Docker and runs in the normal suite;
 * the container-backed variant of A3 (DB-touching endpoints) still needs Docker.
 */
@ExtendWith(MockitoExtension.class)
class MergeControllerIntegrationTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private static PDDocument documentWithPages(int pageCount) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pageCount; i++) {
            doc.addPage(new PDPage());
        }
        return doc;
    }

    @Test
    void mergeDocuments_combinesAllPagesFromEveryDocument() throws IOException {
        // createNewDocument() is the only injected dependency mergeDocuments touches; back it with
        // a
        // real (empty) PDDocument so the actual PDFBox addPage merge logic is exercised, not
        // mocked.
        when(pdfDocumentFactory.createNewDocument()).thenReturn(new PDDocument());
        MergeController controller = new MergeController(pdfDocumentFactory, tempFileManager);

        try (PDDocument first = documentWithPages(2);
                PDDocument second = documentWithPages(3);
                PDDocument third = documentWithPages(1)) {
            PDDocument merged = controller.mergeDocuments(List.of(first, second, third));
            try {
                assertEquals(6, merged.getNumberOfPages(), "merged doc should hold 2+3+1 pages");
            } finally {
                merged.close();
            }
        }
    }

    @Test
    void mergeDocuments_singleDocumentIsPreservedPageForPage() throws IOException {
        when(pdfDocumentFactory.createNewDocument()).thenReturn(new PDDocument());
        MergeController controller = new MergeController(pdfDocumentFactory, tempFileManager);

        try (PDDocument only = documentWithPages(4)) {
            PDDocument merged = controller.mergeDocuments(List.of(only));
            try {
                assertEquals(4, merged.getNumberOfPages());
            } finally {
                merged.close();
            }
        }
    }

    @Test
    void mergeDocuments_emptyListYieldsEmptyDocument() throws IOException {
        when(pdfDocumentFactory.createNewDocument()).thenReturn(new PDDocument());
        MergeController controller = new MergeController(pdfDocumentFactory, tempFileManager);

        PDDocument merged = controller.mergeDocuments(List.of());
        try {
            assertEquals(0, merged.getNumberOfPages());
        } finally {
            merged.close();
        }
    }
}
