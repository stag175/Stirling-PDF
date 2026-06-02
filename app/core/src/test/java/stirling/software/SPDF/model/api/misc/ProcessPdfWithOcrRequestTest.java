package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class ProcessPdfWithOcrRequestTest {

    private ProcessPdfWithOcrRequest request;

    @BeforeEach
    void setUp() {
        request = new ProcessPdfWithOcrRequest();
    }

    @Test
    @DisplayName("Initialised field default: ocrRenderType=hocr")
    void initialisedFieldDefault() {
        assertEquals("hocr", request.getOcrRenderType(), "ocrRenderType must default to 'hocr'");
    }

    @Test
    @DisplayName("Uninitialised primitive boolean fields default to false")
    void uninitialisedBooleansDefaultToFalse() {
        assertFalse(request.isSidecar());
        assertFalse(request.isDeskew());
        assertFalse(request.isClean());
        assertFalse(request.isCleanFinal());
        assertFalse(request.isRemoveImagesAfter());
    }

    @Test
    @DisplayName("Uninitialised reference fields default to null (languages, ocrType)")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getLanguages());
        assertNull(request.getOcrType());
    }

    @Test
    @DisplayName("Inherited fields default to null (fileId, fileInput)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileId(), "inherited from PDFFile");
        assertNull(request.getFileInput(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return the values set via setters")
    void gettersReturnSetValues() {
        List<String> langs = List.of("eng", "deu");
        request.setLanguages(langs);
        request.setSidecar(true);
        request.setDeskew(true);
        request.setClean(true);
        request.setCleanFinal(true);
        request.setOcrType("force-ocr");
        request.setOcrRenderType("sandwich");
        request.setRemoveImagesAfter(true);

        assertEquals(langs, request.getLanguages());
        assertTrue(request.isSidecar());
        assertTrue(request.isDeskew());
        assertTrue(request.isClean());
        assertTrue(request.isCleanFinal());
        assertEquals("force-ocr", request.getOcrType());
        assertEquals("sandwich", request.getOcrRenderType());
        assertTrue(request.isRemoveImagesAfter());
    }

    @Test
    @DisplayName("languages setter preserves the supplied list reference and ordering")
    void languagesListIsPreservedSame() {
        List<String> langs = List.of("eng", "fra", "spa");
        request.setLanguages(langs);

        assertSame(langs, request.getLanguages());
        assertEquals(3, request.getLanguages().size());
        assertEquals("eng", request.getLanguages().get(0));
        assertEquals("spa", request.getLanguages().get(2));
    }

    @Test
    @DisplayName("languages accepts an empty list")
    void languagesAcceptsEmptyList() {
        request.setLanguages(List.of());
        assertNotNull(request.getLanguages());
        assertTrue(request.getLanguages().isEmpty());
    }

    @Test
    @DisplayName("ocrType accepts each documented allowable value")
    void ocrTypeAllowableValues() {
        request.setOcrType("skip-text");
        assertEquals("skip-text", request.getOcrType());

        request.setOcrType("force-ocr");
        assertEquals("force-ocr", request.getOcrType());

        request.setOcrType("Normal");
        assertEquals("Normal", request.getOcrType());
    }

    @Test
    @DisplayName("ocrRenderType accepts both documented allowable values")
    void ocrRenderTypeAllowableValues() {
        request.setOcrRenderType("hocr");
        assertEquals("hocr", request.getOcrRenderType());

        request.setOcrRenderType("sandwich");
        assertEquals("sandwich", request.getOcrRenderType());
    }

    @Test
    @DisplayName("Toggling a boolean back to false is honoured")
    void booleanToggleBackToFalse() {
        request.setClean(true);
        assertTrue(request.isClean());
        request.setClean(false);
        assertFalse(request.isClean());
    }

    @Test
    @DisplayName("Nullable reference fields can be set explicitly to null")
    void nullableFieldsAcceptNull() {
        request.setLanguages(List.of("eng"));
        request.setLanguages(null);
        assertNull(request.getLanguages());

        request.setOcrType("force-ocr");
        request.setOcrType(null);
        assertNull(request.getOcrType());

        // ocrRenderType has an initialiser but the setter still allows null.
        request.setOcrRenderType(null);
        assertNull(request.getOcrRenderType());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy (PDFFile)")
    void inheritedSettersAndGetters() {
        MultipartFile file =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
        request.setFileId("file-123");
        request.setFileInput(file);

        assertEquals("file-123", request.getFileId());
        assertSame(file, request.getFileInput());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        ProcessPdfWithOcrRequest other = new ProcessPdfWithOcrRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing languages list breaks equality")
    void notEqualWhenLanguagesDiffer() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
        b.setLanguages(List.of("fra"));

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing ocrType (String) breaks equality")
    void notEqualWhenOcrTypeDiffers() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
        b.setOcrType("Normal");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing ocrRenderType (String) breaks equality")
    void notEqualWhenOcrRenderTypeDiffers() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
        b.setOcrRenderType("hocr");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on a boolean field (deskew) breaks equality")
    void notEqualWhenBooleanFieldDiffers() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
        b.setDeskew(false);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper=true picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper chain must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();
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
        ProcessPdfWithOcrRequest a = buildPopulated();
        ProcessPdfWithOcrRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setOcrType("force-ocr");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("ocrType"), () -> "Unexpected toString: " + text);
    }

    private ProcessPdfWithOcrRequest buildPopulated() {
        ProcessPdfWithOcrRequest r = new ProcessPdfWithOcrRequest();
        r.setLanguages(List.of("eng", "deu"));
        r.setSidecar(true);
        r.setDeskew(true);
        r.setClean(true);
        r.setCleanFinal(true);
        r.setOcrType("force-ocr");
        r.setOcrRenderType("sandwich");
        r.setRemoveImagesAfter(true);
        r.setFileId("file-1");
        return r;
    }
}
