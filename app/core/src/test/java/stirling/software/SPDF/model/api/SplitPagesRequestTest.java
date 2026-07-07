package stirling.software.SPDF.model.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class SplitPagesRequestTest {

    private SplitPagesRequest request;
    private PDDocument mockDocument;

    @BeforeEach
    void setUp() {
        request = new SplitPagesRequest();
        mockDocument = mock(PDDocument.class);
    }

    // ---------------------------------------------------------------------
    // getPageNumbersList(PDDocument, boolean) -> GeneralUtils.parsePageList
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("'all' (one-based) expands to every page number 1..N")
    void getPageNumbersList_AllOneBased() {
        request.setPageNumbers("all");
        when(mockDocument.getNumberOfPages()).thenReturn(5);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 2, 3, 4, 5), result);
        verify(mockDocument).getNumberOfPages();
    }

    @Test
    @DisplayName("'all' is case-insensitive ('ALL')")
    void getPageNumbersList_AllUpperCase() {
        request.setPageNumbers("ALL");
        when(mockDocument.getNumberOfPages()).thenReturn(3);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 2, 3), result);
    }

    @Test
    @DisplayName("'all' (zero-based) expands to indices 0..N-1")
    void getPageNumbersList_AllZeroBased() {
        request.setPageNumbers("all");
        when(mockDocument.getNumberOfPages()).thenReturn(4);

        List<Integer> result = request.getPageNumbersList(mockDocument, false);

        assertEquals(List.of(0, 1, 2, 3), result);
    }

    @Test
    @DisplayName("Mixed singles and a range '1,3,5-7' resolves correctly (one-based)")
    void getPageNumbersList_SinglesAndRange() {
        request.setPageNumbers("1,3,5-7");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 3, 5, 6, 7), result);
    }

    @Test
    @DisplayName("Range in zero-based mode is shifted down by one")
    void getPageNumbersList_RangeZeroBased() {
        request.setPageNumbers("2-4");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, false);

        // pages 2,3,4 -> zero-based indices 1,2,3
        assertEquals(List.of(1, 2, 3), result);
    }

    @Test
    @DisplayName("Function syntax '2n+1' yields odd pages > 1 (one-based)")
    void getPageNumbersList_TwoNPlusOne() {
        request.setPageNumbers("2n+1");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(3, 5, 7, 9), result);
    }

    @Test
    @DisplayName("Function syntax '3n' yields multiples of three (one-based)")
    void getPageNumbersList_ThreeN() {
        request.setPageNumbers("3n");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(3, 6, 9), result);
    }

    @Test
    @DisplayName("Out-of-range page numbers are silently dropped")
    void getPageNumbersList_OutOfRangeDropped() {
        request.setPageNumbers("3,99");
        when(mockDocument.getNumberOfPages()).thenReturn(5);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        // 99 exceeds the page count and is discarded; 3 stays
        assertEquals(List.of(3), result);
    }

    @Test
    @DisplayName("Empty string produces an empty list (no pages)")
    void getPageNumbersList_EmptyInput() {
        request.setPageNumbers("");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertTrue(result.isEmpty(), () -> "Expected empty, got: " + result);
    }

    @Test
    @DisplayName("Null pageNumbers defaults to the first page [1]")
    void getPageNumbersList_NullDefaultsToFirstPage() {
        // pageNumbers left unset (null)
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1), result);
    }

    @Test
    @DisplayName("Non-numeric input containing 'n' is treated as a function and throws")
    void getPageNumbersList_InvalidThrows() {
        // "invalid" contains the letter 'n', so it is routed to the n-function
        // evaluator, fails the math-expression regex, and throws.
        request.setPageNumbers("invalid");
        when(mockDocument.getNumberOfPages()).thenReturn(10);

        assertThrows(
                IllegalArgumentException.class,
                () -> request.getPageNumbersList(mockDocument, true));
    }

    @Test
    @DisplayName("Page count is read from the supplied document")
    void getPageNumbersList_UsesDocumentPageCount() {
        request.setPageNumbers("all");
        when(mockDocument.getNumberOfPages()).thenReturn(2);

        List<Integer> result = request.getPageNumbersList(mockDocument, true);

        assertEquals(List.of(1, 2), result);
        verify(mockDocument, times(1)).getNumberOfPages();
        verifyNoMoreInteractions(mockDocument);
    }

    // ---------------------------------------------------------------------
    // @Data accessor + inherited fields
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("pageNumbers defaults to null and round-trips through the setter")
    void pageNumbersAccessor() {
        assertNull(request.getPageNumbers());

        request.setPageNumbers("2,5");
        assertEquals("2,5", request.getPageNumbers());

        request.setPageNumbers(null);
        assertNull(request.getPageNumbers());
    }

    @Test
    @DisplayName("Inherited PDFFile fields default to null and round-trip")
    void inheritedFields() {
        assertNull(request.getFileId());
        assertNull(request.getFileInput());

        MultipartFile file =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
        request.setFileId("file-123");
        request.setFileInput(file);

        assertEquals("file-123", request.getFileId());
        assertSame(file, request.getFileInput());
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString (Lombok @Data + @EqualsAndHashCode(callSuper=true))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsDefaultInstances() {
        SplitPagesRequest other = new SplitPagesRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: identical populated state is equal")
    void equalsIdenticalState() {
        SplitPagesRequest a = buildPopulated();
        SplitPagesRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing own field pageNumbers breaks equality")
    void notEqualWhenPageNumbersDiffers() {
        SplitPagesRequest a = buildPopulated();
        SplitPagesRequest b = buildPopulated();
        b.setPageNumbers("1-2");

        assertNotEquals(a, b);
        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: callSuper=true factors inherited fileId into equality")
    void notEqualWhenInheritedFileIdDiffers() {
        SplitPagesRequest a = buildPopulated();
        SplitPagesRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("equals: reflexive, symmetric, and not equal to null/other type")
    void equalsContract() {
        SplitPagesRequest a = buildPopulated();
        SplitPagesRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
        assertNotEquals(null, a);
        assertNotEquals("a string", a);
    }

    @Test
    @DisplayName("toString mentions the pageNumbers field")
    void toStringContainsFieldName() {
        request.setPageNumbers("all");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("pageNumbers"), () -> "Unexpected toString: " + text);
    }

    private SplitPagesRequest buildPopulated() {
        SplitPagesRequest r = new SplitPagesRequest();
        r.setPageNumbers("all");
        r.setFileId("file-1");
        return r;
    }
}
