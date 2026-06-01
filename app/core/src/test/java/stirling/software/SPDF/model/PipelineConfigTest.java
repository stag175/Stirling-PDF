package stirling.software.SPDF.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Pure unit tests pinning the JSON contract of {@link PipelineConfig}. The class is a Lombok
 * {@code @Data} POJO whose {@code @JsonProperty} annotations remap the JSON keys {@code pipeline ->
 * operations} and {@code outputFileName -> outputPattern}. These tests guard that remapping plus
 * the generated accessor/value semantics, without any Spring context or IO.
 */
class PipelineConfigTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();

    @Test
    @DisplayName("deserialize remaps 'pipeline'->operations and 'outputFileName'->outputPattern")
    void deserialize_remapsJsonKeys() {
        String json =
                """
                {
                  "name": "myPipeline",
                  "pipeline": [
                    {"operation": "rotate", "parameters": {"angle": 90}}
                  ],
                  "outputDir": "/tmp/out",
                  "outputFileName": "{filename}-done"
                }
                """;

        PipelineConfig config = mapper.readValue(json, PipelineConfig.class);

        assertEquals("myPipeline", config.getName());
        assertEquals("/tmp/out", config.getOutputDir());
        assertEquals("{filename}-done", config.getOutputPattern());

        assertNotNull(config.getOperations());
        assertEquals(1, config.getOperations().size());
        PipelineOperation op = config.getOperations().get(0);
        assertEquals("rotate", op.getOperation());
        assertEquals(Map.of("angle", 90), op.getParameters());
    }

    @Test
    @DisplayName(
            "deserialize ignores the un-remapped Java field names 'operations'/'outputPattern'")
    void deserialize_javaFieldNamesAreNotTheJsonKeys() {
        // Because @JsonProperty renames the keys, the bean field names themselves are NOT bound.
        // Sending the Java names instead of the JSON names must leave those properties unset.
        String json =
                """
                {
                  "name": "x",
                  "operations": [{"operation": "noop"}],
                  "outputPattern": "ignored"
                }
                """;

        PipelineConfig config = mapper.readValue(json, PipelineConfig.class);

        assertEquals("x", config.getName());
        assertNull(config.getOperations(), "'operations' is not a JSON key; 'pipeline' is");
        assertNull(
                config.getOutputPattern(),
                "'outputPattern' is not a JSON key; 'outputFileName' is");
    }

    @Test
    @DisplayName("serialize emits the remapped keys 'pipeline' and 'outputFileName'")
    void serialize_emitsRemappedKeys() {
        PipelineConfig config = new PipelineConfig();
        config.setName("ser");
        config.setOutputDir("/out");
        config.setOutputPattern("{n}.pdf");
        PipelineOperation op = new PipelineOperation();
        op.setOperation("merge");
        op.setParameters(Map.of("count", 2));
        config.setOperations(List.of(op));

        JsonNode tree = mapper.readTree(mapper.writeValueAsString(config));

        assertEquals("ser", tree.get("name").asText());
        assertEquals("/out", tree.get("outputDir").asText());
        // Remapped keys present...
        assertTrue(tree.has("pipeline"), "operations must serialize as 'pipeline'");
        assertTrue(tree.has("outputFileName"), "outputPattern must serialize as 'outputFileName'");
        assertEquals("{n}.pdf", tree.get("outputFileName").asText());
        assertEquals("merge", tree.get("pipeline").get(0).get("operation").asText());
        // ...and the Java field names must NOT appear.
        assertFalse(tree.has("operations"), "must not emit raw field name 'operations'");
        assertFalse(tree.has("outputPattern"), "must not emit raw field name 'outputPattern'");
    }

    @Test
    @DisplayName("full round-trip (POJO -> JSON -> POJO) preserves equality")
    void roundTrip_preservesValueEquality() {
        PipelineConfig original = new PipelineConfig();
        original.setName("rt");
        original.setOutputDir("/d");
        original.setOutputPattern("p");
        PipelineOperation op1 = new PipelineOperation();
        op1.setOperation("split");
        op1.setParameters(Map.of("pages", "1-3", "flag", true));
        PipelineOperation op2 = new PipelineOperation();
        op2.setOperation("compress");
        op2.setParameters(Map.of());
        original.setOperations(List.of(op1, op2));

        String json = mapper.writeValueAsString(original);
        PipelineConfig restored = mapper.readValue(json, PipelineConfig.class);

        assertEquals(
                original, restored, "round-trip must yield an equal value (Lombok @Data equals)");
        assertEquals(original.hashCode(), restored.hashCode());
    }

    @Test
    @DisplayName("empty JSON object yields a config with all-null/default fields")
    void deserialize_emptyObject_allNull() {
        PipelineConfig config = mapper.readValue("{}", PipelineConfig.class);

        assertNull(config.getName());
        assertNull(config.getOperations());
        assertNull(config.getOutputDir());
        assertNull(config.getOutputPattern());
        assertEquals(new PipelineConfig(), config, "{} must equal a freshly constructed default");
    }

    @Test
    @DisplayName("explicit JSON nulls deserialize to null fields")
    void deserialize_explicitNulls() {
        String json =
                """
                {"name": null, "pipeline": null, "outputDir": null, "outputFileName": null}
                """;

        PipelineConfig config = mapper.readValue(json, PipelineConfig.class);

        assertNull(config.getName());
        assertNull(config.getOperations());
        assertNull(config.getOutputDir());
        assertNull(config.getOutputPattern());
    }

    @Test
    @DisplayName("empty 'pipeline' array deserializes to an empty (non-null) list")
    void deserialize_emptyPipelineArray() {
        PipelineConfig config = mapper.readValue("{\"pipeline\": []}", PipelineConfig.class);

        assertNotNull(config.getOperations());
        assertTrue(config.getOperations().isEmpty());
    }

    @Test
    @DisplayName("operation with absent 'parameters' leaves the map null")
    void deserialize_operationWithoutParameters() {
        PipelineConfig config =
                mapper.readValue(
                        "{\"pipeline\": [{\"operation\": \"flatten\"}]}", PipelineConfig.class);

        PipelineOperation op = config.getOperations().get(0);
        assertEquals("flatten", op.getOperation());
        assertNull(op.getParameters(), "absent 'parameters' must stay null, not an empty map");
    }

    @Test
    @DisplayName("nested operation parameters preserve heterogeneous JSON value types")
    void deserialize_nestedParameterTypes() {
        String json =
                """
                {
                  "pipeline": [
                    {
                      "operation": "stamp",
                      "parameters": {
                        "text": "hi",
                        "opacity": 0.5,
                        "repeat": true,
                        "margins": [1, 2, 3]
                      }
                    }
                  ]
                }
                """;

        PipelineConfig config = mapper.readValue(json, PipelineConfig.class);
        Map<String, Object> params = config.getOperations().get(0).getParameters();

        assertEquals("hi", params.get("text"));
        assertEquals(Double.valueOf(0.5), params.get("opacity"));
        assertEquals(Boolean.TRUE, params.get("repeat"));
        assertEquals(List.of(1, 2, 3), params.get("margins"));
    }

    @Test
    @DisplayName("unknown JSON property is ignored by the default Jackson 3 mapper")
    void deserialize_unknownProperty_isIgnored() {
        String json = "{\"name\": \"x\", \"bogusField\": 1}";

        // Jackson 3 disables FAIL_ON_UNKNOWN_PROPERTIES by default (unlike Jackson 2), matching
        // Spring Boot's mapper config, so unknown fields are dropped rather than rejected.
        PipelineConfig config = mapper.readValue(json, PipelineConfig.class);

        assertEquals("x", config.getName());
    }

    @Test
    @DisplayName("malformed JSON throws a JacksonException")
    void deserialize_malformedJson_throws() {
        String malformed = "{\"name\": \"x\","; // truncated object

        assertThrows(
                JacksonException.class, () -> mapper.readValue(malformed, PipelineConfig.class));
    }

    @Test
    @DisplayName("'pipeline' given as a non-array throws during binding")
    void deserialize_pipelineWrongType_throws() {
        String json = "{\"pipeline\": \"not-an-array\"}";

        assertThrows(JacksonException.class, () -> mapper.readValue(json, PipelineConfig.class));
    }

    @Test
    @DisplayName("round-trip via TypeReference within a wrapper map preserves the remapped keys")
    void roundTrip_insideWrapperMap() {
        PipelineConfig config = new PipelineConfig();
        config.setName("wrapped");
        config.setOutputPattern("out");

        String json = mapper.writeValueAsString(Map.of("cfg", config));
        Map<String, PipelineConfig> restored =
                mapper.readValue(json, new TypeReference<Map<String, PipelineConfig>>() {});

        assertEquals(config, restored.get("cfg"));
        assertEquals("out", restored.get("cfg").getOutputPattern());
    }

    @Test
    @DisplayName("Lombok @Data accessors and value semantics behave as expected")
    void lombokDataSemantics() {
        PipelineConfig a = new PipelineConfig();
        a.setName("n");
        a.setOutputDir("/d");
        a.setOutputPattern("p");
        a.setOperations(List.of());

        PipelineConfig b = new PipelineConfig();
        b.setName("n");
        b.setOutputDir("/d");
        b.setOutputPattern("p");
        b.setOperations(List.of());

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-config");

        b.setOutputPattern("different");
        assertNotEquals(a, b);

        String text = a.toString();
        assertNotNull(text);
        assertTrue(text.contains("n"), () -> "toString should contain name: " + text);
        assertTrue(text.contains("/d"), () -> "toString should contain outputDir: " + text);
        assertTrue(text.contains("p"), () -> "toString should contain outputPattern: " + text);
    }
}
