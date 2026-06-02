package stirling.software.SPDF.controller.api.form;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class FormPayloadParserExtractNameTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode node(String json) {
        return mapper.readTree(json);
    }

    @Test
    @DisplayName("null / JSON null nodes yield null")
    void nullNodes() {
        assertNull(FormPayloadParser.extractName(null));
        assertNull(FormPayloadParser.extractName(node("null")));
    }

    @Test
    @DisplayName("a textual node is trimmed; blank text yields null")
    void textualNodes() {
        assertEquals("Field A", FormPayloadParser.extractName(node("\"Field A\"")));
        assertNull(FormPayloadParser.extractName(node("\"   \"")));
    }

    @Test
    @DisplayName("a number node yields null (not name-bearing)")
    void numberNode() {
        assertNull(FormPayloadParser.extractName(node("42")));
    }

    @Test
    @DisplayName("name > targetName > fieldName key precedence")
    void keyPrecedence() {
        assertEquals(
                "N",
                FormPayloadParser.extractName(
                        node("{\"name\":\"N\",\"targetName\":\"T\",\"fieldName\":\"F\"}")));
        assertEquals(
                "T",
                FormPayloadParser.extractName(node("{\"targetName\":\"T\",\"fieldName\":\"F\"}")));
        assertEquals("F", FormPayloadParser.extractName(node("{\"fieldName\":\"F\"}")));
    }

    @Test
    @DisplayName("a blank higher-precedence key falls through to the next key")
    void blankKeyFallsThrough() {
        assertEquals(
                "T",
                FormPayloadParser.extractName(node("{\"name\":\"   \",\"targetName\":\"T\"}")));
    }

    @Test
    @DisplayName("falls back to a nested field object's name keys")
    void nestedFieldFallback() {
        assertEquals(
                "Nested", FormPayloadParser.extractName(node("{\"field\":{\"name\":\"Nested\"}}")));
    }

    @Test
    @DisplayName("a top-level name wins over a nested field name")
    void topLevelWinsOverNested() {
        assertEquals(
                "Top",
                FormPayloadParser.extractName(
                        node("{\"name\":\"Top\",\"field\":{\"name\":\"Nested\"}}")));
    }

    @Test
    @DisplayName("an object with none of the name keys yields null")
    void noNameKeys() {
        assertNull(FormPayloadParser.extractName(node("{\"other\":\"x\"}")));
    }

    @Test
    @DisplayName("textProperty returns the first non-blank key value, in order")
    void textPropertyFirstNonBlankWins() {
        JsonNode obj = node("{\"a\":\"\",\"b\":\"B\",\"c\":\"C\"}");
        assertEquals("B", FormPayloadParser.textProperty(obj, "a", "b", "c"));
        assertNull(FormPayloadParser.textProperty(node("{}"), "x", "y"));
    }
}
