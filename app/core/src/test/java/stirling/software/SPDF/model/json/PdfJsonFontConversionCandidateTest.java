package stirling.software.SPDF.model.json;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class PdfJsonFontConversionCandidateTest {

    private static PdfJsonFontConversionCandidate.PdfJsonFontConversionCandidateBuilder
            fullyPopulated() {
        return PdfJsonFontConversionCandidate.builder()
                .strategyId("subset-v1")
                .strategyLabel("Subset (v1)")
                .status(PdfJsonFontConversionStatus.SUCCESS)
                .message("Converted cleanly")
                .synthesizedGlyphs(120)
                .missingGlyphs(3)
                .widthDelta(0.5d)
                .bboxDelta(1.25d)
                .program("UFRGRg==")
                .programFormat("ttf")
                .webProgram("V0VC")
                .webProgramFormat("woff2")
                .pdfProgram("UERG")
                .pdfProgramFormat("otf")
                .previewImage("iVBORw0KGgo=")
                .diagnostics("{\"ok\":true}")
                .glyphCoverage(new int[] {65, 66, 67});
    }

    @Test
    @DisplayName("no-args constructor yields all-null/default field values")
    void noArgsConstructor_defaults() {
        PdfJsonFontConversionCandidate candidate = new PdfJsonFontConversionCandidate();

        assertNull(candidate.getStrategyId());
        assertNull(candidate.getStrategyLabel());
        assertNull(candidate.getStatus());
        assertNull(candidate.getMessage());
        assertNull(candidate.getSynthesizedGlyphs());
        assertNull(candidate.getMissingGlyphs());
        assertNull(candidate.getWidthDelta());
        assertNull(candidate.getBboxDelta());
        assertNull(candidate.getProgram());
        assertNull(candidate.getProgramFormat());
        assertNull(candidate.getWebProgram());
        assertNull(candidate.getWebProgramFormat());
        assertNull(candidate.getPdfProgram());
        assertNull(candidate.getPdfProgramFormat());
        assertNull(candidate.getPreviewImage());
        assertNull(candidate.getDiagnostics());
        // int[] is an object reference, so it defaults to null (not an empty array).
        assertNull(candidate.getGlyphCoverage());
    }

    @Test
    @DisplayName("builder sets every field exactly")
    void builder_setsEveryField() {
        PdfJsonFontConversionCandidate candidate = fullyPopulated().build();

        assertEquals("subset-v1", candidate.getStrategyId());
        assertEquals("Subset (v1)", candidate.getStrategyLabel());
        assertEquals(PdfJsonFontConversionStatus.SUCCESS, candidate.getStatus());
        assertEquals("Converted cleanly", candidate.getMessage());
        assertEquals(Integer.valueOf(120), candidate.getSynthesizedGlyphs());
        assertEquals(Integer.valueOf(3), candidate.getMissingGlyphs());
        assertEquals(Double.valueOf(0.5d), candidate.getWidthDelta());
        assertEquals(Double.valueOf(1.25d), candidate.getBboxDelta());
        assertEquals("UFRGRg==", candidate.getProgram());
        assertEquals("ttf", candidate.getProgramFormat());
        assertEquals("V0VC", candidate.getWebProgram());
        assertEquals("woff2", candidate.getWebProgramFormat());
        assertEquals("UERG", candidate.getPdfProgram());
        assertEquals("otf", candidate.getPdfProgramFormat());
        assertEquals("iVBORw0KGgo=", candidate.getPreviewImage());
        assertEquals("{\"ok\":true}", candidate.getDiagnostics());
        assertArrayEquals(new int[] {65, 66, 67}, candidate.getGlyphCoverage());
    }

    @Test
    @DisplayName("builder defaults unset fields to null (and primitive-array field to null)")
    void builder_defaultsUnsetFieldsToNull() {
        PdfJsonFontConversionCandidate candidate =
                PdfJsonFontConversionCandidate.builder().strategyId("only-id").build();

        assertEquals("only-id", candidate.getStrategyId());
        assertNull(candidate.getStrategyLabel());
        assertNull(candidate.getStatus());
        assertNull(candidate.getGlyphCoverage());
    }

    @Test
    @DisplayName("all-args constructor sets every field exactly")
    void allArgsConstructor_setsEveryField() {
        int[] coverage = new int[] {1, 2, 3};
        PdfJsonFontConversionCandidate candidate =
                new PdfJsonFontConversionCandidate(
                        "id",
                        "label",
                        PdfJsonFontConversionStatus.WARNING,
                        "msg",
                        10,
                        2,
                        0.1d,
                        0.2d,
                        "prog",
                        "pf",
                        "web",
                        "wf",
                        "pdf",
                        "pdff",
                        "preview",
                        "diag",
                        coverage);

        assertEquals("id", candidate.getStrategyId());
        assertEquals("label", candidate.getStrategyLabel());
        assertEquals(PdfJsonFontConversionStatus.WARNING, candidate.getStatus());
        assertEquals("msg", candidate.getMessage());
        assertEquals(Integer.valueOf(10), candidate.getSynthesizedGlyphs());
        assertEquals(Integer.valueOf(2), candidate.getMissingGlyphs());
        assertEquals(Double.valueOf(0.1d), candidate.getWidthDelta());
        assertEquals(Double.valueOf(0.2d), candidate.getBboxDelta());
        assertEquals("prog", candidate.getProgram());
        assertEquals("pf", candidate.getProgramFormat());
        assertEquals("web", candidate.getWebProgram());
        assertEquals("wf", candidate.getWebProgramFormat());
        assertEquals("pdf", candidate.getPdfProgram());
        assertEquals("pdff", candidate.getPdfProgramFormat());
        assertEquals("preview", candidate.getPreviewImage());
        assertEquals("diag", candidate.getDiagnostics());
        // The array reference is stored as-is (no defensive copy by Lombok).
        assertSame(coverage, candidate.getGlyphCoverage());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        PdfJsonFontConversionCandidate built = fullyPopulated().build();

        PdfJsonFontConversionCandidate constructed =
                new PdfJsonFontConversionCandidate(
                        "subset-v1",
                        "Subset (v1)",
                        PdfJsonFontConversionStatus.SUCCESS,
                        "Converted cleanly",
                        120,
                        3,
                        0.5d,
                        1.25d,
                        "UFRGRg==",
                        "ttf",
                        "V0VC",
                        "woff2",
                        "UERG",
                        "otf",
                        "iVBORw0KGgo=",
                        "{\"ok\":true}",
                        new int[] {65, 66, 67});

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("setters mutate the Lombok @Data instance")
    void setters_mutateState() {
        PdfJsonFontConversionCandidate candidate = new PdfJsonFontConversionCandidate();

        candidate.setStrategyId("id2");
        candidate.setStrategyLabel("label2");
        candidate.setStatus(PdfJsonFontConversionStatus.FAILURE);
        candidate.setMessage("boom");
        candidate.setSynthesizedGlyphs(0);
        candidate.setMissingGlyphs(42);
        candidate.setWidthDelta(-3.5d);
        candidate.setBboxDelta(9.0d);
        candidate.setProgram("p");
        candidate.setProgramFormat("pf");
        candidate.setWebProgram("w");
        candidate.setWebProgramFormat("wf");
        candidate.setPdfProgram("pd");
        candidate.setPdfProgramFormat("pdf");
        candidate.setPreviewImage("img");
        candidate.setDiagnostics("d");
        int[] coverage = new int[] {9, 8, 7};
        candidate.setGlyphCoverage(coverage);

        assertEquals("id2", candidate.getStrategyId());
        assertEquals("label2", candidate.getStrategyLabel());
        assertEquals(PdfJsonFontConversionStatus.FAILURE, candidate.getStatus());
        assertEquals("boom", candidate.getMessage());
        assertEquals(Integer.valueOf(0), candidate.getSynthesizedGlyphs());
        assertEquals(Integer.valueOf(42), candidate.getMissingGlyphs());
        assertEquals(Double.valueOf(-3.5d), candidate.getWidthDelta());
        assertEquals(Double.valueOf(9.0d), candidate.getBboxDelta());
        assertEquals("p", candidate.getProgram());
        assertEquals("pf", candidate.getProgramFormat());
        assertEquals("w", candidate.getWebProgram());
        assertEquals("wf", candidate.getWebProgramFormat());
        assertEquals("pd", candidate.getPdfProgram());
        assertEquals("pdf", candidate.getPdfProgramFormat());
        assertEquals("img", candidate.getPreviewImage());
        assertEquals("d", candidate.getDiagnostics());
        assertSame(coverage, candidate.getGlyphCoverage());
    }

    @ParameterizedTest
    @EnumSource(PdfJsonFontConversionStatus.class)
    @DisplayName("every status enum value round-trips through the status field")
    void status_roundTripsForEveryEnumValue(PdfJsonFontConversionStatus status) {
        PdfJsonFontConversionCandidate candidate =
                PdfJsonFontConversionCandidate.builder().status(status).build();

        assertEquals(status, candidate.getStatus());
    }

    @Test
    @DisplayName("equals/hashCode use content equality for the int[] glyphCoverage field")
    void equalsAndHashCode_arrayContentSemantics() {
        // Two distinct array instances with identical contents must compare equal,
        // because Lombok uses Arrays.equals / Arrays.hashCode for array fields.
        PdfJsonFontConversionCandidate a =
                PdfJsonFontConversionCandidate.builder()
                        .strategyId("s")
                        .glyphCoverage(new int[] {1, 2, 3})
                        .build();
        PdfJsonFontConversionCandidate b =
                PdfJsonFontConversionCandidate.builder()
                        .strategyId("s")
                        .glyphCoverage(new int[] {1, 2, 3})
                        .build();

        assertNotSame(a.getGlyphCoverage(), b.getGlyphCoverage(), "arrays must be distinct refs");
        assertEquals(a, b, "equal contents -> equal candidates");
        assertEquals(a.hashCode(), b.hashCode(), "equal objects must share a hash code");
    }

    @Test
    @DisplayName("equals distinguishes differing int[] glyphCoverage contents")
    void equals_distinguishesDifferentArrayContents() {
        PdfJsonFontConversionCandidate a =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[] {1, 2, 3}).build();
        PdfJsonFontConversionCandidate differentValue =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[] {1, 2, 4}).build();
        PdfJsonFontConversionCandidate differentLength =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[] {1, 2}).build();

        assertNotEquals(a, differentValue);
        assertNotEquals(a, differentLength);
    }

    @Test
    @DisplayName("equals treats null array distinctly from empty and populated arrays")
    void equals_nullVsEmptyVsPopulatedArray() {
        PdfJsonFontConversionCandidate nullCoverage =
                PdfJsonFontConversionCandidate.builder().build();
        PdfJsonFontConversionCandidate emptyCoverage =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[0]).build();
        PdfJsonFontConversionCandidate populatedCoverage =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[] {0}).build();

        assertNotEquals(nullCoverage, emptyCoverage, "null array != empty array");
        assertNotEquals(emptyCoverage, populatedCoverage, "empty array != single-element array");

        // Two independently-built empty-array instances are equal (content semantics).
        PdfJsonFontConversionCandidate emptyCoverage2 =
                PdfJsonFontConversionCandidate.builder().glyphCoverage(new int[0]).build();
        assertEquals(emptyCoverage, emptyCoverage2);
        assertEquals(emptyCoverage.hashCode(), emptyCoverage2.hashCode());
    }

    @Test
    @DisplayName("equals/hashCode reflect non-array field differences and value equality")
    void equalsAndHashCode_scalarFieldSemantics() {
        PdfJsonFontConversionCandidate a = fullyPopulated().build();
        PdfJsonFontConversionCandidate b = fullyPopulated().build();
        PdfJsonFontConversionCandidate differentStatus =
                fullyPopulated().status(PdfJsonFontConversionStatus.FAILURE).build();
        PdfJsonFontConversionCandidate differentMessage = fullyPopulated().message("other").build();

        assertEquals(a, b, "equal field values must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "equal objects must share a hash code");
        assertNotEquals(a, differentStatus);
        assertNotEquals(a, differentMessage);
    }

    @Test
    @DisplayName("equals contract: reflexive, null-safe, type-safe")
    void equals_contractBasics() {
        PdfJsonFontConversionCandidate a = fullyPopulated().build();

        assertEquals(a, a, "reflexive");
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-candidate");
    }

    @Test
    @DisplayName("toString includes scalar field values")
    void toString_containsFieldValues() {
        PdfJsonFontConversionCandidate candidate =
                PdfJsonFontConversionCandidate.builder()
                        .strategyId("strat-X")
                        .status(PdfJsonFontConversionStatus.SKIPPED)
                        .message("messageY")
                        .glyphCoverage(new int[] {1, 2})
                        .build();

        String text = candidate.toString();

        assertNotNull(text);
        assertTrue(text.contains("strat-X"), () -> "toString should contain strategyId: " + text);
        assertTrue(text.contains("SKIPPED"), () -> "toString should contain status: " + text);
        assertTrue(text.contains("messageY"), () -> "toString should contain message: " + text);
    }

    @Test
    @DisplayName("builder is reusable and produces independent instances")
    void builder_isReusable() {
        PdfJsonFontConversionCandidate.PdfJsonFontConversionCandidateBuilder builder =
                PdfJsonFontConversionCandidate.builder().strategyId("base");

        PdfJsonFontConversionCandidate first =
                builder.status(PdfJsonFontConversionStatus.SUCCESS).build();
        PdfJsonFontConversionCandidate second =
                builder.status(PdfJsonFontConversionStatus.UNSUPPORTED).build();

        assertEquals("base", first.getStrategyId());
        assertEquals("base", second.getStrategyId());
        assertEquals(PdfJsonFontConversionStatus.SUCCESS, first.getStatus());
        assertEquals(PdfJsonFontConversionStatus.UNSUPPORTED, second.getStatus());
        assertNotEquals(first, second);
    }
}
