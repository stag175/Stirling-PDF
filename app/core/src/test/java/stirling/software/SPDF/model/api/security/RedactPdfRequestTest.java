package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class RedactPdfRequestTest {

    private static Validator validator;

    private RedactPdfRequest request;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new RedactPdfRequest();
    }

    // ---------------------------------------------------------------------
    // POJO accessor / default-state behaviour
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Uninitialised primitive field defaults to JVM zero value")
    void uninitialisedPrimitiveDefaultsToZero() {
        assertEquals(0.0f, request.getCustomPadding(), 0.0f);
    }

    @Test
    @DisplayName("Uninitialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getListOfText());
        assertNull(request.getUseRegex());
        assertNull(request.getWholeWordSearch());
        assertNull(request.getRedactColor());
        assertNull(request.getConvertPDFToImage());
    }

    @Test
    @DisplayName("Inherited fields default to null (fileInput, fileId)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileInput(), "inherited from PDFFile");
        assertNull(request.getFileId(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return values set via setters (subclass fields)")
    void gettersReturnSetValues() {
        request.setListOfText("text,text2");
        request.setUseRegex(Boolean.TRUE);
        request.setWholeWordSearch(Boolean.TRUE);
        request.setRedactColor("#FF0000");
        request.setCustomPadding(0.25f);
        request.setConvertPDFToImage(Boolean.TRUE);

        assertEquals("text,text2", request.getListOfText());
        assertEquals(Boolean.TRUE, request.getUseRegex());
        assertEquals(Boolean.TRUE, request.getWholeWordSearch());
        assertEquals("#FF0000", request.getRedactColor());
        assertEquals(0.25f, request.getCustomPadding(), 0.0001f);
        assertEquals(Boolean.TRUE, request.getConvertPDFToImage());
    }

    @Test
    @DisplayName("Boolean fields accept FALSE distinctly from null")
    void booleanFieldsAcceptFalse() {
        request.setUseRegex(Boolean.FALSE);
        request.setWholeWordSearch(Boolean.FALSE);
        request.setConvertPDFToImage(Boolean.FALSE);

        assertEquals(Boolean.FALSE, request.getUseRegex());
        assertEquals(Boolean.FALSE, request.getWholeWordSearch());
        assertEquals(Boolean.FALSE, request.getConvertPDFToImage());
    }

    @Test
    @DisplayName("customPadding accepts negative and large float values (no constraint)")
    void customPaddingAcceptsAnyFloat() {
        request.setCustomPadding(-3.5f);
        assertEquals(-3.5f, request.getCustomPadding(), 0.0001f);

        request.setCustomPadding(123456.75f);
        assertEquals(123456.75f, request.getCustomPadding(), 0.0001f);
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy")
    void inheritedSettersAndGetters() {
        MultipartFile file =
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
        request.setFileInput(file);
        request.setFileId("file-123");

        assertSame(file, request.getFileInput());
        assertEquals("file-123", request.getFileId());
    }

    @Test
    @DisplayName("Nullable reference fields can be reset to null")
    void nullableFieldsAcceptNull() {
        request.setRedactColor("#ffffff");
        request.setRedactColor(null);
        assertNull(request.getRedactColor());

        request.setListOfText("a,b");
        request.setListOfText(null);
        assertNull(request.getListOfText());

        request.setConvertPDFToImage(Boolean.FALSE);
        request.setConvertPDFToImage(null);
        assertNull(request.getConvertPDFToImage());

        request.setUseRegex(Boolean.TRUE);
        request.setUseRegex(null);
        assertNull(request.getUseRegex());
    }

    // ---------------------------------------------------------------------
    // Bean Validation
    // RedactPdfRequest declares no constraints of its own; only the inherited
    // PDFFile @AssertTrue isValid() applies (exactly one of fileInput/fileId).
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when neither fileInput nor fileId set")
    void inheritedAssertTrue_failsWhenNoFileProvided() {
        RedactPdfRequest req = new RedactPdfRequest();
        req.setListOfText("secret");

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);

        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(
                hasValidViolation,
                () ->
                        "Expected inherited @AssertTrue 'valid' violation, got: "
                                + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue passes when only fileId provided -> no violations")
    void inheritedAssertTrue_passesWithFileId() {
        RedactPdfRequest req = new RedactPdfRequest();
        req.setFileId("server-file-1");

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);
        assertTrue(violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue passes when only fileInput provided -> no violations")
    void inheritedAssertTrue_passesWithFileInput() {
        RedactPdfRequest req = new RedactPdfRequest();
        req.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", new byte[] {1}));

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);
        assertTrue(violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue fails when BOTH fileInput and fileId provided")
    void inheritedAssertTrue_failsWhenBothProvided() {
        RedactPdfRequest req = new RedactPdfRequest();
        req.setFileInput(
                new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", new byte[] {1}));
        req.setFileId("server-file-1");

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);

        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(
                hasValidViolation,
                () -> "Expected 'valid' violation when both file sources set, got: "
                        + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue fails when fileId is blank/whitespace and no fileInput")
    void inheritedAssertTrue_failsWhenFileIdBlank() {
        RedactPdfRequest req = new RedactPdfRequest();
        req.setFileId("   ");

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);

        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(
                hasValidViolation,
                () -> "Expected 'valid' violation for blank fileId, got: " + describe(violations));
    }

    @Test
    @DisplayName("Setting all redaction fields with a valid file source produces no violations")
    void fullyPopulatedValidRequest_noViolations() {
        RedactPdfRequest req = buildPopulated();

        Set<ConstraintViolation<RedactPdfRequest>> violations = validator.validate(req);
        assertTrue(violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString (Lombok @Data + @EqualsAndHashCode(callSuper=true))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        RedactPdfRequest other = new RedactPdfRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();
        b.setListOfText("different");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing customPadding (primitive float) breaks equality")
    void notEqualWhenCustomPaddingDiffers() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();
        b.setCustomPadding(9.0f);

        assertNotEquals(a, b);
        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing Boolean useRegex breaks equality")
    void notEqualWhenUseRegexDiffers() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();
        b.setUseRegex(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();
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
        RedactPdfRequest a = buildPopulated();
        RedactPdfRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setListOfText("secret");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("listOfText"), () -> "Unexpected toString: " + text);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Builds a fully-populated request that satisfies the inherited {@link
     * stirling.software.common.model.api.PDFFile} {@code @AssertTrue isValid()} constraint via a
     * non-empty {@code fileId} (and no {@code fileInput}).
     */
    private RedactPdfRequest buildPopulated() {
        RedactPdfRequest r = new RedactPdfRequest();
        r.setListOfText("text,text2");
        r.setUseRegex(Boolean.TRUE);
        r.setWholeWordSearch(Boolean.FALSE);
        r.setRedactColor("#000000");
        r.setCustomPadding(0.1f);
        r.setConvertPDFToImage(Boolean.FALSE);
        r.setFileId("file-1");
        return r;
    }

    private static String describe(Set<ConstraintViolation<RedactPdfRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }
}
