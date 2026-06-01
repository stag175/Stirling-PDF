package stirling.software.proprietary.audit;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Unit tests for {@link AuditLevel}.
 *
 * <p>Covers the integer level mapping, the {@link AuditLevel#includes(AuditLevel)} ordering
 * comparison, and {@link AuditLevel#fromInt(int)} including its Math.min/Math.max bounds clamping
 * and the STANDARD default fallback. Pure unit test: no Spring context, no collaborators.
 */
class AuditLevelTest {

    @Nested
    @DisplayName("level values and enum shape")
    class LevelValues {

        @Test
        @DisplayName("each constant exposes its documented integer level")
        void getLevel_returnsExpectedValue() {
            assertAll(
                    () -> assertEquals(0, AuditLevel.OFF.getLevel(), "OFF should be level 0"),
                    () -> assertEquals(1, AuditLevel.BASIC.getLevel(), "BASIC should be level 1"),
                    () ->
                            assertEquals(
                                    2,
                                    AuditLevel.STANDARD.getLevel(),
                                    "STANDARD should be level 2"),
                    () ->
                            assertEquals(
                                    3, AuditLevel.VERBOSE.getLevel(), "VERBOSE should be level 3"));
        }

        @Test
        @DisplayName("declares exactly four constants in ascending level order")
        void values_areOrderedAscending() {
            AuditLevel[] values = AuditLevel.values();

            assertEquals(4, values.length, "Exactly four audit levels are expected");
            assertAll(
                    () -> assertSame(AuditLevel.OFF, values[0]),
                    () -> assertSame(AuditLevel.BASIC, values[1]),
                    () -> assertSame(AuditLevel.STANDARD, values[2]),
                    () -> assertSame(AuditLevel.VERBOSE, values[3]));

            // Ordinal must line up with the integer level for this enum.
            for (AuditLevel level : values) {
                assertEquals(
                        level.ordinal(),
                        level.getLevel(),
                        "ordinal and level must match for " + level.name());
            }
        }

        @Test
        @DisplayName("valueOf resolves constant names")
        void valueOf_resolvesByName() {
            assertSame(AuditLevel.STANDARD, AuditLevel.valueOf("STANDARD"));
        }

        @Test
        @DisplayName("valueOf throws for an unknown name")
        void valueOf_throwsForUnknownName() {
            assertThrows(IllegalArgumentException.class, () -> AuditLevel.valueOf("NOPE"));
        }
    }

    @Nested
    @DisplayName("includes(AuditLevel)")
    class Includes {

        @Test
        @DisplayName("a level always includes itself (reflexive, >= comparison)")
        void includes_isReflexive() {
            for (AuditLevel level : AuditLevel.values()) {
                assertTrue(
                        level.includes(level),
                        level.name() + " should include itself (level >= level)");
            }
        }

        @Test
        @DisplayName("a higher level includes every lower level")
        void higherLevelIncludesLowerLevels() {
            assertAll(
                    () -> assertTrue(AuditLevel.VERBOSE.includes(AuditLevel.STANDARD)),
                    () -> assertTrue(AuditLevel.VERBOSE.includes(AuditLevel.BASIC)),
                    () -> assertTrue(AuditLevel.VERBOSE.includes(AuditLevel.OFF)),
                    () -> assertTrue(AuditLevel.STANDARD.includes(AuditLevel.BASIC)),
                    () -> assertTrue(AuditLevel.STANDARD.includes(AuditLevel.OFF)),
                    () -> assertTrue(AuditLevel.BASIC.includes(AuditLevel.OFF)));
        }

        @Test
        @DisplayName("a lower level does not include a higher level")
        void lowerLevelDoesNotIncludeHigherLevels() {
            assertAll(
                    () -> assertFalse(AuditLevel.OFF.includes(AuditLevel.BASIC)),
                    () -> assertFalse(AuditLevel.OFF.includes(AuditLevel.STANDARD)),
                    () -> assertFalse(AuditLevel.OFF.includes(AuditLevel.VERBOSE)),
                    () -> assertFalse(AuditLevel.BASIC.includes(AuditLevel.STANDARD)),
                    () -> assertFalse(AuditLevel.BASIC.includes(AuditLevel.VERBOSE)),
                    () -> assertFalse(AuditLevel.STANDARD.includes(AuditLevel.VERBOSE)));
        }

        @ParameterizedTest(name = "{0}.includes({1}) == {2}")
        @MethodSource("stirling.software.proprietary.audit.AuditLevelTest#includesCombinations")
        @DisplayName("matrix: includes() matches level >= otherLevel for every pair")
        void includes_matchesNumericComparison(
                AuditLevel left, AuditLevel right, boolean expected) {
            assertEquals(
                    expected,
                    left.includes(right),
                    () -> left.name() + ".includes(" + right.name() + ") should be " + expected);
            // Cross-check against the raw integer semantics the method documents.
            assertEquals(
                    left.getLevel() >= right.getLevel(),
                    left.includes(right),
                    "includes() must agree with level >= otherLevel");
        }

        @Test
        @DisplayName("includes(null) throws NullPointerException (otherLevel.level dereference)")
        void includes_nullArgument_throwsNpe() {
            assertThrows(NullPointerException.class, () -> AuditLevel.STANDARD.includes(null));
        }
    }

    @Nested
    @DisplayName("fromInt(int)")
    class FromInt {

        @ParameterizedTest(name = "fromInt({0}) == {1}")
        @CsvSource({
            "0, OFF",
            "1, BASIC",
            "2, STANDARD",
            "3, VERBOSE",
        })
        @DisplayName("maps each in-range integer to the matching constant")
        void fromInt_mapsInRangeValues(int input, AuditLevel expected) {
            assertSame(expected, AuditLevel.fromInt(input));
        }

        @Test
        @DisplayName("clamps values below 0 up to OFF (Math.max lower bound)")
        void fromInt_clampsNegativeToOff() {
            assertAll(
                    () -> assertSame(AuditLevel.OFF, AuditLevel.fromInt(-1)),
                    () -> assertSame(AuditLevel.OFF, AuditLevel.fromInt(-100)),
                    () -> assertSame(AuditLevel.OFF, AuditLevel.fromInt(Integer.MIN_VALUE)));
        }

        @Test
        @DisplayName("clamps values above 3 down to VERBOSE (Math.min upper bound)")
        void fromInt_clampsTooLargeToVerbose() {
            assertAll(
                    () -> assertSame(AuditLevel.VERBOSE, AuditLevel.fromInt(4)),
                    () -> assertSame(AuditLevel.VERBOSE, AuditLevel.fromInt(99)),
                    () -> assertSame(AuditLevel.VERBOSE, AuditLevel.fromInt(Integer.MAX_VALUE)));
        }

        @ParameterizedTest(name = "fromInt({0}) clamps to {1}")
        @CsvSource({
            "-2147483648, OFF",
            "-2, OFF",
            "-1, OFF",
            "0, OFF",
            "1, BASIC",
            "2, STANDARD",
            "3, VERBOSE",
            "4, VERBOSE",
            "1000, VERBOSE",
            "2147483647, VERBOSE",
        })
        @DisplayName("boundary clamping matrix across the full int spectrum")
        void fromInt_clampingMatrix(int input, AuditLevel expected) {
            assertSame(expected, AuditLevel.fromInt(input));
        }

        @Test
        @DisplayName("round-trips: fromInt(level.getLevel()) returns the same constant")
        void fromInt_roundTripsWithGetLevel() {
            for (AuditLevel level : AuditLevel.values()) {
                assertSame(
                        level,
                        AuditLevel.fromInt(level.getLevel()),
                        "fromInt should round-trip " + level.name());
            }
        }

        @ParameterizedTest
        @EnumSource(AuditLevel.class)
        @DisplayName("every constant round-trips through its integer level")
        void fromInt_roundTripsForEveryConstant(AuditLevel level) {
            assertSame(level, AuditLevel.fromInt(level.getLevel()));
        }
    }

    /** Provides the full left/right/expected matrix for includes() pairwise comparison. */
    static Stream<Arguments> includesCombinations() {
        Stream.Builder<Arguments> builder = Stream.builder();
        for (AuditLevel left : AuditLevel.values()) {
            for (AuditLevel right : AuditLevel.values()) {
                builder.add(Arguments.of(left, right, left.getLevel() >= right.getLevel()));
            }
        }
        return builder.build();
    }
}
