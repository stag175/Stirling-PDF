package stirling.software.proprietary.model.api.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link Verdict}, the Auditor's terminal opinion record.
 *
 * <p>The interesting logic is {@link Verdict#errorCount()} and {@link Verdict#warningCount()}, which
 * stream over the discrepancies list filtering by {@link AuditSeverity} and treat a {@code null}
 * list as an empty one. The remaining surface is the record's generated accessors / equals /
 * hashCode plus Jackson round-tripping.
 *
 * <p>The Jackson section uses a plain Jackson 3 ({@code tools.jackson}) {@link JsonMapper} with
 * {@code FAIL_ON_NULL_FOR_PRIMITIVES} disabled to mirror the app's Spring config
 * ({@code spring.jackson.deserialization.fail-on-null-for-primitives=false}); the record has the
 * primitive components {@code roundsTaken} (int) and {@code clean} (boolean) which Jackson 3 would
 * otherwise reject when absent/null. No Spring context, no IO.
 */
class VerdictTest {

    // Mirror the app's mapper config: Jackson 3 enables FAIL_ON_NULL_FOR_PRIMITIVES by default, so a
    // raw mapper would reject the absent/null primitive components (roundsTaken, clean).
    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    private static AuditDiscrepancy discrepancy(AuditSeverity severity) {
        return new AuditDiscrepancy(
                0, DiscrepancyKind.ARITHMETIC, severity, "desc", "stated", "expected", "context");
    }

    private static Verdict verdictWith(List<AuditDiscrepancy> discrepancies) {
        return new Verdict(
                "verdict",
                "session-1",
                discrepancies,
                List.of(0, 1, 2),
                2,
                "summary",
                false,
                List.of());
    }

    // -------------------------------------------------------------------------
    // Accessors — the record exposes exactly the components it was built with
    // -------------------------------------------------------------------------

    @Test
    void accessors_returnConstructorValues() {
        List<AuditDiscrepancy> discrepancies = List.of(discrepancy(AuditSeverity.ERROR));
        List<Integer> pages = List.of(0, 3, 5);
        List<Integer> unauditable = List.of(7, 9);

        Verdict verdict =
                new Verdict(
                        "verdict",
                        "sess-42",
                        discrepancies,
                        pages,
                        3,
                        "All checks done.",
                        false,
                        unauditable);

        assertEquals("verdict", verdict.type());
        assertEquals("sess-42", verdict.sessionId());
        assertEquals(discrepancies, verdict.discrepancies());
        assertEquals(pages, verdict.pagesExamined());
        assertEquals(3, verdict.roundsTaken());
        assertEquals("All checks done.", verdict.summary());
        assertFalse(verdict.clean());
        assertEquals(unauditable, verdict.unauditablePages());
    }

    @Test
    void accessors_tolerateNullReferenceComponents() {
        Verdict verdict = new Verdict(null, null, null, null, 0, null, true, null);

        assertNull(verdict.type());
        assertNull(verdict.sessionId());
        assertNull(verdict.discrepancies());
        assertNull(verdict.pagesExamined());
        assertEquals(0, verdict.roundsTaken());
        assertNull(verdict.summary());
        assertTrue(verdict.clean());
        assertNull(verdict.unauditablePages());
    }

    // -------------------------------------------------------------------------
    // errorCount() — counts only ERROR-severity discrepancies
    // -------------------------------------------------------------------------

    @Test
    void errorCount_nullDiscrepancies_returnsZero() {
        assertEquals(0L, verdictWith(null).errorCount());
    }

    @Test
    void errorCount_emptyList_returnsZero() {
        assertEquals(0L, verdictWith(List.of()).errorCount());
    }

    @Test
    void errorCount_onlyErrors_countsAll() {
        List<AuditDiscrepancy> discrepancies =
                List.of(
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.ERROR));

        assertEquals(3L, verdictWith(discrepancies).errorCount());
    }

    @Test
    void errorCount_onlyWarnings_returnsZero() {
        List<AuditDiscrepancy> discrepancies =
                List.of(discrepancy(AuditSeverity.WARNING), discrepancy(AuditSeverity.WARNING));

        assertEquals(0L, verdictWith(discrepancies).errorCount());
    }

    @Test
    void errorCount_mixedSeverities_countsOnlyErrors() {
        List<AuditDiscrepancy> discrepancies =
                List.of(
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.WARNING));

        assertEquals(2L, verdictWith(discrepancies).errorCount());
    }

    // -------------------------------------------------------------------------
    // warningCount() — counts only WARNING-severity discrepancies
    // -------------------------------------------------------------------------

    @Test
    void warningCount_nullDiscrepancies_returnsZero() {
        assertEquals(0L, verdictWith(null).warningCount());
    }

    @Test
    void warningCount_emptyList_returnsZero() {
        assertEquals(0L, verdictWith(List.of()).warningCount());
    }

    @Test
    void warningCount_onlyWarnings_countsAll() {
        List<AuditDiscrepancy> discrepancies =
                List.of(
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.WARNING));

        assertEquals(4L, verdictWith(discrepancies).warningCount());
    }

    @Test
    void warningCount_onlyErrors_returnsZero() {
        List<AuditDiscrepancy> discrepancies =
                List.of(discrepancy(AuditSeverity.ERROR), discrepancy(AuditSeverity.ERROR));

        assertEquals(0L, verdictWith(discrepancies).warningCount());
    }

    @Test
    void warningCount_mixedSeverities_countsOnlyWarnings() {
        List<AuditDiscrepancy> discrepancies =
                List.of(
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.WARNING));

        assertEquals(3L, verdictWith(discrepancies).warningCount());
    }

    @Test
    void errorAndWarningCounts_partitionMixedList_andSumToTotal() {
        List<AuditDiscrepancy> discrepancies =
                List.of(
                        discrepancy(AuditSeverity.ERROR),
                        discrepancy(AuditSeverity.WARNING),
                        discrepancy(AuditSeverity.ERROR));
        Verdict verdict = verdictWith(discrepancies);

        assertEquals(2L, verdict.errorCount());
        assertEquals(1L, verdict.warningCount());
        assertEquals(discrepancies.size(), verdict.errorCount() + verdict.warningCount());
    }

    // -------------------------------------------------------------------------
    // equals / hashCode — generated record semantics
    // -------------------------------------------------------------------------

    @Test
    void equalsAndHashCode_matchForEqualComponents() {
        Verdict a = verdictWith(List.of(discrepancy(AuditSeverity.ERROR)));
        Verdict b = verdictWith(List.of(discrepancy(AuditSeverity.ERROR)));

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void equals_differsWhenCleanFlagDiffers() {
        Verdict notClean =
                new Verdict(
                        "verdict", "s", List.of(), List.of(), 1, "summary", false, List.of());
        Verdict clean =
                new Verdict("verdict", "s", List.of(), List.of(), 1, "summary", true, List.of());

        assertFalse(notClean.equals(clean));
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) — serialization keeps enum wire values + round-trips
    // -------------------------------------------------------------------------

    @Test
    void serialize_emitsLowercaseSeverityAndKindWireValues() {
        Verdict verdict =
                new Verdict(
                        "verdict",
                        "sess-json",
                        List.of(discrepancy(AuditSeverity.ERROR)),
                        List.of(0, 1),
                        2,
                        "summary",
                        false,
                        List.of(3));

        JsonNode json = objectMapper.valueToTree(verdict);

        assertEquals("verdict", json.get("type").asText());
        assertEquals("sess-json", json.get("sessionId").asText());
        assertEquals(2, json.get("roundsTaken").asInt());
        assertFalse(json.get("clean").asBoolean());
        // @JsonValue on the enums lowercases the wire form.
        JsonNode discrepancy = json.get("discrepancies").get(0);
        assertEquals("error", discrepancy.get("severity").asText());
        assertEquals("arithmetic", discrepancy.get("kind").asText());
        assertEquals(0, json.get("pagesExamined").get(0).asInt());
        assertEquals(3, json.get("unauditablePages").get(0).asInt());
    }

    @Test
    void roundTrip_preservesValueEqualityAndDerivedCounts() throws Exception {
        Verdict original =
                new Verdict(
                        "verdict",
                        "sess-rt",
                        List.of(
                                discrepancy(AuditSeverity.ERROR),
                                discrepancy(AuditSeverity.WARNING),
                                discrepancy(AuditSeverity.ERROR)),
                        List.of(0, 1, 2),
                        3,
                        "Found discrepancies.",
                        false,
                        List.of(4, 5));

        String json = objectMapper.writeValueAsString(original);
        Verdict back = objectMapper.readValue(json, Verdict.class);

        assertEquals(original, back);
        assertEquals(2L, back.errorCount());
        assertEquals(1L, back.warningCount());
    }

    @Test
    void deserialize_missingPrimitiveComponents_defaultToZeroAndFalse() throws Exception {
        // Only the discriminator is supplied; absent int -> 0, absent boolean -> false (because
        // FAIL_ON_NULL_FOR_PRIMITIVES is disabled, mirroring the app config). Absent reference
        // components remain null.
        String wire = "{\"type\":\"verdict\"}";

        Verdict verdict = objectMapper.readValue(wire, Verdict.class);

        assertEquals("verdict", verdict.type());
        assertNull(verdict.sessionId());
        assertNull(verdict.discrepancies());
        assertNull(verdict.pagesExamined());
        assertEquals(0, verdict.roundsTaken());
        assertNull(verdict.summary());
        assertFalse(verdict.clean());
        assertNull(verdict.unauditablePages());
        // errorCount()/warningCount() must survive a null discrepancies list after deserialization.
        assertEquals(0L, verdict.errorCount());
        assertEquals(0L, verdict.warningCount());
    }

    @Test
    void deserialize_explicitNullDiscrepancies_countsAreZero() throws Exception {
        String wire =
                "{\"type\":\"verdict\",\"sessionId\":\"s\",\"discrepancies\":null,"
                        + "\"roundsTaken\":1,\"clean\":true}";

        Verdict verdict = objectMapper.readValue(wire, Verdict.class);

        assertNull(verdict.discrepancies());
        assertTrue(verdict.clean());
        assertEquals(0L, verdict.errorCount());
        assertEquals(0L, verdict.warningCount());
    }

    @Test
    void countMethods_workOnMutableBackingList() {
        // The record does not defensively copy; counts reflect whatever list instance is held.
        List<AuditDiscrepancy> mutable = new ArrayList<>();
        mutable.add(discrepancy(AuditSeverity.ERROR));
        Verdict verdict = verdictWith(mutable);

        assertEquals(1L, verdict.errorCount());
        assertEquals(0L, verdict.warningCount());
    }
}
