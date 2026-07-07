package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PdfJsonTextElementTest {

    // Jackson 3 enables FAIL_ON_NULL_FOR_PRIMITIVES by default and treats the Lombok
    // @AllArgsConstructor as the creator, so absent primitive fields would otherwise throw. The app
    // disables this (spring.jackson.deserialization.fail-on-null-for-primitives=false); mirror it.
    private final ObjectMapper mapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    // Builds a fully populated element via the all-args constructor in declared field order:
    // text, fontId, fontSize, fontMatrixSize, fontSizeInPt, characterSpacing, wordSpacing,
    // spaceWidth, zOrder, horizontalScaling, leading, rise, x, y, width, height, textMatrix,
    // fillColor, strokeColor, renderingMode, fallbackUsed, charCodes
    private static PdfJsonTextElement fullyPopulated() {
        return new PdfJsonTextElement(
                "Hello",
                "F1",
                12.0f,
                0.001f,
                12.5f,
                0.25f,
                1.5f,
                3.0f,
                7,
                100.0f,
                14.0f,
                2.0f,
                50.0f,
                700.0f,
                40.0f,
                14.0f,
                new float[] {1f, 0f, 0f, 1f, 50f, 700f},
                new PdfJsonTextColor("DeviceRGB", new float[] {0f, 0f, 0f}),
                new PdfJsonTextColor("DeviceGray", new float[] {1f}),
                0,
                Boolean.TRUE,
                new int[] {72, 101, 108, 108, 111});
    }

    @Test
    @DisplayName("no-args constructor yields null for every boxed/reference field")
    void noArgsConstructor_defaults() {
        PdfJsonTextElement el = new PdfJsonTextElement();

        assertNull(el.getText());
        assertNull(el.getFontId());
        assertNull(el.getFontSize());
        assertNull(el.getFontMatrixSize());
        assertNull(el.getFontSizeInPt());
        assertNull(el.getCharacterSpacing());
        assertNull(el.getWordSpacing());
        assertNull(el.getSpaceWidth());
        assertNull(el.getZOrder());
        assertNull(el.getHorizontalScaling());
        assertNull(el.getLeading());
        assertNull(el.getRise());
        assertNull(el.getX());
        assertNull(el.getY());
        assertNull(el.getWidth());
        assertNull(el.getHeight());
        assertNull(el.getTextMatrix());
        assertNull(el.getFillColor());
        assertNull(el.getStrokeColor());
        assertNull(el.getRenderingMode());
        assertNull(el.getFallbackUsed());
        assertNull(el.getCharCodes());
    }

    @Test
    @DisplayName("all-args constructor sets every one of the 22 fields exactly")
    void allArgsConstructor_setsEveryField() {
        PdfJsonTextElement el = fullyPopulated();

        assertEquals("Hello", el.getText());
        assertEquals("F1", el.getFontId());
        assertEquals(12.0f, el.getFontSize());
        assertEquals(0.001f, el.getFontMatrixSize());
        assertEquals(12.5f, el.getFontSizeInPt());
        assertEquals(0.25f, el.getCharacterSpacing());
        assertEquals(1.5f, el.getWordSpacing());
        assertEquals(3.0f, el.getSpaceWidth());
        assertEquals(7, el.getZOrder());
        assertEquals(100.0f, el.getHorizontalScaling());
        assertEquals(14.0f, el.getLeading());
        assertEquals(2.0f, el.getRise());
        assertEquals(50.0f, el.getX());
        assertEquals(700.0f, el.getY());
        assertEquals(40.0f, el.getWidth());
        assertEquals(14.0f, el.getHeight());
        assertArrayEquals(new float[] {1f, 0f, 0f, 1f, 50f, 700f}, el.getTextMatrix());
        assertEquals(new PdfJsonTextColor("DeviceRGB", new float[] {0f, 0f, 0f}), el.getFillColor());
        assertEquals(new PdfJsonTextColor("DeviceGray", new float[] {1f}), el.getStrokeColor());
        assertEquals(0, el.getRenderingMode());
        assertEquals(Boolean.TRUE, el.getFallbackUsed());
        assertArrayEquals(new int[] {72, 101, 108, 108, 111}, el.getCharCodes());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        PdfJsonTextElement constructed = fullyPopulated();

        PdfJsonTextElement built =
                PdfJsonTextElement.builder()
                        .text("Hello")
                        .fontId("F1")
                        .fontSize(12.0f)
                        .fontMatrixSize(0.001f)
                        .fontSizeInPt(12.5f)
                        .characterSpacing(0.25f)
                        .wordSpacing(1.5f)
                        .spaceWidth(3.0f)
                        .zOrder(7)
                        .horizontalScaling(100.0f)
                        .leading(14.0f)
                        .rise(2.0f)
                        .x(50.0f)
                        .y(700.0f)
                        .width(40.0f)
                        .height(14.0f)
                        .textMatrix(new float[] {1f, 0f, 0f, 1f, 50f, 700f})
                        .fillColor(new PdfJsonTextColor("DeviceRGB", new float[] {0f, 0f, 0f}))
                        .strokeColor(new PdfJsonTextColor("DeviceGray", new float[] {1f}))
                        .renderingMode(0)
                        .fallbackUsed(Boolean.TRUE)
                        .charCodes(new int[] {72, 101, 108, 108, 111})
                        .build();

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("builder with no fields set equals the no-args constructor (all nulls)")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonTextElement built = PdfJsonTextElement.builder().build();

        assertEquals(new PdfJsonTextElement(), built);
        assertEquals(new PdfJsonTextElement().hashCode(), built.hashCode());
        assertNull(built.getText());
        assertNull(built.getCharCodes());
    }

    @Test
    @DisplayName("setters mutate the Lombok @Data instance")
    void setters_mutateState() {
        PdfJsonTextElement el = new PdfJsonTextElement();

        el.setText("World");
        el.setFontId("F2");
        el.setFontSize(10.0f);
        el.setFontMatrixSize(0.002f);
        el.setFontSizeInPt(9.75f);
        el.setCharacterSpacing(0.1f);
        el.setWordSpacing(0.5f);
        el.setSpaceWidth(2.5f);
        el.setZOrder(3);
        el.setHorizontalScaling(90.0f);
        el.setLeading(12.0f);
        el.setRise(-1.0f);
        el.setX(10.0f);
        el.setY(20.0f);
        el.setWidth(30.0f);
        el.setHeight(40.0f);
        float[] matrix = {2f, 0f, 0f, 2f, 0f, 0f};
        el.setTextMatrix(matrix);
        PdfJsonTextColor fill = new PdfJsonTextColor("DeviceCMYK", new float[] {0f, 0f, 0f, 1f});
        el.setFillColor(fill);
        PdfJsonTextColor stroke = new PdfJsonTextColor("DeviceRGB", new float[] {1f, 1f, 1f});
        el.setStrokeColor(stroke);
        el.setRenderingMode(2);
        el.setFallbackUsed(Boolean.FALSE);
        int[] codes = {1, 2, 3};
        el.setCharCodes(codes);

        assertEquals("World", el.getText());
        assertEquals("F2", el.getFontId());
        assertEquals(10.0f, el.getFontSize());
        assertEquals(0.002f, el.getFontMatrixSize());
        assertEquals(9.75f, el.getFontSizeInPt());
        assertEquals(0.1f, el.getCharacterSpacing());
        assertEquals(0.5f, el.getWordSpacing());
        assertEquals(2.5f, el.getSpaceWidth());
        assertEquals(3, el.getZOrder());
        assertEquals(90.0f, el.getHorizontalScaling());
        assertEquals(12.0f, el.getLeading());
        assertEquals(-1.0f, el.getRise());
        assertEquals(10.0f, el.getX());
        assertEquals(20.0f, el.getY());
        assertEquals(30.0f, el.getWidth());
        assertEquals(40.0f, el.getHeight());
        assertSame(matrix, el.getTextMatrix());
        assertSame(fill, el.getFillColor());
        assertSame(stroke, el.getStrokeColor());
        assertEquals(2, el.getRenderingMode());
        assertEquals(Boolean.FALSE, el.getFallbackUsed());
        assertSame(codes, el.getCharCodes());
    }

    @Test
    @DisplayName("equals/hashCode treat equal field values (including array contents) as equal")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonTextElement a = fullyPopulated();
        // Separate array instances with identical contents: Lombok uses Arrays.equals/hashCode.
        PdfJsonTextElement b = fullyPopulated();

        assertEquals(a, b, "Equal field values (and equal array contents) must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "Equal objects must share a hash code");

        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-text-element");
    }

    @Test
    @DisplayName("equals is sensitive to differing scalar, nested-color, and array fields")
    void equals_distinguishesFieldDifferences() {
        PdfJsonTextElement base = fullyPopulated();

        PdfJsonTextElement diffText = fullyPopulated();
        diffText.setText("Goodbye");
        assertNotEquals(base, diffText);

        PdfJsonTextElement diffZOrder = fullyPopulated();
        diffZOrder.setZOrder(99);
        assertNotEquals(base, diffZOrder);

        PdfJsonTextElement diffFallback = fullyPopulated();
        diffFallback.setFallbackUsed(Boolean.FALSE);
        assertNotEquals(base, diffFallback);

        PdfJsonTextElement diffFill = fullyPopulated();
        diffFill.setFillColor(new PdfJsonTextColor("DeviceRGB", new float[] {1f, 1f, 1f}));
        assertNotEquals(base, diffFill);

        PdfJsonTextElement diffMatrix = fullyPopulated();
        diffMatrix.setTextMatrix(new float[] {9f, 9f, 9f, 9f, 9f, 9f});
        assertNotEquals(base, diffMatrix, "Lombok compares float[] contents via Arrays.equals");

        PdfJsonTextElement diffCharCodes = fullyPopulated();
        diffCharCodes.setCharCodes(new int[] {0});
        assertNotEquals(base, diffCharCodes, "Lombok compares int[] contents via Arrays.equals");

        PdfJsonTextElement nulledArrays = fullyPopulated();
        nulledArrays.setTextMatrix(null);
        nulledArrays.setCharCodes(null);
        assertNotEquals(base, nulledArrays, "null array vs populated array must differ");
    }

    @Test
    @DisplayName("equals tolerates differing array instances of identical content (Arrays.equals)")
    void equals_arrayContentNotIdentity() {
        PdfJsonTextElement a =
                PdfJsonTextElement.builder()
                        .textMatrix(new float[] {1f, 2f, 3f})
                        .charCodes(new int[] {4, 5, 6})
                        .build();
        PdfJsonTextElement b =
                PdfJsonTextElement.builder()
                        .textMatrix(new float[] {1f, 2f, 3f})
                        .charCodes(new int[] {4, 5, 6})
                        .build();

        assertNotSame(a.getTextMatrix(), b.getTextMatrix());
        assertNotSame(a.getCharCodes(), b.getCharCodes());
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    @DisplayName("toString includes representative field values")
    void toString_containsFieldValues() {
        PdfJsonTextElement el = fullyPopulated();

        String text = el.toString();

        assertNotNull(text);
        assertTrue(text.contains("Hello"), () -> "toString should contain text: " + text);
        assertTrue(text.contains("F1"), () -> "toString should contain fontId: " + text);
        assertTrue(text.contains("12.0"), () -> "toString should contain fontSize: " + text);
    }

    @ParameterizedTest(name = "preserves boundary/special float value {0}")
    @ValueSource(
            floats = {
                Float.MIN_VALUE,
                -Float.MAX_VALUE,
                0.0f,
                Float.MAX_VALUE,
                Float.POSITIVE_INFINITY,
                Float.NEGATIVE_INFINITY
            })
    @DisplayName("boxed Float fields are stored verbatim without clamping")
    void floatFields_notClamped(float value) {
        PdfJsonTextElement el =
                PdfJsonTextElement.builder().fontSize(value).x(value).rise(value).build();

        assertEquals(value, el.getFontSize());
        assertEquals(value, el.getX());
        assertEquals(value, el.getRise());
    }

    @Test
    @DisplayName("NaN in a boxed Float field is preserved and still equal via Float.compare")
    void floatFields_preserveNaN() {
        PdfJsonTextElement el = PdfJsonTextElement.builder().fontSize(Float.NaN).build();
        assertTrue(Float.isNaN(el.getFontSize()));

        PdfJsonTextElement other = PdfJsonTextElement.builder().fontSize(Float.NaN).build();
        // Lombok equals uses Float.compare on the unboxed value, so NaN == NaN here.
        assertEquals(el, other);
        assertEquals(el.hashCode(), other.hashCode());
    }

    @Test
    @DisplayName("@JsonInclude(NON_NULL) omits every null field for a default element")
    void serialization_omitsNullFields() {
        JsonNode node = mapper.valueToTree(new PdfJsonTextElement());

        assertTrue(node.isObject());
        assertEquals(0, node.size(), () -> "Expected empty object but was: " + node);
    }

    @Test
    @DisplayName("@JsonInclude(NON_NULL) emits only the non-null fields (zero/false kept, null dropped)")
    void serialization_emitsOnlyNonNullFields() {
        PdfJsonTextElement el =
                PdfJsonTextElement.builder()
                        .text("Hi")
                        .zOrder(0) // boxed 0 is non-null, so it must be emitted
                        .fallbackUsed(Boolean.FALSE) // boxed false is non-null, so it must be emitted
                        .build();

        JsonNode node = mapper.valueToTree(el);

        assertTrue(node.has("text"));
        assertEquals("Hi", node.get("text").stringValue());

        assertTrue(node.has("zOrder"), () -> "boxed zero should be emitted (NON_NULL): " + node);
        assertEquals(0, node.get("zOrder").intValue());

        assertTrue(
                node.has("fallbackUsed"),
                () -> "boxed false should be emitted (NON_NULL): " + node);
        assertFalse(node.get("fallbackUsed").booleanValue());

        // Unset wrapper fields are null, hence omitted.
        assertFalse(node.has("fontSize"));
        assertFalse(node.has("x"));
        assertFalse(node.has("textMatrix"));
        assertFalse(node.has("fillColor"));
    }

    @Test
    @DisplayName("JSON round-trip of a fully populated element reconstructs an equal object")
    void serialization_roundTrip_full() {
        PdfJsonTextElement original = fullyPopulated();

        String json = mapper.writeValueAsString(original);
        PdfJsonTextElement restored = mapper.readValue(json, PdfJsonTextElement.class);

        assertEquals(original, restored);
        assertEquals(original.hashCode(), restored.hashCode());
        assertArrayEquals(original.getTextMatrix(), restored.getTextMatrix());
        assertArrayEquals(original.getCharCodes(), restored.getCharCodes());
        assertEquals(original.getFillColor(), restored.getFillColor());
        assertEquals(original.getStrokeColor(), restored.getStrokeColor());
    }

    @Test
    @DisplayName("deserializing an empty object yields an all-null element")
    void deserialization_emptyObjectYieldsNulls() {
        PdfJsonTextElement restored = mapper.readValue("{}", PdfJsonTextElement.class);

        assertEquals(new PdfJsonTextElement(), restored);
        assertNull(restored.getText());
        assertNull(restored.getTextMatrix());
        assertNull(restored.getCharCodes());
        assertNull(restored.getFillColor());
    }

    @Test
    @DisplayName("deserializing a partial object populates only the given fields, including arrays")
    void deserialization_partialObject() {
        String json =
                "{\"text\":\"abc\",\"renderingMode\":1,"
                        + "\"textMatrix\":[1.0,0.0,0.0,1.0,5.0,6.0],"
                        + "\"charCodes\":[10,20,30],"
                        + "\"fillColor\":{\"colorSpace\":\"DeviceRGB\",\"components\":[0.5,0.5,0.5]}}";

        PdfJsonTextElement restored = mapper.readValue(json, PdfJsonTextElement.class);

        assertEquals("abc", restored.getText());
        assertEquals(1, restored.getRenderingMode());
        assertArrayEquals(new float[] {1f, 0f, 0f, 1f, 5f, 6f}, restored.getTextMatrix());
        assertArrayEquals(new int[] {10, 20, 30}, restored.getCharCodes());
        assertNotNull(restored.getFillColor());
        assertEquals("DeviceRGB", restored.getFillColor().getColorSpace());
        assertArrayEquals(
                new float[] {0.5f, 0.5f, 0.5f}, restored.getFillColor().getComponents());

        // Unspecified fields stay null.
        assertNull(restored.getFontId());
        assertNull(restored.getFontSize());
        assertNull(restored.getStrokeColor());
        assertNull(restored.getFallbackUsed());
    }

    @Test
    @DisplayName("unknown JSON properties are ignored (Jackson 3 FAIL_ON_UNKNOWN_PROPERTIES off)")
    void deserialization_ignoresUnknownProperties() {
        PdfJsonTextElement restored =
                mapper.readValue(
                        "{\"text\":\"keep\",\"madeUpField\":123}", PdfJsonTextElement.class);

        assertEquals("keep", restored.getText());
        assertNull(restored.getFontId());
    }

    @Test
    @DisplayName("empty arrays serialize and round-trip without becoming null")
    void serialization_emptyArraysPreserved() {
        PdfJsonTextElement el =
                PdfJsonTextElement.builder()
                        .textMatrix(new float[0])
                        .charCodes(new int[0])
                        .build();

        String json = mapper.writeValueAsString(el);
        PdfJsonTextElement restored = mapper.readValue(json, PdfJsonTextElement.class);

        assertNotNull(restored.getTextMatrix());
        assertNotNull(restored.getCharCodes());
        assertEquals(0, restored.getTextMatrix().length);
        assertEquals(0, restored.getCharCodes().length);
        assertTrue(Arrays.equals(new float[0], restored.getTextMatrix()));
        assertEquals(el, restored);
    }
}
