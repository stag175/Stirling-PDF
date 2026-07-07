package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.json.JsonMapper;

class AiWorkflowOutcomeTest {

    // -------------------------------------------------------------------------
    // getValue() — wire value mapping for every constant
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "ANSWER, answer",
        "NOT_FOUND, not_found",
        "NEED_CONTENT, need_content",
        "NEED_INGEST, need_ingest",
        "PLAN, plan",
        "NEED_CLARIFICATION, need_clarification",
        "CANNOT_DO, cannot_do",
        "DRAFT, draft",
        "TOOL_CALL, tool_call",
        "COMPLETED, completed",
        "UNSUPPORTED_CAPABILITY, unsupported_capability",
        "CANNOT_CONTINUE, cannot_continue",
        "GENERATE_FILE, generate_file"
    })
    void getValue_returnsExpectedWireValue(AiWorkflowOutcome outcome, String expectedWireValue) {
        assertThat(outcome.getValue()).isEqualTo(expectedWireValue);
    }

    @Test
    void enum_hasExactlyThirteenConstants() {
        assertThat(AiWorkflowOutcome.values()).hasSize(13);
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowOutcome.class)
    void getValue_isNeverNullOrBlank(AiWorkflowOutcome outcome) {
        assertThat(outcome.getValue()).isNotNull().isNotBlank();
    }

    @Test
    void getValue_isUniqueAcrossAllConstants() {
        assertThat(AiWorkflowOutcome.values())
                .extracting(AiWorkflowOutcome::getValue)
                .doesNotHaveDuplicates();
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowOutcome.class)
    void getValue_isLowerCaseSnakeCase(AiWorkflowOutcome outcome) {
        assertThat(outcome.getValue()).matches("[a-z]+(_[a-z]+)*");
    }

    // -------------------------------------------------------------------------
    // fromValue() — happy path lookup for every constant
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "answer, ANSWER",
        "not_found, NOT_FOUND",
        "need_content, NEED_CONTENT",
        "need_ingest, NEED_INGEST",
        "plan, PLAN",
        "need_clarification, NEED_CLARIFICATION",
        "cannot_do, CANNOT_DO",
        "draft, DRAFT",
        "tool_call, TOOL_CALL",
        "completed, COMPLETED",
        "unsupported_capability, UNSUPPORTED_CAPABILITY",
        "cannot_continue, CANNOT_CONTINUE",
        "generate_file, GENERATE_FILE"
    })
    void fromValue_resolvesKnownWireValue(String wireValue, AiWorkflowOutcome expected) {
        assertThat(AiWorkflowOutcome.fromValue(wireValue)).isEqualTo(expected);
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowOutcome.class)
    void fromValue_roundTripsWithGetValue(AiWorkflowOutcome outcome) {
        assertThat(AiWorkflowOutcome.fromValue(outcome.getValue())).isSameAs(outcome);
    }

    // -------------------------------------------------------------------------
    // fromValue() — unknown / null / empty / boundary inputs
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @ValueSource(
            strings = {
                "unknown",
                "ANSWER", // enum constant name, not the wire value
                "Answer", // wrong case
                "answer ", // trailing whitespace
                " answer", // leading whitespace
                "answer\n",
                "tool-call", // hyphen instead of underscore
                "0"
            })
    void fromValue_unknownValue_throwsIllegalArgumentException(String unknown) {
        assertThatThrownBy(() -> AiWorkflowOutcome.fromValue(unknown))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow outcome")
                .hasMessageContaining(unknown);
    }

    @Test
    void fromValue_emptyString_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> AiWorkflowOutcome.fromValue(""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow outcome");
    }

    @Test
    void fromValue_null_throwsIllegalArgumentException() {
        // value.equals(null) is false for every constant, so the loop falls through to throw.
        assertThatThrownBy(() -> AiWorkflowOutcome.fromValue(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow outcome");
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) wiring — @JsonValue / @JsonCreator
    // -------------------------------------------------------------------------

    @Test
    void jacksonSerialization_usesWireValue() throws Exception {
        JsonMapper mapper = new JsonMapper();
        assertThat(mapper.writeValueAsString(AiWorkflowOutcome.NEED_CLARIFICATION))
                .isEqualTo("\"need_clarification\"");
    }

    @Test
    void jacksonDeserialization_usesFromValue() throws Exception {
        JsonMapper mapper = new JsonMapper();
        AiWorkflowOutcome result = mapper.readValue("\"generate_file\"", AiWorkflowOutcome.class);
        assertThat(result).isEqualTo(AiWorkflowOutcome.GENERATE_FILE);
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowOutcome.class)
    void jacksonRoundTrip_preservesConstant(AiWorkflowOutcome outcome) throws Exception {
        JsonMapper mapper = new JsonMapper();
        String json = mapper.writeValueAsString(outcome);
        assertThat(mapper.readValue(json, AiWorkflowOutcome.class)).isEqualTo(outcome);
    }

    @Test
    void jacksonDeserialization_unknownValue_throws() {
        // Jackson surfaces the IllegalArgumentException from fromValue(); whether it is rethrown
        // directly or wrapped, the originating message propagates through the exception chain.
        JsonMapper mapper = new JsonMapper();
        assertThatThrownBy(() -> mapper.readValue("\"bogus\"", AiWorkflowOutcome.class))
                .hasMessageContaining("Unknown AI workflow outcome");
    }
}
