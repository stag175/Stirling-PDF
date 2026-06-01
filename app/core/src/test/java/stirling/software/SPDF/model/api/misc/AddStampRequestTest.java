package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class AddStampRequestTest {

    private AddStampRequest request;

    @BeforeEach
    void setUp() {
        request = new AddStampRequest();
    }

    @Test
    @DisplayName("Field defaults: alphabet=roman; overrideX/overrideY uninitialised (0.0f)")
    void explicitDefaults() {
        assertEquals("roman", request.getAlphabet(), "alphabet must default to 'roman'");
        // NOTE: the source comments overrideX/overrideY as "Default to -1 indicating no override",
        // but the fields have NO initialiser, so they actually default to the JVM float zero.
        // Asserting the real behaviour (0.0f). The misleading comment is worth a maintainer look.
        assertEquals(0.0f, request.getOverrideX(), 0.0f, "overrideX defaults to 0.0f (no initialiser)");
        assertEquals(0.0f, request.getOverrideY(), 0.0f, "overrideY defaults to 0.0f (no initialiser)");
    }

    @Test
    @DisplayName("Non-initialised primitive fields default to JVM zero values")
    void uninitialisedPrimitivesDefaultToZero() {
        assertEquals(0.0f, request.getFontSize(), 0.0f);
        assertEquals(0.0f, request.getRotation(), 0.0f);
        assertEquals(0.0f, request.getOpacity(), 0.0f);
        assertEquals(0, request.getPosition());
    }

    @Test
    @DisplayName("Non-initialised reference fields default to null")
    void uninitialisedReferencesDefaultToNull() {
        assertNull(request.getStampType());
        assertNull(request.getStampText());
        assertNull(request.getStampImage());
        assertNull(request.getCustomMargin());
        assertNull(request.getCustomColor());
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
        request.setStampType("text");
        request.setStampText("Stirling Software");
        request.setAlphabet("arabic");
        request.setFontSize(40.0f);
        request.setRotation(45.0f);
        request.setOpacity(0.5f);
        request.setPosition(8);
        request.setOverrideX(120.5f);
        request.setOverrideY(240.25f);
        request.setCustomMargin("large");
        request.setCustomColor("#d3d3d3");

        assertEquals("text", request.getStampType());
        assertEquals("Stirling Software", request.getStampText());
        assertEquals("arabic", request.getAlphabet());
        assertEquals(40.0f, request.getFontSize(), 0.0001f);
        assertEquals(45.0f, request.getRotation(), 0.0001f);
        assertEquals(0.5f, request.getOpacity(), 0.0001f);
        assertEquals(8, request.getPosition());
        assertEquals(120.5f, request.getOverrideX(), 0.0001f);
        assertEquals(240.25f, request.getOverrideY(), 0.0001f);
        assertEquals("large", request.getCustomMargin());
        assertEquals("#d3d3d3", request.getCustomColor());
    }

    @Test
    @DisplayName("stampImage setter/getter accept a MultipartFile (image stamp type)")
    void stampImageSetterAndGetter() {
        MultipartFile image =
                new MockMultipartFile(
                        "stampImage", "stamp.png", "image/png", new byte[] {9, 8, 7});
        request.setStampType("image");
        request.setStampImage(image);

        assertEquals("image", request.getStampType());
        assertSame(image, request.getStampImage());
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
    @DisplayName("Opacity boundary values 0.0 and 1.0 are accepted")
    void opacityBoundaryValues() {
        request.setOpacity(0.0f);
        assertEquals(0.0f, request.getOpacity(), 0.0f);

        request.setOpacity(1.0f);
        assertEquals(1.0f, request.getOpacity(), 0.0f);
    }

    @Test
    @DisplayName("Override coordinates can be reset to the no-override sentinel (-1)")
    void overrideCoordinatesCanReturnToSentinel() {
        request.setOverrideX(50.0f);
        request.setOverrideY(60.0f);
        request.setOverrideX(-1f);
        request.setOverrideY(-1f);

        assertEquals(-1f, request.getOverrideX(), 0.0f);
        assertEquals(-1f, request.getOverrideY(), 0.0f);
    }

    @Test
    @DisplayName("Negative rotation is accepted (no validation in the DTO)")
    void negativeRotationAccepted() {
        request.setRotation(-90.0f);
        assertEquals(-90.0f, request.getRotation(), 0.0001f);
    }

    @Test
    @DisplayName("Null reference fields can be set explicitly to null")
    void nullableFieldsAcceptNull() {
        request.setStampText("something");
        request.setStampText(null);
        assertNull(request.getStampText());

        request.setAlphabet(null);
        assertNull(request.getAlphabet());

        request.setCustomColor("#000000");
        request.setCustomColor(null);
        assertNull(request.getCustomColor());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        AddStampRequest other = new AddStampRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setPosition(5);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing alphabet breaks equality")
    void notEqualWhenAlphabetDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setAlphabet("japanese");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing overrideX (float) breaks equality")
    void notEqualWhenOverrideXDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setOverrideX(999.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited pageNumbers difference (PDFWithPageNums)")
    void notEqualWhenInheritedPageNumbersDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setPageNumbers("1-3");

        assertNotEquals(a, b, "callSuper=true must factor PDFWithPageNums.pageNumbers into equals");
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper chain must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
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
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("equals: differing fontSize (float) breaks equality")
    void notEqualWhenFontSizeDiffers() {
        AddStampRequest a = buildPopulated();
        AddStampRequest b = buildPopulated();
        b.setFontSize(99.0f);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setStampType("text");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("stampType"), () -> "Unexpected toString: " + text);
    }

    private AddStampRequest buildPopulated() {
        AddStampRequest r = new AddStampRequest();
        r.setStampType("text");
        r.setStampText("Stirling Software");
        r.setAlphabet("roman");
        r.setFontSize(40.0f);
        r.setRotation(0.0f);
        r.setOpacity(0.5f);
        r.setPosition(8);
        r.setOverrideX(-1f);
        r.setOverrideY(-1f);
        r.setCustomMargin("medium");
        r.setCustomColor("#d3d3d3");
        r.setPageNumbers("all");
        r.setFileId("file-1");
        return r;
    }
}
