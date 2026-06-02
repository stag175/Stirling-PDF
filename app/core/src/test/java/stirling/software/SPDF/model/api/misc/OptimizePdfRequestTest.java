package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class OptimizePdfRequestTest {

    private OptimizePdfRequest request;

    @BeforeEach
    void setUp() {
        request = new OptimizePdfRequest();
    }

    @Test
    @DisplayName("Initialised field defaults: optimizeLevel=5, lineArtThreshold=55.0, lineArtEdgeLevel=1")
    void initialisedNumericDefaults() {
        assertEquals(5, request.getOptimizeLevel(), "optimizeLevel must default to 5");
        assertEquals(55d, request.getLineArtThreshold(), 0.0d, "lineArtThreshold must default to 55.0");
        assertEquals(1, request.getLineArtEdgeLevel(), "lineArtEdgeLevel must default to 1");
    }

    @Test
    @DisplayName("Initialised Boolean defaults are all FALSE (not null)")
    void initialisedBooleanDefaults() {
        assertEquals(Boolean.FALSE, request.getLinearize(), "linearize default");
        assertEquals(Boolean.FALSE, request.getNormalize(), "normalize default");
        assertEquals(Boolean.FALSE, request.getGrayscale(), "grayscale default");
        assertEquals(Boolean.FALSE, request.getLineArt(), "lineArt default");

        // Defaults are concrete Boolean.FALSE, never null.
        assertNotNull(request.getLinearize());
        assertNotNull(request.getNormalize());
        assertNotNull(request.getGrayscale());
        assertNotNull(request.getLineArt());
    }

    @Test
    @DisplayName("Uninitialised reference field expectedOutputSize defaults to null")
    void expectedOutputSizeDefaultsToNull() {
        assertNull(request.getExpectedOutputSize());
    }

    @Test
    @DisplayName("Inherited fields default to null (fileId, fileInput)")
    void inheritedFieldsDefaultToNull() {
        assertNull(request.getFileId(), "inherited from PDFFile");
        assertNull(request.getFileInput(), "inherited from PDFFile");
    }

    @Test
    @DisplayName("Getters return the values set via setters")
    void gettersReturnSetValues() {
        request.setOptimizeLevel(9);
        request.setExpectedOutputSize("100MB");
        request.setLinearize(true);
        request.setNormalize(true);
        request.setGrayscale(true);
        request.setLineArt(true);
        request.setLineArtThreshold(12.5d);
        request.setLineArtEdgeLevel(3);

        assertEquals(9, request.getOptimizeLevel());
        assertEquals("100MB", request.getExpectedOutputSize());
        assertEquals(Boolean.TRUE, request.getLinearize());
        assertEquals(Boolean.TRUE, request.getNormalize());
        assertEquals(Boolean.TRUE, request.getGrayscale());
        assertEquals(Boolean.TRUE, request.getLineArt());
        assertEquals(12.5d, request.getLineArtThreshold(), 0.0001d);
        assertEquals(3, request.getLineArtEdgeLevel());
    }

    @Test
    @DisplayName("Inherited setters/getters work across the hierarchy (PDFFile)")
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
    @DisplayName("optimizeLevel accepts allowable boundary values 1 and 9")
    void optimizeLevelBoundaryValues() {
        request.setOptimizeLevel(1);
        assertEquals(1, request.getOptimizeLevel());

        request.setOptimizeLevel(9);
        assertEquals(9, request.getOptimizeLevel());
    }

    @Test
    @DisplayName("lineArtThreshold accepts the documented 0-100 boundary values")
    void lineArtThresholdBoundaryValues() {
        request.setLineArtThreshold(0d);
        assertEquals(0d, request.getLineArtThreshold(), 0.0d);

        request.setLineArtThreshold(100d);
        assertEquals(100d, request.getLineArtThreshold(), 0.0d);
    }

    @Test
    @DisplayName("lineArtEdgeLevel accepts the allowable boundary values 1 and 3")
    void lineArtEdgeLevelBoundaryValues() {
        request.setLineArtEdgeLevel(1);
        assertEquals(1, request.getLineArtEdgeLevel());

        request.setLineArtEdgeLevel(3);
        assertEquals(3, request.getLineArtEdgeLevel());
    }

    @Test
    @DisplayName("Boxed fields can be explicitly set to null")
    void boxedFieldsAcceptNull() {
        request.setOptimizeLevel(null);
        request.setLinearize(null);
        request.setNormalize(null);
        request.setGrayscale(null);
        request.setLineArt(null);
        request.setLineArtThreshold(null);
        request.setLineArtEdgeLevel(null);
        request.setExpectedOutputSize(null);

        assertNull(request.getOptimizeLevel());
        assertNull(request.getLinearize());
        assertNull(request.getNormalize());
        assertNull(request.getGrayscale());
        assertNull(request.getLineArt());
        assertNull(request.getLineArtThreshold());
        assertNull(request.getLineArtEdgeLevel());
        assertNull(request.getExpectedOutputSize());
    }

    @Test
    @DisplayName("equals/hashCode: two default instances are equal")
    void equalsForDefaultInstances() {
        OptimizePdfRequest other = new OptimizePdfRequest();

        assertEquals(request, other);
        assertEquals(request.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode: instances with identical full state are equal")
    void equalsForIdenticalState() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("equals: differing on a subclass-only field (optimizeLevel) breaks equality")
    void notEqualWhenSubclassFieldDiffers() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();
        b.setOptimizeLevel(3);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on lineArtThreshold (Double) breaks equality")
    void notEqualWhenThresholdDiffers() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();
        b.setLineArtThreshold(99.0d);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differing on a Boolean field (grayscale) breaks equality")
    void notEqualWhenBooleanFieldDiffers() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();
        b.setGrayscale(false);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: callSuper=true picks up inherited fileId difference (PDFFile)")
    void notEqualWhenInheritedFileIdDiffers() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();
        b.setFileId("different-id");

        assertNotEquals(a, b, "callSuper chain must reach PDFFile.fileId");
    }

    @Test
    @DisplayName("hashCode differs when an inherited field differs")
    void hashCodeReflectsInheritedField() {
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();
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
        OptimizePdfRequest a = buildPopulated();
        OptimizePdfRequest b = buildPopulated();

        assertEquals(a, a);
        assertEquals(a, b);
        assertEquals(b, a);
    }

    @Test
    @DisplayName("toString includes a representative field name")
    void toStringContainsFieldNames() {
        request.setOptimizeLevel(7);

        String text = request.toString();
        assertNotNull(text);
        assertTrue(text.contains("optimizeLevel"), () -> "Unexpected toString: " + text);
    }

    private OptimizePdfRequest buildPopulated() {
        OptimizePdfRequest r = new OptimizePdfRequest();
        r.setOptimizeLevel(4);
        r.setExpectedOutputSize("2MB");
        r.setLinearize(true);
        r.setNormalize(true);
        r.setGrayscale(true);
        r.setLineArt(true);
        r.setLineArtThreshold(42.0d);
        r.setLineArtEdgeLevel(2);
        r.setFileId("file-1");
        return r;
    }
}
