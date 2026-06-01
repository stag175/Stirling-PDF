package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PdfJsonPageDimensionTest {

    // Jackson 3 enables FAIL_ON_NULL_FOR_PRIMITIVES by default and treats the Lombok
    // @AllArgsConstructor as the creator, so absent primitive fields would otherwise throw. The app
    // disables this (spring.jackson.deserialization.fail-on-null-for-primitives=false); mirror it.
    private final ObjectMapper mapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    @Test
    @DisplayName("no-args constructor yields zeroed primitive defaults")
    void noArgsConstructor_defaults() {
        PdfJsonPageDimension dim = new PdfJsonPageDimension();

        assertEquals(0, dim.getPageNumber());
        assertEquals(0.0f, dim.getWidth());
        assertEquals(0.0f, dim.getHeight());
        assertEquals(0, dim.getRotation());
    }

    @Test
    @DisplayName("all-args constructor sets every field exactly")
    void allArgsConstructor_setsEveryField() {
        PdfJsonPageDimension dim = new PdfJsonPageDimension(3, 612.0f, 792.0f, 90);

        assertEquals(3, dim.getPageNumber());
        assertEquals(612.0f, dim.getWidth());
        assertEquals(792.0f, dim.getHeight());
        assertEquals(90, dim.getRotation());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        PdfJsonPageDimension built =
                PdfJsonPageDimension.builder()
                        .pageNumber(3)
                        .width(612.0f)
                        .height(792.0f)
                        .rotation(90)
                        .build();

        PdfJsonPageDimension constructed = new PdfJsonPageDimension(3, 612.0f, 792.0f, 90);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("builder with no fields set yields zeroed defaults equal to no-args constructor")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonPageDimension built = PdfJsonPageDimension.builder().build();

        assertEquals(new PdfJsonPageDimension(), built);
        assertEquals(0, built.getPageNumber());
        assertEquals(0.0f, built.getWidth());
        assertEquals(0.0f, built.getHeight());
        assertEquals(0, built.getRotation());
    }

    @Test
    @DisplayName("setters mutate the Lombok @Data instance")
    void setters_mutateState() {
        PdfJsonPageDimension dim = new PdfJsonPageDimension();

        dim.setPageNumber(5);
        dim.setWidth(100.5f);
        dim.setHeight(200.25f);
        dim.setRotation(270);

        assertEquals(5, dim.getPageNumber());
        assertEquals(100.5f, dim.getWidth());
        assertEquals(200.25f, dim.getHeight());
        assertEquals(270, dim.getRotation());
    }

    @ParameterizedTest(name = "round-trips pageNumber={0}, width={1}, height={2}, rotation={3}")
    @CsvSource({
        "0, 0.0, 0.0, 0",
        "1, 612.0, 792.0, 0",
        "42, 595.5, 842.25, 180",
        "-3, -10.0, -20.0, -90",
    })
    @DisplayName("builder round-trips all field values including negatives")
    void builder_roundTripsValues(int pageNumber, float width, float height, int rotation) {
        PdfJsonPageDimension dim =
                PdfJsonPageDimension.builder()
                        .pageNumber(pageNumber)
                        .width(width)
                        .height(height)
                        .rotation(rotation)
                        .build();

        assertEquals(pageNumber, dim.getPageNumber());
        assertEquals(width, dim.getWidth());
        assertEquals(height, dim.getHeight());
        assertEquals(rotation, dim.getRotation());
    }

    @ParameterizedTest(name = "preserves boundary int field value {0}")
    @ValueSource(ints = {Integer.MIN_VALUE, -1, 0, 1, Integer.MAX_VALUE})
    @DisplayName("integer fields are stored verbatim without clamping")
    void intFields_notClamped(int value) {
        PdfJsonPageDimension dim =
                PdfJsonPageDimension.builder().pageNumber(value).rotation(value).build();

        assertEquals(value, dim.getPageNumber());
        assertEquals(value, dim.getRotation());
    }

    @ParameterizedTest(name = "preserves boundary/special float field value {0}")
    @ValueSource(
            floats = {
                Float.MIN_VALUE,
                -Float.MAX_VALUE,
                0.0f,
                Float.MAX_VALUE,
                Float.POSITIVE_INFINITY,
                Float.NEGATIVE_INFINITY
            })
    @DisplayName("float fields are stored verbatim without clamping")
    void floatFields_notClamped(float value) {
        PdfJsonPageDimension dim =
                PdfJsonPageDimension.builder().width(value).height(value).build();

        assertEquals(value, dim.getWidth());
        assertEquals(value, dim.getHeight());
    }

    @Test
    @DisplayName("NaN float fields preserve NaN and break value equality (NaN != NaN by ==)")
    void floatFields_preserveNaN() {
        PdfJsonPageDimension dim =
                PdfJsonPageDimension.builder().width(Float.NaN).height(Float.NaN).build();

        assertTrue(Float.isNaN(dim.getWidth()));
        assertTrue(Float.isNaN(dim.getHeight()));

        // Lombok equals uses Float.compare, so two NaN-bearing instances are still equal.
        PdfJsonPageDimension other =
                PdfJsonPageDimension.builder().width(Float.NaN).height(Float.NaN).build();
        assertEquals(dim, other);
        assertEquals(dim.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode reflect value equality and field differences")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonPageDimension a = new PdfJsonPageDimension(2, 100.0f, 200.0f, 90);
        PdfJsonPageDimension b = new PdfJsonPageDimension(2, 100.0f, 200.0f, 90);
        PdfJsonPageDimension differentPage = new PdfJsonPageDimension(3, 100.0f, 200.0f, 90);
        PdfJsonPageDimension differentWidth = new PdfJsonPageDimension(2, 101.0f, 200.0f, 90);
        PdfJsonPageDimension differentHeight = new PdfJsonPageDimension(2, 100.0f, 201.0f, 90);
        PdfJsonPageDimension differentRotation = new PdfJsonPageDimension(2, 100.0f, 200.0f, 270);

        assertEquals(a, b, "Equal field values must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "Equal objects must share a hash code");

        assertNotEquals(a, differentPage);
        assertNotEquals(a, differentWidth);
        assertNotEquals(a, differentHeight);
        assertNotEquals(a, differentRotation);

        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-dimension");
        assertEquals(a, a, "reflexive");
    }

    @Test
    @DisplayName("toString includes the field values")
    void toString_containsFieldValues() {
        PdfJsonPageDimension dim = new PdfJsonPageDimension(7, 123.0f, 456.0f, 180);

        String text = dim.toString();

        assertNotNull(text);
        assertTrue(text.contains("7"), () -> "toString should contain pageNumber: " + text);
        assertTrue(text.contains("123.0"), () -> "toString should contain width: " + text);
        assertTrue(text.contains("456.0"), () -> "toString should contain height: " + text);
        assertTrue(text.contains("180"), () -> "toString should contain rotation: " + text);
    }

    @Test
    @DisplayName("@JsonInclude(NON_DEFAULT) omits zero-valued fields entirely")
    void serialization_omitsDefaultFields() {
        PdfJsonPageDimension allDefaults = new PdfJsonPageDimension();

        JsonNode node = mapper.valueToTree(allDefaults);

        // NON_DEFAULT: every field equals its default (0 / 0.0f) so nothing is emitted.
        assertTrue(node.isObject());
        assertFalse(node.has("pageNumber"));
        assertFalse(node.has("width"));
        assertFalse(node.has("height"));
        assertFalse(node.has("rotation"));
        assertEquals(0, node.size(), () -> "Expected empty object but was: " + node);
    }

    @Test
    @DisplayName("@JsonInclude(NON_DEFAULT) emits only the non-default fields")
    void serialization_emitsOnlyNonDefaultFields() {
        PdfJsonPageDimension partial =
                PdfJsonPageDimension.builder().pageNumber(2).width(612.0f).build();

        JsonNode node = mapper.valueToTree(partial);

        assertTrue(node.has("pageNumber"), () -> "pageNumber should be present: " + node);
        assertEquals(2, node.get("pageNumber").intValue());

        assertTrue(node.has("width"), () -> "width should be present: " + node);
        assertEquals(612.0f, node.get("width").floatValue());

        // height and rotation are left at their defaults, so they are omitted.
        assertFalse(node.has("height"), () -> "height should be omitted: " + node);
        assertFalse(node.has("rotation"), () -> "rotation should be omitted: " + node);
    }

    @Test
    @DisplayName("JSON round-trip reconstructs an equal object")
    void serialization_roundTrip() {
        PdfJsonPageDimension original = new PdfJsonPageDimension(4, 595.0f, 842.0f, 90);

        String json = mapper.writeValueAsString(original);
        PdfJsonPageDimension restored = mapper.readValue(json, PdfJsonPageDimension.class);

        assertEquals(original, restored);
        assertEquals(original.hashCode(), restored.hashCode());
    }

    @Test
    @DisplayName("deserializing an empty object yields all-default values")
    void deserialization_emptyObjectYieldsDefaults() {
        PdfJsonPageDimension restored = mapper.readValue("{}", PdfJsonPageDimension.class);

        assertEquals(new PdfJsonPageDimension(), restored);
        assertEquals(0, restored.getPageNumber());
        assertEquals(0.0f, restored.getWidth());
        assertEquals(0.0f, restored.getHeight());
        assertEquals(0, restored.getRotation());
    }

    @Test
    @DisplayName("deserializing a partial object leaves unspecified fields at default")
    void deserialization_partialObject() {
        PdfJsonPageDimension restored =
                mapper.readValue("{\"height\":792.0,\"rotation\":270}", PdfJsonPageDimension.class);

        assertEquals(0, restored.getPageNumber());
        assertEquals(0.0f, restored.getWidth());
        assertEquals(792.0f, restored.getHeight());
        assertEquals(270, restored.getRotation());
    }
}
