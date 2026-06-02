package stirling.software.SPDF.model.api.general;

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

class BookletImpositionRequestTest {

    private BookletImpositionRequest request;

    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new BookletImpositionRequest();
    }

    @Test
    @DisplayName("Explicit field defaults: pagesPerSheet=2, spineLocation=LEFT, duplexPass=BOTH")
    void explicitDefaults() {
        assertEquals(2, request.getPagesPerSheet(), "pagesPerSheet must default to 2");
        assertEquals("LEFT", request.getSpineLocation(), "spineLocation must default to LEFT");
        assertEquals("BOTH", request.getDuplexPass(), "duplexPass must default to BOTH");
    }

    @Test
    @DisplayName("Explicit primitive float default: gutterSize=12f")
    void explicitFloatDefault() {
        assertEquals(12f, request.getGutterSize(), 0.0f, "gutterSize must default to 12");
    }

    @Test
    @DisplayName("Explicit Boolean wrapper defaults are non-null (false/false/true/false)")
    void explicitBooleanDefaults() {
        // Unlike many sibling DTOs, these Boolean fields are initialised explicitly,
        // so they default to non-null wrapper values rather than null.
        assertEquals(Boolean.FALSE, request.getAddBorder(), "addBorder default is FALSE, not null");
        assertEquals(Boolean.FALSE, request.getAddGutter(), "addGutter default is FALSE, not null");
        assertEquals(
                Boolean.TRUE, request.getDoubleSided(), "doubleSided default is TRUE, not null");
        assertEquals(
                Boolean.FALSE,
                request.getFlipOnShortEdge(),
                "flipOnShortEdge default is FALSE, not null");
    }

    @Test
    @DisplayName("Inherited fields default to null (fileInput, fileId)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileInput(), "inherited from PDFFile");
        assertNull(request.getFileId(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return the values set via setters (all subclass fields)")
    void gettersReturnSetValues() {
        request.setPagesPerSheet(2);
        request.setAddBorder(Boolean.TRUE);
        request.setSpineLocation("RIGHT");
        request.setAddGutter(Boolean.TRUE);
        request.setGutterSize(24.5f);
        request.setDoubleSided(Boolean.FALSE);
        request.setDuplexPass("FIRST");
        request.setFlipOnShortEdge(Boolean.TRUE);

        assertEquals(2, request.getPagesPerSheet());
        assertEquals(Boolean.TRUE, request.getAddBorder());
        assertEquals("RIGHT", request.getSpineLocation());
        assertEquals(Boolean.TRUE, request.getAddGutter());
        assertEquals(24.5f, request.getGutterSize(), 0.0001f);
        assertEquals(Boolean.FALSE, request.getDoubleSided());
        assertEquals("FIRST", request.getDuplexPass());
        assertEquals(Boolean.TRUE, request.getFlipOnShortEdge());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy")
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
    @DisplayName("spineLocation accepts each documented allowable value (LEFT, RIGHT)")
    void spineLocationAllowableValues() {
        request.setSpineLocation("LEFT");
        assertEquals("LEFT", request.getSpineLocation());

        request.setSpineLocation("RIGHT");
        assertEquals("RIGHT", request.getSpineLocation());
    }

    @Test
    @DisplayName("duplexPass accepts each documented allowable value (BOTH, FIRST, SECOND)")
    void duplexPassAllowableValues() {
        for (String value : new String[] {"BOTH", "FIRST", "SECOND"}) {
            request.setDuplexPass(value);
            assertEquals(value, request.getDuplexPass());
        }
    }

    @Test
    @DisplayName("gutterSize accepts zero, fractional and large values")
    void gutterSizeBoundaryValues() {
        request.setGutterSize(0f);
        assertEquals(0f, request.getGutterSize(), 0.0f);

        request.setGutterSize(0.5f);
        assertEquals(0.5f, request.getGutterSize(), 0.0001f);

        request.setGutterSize(1000.75f);
        assertEquals(1000.75f, request.getGutterSize(), 0.0001f);
    }

    @Test
    @DisplayName("addBorder accepts TRUE, FALSE and explicit null")
    void addBorderTriState() {
        request.setAddBorder(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getAddBorder());

        request.setAddBorder(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getAddBorder());

        request.setAddBorder(null);
        assertNull(request.getAddBorder());
    }

    @Test
    @DisplayName("doubleSided accepts TRUE, FALSE and explicit null")
    void doubleSidedTriState() {
        request.setDoubleSided(Boolean.FALSE);
        assertEquals(Boolean.FALSE, request.getDoubleSided());

        request.setDoubleSided(Boolean.TRUE);
        assertEquals(Boolean.TRUE, request.getDoubleSided());

        request.setDoubleSided(null);
        assertNull(request.getDoubleSided());
    }

    @Test
    @DisplayName("Nullable string fields can be set then reset to null")
    void nullableStringFieldsAcceptNull() {
        request.setSpineLocation("RIGHT");
        request.setSpineLocation(null);
        assertNull(request.getSpineLocation());

        request.setDuplexPass("FIRST");
        request.setDuplexPass(null);
        assertNull(request.getDuplexPass());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        BookletImpositionRequest other = new BookletImpositionRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();
        b.setSpineLocation("LEFT");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the Boolean doubleSided breaks equality")
    void notEqualWhenDoubleSidedDiffers() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();
        b.setDoubleSided(Boolean.TRUE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing primitive float gutterSize breaks equality")
    void notEqualWhenGutterSizeDiffers() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();
        b.setGutterSize(99.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();
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
        BookletImpositionRequest a = buildPopulated();
        BookletImpositionRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes representative field names")
    void toStringContainsFieldNames() {
        request.setSpineLocation("RIGHT");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("spineLocation"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("pagesPerSheet"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("duplexPass"), () -> "Unexpected toString: " + text);
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: missing both fileInput and fileId -> violation")
    void validation_missingFileInputAndFileId_triggersViolation() {
        Set<ConstraintViolation<BookletImpositionRequest>> violations = validator.validate(request);

        assertTrue(
                hasValidViolation(violations),
                () -> "Expected an inherited isValid violation, but got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: fileInput present -> no isValid violation")
    void validation_fileInputPresent_noViolation() {
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3}));

        Set<ConstraintViolation<BookletImpositionRequest>> violations = validator.validate(request);

        assertFalse(
                hasValidViolation(violations),
                () -> "Did not expect an isValid violation, but got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: fileId present -> no isValid violation")
    void validation_fileIdPresent_noViolation() {
        request.setFileId("server-file-id");

        Set<ConstraintViolation<BookletImpositionRequest>> violations = validator.validate(request);

        assertFalse(
                hasValidViolation(violations),
                () -> "Did not expect an isValid violation, but got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: both fileInput and fileId -> violation")
    void validation_bothFileInputAndFileId_triggersViolation() {
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3}));
        request.setFileId("server-file-id");

        Set<ConstraintViolation<BookletImpositionRequest>> violations = validator.validate(request);

        assertTrue(
                hasValidViolation(violations),
                () ->
                        "Expected an isValid violation when both fileInput and fileId set, but got: "
                                + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: blank fileId is treated as absent -> violation")
    void validation_blankFileId_triggersViolation() {
        request.setFileId("   ");

        Set<ConstraintViolation<BookletImpositionRequest>> violations = validator.validate(request);

        assertTrue(
                hasValidViolation(violations),
                () ->
                        "Expected an isValid violation for a blank fileId, but got: "
                                + describe(violations));
    }

    private static boolean hasValidViolation(
            Set<ConstraintViolation<BookletImpositionRequest>> violations) {
        return violations.stream()
                .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
    }

    private static String describe(Set<ConstraintViolation<BookletImpositionRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }

    private BookletImpositionRequest buildPopulated() {
        BookletImpositionRequest r = new BookletImpositionRequest();
        r.setPagesPerSheet(2);
        r.setAddBorder(Boolean.TRUE);
        r.setSpineLocation("RIGHT");
        r.setAddGutter(Boolean.TRUE);
        r.setGutterSize(18.0f);
        r.setDoubleSided(Boolean.FALSE);
        r.setDuplexPass("SECOND");
        r.setFlipOnShortEdge(Boolean.TRUE);
        r.setFileId("file-1");
        return r;
    }
}
