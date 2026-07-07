package stirling.software.common.model.enumeration;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Tests for Role enum")
class RoleTest {

    @Test
    @DisplayName("each constant exposes its configured roleId, limits and roleName")
    void constantsExposeConfiguredValues() {
        assertEquals("ROLE_ADMIN", Role.ADMIN.getRoleId());
        assertEquals(Integer.MAX_VALUE, Role.ADMIN.getApiCallsPerDay());
        assertEquals(Integer.MAX_VALUE, Role.ADMIN.getWebCallsPerDay());
        assertEquals("adminUserSettings.admin", Role.ADMIN.getRoleName());

        assertEquals("ROLE_LIMITED_API_USER", Role.LIMITED_API_USER.getRoleId());
        assertEquals(40, Role.LIMITED_API_USER.getApiCallsPerDay());
        assertEquals(40, Role.LIMITED_API_USER.getWebCallsPerDay());
        assertEquals("adminUserSettings.apiUser", Role.LIMITED_API_USER.getRoleName());

        assertEquals("ROLE_EXTRA_LIMITED_API_USER", Role.EXTRA_LIMITED_API_USER.getRoleId());
        assertEquals(20, Role.EXTRA_LIMITED_API_USER.getApiCallsPerDay());
        assertEquals(20, Role.EXTRA_LIMITED_API_USER.getWebCallsPerDay());

        assertEquals("ROLE_WEB_ONLY_USER", Role.WEB_ONLY_USER.getRoleId());
        assertEquals(0, Role.WEB_ONLY_USER.getApiCallsPerDay());
        assertEquals(20, Role.WEB_ONLY_USER.getWebCallsPerDay());

        assertEquals("STIRLING-PDF-BACKEND-API-USER", Role.INTERNAL_API_USER.getRoleId());
        assertEquals(Integer.MAX_VALUE, Role.INTERNAL_API_USER.getApiCallsPerDay());
        assertEquals(Integer.MAX_VALUE, Role.INTERNAL_API_USER.getWebCallsPerDay());

        assertEquals("ROLE_DEMO_USER", Role.DEMO_USER.getRoleId());
        assertEquals(100, Role.DEMO_USER.getApiCallsPerDay());
        assertEquals(100, Role.DEMO_USER.getWebCallsPerDay());

        assertEquals("ROLE_PRO_USER", Role.PRO_USER.getRoleId());
        assertEquals("adminUserSettings.proUser", Role.PRO_USER.getRoleName());
    }

    @Test
    @DisplayName("the enum declares exactly the expected eight constants in order")
    void enumDeclaresExpectedConstants() {
        Role[] values = Role.values();

        assertEquals(8, values.length);
        assertArrayEquals(
                new Role[] {
                    Role.ADMIN,
                    Role.USER,
                    Role.PRO_USER,
                    Role.LIMITED_API_USER,
                    Role.EXTRA_LIMITED_API_USER,
                    Role.WEB_ONLY_USER,
                    Role.INTERNAL_API_USER,
                    Role.DEMO_USER
                },
                values);
    }

    @Test
    @DisplayName("fromString resolves an exact roleId to its constant")
    void fromStringResolvesExactMatch() {
        assertSame(Role.ADMIN, Role.fromString("ROLE_ADMIN"));
        assertSame(Role.USER, Role.fromString("ROLE_USER"));
        assertSame(Role.INTERNAL_API_USER, Role.fromString("STIRLING-PDF-BACKEND-API-USER"));
        assertSame(Role.DEMO_USER, Role.fromString("ROLE_DEMO_USER"));
    }

    @Test
    @DisplayName("fromString is case-insensitive")
    void fromStringIsCaseInsensitive() {
        assertSame(Role.ADMIN, Role.fromString("role_admin"));
        assertSame(Role.ADMIN, Role.fromString("Role_Admin"));
        assertSame(Role.ADMIN, Role.fromString("RoLe_AdMiN"));
        assertSame(Role.INTERNAL_API_USER, Role.fromString("stirling-pdf-backend-api-user"));
    }

    @Test
    @DisplayName("fromString resolves every constant's own roleId back to itself")
    void fromStringRoundTripsEveryConstant() {
        for (Role role : Role.values()) {
            assertSame(
                    role,
                    Role.fromString(role.getRoleId()),
                    "roleId should round-trip to the same constant: " + role);
        }
    }

    @Test
    @DisplayName("fromString throws IllegalArgumentException for an unknown id")
    void fromStringThrowsForUnknownId() {
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> Role.fromString("ROLE_DOES_NOT_EXIST"));
        assertEquals("No Role defined for id: ROLE_DOES_NOT_EXIST", exception.getMessage());
    }

    @Test
    @DisplayName("fromString throws IllegalArgumentException for an empty string")
    void fromStringThrowsForEmptyString() {
        IllegalArgumentException exception =
                assertThrows(IllegalArgumentException.class, () -> Role.fromString(""));
        assertEquals("No Role defined for id: ", exception.getMessage());
    }

    @Test
    @DisplayName("fromString throws IllegalArgumentException for a null id")
    void fromStringThrowsForNullId() {
        // equalsIgnoreCase is invoked on the constant's non-null roleId with a null argument,
        // which returns false for every constant, so the loop completes without a match and the
        // method throws IllegalArgumentException (not an NPE) for null input.
        IllegalArgumentException exception =
                assertThrows(IllegalArgumentException.class, () -> Role.fromString(null));
        assertEquals("No Role defined for id: null", exception.getMessage());
    }

    @Test
    @DisplayName("getRoleNameByRoleId returns the roleName for a known id")
    void getRoleNameByRoleIdReturnsRoleName() {
        assertEquals("adminUserSettings.admin", Role.getRoleNameByRoleId("ROLE_ADMIN"));
        assertEquals("adminUserSettings.user", Role.getRoleNameByRoleId("ROLE_USER"));
        assertEquals(
                "adminUserSettings.internalApiUser",
                Role.getRoleNameByRoleId("STIRLING-PDF-BACKEND-API-USER"));
    }

    @Test
    @DisplayName("getRoleNameByRoleId is case-insensitive")
    void getRoleNameByRoleIdIsCaseInsensitive() {
        assertEquals("adminUserSettings.admin", Role.getRoleNameByRoleId("role_admin"));
    }

    @Test
    @DisplayName("getRoleNameByRoleId propagates IllegalArgumentException for an unknown id")
    void getRoleNameByRoleIdThrowsForUnknownId() {
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> Role.getRoleNameByRoleId("ROLE_UNKNOWN"));
        assertEquals("No Role defined for id: ROLE_UNKNOWN", exception.getMessage());
    }

    @Test
    @DisplayName("getAllRoleDetails maps every roleId to its roleName")
    void getAllRoleDetailsContainsAllConstants() {
        Map<String, String> details = Role.getAllRoleDetails();

        assertEquals(Role.values().length, details.size());
        for (Role role : Role.values()) {
            assertTrue(
                    details.containsKey(role.getRoleId()),
                    "details should contain key for " + role);
            assertEquals(role.getRoleName(), details.get(role.getRoleId()));
        }
    }

    @Test
    @DisplayName("getAllRoleDetails preserves declaration order of the constants")
    void getAllRoleDetailsPreservesDeclarationOrder() {
        Map<String, String> details = Role.getAllRoleDetails();

        List<String> expectedOrder = new ArrayList<>();
        for (Role role : Role.values()) {
            expectedOrder.add(role.getRoleId());
        }

        assertEquals(expectedOrder, new ArrayList<>(details.keySet()));
    }

    @Test
    @DisplayName("getAllRoleDetails returns a fresh, independently mutable map on each call")
    void getAllRoleDetailsReturnsFreshMap() {
        Map<String, String> first = Role.getAllRoleDetails();
        Map<String, String> second = Role.getAllRoleDetails();

        assertNotSame(first, second);

        first.clear();
        assertTrue(first.isEmpty());
        assertEquals(Role.values().length, second.size());
        assertEquals(Role.values().length, Role.getAllRoleDetails().size());
    }
}
