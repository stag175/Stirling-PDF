package stirling.software.SPDF.model.api;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class PdfJsonConversionProgressTest {

    @Test
    @DisplayName("of(percent, stage, message) sets fields and defaults complete=false")
    void of_threeArg_setsFieldsAndDefaults() {
        PdfJsonConversionProgress progress =
                PdfJsonConversionProgress.of(42, "rendering", "Rendering pages");

        assertEquals(42, progress.getPercent());
        assertEquals("rendering", progress.getStage());
        assertEquals("Rendering pages", progress.getMessage());
        assertFalse(progress.isComplete(), "3-arg of(...) must default complete to false");
        // current/total are not set by the 3-arg overload, so they stay null (Integer wrapper).
        assertNull(progress.getCurrent());
        assertNull(progress.getTotal());
    }

    @Test
    @DisplayName("of(percent, stage, message, current, total) sets all fields and complete=false")
    void of_fiveArg_setsAllFields() {
        PdfJsonConversionProgress progress =
                PdfJsonConversionProgress.of(67, "extracting", "Extracting page 3", 3, 9);

        assertEquals(67, progress.getPercent());
        assertEquals("extracting", progress.getStage());
        assertEquals("Extracting page 3", progress.getMessage());
        assertFalse(progress.isComplete(), "5-arg of(...) must default complete to false");
        assertEquals(Integer.valueOf(3), progress.getCurrent());
        assertEquals(Integer.valueOf(9), progress.getTotal());
    }

    @Test
    @DisplayName("complete() builds the canonical completion progress")
    void complete_buildsCanonicalDoneState() {
        PdfJsonConversionProgress progress = PdfJsonConversionProgress.complete();

        assertEquals(100, progress.getPercent());
        assertEquals("complete", progress.getStage());
        assertEquals("Conversion complete", progress.getMessage());
        assertTrue(progress.isComplete(), "complete() must mark progress complete");
        // complete() does not populate current/total.
        assertNull(progress.getCurrent());
        assertNull(progress.getTotal());
    }

    @Test
    @DisplayName("of(...) accepts null stage and message without throwing")
    void of_threeArg_acceptsNulls() {
        PdfJsonConversionProgress progress = PdfJsonConversionProgress.of(0, null, null);

        assertEquals(0, progress.getPercent());
        assertNull(progress.getStage());
        assertNull(progress.getMessage());
        assertFalse(progress.isComplete());
    }

    @Test
    @DisplayName("of(...) preserves empty-string stage and message")
    void of_fiveArg_preservesEmptyStrings() {
        PdfJsonConversionProgress progress = PdfJsonConversionProgress.of(0, "", "", 0, 0);

        assertEquals("", progress.getStage());
        assertEquals("", progress.getMessage());
        assertEquals(Integer.valueOf(0), progress.getCurrent());
        assertEquals(Integer.valueOf(0), progress.getTotal());
    }

    @ParameterizedTest(name = "of(...) preserves boundary/out-of-range percent {0}")
    @ValueSource(ints = {Integer.MIN_VALUE, -1, 0, 50, 100, 101, Integer.MAX_VALUE})
    @DisplayName("of(...) does not clamp the percent value")
    void of_doesNotClampPercent(int percent) {
        PdfJsonConversionProgress progress = PdfJsonConversionProgress.of(percent, "s", "m");

        assertEquals(percent, progress.getPercent());
    }

    @ParameterizedTest(name = "of(percent={0},current={1},total={2})")
    @CsvSource({
        "0, 0, 0",
        "25, 1, 4",
        "100, 10, 10",
        "-5, -1, -1",
    })
    @DisplayName("five-arg of(...) round-trips current/total including negatives")
    void of_fiveArg_roundTripsCurrentTotal(int percent, int current, int total) {
        PdfJsonConversionProgress progress =
                PdfJsonConversionProgress.of(percent, "stage", "message", current, total);

        assertEquals(percent, progress.getPercent());
        assertEquals(Integer.valueOf(current), progress.getCurrent());
        assertEquals(Integer.valueOf(total), progress.getTotal());
    }

    @Test
    @DisplayName("no-args constructor yields default primitive/wrapper values")
    void noArgsConstructor_defaults() {
        PdfJsonConversionProgress progress = new PdfJsonConversionProgress();

        assertEquals(0, progress.getPercent());
        assertNull(progress.getStage());
        assertNull(progress.getMessage());
        assertFalse(progress.isComplete());
        assertNull(progress.getCurrent());
        assertNull(progress.getTotal());
    }

    @Test
    @DisplayName("all-args constructor sets every field exactly")
    void allArgsConstructor_setsEveryField() {
        PdfJsonConversionProgress progress =
                new PdfJsonConversionProgress(80, "stage", "msg", true, 4, 5);

        assertEquals(80, progress.getPercent());
        assertEquals("stage", progress.getStage());
        assertEquals("msg", progress.getMessage());
        assertTrue(progress.isComplete());
        assertEquals(Integer.valueOf(4), progress.getCurrent());
        assertEquals(Integer.valueOf(5), progress.getTotal());
    }

    @Test
    @DisplayName("builder produces the same state as the all-args constructor")
    void builder_matchesAllArgsConstructor() {
        PdfJsonConversionProgress built =
                PdfJsonConversionProgress.builder()
                        .percent(80)
                        .stage("stage")
                        .message("msg")
                        .complete(true)
                        .current(4)
                        .total(5)
                        .build();

        PdfJsonConversionProgress constructed =
                new PdfJsonConversionProgress(80, "stage", "msg", true, 4, 5);

        assertEquals(constructed, built);
        assertEquals(constructed.hashCode(), built.hashCode());
    }

    @Test
    @DisplayName("setters mutate the Lombok @Data instance")
    void setters_mutateState() {
        PdfJsonConversionProgress progress = new PdfJsonConversionProgress();

        progress.setPercent(33);
        progress.setStage("loading");
        progress.setMessage("Loading document");
        progress.setComplete(true);
        progress.setCurrent(2);
        progress.setTotal(6);

        assertEquals(33, progress.getPercent());
        assertEquals("loading", progress.getStage());
        assertEquals("Loading document", progress.getMessage());
        assertTrue(progress.isComplete());
        assertEquals(Integer.valueOf(2), progress.getCurrent());
        assertEquals(Integer.valueOf(6), progress.getTotal());
    }

    @Test
    @DisplayName("equals/hashCode reflect value equality and field differences")
    void equalsAndHashCode_valueSemantics() {
        PdfJsonConversionProgress a = PdfJsonConversionProgress.of(10, "s", "m");
        PdfJsonConversionProgress b = PdfJsonConversionProgress.of(10, "s", "m");
        PdfJsonConversionProgress differentPercent = PdfJsonConversionProgress.of(11, "s", "m");

        assertEquals(a, b, "Equal field values must be equal");
        assertEquals(a.hashCode(), b.hashCode(), "Equal objects must share a hash code");

        assertNotEquals(a, differentPercent);
        assertNotEquals(a, null);
        assertNotEquals(a, "not-a-progress");
        assertEquals(a, a, "reflexive");
    }

    @Test
    @DisplayName("complete() and of(...) produce non-equal instances")
    void completeNotEqualToOf() {
        PdfJsonConversionProgress complete = PdfJsonConversionProgress.complete();
        PdfJsonConversionProgress notComplete =
                PdfJsonConversionProgress.of(100, "complete", "Conversion complete");

        // Same percent/stage/message but complete flag differs.
        assertNotEquals(complete, notComplete);
        assertTrue(complete.isComplete());
        assertFalse(notComplete.isComplete());
    }

    @Test
    @DisplayName("toString includes the field values")
    void toString_containsFieldValues() {
        PdfJsonConversionProgress progress =
                PdfJsonConversionProgress.of(55, "stageX", "messageY", 2, 7);

        String text = progress.toString();

        assertNotNull(text);
        assertTrue(text.contains("55"), () -> "toString should contain percent: " + text);
        assertTrue(text.contains("stageX"), () -> "toString should contain stage: " + text);
        assertTrue(text.contains("messageY"), () -> "toString should contain message: " + text);
    }
}
