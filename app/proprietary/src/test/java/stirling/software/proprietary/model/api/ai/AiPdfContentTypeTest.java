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

class AiPdfContentTypeTest {

    private final JsonMapper mapper = new JsonMapper();

    // -------------------------------------------------------------------------
    // getValue() — declared wire values
    // -------------------------------------------------------------------------

    @Test
    void getValue_returnsSnakeCaseWireValueForEachConstant() {
        assertThat(AiPdfContentType.PAGE_LAYOUT.getValue()).isEqualTo("page_layout");
        assertThat(AiPdfContentType.DOCUMENT_METADATA.getValue()).isEqualTo("document_metadata");
        assertThat(AiPdfContentType.ENCRYPTION_INFO.getValue()).isEqualTo("encryption_info");
        assertThat(AiPdfContentType.BOOKMARKS.getValue()).isEqualTo("bookmarks");
        assertThat(AiPdfContentType.LAYERS.getValue()).isEqualTo("layers");
        assertThat(AiPdfContentType.EMBEDDED_FILES.getValue()).isEqualTo("embedded_files");
        assertThat(AiPdfContentType.JAVASCRIPT.getValue()).isEqualTo("javascript");
        assertThat(AiPdfContentType.LINKS.getValue()).isEqualTo("links");
        assertThat(AiPdfContentType.IMAGE_INFO.getValue()).isEqualTo("image_info");
        assertThat(AiPdfContentType.FONTS.getValue()).isEqualTo("fonts");
        assertThat(AiPdfContentType.PAGE_TEXT.getValue()).isEqualTo("page_text");
        assertThat(AiPdfContentType.FULL_TEXT.getValue()).isEqualTo("full_text");
        assertThat(AiPdfContentType.FORM_FIELDS.getValue()).isEqualTo("form_fields");
        assertThat(AiPdfContentType.ANNOTATIONS.getValue()).isEqualTo("annotations");
        assertThat(AiPdfContentType.SIGNATURES.getValue()).isEqualTo("signatures");
        assertThat(AiPdfContentType.STRUCTURE_TREE.getValue()).isEqualTo("structure_tree");
        assertThat(AiPdfContentType.XMP_METADATA.getValue()).isEqualTo("xmp_metadata");
        assertThat(AiPdfContentType.COMPLIANCE.getValue()).isEqualTo("compliance");
        assertThat(AiPdfContentType.IMAGES.getValue()).isEqualTo("images");
    }

    @Test
    void getValue_isNeverNullOrBlankForAnyConstant() {
        for (AiPdfContentType type : AiPdfContentType.values()) {
            assertThat(type.getValue()).isNotBlank();
        }
    }

    @Test
    void getValue_isUniqueAcrossAllConstants() {
        long distinct =
                Arrays.stream(AiPdfContentType.values())
                        .map(AiPdfContentType::getValue)
                        .distinct()
                        .count();
        assertThat(distinct).isEqualTo(AiPdfContentType.values().length);
    }

    // -------------------------------------------------------------------------
    // fromValue() — happy path
    // -------------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(AiPdfContentType.class)
    void fromValue_roundTripsEveryConstantThroughItsWireValue(AiPdfContentType type) {
        assertThat(AiPdfContentType.fromValue(type.getValue())).isSameAs(type);
    }

    @Test
    void fromValue_resolvesKnownValuesToExpectedConstants() {
        assertThat(AiPdfContentType.fromValue("page_text")).isSameAs(AiPdfContentType.PAGE_TEXT);
        assertThat(AiPdfContentType.fromValue("images")).isSameAs(AiPdfContentType.IMAGES);
        assertThat(AiPdfContentType.fromValue("xmp_metadata"))
                .isSameAs(AiPdfContentType.XMP_METADATA);
    }

    // -------------------------------------------------------------------------
    // fromValue() — exception paths
    // -------------------------------------------------------------------------

    @Test
    void fromValue_unknownValue_throwsIllegalArgumentExceptionWithOffendingValue() {
        assertThatThrownBy(() -> AiPdfContentType.fromValue("not_a_real_type"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown PDF content type")
                .hasMessageContaining("not_a_real_type");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "PAGE_TEXT", "Page_Text", "page text", "page_text "})
    void fromValue_caseSensitiveAndExactMatchOnly_rejectsNearMisses(String value) {
        // The lookup is an exact String.equals() match: enum-constant names, differing case,
        // surrounding whitespace, and the empty string are all rejected.
        assertThatThrownBy(() -> AiPdfContentType.fromValue(value))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown PDF content type");
    }

    @Test
    void fromValue_null_throwsIllegalArgumentException() {
        // No constant's value equals null, so the loop completes and the explicit throw fires;
        // crucially it is NOT a NullPointerException.
        assertThatThrownBy(() -> AiPdfContentType.fromValue(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown PDF content type");
    }

    // -------------------------------------------------------------------------
    // Jackson 3 integration — @JsonValue / @JsonCreator honoured end to end
    // -------------------------------------------------------------------------

    @Test
    void jackson_serialisesConstantToItsWireValueString() throws Exception {
        assertThat(mapper.writeValueAsString(AiPdfContentType.FORM_FIELDS))
                .isEqualTo("\"form_fields\"");
    }

    @Test
    void jackson_deserialisesWireValueStringBackToConstant() throws Exception {
        assertThat(mapper.readValue("\"structure_tree\"", AiPdfContentType.class))
                .isSameAs(AiPdfContentType.STRUCTURE_TREE);
    }

    @ParameterizedTest
    @EnumSource(AiPdfContentType.class)
    void jackson_serialiseThenDeserialiseRoundTripsEveryConstant(AiPdfContentType type)
            throws Exception {
        String json = mapper.writeValueAsString(type);
        assertThat(mapper.readValue(json, AiPdfContentType.class)).isSameAs(type);
    }

    @Test
    void jackson_deserialiseUnknownValue_failsRatherThanReturningNull() {
        // The @JsonCreator delegates to fromValue(), so an unknown token must blow up.
        assertThatThrownBy(() -> mapper.readValue("\"bogus_value\"", AiPdfContentType.class))
                .isInstanceOf(Exception.class);
    }

    // -------------------------------------------------------------------------
    // Enum identity sanity
    // -------------------------------------------------------------------------

    @Test
    void valueOf_stillResolvesByConstantName() {
        assertThatCode(() -> AiPdfContentType.valueOf("IMAGES")).doesNotThrowAnyException();
        assertThat(AiPdfContentType.valueOf("IMAGES")).isSameAs(AiPdfContentType.IMAGES);
    }

    @Test
    void values_exposesAllNineteenContentTypes() {
        assertThat(AiPdfContentType.values()).hasSize(19);
    }
}
