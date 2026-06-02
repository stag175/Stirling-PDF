package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class PdfJsonFontTest {

    // PdfJsonFont has only wrapper / reference fields (no primitives), so
    // FAIL_ON_NULL_FOR_PRIMITIVES cannot actually fire here. We still mirror the
    // app's mapper config (spring.jackson.deserialization.fail-on-null-for-primitives=false)
    // for consistency with the sibling PdfJsonPageDimensionTest and to stay robust.
    private final ObjectMapper mapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    /** Builds a PdfJsonFont with every field populated with a distinct, non-null value. */
    private static PdfJsonFont.PdfJsonFontBuilder fullyPopulated() {
        return PdfJsonFont.builder()
                .id("F1")
                .pageNumber(2)
                .uid("p2-F1")
                .baseName("Helvetica")
                .subtype("Type0")
                .encoding("Identity-H")
                .cidSystemInfo(
                        PdfJsonFontCidSystemInfo.builder()
                                .registry("Adobe")
                                .ordering("Identity")
                                .supplement(0)
                                .build())
                .embedded(Boolean.TRUE)
                .program("UFJPRw==")
                .programFormat("ttf")
                .webProgram("V0VC")
                .webProgramFormat("woff2")
                .pdfProgram("UERG")
                .pdfProgramFormat("otf")
                .type3Glyphs(
                        List.of(
                                PdfJsonFontType3Glyph.builder()
                                        .charCode(65)
                                        .glyphName("A")
                                        .unicode(0x41)
                                        .charCodeRaw(65)
                                        .build()))
                .conversionCandidates(
                        List.of(
                                PdfJsonFontConversionCandidate.builder()
                                        .strategyId("subset-v1")
                                        .status(PdfJsonFontConversionStatus.SUCCESS)
                                        .build()))
                .toUnicode("VG9Vbmk=")
                .standard14Name("Helvetica")
                .fontDescriptorFlags(32)
                .ascent(718.0f)
                .descent(-207.0f)
                .capHeight(523.0f)
                .xHeight(523.0f)
                .italicAngle(0.0f)
                .unitsPerEm(1000)
                .cosDictionary(
                        PdfJsonCosValue.builder()
                                .type(PdfJsonCosValue.Type.DICTIONARY)
                                .build());
    }

    // ---------------------------------------------------------------------
    // Constructors
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no-args constructor yields all-null field values")
    void noArgsConstructor_defaults() {
        PdfJsonFont font = new PdfJsonFont();

        assertNull(font.getId());
        assertNull(font.getPageNumber());
        assertNull(font.getUid());
        assertNull(font.getBaseName());
        assertNull(font.getSubtype());
        assertNull(font.getEncoding());
        assertNull(font.getCidSystemInfo());
        assertNull(font.getEmbedded());
        assertNull(font.getProgram());
        assertNull(font.getProgramFormat());
        assertNull(font.getWebProgram());
        assertNull(font.getWebProgramFormat());
        assertNull(font.getPdfProgram());
        assertNull(font.getPdfProgramFormat());
        assertNull(font.getType3Glyphs());
        assertNull(font.getConversionCandidates());
        assertNull(font.getToUnicode());
        assertNull(font.getStandard14Name());
        assertNull(font.getFontDescriptorFlags());
        assertNull(font.getAscent());
        assertNull(font.getDescent());
        assertNull(font.getCapHeight());
        assertNull(font.getXHeight());
        assertNull(font.getItalicAngle());
        assertNull(font.getUnitsPerEm());
        assertNull(font.getCosDictionary());
    }

    @Test
    @DisplayName("all-args constructor assigns every field exactly")
    void allArgsConstructor_setsEveryField() {
        PdfJsonFontCidSystemInfo cid =
                PdfJsonFontCidSystemInfo.builder().registry("Adobe").build();
        List<PdfJsonFontType3Glyph> glyphs =
                List.of(PdfJsonFontType3Glyph.builder().charCode(1).build());
        List<PdfJsonFontConversionCandidate> candidates =
                List.of(PdfJsonFontConversionCandidate.builder().strategyId("s").build());
        PdfJsonCosValue cos =
                PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("Type1").build();

        PdfJsonFont font =
                new PdfJsonFont(
                        "F2",
                        7,
                        "p7-F2",
                        "Times",
                        "Type1",
                        "WinAnsiEncoding",
                        cid,
                        Boolean.FALSE,
                        "cHJvZw==",
                        "cff",
                        "d2Vi",
                        "woff",
                        "cGRm",
                        "pfb",
                        glyphs,
                        candidates,
                        "dHU=",
                        "Times-Roman",
                        4,
                        700.0f,
                        -210.0f,
                        660.0f,
                        450.0f,
                        12.5f,
                        2048,
                        cos);

        assertEquals("F2", font.getId());
        assertEquals(Integer.valueOf(7), font.getPageNumber());
        assertEquals("p7-F2", font.getUid());
        assertEquals("Times", font.getBaseName());
        assertEquals("Type1", font.getSubtype());
        assertEquals("WinAnsiEncoding", font.getEncoding());
        assertSame(cid, font.getCidSystemInfo());
        assertEquals(Boolean.FALSE, font.getEmbedded());
        assertEquals("cHJvZw==", font.getProgram());
        assertEquals("cff", font.getProgramFormat());
        assertEquals("d2Vi", font.getWebProgram());
        assertEquals("woff", font.getWebProgramFormat());
        assertEquals("cGRm", font.getPdfProgram());
        assertEquals("pfb", font.getPdfProgramFormat());
        assertSame(glyphs, font.getType3Glyphs());
        assertSame(candidates, font.getConversionCandidates());
        assertEquals("dHU=", font.getToUnicode());
        assertEquals("Times-Roman", font.getStandard14Name());
        assertEquals(Integer.valueOf(4), font.getFontDescriptorFlags());
        assertEquals(Float.valueOf(700.0f), font.getAscent());
        assertEquals(Float.valueOf(-210.0f), font.getDescent());
        assertEquals(Float.valueOf(660.0f), font.getCapHeight());
        assertEquals(Float.valueOf(450.0f), font.getXHeight());
        assertEquals(Float.valueOf(12.5f), font.getItalicAngle());
        assertEquals(Integer.valueOf(2048), font.getUnitsPerEm());
        assertSame(cos, font.getCosDictionary());
    }

    // ---------------------------------------------------------------------
    // Builder
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("builder with no fields set produces an all-null instance equal to no-args ctor")
    void builder_emptyMatchesNoArgsConstructor() {
        PdfJsonFont built = PdfJsonFont.builder().build();

        assertEquals(new PdfJsonFont(), built);
        assertNull(built.getId());
        assertNull(built.getCosDictionary());
        assertNull(built.getType3Glyphs());
        assertNull(built.getUnitsPerEm());
    }

    @Test
    @DisplayName("builder sets every field exactly")
    void builder_setsEveryField() {
        PdfJsonFont font = fullyPopulated().build();

        assertEquals("F1", font.getId());
        assertEquals(Integer.valueOf(2), font.getPageNumber());
        assertEquals("p2-F1", font.getUid());
        assertEquals("Helvetica", font.getBaseName());
        assertEquals("Type0", font.getSubtype());
        assertEquals("Identity-H", font.getEncoding());
        assertNotNull(font.getCidSystemInfo());
        assertEquals("Adobe", font.getCidSystemInfo().getRegistry());
        assertEquals("Identity", font.getCidSystemInfo().getOrdering());
        assertEquals(Integer.valueOf(0), font.getCidSystemInfo().getSupplement());
        assertEquals(Boolean.TRUE, font.getEmbedded());
        assertEquals("UFJPRw==", font.getProgram());
        assertEquals("ttf", font.getProgramFormat());
        assertEquals("V0VC", font.getWebProgram());
        assertEquals("woff2", font.getWebProgramFormat());
        assertEquals("UERG", font.getPdfProgram());
        assertEquals("otf", font.getPdfProgramFormat());
        assertEquals(1, font.getType3Glyphs().size());
        assertEquals(65, font.getType3Glyphs().get(0).getCharCode());
        assertEquals(1, font.getConversionCandidates().size());
        assertEquals("subset-v1", font.getConversionCandidates().get(0).getStrategyId());
        assertEquals("VG9Vbmk=", font.getToUnicode());
        assertEquals("Helvetica", font.getStandard14Name());
        assertEquals(Integer.valueOf(32), font.getFontDescriptorFlags());
        assertEquals(Float.valueOf(718.0f), font.getAscent());
        assertEquals(Float.valueOf(-207.0f), font.getDescent());
        assertEquals(Float.valueOf(523.0f), font.getCapHeight());
        assertEquals(Float.valueOf(523.0f), font.getXHeight());
        assertEquals(Float.valueOf(0.0f), font.getItalicAngle());
        assertEquals(Integer.valueOf(1000), font.getUnitsPerEm());
        assertEquals(PdfJsonCosValue.Type.DICTIONARY, font.getCosDictionary().getType());
    }

    @Test
    @DisplayName("builder leaves unset fields null while keeping set fields")
    void builder_defaultsUnsetFieldsToNull() {
        PdfJsonFont font = PdfJsonFont.builder().id("only-id").pageNumber(9).build();

        assertEquals("only-id", font.getId());
        assertEquals(Integer.valueOf(9), font.getPageNumber());
        assertNull(font.getBaseName());
        assertNull(font.getCidSystemInfo());
        assertNull(font.getType3Glyphs());
        assertNull(font.getConversionCandidates());
        assertNull(font.getAscent());
        assertNull(font.getCosDictionary());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        PdfJsonFontCidSystemInfo cid =
                PdfJsonFontCidSystemInfo.builder().registry("Adobe").ordering("Japan1").build();
        List<PdfJsonFontType3Glyph> glyphs =
                List.of(PdfJsonFontType3Glyph.builder().charCode(3).build());
        List<PdfJsonFontConversionCandidate> candidates =
                List.of(PdfJsonFontConversionCandidate.builder().strategyId("c").build());
        PdfJsonCosValue cos = PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NULL).build();

        PdfJsonFont built =
                PdfJsonFont.builder()
                        .id("F9")
                        .pageNumber(1)
                        .uid("p1-F9")
                        .baseName("Courier")
                        .subtype("TrueType")
                        .encoding("MacRomanEncoding")
                        .cidSystemInfo(cid)
                        .embedded(Boolean.TRUE)
                        .program("AA==")
                        .programFormat("ttf")
                        .webProgram("AB==")
                        .webProgramFormat("woff2")
                        .pdfProgram("AC==")
                        .pdfProgramFormat("otf")
                        .type3Glyphs(glyphs)
                        .conversionCandidates(candidates)
                        .toUnicode("AD==")
                        .standard14Name("Courier")
                        .fontDescriptorFlags(64)
                        .ascent(600.0f)
                        .descent(-200.0f)
                        .capHeight(560.0f)
                        .xHeight(400.0f)
                        .italicAngle(-5.0f)
                        .unitsPerEm(1000)
                        .cosDictionary(cos)
                        .build();

        PdfJsonFont constructed =
                new PdfJsonFont(
                        "F9",
                        1,
                        "p1-F9",
                        "Courier",
                        "TrueType",
                        "MacRomanEncoding",
                        cid,
                        Boolean.TRUE,
                        "AA==",
                        "ttf",
                        "AB==",
                        "woff2",
                        "AC==",
                        "otf",
                        glyphs,
                        candidates,
                        "AD==",
                        "Courier",
                        64,
                        600.0f,
                        -200.0f,
                        560.0f,
                        400.0f,
                        -5.0f,
                        1000,
                        cos);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("builder is reusable and produces independent instances")
    void builder_isReusable() {
        PdfJsonFont.PdfJsonFontBuilder builder = PdfJsonFont.builder().id("base");

        PdfJsonFont first = builder.subtype("Type1").build();
        PdfJsonFont second = builder.subtype("Type0").build();

        assertEquals("base", first.getId());
        assertEquals("base", second.getId());
        assertEquals("Type1", first.getSubtype());
        assertEquals("Type0", second.getSubtype());
        assertNotEquals(first, second);
    }

    // ---------------------------------------------------------------------
    // Setters (Lombok @Data)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("setters mutate every field on the @Data instance")
    void setters_mutateState() {
        PdfJsonFont font = new PdfJsonFont();
        PdfJsonFontCidSystemInfo cid = PdfJsonFontCidSystemInfo.builder().registry("R").build();
        List<PdfJsonFontType3Glyph> glyphs =
                List.of(PdfJsonFontType3Glyph.builder().charCode(7).build());
        List<PdfJsonFontConversionCandidate> candidates =
                List.of(PdfJsonFontConversionCandidate.builder().strategyId("z").build());
        PdfJsonCosValue cos = PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.ARRAY).build();

        font.setId("F3");
        font.setPageNumber(5);
        font.setUid("p5-F3");
        font.setBaseName("Symbol");
        font.setSubtype("Type3");
        font.setEncoding("StandardEncoding");
        font.setCidSystemInfo(cid);
        font.setEmbedded(Boolean.TRUE);
        font.setProgram("cA==");
        font.setProgramFormat("pfb");
        font.setWebProgram("dw==");
        font.setWebProgramFormat("woff");
        font.setPdfProgram("cGQ=");
        font.setPdfProgramFormat("cff");
        font.setType3Glyphs(glyphs);
        font.setConversionCandidates(candidates);
        font.setToUnicode("dHU=");
        font.setStandard14Name("Symbol");
        font.setFontDescriptorFlags(4);
        font.setAscent(1000.0f);
        font.setDescent(-300.0f);
        font.setCapHeight(700.0f);
        font.setXHeight(500.0f);
        font.setItalicAngle(15.0f);
        font.setUnitsPerEm(2048);
        font.setCosDictionary(cos);

        assertEquals("F3", font.getId());
        assertEquals(Integer.valueOf(5), font.getPageNumber());
        assertEquals("p5-F3", font.getUid());
        assertEquals("Symbol", font.getBaseName());
        assertEquals("Type3", font.getSubtype());
        assertEquals("StandardEncoding", font.getEncoding());
        assertSame(cid, font.getCidSystemInfo());
        assertEquals(Boolean.TRUE, font.getEmbedded());
        assertEquals("cA==", font.getProgram());
        assertEquals("pfb", font.getProgramFormat());
        assertEquals("dw==", font.getWebProgram());
        assertEquals("woff", font.getWebProgramFormat());
        assertEquals("cGQ=", font.getPdfProgram());
        assertEquals("cff", font.getPdfProgramFormat());
        assertSame(glyphs, font.getType3Glyphs());
        assertSame(candidates, font.getConversionCandidates());
        assertEquals("dHU=", font.getToUnicode());
        assertEquals("Symbol", font.getStandard14Name());
        assertEquals(Integer.valueOf(4), font.getFontDescriptorFlags());
        assertEquals(Float.valueOf(1000.0f), font.getAscent());
        assertEquals(Float.valueOf(-300.0f), font.getDescent());
        assertEquals(Float.valueOf(700.0f), font.getCapHeight());
        assertEquals(Float.valueOf(500.0f), font.getXHeight());
        assertEquals(Float.valueOf(15.0f), font.getItalicAngle());
        assertEquals(Integer.valueOf(2048), font.getUnitsPerEm());
        assertSame(cos, font.getCosDictionary());
    }

    @Test
    @DisplayName("setters accept null to clear previously populated fields")
    void setters_acceptNull() {
        PdfJsonFont font = fullyPopulated().build();

        font.setId(null);
        font.setEmbedded(null);
        font.setAscent(null);
        font.setCidSystemInfo(null);
        font.setType3Glyphs(null);
        font.setCosDictionary(null);

        assertNull(font.getId());
        assertNull(font.getEmbedded());
        assertNull(font.getAscent());
        assertNull(font.getCidSystemInfo());
        assertNull(font.getType3Glyphs());
        assertNull(font.getCosDictionary());
    }

    // ---------------------------------------------------------------------
    // equals / hashCode / toString
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("equals/hashCode reflect deep value equality for matching fields")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonFont a = fullyPopulated().build();
        PdfJsonFont b = fullyPopulated().build();

        assertNotSame(a, b);
        assertEquals(a, b, "Equal field values must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "Equal objects must share a hash code");
    }

    @Test
    @DisplayName("equals distinguishes a difference in a scalar field")
    void equals_differsByScalarField() {
        PdfJsonFont a = fullyPopulated().build();
        PdfJsonFont differentId = fullyPopulated().id("OTHER").build();
        PdfJsonFont differentEmbedded = fullyPopulated().embedded(Boolean.FALSE).build();
        PdfJsonFont differentAscent = fullyPopulated().ascent(1.0f).build();
        PdfJsonFont differentUnits = fullyPopulated().unitsPerEm(2048).build();

        assertNotEquals(a, differentId);
        assertNotEquals(a, differentEmbedded);
        assertNotEquals(a, differentAscent);
        assertNotEquals(a, differentUnits);
    }

    @Test
    @DisplayName("equals distinguishes a difference in a nested object field")
    void equals_differsByNestedObjectField() {
        PdfJsonFont a = fullyPopulated().build();
        PdfJsonFont differentCid =
                fullyPopulated()
                        .cidSystemInfo(
                                PdfJsonFontCidSystemInfo.builder().registry("Other").build())
                        .build();
        PdfJsonFont differentCos =
                fullyPopulated()
                        .cosDictionary(
                                PdfJsonCosValue.builder()
                                        .type(PdfJsonCosValue.Type.STREAM)
                                        .build())
                        .build();

        assertNotEquals(a, differentCid);
        assertNotEquals(a, differentCos);
    }

    @Test
    @DisplayName("equals distinguishes differing list contents (deep List equality)")
    void equals_differsByListContents() {
        PdfJsonFont a = fullyPopulated().build();
        PdfJsonFont differentGlyphs =
                fullyPopulated()
                        .type3Glyphs(
                                List.of(
                                        PdfJsonFontType3Glyph.builder()
                                                .charCode(66)
                                                .glyphName("B")
                                                .build()))
                        .build();
        PdfJsonFont emptyGlyphs = fullyPopulated().type3Glyphs(List.of()).build();

        assertNotEquals(a, differentGlyphs);
        assertNotEquals(a, emptyGlyphs);
    }

    @Test
    @DisplayName("equals contract: reflexive, null-safe, type-safe")
    void equals_contractBasics() {
        PdfJsonFont a = fullyPopulated().build();

        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-font");
    }

    @Test
    @DisplayName("toString includes populated scalar field values")
    void toString_containsFieldValues() {
        PdfJsonFont font =
                PdfJsonFont.builder()
                        .id("F-tostring")
                        .baseName("HelveticaBold")
                        .subtype("Type0")
                        .unitsPerEm(1000)
                        .build();

        String text = font.toString();

        assertNotNull(text);
        assertTrue(text.contains("F-tostring"), () -> "toString should contain id: " + text);
        assertTrue(text.contains("HelveticaBold"), () -> "toString should contain baseName: " + text);
        assertTrue(text.contains("Type0"), () -> "toString should contain subtype: " + text);
        assertTrue(text.contains("1000"), () -> "toString should contain unitsPerEm: " + text);
    }

    // ---------------------------------------------------------------------
    // JSON (Jackson 3 / tools.jackson) with @JsonInclude(NON_NULL)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("@JsonInclude(NON_NULL) omits all fields for an empty instance")
    void serialization_omitsNullFields() {
        JsonNode node = mapper.valueToTree(new PdfJsonFont());

        assertTrue(node.isObject());
        assertEquals(0, node.size(), () -> "Expected empty object but was: " + node);
        assertFalse(node.has("id"));
        assertFalse(node.has("embedded"));
        assertFalse(node.has("ascent"));
        assertFalse(node.has("cosDictionary"));
    }

    @Test
    @DisplayName("@JsonInclude(NON_NULL) emits only the populated fields")
    void serialization_emitsOnlyNonNullFields() {
        PdfJsonFont partial =
                PdfJsonFont.builder().id("F5").pageNumber(3).embedded(Boolean.FALSE).build();

        JsonNode node = mapper.valueToTree(partial);

        assertTrue(node.has("id"), () -> "id should be present: " + node);
        assertEquals("F5", node.get("id").stringValue());
        assertTrue(node.has("pageNumber"), () -> "pageNumber should be present: " + node);
        assertEquals(3, node.get("pageNumber").intValue());
        // embedded=false is a non-null Boolean, so NON_NULL keeps it.
        assertTrue(node.has("embedded"), () -> "embedded(false) should be present: " + node);
        assertFalse(node.get("embedded").booleanValue());

        // Everything else is null and must be omitted.
        assertFalse(node.has("baseName"));
        assertFalse(node.has("subtype"));
        assertFalse(node.has("cidSystemInfo"));
        assertFalse(node.has("type3Glyphs"));
        assertFalse(node.has("cosDictionary"));
        assertEquals(3, node.size(), () -> "Only id/pageNumber/embedded expected: " + node);
    }

    @Test
    @DisplayName("full JSON round-trip reconstructs an equal object including nested types")
    void serialization_roundTripFull() {
        PdfJsonFont original = fullyPopulated().build();

        String json = mapper.writeValueAsString(original);
        PdfJsonFont restored = mapper.readValue(json, PdfJsonFont.class);

        assertEquals(original, restored);
        assertEquals(original.hashCode(), restored.hashCode());
        // Spot-check that nested structures survived the trip.
        assertEquals("Adobe", restored.getCidSystemInfo().getRegistry());
        assertEquals(65, restored.getType3Glyphs().get(0).getCharCode());
        assertEquals(
                PdfJsonFontConversionStatus.SUCCESS,
                restored.getConversionCandidates().get(0).getStatus());
        assertEquals(PdfJsonCosValue.Type.DICTIONARY, restored.getCosDictionary().getType());
    }

    @Test
    @DisplayName("deserializing an empty object yields an all-null instance")
    void deserialization_emptyObjectYieldsNulls() {
        PdfJsonFont restored = mapper.readValue("{}", PdfJsonFont.class);

        assertEquals(new PdfJsonFont(), restored);
        assertNull(restored.getId());
        assertNull(restored.getEmbedded());
        assertNull(restored.getCosDictionary());
    }

    @Test
    @DisplayName("deserialization ignores unknown properties (Jackson 3 default OFF)")
    void deserialization_ignoresUnknownProperties() {
        // FAIL_ON_UNKNOWN_PROPERTIES is OFF by default in Jackson 3, so unexpected keys are dropped.
        String json = "{\"id\":\"F6\",\"totallyUnknownKey\":123,\"another\":\"x\"}";

        PdfJsonFont restored = mapper.readValue(json, PdfJsonFont.class);

        assertEquals("F6", restored.getId());
        assertNull(restored.getPageNumber());
    }

    @Test
    @DisplayName("deserializing a partial object leaves unspecified fields null")
    void deserialization_partialObject() {
        String json = "{\"baseName\":\"Arial\",\"unitsPerEm\":2048,\"italicAngle\":-12.5}";

        PdfJsonFont restored = mapper.readValue(json, PdfJsonFont.class);

        assertNull(restored.getId());
        assertEquals("Arial", restored.getBaseName());
        assertEquals(Integer.valueOf(2048), restored.getUnitsPerEm());
        assertEquals(Float.valueOf(-12.5f), restored.getItalicAngle());
        assertNull(restored.getCidSystemInfo());
    }
}
