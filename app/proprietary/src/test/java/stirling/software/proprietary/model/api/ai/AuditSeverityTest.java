package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link AuditSeverity}, the two-constant severity enum whose only behaviour is
 * {@link AuditSeverity#toJson()} — a {@code com.fasterxml.jackson.annotation.@JsonValue}-annotated
 * method returning {@code name().toLowerCase()} (ERROR -&gt; error, WARNING -&gt; warning).
 *
 * <p>The Jackson section uses a plain Jackson 3 ({@code tools.jackson}) {@link JsonMapper}, matching
 * the convention of the sibling enum tests in this package ({@code DiscrepancyKindTest},
 * {@code VerdictTest}). Jackson 3 honours the legacy {@code com.fasterxml.jackson} {@code @JsonValue}
 * annotation that this enum carries, so serialization emits the lower-cased wire value and — with no
 * {@code @JsonCreator} present — Jackson builds its read-side lookup from that same wire value. No
 * Spring context, no IO.
 */
class AuditSeverityTest {

    // -------------------------------------------------------------------------
    // toJson() — @JsonValue lower-casing for every constant
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({"ERROR, error", "WARNING, warning"})
    void toJson_returnsLowerCasedConstantName(AuditSeverity severity, String expectedWireValue) {
        assertThat(severity.toJson()).isEqualTo(expectedWireValue);
    }

    @Test
    void toJson_error_isError() {
        assertThat(AuditSeverity.ERROR.toJson()).isEqualTo("error");
    }

    @Test
    void toJson_warning_isWarning() {
        assertThat(AuditSeverity.WARNING.toJson()).isEqualTo("warning");
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void toJson_equalsTheLowerCasedEnumName(AuditSeverity severity) {
        // The whole behaviour of the method is name().toLowerCase(); assert that contract directly
        // so a future rename of a constant still keeps the wire value in lock-step.
        assertThat(severity.toJson()).isEqualTo(severity.name().toLowerCase());
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void toJson_isNeverNullOrBlank(AuditSeverity severity) {
        assertThat(severity.toJson()).isNotNull().isNotBlank();
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void toJson_isAllLowerCaseAlpha(AuditSeverity severity) {
        // Every constant name is a single all-caps word, so the wire value is plain lowercase.
        assertThat(severity.toJson()).matches("[a-z]+");
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void toJson_isStableAcrossInvocations(AuditSeverity severity) {
        // name().toLowerCase() is deterministic; two calls must yield an equal value.
        assertThat(severity.toJson()).isEqualTo(severity.toJson());
    }

    @Test
    void toJson_isUniqueAcrossAllConstants() {
        assertThat(AuditSeverity.values())
                .extracting(AuditSeverity::toJson)
                .doesNotHaveDuplicates();
    }

    // -------------------------------------------------------------------------
    // Enum identity / completeness sanity
    // -------------------------------------------------------------------------

    @Test
    void enum_hasExactlyTwoConstants() {
        assertThat(AuditSeverity.values()).hasSize(2);
    }

    @Test
    void values_exposesEveryDeclaredConstantInDeclarationOrder() {
        assertThat(AuditSeverity.values())
                .containsExactly(AuditSeverity.ERROR, AuditSeverity.WARNING);
    }

    @Test
    void ordinals_followDeclarationOrder() {
        assertThat(AuditSeverity.ERROR.ordinal()).isZero();
        assertThat(AuditSeverity.WARNING.ordinal()).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void valueOf_resolvesByConstantName(AuditSeverity severity) {
        assertThat(AuditSeverity.valueOf(severity.name())).isSameAs(severity);
    }

    @Test
    void valueOf_unknownName_throwsIllegalArgumentException() {
        // valueOf uses the UPPER-CASE constant name, not the lower-cased wire value.
        assertThat(catchValueOf("error")).isInstanceOf(IllegalArgumentException.class);
        assertThat(catchValueOf("NOPE")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void valueOf_nullName_throwsNullPointerException() {
        assertThat(catchValueOf(null)).isInstanceOf(NullPointerException.class);
    }

    private static Throwable catchValueOf(String name) {
        try {
            AuditSeverity.valueOf(name);
            return null;
        } catch (Throwable t) {
            return t;
        }
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) wiring — @JsonValue drives serialization
    // -------------------------------------------------------------------------

    @Test
    void jacksonSerialization_usesLowerCaseWireValue() {
        JsonMapper mapper = new JsonMapper();
        assertThat(mapper.writeValueAsString(AuditSeverity.ERROR)).isEqualTo("\"error\"");
        assertThat(mapper.writeValueAsString(AuditSeverity.WARNING)).isEqualTo("\"warning\"");
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void jacksonSerialization_quotesTheToJsonValueForEveryConstant(AuditSeverity severity) {
        JsonMapper mapper = new JsonMapper();
        assertThat(mapper.writeValueAsString(severity)).isEqualTo("\"" + severity.toJson() + "\"");
    }

    @ParameterizedTest
    @EnumSource(AuditSeverity.class)
    void jacksonRoundTrip_deserialisesTheWireValueBackToTheConstant(AuditSeverity severity) {
        // There is no @JsonCreator: Jackson builds its read-side lookup from the @JsonValue output,
        // so the lower-cased wire value emitted on write must deserialise back to the same constant.
        JsonMapper mapper = new JsonMapper();
        String json = mapper.writeValueAsString(severity);
        assertThat(mapper.readValue(json, AuditSeverity.class)).isSameAs(severity);
    }
}
