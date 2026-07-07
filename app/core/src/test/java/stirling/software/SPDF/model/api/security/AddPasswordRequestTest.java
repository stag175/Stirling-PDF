package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class AddPasswordRequestTest {

    private AddPasswordRequest request;

    @BeforeEach
    void setUp() {
        request = new AddPasswordRequest();
    }

    @Test
    @DisplayName("keyLength defaults to 256 on a fresh instance")
    void keyLengthDefaultsTo256() {
        assertEquals(256, request.getKeyLength(), "keyLength must default to 256");
    }

    @Test
    @DisplayName("Password fields default to null (no initialiser)")
    void passwordFieldsDefaultToNull() {
        assertNull(request.getOwnerPassword());
        assertNull(request.getPassword());
    }

    @Test
    @DisplayName("All permission Boolean flags default to null (object wrappers, no initialiser)")
    void permissionFlagsDefaultToNull() {
        assertNull(request.getPreventAssembly());
        assertNull(request.getPreventExtractContent());
        assertNull(request.getPreventExtractForAccessibility());
        assertNull(request.getPreventFillInForm());
        assertNull(request.getPreventModify());
        assertNull(request.getPreventModifyAnnotations());
        assertNull(request.getPreventPrinting());
        assertNull(request.getPreventPrintingFaithful());
    }

    @Test
    @DisplayName("Inherited PDFFile fields default to null (fileId, fileInput)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileId(), "inherited from PDFFile");
        assertNull(request.getFileInput(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Password getters return the values set via setters")
    void passwordGettersReturnSetValues() {
        request.setOwnerPassword("owner-secret");
        request.setPassword("user-secret");

        assertEquals("owner-secret", request.getOwnerPassword());
        assertEquals("user-secret", request.getPassword());
    }

    @Test
    @DisplayName("keyLength setter/getter accept the documented allowable values 40, 128, 256")
    void keyLengthAcceptsAllowableValues() {
        request.setKeyLength(40);
        assertEquals(40, request.getKeyLength());

        request.setKeyLength(128);
        assertEquals(128, request.getKeyLength());

        request.setKeyLength(256);
        assertEquals(256, request.getKeyLength());
    }

    @Test
    @DisplayName("keyLength is a plain int with no DTO-level validation (out-of-range value accepted)")
    void keyLengthAcceptsOutOfRangeValue() {
        request.setKeyLength(0);
        assertEquals(0, request.getKeyLength());

        request.setKeyLength(-1);
        assertEquals(-1, request.getKeyLength());

        request.setKeyLength(9999);
        assertEquals(9999, request.getKeyLength());
    }

    @Test
    @DisplayName("Each permission Boolean flag can be set to TRUE")
    void permissionFlagsCanBeSetTrue() {
        request.setPreventAssembly(Boolean.TRUE);
        request.setPreventExtractContent(Boolean.TRUE);
        request.setPreventExtractForAccessibility(Boolean.TRUE);
        request.setPreventFillInForm(Boolean.TRUE);
        request.setPreventModify(Boolean.TRUE);
        request.setPreventModifyAnnotations(Boolean.TRUE);
        request.setPreventPrinting(Boolean.TRUE);
        request.setPreventPrintingFaithful(Boolean.TRUE);

        assertTrue(request.getPreventAssembly());
        assertTrue(request.getPreventExtractContent());
        assertTrue(request.getPreventExtractForAccessibility());
        assertTrue(request.getPreventFillInForm());
        assertTrue(request.getPreventModify());
        assertTrue(request.getPreventModifyAnnotations());
        assertTrue(request.getPreventPrinting());
        assertTrue(request.getPreventPrintingFaithful());
    }

    @Test
    @DisplayName("Each permission Boolean flag can be set to FALSE")
    void permissionFlagsCanBeSetFalse() {
        request.setPreventAssembly(Boolean.FALSE);
        request.setPreventExtractContent(Boolean.FALSE);
        request.setPreventExtractForAccessibility(Boolean.FALSE);
        request.setPreventFillInForm(Boolean.FALSE);
        request.setPreventModify(Boolean.FALSE);
        request.setPreventModifyAnnotations(Boolean.FALSE);
        request.setPreventPrinting(Boolean.FALSE);
        request.setPreventPrintingFaithful(Boolean.FALSE);

        assertFalse(request.getPreventAssembly());
        assertFalse(request.getPreventExtractContent());
        assertFalse(request.getPreventExtractForAccessibility());
        assertFalse(request.getPreventFillInForm());
        assertFalse(request.getPreventModify());
        assertFalse(request.getPreventModifyAnnotations());
        assertFalse(request.getPreventPrinting());
        assertFalse(request.getPreventPrintingFaithful());
    }

    @Test
    @DisplayName("Permission Boolean flags can be reset back to null")
    void permissionFlagsCanBeResetToNull() {
        request.setPreventModify(Boolean.TRUE);
        request.setPreventModify(null);
        assertNull(request.getPreventModify());

        request.setPreventPrinting(Boolean.FALSE);
        request.setPreventPrinting(null);
        assertNull(request.getPreventPrinting());
    }

    @Test
    @DisplayName("Password fields can be reset back to null")
    void passwordFieldsCanBeResetToNull() {
        request.setOwnerPassword("x");
        request.setOwnerPassword(null);
        assertNull(request.getOwnerPassword());

        request.setPassword("y");
        request.setPassword(null);
        assertNull(request.getPassword());
    }

    @Test
    @DisplayName("Empty-string passwords are accepted verbatim (no DTO-level normalisation)")
    void emptyStringPasswordsAccepted() {
        request.setOwnerPassword("");
        request.setPassword("");

        assertEquals("", request.getOwnerPassword());
        assertEquals("", request.getPassword());
    }

    @Test
    @DisplayName("Inherited PDFFile setters/getters work (fileId and fileInput)")
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
    @DisplayName("equals/hashCode: two default instances are equal (keyLength=256 each)")
    void equalsForDefaultInstances() {
        AddPasswordRequest other = new AddPasswordRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing keyLength breaks equality")
    void notEqualWhenKeyLengthDiffers() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
        b.setKeyLength(128);

        assertNotEquals(a, b);
        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing password breaks equality")
    void notEqualWhenPasswordDiffers() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
        b.setPassword("other-user-secret");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing ownerPassword breaks equality")
    void notEqualWhenOwnerPasswordDiffers() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
        b.setOwnerPassword("other-owner-secret");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on a permission flag (Boolean) breaks equality")
    void notEqualWhenPermissionFlagDiffers() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
        b.setPreventPrinting(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: TRUE vs null on a permission flag breaks equality")
    void notEqualWhenPermissionFlagTrueVsNull() {
        AddPasswordRequest a = new AddPasswordRequest();
        AddPasswordRequest b = new AddPasswordRequest();
        a.setPreventAssembly(Boolean.TRUE);
        // b leaves preventAssembly null

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();
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
        AddPasswordRequest a = buildPopulated();
        AddPasswordRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setPassword("secret");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("password"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("keyLength"), () -> "Unexpected toString: " + text);
    }

    private AddPasswordRequest buildPopulated() {
        AddPasswordRequest r = new AddPasswordRequest();
        r.setOwnerPassword("owner-secret");
        r.setPassword("user-secret");
        r.setKeyLength(256);
        r.setPreventAssembly(Boolean.TRUE);
        r.setPreventExtractContent(Boolean.FALSE);
        r.setPreventExtractForAccessibility(Boolean.TRUE);
        r.setPreventFillInForm(Boolean.FALSE);
        r.setPreventModify(Boolean.TRUE);
        r.setPreventModifyAnnotations(Boolean.FALSE);
        r.setPreventPrinting(Boolean.TRUE);
        r.setPreventPrintingFaithful(Boolean.FALSE);
        r.setFileId("file-1");
        return r;
    }
}
