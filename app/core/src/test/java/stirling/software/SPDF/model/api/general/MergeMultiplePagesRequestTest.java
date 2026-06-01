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

class MergeMultiplePagesRequestTest {

    private MergeMultiplePagesRequest request;

    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @BeforeEach
    void setUp() {
        request = new MergeMultiplePagesRequest();
    }

    @Test
    @DisplayName("Explicit field default: pagesPerSheet defaults to 2")
    void explicitDefaultPagesPerSheet() {
        assertEquals(2, request.getPagesPerSheet(), "pagesPerSheet must default to 2");
    }

    @Test
    @DisplayName("Non-initialised primitive int fields default to JVM zero")
    void uninitialisedPrimitivesDefaultToZero() {
        assertEquals(0, request.getRows());
        assertEquals(0, request.getCols());
        assertEquals(0, request.getInnerMargin());
        assertEquals(0, request.getTopMargin());
        assertEquals(0, request.getBottomMargin());
        assertEquals(0, request.getLeftMargin());
        assertEquals(0, request.getRightMargin());
        assertEquals(0, request.getBorderWidth());
    }

    @Test
    @DisplayName("Non-initialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getMode());
        assertNull(request.getArrangement());
        assertNull(request.getReadingDirection());
        assertNull(request.getOrientation());
        assertNull(request.getAddBorder(), "Boolean wrapper defaults to null, not false");
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
        request.setMode("CUSTOM");
        request.setPagesPerSheet(16);
        request.setArrangement("BY_COLUMNS");
        request.setReadingDirection("RTL");
        request.setRows(3);
        request.setCols(2);
        request.setOrientation("LANDSCAPE");
        request.setInnerMargin(10);
        request.setTopMargin(20);
        request.setBottomMargin(30);
        request.setLeftMargin(40);
        request.setRightMargin(50);
        request.setBorderWidth(2);
        request.setAddBorder(Boolean.TRUE);

        assertEquals("CUSTOM", request.getMode());
        assertEquals(16, request.getPagesPerSheet());
        assertEquals("BY_COLUMNS", request.getArrangement());
        assertEquals("RTL", request.getReadingDirection());
        assertEquals(3, request.getRows());
        assertEquals(2, request.getCols());
        assertEquals("LANDSCAPE", request.getOrientation());
        assertEquals(10, request.getInnerMargin());
        assertEquals(20, request.getTopMargin());
        assertEquals(30, request.getBottomMargin());
        assertEquals(40, request.getLeftMargin());
        assertEquals(50, request.getRightMargin());
        assertEquals(2, request.getBorderWidth());
        assertEquals(Boolean.TRUE, request.getAddBorder());
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
    @DisplayName("pagesPerSheet accepts each documented allowable value")
    void pagesPerSheetAllowableValues() {
        for (int value : new int[] {2, 4, 9, 16}) {
            request.setPagesPerSheet(value);
            assertEquals(value, request.getPagesPerSheet());
        }
    }

    @Test
    @DisplayName("rows/cols accept documented boundary values 1 and 300")
    void rowsColsBoundaryValues() {
        request.setRows(1);
        request.setCols(1);
        assertEquals(1, request.getRows());
        assertEquals(1, request.getCols());

        request.setRows(300);
        request.setCols(300);
        assertEquals(300, request.getRows());
        assertEquals(300, request.getCols());
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
    @DisplayName("Nullable string fields can be set then reset to null")
    void nullableFieldsAcceptNull() {
        request.setMode("DEFAULT");
        request.setMode(null);
        assertNull(request.getMode());

        request.setArrangement("BY_ROWS");
        request.setArrangement(null);
        assertNull(request.getArrangement());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        MergeMultiplePagesRequest other = new MergeMultiplePagesRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();
        b.setPagesPerSheet(9);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on the Boolean addBorder breaks equality")
    void notEqualWhenAddBorderDiffers() {
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();
        b.setAddBorder(Boolean.FALSE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();
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
        MergeMultiplePagesRequest a = buildPopulated();
        MergeMultiplePagesRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setMode("CUSTOM");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("mode"), () -> "Unexpected toString: " + text);
        assertTrue(text.contains("pagesPerSheet"), () -> "Unexpected toString: " + text);
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: missing both fileInput and fileId -> violation")
    void validation_missingFileInputAndFileId_triggersViolation() {
        // Neither fileInput nor fileId provided -> PDFFile.isValid() returns false.
        Set<ConstraintViolation<MergeMultiplePagesRequest>> violations = validator.validate(request);

        assertTrue(
                hasValidViolation(violations),
                () ->
                        "Expected an inherited isValid violation, but got: "
                                + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: fileInput present -> no isValid violation")
    void validation_fileInputPresent_noViolation() {
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3}));

        Set<ConstraintViolation<MergeMultiplePagesRequest>> violations = validator.validate(request);

        assertFalse(
                hasValidViolation(violations),
                () -> "Did not expect an isValid violation, but got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: fileId present -> no isValid violation")
    void validation_fileIdPresent_noViolation() {
        request.setFileId("server-file-id");

        Set<ConstraintViolation<MergeMultiplePagesRequest>> violations = validator.validate(request);

        assertFalse(
                hasValidViolation(violations),
                () -> "Did not expect an isValid violation, but got: " + describe(violations));
    }

    @Test
    @DisplayName("Inherited @AssertTrue isValid: both fileInput and fileId -> violation")
    void validation_bothFileInputAndFileId_triggersViolation() {
        // Providing both is invalid per PDFFile.isValid() (exclusive-or semantics).
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3}));
        request.setFileId("server-file-id");

        Set<ConstraintViolation<MergeMultiplePagesRequest>> violations = validator.validate(request);

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

        Set<ConstraintViolation<MergeMultiplePagesRequest>> violations = validator.validate(request);

        assertTrue(
                hasValidViolation(violations),
                () ->
                        "Expected an isValid violation for a blank fileId, but got: "
                                + describe(violations));
    }

    private static boolean hasValidViolation(
            Set<ConstraintViolation<MergeMultiplePagesRequest>> violations) {
        return violations.stream()
                .anyMatch(v -> "valid".contentEquals(v.getPropertyPath().toString()));
    }

    private static String describe(Set<ConstraintViolation<MergeMultiplePagesRequest>> violations) {
        return violations.stream()
                .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                .collect(Collectors.joining(", "));
    }

    private MergeMultiplePagesRequest buildPopulated() {
        MergeMultiplePagesRequest r = new MergeMultiplePagesRequest();
        r.setMode("CUSTOM");
        r.setPagesPerSheet(4);
        r.setArrangement("BY_ROWS");
        r.setReadingDirection("LTR");
        r.setRows(3);
        r.setCols(2);
        r.setOrientation("PORTRAIT");
        r.setInnerMargin(5);
        r.setTopMargin(6);
        r.setBottomMargin(7);
        r.setLeftMargin(8);
        r.setRightMargin(9);
        r.setBorderWidth(1);
        r.setAddBorder(Boolean.TRUE);
        r.setFileId("file-1");
        return r;
    }
}
