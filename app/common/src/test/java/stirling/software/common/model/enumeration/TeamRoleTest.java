package stirling.software.common.model.enumeration;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("Tests for TeamRole")
class TeamRoleTest {

    @Nested
    @DisplayName("Enum constants and roleName")
    class ConstantsTests {

        @Test
        @DisplayName("Should declare exactly LEADER and MEMBER in order")
        void shouldDeclareExpectedConstants() {
            TeamRole[] values = TeamRole.values();

            assertEquals(2, values.length, "TeamRole should declare exactly two constants");
            assertEquals(TeamRole.LEADER, values[0], "LEADER should be the first constant");
            assertEquals(TeamRole.MEMBER, values[1], "MEMBER should be the second constant");
        }

        @Test
        @DisplayName("Should expose roleName equal to the constant name")
        void shouldExposeRoleName() {
            assertEquals("LEADER", TeamRole.LEADER.getRoleName());
            assertEquals("MEMBER", TeamRole.MEMBER.getRoleName());
        }

        @ParameterizedTest(name = "{0} roleName matches enum name()")
        @EnumSource(TeamRole.class)
        @DisplayName("Every constant's roleName should equal its name()")
        void roleNameShouldMatchEnumName(TeamRole role) {
            assertEquals(
                    role.name(),
                    role.getRoleName(),
                    "roleName should be identical to the enum constant name");
        }
    }

    @Nested
    @DisplayName("fromString - matching names")
    class FromStringMatchingTests {

        @Test
        @DisplayName("Should resolve an exact uppercase name")
        void shouldResolveExactName() {
            assertSame(TeamRole.LEADER, TeamRole.fromString("LEADER"));
            assertSame(TeamRole.MEMBER, TeamRole.fromString("MEMBER"));
        }

        @ParameterizedTest(name = "fromString(\"{0}\") -> {1}")
        @CsvSource({
            "LEADER, LEADER",
            "leader, LEADER",
            "Leader, LEADER",
            "lEaDeR, LEADER",
            "MEMBER, MEMBER",
            "member, MEMBER",
            "Member, MEMBER",
            "mEmBeR, MEMBER"
        })
        @DisplayName("Should match case-insensitively")
        void shouldMatchCaseInsensitively(String input, TeamRole expected) {
            assertSame(expected, TeamRole.fromString(input));
        }

        @ParameterizedTest(name = "round-trip {0}")
        @EnumSource(TeamRole.class)
        @DisplayName("getRoleName output should round-trip back through fromString")
        void shouldRoundTripThroughRoleName(TeamRole role) {
            assertSame(role, TeamRole.fromString(role.getRoleName()));
        }
    }

    @Nested
    @DisplayName("fromString - unknown and invalid inputs")
    class FromStringInvalidTests {

        @ParameterizedTest(name = "fromString(\"{0}\") throws")
        @ValueSource(
                strings = {
                    "ADMIN", "OWNER", "GUEST", "", " ", "LEADER ", " LEADER", "LEAD", "MEMBERS"
                })
        @DisplayName("Should throw IllegalArgumentException for unknown or non-trimmed names")
        void shouldThrowForUnknownName(String input) {
            assertThrows(IllegalArgumentException.class, () -> TeamRole.fromString(input));
        }

        @Test
        @DisplayName("Should throw IllegalArgumentException for null input")
        void shouldThrowForNullInput() {
            // equalsIgnoreCase(null) returns false for every constant, so no match is found
            // and the method falls through to the IllegalArgumentException.
            assertThrows(IllegalArgumentException.class, () -> TeamRole.fromString(null));
        }

        @Test
        @DisplayName("Exception message should include the offending name")
        void shouldIncludeNameInExceptionMessage() {
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> TeamRole.fromString("SUPERVISOR"));

            assertEquals("No TeamRole defined for name: SUPERVISOR", ex.getMessage());
        }

        @Test
        @DisplayName("Exception message should render null when name is null")
        void shouldRenderNullInExceptionMessage() {
            IllegalArgumentException ex =
                    assertThrows(IllegalArgumentException.class, () -> TeamRole.fromString(null));

            assertEquals("No TeamRole defined for name: null", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("Standard enum semantics")
    class EnumSemanticsTests {

        @Test
        @DisplayName("valueOf should resolve the declared constants")
        void valueOfShouldResolveConstants() {
            assertSame(TeamRole.LEADER, TeamRole.valueOf("LEADER"));
            assertSame(TeamRole.MEMBER, TeamRole.valueOf("MEMBER"));
        }

        @Test
        @DisplayName("valueOf is case-sensitive unlike fromString")
        void valueOfShouldBeCaseSensitive() {
            assertThrows(IllegalArgumentException.class, () -> TeamRole.valueOf("leader"));
        }
    }
}
