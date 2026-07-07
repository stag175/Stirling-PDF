package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

class ReplaceAndInvertColorRequestTest {

    private ReplaceAndInvertColorRequest request;

    @BeforeEach
    void setUp() {
        request = new ReplaceAndInvertColorRequest();
    }

    @Test
    @DisplayName("All declared fields default to null on a fresh instance (no primitives)")
    void uninitialisedFieldsDefaultToNull() {
        assertNull(request.getReplaceAndInvertOption());
        assertNull(request.getHighContrastColorCombination());
        assertNull(request.getBackGroundColor());
        assertNull(request.getTextColor());
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
        request.setReplaceAndInvertOption(ReplaceAndInvert.CUSTOM_COLOR);
        request.setHighContrastColorCombination(HighContrastColorCombination.WHITE_TEXT_ON_BLACK);
        request.setBackGroundColor("16777215");
        request.setTextColor("0");

        assertEquals(ReplaceAndInvert.CUSTOM_COLOR, request.getReplaceAndInvertOption());
        assertEquals(
                HighContrastColorCombination.WHITE_TEXT_ON_BLACK,
                request.getHighContrastColorCombination());
        assertEquals("16777215", request.getBackGroundColor());
        assertEquals("0", request.getTextColor());
    }

    @Test
    @DisplayName("replaceAndInvertOption accepts every enum constant")
    void replaceAndInvertOptionAllValues() {
        for (ReplaceAndInvert option : ReplaceAndInvert.values()) {
            request.setReplaceAndInvertOption(option);
            assertEquals(option, request.getReplaceAndInvertOption());
        }
    }

    @Test
    @DisplayName("highContrastColorCombination accepts every enum constant")
    void highContrastColorCombinationAllValues() {
        for (HighContrastColorCombination combo : HighContrastColorCombination.values()) {
            request.setHighContrastColorCombination(combo);
            assertEquals(combo, request.getHighContrastColorCombination());
        }
    }

    @Test
    @DisplayName("Nullable reference fields can be reset to null after being set")
    void nullableFieldsAcceptNull() {
        request.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);
        request.setReplaceAndInvertOption(null);
        assertNull(request.getReplaceAndInvertOption());

        request.setHighContrastColorCombination(HighContrastColorCombination.GREEN_TEXT_ON_BLACK);
        request.setHighContrastColorCombination(null);
        assertNull(request.getHighContrastColorCombination());

        request.setBackGroundColor("16777215");
        request.setBackGroundColor(null);
        assertNull(request.getBackGroundColor());

        request.setTextColor("0");
        request.setTextColor(null);
        assertNull(request.getTextColor());
    }

    @Test
    @DisplayName("Color string fields store empty and arbitrary string values as-is")
    void colorStringsStoredAsIs() {
        request.setBackGroundColor("");
        assertEquals("", request.getBackGroundColor());

        request.setTextColor("not-a-number");
        assertEquals("not-a-number", request.getTextColor());

        request.setBackGroundColor("16777215");
        assertEquals("16777215", request.getBackGroundColor());
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
        ReplaceAndInvertColorRequest other = new ReplaceAndInvertColorRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on replaceAndInvertOption breaks equality")
    void notEqualWhenOptionDiffers() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
        b.setReplaceAndInvertOption(ReplaceAndInvert.FULL_INVERSION);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on highContrastColorCombination breaks equality")
    void notEqualWhenCombinationDiffers() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
        b.setHighContrastColorCombination(HighContrastColorCombination.BLACK_TEXT_ON_WHITE);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on backGroundColor breaks equality")
    void notEqualWhenBackGroundColorDiffers() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
        b.setBackGroundColor("0");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on textColor breaks equality")
    void notEqualWhenTextColorDiffers() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
        b.setTextColor("16777215");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper=true must factor PDFFile.fileId into equals");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();
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
        ReplaceAndInvertColorRequest a = buildPopulated();
        ReplaceAndInvertColorRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative declared field name")
    void toStringContainsFieldNames() {
        request.setBackGroundColor("16777215");

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("backGroundColor"), () -> "Unexpected toString: " + text);
    }

    private ReplaceAndInvertColorRequest buildPopulated() {
        ReplaceAndInvertColorRequest r = new ReplaceAndInvertColorRequest();
        r.setReplaceAndInvertOption(ReplaceAndInvert.HIGH_CONTRAST_COLOR);
        r.setHighContrastColorCombination(HighContrastColorCombination.WHITE_TEXT_ON_BLACK);
        r.setBackGroundColor("16777215");
        r.setTextColor("0");
        r.setFileId("file-1");
        return r;
    }
}
