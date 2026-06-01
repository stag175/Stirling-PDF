package stirling.software.proprietary.model.api.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link Requisition}, the Python Examiner's "shopping list" record.
 *
 * <p>{@code Requisition} is a plain Java record with no Jackson annotations and no dependencies, so
 * these tests are pure: they exercise the canonical constructor / accessors, the {@code equals}
 * /{@code hashCode}/{@code toString} contract the compiler generates, and — most importantly — every
 * null/empty combination of the three page lists that {@link Requisition#isEmpty()} short-circuits
 * over. A small set of round-trip tests uses a plain Jackson 3 ({@code tools.jackson}) mapper to
 * confirm the record serialises and deserialises with the rest of this module's wire format.
 */
class RequisitionTest {

    // Convenience non-empty lists used across the empty/non-empty matrix.
    private static final List<Integer> PAGES = List.of(0, 1, 2);

    // -------------------------------------------------------------------------
    // Canonical constructor + accessors
    // -------------------------------------------------------------------------

    @Test
    void accessors_returnConstructorValues() {
        List<Integer> text = List.of(1, 2);
        List<Integer> tables = List.of(3);
        List<Integer> ocr = List.of(4, 5, 6);
        Requisition req = new Requisition("requisition", text, tables, ocr, "needs everything");

        assertThat(req.type()).isEqualTo("requisition");
        assertThat(req.needText()).isEqualTo(text);
        assertThat(req.needTables()).isEqualTo(tables);
        assertThat(req.needOcr()).isEqualTo(ocr);
        assertThat(req.rationale()).isEqualTo("needs everything");
    }

    @Test
    void accessors_tolerateAllNullComponents() {
        // The record imposes no non-null constraint on any component.
        Requisition req = new Requisition(null, null, null, null, null);

        assertThat(req.type()).isNull();
        assertThat(req.needText()).isNull();
        assertThat(req.needTables()).isNull();
        assertThat(req.needOcr()).isNull();
        assertThat(req.rationale()).isNull();
    }

    @Test
    void accessors_preserveListContentsAndOrder() {
        List<Integer> ordered = Arrays.asList(9, 0, 5, 5, 2);
        Requisition req = new Requisition("requisition", ordered, List.of(), List.of(), "r");

        // The record stores the reference verbatim (no defensive copy), so order/dupes survive.
        assertThat(req.needText()).containsExactly(9, 0, 5, 5, 2);
    }

    // -------------------------------------------------------------------------
    // isEmpty() — full null/empty/non-empty matrix over the three page lists
    // -------------------------------------------------------------------------

    @Test
    void isEmpty_true_whenAllThreeListsAreNull() {
        assertThat(new Requisition("requisition", null, null, null, "r").isEmpty()).isTrue();
    }

    @Test
    void isEmpty_true_whenAllThreeListsAreEmpty() {
        assertThat(
                        new Requisition(
                                        "requisition",
                                        List.of(),
                                        List.of(),
                                        List.of(),
                                        "r")
                                .isEmpty())
                .isTrue();
    }

    @Test
    void isEmpty_true_whenListsAreMixOfNullAndEmpty() {
        assertThat(new Requisition("requisition", null, List.of(), null, "r").isEmpty()).isTrue();
        assertThat(new Requisition("requisition", List.of(), null, List.of(), "r").isEmpty())
                .isTrue();
    }

    /**
     * Exercises every combination of {needText, needTables, needOcr} where each list is one of:
     * null, empty, or non-empty. {@code isEmpty()} must be {@code true} only when every list is
     * "blank" (null or empty); any single non-empty list flips it to {@code false}. This covers all
     * three short-circuit branches of the {@code &&} chain in both directions.
     */
    @ParameterizedTest(name = "[{index}] text={0}, tables={1}, ocr={2} -> isEmpty={3}")
    @MethodSource("emptyMatrix")
    void isEmpty_matchesExpectedForEveryListCombination(
            List<Integer> text,
            List<Integer> tables,
            List<Integer> ocr,
            boolean expectedEmpty) {
        Requisition req = new Requisition("requisition", text, tables, ocr, "rationale");
        assertThat(req.isEmpty()).isEqualTo(expectedEmpty);
    }

    static List<Arguments> emptyMatrix() {
        List<List<Integer>> states = Arrays.asList(null, List.of(), PAGES);
        List<Arguments> args = new ArrayList<>();
        for (List<Integer> text : states) {
            for (List<Integer> tables : states) {
                for (List<Integer> ocr : states) {
                    boolean expectedEmpty =
                            isBlank(text) && isBlank(tables) && isBlank(ocr);
                    args.add(Arguments.of(text, tables, ocr, expectedEmpty));
                }
            }
        }
        return args;
    }

    private static boolean isBlank(List<Integer> list) {
        return list == null || list.isEmpty();
    }

    @Test
    void isEmpty_false_whenOnlyNeedTextHasEntries() {
        assertThat(new Requisition("requisition", PAGES, null, null, "r").isEmpty()).isFalse();
        assertThat(new Requisition("requisition", PAGES, List.of(), List.of(), "r").isEmpty())
                .isFalse();
    }

    @Test
    void isEmpty_false_whenOnlyNeedTablesHasEntries() {
        assertThat(new Requisition("requisition", null, PAGES, null, "r").isEmpty()).isFalse();
        assertThat(new Requisition("requisition", List.of(), PAGES, List.of(), "r").isEmpty())
                .isFalse();
    }

    @Test
    void isEmpty_false_whenOnlyNeedOcrHasEntries() {
        assertThat(new Requisition("requisition", null, null, PAGES, "r").isEmpty()).isFalse();
        assertThat(new Requisition("requisition", List.of(), List.of(), PAGES, "r").isEmpty())
                .isFalse();
    }

    @Test
    void isEmpty_false_whenAllThreeListsHaveEntries() {
        assertThat(new Requisition("requisition", PAGES, PAGES, PAGES, "r").isEmpty()).isFalse();
    }

    @Test
    void isEmpty_false_whenListContainsSingleZero() {
        // Boundary: a single 0-indexed page entry still counts as non-empty.
        assertThat(new Requisition("requisition", List.of(0), null, null, "r").isEmpty()).isFalse();
    }

    @Test
    void isEmpty_ignoresTypeAndRationale() {
        // Neither the discriminator nor the rationale participates in emptiness.
        assertThat(new Requisition(null, null, null, null, null).isEmpty()).isTrue();
        assertThat(new Requisition("requisition", null, null, null, "non-empty rationale").isEmpty())
                .isTrue();
    }

    @Test
    void isEmpty_true_forSingletonEmptyMutableLists() {
        // Defensive: even a freshly created mutable empty ArrayList reads as blank.
        assertThat(
                        new Requisition(
                                        "requisition",
                                        new ArrayList<>(),
                                        Collections.emptyList(),
                                        new ArrayList<>(),
                                        "r")
                                .isEmpty())
                .isTrue();
    }

    // -------------------------------------------------------------------------
    // equals / hashCode / toString — compiler-generated record contract
    // -------------------------------------------------------------------------

    @Test
    void equals_and_hashCode_holdForEqualValues() {
        Requisition a = new Requisition("requisition", List.of(1), List.of(2), List.of(3), "why");
        Requisition b = new Requisition("requisition", List.of(1), List.of(2), List.of(3), "why");

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_distinguishesDifferingComponents() {
        Requisition base =
                new Requisition("requisition", List.of(1), List.of(2), List.of(3), "why");

        assertThat(base)
                .isNotEqualTo(new Requisition("other", List.of(1), List.of(2), List.of(3), "why"))
                .isNotEqualTo(
                        new Requisition("requisition", List.of(9), List.of(2), List.of(3), "why"))
                .isNotEqualTo(
                        new Requisition("requisition", List.of(1), List.of(9), List.of(3), "why"))
                .isNotEqualTo(
                        new Requisition("requisition", List.of(1), List.of(2), List.of(9), "why"))
                .isNotEqualTo(
                        new Requisition("requisition", List.of(1), List.of(2), List.of(3), "diff"))
                .isNotEqualTo(null)
                .isNotEqualTo("requisition");
    }

    @Test
    void equals_holdsWhenAllComponentsNull() {
        assertThat(new Requisition(null, null, null, null, null))
                .isEqualTo(new Requisition(null, null, null, null, null));
    }

    @Test
    void toString_containsComponentValues() {
        Requisition req =
                new Requisition("requisition", List.of(1), List.of(2), List.of(3), "because");
        String s = req.toString();

        assertThat(s).contains("Requisition");
        assertThat(s).contains("requisition");
        assertThat(s).contains("because");
    }

    // -------------------------------------------------------------------------
    // Jackson 3 (tools.jackson) round-trip — matches the rest of this module
    // -------------------------------------------------------------------------

    @Test
    void jackson_roundTrip_preservesValueEquality() throws Exception {
        JsonMapper mapper = new JsonMapper();
        Requisition original =
                new Requisition(
                        "requisition", List.of(0, 1), List.of(2), List.of(3, 4), "needs all three");

        String json = mapper.writeValueAsString(original);
        Requisition back = mapper.readValue(json, Requisition.class);

        assertThat(back).isEqualTo(original);
    }

    @Test
    void jackson_deserialize_populatesListsAndScalars() throws Exception {
        JsonMapper mapper = new JsonMapper();
        String wire =
                """
                {"type":"requisition","needText":[0,3],"needTables":[],"needOcr":[7],\
                "rationale":"OCR page 7"}""";

        Requisition req = mapper.readValue(wire, Requisition.class);

        assertThat(req.type()).isEqualTo("requisition");
        assertThat(req.needText()).containsExactly(0, 3);
        assertThat(req.needTables()).isEmpty();
        assertThat(req.needOcr()).containsExactly(7);
        assertThat(req.rationale()).isEqualTo("OCR page 7");
        assertThat(req.isEmpty()).isFalse();
    }

    @Test
    void jackson_deserialize_absentListComponentsBecomeNull_andIsEmptyIsTrue() throws Exception {
        // FAIL_ON_NULL_FOR_PRIMITIVES (on by default in Jackson 3) does not apply here: every
        // record component is a reference type, so absent List components deserialise to null
        // rather than throwing.
        JsonMapper mapper = new JsonMapper();
        String wire = "{\"type\":\"requisition\",\"rationale\":\"nothing to fetch\"}";

        Requisition req = mapper.readValue(wire, Requisition.class);

        assertThat(req.type()).isEqualTo("requisition");
        assertThat(req.needText()).isNull();
        assertThat(req.needTables()).isNull();
        assertThat(req.needOcr()).isNull();
        assertThat(req.isEmpty()).isTrue();
    }

    @Test
    void jackson_deserialize_ignoresUnknownProperties() throws Exception {
        // FAIL_ON_UNKNOWN_PROPERTIES is off by default in Jackson 3, so a future engine field is
        // silently dropped instead of failing the parse.
        JsonMapper mapper = new JsonMapper();
        String wire =
                """
                {"type":"requisition","needText":[1],"needTables":[],"needOcr":[],\
                "rationale":"r","futureEngineField":"ignored"}""";

        Requisition req = mapper.readValue(wire, Requisition.class);

        assertThat(req.needText()).containsExactly(1);
        assertThat(req.isEmpty()).isFalse();
    }
}
