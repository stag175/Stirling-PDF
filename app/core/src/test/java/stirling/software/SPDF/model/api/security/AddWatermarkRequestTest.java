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

class AddWatermarkRequestTest {

    private static Validator validator;

    private AddWatermarkRequest request;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new AddWatermarkRequest();
    }

    // ---------------------------------------------------------------------
    // POJO accessor / default-state behaviour
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Uninitialised primitive fields default to JVM zero values")
    void uninitialisedPrimitivesDefaultToZero() {
        assertEquals(0.0f, request.getFontSize(), 0.0f);
        assertEquals(0.0f, request.getRotation(), 0.0f);
        assertEquals(0.0f, request.getOpacity(), 0.0f);
        assertEquals(0, request.getWidthSpacer());
        assertEquals(0, request.getHeightSpacer());
    }

    @Test
    @DisplayName("Uninitialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getWatermarkType());
        assertNull(request.getWatermarkText());
        assertNull(request.getWatermarkImage());
        assertNull(request.getAlphabet());
        assertNull(request.getCustomColor());
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
        MultipartFile image =
                new MockMultipartFile("watermarkImage", "wm.png", "image/png", new byte[] {9, 8, 7});

        request.setWatermarkType("text");
        request.setWatermarkText("Stirling Software");
        request.setWatermarkImage(image);
        request.setAlphabet("roman");
        request.setFontSize(30.0f);
        request.setRotation(45.0f);
        request.setOpacity(0.5f);
        request.setWidthSpacer(50);
        request.setHeightSpacer(50);
        request.setCustomColor("#d3d3d3");
        request.setConvertPDFToImage(Boolean.TRUE);

        assertEquals("text", request.getWatermarkType());
        assertEquals("Stirling Software", request.getWatermarkText());
        assertSame(image, request.getWatermarkImage());
        assertEquals("roman", request.getAlphabet());
        assertEquals(30.0f, request.getFontSize(), 0.0001f);
        assertEquals(45.0f, request.getRotation(), 0.0001f);
        assertEquals(0.5f, request.getOpacity(), 0.0001f);
        assertEquals(50, request.getWidthSpacer());
        assertEquals(50, request.getHeightSpacer());
        assertEquals("#d3d3d3", request.getCustomColor());
        assertEquals(Boolean.TRUE, request.getConvertPDFToImage());
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
        request.setCustomColor("#ffffff");
        request.setCustomColor(null);
        assertNull(request.getCustomColor());

        request.setConvertPDFToImage(Boolean.FALSE);
        request.setConvertPDFToImage(null);
        assertNull(request.getConvertPDFToImage());
    }

    // ---------------------------------------------------------------------
    // Bean Validation: fontSize @DecimalMin("1.0")
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("fontSize below 1.0 (JVM default 0.0f) triggers @DecimalMin violation")
    void fontSize_belowMin_triggersViolation() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(0.0f); // below the @DecimalMin("1.0") floor (validBase sets a valid 30.0f)

        assertTrue(
                hasViolation(req, "fontSize"),
                () -> "Expected a fontSize violation, got: " + describe(validator.validate(req)));
    }

    @Test
    @DisplayName("fontSize just below boundary (0.999) triggers @DecimalMin violation")
    void fontSize_justBelowBoundary_triggersViolation() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(0.999f);

        assertTrue(hasViolation(req, "fontSize"));
    }

    @Test
    @DisplayName("fontSize exactly at boundary 1.0 is inclusive -> no violation")
    void fontSize_atBoundary_noViolation() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(1.0f);

        assertFalse(
                hasViolation(req, "fontSize"),
                () -> "Did not expect a fontSize violation, got: " + describe(validator.validate(req)));
    }

    @Test
    @DisplayName("fontSize well above minimum -> no violation")
    void fontSize_aboveMin_noViolation() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(30.0f);

        assertFalse(hasViolation(req, "fontSize"));
    }

    @Test
    @DisplayName("fontSize violation carries the configured message")
    void fontSize_violationMessage() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(0.5f);

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(v -> "fontSize".contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Font size must be at least 1.0", message);
    }

    // ---------------------------------------------------------------------
    // Bean Validation: widthSpacer @Min(0)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("widthSpacer negative triggers @Min violation with configured message")
    void widthSpacer_negative_triggersViolation() {
        AddWatermarkRequest req = validBase();
        req.setWidthSpacer(-1);

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(v -> "widthSpacer".contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Width spacer must be non-negative", message);
    }

    @Test
    @DisplayName("widthSpacer at boundary 0 is inclusive -> no violation")
    void widthSpacer_zero_noViolation() {
        AddWatermarkRequest req = validBase();
        req.setWidthSpacer(0);

        assertFalse(hasViolation(req, "widthSpacer"));
    }

    @Test
    @DisplayName("widthSpacer positive -> no violation")
    void widthSpacer_positive_noViolation() {
        AddWatermarkRequest req = validBase();
        req.setWidthSpacer(50);

        assertFalse(hasViolation(req, "widthSpacer"));
    }

    // ---------------------------------------------------------------------
    // Bean Validation: heightSpacer @Min(0)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("heightSpacer negative triggers @Min violation with configured message")
    void heightSpacer_negative_triggersViolation() {
        AddWatermarkRequest req = validBase();
        req.setHeightSpacer(-5);

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);
        String message =
                violations.stream()
                        .filter(v -> "heightSpacer".contentEquals(v.getPropertyPath().toString()))
                        .map(ConstraintViolation::getMessage)
                        .findFirst()
                        .orElse(null);

        assertEquals("Height spacer must be non-negative", message);
    }

    @Test
    @DisplayName("heightSpacer at boundary 0 is inclusive -> no violation")
    void heightSpacer_zero_noViolation() {
        AddWatermarkRequest req = validBase();
        req.setHeightSpacer(0);

        assertFalse(hasViolation(req, "heightSpacer"));
    }

    @Test
    @DisplayName("A fully valid request produces no violations at all")
    void fullyValidRequest_noViolations() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(30.0f);
        req.setWidthSpacer(50);
        req.setHeightSpacer(50);

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);
        assertTrue(violations.isEmpty(), () -> "Expected no violations, got: " + describe(violations));
    }

    @Test
    @DisplayName("Multiple invalid fields surface independent violations simultaneously")
    void multipleInvalidFields_allReported() {
        AddWatermarkRequest req = validBase();
        req.setFontSize(0.0f); // < 1.0
        req.setWidthSpacer(-1); // < 0
        req.setHeightSpacer(-1); // < 0

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);

        assertTrue(hasViolation(req, "fontSize"), () -> describe(violations));
        assertTrue(hasViolation(req, "widthSpacer"), () -> describe(violations));
        assertTrue(hasViolation(req, "heightSpacer"), () -> describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid fails when neither fileInput nor fileId set")
    void inheritedAssertTrue_failsWhenNoFileProvided() {
        AddWatermarkRequest req = new AddWatermarkRequest();
        // make the subclass constraints pass so only the inherited one can fire
        req.setFontSize(30.0f);
        req.setWidthSpacer(50);
        req.setHeightSpacer(50);

        Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(req);

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

    // ---------------------------------------------------------------------
    // equals / hashCode / toString (Lombok @Data + @EqualsAndHashCode(callSuper=true))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        AddWatermarkRequest other = new AddWatermarkRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();
        b.setRotation(90.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();
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
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("equals: differing fontSize (float) breaks equality")
    void notEqualWhenFontSizeDiffers() {
        AddWatermarkRequest a = buildPopulated();
        AddWatermarkRequest b = buildPopulated();
        b.setFontSize(99.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setWatermarkType("text");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("watermarkType"), () -> "Unexpected toString: " + text);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /**
     * Builds a request whose only differences from a fully-valid one are the field(s) the caller
     * intends to mutate. A non-empty {@code fileId} satisfies the inherited {@link
     * stirling.software.common.model.api.PDFFile} {@code @AssertTrue isValid()} constraint so that
     * tests can isolate the subclass constraints (fontSize/widthSpacer/heightSpacer).
     */
    private AddWatermarkRequest validBase() {
        AddWatermarkRequest r = new AddWatermarkRequest();
        r.setFileId("server-file-1");
        r.setFontSize(30.0f);
        r.setWidthSpacer(50);
        r.setHeightSpacer(50);
        return r;
    }

    private AddWatermarkRequest buildPopulated() {
        AddWatermarkRequest r = new AddWatermarkRequest();
        r.setWatermarkType("text");
        r.setWatermarkText("Stirling Software");
        r.setAlphabet("roman");
        r.setFontSize(30.0f);
        r.setRotation(0.0f);
        r.setOpacity(0.5f);
        r.setWidthSpacer(50);
        r.setHeightSpacer(50);
        r.setCustomColor("#d3d3d3");
        r.setConvertPDFToImage(Boolean.FALSE);
        r.setFileId("file-1");
        return r;
    }

    private static boolean hasViolation(AddWatermarkRequest req, String property) {
        return validator.validate(req).stream()
                .anyMatch(v -> property.contentEquals(v.getPropertyPath().toString()));
    }

    private static String describe(Set<ConstraintViolation<AddWatermarkRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }
}
