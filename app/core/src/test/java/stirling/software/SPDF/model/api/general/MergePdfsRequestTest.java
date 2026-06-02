package stirling.software.SPDF.model.api.general;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class MergePdfsRequestTest {

    private MergePdfsRequest request;

    @BeforeEach
    void setUp() {
        request = new MergePdfsRequest();
    }

    @Test
    @DisplayName("Explicit field default: sortType defaults to 'orderProvided'")
    void explicitDefaultSortType() {
        assertEquals(
                "orderProvided", request.getSortType(), "sortType must default to orderProvided");
    }

    @Test
    @DisplayName("Explicit field default: generateToc defaults to false")
    void explicitDefaultGenerateToc() {
        assertFalse(request.isGenerateToc(), "generateToc primitive must default to false");
    }

    @Test
    @DisplayName("Non-initialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getRemoveCertSign(), "Boolean wrapper defaults to null, not false");
        assertNull(request.getClientFileIds());
    }

    @Test
    @DisplayName("Inherited field default: fileInput is null")
    void inheritedFieldDefaultsToNull() {
        assertNull(request.getFileInput(), "inherited from MultiplePDFFiles");
    }

    @Test
    @DisplayName("Getters return the values set via setters (all subclass fields)")
    void gettersReturnSetValues() {
        request.setSortType("byFileName");
        request.setRemoveCertSign(Boolean.TRUE);
        request.setGenerateToc(true);
        request.setClientFileIds("[\"id-1\",\"id-2\"]");

        assertEquals("byFileName", request.getSortType());
        assertEquals(Boolean.TRUE, request.getRemoveCertSign());
        assertTrue(request.isGenerateToc());
        assertEquals("[\"id-1\",\"id-2\"]", request.getClientFileIds());
    }

    @Test
    @DisplayName("Inherited setter/getter works across the hierarchy (fileInput array)")
    void inheritedSetterAndGetter() {
        MultipartFile[] files = {
            new MockMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[] {1, 2, 3}),
            new MockMultipartFile("fileInput", "b.pdf", "application/pdf", new byte[] {4, 5, 6})
        };
        request.setFileInput(files);

        assertSame(files, request.getFileInput());
        assertEquals(2, request.getFileInput().length);
    }

    @Test
    @DisplayName("sortType accepts each documented allowable value")
    void sortTypeAllowableValues() {
        for (String value :
                new String[] {
                    "orderProvided", "byFileName", "byDateModified", "byDateCreated", "byPDFTitle"
                }) {
            request.setSortType(value);
            assertEquals(value, request.getSortType());
        }
    }

    @Test
    @DisplayName("removeCertSign Boolean accepts TRUE, FALSE and explicit null")
    void removeCertSignTriState() {
        request.setRemoveCertSign(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getRemoveCertSign());

        request.setRemoveCertSign(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getRemoveCertSign());

        request.setRemoveCertSign(null);
        assertNull(request.getRemoveCertSign());
    }

    @Test
    @DisplayName("generateToc primitive boolean toggles true/false")
    void generateTocToggles() {
        request.setGenerateToc(true);
        assertTrue(request.isGenerateToc());

        request.setGenerateToc(false);
        assertFalse(request.isGenerateToc());
    }

    @Test
    @DisplayName("Nullable string fields can be set then reset to null")
    void nullableFieldsAcceptNull() {
        request.setSortType("byPDFTitle");
        request.setSortType(null);
        assertNull(request.getSortType());

        request.setClientFileIds("[\"x\"]");
        request.setClientFileIds(null);
        assertNull(request.getClientFileIds());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        MergePdfsRequest other = new MergePdfsRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        // Reuse the SAME MultipartFile array instance: MockMultipartFile does not override
        // equals(), so distinct instances would not be element-equal under deepEquals.
        MultipartFile[] files = {
            new MockMultipartFile("fileInput", "a.pdf", "application/pdf", new byte[] {1, 2, 3})
        };
        MergePdfsRequest a = buildPopulated(files);
        MergePdfsRequest b = buildPopulated(files);

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on sortType breaks equality")
    void notEqualWhenSortTypeDiffers() {
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);
        b.setSortType("byDateCreated");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the Boolean removeCertSign breaks equality")
    void notEqualWhenRemoveCertSignDiffers() {
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);
        b.setRemoveCertSign(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the generateToc primitive breaks equality")
    void notEqualWhenGenerateTocDiffers() {
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);
        b.setGenerateToc(false);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on clientFileIds breaks equality")
    void notEqualWhenClientFileIdsDiffers() {
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);
        b.setClientFileIds("[\"different\"]");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileInput difference")
    void notEqualWhenInheritedFileInputDiffers() {
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);
        b.setFileInput(
                new MultipartFile[] {
                    new MockMultipartFile("fileInput", "z.pdf", "application/pdf", new byte[] {9})
                });

        assertNotEquals(a, b, "callSuper=true must reach MultiplePDFFiles.fileInput");
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
        MergePdfsRequest a = buildPopulated(null);
        MergePdfsRequest b = buildPopulated(null);

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes representative field names")
    void toStringContainsFieldNames() {
        request.setSortType("byFileName");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("sortType"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("generateToc"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("removeCertSign"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("clientFileIds"), () -> "Unexpected toString: " + text);
    }

    private MergePdfsRequest buildPopulated(MultipartFile[] fileInput) {
        MergePdfsRequest r = new MergePdfsRequest();
        r.setSortType("byFileName");
        r.setRemoveCertSign(Boolean.TRUE);
        r.setGenerateToc(true);
        r.setClientFileIds("[\"id-1\"]");
        r.setFileInput(fileInput);
        return r;
    }
}
