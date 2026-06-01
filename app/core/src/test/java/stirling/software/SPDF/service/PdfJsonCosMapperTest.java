package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSBoolean;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.service.PdfJsonCosMapper.SerializationContext;

/**
 * Deterministic unit tests for {@link PdfJsonCosMapper}. Only the STREAM branch needs a real {@link
 * PDDocument}; everything else exercises COS literals directly so no PDF parsing is involved.
 */
class PdfJsonCosMapperTest {

    private PdfJsonCosMapper mapper;
    private PDDocument document;

    @BeforeEach
    void setUp() {
        mapper = new PdfJsonCosMapper();
        document = new PDDocument();
    }

    @AfterEach
    void tearDown() throws IOException {
        if (document != null) {
            document.close();
        }
    }

    // --- SerializationContext.omitStreamData ---

    @ParameterizedTest
    @EnumSource(
            value = SerializationContext.class,
            names = {"CONTENT_STREAMS_LIGHTWEIGHT", "RESOURCES_LIGHTWEIGHT"})
    void omitStreamData_lightweightContexts_returnTrue(SerializationContext context) {
        assertTrue(context.omitStreamData());
    }

    @ParameterizedTest
    @EnumSource(
            value = SerializationContext.class,
            names = {"DEFAULT", "ANNOTATION_RAW_DATA", "FORM_FIELD_RAW_DATA"})
    void omitStreamData_heavyweightContexts_returnFalse(SerializationContext context) {
        assertFalse(context.omitStreamData());
    }

    // --- deserializeCosValue: guard clauses ---

    @Test
    void deserializeCosValue_nullValue_returnsNull() throws IOException {
        assertNull(mapper.deserializeCosValue(null, document));
    }

    @Test
    void deserializeCosValue_nullType_returnsNull() throws IOException {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(null).value("ignored").build();
        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: NULL ---

    @Test
    void deserializeCosValue_null_returnsCosNullSingleton() throws IOException {
        PdfJsonCosValue value = PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NULL).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        assertSame(COSNull.NULL, result);
    }

    // --- deserializeCosValue: BOOLEAN ---

    @Test
    void deserializeCosValue_booleanTrue_returnsCosBooleanTrue() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.BOOLEAN).value(true).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        assertSame(COSBoolean.TRUE, result);
    }

    @Test
    void deserializeCosValue_booleanFalse_returnsCosBooleanFalse() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.BOOLEAN).value(false).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        assertSame(COSBoolean.FALSE, result);
    }

    @Test
    void deserializeCosValue_booleanWithNonBooleanValue_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.BOOLEAN)
                        .value("not-a-boolean")
                        .build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: INTEGER ---

    @Test
    void deserializeCosValue_integer_returnsCosIntegerWithLongValue() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(42L).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSInteger integer = assertInstanceOf(COSInteger.class, result);
        assertEquals(42L, integer.longValue());
    }

    @Test
    void deserializeCosValue_integerFromDouble_truncatesViaLongValue() throws IOException {
        // Number.longValue() truncates the fractional component deterministically.
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(7.9d).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSInteger integer = assertInstanceOf(COSInteger.class, result);
        assertEquals(7L, integer.longValue());
    }

    @Test
    void deserializeCosValue_integerWithNonNumberValue_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value("x").build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: FLOAT ---

    @Test
    void deserializeCosValue_float_returnsCosFloatWithFloatValue() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.FLOAT).value(3.5d).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSFloat floatValue = assertInstanceOf(COSFloat.class, result);
        assertEquals(3.5f, floatValue.floatValue());
    }

    @Test
    void deserializeCosValue_floatWithNonNumberValue_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.FLOAT)
                        .value(Boolean.TRUE)
                        .build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: NAME ---

    @Test
    void deserializeCosValue_name_returnsCosName() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("Type0").build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSName name = assertInstanceOf(COSName.class, result);
        assertEquals("Type0", name.getName());
    }

    @Test
    void deserializeCosValue_nameWithNonStringValue_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value(123L).build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: STRING (Base64) ---

    @Test
    void deserializeCosValue_string_decodesBase64IntoCosStringBytes() throws IOException {
        byte[] raw = {0x00, 0x10, (byte) 0xFF, 0x7E};
        String encoded = Base64.getEncoder().encodeToString(raw);
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STRING).value(encoded).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSString cosString = assertInstanceOf(COSString.class, result);
        assertArrayEquals(raw, cosString.getBytes());
    }

    @Test
    void deserializeCosValue_stringEmptyBase64_returnsEmptyCosString() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STRING).value("").build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSString cosString = assertInstanceOf(COSString.class, result);
        assertArrayEquals(new byte[0], cosString.getBytes());
    }

    @Test
    void deserializeCosValue_stringInvalidBase64_returnsNull() throws IOException {
        // '!' is not a valid Base64 character, triggering the IllegalArgumentException branch.
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.STRING)
                        .value("not!!base64!!")
                        .build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    @Test
    void deserializeCosValue_stringWithNonStringValue_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STRING).value(42L).build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- deserializeCosValue: ARRAY ---

    @Test
    void deserializeCosValue_array_deserializesEachItem() throws IOException {
        PdfJsonCosValue intItem =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(1L).build();
        PdfJsonCosValue nameItem =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("X").build();
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.ARRAY)
                        .items(List.of(intItem, nameItem))
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSArray array = assertInstanceOf(COSArray.class, result);
        assertEquals(2, array.size());
        assertInstanceOf(COSInteger.class, array.get(0));
        assertInstanceOf(COSName.class, array.get(1));
    }

    @Test
    void deserializeCosValue_arrayWithNullYieldingItem_substitutesCosNull() throws IOException {
        // An INTEGER item carrying a non-Number value deserializes to null, which the array
        // branch replaces with COSNull.NULL rather than dropping the slot.
        PdfJsonCosValue badItem =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.INTEGER)
                        .value("not-a-number")
                        .build();
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.ARRAY)
                        .items(List.of(badItem))
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSArray array = assertInstanceOf(COSArray.class, result);
        assertEquals(1, array.size());
        assertSame(COSNull.NULL, array.get(0));
    }

    @Test
    void deserializeCosValue_arrayWithNullItems_returnsEmptyArray() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.ARRAY).items(null).build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSArray array = assertInstanceOf(COSArray.class, result);
        assertEquals(0, array.size());
    }

    // --- deserializeCosValue: DICTIONARY ---

    @Test
    void deserializeCosValue_dictionary_deserializesEntries() throws IOException {
        Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
        entries.put(
                "Count",
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(3L).build());
        entries.put(
                "Subtype",
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("Image").build());
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.DICTIONARY)
                        .entries(entries)
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSDictionary dictionary = assertInstanceOf(COSDictionary.class, result);
        assertEquals(3L, longOf(dictionary, COSName.getPDFName("Count")));
        assertEquals(
                "Image",
                ((COSName) dictionary.getDictionaryObject(COSName.getPDFName("Subtype")))
                        .getName());
    }

    @Test
    void deserializeCosValue_dictionarySkipsNullYieldingEntries() throws IOException {
        Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
        entries.put(
                "Good",
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(1L).build());
        // Non-Number value for an INTEGER entry deserializes to null and must be omitted entirely.
        entries.put(
                "Bad",
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value("nope").build());
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.DICTIONARY)
                        .entries(entries)
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSDictionary dictionary = assertInstanceOf(COSDictionary.class, result);
        assertTrue(dictionary.containsKey(COSName.getPDFName("Good")));
        assertFalse(dictionary.containsKey(COSName.getPDFName("Bad")));
    }

    @Test
    void deserializeCosValue_dictionaryWithNullEntries_returnsEmptyDictionary() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.DICTIONARY)
                        .entries(null)
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSDictionary dictionary = assertInstanceOf(COSDictionary.class, result);
        assertTrue(dictionary.keySet().isEmpty());
    }

    // --- deserializeCosValue: STREAM ---

    @Test
    void deserializeCosValue_stream_buildsCosStreamFromModel() throws IOException {
        byte[] payload = "stream-bytes".getBytes();
        Map<String, PdfJsonCosValue> dict = new LinkedHashMap<>();
        dict.put(
                "Subtype",
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("Form").build());
        PdfJsonStream streamModel =
                PdfJsonStream.builder()
                        .dictionary(dict)
                        .rawData(Base64.getEncoder().encodeToString(payload))
                        .build();
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STREAM).stream(streamModel)
                        .build();

        COSBase result = mapper.deserializeCosValue(value, document);

        COSStream cosStream = assertInstanceOf(COSStream.class, result);
        assertArrayEquals(payload, readRawBytes(cosStream));
        assertEquals(payload.length, longOf(cosStream, COSName.LENGTH));
    }

    @Test
    void deserializeCosValue_streamWithNullStreamModel_returnsNull() throws IOException {
        PdfJsonCosValue value =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STREAM).stream(null).build();

        assertNull(mapper.deserializeCosValue(value, document));
    }

    // --- buildStreamFromModel ---

    @Test
    void buildStreamFromModel_null_returnsNull() throws IOException {
        assertNull(mapper.buildStreamFromModel(null, document));
    }

    @Test
    void buildStreamFromModel_withDictionaryAndData_populatesStream() throws IOException {
        byte[] payload = {1, 2, 3, 4, 5};
        Map<String, PdfJsonCosValue> dict = new LinkedHashMap<>();
        dict.put(
                "Filter",
                PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.NAME)
                        .value("FlateDecode")
                        .build());
        PdfJsonStream streamModel =
                PdfJsonStream.builder()
                        .dictionary(dict)
                        .rawData(Base64.getEncoder().encodeToString(payload))
                        .build();

        COSStream cosStream = mapper.buildStreamFromModel(streamModel, document);

        assertNotNull(cosStream);
        assertEquals(
                "FlateDecode", ((COSName) cosStream.getDictionaryObject(COSName.FILTER)).getName());
        assertArrayEquals(payload, readRawBytes(cosStream));
        assertEquals(payload.length, longOf(cosStream, COSName.LENGTH));
    }

    @Test
    void buildStreamFromModel_blankRawData_setsLengthZero() throws IOException {
        // Blank rawData takes the else-branch: only LENGTH=0 is set and no raw output stream is
        // ever created, so createRawInputStream() is intentionally not exercised here (it would
        // throw on a never-written COSStream). The invalidBase64 test covers the written-empty
        // path.
        PdfJsonStream streamModel = PdfJsonStream.builder().rawData("   ").build();

        COSStream cosStream = mapper.buildStreamFromModel(streamModel, document);

        assertNotNull(cosStream);
        assertEquals(0L, longOf(cosStream, COSName.LENGTH));
    }

    @Test
    void buildStreamFromModel_nullRawData_setsLengthZero() throws IOException {
        PdfJsonStream streamModel = PdfJsonStream.builder().rawData(null).build();

        COSStream cosStream = mapper.buildStreamFromModel(streamModel, document);

        assertNotNull(cosStream);
        assertEquals(0L, longOf(cosStream, COSName.LENGTH));
    }

    @Test
    void buildStreamFromModel_invalidBase64RawData_writesEmptyData() throws IOException {
        // Invalid base64 is swallowed and falls back to an empty payload (length 0 from the
        // decode-failure path, then re-set by the non-blank rawData branch).
        PdfJsonStream streamModel = PdfJsonStream.builder().rawData("@@not-base64@@").build();

        COSStream cosStream = mapper.buildStreamFromModel(streamModel, document);

        assertNotNull(cosStream);
        assertEquals(0L, longOf(cosStream, COSName.LENGTH));
        assertArrayEquals(new byte[0], readRawBytes(cosStream));
    }

    // --- serializeStream: null guards ---

    @Test
    void serializeStream_nullCosStream_returnsNull() throws IOException {
        assertNull(mapper.serializeStream((COSStream) null));
    }

    @Test
    void serializeStream_nullPdStream_returnsNull() throws IOException {
        assertNull(mapper.serializeStream((org.apache.pdfbox.pdmodel.common.PDStream) null));
    }

    @Test
    void serializeStream_nullCosStreamWithContext_returnsNull() throws IOException {
        assertNull(mapper.serializeStream((COSStream) null, SerializationContext.DEFAULT));
    }

    // --- serializeStream: round trip and omitStreamData behaviour ---

    @Test
    void serializeStream_default_includesRawData() throws IOException {
        byte[] payload = "hello-stream".getBytes();
        COSStream cosStream = newRawStream(payload);

        PdfJsonStream serialized = mapper.serializeStream(cosStream, SerializationContext.DEFAULT);

        assertNotNull(serialized);
        assertNotNull(serialized.getRawData());
        assertArrayEquals(payload, Base64.getDecoder().decode(serialized.getRawData()));
    }

    @Test
    void serializeStream_lightweightContext_omitsRawDataButKeepsDictionary() throws IOException {
        byte[] payload = "hidden".getBytes();
        COSStream cosStream = newRawStream(payload);
        cosStream.setItem(COSName.TYPE, COSName.getPDFName("XObject"));

        PdfJsonStream serialized =
                mapper.serializeStream(cosStream, SerializationContext.CONTENT_STREAMS_LIGHTWEIGHT);

        assertNotNull(serialized);
        assertNull(serialized.getRawData());
        assertNotNull(serialized.getDictionary());
        assertTrue(serialized.getDictionary().containsKey(COSName.TYPE.getName()));
    }

    @Test
    void serializeStream_emptyStream_hasNullRawData() throws IOException {
        COSStream cosStream = newRawStream(new byte[0]);

        PdfJsonStream serialized = mapper.serializeStream(cosStream);

        assertNotNull(serialized);
        assertNull(serialized.getRawData());
    }

    // --- serializeCosValue: literal mapping and round trips ---

    @Test
    void serializeCosValue_null_input_returnsNull() throws IOException {
        assertNull(mapper.serializeCosValue(null));
    }

    @Test
    void serializeCosValue_cosNull_roundTrip() throws IOException {
        PdfJsonCosValue serialized = mapper.serializeCosValue(COSNull.NULL);

        assertEquals(PdfJsonCosValue.Type.NULL, serialized.getType());
        assertSame(COSNull.NULL, mapper.deserializeCosValue(serialized, document));
    }

    @Test
    void serializeCosValue_cosBoolean_roundTrip() throws IOException {
        PdfJsonCosValue serialized = mapper.serializeCosValue(COSBoolean.TRUE);

        assertEquals(PdfJsonCosValue.Type.BOOLEAN, serialized.getType());
        assertEquals(Boolean.TRUE, serialized.getValue());
        assertSame(COSBoolean.TRUE, mapper.deserializeCosValue(serialized, document));
    }

    @Test
    void serializeCosValue_cosInteger_roundTrip() throws IOException {
        PdfJsonCosValue serialized = mapper.serializeCosValue(COSInteger.get(123L));

        assertEquals(PdfJsonCosValue.Type.INTEGER, serialized.getType());
        assertEquals(123L, ((Number) serialized.getValue()).longValue());

        COSBase back = mapper.deserializeCosValue(serialized, document);
        assertEquals(123L, ((COSInteger) back).longValue());
    }

    @Test
    void serializeCosValue_cosFloat_roundTrip() throws IOException {
        PdfJsonCosValue serialized = mapper.serializeCosValue(new COSFloat(1.25f));

        assertEquals(PdfJsonCosValue.Type.FLOAT, serialized.getType());
        assertEquals(1.25f, ((Number) serialized.getValue()).floatValue());

        COSBase back = mapper.deserializeCosValue(serialized, document);
        assertEquals(1.25f, ((COSFloat) back).floatValue());
    }

    @Test
    void serializeCosValue_cosName_roundTrip() throws IOException {
        PdfJsonCosValue serialized = mapper.serializeCosValue(COSName.getPDFName("Helvetica"));

        assertEquals(PdfJsonCosValue.Type.NAME, serialized.getType());
        assertEquals("Helvetica", serialized.getValue());

        COSBase back = mapper.deserializeCosValue(serialized, document);
        assertEquals("Helvetica", ((COSName) back).getName());
    }

    @Test
    void serializeCosValue_cosString_roundTripPreservesBytes() throws IOException {
        byte[] raw = {0x00, (byte) 0x80, (byte) 0xFF, 0x41};
        PdfJsonCosValue serialized = mapper.serializeCosValue(new COSString(raw));

        assertEquals(PdfJsonCosValue.Type.STRING, serialized.getType());
        // Stored value is Base64 of the original bytes.
        assertArrayEquals(raw, Base64.getDecoder().decode((String) serialized.getValue()));

        COSBase back = mapper.deserializeCosValue(serialized, document);
        assertArrayEquals(raw, ((COSString) back).getBytes());
    }

    @Test
    void serializeCosValue_cosArray_roundTrip() throws IOException {
        COSArray source = new COSArray();
        source.add(COSInteger.get(10L));
        source.add(COSName.getPDFName("A"));

        PdfJsonCosValue serialized = mapper.serializeCosValue(source);

        assertEquals(PdfJsonCosValue.Type.ARRAY, serialized.getType());
        assertEquals(2, serialized.getItems().size());

        COSArray back = (COSArray) mapper.deserializeCosValue(serialized, document);
        assertEquals(2, back.size());
        assertEquals(10L, ((COSInteger) back.get(0)).longValue());
        assertEquals("A", ((COSName) back.get(1)).getName());
    }

    @Test
    void serializeCosValue_cosDictionary_roundTrip() throws IOException {
        COSDictionary source = new COSDictionary();
        source.setItem(COSName.TYPE, COSName.getPDFName("Page"));
        source.setItem(COSName.getPDFName("Rotate"), COSInteger.get(90L));

        PdfJsonCosValue serialized = mapper.serializeCosValue(source);

        assertEquals(PdfJsonCosValue.Type.DICTIONARY, serialized.getType());
        assertTrue(serialized.getEntries().containsKey("Type"));
        assertTrue(serialized.getEntries().containsKey("Rotate"));

        COSDictionary back = (COSDictionary) mapper.deserializeCosValue(serialized, document);
        assertEquals("Page", ((COSName) back.getDictionaryObject(COSName.TYPE)).getName());
        assertEquals(90L, longOf(back, COSName.getPDFName("Rotate")));
    }

    @Test
    void serializeCosValue_circularDictionary_emitsCircularMarker() throws IOException {
        COSDictionary outer = new COSDictionary();
        COSDictionary inner = new COSDictionary();
        inner.setItem(COSName.PARENT, outer);
        outer.setItem(COSName.getPDFName("Child"), inner);

        PdfJsonCosValue serialized = mapper.serializeCosValue(outer);

        // outer -> Child(inner) -> Parent(outer-again) must be detected as a cycle.
        PdfJsonCosValue child = serialized.getEntries().get("Child");
        PdfJsonCosValue parent = child.getEntries().get("Parent");
        assertEquals(PdfJsonCosValue.Type.NAME, parent.getType());
        assertEquals("__circular__", parent.getValue());
    }

    @Test
    void serializeThenDeserialize_nestedDictionaryWithStream_roundTrips() throws IOException {
        byte[] payload = "nested".getBytes();
        COSStream stream = newRawStream(payload);
        stream.setItem(COSName.TYPE, COSName.getPDFName("XObject"));

        COSDictionary source = new COSDictionary();
        source.setItem(COSName.getPDFName("Resource"), stream);
        source.setItem(COSName.COUNT, COSInteger.get(1L));

        PdfJsonCosValue serialized = mapper.serializeCosValue(source, SerializationContext.DEFAULT);
        COSDictionary back = (COSDictionary) mapper.deserializeCosValue(serialized, document);

        COSStream backStream = (COSStream) back.getDictionaryObject(COSName.getPDFName("Resource"));
        assertNotNull(backStream);
        assertArrayEquals(payload, readRawBytes(backStream));
        assertEquals(1L, longOf(back, COSName.COUNT));
    }

    // --- helpers ---

    private COSStream newRawStream(byte[] data) throws IOException {
        COSStream cosStream = document.getDocument().createCOSStream();
        try (OutputStream out = cosStream.createRawOutputStream()) {
            out.write(data);
        }
        cosStream.setItem(COSName.LENGTH, COSInteger.get(data.length));
        return cosStream;
    }

    private static byte[] readRawBytes(COSStream cosStream) throws IOException {
        try (InputStream in = cosStream.createRawInputStream()) {
            return in.readAllBytes();
        }
    }

    private static long longOf(COSDictionary dictionary, COSName key) {
        return ((COSInteger) dictionary.getDictionaryObject(key)).longValue();
    }
}
