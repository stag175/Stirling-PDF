package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import tools.jackson.databind.json.JsonMapper;

class FolioTypeTest {

    private final JsonMapper mapper = new JsonMapper();

    // -------------------------------------------------------------------------
    // toJson() — @JsonValue wire form is the lower-cased constant name
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "TEXT, text",
        "IMAGE, image",
        "MIXED, mixed"
    })
    void toJson_returnsLowerCasedConstantName(FolioType type, String expectedWireValue) {
        assertThat(type.toJson()).isEqualTo(expectedWireValue);
    }

    @ParameterizedTest
    @EnumSource(FolioType.class)
    void toJson_equalsNameToLowerCaseForEveryConstant(FolioType type) {
        // Directly exercises the implementation: name().toLowerCase().
        assertThat(type.toJson()).isEqualTo(type.name().toLowerCase());
    }

    @ParameterizedTest
    @EnumSource(FolioType.class)
    void toJson_isNeverNullOrBlankAndIsAlreadyLowerCase(FolioType type) {
        String json = type.toJson();
        assertThat(json).isNotNull().isNotBlank();
        assertThat(json).isEqualTo(json.toLowerCase());
        assertThat(json).matches("[a-z]+");
    }

    @Test
    void toJson_isUniqueAcrossAllConstants() {
        long distinct =
                Arrays.stream(FolioType.values())
                        .map(FolioType::toJson)
                        .distinct()
                        .count();
        assertThat(distinct).isEqualTo(FolioType.values().length);
    }

    // -------------------------------------------------------------------------
    // Enum identity / shape
    // -------------------------------------------------------------------------

    @Test
    void values_exposesExactlyTheThreeFolioTypes() {
        assertThat(FolioType.values())
                .containsExactly(FolioType.TEXT, FolioType.IMAGE, FolioType.MIXED);
    }

    @ParameterizedTest
    @EnumSource(FolioType.class)
    void valueOf_resolvesByConstantName(FolioType type) {
        assertThat(FolioType.valueOf(type.name())).isSameAs(type);
    }

    @Test
    void valueOf_unknownName_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> FolioType.valueOf("text"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FolioType.valueOf("BOGUS"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) serialization — @JsonValue is honoured
    //
    // NOTE: FolioType declares @JsonValue but has NO @JsonCreator, so Jackson
    // serialises via toJson() (lower-case) yet deserialises by *constant name*
    // (upper-case), which is intentionally asymmetric. The tests below pin that
    // behaviour. com.fasterxml.jackson.annotation.@JsonValue is recognised by the
    // tools.jackson databind on this stack (same pattern as AiPdfContentType).
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "TEXT, \"text\"",
        "IMAGE, \"image\"",
        "MIXED, \"mixed\""
    })
    void jackson_serialisesConstantToItsLowerCaseWireValue(FolioType type, String expectedJson)
            throws Exception {
        assertThat(mapper.writeValueAsString(type)).isEqualTo(expectedJson);
    }

    @ParameterizedTest
    @EnumSource(FolioType.class)
    void jackson_serialisationMatchesToJsonForEveryConstant(FolioType type) throws Exception {
        assertThat(mapper.writeValueAsString(type)).isEqualTo("\"" + type.toJson() + "\"");
    }

    @Test
    void jackson_deserialisesByJsonValueLowerCaseForm() throws Exception {
        // Jackson 3 builds the enum read-side map from @JsonValue, so the lower-case
        // wire form deserialises back to the constant.
        assertThat(mapper.readValue("\"text\"", FolioType.class)).isSameAs(FolioType.TEXT);
        assertThat(mapper.readValue("\"mixed\"", FolioType.class)).isSameAs(FolioType.MIXED);
    }

    @Test
    void jackson_deserialisingTheUpperCaseConstantName_fails() {
        // Deserialisation matches the @JsonValue (lower-case) form only; the raw
        // constant name is not a recognised token.
        assertThatThrownBy(() -> mapper.readValue("\"TEXT\"", FolioType.class))
                .isInstanceOf(Exception.class);
    }

    @Test
    void jackson_deserialiseUnknownToken_throws() {
        assertThatThrownBy(() -> mapper.readValue("\"bogus\"", FolioType.class))
                .isInstanceOf(Exception.class);
    }

    @Test
    void jackson_serialiseThenDeserialise_roundTripsEveryConstant() throws Exception {
        // The @JsonValue (lower-case) wire form survives a write -> read round trip.
        for (FolioType type : FolioType.values()) {
            String wire = mapper.writeValueAsString(type);
            assertThat(mapper.readValue(wire, FolioType.class)).isSameAs(type);
        }
    }

    @Test
    void toJson_doesNotThrowForAnyConstant() {
        assertThatCode(
                        () -> {
                            for (FolioType type : FolioType.values()) {
                                type.toJson();
                            }
                        })
                .doesNotThrowAnyException();
    }
}
