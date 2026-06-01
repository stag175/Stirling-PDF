package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class MetadataRequestTest {

    private MetadataRequest request;

    @BeforeEach
    void setUp() {
        request = new MetadataRequest();
    }

    @Test
    @DisplayName("All declared fields default to null on a fresh instance (no primitives)")
    void uninitialisedFieldsDefaultToNull() {
        // deleteAll is a boxed Boolean (not primitive), so it defaults to null, not false.
        assertNull(request.getDeleteAll());
        assertNull(request.getAuthor());
        assertNull(request.getCreationDate());
        assertNull(request.getCreator());
        assertNull(request.getKeywords());
        assertNull(request.getModificationDate());
        assertNull(request.getProducer());
        assertNull(request.getSubject());
        assertNull(request.getTitle());
        assertNull(request.getTrapped());
        assertNull(request.getAllRequestParams());
    }

    @Test
    @DisplayName("Inherited fields default to null (fileId, fileInput from PDFFile)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileId(), "inherited from PDFFile");
        assertNull(request.getFileInput(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return the values set via setters for every declared field")
    void gettersReturnSetValues() {
        Map<String, String> params = new HashMap<>();
        params.put("customKeyFoo", "bar");

        request.setDeleteAll(Boolean.TRUE);
        request.setAuthor("Ada Lovelace");
        request.setCreationDate("2023/10/01 12:00:00");
        request.setCreator("Stirling-PDF");
        request.setKeywords("pdf,metadata,test");
        request.setModificationDate("2024/01/15 09:30:00");
        request.setProducer("PDFBox");
        request.setSubject("Unit testing");
        request.setTitle("My Document");
        request.setTrapped("True");
        request.setAllRequestParams(params);

        assertEquals(Boolean.TRUE, request.getDeleteAll());
        assertEquals("Ada Lovelace", request.getAuthor());
        assertEquals("2023/10/01 12:00:00", request.getCreationDate());
        assertEquals("Stirling-PDF", request.getCreator());
        assertEquals("pdf,metadata,test", request.getKeywords());
        assertEquals("2024/01/15 09:30:00", request.getModificationDate());
        assertEquals("PDFBox", request.getProducer());
        assertEquals("Unit testing", request.getSubject());
        assertEquals("My Document", request.getTitle());
        assertEquals("True", request.getTrapped());
        assertSame(params, request.getAllRequestParams());
        assertEquals("bar", request.getAllRequestParams().get("customKeyFoo"));
    }

    @Test
    @DisplayName("deleteAll accepts TRUE, FALSE and null")
    void deleteAllTriStateBoolean() {
        request.setDeleteAll(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getDeleteAll());

        request.setDeleteAll(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getDeleteAll());

        request.setDeleteAll(null);
        assertNull(request.getDeleteAll());
    }

    @Test
    @DisplayName("trapped accepts the documented allowable values True/False/Unknown")
    void trappedAllowableValues() {
        request.setTrapped("True");
        assertEquals("True", request.getTrapped());

        request.setTrapped("False");
        assertEquals("False", request.getTrapped());

        request.setTrapped("Unknown");
        assertEquals("Unknown", request.getTrapped());
    }

    @Test
    @DisplayName("Nullable reference fields can be reset to null after being set")
    void nullableFieldsAcceptNull() {
        request.setAuthor("someone");
        request.setAuthor(null);
        assertNull(request.getAuthor());

        request.setAllRequestParams(new HashMap<>());
        request.setAllRequestParams(null);
        assertNull(request.getAllRequestParams());
    }

    @Test
    @DisplayName("allRequestParams stores an empty map and a populated map as-is")
    void allRequestParamsMapHandling() {
        Map<String, String> empty = new HashMap<>();
        request.setAllRequestParams(empty);
        assertSame(empty, request.getAllRequestParams());
        assertTrue(request.getAllRequestParams().isEmpty());

        Map<String, String> populated = new LinkedHashMap<>();
        populated.put("customKey1", "customValue1");
        populated.put("customKey2", "customValue2");
        request.setAllRequestParams(populated);
        assertEquals(2, request.getAllRequestParams().size());
        assertEquals("customValue2", request.getAllRequestParams().get("customKey2"));
    }

    @Test
    @DisplayName("Inherited setters/getters work across the PDFFile hierarchy")
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
        MetadataRequest other = new MetadataRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();
        b.setTitle("A different title");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on deleteAll breaks equality")
    void notEqualWhenDeleteAllDiffers() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();
        b.setDeleteAll(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the allRequestParams map breaks equality")
    void notEqualWhenMapDiffers() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();
        Map<String, String> other = new HashMap<>();
        other.put("customKeyX", "different");
        b.setAllRequestParams(other);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();
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
        MetadataRequest a = buildPopulated();
        MetadataRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative declared field name")
    void toStringContainsFieldNames() {
        request.setTitle("My Document");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("title"), () -> "Unexpected toString: " + text);
    }

    private MetadataRequest buildPopulated() {
        MetadataRequest r = new MetadataRequest();
        r.setDeleteAll(Boolean.TRUE);
        r.setAuthor("Ada Lovelace");
        r.setCreationDate("2023/10/01 12:00:00");
        r.setCreator("Stirling-PDF");
        r.setKeywords("pdf,metadata,test");
        r.setModificationDate("2024/01/15 09:30:00");
        r.setProducer("PDFBox");
        r.setSubject("Unit testing");
        r.setTitle("My Document");
        r.setTrapped("False");
        Map<String, String> params = new HashMap<>();
        params.put("customKeyFoo", "customValueBar");
        r.setAllRequestParams(params);
        r.setFileId("file-1");
        return r;
    }
}
