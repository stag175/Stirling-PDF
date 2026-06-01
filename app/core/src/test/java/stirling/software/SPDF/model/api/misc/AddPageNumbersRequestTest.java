package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class AddPageNumbersRequestTest {

    private AddPageNumbersRequest request;

    @BeforeEach
    void setUp() {
        request = new AddPageNumbersRequest();
    }

    @Test
    @DisplayName("Explicit field defaults: zeroPad=0 and position=8")
    void explicitDefaults() {
        assertEquals(0, request.getZeroPad(), "zeroPad must default to 0");
        assertEquals(8, request.getPosition(), "position must default to 8");
    }

    @Test
    @DisplayName("Non-initialised primitive fields default to JVM zero values")
    void uninitialisedPrimitivesDefaultToZero() {
        assertEquals(0.0f, request.getFontSize(), 0.0f);
        assertEquals(0, request.getStartingNumber());
    }

    @Test
    @DisplayName("Non-initialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getCustomMargin());
        assertNull(request.getFontType());
        assertNull(request.getFontColor());
        assertNull(request.getPagesToNumber());
        assertNull(request.getCustomText());
    }

    @Test
    @DisplayName("Inherited fields default to null (pageNumbers, fileId, fileInput)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getPageNumbers(), "inherited from PDFWithPageNums");
        assertNull(request.getFileId(), "inherited from PDFFile");
        assertNull(request.getFileInput(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return the values set via setters")
    void gettersReturnSetValues() {
        request.setCustomMargin("x-large");
        request.setFontSize(14.5f);
        request.setFontType("courier");
        request.setFontColor("#FF0000");
        request.setZeroPad(4);
        request.setPosition(3);
        request.setStartingNumber(7);
        request.setPagesToNumber("1,3-5");
        request.setCustomText("Page {n} of {total}");

        assertEquals("x-large", request.getCustomMargin());
        assertEquals(14.5f, request.getFontSize(), 0.0001f);
        assertEquals("courier", request.getFontType());
        assertEquals("#FF0000", request.getFontColor());
        assertEquals(4, request.getZeroPad());
        assertEquals(3, request.getPosition());
        assertEquals(7, request.getStartingNumber());
        assertEquals("1,3-5", request.getPagesToNumber());
        assertEquals("Page {n} of {total}", request.getCustomText());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy")
    void inheritedSettersAndGetters() {
        MultipartFile file =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
        request.setPageNumbers("all");
        request.setFileId("file-123");
        request.setFileInput(file);

        assertEquals("all", request.getPageNumbers());
        assertEquals("file-123", request.getFileId());
        assertSame(file, request.getFileInput());
    }

    @Test
    @DisplayName("Boundary position values 1 and 9 are accepted as plain ints")
    void positionBoundaryValues() {
        request.setPosition(1);
        assertEquals(1, request.getPosition());

        request.setPosition(9);
        assertEquals(9, request.getPosition());
    }

    @Test
    @DisplayName("zeroPad accepts 0 (disabled) and positive boundary values")
    void zeroPadBoundaryValues() {
        request.setZeroPad(0);
        assertEquals(0, request.getZeroPad());

        request.setZeroPad(10);
        assertEquals(10, request.getZeroPad());
    }

    @Test
    @DisplayName("Null reference fields can be set explicitly to null")
    void nullableFieldsAcceptNull() {
        request.setCustomMargin("medium");
        request.setCustomMargin(null);
        assertNull(request.getCustomMargin());

        request.setPagesToNumber("all");
        request.setPagesToNumber(null);
        assertNull(request.getPagesToNumber());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        AddPageNumbersRequest other = new AddPageNumbersRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();
        b.setPosition(5);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited pageNumbers difference (PDFWithPageNums)")
    void notEqualWhenInheritedPageNumbersDiffers() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();
        b.setPageNumbers("1-3");

        assertNotEquals(a, b, "callSuper=true must factor PDFWithPageNums.pageNumbers into equals");
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper chain must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: not equal to null and to an unrelated type")
    void notEqualToNullOrOtherType() {
        assertNotEquals(null, request);
        assertNotEquals("a string", request);
    }

    @Test
    @DisplayName("equals: reflexive and symmetric")
    void reflexiveAndSymmetric() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("equals: differing fontSize (float) breaks equality")
    void notEqualWhenFontSizeDiffers() {
        AddPageNumbersRequest a = buildPopulated();
        AddPageNumbersRequest b = buildPopulated();
        b.setFontSize(99.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setPosition(3);

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("position"), () -> "Unexpected toString: " + text);
    }

    private AddPageNumbersRequest buildPopulated() {
        AddPageNumbersRequest r = new AddPageNumbersRequest();
        r.setCustomMargin("large");
        r.setFontSize(12.0f);
        r.setFontType("helvetica");
        r.setFontColor("#000000");
        r.setZeroPad(3);
        r.setPosition(8);
        r.setStartingNumber(1);
        r.setPagesToNumber("all");
        r.setCustomText("{n}");
        r.setPageNumbers("all");
        r.setFileId("file-1");
        return r;
    }
}
