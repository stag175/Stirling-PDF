package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.SPDF.model.json.PdfJsonCosValue.Type;

class PdfJsonCosValueTest {

    // ---------------------------------------------------------------------
    // Type enum coverage
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Type enum contains exactly the nine COS variants")
    void type_containsExactlyExpectedConstants() {
        Set<String> expected =
                Set.of(
                        "NULL",
                        "BOOLEAN",
                        "INTEGER",
                        "FLOAT",
                        "NAME",
                        "STRING",
                        "ARRAY",
                        "DICTIONARY",
                        "STREAM");

        Set<String> actual =
                Arrays.stream(Type.values()).map(Enum::name).collect(Collectors.toSet());

        assertEquals(
                expected,
                actual,
                () -> "Enum constants mismatch.\nExpected: " + expected + "\nActual: " + actual);
    }

    @Test
    @DisplayName("Type declaration order is NULL..STREAM")
    void type_declarationOrderIsStable() {
        Type[] expectedOrder = {
            Type.NULL,
            Type.BOOLEAN,
            Type.INTEGER,
            Type.FLOAT,
            Type.NAME,
            Type.STRING,
            Type.ARRAY,
            Type.DICTIONARY,
            Type.STREAM
        };

        assertArrayEquals(expectedOrder, Type.values());
    }

    @ParameterizedTest
    @EnumSource(Type.class)
    @DisplayName("Type.valueOf round-trips every constant by name")
    void type_valueOfRoundtrip(Type type) {
        assertEquals(type, Type.valueOf(type.name()));
    }

    @Test
    @DisplayName("Type.valueOf rejects an unknown constant name")
    void type_valueOfRejectsUnknownName() {
        assertThrows(IllegalArgumentException.class, () -> Type.valueOf("OBJECT"));
    }

    // ---------------------------------------------------------------------
    // Constructors
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no-args constructor leaves every field null")
    void noArgsConstructor_allFieldsNull() {
        PdfJsonCosValue value = new PdfJsonCosValue();

        assertNull(value.getType());
        assertNull(value.getValue());
        assertNull(value.getItems());
        assertNull(value.getEntries());
        assertNull(value.getStream());
    }

    @Test
    @DisplayName("all-args constructor assigns every field exactly")
    void allArgsConstructor_setsEveryField() {
        List<PdfJsonCosValue> items = List.of(new PdfJsonCosValue());
        Map<String, PdfJsonCosValue> entries = Map.of("Key", new PdfJsonCosValue());
        PdfJsonStream stream = new PdfJsonStream();

        PdfJsonCosValue value =
                new PdfJsonCosValue(Type.DICTIONARY, "payload", items, entries, stream);

        assertEquals(Type.DICTIONARY, value.getType());
        assertEquals("payload", value.getValue());
        assertSame(items, value.getItems());
        assertSame(entries, value.getEntries());
        assertSame(stream, value.getStream());
    }

    // ---------------------------------------------------------------------
    // Builder
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("builder with no fields set produces an all-null instance")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonCosValue built = PdfJsonCosValue.builder().build();

        assertEquals(new PdfJsonCosValue(), built);
        assertNull(built.getType());
        assertNull(built.getValue());
        assertNull(built.getItems());
        assertNull(built.getEntries());
        assertNull(built.getStream());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        List<PdfJsonCosValue> items = List.of(new PdfJsonCosValue());
        Map<String, PdfJsonCosValue> entries = Map.of("A", new PdfJsonCosValue());
        PdfJsonStream stream = new PdfJsonStream();

        PdfJsonCosValue built =
                PdfJsonCosValue.builder()
                        .type(Type.STREAM)
                        .value("v")
                        .items(items)
                        .entries(entries)
                        .stream(stream)
                        .build();

        PdfJsonCosValue constructed = new PdfJsonCosValue(Type.STREAM, "v", items, entries, stream);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    // ---------------------------------------------------------------------
    // Primitive value variants (boolean / integer / float / name / string)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("BOOLEAN value holds a Boolean payload")
    void booleanVariant_holdsBoolean() {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(Type.BOOLEAN).value(Boolean.TRUE).build();

        assertEquals(Type.BOOLEAN, value.getType());
        assertEquals(Boolean.TRUE, value.getValue());
    }

    @Test
    @DisplayName("INTEGER value holds a numeric payload")
    void integerVariant_holdsNumber() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.INTEGER).value(42L).build();

        assertEquals(Type.INTEGER, value.getType());
        assertEquals(42L, value.getValue());
    }

    @Test
    @DisplayName("NAME value holds the PDF name literal as the raw value")
    void nameVariant_holdsLiteral() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.NAME).value("Type1").build();

        assertEquals(Type.NAME, value.getType());
        assertEquals("Type1", value.getValue());
    }

    @Test
    @DisplayName("STRING value carries a Base64 payload distinct from items/entries/stream")
    void stringVariant_onlyValuePopulated() {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(Type.STRING).value("SGVsbG8=").build();

        assertEquals(Type.STRING, value.getType());
        assertEquals("SGVsbG8=", value.getValue());
        assertNull(value.getItems());
        assertNull(value.getEntries());
        assertNull(value.getStream());
    }

    @Test
    @DisplayName("NULL variant may carry a null payload alongside the NULL type")
    void nullVariant_typePresentValueNull() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.NULL).build();

        assertEquals(Type.NULL, value.getType());
        assertNull(value.getValue());
    }

    // ---------------------------------------------------------------------
    // Composite variants (array / dictionary / stream)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("ARRAY variant nests child values via items")
    void arrayVariant_nestsItems() {
        PdfJsonCosValue child = PdfJsonCosValue.builder().type(Type.INTEGER).value(1L).build();
        PdfJsonCosValue array =
                PdfJsonCosValue.builder().type(Type.ARRAY).items(List.of(child)).build();

        assertEquals(Type.ARRAY, array.getType());
        assertEquals(1, array.getItems().size());
        assertSame(child, array.getItems().get(0));
        assertEquals(Type.INTEGER, array.getItems().get(0).getType());
    }

    @Test
    @DisplayName("ARRAY variant supports an empty items list")
    void arrayVariant_emptyItems() {
        PdfJsonCosValue array = PdfJsonCosValue.builder().type(Type.ARRAY).items(List.of()).build();

        assertEquals(Type.ARRAY, array.getType());
        assertNotNull(array.getItems());
        assertTrue(array.getItems().isEmpty());
    }

    @Test
    @DisplayName("DICTIONARY variant nests child values via entries")
    void dictionaryVariant_nestsEntries() {
        PdfJsonCosValue child = PdfJsonCosValue.builder().type(Type.NAME).value("Page").build();
        Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
        entries.put("Type", child);

        PdfJsonCosValue dict =
                PdfJsonCosValue.builder().type(Type.DICTIONARY).entries(entries).build();

        assertEquals(Type.DICTIONARY, dict.getType());
        assertEquals(1, dict.getEntries().size());
        assertSame(child, dict.getEntries().get("Type"));
    }

    @Test
    @DisplayName("STREAM variant carries a PdfJsonStream payload")
    void streamVariant_carriesStream() {
        Map<String, PdfJsonCosValue> dictionary =
                Map.of("Length", PdfJsonCosValue.builder().type(Type.INTEGER).value(5L).build());
        PdfJsonStream stream = new PdfJsonStream(dictionary, "QUJDREU=");

        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.STREAM).stream(stream).build();

        assertEquals(Type.STREAM, value.getType());
        assertSame(stream, value.getStream());
        assertEquals("QUJDREU=", value.getStream().getRawData());
    }

    @Test
    @DisplayName("deeply nested ARRAY-of-DICTIONARY structure is preserved")
    void deeplyNestedStructure_preserved() {
        PdfJsonCosValue leaf = PdfJsonCosValue.builder().type(Type.STRING).value("Zm9v").build();
        PdfJsonCosValue dict =
                PdfJsonCosValue.builder()
                        .type(Type.DICTIONARY)
                        .entries(Map.of("Title", leaf))
                        .build();
        PdfJsonCosValue array =
                PdfJsonCosValue.builder().type(Type.ARRAY).items(List.of(dict)).build();

        assertEquals("Zm9v", array.getItems().get(0).getEntries().get("Title").getValue());
    }

    // ---------------------------------------------------------------------
    // Setters (Lombok @Data)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("setters mutate every field on the @Data instance")
    void setters_mutateState() {
        PdfJsonCosValue value = new PdfJsonCosValue();
        List<PdfJsonCosValue> items = List.of(new PdfJsonCosValue());
        Map<String, PdfJsonCosValue> entries = Map.of("k", new PdfJsonCosValue());
        PdfJsonStream stream = new PdfJsonStream();

        value.setType(Type.FLOAT);
        value.setValue(3.14d);
        value.setItems(items);
        value.setEntries(entries);
        value.setStream(stream);

        assertEquals(Type.FLOAT, value.getType());
        assertEquals(3.14d, value.getValue());
        assertSame(items, value.getItems());
        assertSame(entries, value.getEntries());
        assertSame(stream, value.getStream());
    }

    @Test
    @DisplayName("setters accept null to clear previously populated fields")
    void setters_acceptNull() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.NAME).value("X").build();

        value.setType(null);
        value.setValue(null);

        assertNull(value.getType());
        assertNull(value.getValue());
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode reflect value equality for matching fields")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonCosValue a = PdfJsonCosValue.builder().type(Type.STRING).value("AAA").build();
        PdfJsonCosValue b = PdfJsonCosValue.builder().type(Type.STRING).value("AAA").build();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertEquals(a, a, "reflexive");
    }

    @Test
    @DisplayName("equals distinguishes instances that differ only by type")
    void equals_differsByType() {
        PdfJsonCosValue name = PdfJsonCosValue.builder().type(Type.NAME).value("V").build();
        PdfJsonCosValue string = PdfJsonCosValue.builder().type(Type.STRING).value("V").build();

        assertNotEquals(name, string);
    }

    @Test
    @DisplayName("equals distinguishes instances that differ only by value")
    void equals_differsByValue() {
        PdfJsonCosValue one = PdfJsonCosValue.builder().type(Type.INTEGER).value(1L).build();
        PdfJsonCosValue two = PdfJsonCosValue.builder().type(Type.INTEGER).value(2L).build();

        assertNotEquals(one, two);
    }

    @Test
    @DisplayName("equals returns false against null and a foreign type")
    void equals_nullAndForeignType() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.NULL).build();

        assertNotEquals(value, null);
        assertNotEquals(value, "not-a-cos-value");
    }

    @Test
    @DisplayName("toString includes the populated type and value")
    void toString_containsFieldValues() {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(Type.NAME).value("MyName").build();

        String text = value.toString();

        assertNotNull(text);
        assertTrue(text.contains("NAME"), () -> "toString should contain type: " + text);
        assertTrue(text.contains("MyName"), () -> "toString should contain value: " + text);
    }
}
