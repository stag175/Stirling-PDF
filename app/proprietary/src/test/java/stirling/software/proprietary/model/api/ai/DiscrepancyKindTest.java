package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import tools.jackson.databind.json.JsonMapper;

class DiscrepancyKindTest {

    // -------------------------------------------------------------------------
    // toJson() — @JsonValue lower-casing for every constant
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "TALLY, tally",
        "ARITHMETIC, arithmetic",
        "CONSISTENCY, consistency",
        "STATEMENT, statement"
    })
    void toJson_returnsLowerCasedConstantName(DiscrepancyKind kind, String expectedWireValue) {
        assertThat(kind.toJson()).isEqualTo(expectedWireValue);
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void toJson_equalsTheLowerCasedEnumName(DiscrepancyKind kind) {
        // The whole behaviour of the method is name().toLowerCase(); assert that contract directly
        // so a future rename of a constant still keeps the wire value in lock-step.
        assertThat(kind.toJson()).isEqualTo(kind.name().toLowerCase());
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void toJson_isNeverNullOrBlank(DiscrepancyKind kind) {
        assertThat(kind.toJson()).isNotNull().isNotBlank();
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void toJson_isAllLowerCaseAlpha(DiscrepancyKind kind) {
        // Every constant name is a single all-caps word, so the wire value is plain lowercase.
        assertThat(kind.toJson()).matches("[a-z]+");
    }

    @Test
    void toJson_isUniqueAcrossAllConstants() {
        assertThat(DiscrepancyKind.values())
                .extracting(DiscrepancyKind::toJson)
                .doesNotHaveDuplicates();
    }

    // -------------------------------------------------------------------------
    // Enum identity / completeness sanity
    // -------------------------------------------------------------------------

    @Test
    void enum_hasExactlyFourConstants() {
        assertThat(DiscrepancyKind.values()).hasSize(4);
    }

    @Test
    void values_exposesEveryDeclaredConstantInDeclarationOrder() {
        assertThat(DiscrepancyKind.values())
                .containsExactly(
                        DiscrepancyKind.TALLY,
                        DiscrepancyKind.ARITHMETIC,
                        DiscrepancyKind.CONSISTENCY,
                        DiscrepancyKind.STATEMENT);
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void valueOf_resolvesByConstantName(DiscrepancyKind kind) {
        assertThat(DiscrepancyKind.valueOf(kind.name())).isSameAs(kind);
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) wiring — @JsonValue drives serialization
    // -------------------------------------------------------------------------

    @Test
    void jacksonSerialization_usesLowerCaseWireValue() throws Exception {
        JsonMapper mapper = new JsonMapper();
        assertThat(mapper.writeValueAsString(DiscrepancyKind.ARITHMETIC))
                .isEqualTo("\"arithmetic\"");
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void jacksonSerialization_quotesTheToJsonValueForEveryConstant(DiscrepancyKind kind)
            throws Exception {
        JsonMapper mapper = new JsonMapper();
        assertThat(mapper.writeValueAsString(kind)).isEqualTo("\"" + kind.toJson() + "\"");
    }

    @ParameterizedTest
    @EnumSource(DiscrepancyKind.class)
    void jacksonRoundTrip_deserialisesTheWireValueBackToTheConstant(DiscrepancyKind kind)
            throws Exception {
        // There is no @JsonCreator: Jackson builds its read-side lookup from the @JsonValue output,
        // so the lower-cased wire value emitted on write must deserialise back to the same constant.
        JsonMapper mapper = new JsonMapper();
        String json = mapper.writeValueAsString(kind);
        assertThat(mapper.readValue(json, DiscrepancyKind.class)).isSameAs(kind);
    }
}
