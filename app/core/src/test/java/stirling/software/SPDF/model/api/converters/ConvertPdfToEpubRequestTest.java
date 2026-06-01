package stirling.software.SPDF.model.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.OutputFormat;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;

class ConvertPdfToEpubRequestTest {

    // ---------------------------------------------------------------------
    // Default field values
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("New request uses documented default field values")
    void defaults_areAsDocumented() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

        assertEquals(Boolean.TRUE, req.getDetectChapters(), "detectChapters defaults to TRUE");
        assertSame(
                TargetDevice.TABLET_PHONE_IMAGES,
                req.getTargetDevice(),
                "targetDevice defaults to TABLET_PHONE_IMAGES");
        assertSame(OutputFormat.EPUB, req.getOutputFormat(), "outputFormat defaults to EPUB");
    }

    @Test
    @DisplayName("Inherited PDFFile fields default to null on a fresh request")
    void defaults_inheritedFieldsAreNull() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

        assertNull(req.getFileInput(), "fileInput defaults to null");
        assertNull(req.getFileId(), "fileId defaults to null");
    }

    // ---------------------------------------------------------------------
    // Setters / getters (Lombok @Data)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Setters round-trip declared field values")
    void setters_roundTrip() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

        req.setDetectChapters(Boolean.FALSE);
        req.setTargetDevice(TargetDevice.KINDLE_EINK_TEXT);
        req.setOutputFormat(OutputFormat.AZW3);

        assertEquals(Boolean.FALSE, req.getDetectChapters());
        assertSame(TargetDevice.KINDLE_EINK_TEXT, req.getTargetDevice());
        assertSame(OutputFormat.AZW3, req.getOutputFormat());
    }

    @Test
    @DisplayName("Nullable fields accept null without throwing")
    void setters_acceptNull() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

        req.setDetectChapters(null);
        req.setTargetDevice(null);
        req.setOutputFormat(null);

        assertNull(req.getDetectChapters());
        assertNull(req.getTargetDevice());
        assertNull(req.getOutputFormat());
    }

    @Test
    @DisplayName("Inherited fileInput / fileId setters round-trip")
    void setters_inheritedFields() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "book.pdf", "application/pdf", new byte[] {1, 2, 3});

        req.setFileInput(file);
        req.setFileId("server-side-id");

        assertSame(file, req.getFileInput());
        assertEquals("server-side-id", req.getFileId());
    }

    // ---------------------------------------------------------------------
    // TargetDevice enum backing field
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("TargetDevice exposes the expected calibre profile per constant")
    void targetDevice_calibreProfile() {
        assertEquals("tablet", TargetDevice.TABLET_PHONE_IMAGES.getCalibreProfile());
        assertEquals("kindle", TargetDevice.KINDLE_EINK_TEXT.getCalibreProfile());
    }

    @Test
    @DisplayName("TargetDevice declares exactly the documented constants in order")
    void targetDevice_values() {
        assertArrayEquals(
                new TargetDevice[] {
                    TargetDevice.TABLET_PHONE_IMAGES, TargetDevice.KINDLE_EINK_TEXT
                },
                TargetDevice.values());
    }

    @Test
    @DisplayName("TargetDevice.valueOf resolves declared names and rejects unknown ones")
    void targetDevice_valueOf() {
        assertSame(TargetDevice.TABLET_PHONE_IMAGES, TargetDevice.valueOf("TABLET_PHONE_IMAGES"));
        assertSame(TargetDevice.KINDLE_EINK_TEXT, TargetDevice.valueOf("KINDLE_EINK_TEXT"));

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class, () -> TargetDevice.valueOf("UNKNOWN_DEVICE"));
    }

    @Test
    @DisplayName("Every TargetDevice has a non-blank, distinct calibre profile")
    void targetDevice_profilesNonBlankAndDistinct() {
        long distinct =
                Arrays.stream(TargetDevice.values())
                        .map(TargetDevice::getCalibreProfile)
                        .distinct()
                        .count();
        assertEquals(TargetDevice.values().length, distinct, "calibre profiles must be distinct");

        for (TargetDevice device : TargetDevice.values()) {
            String profile = device.getCalibreProfile();
            assertFalse(
                    profile == null || profile.trim().isEmpty(),
                    () -> "calibre profile must be non-blank for " + device);
        }
    }

    // ---------------------------------------------------------------------
    // OutputFormat enum backing fields
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("OutputFormat exposes the expected extension per constant")
    void outputFormat_extension() {
        assertEquals("epub", OutputFormat.EPUB.getExtension());
        assertEquals("azw3", OutputFormat.AZW3.getExtension());
    }

    @Test
    @DisplayName("OutputFormat exposes the expected media type per constant")
    void outputFormat_mediaType() {
        assertEquals("application/epub+zip", OutputFormat.EPUB.getMediaType());
        assertEquals("application/vnd.amazon.ebook", OutputFormat.AZW3.getMediaType());
    }

    @Test
    @DisplayName("OutputFormat declares exactly the documented constants in order")
    void outputFormat_values() {
        assertArrayEquals(
                new OutputFormat[] {OutputFormat.EPUB, OutputFormat.AZW3}, OutputFormat.values());
    }

    @Test
    @DisplayName("OutputFormat.valueOf resolves declared names and rejects unknown ones")
    void outputFormat_valueOf() {
        assertSame(OutputFormat.EPUB, OutputFormat.valueOf("EPUB"));
        assertSame(OutputFormat.AZW3, OutputFormat.valueOf("AZW3"));

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class, () -> OutputFormat.valueOf("MOBI"));
    }

    @Test
    @DisplayName("Every OutputFormat has non-blank, distinct extension and media type")
    void outputFormat_backingFieldsNonBlankAndDistinct() {
        long distinctExt =
                Arrays.stream(OutputFormat.values())
                        .map(OutputFormat::getExtension)
                        .distinct()
                        .count();
        long distinctMedia =
                Arrays.stream(OutputFormat.values())
                        .map(OutputFormat::getMediaType)
                        .distinct()
                        .count();
        assertEquals(OutputFormat.values().length, distinctExt, "extensions must be distinct");
        assertEquals(OutputFormat.values().length, distinctMedia, "media types must be distinct");

        for (OutputFormat format : OutputFormat.values()) {
            String ext = format.getExtension();
            String media = format.getMediaType();
            assertFalse(
                    ext == null || ext.trim().isEmpty(),
                    () -> "extension must be non-blank for " + format);
            assertFalse(
                    media == null || media.trim().isEmpty(),
                    () -> "media type must be non-blank for " + format);
        }
    }

    // ---------------------------------------------------------------------
    // Lombok equals / hashCode / toString (callSuper = true)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Two freshly constructed requests are equal and share a hash code")
    void equalsHashCode_defaultsEqual() {
        ConvertPdfToEpubRequest a = new ConvertPdfToEpubRequest();
        ConvertPdfToEpubRequest b = new ConvertPdfToEpubRequest();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("Requests differing in a declared field are not equal")
    void equalsHashCode_differByOwnField() {
        ConvertPdfToEpubRequest a = new ConvertPdfToEpubRequest();
        ConvertPdfToEpubRequest b = new ConvertPdfToEpubRequest();
        b.setOutputFormat(OutputFormat.AZW3);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals honours inherited PDFFile state (callSuper = true)")
    void equalsHashCode_differByInheritedField() {
        ConvertPdfToEpubRequest a = new ConvertPdfToEpubRequest();
        ConvertPdfToEpubRequest b = new ConvertPdfToEpubRequest();
        b.setFileId("only-on-b");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals is reflexive and rejects null / foreign types")
    void equals_reflexiveAndNullSafe() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();

        assertEquals(req, req);
        assertNotEquals(null, req);
        assertNotEquals("not-a-request", req);
    }

    @Test
    @DisplayName("toString includes declared field names")
    void toString_containsFields() {
        ConvertPdfToEpubRequest req = new ConvertPdfToEpubRequest();
        String text = req.toString();

        assertTrue(
                text.contains("detectChapters"),
                () -> "toString should mention detectChapters: " + text);
        assertTrue(
                text.contains("targetDevice"),
                () -> "toString should mention targetDevice: " + text);
        assertTrue(
                text.contains("outputFormat"),
                () -> "toString should mention outputFormat: " + text);
    }
}
