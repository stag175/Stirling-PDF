package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.json.JsonMapper;

class AiWorkflowPhaseTest {

    private final JsonMapper mapper = new JsonMapper();

    // -------------------------------------------------------------------------
    // getValue() — declared wire values
    // -------------------------------------------------------------------------

    @Test
    void getValue_returnsSnakeCaseWireValueForEachConstant() {
        assertThat(AiWorkflowPhase.ANALYZING.getValue()).isEqualTo("analyzing");
        assertThat(AiWorkflowPhase.CALLING_ENGINE.getValue()).isEqualTo("calling_engine");
        assertThat(AiWorkflowPhase.EXTRACTING_CONTENT.getValue()).isEqualTo("extracting_content");
        assertThat(AiWorkflowPhase.EXECUTING_TOOL.getValue()).isEqualTo("executing_tool");
        assertThat(AiWorkflowPhase.PROCESSING.getValue()).isEqualTo("processing");
        assertThat(AiWorkflowPhase.ENGINE_PROGRESS.getValue()).isEqualTo("engine_progress");
    }

    @Test
    void getValue_isNeverNullOrBlankForAnyConstant() {
        for (AiWorkflowPhase phase : AiWorkflowPhase.values()) {
            assertThat(phase.getValue()).isNotBlank();
        }
    }

    @Test
    void getValue_isUniqueAcrossAllConstants() {
        long distinct =
                Arrays.stream(AiWorkflowPhase.values())
                        .map(AiWorkflowPhase::getValue)
                        .distinct()
                        .count();
        assertThat(distinct).isEqualTo(AiWorkflowPhase.values().length);
    }

    // -------------------------------------------------------------------------
    // fromValue() — happy path
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(AiWorkflowPhase.class)
    void fromValue_roundTripsEveryConstantThroughItsWireValue(AiWorkflowPhase phase) {
        assertThat(AiWorkflowPhase.fromValue(phase.getValue())).isSameAs(phase);
    }

    @Test
    void fromValue_resolvesKnownValuesToExpectedConstants() {
        assertThat(AiWorkflowPhase.fromValue("analyzing")).isSameAs(AiWorkflowPhase.ANALYZING);
        assertThat(AiWorkflowPhase.fromValue("calling_engine"))
                .isSameAs(AiWorkflowPhase.CALLING_ENGINE);
        assertThat(AiWorkflowPhase.fromValue("engine_progress"))
                .isSameAs(AiWorkflowPhase.ENGINE_PROGRESS);
    }

    // -------------------------------------------------------------------------
    // fromValue() — exception paths
    // -------------------------------------------------------------------------

    @Test
    void fromValue_unknownValue_throwsIllegalArgumentExceptionWithOffendingValue() {
        assertThatThrownBy(() -> AiWorkflowPhase.fromValue("not_a_real_phase"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow phase")
                .hasMessageContaining("not_a_real_phase");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "ANALYZING", "Analyzing", "calling engine", "analyzing "})
    void fromValue_caseSensitiveAndExactMatchOnly_rejectsNearMisses(String value) {
        // The lookup is an exact String.equals() match: enum-constant names, differing case,
        // surrounding whitespace, and the empty string are all rejected.
        assertThatThrownBy(() -> AiWorkflowPhase.fromValue(value))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow phase");
    }

    @Test
    void fromValue_null_throwsIllegalArgumentExceptionNotNpe() {
        // phase.value.equals(null) is always false, so the loop completes and the explicit
        // throw fires; crucially it is NOT a NullPointerException.
        assertThatThrownBy(() -> AiWorkflowPhase.fromValue(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown AI workflow phase");
    }

    // -------------------------------------------------------------------------
    // Jackson 3 integration — @JsonValue / @JsonCreator honoured end to end
    // -------------------------------------------------------------------------

    @Test
    void jackson_serialisesConstantToItsWireValueString() throws Exception {
        assertThat(mapper.writeValueAsString(AiWorkflowPhase.EXTRACTING_CONTENT))
                .isEqualTo("\"extracting_content\"");
    }

    @Test
    void jackson_deserialisesWireValueStringBackToConstant() throws Exception {
        assertThat(mapper.readValue("\"executing_tool\"", AiWorkflowPhase.class))
                .isSameAs(AiWorkflowPhase.EXECUTING_TOOL);
    }

    @ParameterizedTest
    @EnumSource(AiWorkflowPhase.class)
    void jackson_serialiseThenDeserialiseRoundTripsEveryConstant(AiWorkflowPhase phase)
            throws Exception {
        String json = mapper.writeValueAsString(phase);
        assertThat(mapper.readValue(json, AiWorkflowPhase.class)).isSameAs(phase);
    }

    @Test
    void jackson_deserialiseUnknownValue_failsRatherThanReturningNull() {
        // The @JsonCreator delegates to fromValue(), so an unknown token must blow up.
        assertThatThrownBy(() -> mapper.readValue("\"bogus_phase\"", AiWorkflowPhase.class))
                .isInstanceOf(Exception.class);
    }

    // -------------------------------------------------------------------------
    // Enum identity sanity
    // -------------------------------------------------------------------------

    @Test
    void valueOf_stillResolvesByConstantName() {
        assertThatCode(() -> AiWorkflowPhase.valueOf("PROCESSING")).doesNotThrowAnyException();
        assertThat(AiWorkflowPhase.valueOf("PROCESSING")).isSameAs(AiWorkflowPhase.PROCESSING);
    }

    @Test
    void values_exposesAllSixPhases() {
        assertThat(AiWorkflowPhase.values()).hasSize(6);
    }
}
