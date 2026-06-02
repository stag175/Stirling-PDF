package stirling.software.SPDF.model.api;

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

class SplitPdfBySectionsRequestTest {

    private static Validator validator;

    private SplitPdfBySectionsRequest request;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new SplitPdfBySectionsRequest();
    }

    // ---------------------------------------------------------------------
    // POJO accessor / default-state behaviour
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Uninitialised primitive int fields default to JVM zero")
    void uninitialisedPrimitivesDefaultToZero() {
        assertEquals(0, request.getHorizontalDivisions());
        assertEquals(0, request.getVerticalDivisions());
    }

    @Test
    @DisplayName("Uninitialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getPageNumbers());
        assertNull(request.getSplitMode());
        assertNull(request.getMerge());
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
        request.setPageNumbers("1,3,5-7");
        request.setSplitMode("CUSTOM");
        request.setHorizontalDivisions(3);
        request.setVerticalDivisions(2);
        request.setMerge(Boolean.TRUE);

        assertEquals("1,3,5-7", request.getPageNumbers());
        assertEquals("CUSTOM", request.getSplitMode());
        assertEquals(3, request.getHorizontalDivisions());
        assertEquals(2, request.getVerticalDivisions());
        assertEquals(Boolean.TRUE, request.getMerge());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy")
    void inheritedSettersAndGetters() {
        MultipartFile file =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3});
        request.setFileInput(file);
        request.setFileId("file-123");

        assertSame(file, request.getFileInput());
        assertEquals("file-123", request.getFileId());
    }

    @Test
    @DisplayName("Nullable reference fields can be reset to null")
    void nullableFieldsAcceptNull() {
        request.setMerge(Boolean.TRUE);
        request.setMerge(null);
        assertNull(request.getMerge());

        request.setSplitMode("SPLIT_ALL");
        request.setSplitMode(null);
        assertNull(request.getSplitMode());

        request.setPageNumbers("all");
        request.setPageNumbers(null);
        assertNull(request.getPageNumbers());
    }

    @Test
    @DisplayName("Boolean merge accepts both TRUE and FALSE")
    void mergeAcceptsBothBooleans() {
        request.setMerge(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getMerge());
        request.setMerge(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getMerge());
    }

    // ---------------------------------------------------------------------
    // Bean Validation: horizontalDivisions @Min(0) @Max(50)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("horizontalDivisions negative triggers @Min violation with configured message")
    void horizontalDivisions_negative_triggersMinViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(-1);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(
                                v ->
                                        "horizontalDivisions"
                                                .contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Horizontal divisions must be non-negative", message);
    }

    @Test
    @DisplayName("horizontalDivisions at lower boundary 0 is inclusive -> no violation")
    void horizontalDivisions_zero_noViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(0);

        assertFalse(hasViolation(req, "horizontalDivisions"));
    }

    @Test
    @DisplayName("horizontalDivisions at upper boundary 50 is inclusive -> no violation")
    void horizontalDivisions_atMaxBoundary_noViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(50);

        assertFalse(
                hasViolation(req, "horizontalDivisions"),
                () -> describe(validator.validate(req)));
    }

    @Test
    @DisplayName("horizontalDivisions above 50 triggers @Max violation with configured message")
    void horizontalDivisions_aboveMax_triggersMaxViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(51);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(
                                v ->
                                        "horizontalDivisions"
                                                .contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Horizontal divisions must not exceed 50", message);
    }

    @Test
    @DisplayName("horizontalDivisions within range -> no violation")
    void horizontalDivisions_withinRange_noViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(25);

        assertFalse(hasViolation(req, "horizontalDivisions"));
    }

    // ---------------------------------------------------------------------
    // Bean Validation: verticalDivisions @Min(0) @Max(50)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("verticalDivisions negative triggers @Min violation with configured message")
    void verticalDivisions_negative_triggersMinViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setVerticalDivisions(-5);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(
                                v ->
                                        "verticalDivisions"
                                                .contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Vertical divisions must be non-negative", message);
    }

    @Test
    @DisplayName("verticalDivisions at lower boundary 0 is inclusive -> no violation")
    void verticalDivisions_zero_noViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setVerticalDivisions(0);

        assertFalse(hasViolation(req, "verticalDivisions"));
    }

    @Test
    @DisplayName("verticalDivisions at upper boundary 50 is inclusive -> no violation")
    void verticalDivisions_atMaxBoundary_noViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setVerticalDivisions(50);

        assertFalse(
                hasViolation(req, "verticalDivisions"), () -> describe(validator.validate(req)));
    }

    @Test
    @DisplayName("verticalDivisions above 50 triggers @Max violation with configured message")
    void verticalDivisions_aboveMax_triggersMaxViolation() {
        SplitPdfBySectionsRequest req = validBase();
        req.setVerticalDivisions(51);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(
                                v ->
                                        "verticalDivisions"
                                                .contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Vertical divisions must not exceed 50", message);
    }

    // ---------------------------------------------------------------------
    // Bean Validation: combined / inherited constraints
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("A fully valid request produces no violations at all")
    void fullyValidRequest_noViolations() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(2);
        req.setVerticalDivisions(2);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        assertTrue(
                violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    @Test
    @DisplayName("Multiple invalid fields surface independent violations simultaneously")
    void multipleInvalidFields_allReported() {
        SplitPdfBySectionsRequest req = validBase();
        req.setHorizontalDivisions(-1); // < 0
        req.setVerticalDivisions(51); // > 50

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);

        assertTrue(hasViolation(req, "horizontalDivisions"), () -> describe(violations));
        assertTrue(hasViolation(req, "verticalDivisions"), () -> describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when neither fileInput nor fileId set")
    void inheritedAssertTrue_failsWhenNoFileProvided() {
        SplitPdfBySectionsRequest req = new SplitPdfBySectionsRequest();
        // make the subclass constraints pass so only the inherited one can fire
        req.setHorizontalDivisions(2);
        req.setVerticalDivisions(2);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);

        // The @AssertTrue is on boolean property "valid" (derived from isValid()).
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
    @DisplayName("Inherited @AssertTrue isValid passes when only fileInput is provided")
    void inheritedAssertTrue_passesWithFileInputOnly() {
        SplitPdfBySectionsRequest req = new SplitPdfBySectionsRequest();
        req.setFileInput(
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3}));
        req.setHorizontalDivisions(2);
        req.setVerticalDivisions(2);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertFalse(hasValidViolation, () -> describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when both fileInput and fileId provided")
    void inheritedAssertTrue_failsWhenBothProvided() {
        SplitPdfBySectionsRequest req = new SplitPdfBySectionsRequest();
        req.setFileInput(
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", new byte[] {1, 2, 3}));
        req.setFileId("file-1");
        req.setHorizontalDivisions(2);
        req.setVerticalDivisions(2);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(
                hasValidViolation,
                () -> "Expected 'valid' violation when both inputs set, got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when fileId is blank whitespace")
    void inheritedAssertTrue_failsWhenFileIdBlank() {
        SplitPdfBySectionsRequest req = new SplitPdfBySectionsRequest();
        req.setFileId("   ");
        req.setHorizontalDivisions(2);
        req.setVerticalDivisions(2);

        Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations = validator.validate(req);
        boolean hasValidViolation =
                violations.stream()
                        .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
        assertTrue(hasValidViolation, () -> describe(violations));
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString (Lombok @Data + @EqualsAndHashCode(callSuper=true))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        SplitPdfBySectionsRequest other = new SplitPdfBySectionsRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
        b.setHorizontalDivisions(9);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing verticalDivisions breaks equality")
    void notEqualWhenVerticalDivisionsDiffers() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
        b.setVerticalDivisions(9);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing splitMode breaks equality")
    void notEqualWhenSplitModeDiffers() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
        b.setSplitMode("SPLIT_ALL");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing merge flag breaks equality")
    void notEqualWhenMergeDiffers() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
        b.setMerge(Boolean.TRUE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();
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
        SplitPdfBySectionsRequest a = buildPopulated();
        SplitPdfBySectionsRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setSplitMode("CUSTOM");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("splitMode"), () -> "Unexpected toString: " + text);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Builds a request whose only differences from a fully-valid one are the field(s) the caller
     * intends to mutate. A non-empty {@code fileId} satisfies the inherited {@link
     * stirling.software.common.model.api.PDFFile} {@code @AssertTrue isValid()} constraint so that
     * tests can isolate the subclass constraints (horizontalDivisions / verticalDivisions).
     */
    private SplitPdfBySectionsRequest validBase() {
        SplitPdfBySectionsRequest r = new SplitPdfBySectionsRequest();
        r.setFileId("server-file-1");
        r.setHorizontalDivisions(2);
        r.setVerticalDivisions(2);
        return r;
    }

    private SplitPdfBySectionsRequest buildPopulated() {
        SplitPdfBySectionsRequest r = new SplitPdfBySectionsRequest();
        r.setPageNumbers("1,3,5-7");
        r.setSplitMode("CUSTOM");
        r.setHorizontalDivisions(3);
        r.setVerticalDivisions(2);
        r.setMerge(Boolean.FALSE);
        r.setFileId("file-1");
        return r;
    }

    private static boolean hasViolation(SplitPdfBySectionsRequest req, String property) {
        return validator.validate(req).stream()
                .anyMatch(v -> property.contentEquals(v.getPropertyPath().toString()));
    }

    private static String describe(Set<ConstraintViolation<SplitPdfBySectionsRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }
}
