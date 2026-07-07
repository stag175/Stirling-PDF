package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/**
 * Unit tests for {@link ByteHashFileIdStrategy}. Verifies the deterministic SHA-256 -> 16-hex-char
 * content id against precomputed known-input hashes, that identical bytes dedupe to the same id
 * while different bytes diverge, that hashing is driven purely by content (not filename or content
 * type), that payloads larger than the internal read buffer are hashed fully, and that an {@link
 * IOException} from the underlying stream propagates.
 *
 * <p>Expected ids are the first 16 hex characters (first 8 bytes) of the SHA-256 digest of the
 * input bytes, computed independently of the production code.
 */
class ByteHashFileIdStrategyTest {

    private static final int ID_LENGTH = 16;

    private final ByteHashFileIdStrategy strategy = new ByteHashFileIdStrategy();

    private static MockMultipartFile fileOf(byte[] content) {
        return new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", content);
    }

    @Test
    void hashesKnownAsciiContentToExpectedId() throws IOException {
        // SHA-256("hello world") starts with b94d27b9934d3e08...
        String id = strategy.idFor(fileOf("hello world".getBytes(StandardCharsets.UTF_8)));
        assertEquals("b94d27b9934d3e08", id);
    }

    @Test
    void hashesEmptyContentToShaOfEmptyInput() throws IOException {
        // No empty-check in the strategy: empty bytes hash to the well-known SHA-256 of "".
        String id = strategy.idFor(fileOf(new byte[0]));
        assertEquals("e3b0c44298fc1c14", id);
    }

    @ParameterizedTest
    @CsvSource({
        "'', e3b0c44298fc1c14",
        "abc, ba7816bf8f01cfea",
        "hello world, b94d27b9934d3e08",
        "Stirling-PDF, ebd6012873d3813e",
    })
    void hashesKnownInputsToPrecomputedIds(String input, String expectedId) throws IOException {
        String id = strategy.idFor(fileOf(input.getBytes(StandardCharsets.UTF_8)));
        assertEquals(expectedId, id);
    }

    @Test
    void hashesSingleZeroByteToExpectedId() throws IOException {
        // Boundary: a single 0x00 byte must not be treated as empty.
        String id = strategy.idFor(fileOf(new byte[] {0}));
        assertEquals("6e340b9cffb37a98", id);
    }

    @Test
    void producesIdOfExactly16HexChars() throws IOException {
        String id = strategy.idFor(fileOf("some content".getBytes(StandardCharsets.UTF_8)));
        assertEquals(ID_LENGTH, id.length(), "id must be exactly 16 hex chars");
        assertTrue(id.matches("[0-9a-f]{16}"), "id must be lowercase hex, got: " + id);
    }

    @Test
    void identicalBytesDedupeToSameId() throws IOException {
        byte[] content = "duplicate content".getBytes(StandardCharsets.UTF_8);
        String first = strategy.idFor(fileOf(content));
        String second = strategy.idFor(fileOf(content.clone()));
        assertEquals(first, second, "identical content must produce identical ids");
    }

    @Test
    void differentBytesProduceDifferentIds() throws IOException {
        String a = strategy.idFor(fileOf("content A".getBytes(StandardCharsets.UTF_8)));
        String b = strategy.idFor(fileOf("content B".getBytes(StandardCharsets.UTF_8)));
        assertNotEquals(a, b, "differing content should produce differing ids");
    }

    @Test
    void idDependsOnContentNotFilenameOrContentType() throws IOException {
        byte[] content = "same bytes".getBytes(StandardCharsets.UTF_8);
        String first =
                strategy.idFor(
                        new MockMultipartFile(
                                "fileInput", "alpha.pdf", "application/pdf", content));
        String second =
                strategy.idFor(
                        new MockMultipartFile(
                                "otherField", "beta.txt", "text/plain", content.clone()));
        assertEquals(first, second, "id must be derived from bytes only, not metadata");
    }

    @Test
    void hashesContentLargerThanReadBufferFully() throws IOException {
        // BUFFER_SIZE is 64 KiB; use 70000 bytes so the read loop runs more than once and every
        // byte contributes to the digest. Expected id precomputed over a 0..255 repeating ramp.
        byte[] big = new byte[70000];
        for (int i = 0; i < big.length; i++) {
            big[i] = (byte) (i % 256);
        }
        String id = strategy.idFor(fileOf(big));
        assertEquals("0c6c96cc20d3f906", id);
    }

    @Test
    void propagatesIOExceptionFromUnderlyingStream() throws IOException {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getInputStream()).thenThrow(new IOException("stream boom"));

        IOException ex = assertThrows(IOException.class, () -> strategy.idFor(file));
        assertEquals("stream boom", ex.getMessage());
    }

    @Test
    void propagatesIOExceptionRaisedMidStreamRead() throws IOException {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getInputStream()).thenReturn(throwingStream());

        assertThrows(IOException.class, () -> strategy.idFor(file));
    }

    /** A stream that yields a few bytes then fails, exercising the read loop's error path. */
    private static InputStream throwingStream() {
        return new InputStream() {
            private final InputStream delegate = new ByteArrayInputStream(new byte[] {1, 2, 3});
            private int callsBeforeFailure = 1;

            @Override
            public int read() throws IOException {
                return delegate.read();
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (callsBeforeFailure-- <= 0) {
                    throw new IOException("read failure");
                }
                return delegate.read(b, off, len);
            }
        };
    }
}
