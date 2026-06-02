package stirling.software.SPDF.controller.api.form;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FormFillControllerDecodePartTest {

    @Test
    @DisplayName("null payload decodes to null")
    void nullPayload() {
        assertNull(FormFillController.decodePart(null));
    }

    @Test
    @DisplayName("empty payload decodes to null (not an empty string)")
    void emptyPayload() {
        assertNull(FormFillController.decodePart(new byte[0]));
    }

    @Test
    @DisplayName("ASCII bytes decode verbatim")
    void asciiPayload() {
        assertEquals(
                "hello", FormFillController.decodePart("hello".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("multi-byte UTF-8 sequences are decoded correctly")
    void utf8Payload() {
        // "café" -> c a f + 0xC3 0xA9 (é)
        byte[] payload = {99, 97, 102, (byte) 0xC3, (byte) 0xA9};
        assertEquals("café", FormFillController.decodePart(payload));
    }

    @Test
    @DisplayName("a JSON payload round-trips through the decoder")
    void jsonPayload() {
        String json = "{\"field\":\"value\"}";
        assertEquals(json, FormFillController.decodePart(json.getBytes(StandardCharsets.UTF_8)));
    }
}
