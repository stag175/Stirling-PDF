package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins CompressController.bytesToHexString — the lowercase, zero-padded, unsigned-byte hex encoder
 * that underpins the image-dedup hashes. The signed-byte handling is the subtle bit: {@code %02x}
 * formats a negative byte as its unsigned 0..255 value (e.g. (byte)0xFF -> "ff", not "ffffffff").
 */
class CompressControllerHexTest {

    @Test
    @DisplayName("empty input -> empty string")
    void empty() {
        assertEquals("", CompressController.bytesToHexString(new byte[0]));
    }

    @Test
    @DisplayName("low bytes are zero-padded to two lowercase hex digits")
    void zeroPadding() {
        assertEquals("00", CompressController.bytesToHexString(new byte[] {0x00}));
        assertEquals("0f", CompressController.bytesToHexString(new byte[] {0x0f}));
        assertEquals("7f", CompressController.bytesToHexString(new byte[] {0x7f}));
    }

    @Test
    @DisplayName("negative (high) bytes encode as their unsigned 0..255 value")
    void unsignedHighBytes() {
        assertEquals("ff", CompressController.bytesToHexString(new byte[] {(byte) 0xff}));
        assertEquals("ab", CompressController.bytesToHexString(new byte[] {(byte) 0xab}));
        assertEquals("80", CompressController.bytesToHexString(new byte[] {(byte) 0x80}));
    }

    @Test
    @DisplayName("multiple bytes are concatenated in order with no separators")
    void multipleBytes() {
        assertEquals(
                "0102abff",
                CompressController.bytesToHexString(
                        new byte[] {0x01, 0x02, (byte) 0xab, (byte) 0xff}));
    }
}
