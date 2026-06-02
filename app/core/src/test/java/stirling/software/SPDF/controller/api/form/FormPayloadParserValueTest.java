package stirling.software.SPDF.controller.api.form;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class FormPayloadParserValueTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode node(String json) {
        return mapper.readTree(json);
    }

    // ---- coerceScalarToString --------------------------------------------------------------

    @Test
    @DisplayName("null / JSON-null coerce to null")
    void scalarNull() {
        assertNull(FormPayloadParser.coerceScalarToString(null));
        assertNull(FormPayloadParser.coerceScalarToString(node("null")));
    }

    @Test
    @DisplayName("textual values are trimmed")
    void scalarTextTrimmed() {
        assertEquals("hi", FormPayloadParser.coerceScalarToString(node("\"  hi  \"")));
    }

    @Test
    @DisplayName("numbers and booleans stringify")
    void scalarNumberBoolean() {
        assertEquals("42", FormPayloadParser.coerceScalarToString(node("42")));
        assertEquals("3.14", FormPayloadParser.coerceScalarToString(node("3.14")));
        assertEquals("true", FormPayloadParser.coerceScalarToString(node("true")));
        assertEquals("false", FormPayloadParser.coerceScalarToString(node("false")));
    }

    // ---- normalizeFieldValue ---------------------------------------------------------------

    @Test
    @DisplayName("null / JSON-null normalise to null")
    void normalizeNull() {
        assertNull(FormPayloadParser.normalizeFieldValue(null));
        assertNull(FormPayloadParser.normalizeFieldValue(node("null")));
    }

    @Test
    @DisplayName("arrays join their coerced scalars with commas")
    void normalizeArray() {
        assertEquals("a,b", FormPayloadParser.normalizeFieldValue(node("[\"a\",\"b\"]")));
        assertEquals("1,2,3", FormPayloadParser.normalizeFieldValue(node("[1,2,3]")));
    }

    @Test
    @DisplayName("array nulls are dropped before joining")
    void normalizeArrayDropsNulls() {
        assertEquals("a,b", FormPayloadParser.normalizeFieldValue(node("[\"a\",null,\"b\"]")));
    }

    @Test
    @DisplayName("objects are preserved as their JSON string")
    void normalizeObject() {
        assertEquals("{\"k\":\"v\"}", FormPayloadParser.normalizeFieldValue(node("{\"k\":\"v\"}")));
    }

    @Test
    @DisplayName("scalars normalise via coerceScalarToString")
    void normalizeScalar() {
        assertEquals("x", FormPayloadParser.normalizeFieldValue(node("\"x\"")));
        assertEquals("7", FormPayloadParser.normalizeFieldValue(node("7")));
    }
}
