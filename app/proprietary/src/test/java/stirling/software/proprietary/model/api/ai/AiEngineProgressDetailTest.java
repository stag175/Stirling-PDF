package stirling.software.proprietary.model.api.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail.WholeDocCompressionRound;
import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail.WholeDocReadDone;
import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail.WholeDocReadStarted;
import stirling.software.proprietary.model.api.ai.AiEngineProgressDetail.WholeDocSliceDone;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link AiEngineProgressDetail}, the sealed polymorphic progress-detail union.
 *
 * <p>The discriminator is the {@code phase} string ({@code JsonTypeInfo.As.EXISTING_PROPERTY},
 * {@code visible = true}), so it stays on the wire and round-trips into the matching record. These
 * tests use a plain Jackson 3 {@link JsonMapper} (no Spring) to exercise the discriminated-union
 * config: serialization keeps the discriminator and the phase-specific camelCase fields,
 * deserialization picks the correct subtype, and unknown fields/phases are handled per the
 * annotations. The annotation set lives in {@code com.fasterxml.jackson.annotation} but is honored
 * by the {@code tools.jackson} mapper, matching the rest of this module.
 */
class AiEngineProgressDetailTest {

    // Mirror the app's Spring config
    // (spring.jackson.deserialization.fail-on-null-for-primitives=false).
    // Jackson 3 enables FAIL_ON_NULL_FOR_PRIMITIVES by default, so a raw mapper would reject
    // absent/null
    // primitive record components instead of defaulting them to 0.
    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    // -------------------------------------------------------------------------
    // phase() accessor — each subtype reports the discriminator it was built with
    // -------------------------------------------------------------------------

    @Test
    void phaseAccessor_returnsConstructorValue_forEachSubtype() {
        assertEquals(
                "whole_doc_read_started",
                new WholeDocReadStarted("whole_doc_read_started", "q", 10, 3).phase());
        assertEquals(
                "whole_doc_slice_done",
                new WholeDocSliceDone("whole_doc_slice_done", 1, 3, "1-4", 250, 5, 7).phase());
        assertEquals(
                "whole_doc_compression_round",
                new WholeDocCompressionRound("whole_doc_compression_round", 2, 40, 8).phase());
        assertEquals(
                "whole_doc_read_done",
                new WholeDocReadDone("whole_doc_read_done", 3, 3, 12.5).phase());
    }

    @Test
    void phaseAccessor_returnsNull_whenConstructedWithNullPhase() {
        // The record imposes no non-null constraint on the phase field.
        AiEngineProgressDetail detail = new WholeDocReadStarted(null, "q", 1, 1);
        assertNull(detail.phase());
    }

    // -------------------------------------------------------------------------
    // Serialization — discriminator stays on the wire alongside camelCase fields
    // -------------------------------------------------------------------------

    @Test
    void serialize_keepsDiscriminatorAndAllFields_readStarted() {
        AiEngineProgressDetail detail =
                new WholeDocReadStarted("whole_doc_read_started", "What is the total?", 12, 4);

        JsonNode json = objectMapper.valueToTree(detail);

        // EXISTING_PROPERTY + visible=true means the phase string is emitted exactly once.
        assertEquals("whole_doc_read_started", json.get("phase").asText());
        assertEquals("What is the total?", json.get("question").asText());
        assertEquals(12, json.get("pages").asInt());
        assertEquals(4, json.get("slices").asInt());
    }

    @Test
    void serialize_emitsCamelCaseFieldNames_sliceDone() {
        AiEngineProgressDetail detail =
                new WholeDocSliceDone("whole_doc_slice_done", 2, 5, "9-16", 1234, 11, 6);

        JsonNode json = objectMapper.valueToTree(detail);

        assertEquals("whole_doc_slice_done", json.get("phase").asText());
        assertEquals(2, json.get("completed").asInt());
        assertEquals(5, json.get("total").asInt());
        assertEquals("9-16", json.get("pages").asText());
        // No SNAKE_CASE strategy is configured, so the field stays camelCase on the wire.
        assertTrue(json.has("durationMs"), "expected camelCase 'durationMs' key");
        assertEquals(1234, json.get("durationMs").asInt());
        assertEquals(11, json.get("excerpts").asInt());
        assertEquals(6, json.get("facts").asInt());
    }

    @Test
    void serialize_doubleField_roundTripsExactly_readDone() {
        AiEngineProgressDetail detail = new WholeDocReadDone("whole_doc_read_done", 7, 7, 42.75);

        JsonNode json = objectMapper.valueToTree(detail);

        assertEquals("whole_doc_read_done", json.get("phase").asText());
        assertEquals(7, json.get("completed").asInt());
        assertEquals(7, json.get("slices").asInt());
        assertEquals(42.75, json.get("durationSeconds").asDouble(), 0.0);
    }

    // -------------------------------------------------------------------------
    // Deserialization — phase discriminator selects the concrete subtype
    // -------------------------------------------------------------------------

    @Test
    void deserialize_readStarted_intoConcreteSubtype() throws Exception {
        String wire =
                """
                {"phase":"whole_doc_read_started","question":"Summarise","pages":8,"slices":2}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocReadStarted started = assertInstanceOf(WholeDocReadStarted.class, detail);
        assertEquals("whole_doc_read_started", started.phase());
        assertEquals("Summarise", started.question());
        assertEquals(8, started.pages());
        assertEquals(2, started.slices());
    }

    @Test
    void deserialize_sliceDone_intoConcreteSubtype() throws Exception {
        String wire =
                """
                {"phase":"whole_doc_slice_done","completed":3,"total":10,"pages":"17-24",\
                "durationMs":980,"excerpts":4,"facts":9}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocSliceDone slice = assertInstanceOf(WholeDocSliceDone.class, detail);
        assertEquals(3, slice.completed());
        assertEquals(10, slice.total());
        assertEquals("17-24", slice.pages());
        assertEquals(980, slice.durationMs());
        assertEquals(4, slice.excerpts());
        assertEquals(9, slice.facts());
    }

    @Test
    void deserialize_compressionRound_intoConcreteSubtype() throws Exception {
        String wire =
                """
                {"phase":"whole_doc_compression_round","roundNumber":2,"notesIn":50,"groups":7}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocCompressionRound round = assertInstanceOf(WholeDocCompressionRound.class, detail);
        assertEquals("whole_doc_compression_round", round.phase());
        assertEquals(2, round.roundNumber());
        assertEquals(50, round.notesIn());
        assertEquals(7, round.groups());
    }

    @Test
    void deserialize_readDone_intoConcreteSubtype() throws Exception {
        String wire =
                """
                {"phase":"whole_doc_read_done","completed":5,"slices":5,"durationSeconds":18.25}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocReadDone done = assertInstanceOf(WholeDocReadDone.class, detail);
        assertEquals(5, done.completed());
        assertEquals(5, done.slices());
        assertEquals(18.25, done.durationSeconds(), 0.0);
    }

    // -------------------------------------------------------------------------
    // Round-trip — value equality holds through serialize + deserialize
    // -------------------------------------------------------------------------

    @Test
    void roundTrip_preservesValueEquality_forEachSubtype() throws Exception {
        assertRoundTrips(new WholeDocReadStarted("whole_doc_read_started", "question?", 20, 6));
        assertRoundTrips(new WholeDocSliceDone("whole_doc_slice_done", 4, 6, "1-3", 500, 2, 3));
        assertRoundTrips(new WholeDocCompressionRound("whole_doc_compression_round", 1, 30, 4));
        assertRoundTrips(new WholeDocReadDone("whole_doc_read_done", 6, 6, 99.99));
    }

    private void assertRoundTrips(AiEngineProgressDetail original) throws Exception {
        String json = objectMapper.writeValueAsString(original);
        AiEngineProgressDetail back = objectMapper.readValue(json, AiEngineProgressDetail.class);
        assertEquals(original, back);
        // Polymorphic round-trip must preserve the runtime subtype, not just the field values.
        assertEquals(original.getClass(), back.getClass());
    }

    // -------------------------------------------------------------------------
    // Edge / boundary — null strings, empty strings, zero and negative numbers
    // -------------------------------------------------------------------------

    @Test
    void roundTrip_nullStringFields_arePreserved() throws Exception {
        // question is nullable; a null is serialized as JSON null and read back as null.
        AiEngineProgressDetail original =
                new WholeDocReadStarted("whole_doc_read_started", null, 0, 0);

        String json = objectMapper.writeValueAsString(original);
        AiEngineProgressDetail back = objectMapper.readValue(json, AiEngineProgressDetail.class);

        WholeDocReadStarted started = assertInstanceOf(WholeDocReadStarted.class, back);
        assertNull(started.question());
        assertEquals(0, started.pages());
        assertEquals(0, started.slices());
    }

    @Test
    void deserialize_emptyAndNegativeNumericValues_areAccepted() throws Exception {
        // Negative/zero counters are not validated by the record, so they pass through verbatim.
        String wire =
                """
                {"phase":"whole_doc_slice_done","completed":0,"total":0,"pages":"",\
                "durationMs":-1,"excerpts":-5,"facts":0}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocSliceDone slice = assertInstanceOf(WholeDocSliceDone.class, detail);
        assertEquals(0, slice.completed());
        assertEquals(0, slice.total());
        assertEquals("", slice.pages());
        assertEquals(-1, slice.durationMs());
        assertEquals(-5, slice.excerpts());
        assertEquals(0, slice.facts());
    }

    @Test
    void deserialize_missingPrimitiveFields_defaultToZero() throws Exception {
        // Only the discriminator is supplied; absent int fields default to 0 and the String is
        // null.
        String wire = "{\"phase\":\"whole_doc_read_started\"}";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocReadStarted started = assertInstanceOf(WholeDocReadStarted.class, detail);
        assertNull(started.question());
        assertEquals(0, started.pages());
        assertEquals(0, started.slices());
    }

    @Test
    void deserialize_ignoresUnknownProperties() throws Exception {
        // @JsonIgnoreProperties(ignoreUnknown = true) — an extra wire field must not break parsing.
        String wire =
                """
                {"phase":"whole_doc_read_done","completed":2,"slices":2,"durationSeconds":1.0,\
                "futureFieldFromEngine":"ignored","anotherUnknown":123}""";

        AiEngineProgressDetail detail = objectMapper.readValue(wire, AiEngineProgressDetail.class);

        WholeDocReadDone done = assertInstanceOf(WholeDocReadDone.class, detail);
        assertEquals(2, done.completed());
        assertEquals(2, done.slices());
        assertEquals(1.0, done.durationSeconds(), 0.0);
    }

    // -------------------------------------------------------------------------
    // Exception paths — bad / missing discriminator
    // -------------------------------------------------------------------------

    @Test
    void deserialize_unknownPhase_throws() {
        String wire = "{\"phase\":\"not_a_real_phase\",\"completed\":1}";

        assertThrows(
                JacksonException.class,
                () -> objectMapper.readValue(wire, AiEngineProgressDetail.class));
    }

    @Test
    void deserialize_missingDiscriminator_throws() {
        // Without the phase property Jackson cannot resolve a subtype of the sealed interface.
        String wire = "{\"completed\":1,\"total\":2}";

        assertThrows(
                JacksonException.class,
                () -> objectMapper.readValue(wire, AiEngineProgressDetail.class));
    }

    @Test
    void deserialize_nullDiscriminator_throws() {
        String wire = "{\"phase\":null,\"completed\":1}";

        assertThrows(
                JacksonException.class,
                () -> objectMapper.readValue(wire, AiEngineProgressDetail.class));
    }
}
