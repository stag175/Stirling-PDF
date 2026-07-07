package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PdfJsonFormFieldTest {

    // The production class is annotated with @JsonInclude(NON_NULL) via the shared
    // com.fasterxml.jackson.annotation package, which Jackson 3 (tools.jackson) honors. The runtime
    // mapper disables FAIL_ON_NULL_FOR_PRIMITIVES (spring config); mirror it here even though this
    // DTO has no primitive fields, to match sibling tests in this package.
    private final ObjectMapper mapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    // ---------------------------------------------------------------------
    // Constructors
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no-args constructor leaves every field null")
    void noArgsConstructor_allFieldsNull() {
        PdfJsonFormField field = new PdfJsonFormField();

        assertNull(field.getName());
        assertNull(field.getPartialName());
        assertNull(field.getFieldType());
        assertNull(field.getValue());
        assertNull(field.getDefaultValue());
        assertNull(field.getFlags());
        assertNull(field.getAlternateFieldName());
        assertNull(field.getMappingName());
        assertNull(field.getPageNumber());
        assertNull(field.getRect());
        assertNull(field.getOptions());
        assertNull(field.getSelectedIndices());
        assertNull(field.getChecked());
        assertNull(field.getFontName());
        assertNull(field.getFontSize());
        assertNull(field.getRawData());
    }

    @Test
    @DisplayName("all-args constructor assigns every field exactly")
    void allArgsConstructor_setsEveryField() {
        float[] rect = {10f, 20f, 110f, 70f};
        List<String> options = List.of("A", "B", "C");
        int[] selected = {1, 2};
        PdfJsonCosValue rawData = PdfJsonCosValue.builder().value("raw").build();

        PdfJsonFormField field =
                new PdfJsonFormField(
                        "form1.text1",
                        "text1",
                        "Tx",
                        "hello",
                        "default",
                        12,
                        "Alt name",
                        "mapping",
                        3,
                        rect,
                        options,
                        selected,
                        Boolean.TRUE,
                        "Helvetica",
                        9.5f,
                        rawData);

        assertEquals("form1.text1", field.getName());
        assertEquals("text1", field.getPartialName());
        assertEquals("Tx", field.getFieldType());
        assertEquals("hello", field.getValue());
        assertEquals("default", field.getDefaultValue());
        assertEquals(12, field.getFlags());
        assertEquals("Alt name", field.getAlternateFieldName());
        assertEquals("mapping", field.getMappingName());
        assertEquals(3, field.getPageNumber());
        assertSame(rect, field.getRect());
        assertArrayEquals(new float[] {10f, 20f, 110f, 70f}, field.getRect());
        assertSame(options, field.getOptions());
        assertSame(selected, field.getSelectedIndices());
        assertArrayEquals(new int[] {1, 2}, field.getSelectedIndices());
        assertEquals(Boolean.TRUE, field.getChecked());
        assertEquals("Helvetica", field.getFontName());
        assertEquals(9.5f, field.getFontSize());
        assertSame(rawData, field.getRawData());
    }

    // ---------------------------------------------------------------------
    // Builder
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("builder with no fields set produces an all-null instance equal to no-args ctor")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonFormField built = PdfJsonFormField.builder().build();

        assertEquals(new PdfJsonFormField(), built);
        assertNull(built.getName());
        assertNull(built.getRect());
        assertNull(built.getOptions());
        assertNull(built.getSelectedIndices());
        assertNull(built.getRawData());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        float[] rect = {0f, 0f, 100f, 50f};
        List<String> options = List.of("Yes", "No");
        int[] selected = {0};
        PdfJsonCosValue rawData = PdfJsonCosValue.builder().value("r").build();

        PdfJsonFormField built =
                PdfJsonFormField.builder()
                        .name("n")
                        .partialName("p")
                        .fieldType("Ch")
                        .value("v")
                        .defaultValue("dv")
                        .flags(2)
                        .alternateFieldName("alt")
                        .mappingName("map")
                        .pageNumber(1)
                        .rect(rect)
                        .options(options)
                        .selectedIndices(selected)
                        .checked(Boolean.FALSE)
                        .fontName("Courier")
                        .fontSize(8f)
                        .rawData(rawData)
                        .build();

        PdfJsonFormField constructed =
                new PdfJsonFormField(
                        "n", "p", "Ch", "v", "dv", 2, "alt", "map", 1, rect, options, selected,
                        Boolean.FALSE, "Courier", 8f, rawData);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    // ---------------------------------------------------------------------
    // Setters (Lombok @Data)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("setters mutate every field on the @Data instance")
    void setters_mutateState() {
        PdfJsonFormField field = new PdfJsonFormField();
        float[] rect = {1f, 2f, 3f, 4f};
        List<String> options = List.of("opt");
        int[] selected = {5};
        PdfJsonCosValue rawData = new PdfJsonCosValue();

        field.setName("name");
        field.setPartialName("partial");
        field.setFieldType("Sig");
        field.setValue("val");
        field.setDefaultValue("def");
        field.setFlags(7);
        field.setAlternateFieldName("altName");
        field.setMappingName("mapName");
        field.setPageNumber(9);
        field.setRect(rect);
        field.setOptions(options);
        field.setSelectedIndices(selected);
        field.setChecked(Boolean.TRUE);
        field.setFontName("Times");
        field.setFontSize(14.0f);
        field.setRawData(rawData);

        assertEquals("name", field.getName());
        assertEquals("partial", field.getPartialName());
        assertEquals("Sig", field.getFieldType());
        assertEquals("val", field.getValue());
        assertEquals("def", field.getDefaultValue());
        assertEquals(7, field.getFlags());
        assertEquals("altName", field.getAlternateFieldName());
        assertEquals("mapName", field.getMappingName());
        assertEquals(9, field.getPageNumber());
        assertSame(rect, field.getRect());
        assertSame(options, field.getOptions());
        assertSame(selected, field.getSelectedIndices());
        assertEquals(Boolean.TRUE, field.getChecked());
        assertEquals("Times", field.getFontName());
        assertEquals(14.0f, field.getFontSize());
        assertSame(rawData, field.getRawData());
    }

    @Test
    @DisplayName("setters accept null to clear previously populated fields")
    void setters_acceptNull() {
        PdfJsonFormField field =
                PdfJsonFormField.builder()
                        .name("x")
                        .rect(new float[] {1f})
                        .selectedIndices(new int[] {1})
                        .build();

        field.setName(null);
        field.setRect(null);
        field.setSelectedIndices(null);

        assertNull(field.getName());
        assertNull(field.getRect());
        assertNull(field.getSelectedIndices());
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode use array content equality for rect and selectedIndices")
    void equalsAndHashCode_arrayContentSemantics() {
        PdfJsonFormField a =
                PdfJsonFormField.builder()
                        .name("f")
                        .rect(new float[] {1f, 2f, 3f, 4f})
                        .selectedIndices(new int[] {0, 1})
                        .options(List.of("A", "B"))
                        .build();
        PdfJsonFormField b =
                PdfJsonFormField.builder()
                        .name("f")
                        .rect(new float[] {1f, 2f, 3f, 4f})
                        .selectedIndices(new int[] {0, 1})
                        .options(List.of("A", "B"))
                        .build();

        // Distinct array instances with identical content must compare equal (Lombok uses
        // Arrays.equals / Arrays.hashCode for array-typed fields).
        assertNotSame(a.getRect(), b.getRect());
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertEquals(a, a, "reflexive");
    }

    @Test
    @DisplayName("equals distinguishes instances that differ only by rect content")
    void equals_differsByRectContent() {
        PdfJsonFormField a = PdfJsonFormField.builder().rect(new float[] {1f, 2f}).build();
        PdfJsonFormField b = PdfJsonFormField.builder().rect(new float[] {1f, 9f}).build();

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals distinguishes instances that differ only by selectedIndices content")
    void equals_differsBySelectedIndices() {
        PdfJsonFormField a = PdfJsonFormField.builder().selectedIndices(new int[] {0}).build();
        PdfJsonFormField b = PdfJsonFormField.builder().selectedIndices(new int[] {1}).build();

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals distinguishes instances that differ only by a scalar field")
    void equals_differsByScalarField() {
        PdfJsonFormField base = PdfJsonFormField.builder().name("a").flags(1).build();
        PdfJsonFormField differentName = PdfJsonFormField.builder().name("b").flags(1).build();
        PdfJsonFormField differentFlags = PdfJsonFormField.builder().name("a").flags(2).build();

        assertNotEquals(base, differentName);
        assertNotEquals(base, differentFlags);
    }

    @Test
    @DisplayName("equals returns false against null and a foreign type")
    void equals_nullAndForeignType() {
        PdfJsonFormField field = PdfJsonFormField.builder().name("f").build();

        assertNotEquals(field, null);
        assertNotEquals(field, "not-a-form-field");
    }

    @Test
    @DisplayName("toString includes populated scalar field values")
    void toString_containsFieldValues() {
        PdfJsonFormField field =
                PdfJsonFormField.builder().name("myField").fieldType("Tx").flags(3).build();

        String text = field.toString();

        assertNotNull(text);
        assertTrue(text.contains("myField"), () -> "toString should contain name: " + text);
        assertTrue(text.contains("Tx"), () -> "toString should contain fieldType: " + text);
    }

    // ---------------------------------------------------------------------
    // Boundary / special values
    // ---------------------------------------------------------------------

    @ParameterizedTest(name = "preserves boundary Integer flags value {0}")
    @ValueSource(ints = {Integer.MIN_VALUE, -1, 0, 1, Integer.MAX_VALUE})
    @DisplayName("Integer flags is stored verbatim without clamping")
    void flags_notClamped(int value) {
        PdfJsonFormField field = PdfJsonFormField.builder().flags(value).build();

        assertEquals(value, field.getFlags());
    }

    @Test
    @DisplayName("empty rect and selectedIndices arrays are retained as non-null empties")
    void emptyArrays_retained() {
        PdfJsonFormField field =
                PdfJsonFormField.builder()
                        .rect(new float[0])
                        .selectedIndices(new int[0])
                        .build();

        assertNotNull(field.getRect());
        assertEquals(0, field.getRect().length);
        assertNotNull(field.getSelectedIndices());
        assertEquals(0, field.getSelectedIndices().length);
    }

    // ---------------------------------------------------------------------
    // Jackson serialization (@JsonInclude(NON_NULL))
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("@JsonInclude(NON_NULL) omits every null field, yielding an empty object")
    void serialization_omitsNullFields() {
        PdfJsonFormField empty = new PdfJsonFormField();

        JsonNode node = mapper.valueToTree(empty);

        assertTrue(node.isObject());
        assertEquals(0, node.size(), () -> "Expected empty object but was: " + node);
    }

    @Test
    @DisplayName("@JsonInclude(NON_NULL) emits only the populated fields")
    void serialization_emitsOnlyNonNullFields() {
        PdfJsonFormField partial =
                PdfJsonFormField.builder().name("form1.text1").fieldType("Tx").flags(1).build();

        JsonNode node = mapper.valueToTree(partial);

        assertTrue(node.has("name"), () -> "name should be present: " + node);
        assertEquals("form1.text1", node.get("name").asText());
        assertTrue(node.has("fieldType"));
        assertEquals("Tx", node.get("fieldType").asText());
        assertTrue(node.has("flags"));
        assertEquals(1, node.get("flags").intValue());

        // null fields are omitted entirely.
        assertFalse(node.has("value"), () -> "value should be omitted: " + node);
        assertFalse(node.has("rect"), () -> "rect should be omitted: " + node);
        assertFalse(node.has("selectedIndices"), () -> "selectedIndices should be omitted: " + node);
        assertFalse(node.has("checked"));
        assertEquals(3, node.size(), () -> "Only the three populated fields expected: " + node);
    }

    @Test
    @DisplayName("array fields serialize as JSON arrays with element values")
    void serialization_arrayFields() {
        PdfJsonFormField field =
                PdfJsonFormField.builder()
                        .rect(new float[] {10.5f, 20f, 110f, 70f})
                        .selectedIndices(new int[] {1, 3})
                        .options(List.of("Red", "Green"))
                        .build();

        JsonNode node = mapper.valueToTree(field);

        assertTrue(node.get("rect").isArray());
        assertEquals(4, node.get("rect").size());
        assertEquals(10.5f, node.get("rect").get(0).floatValue());

        assertTrue(node.get("selectedIndices").isArray());
        assertEquals(2, node.get("selectedIndices").size());
        assertEquals(3, node.get("selectedIndices").get(1).intValue());

        assertTrue(node.get("options").isArray());
        assertEquals("Green", node.get("options").get(1).asText());
    }

    @Test
    @DisplayName("JSON round-trip reconstructs an equal object including arrays and nested rawData")
    void serialization_roundTrip() {
        PdfJsonCosValue rawData = PdfJsonCosValue.builder().value("payload").build();
        PdfJsonFormField original =
                PdfJsonFormField.builder()
                        .name("form1.choice")
                        .partialName("choice")
                        .fieldType("Ch")
                        .value("Green")
                        .defaultValue("Red")
                        .flags(0)
                        .alternateFieldName("Pick a colour")
                        .mappingName("colour")
                        .pageNumber(2)
                        .rect(new float[] {10f, 20f, 110f, 70f})
                        .options(List.of("Red", "Green", "Blue"))
                        .selectedIndices(new int[] {1})
                        .checked(Boolean.TRUE)
                        .fontName("Helvetica")
                        .fontSize(11.0f)
                        .rawData(rawData)
                        .build();

        String json = mapper.writeValueAsString(original);
        PdfJsonFormField restored = mapper.readValue(json, PdfJsonFormField.class);

        assertEquals(original, restored);
        assertEquals(original.hashCode(), restored.hashCode());
        assertArrayEquals(original.getRect(), restored.getRect());
        assertArrayEquals(original.getSelectedIndices(), restored.getSelectedIndices());
        assertEquals(original.getRawData(), restored.getRawData());
    }

    @Test
    @DisplayName("deserializing an empty object yields an all-null instance")
    void deserialization_emptyObjectYieldsNulls() {
        PdfJsonFormField restored = mapper.readValue("{}", PdfJsonFormField.class);

        assertEquals(new PdfJsonFormField(), restored);
        assertNull(restored.getName());
        assertNull(restored.getRect());
        assertNull(restored.getSelectedIndices());
    }

    @Test
    @DisplayName("deserializing a partial object leaves unspecified fields null")
    void deserialization_partialObject() {
        PdfJsonFormField restored =
                mapper.readValue(
                        "{\"name\":\"f1\",\"flags\":4,\"selectedIndices\":[0,2]}",
                        PdfJsonFormField.class);

        assertEquals("f1", restored.getName());
        assertEquals(4, restored.getFlags());
        assertArrayEquals(new int[] {0, 2}, restored.getSelectedIndices());
        assertNull(restored.getValue());
        assertNull(restored.getRect());
        assertNull(restored.getChecked());
    }

    @Test
    @DisplayName("unknown JSON properties are ignored (Jackson 3 default FAIL_ON_UNKNOWN off)")
    void deserialization_ignoresUnknownProperties() {
        PdfJsonFormField restored =
                mapper.readValue(
                        "{\"name\":\"f\",\"somethingUnexpected\":123}", PdfJsonFormField.class);

        assertEquals("f", restored.getName());
    }
}
