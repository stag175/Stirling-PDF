package stirling.software.common.model.enumeration;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Locale;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("Tests for InvitationStatus")
class InvitationStatusTest {

    @Nested
    @DisplayName("statusName property")
    class StatusNameTests {

        @ParameterizedTest(name = "{0} should expose statusName \"{1}\"")
        @CsvSource({
            "PENDING, PENDING",
            "ACCEPTED, ACCEPTED",
            "REJECTED, REJECTED",
            "CANCELLED, CANCELLED",
            "EXPIRED, EXPIRED"
        })
        @DisplayName("getStatusName should return the expected backing string for each constant")
        void getStatusNameReturnsExpectedValue(InvitationStatus status, String expectedName) {
            assertEquals(expectedName, status.getStatusName());
        }

        @ParameterizedTest
        @EnumSource(InvitationStatus.class)
        @DisplayName("getStatusName should equal the enum constant name for every status")
        void getStatusNameMatchesEnumName(InvitationStatus status) {
            assertEquals(status.name(), status.getStatusName());
        }

        @ParameterizedTest
        @EnumSource(InvitationStatus.class)
        @DisplayName("getStatusName should never be null for any status")
        void getStatusNameIsNeverNull(InvitationStatus status) {
            assertNotNull(status.getStatusName());
        }
    }

    @Nested
    @DisplayName("fromString lookup")
    class FromStringTests {

        @ParameterizedTest
        @EnumSource(InvitationStatus.class)
        @DisplayName("should resolve every status from its exact statusName")
        void resolvesEveryStatusFromExactName(InvitationStatus status) {
            assertSame(status, InvitationStatus.fromString(status.getStatusName()));
        }

        @ParameterizedTest
        @EnumSource(InvitationStatus.class)
        @DisplayName("should resolve every status from a fully lowercased name")
        void resolvesEveryStatusFromLowercaseName(InvitationStatus status) {
            String lower = status.getStatusName().toLowerCase(Locale.ROOT);
            assertSame(status, InvitationStatus.fromString(lower));
        }

        @ParameterizedTest
        @CsvSource({
            "Pending, PENDING",
            "aCcEpTeD, ACCEPTED",
            "rejected, REJECTED",
            "CANCELLED, CANCELLED",
            "ExPiReD, EXPIRED"
        })
        @DisplayName("should perform a case-insensitive lookup")
        void resolvesCaseInsensitively(String input, InvitationStatus expected) {
            assertSame(expected, InvitationStatus.fromString(input));
        }

        @Test
        @DisplayName("should return the same singleton instance as valueOf for a known name")
        void returnsSameInstanceAsValueOf() {
            assertSame(
                    InvitationStatus.PENDING,
                    InvitationStatus.fromString("PENDING"),
                    "fromString must return the existing enum singleton, not a copy");
        }

        @ParameterizedTest
        @ValueSource(strings = {"UNKNOWN", "PENDIN", "PENDING ", " PENDING", "accept", "123", "P"})
        @DisplayName("should throw IllegalArgumentException for unmatched names")
        void throwsForUnknownName(String input) {
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> InvitationStatus.fromString(input));
            assertEquals("No InvitationStatus defined for name: " + input, ex.getMessage());
        }

        @Test
        @DisplayName("should throw IllegalArgumentException for an empty string")
        void throwsForEmptyString() {
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class, () -> InvitationStatus.fromString(""));
            assertEquals("No InvitationStatus defined for name: ", ex.getMessage());
        }

        @Test
        @DisplayName("should throw IllegalArgumentException for a null name")
        void throwsForNull() {
            // equalsIgnoreCase(null) returns false for every constant, so no match is found
            // and the loop falls through to the exception path.
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> InvitationStatus.fromString(null));
            assertEquals("No InvitationStatus defined for name: null", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("enum invariants")
    class EnumInvariantsTests {

        @Test
        @DisplayName("should declare exactly the five known statuses")
        void declaresExactlyFiveStatuses() {
            assertEquals(5, InvitationStatus.values().length);
        }

        @Test
        @DisplayName("valueOf should resolve each declared constant by exact name")
        void valueOfResolvesDeclaredConstants() {
            assertSame(InvitationStatus.PENDING, InvitationStatus.valueOf("PENDING"));
            assertSame(InvitationStatus.ACCEPTED, InvitationStatus.valueOf("ACCEPTED"));
            assertSame(InvitationStatus.REJECTED, InvitationStatus.valueOf("REJECTED"));
            assertSame(InvitationStatus.CANCELLED, InvitationStatus.valueOf("CANCELLED"));
            assertSame(InvitationStatus.EXPIRED, InvitationStatus.valueOf("EXPIRED"));
        }

        @Test
        @DisplayName("valueOf should be case-sensitive, unlike fromString")
        void valueOfIsCaseSensitive() {
            assertThrows(IllegalArgumentException.class, () -> InvitationStatus.valueOf("pending"));
        }
    }
}
