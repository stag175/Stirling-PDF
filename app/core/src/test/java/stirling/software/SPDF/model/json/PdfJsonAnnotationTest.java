package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PdfJsonAnnotationTest {

    // Jackson 3 enables FAIL_ON_NULL_FOR_PRIMITIVES by default and treats the Lombok
    // @AllArgsConstructor as the creator. PdfJsonAnnotation has no primitive fields (Integer, not
    // int), but the production app disables that feature
    // (spring.jackson.deserialization.fail-on-null-for-primitives=false) so we mirror it for fidelity.
    private final ObjectMapper mapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    // Field order of @AllArgsConstructor (matches declaration order in the source):
    // subtype, contents, rect, appearanceState, color, flags, destination, iconName,
    // subject, author, creationDate, modificationDate, rawData
    private static PdfJsonAnnotation fullyPopulated() {
        return new PdfJsonAnnotation(
                "Highlight",
                "Important note",
                new float[] {10.0f, 20.0f, 110.0f, 40.0f},
                "On",
                new float[] {1.0f, 0.9f, 0.0f},
                4,
                "page=2",
                "Comment",
                "Review",
                "Alice",
                "2026-01-01T00:00:00Z",
                "2026-02-02T12:30:00Z",
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.NAME)
                        .value("Highlight")
                        .build());
    }

    // ---------------------------------------------------------------------
    // Constructors
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no-args constructor leaves every field null")
    void noArgsConstructor_allFieldsNull() {
        PdfJsonAnnotation annotation = new PdfJsonAnnotation();

        assertNull(annotation.getSubtype());
        assertNull(annotation.getContents());
        assertNull(annotation.getRect());
        assertNull(annotation.getAppearanceState());
        assertNull(annotation.getColor());
        assertNull(annotation.getFlags());
        assertNull(annotation.getDestination());
        assertNull(annotation.getIconName());
        assertNull(annotation.getSubject());
        assertNull(annotation.getAuthor());
        assertNull(annotation.getCreationDate());
        assertNull(annotation.getModificationDate());
        assertNull(annotation.getRawData());
    }

    @Test
    @DisplayName("all-args constructor assigns every field exactly")
    void allArgsConstructor_setsEveryField() {
        float[] rect = {1.0f, 2.0f, 3.0f, 4.0f};
        float[] color = {0.5f, 0.25f, 0.75f};
        PdfJsonCosValue rawData =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.DICTIONARY).build();

        PdfJsonAnnotation annotation =
                new PdfJsonAnnotation(
                        "Text",
                        "Hello",
                        rect,
                        "Off",
                        color,
                        2,
                        "dest",
                        "Note",
                        "Subj",
                        "Bob",
                        "created",
                        "modified",
                        rawData);

        assertEquals("Text", annotation.getSubtype());
        assertEquals("Hello", annotation.getContents());
        assertSame(rect, annotation.getRect());
        assertEquals("Off", annotation.getAppearanceState());
        assertSame(color, annotation.getColor());
        assertEquals(2, annotation.getFlags());
        assertEquals("dest", annotation.getDestination());
        assertEquals("Note", annotation.getIconName());
        assertEquals("Subj", annotation.getSubject());
        assertEquals("Bob", annotation.getAuthor());
        assertEquals("created", annotation.getCreationDate());
        assertEquals("modified", annotation.getModificationDate());
        assertSame(rawData, annotation.getRawData());
    }

    // ---------------------------------------------------------------------
    // Builder
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("builder with no fields set produces an all-null instance equal to no-args ctor")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonAnnotation built = PdfJsonAnnotation.builder().build();

        assertEquals(new PdfJsonAnnotation(), built);
        assertEquals(new PdfJsonAnnotation().hashCode(), built.hashCode());
        assertNull(built.getSubtype());
        assertNull(built.getRect());
        assertNull(built.getColor());
        assertNull(built.getFlags());
        assertNull(built.getRawData());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        float[] rect = {10.0f, 20.0f, 110.0f, 40.0f};
        float[] color = {1.0f, 0.9f, 0.0f};
        PdfJsonCosValue rawData =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.NAME)
                        .value("Highlight")
                        .build();

        PdfJsonAnnotation built =
                PdfJsonAnnotation.builder()
                        .subtype("Highlight")
                        .contents("Important note")
                        .rect(rect)
                        .appearanceState("On")
                        .color(color)
                        .flags(4)
                        .destination("page=2")
                        .iconName("Comment")
                        .subject("Review")
                        .author("Alice")
                        .creationDate("2026-01-01T00:00:00Z")
                        .modificationDate("2026-02-02T12:30:00Z")
                        .rawData(rawData)
                        .build();

        PdfJsonAnnotation constructed =
                new PdfJsonAnnotation(
                        "Highlight",
                        "Important note",
                        rect,
                        "On",
                        color,
                        4,
                        "page=2",
                        "Comment",
                        "Review",
                        "Alice",
                        "2026-01-01T00:00:00Z",
                        "2026-02-02T12:30:00Z",
                        rawData);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("builder leaves unset fields null while setting only the supplied ones")
    void builder_partialPopulation() {
        PdfJsonAnnotation partial =
                PdfJsonAnnotation.builder().subtype("Link").destination("page=5").build();

        assertEquals("Link", partial.getSubtype());
        assertEquals("page=5", partial.getDestination());
        assertNull(partial.getContents());
        assertNull(partial.getRect());
        assertNull(partial.getColor());
        assertNull(partial.getFlags());
        assertNull(partial.getRawData());
    }

    // ---------------------------------------------------------------------
    // float[] arrays
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("rect array stores [x1, y1, x2, y2] verbatim")
    void rect_storedVerbatim() {
        float[] rect = {0.0f, -5.5f, 612.0f, 792.0f};

        PdfJsonAnnotation annotation = PdfJsonAnnotation.builder().rect(rect).build();

        assertSame(rect, annotation.getRect());
        assertArrayEquals(new float[] {0.0f, -5.5f, 612.0f, 792.0f}, annotation.getRect());
    }

    @Test
    @DisplayName("color array supports arbitrary component counts (gray/rgb/cmyk)")
    void color_supportsVariableLength() {
        PdfJsonAnnotation gray = PdfJsonAnnotation.builder().color(new float[] {0.5f}).build();
        PdfJsonAnnotation cmyk =
                PdfJsonAnnotation.builder().color(new float[] {0.1f, 0.2f, 0.3f, 0.4f}).build();

        assertEquals(1, gray.getColor().length);
        assertEquals(4, cmyk.getColor().length);
        assertArrayEquals(new float[] {0.1f, 0.2f, 0.3f, 0.4f}, cmyk.getColor());
    }

    @Test
    @DisplayName("equals uses array content equality for rect and color (Arrays.equals semantics)")
    void equals_arrayContentSemantics() {
        PdfJsonAnnotation a =
                PdfJsonAnnotation.builder()
                        .rect(new float[] {1.0f, 2.0f})
                        .color(new float[] {0.1f, 0.2f, 0.3f})
                        .build();
        // Distinct array instances with identical contents.
        PdfJsonAnnotation b =
                PdfJsonAnnotation.builder()
                        .rect(new float[] {1.0f, 2.0f})
                        .color(new float[] {0.1f, 0.2f, 0.3f})
                        .build();

        assertNotSame(a.getRect(), b.getRect());
        assertEquals(a, b, "Lombok compares float[] by Arrays.equals");
        assertEquals(a.hashCode(), b.hashCode(), "Lombok hashes float[] by Arrays.hashCode");
    }

    @Test
    @DisplayName("equals distinguishes annotations whose rect contents differ")
    void equals_distinguishesArrayContent() {
        PdfJsonAnnotation a = PdfJsonAnnotation.builder().rect(new float[] {1.0f, 2.0f}).build();
        PdfJsonAnnotation differentContent =
                PdfJsonAnnotation.builder().rect(new float[] {1.0f, 9.0f}).build();
        PdfJsonAnnotation differentLength =
                PdfJsonAnnotation.builder().rect(new float[] {1.0f, 2.0f, 3.0f}).build();

        assertNotEquals(a, differentContent);
        assertNotEquals(a, differentLength);
    }

    // ---------------------------------------------------------------------
    // Setters (Lombok @Data)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("setters mutate every field on the @Data instance")
    void setters_mutateState() {
        PdfJsonAnnotation annotation = new PdfJsonAnnotation();
        float[] rect = {1.0f, 1.0f, 2.0f, 2.0f};
        float[] color = {0.0f, 0.0f, 1.0f};
        PdfJsonCosValue rawData = new PdfJsonCosValue();

        annotation.setSubtype("Stamp");
        annotation.setContents("c");
        annotation.setRect(rect);
        annotation.setAppearanceState("N");
        annotation.setColor(color);
        annotation.setFlags(7);
        annotation.setDestination("d");
        annotation.setIconName("i");
        annotation.setSubject("s");
        annotation.setAuthor("a");
        annotation.setCreationDate("cd");
        annotation.setModificationDate("md");
        annotation.setRawData(rawData);

        assertEquals("Stamp", annotation.getSubtype());
        assertEquals("c", annotation.getContents());
        assertSame(rect, annotation.getRect());
        assertEquals("N", annotation.getAppearanceState());
        assertSame(color, annotation.getColor());
        assertEquals(7, annotation.getFlags());
        assertEquals("d", annotation.getDestination());
        assertEquals("i", annotation.getIconName());
        assertEquals("s", annotation.getSubject());
        assertEquals("a", annotation.getAuthor());
        assertEquals("cd", annotation.getCreationDate());
        assertEquals("md", annotation.getModificationDate());
        assertSame(rawData, annotation.getRawData());
    }

    @Test
    @DisplayName("setters accept null to clear previously populated fields")
    void setters_acceptNull() {
        PdfJsonAnnotation annotation = fullyPopulated();

        annotation.setSubtype(null);
        annotation.setRect(null);
        annotation.setColor(null);
        annotation.setFlags(null);
        annotation.setRawData(null);

        assertNull(annotation.getSubtype());
        assertNull(annotation.getRect());
        assertNull(annotation.getColor());
        assertNull(annotation.getFlags());
        assertNull(annotation.getRawData());
    }

    @ParameterizedTest
    @ValueSource(ints = {Integer.MIN_VALUE, -1, 0, 1, 4, Integer.MAX_VALUE})
    @DisplayName("flags stores boundary Integer values verbatim without clamping")
    void flags_boundaryValues(int value) {
        PdfJsonAnnotation annotation = PdfJsonAnnotation.builder().flags(value).build();

        assertEquals(value, annotation.getFlags());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Highlight", "  ", "multi word subject"})
    @DisplayName("string fields accept null, empty, blank, and arbitrary content")
    void stringFields_acceptVariousContent(String value) {
        PdfJsonAnnotation annotation =
                PdfJsonAnnotation.builder()
                        .subtype(value)
                        .contents(value)
                        .author(value)
                        .build();

        assertEquals(value, annotation.getSubtype());
        assertEquals(value, annotation.getContents());
        assertEquals(value, annotation.getAuthor());
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode reflect full value equality, and equals is reflexive")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonAnnotation a = fullyPopulated();
        PdfJsonAnnotation b = fullyPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertEquals(a, a, "reflexive");
    }

    @Test
    @DisplayName("equals distinguishes a difference in a single scalar field")
    void equals_differsBySingleField() {
        PdfJsonAnnotation base = fullyPopulated();

        PdfJsonAnnotation differentSubtype = fullyPopulated();
        differentSubtype.setSubtype("Stamp");
        PdfJsonAnnotation differentFlags = fullyPopulated();
        differentFlags.setFlags(99);
        PdfJsonAnnotation differentAuthor = fullyPopulated();
        differentAuthor.setAuthor("Mallory");

        assertNotEquals(base, differentSubtype);
        assertNotEquals(base, differentFlags);
        assertNotEquals(base, differentAuthor);
    }

    @Test
    @DisplayName("equals distinguishes a difference in the nested rawData field")
    void equals_differsByRawData() {
        PdfJsonAnnotation base = fullyPopulated();
        PdfJsonAnnotation differentRaw = fullyPopulated();
        differentRaw.setRawData(
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STRING).value("X").build());

        assertNotEquals(base, differentRaw);
    }

    @Test
    @DisplayName("equals returns false against null and a foreign type")
    void equals_nullAndForeignType() {
        PdfJsonAnnotation annotation = fullyPopulated();

        assertNotEquals(annotation, null);
        assertNotEquals(annotation, "not-an-annotation");
    }

    @Test
    @DisplayName("toString includes populated scalar field values")
    void toString_containsFieldValues() {
        PdfJsonAnnotation annotation =
                PdfJsonAnnotation.builder()
                        .subtype("Highlight")
                        .flags(4)
                        .author("Alice")
                        .build();

        String text = annotation.toString();

        assertNotNull(text);
        assertTrue(text.contains("Highlight"), () -> "toString should contain subtype: " + text);
        assertTrue(text.contains("4"), () -> "toString should contain flags: " + text);
        assertTrue(text.contains("Alice"), () -> "toString should contain author: " + text);
    }

    // ---------------------------------------------------------------------
    // Jackson (de)serialization — @JsonInclude(NON_NULL)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("@JsonInclude(NON_NULL) omits all null fields, yielding an empty object")
    void serialization_omitsNullFields() {
        PdfJsonAnnotation empty = new PdfJsonAnnotation();

        JsonNode node = mapper.valueToTree(empty);

        assertTrue(node.isObject());
        assertEquals(0, node.size(), () -> "Expected empty object but was: " + node);
        assertFalse(node.has("subtype"));
        assertFalse(node.has("rect"));
        assertFalse(node.has("flags"));
        assertFalse(node.has("rawData"));
    }

    @Test
    @DisplayName("@JsonInclude(NON_NULL) emits only the non-null fields including float[] arrays")
    void serialization_emitsOnlyNonNullFields() {
        PdfJsonAnnotation partial =
                PdfJsonAnnotation.builder()
                        .subtype("Highlight")
                        .rect(new float[] {1.0f, 2.0f, 3.0f, 4.0f})
                        .flags(4)
                        .build();

        JsonNode node = mapper.valueToTree(partial);

        assertTrue(node.has("subtype"), () -> "subtype should be present: " + node);
        assertEquals("Highlight", node.get("subtype").asText());

        assertTrue(node.has("flags"), () -> "flags should be present: " + node);
        assertEquals(4, node.get("flags").intValue());

        assertTrue(node.has("rect"), () -> "rect should be present: " + node);
        assertTrue(node.get("rect").isArray());
        assertEquals(4, node.get("rect").size());
        assertEquals(3.0f, node.get("rect").get(2).floatValue());

        // Null fields are omitted entirely.
        assertFalse(node.has("contents"), () -> "contents should be omitted: " + node);
        assertFalse(node.has("color"), () -> "color should be omitted: " + node);
        assertFalse(node.has("rawData"), () -> "rawData should be omitted: " + node);
    }

    @Test
    @DisplayName("JSON round-trip reconstructs an equal object including arrays and nested rawData")
    void serialization_roundTrip() {
        PdfJsonAnnotation original = fullyPopulated();

        String json = mapper.writeValueAsString(original);
        PdfJsonAnnotation restored = mapper.readValue(json, PdfJsonAnnotation.class);

        assertEquals(original, restored);
        assertEquals(original.hashCode(), restored.hashCode());
        assertArrayEquals(original.getRect(), restored.getRect());
        assertArrayEquals(original.getColor(), restored.getColor());
        assertEquals(original.getRawData(), restored.getRawData());
    }

    @Test
    @DisplayName("deserializing an empty object yields an all-null instance")
    void deserialization_emptyObjectYieldsAllNull() {
        PdfJsonAnnotation restored = mapper.readValue("{}", PdfJsonAnnotation.class);

        assertEquals(new PdfJsonAnnotation(), restored);
        assertNull(restored.getSubtype());
        assertNull(restored.getRect());
        assertNull(restored.getFlags());
        assertNull(restored.getRawData());
    }

    @Test
    @DisplayName("deserializing a partial object leaves unspecified fields null")
    void deserialization_partialObject() {
        PdfJsonAnnotation restored =
                mapper.readValue(
                        "{\"subtype\":\"Link\",\"flags\":2,\"rect\":[1.0,2.0,3.0,4.0]}",
                        PdfJsonAnnotation.class);

        assertEquals("Link", restored.getSubtype());
        assertEquals(2, restored.getFlags());
        assertArrayEquals(new float[] {1.0f, 2.0f, 3.0f, 4.0f}, restored.getRect());
        assertNull(restored.getContents());
        assertNull(restored.getColor());
        assertNull(restored.getRawData());
    }

    @Test
    @DisplayName("unknown JSON properties are ignored (Jackson 3 FAIL_ON_UNKNOWN_PROPERTIES off)")
    void deserialization_ignoresUnknownProperties() {
        PdfJsonAnnotation restored =
                mapper.readValue(
                        "{\"subtype\":\"Text\",\"unexpectedKey\":\"ignored\"}",
                        PdfJsonAnnotation.class);

        assertEquals("Text", restored.getSubtype());
    }
}
