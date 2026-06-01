package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

class ZipExtractionUtilsTest {

    // Standard local-file-header ZIP magic bytes: "PK\x03\x04".
    private static final byte[] ZIP_MAGIC = {0x50, 0x4B, 0x03, 0x04};

    private static Resource resourceOf(byte[] bytes) {
        return new ByteArrayResource(bytes);
    }

    private static byte[] zipWithTrailing(int trailingBytes) {
        byte[] out = new byte[ZIP_MAGIC.length + trailingBytes];
        System.arraycopy(ZIP_MAGIC, 0, out, 0, ZIP_MAGIC.length);
        return out;
    }

    // --- isZip(Resource) single-arg overload ---

    @Test
    void isZip_singleArg_withValidMagic_returnsTrue() throws IOException {
        assertTrue(ZipExtractionUtils.isZip(resourceOf(ZIP_MAGIC.clone())));
    }

    @Test
    void isZip_singleArg_withNonZipContent_returnsFalse() throws IOException {
        byte[] notZip = {(byte) 0x25, (byte) 0x50, (byte) 0x44, (byte) 0x46}; // "%PDF"
        assertFalse(ZipExtractionUtils.isZip(resourceOf(notZip)));
    }

    @Test
    void isZip_singleArg_withNullResource_returnsFalse() throws IOException {
        assertFalse(ZipExtractionUtils.isZip(null));
    }

    // --- isZip(Resource, String) two-arg overload: null / short content guards ---

    @Test
    void isZip_withNullResource_returnsFalse() throws IOException {
        assertFalse(ZipExtractionUtils.isZip(null, "archive.zip"));
    }

    @Test
    void isZip_withEmptyResource_returnsFalse() throws IOException {
        assertFalse(ZipExtractionUtils.isZip(resourceOf(new byte[0]), "archive.zip"));
    }

    @Test
    void isZip_withContentShorterThanMagic_returnsFalse() throws IOException {
        // 3 bytes is below the 4-byte magic length, so the content-length guard short-circuits.
        byte[] threeBytes = {0x50, 0x4B, 0x03};
        assertFalse(ZipExtractionUtils.isZip(resourceOf(threeBytes), "archive.zip"));
    }

    @Test
    void isZip_withContentExactlyMagicLength_andValidMagic_returnsTrue() throws IOException {
        // Boundary: contentLength == ZIP_MAGIC.length is allowed (not strictly less than).
        assertTrue(ZipExtractionUtils.isZip(resourceOf(ZIP_MAGIC.clone()), "archive.zip"));
    }

    // --- isZip(Resource, String): magic byte matching ---

    @Test
    void isZip_withValidMagicAndTrailingBytes_returnsTrue() throws IOException {
        Resource resource = resourceOf(zipWithTrailing(16));
        assertTrue(ZipExtractionUtils.isZip(resource, "archive.zip"));
    }

    @Test
    void isZip_withNullFilenameAndValidMagic_returnsTrue() throws IOException {
        assertTrue(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), null));
    }

    @Test
    void isZip_withFirstByteWrong_returnsFalse() throws IOException {
        byte[] bytes = ZIP_MAGIC.clone();
        bytes[0] = 0x00;
        assertFalse(ZipExtractionUtils.isZip(resourceOf(bytes), "archive.zip"));
    }

    @Test
    void isZip_withLastMagicByteWrong_returnsFalse() throws IOException {
        byte[] bytes = ZIP_MAGIC.clone();
        bytes[3] = (byte) 0xFF;
        assertFalse(ZipExtractionUtils.isZip(resourceOf(bytes), "archive.zip"));
    }

    @Test
    void isZip_withInteriorMagicByteWrong_returnsFalse() throws IOException {
        byte[] bytes = ZIP_MAGIC.clone();
        bytes[2] = 0x07; // valid empty-archive marker, but not the local-header signature
        assertFalse(ZipExtractionUtils.isZip(resourceOf(bytes), "archive.zip"));
    }

    @Test
    void isZip_withCompletelyDifferentBytes_returnsFalse() throws IOException {
        byte[] bytes = {0x01, 0x02, 0x03, 0x04, 0x05};
        assertFalse(ZipExtractionUtils.isZip(resourceOf(bytes), "data.bin"));
    }

    // --- isZip(Resource, String): .cbz exclusion ---

    @Test
    void isZip_withCbzFilenameAndValidMagic_returnsFalse() throws IOException {
        // CBZ files share the ZIP magic but are explicitly excluded.
        assertFalse(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "comic.cbz"));
    }

    @Test
    void isZip_withUpperCaseCbzFilenameAndValidMagic_returnsFalse() throws IOException {
        assertFalse(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "comic.CBZ"));
    }

    @Test
    void isZip_withMixedCaseCbzFilenameAndValidMagic_returnsFalse() throws IOException {
        assertFalse(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "Comic.CbZ"));
    }

    @Test
    void isZip_withCbzInPathButZipExtension_returnsTrue() throws IOException {
        // Only the trailing .cbz extension matters; a .cbz folder segment must not exclude.
        Resource resource = resourceOf(zipWithTrailing(8));
        assertTrue(ZipExtractionUtils.isZip(resource, "my.cbz.folder/archive.zip"));
    }

    @Test
    void isZip_withCbzSubstringNotAtEnd_returnsTrue() throws IOException {
        // "cbz" appears but the file does not end in ".cbz".
        assertTrue(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "cbzarchive.zip"));
    }

    @Test
    void isZip_withZipExtensionAndValidMagic_returnsTrue() throws IOException {
        assertTrue(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "archive.zip"));
    }

    @Test
    void isZip_withCbzFilenameButNonZipContent_returnsFalse() throws IOException {
        // Non-ZIP content with a .cbz name is still not a ZIP (short-circuited before content
        // read).
        byte[] notZip = {0x00, 0x01, 0x02, 0x03, 0x04};
        assertFalse(ZipExtractionUtils.isZip(resourceOf(notZip), "comic.cbz"));
    }

    // --- isZip(Resource, String): short-read guard via a stream that under-delivers ---

    @Test
    void isZip_whenStreamDeliversFewerBytesThanMagic_returnsFalse() throws IOException {
        // contentLength() reports >= 4 (passes the first guard) but the stream yields only 2 bytes
        // on the bulk read, exercising the `is.read(header) < ZIP_MAGIC.length` branch.
        Resource shortReadResource =
                new ByteArrayResource(ZIP_MAGIC.clone()) {
                    @Override
                    public InputStream getInputStream() {
                        return new InputStream() {
                            private int position = 0;

                            @Override
                            public int read() {
                                if (position < 2) {
                                    return ZIP_MAGIC[position++] & 0xFF;
                                }
                                return -1;
                            }

                            @Override
                            public int read(byte[] b, int off, int len) {
                                int written = 0;
                                while (written < 2 && position < 2) {
                                    b[off + written] = (byte) (ZIP_MAGIC[position++] & 0xFF);
                                    written++;
                                }
                                return written == 0 ? -1 : written;
                            }
                        };
                    }
                };

        assertFalse(ZipExtractionUtils.isZip(shortReadResource, "archive.zip"));
    }

    // --- isZip(Resource, String): exception propagation ---

    @Test
    void isZip_whenContentLengthThrows_propagatesIOException() {
        Resource throwing =
                new AbstractResource() {
                    @Override
                    public String getDescription() {
                        return "throwing-content-length";
                    }

                    @Override
                    public InputStream getInputStream() {
                        return new ByteArrayInputStream(zipWithTrailing(8));
                    }

                    @Override
                    public long contentLength() throws IOException {
                        throw new IOException("boom");
                    }
                };

        assertThrows(IOException.class, () -> ZipExtractionUtils.isZip(throwing, "archive.zip"));
    }

    @Test
    void isZip_whenGetInputStreamThrows_propagatesIOException() {
        Resource throwing =
                new ByteArrayResource(zipWithTrailing(8)) {
                    @Override
                    public InputStream getInputStream() throws IOException {
                        throw new IOException("no stream");
                    }
                };

        assertThrows(IOException.class, () -> ZipExtractionUtils.isZip(throwing, "archive.zip"));
    }

    // --- determinism: repeated calls on a fresh resource are stable ---

    @Test
    void isZip_isDeterministicAcrossRepeatedCalls() throws IOException {
        for (int i = 0; i < 5; i++) {
            assertTrue(ZipExtractionUtils.isZip(resourceOf(zipWithTrailing(8)), "archive.zip"));
            byte[] notZip = {0x4D, 0x5A, 0x00, 0x00}; // "MZ" executable header
            assertFalse(ZipExtractionUtils.isZip(resourceOf(notZip), "archive.zip"));
        }
    }

    // Sanity: ByteArrayInputStream-backed reads behave as the magic check expects.
    @Test
    void isZip_bulkReadConsumesFullMagicFromByteArrayResource() throws IOException {
        // A ByteArrayResource over exactly the magic bytes must read all 4 in one bulk call.
        try (InputStream is = new ByteArrayInputStream(ZIP_MAGIC.clone())) {
            byte[] header = new byte[ZIP_MAGIC.length];
            assertEquals(ZIP_MAGIC.length, is.read(header));
        }
        assertTrue(ZipExtractionUtils.isZip(resourceOf(ZIP_MAGIC.clone()), null));
    }
}
