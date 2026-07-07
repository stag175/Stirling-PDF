package stirling.software.proprietary.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Unit tests for {@link AuditEventType}, focusing on the {@code fromString(String)} resolution
 * logic: exact {@code valueOf} match, the case-insensitive name/description fallback, and the
 * null/unknown return paths.
 */
class AuditEventTypeTest {

    // --- Enum structure invariants -----------------------------------------------------------

    @Test
    @DisplayName("All declared event types have a non-null, non-blank description")
    void allEventTypes_haveDescriptions() {
        for (AuditEventType type : AuditEventType.values()) {
            assertNotNull(type.getDescription(), type.name() + " should have a description");
            assertEquals(
                    type.getDescription().trim(),
                    type.getDescription(),
                    type.name() + " description should not have surrounding whitespace");
            assertEquals(
                    false,
                    type.getDescription().isEmpty(),
                    type.name() + " description should not be empty");
        }
    }

    @Test
    @DisplayName("getDescription returns the exact configured text for representative constants")
    void getDescription_returnsExactConfiguredText() {
        assertEquals("User login", AuditEventType.USER_LOGIN.getDescription());
        assertEquals("Failed login attempt", AuditEventType.USER_FAILED_LOGIN.getDescription());
        assertEquals("HTTP request", AuditEventType.HTTP_REQUEST.getDescription());
    }

    // --- fromString: exact valueOf match -----------------------------------------------------

    @ParameterizedTest
    @EnumSource(AuditEventType.class)
    @DisplayName("fromString resolves every exact enum name back to the same constant")
    void fromString_exactName_returnsSameConstant(AuditEventType type) {
        assertSame(type, AuditEventType.fromString(type.name()));
    }

    @Test
    @DisplayName("fromString with exact name takes the fast valueOf path")
    void fromString_exactName_specificConstant() {
        assertSame(AuditEventType.SETTINGS_CHANGED, AuditEventType.fromString("SETTINGS_CHANGED"));
    }

    // --- fromString: case-insensitive name fallback ------------------------------------------

    @ParameterizedTest
    @CsvSource({
        "user_login, USER_LOGIN",
        "User_Login, USER_LOGIN",
        "uSeR_lOgOuT, USER_LOGOUT",
        "http_request, HTTP_REQUEST",
        "pdf_process, PDF_PROCESS",
    })
    @DisplayName("fromString matches enum names case-insensitively via the fallback loop")
    void fromString_caseInsensitiveName_resolves(String input, AuditEventType expected) {
        assertSame(expected, AuditEventType.fromString(input));
    }

    // --- fromString: case-insensitive description fallback ------------------------------------

    @ParameterizedTest
    @CsvSource({
        "User login, USER_LOGIN",
        "user login, USER_LOGIN",
        "USER LOGOUT, USER_LOGOUT",
        "Failed login attempt, USER_FAILED_LOGIN",
        "HTTP request, HTTP_REQUEST",
        "File operation, FILE_OPERATION",
    })
    @DisplayName("fromString matches descriptions case-insensitively via the fallback loop")
    void fromString_caseInsensitiveDescription_resolves(String input, AuditEventType expected) {
        assertSame(expected, AuditEventType.fromString(input));
    }

    @Test
    @DisplayName("fromString matches a description exactly as configured")
    void fromString_exactDescription_resolves() {
        assertSame(
                AuditEventType.PDF_PROCESS, AuditEventType.fromString("PDF processing operation"));
    }

    // --- fromString: null handling -----------------------------------------------------------

    @Test
    @DisplayName("fromString returns null for a null argument without throwing")
    void fromString_null_returnsNull() {
        assertNull(AuditEventType.fromString(null));
    }

    // --- fromString: unknown / non-matching inputs -------------------------------------------

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "   ",
                "NOT_A_REAL_EVENT",
                "USER_LOGINS",
                "User login ", // trailing space prevents description match
                " User login", // leading space prevents description match
                "login",
                "Failed login", // partial description, not equal
                "12345",
            })
    @DisplayName("fromString returns null for empty, blank, partial, or unknown inputs")
    void fromString_unknown_returnsNull(String input) {
        assertNull(AuditEventType.fromString(input));
    }

    @Test
    @DisplayName("fromString does not trim or partial-match: surrounding whitespace yields null")
    void fromString_whitespacePaddedName_returnsNull() {
        assertNull(AuditEventType.fromString("  USER_LOGIN  "));
    }

    @Test
    @DisplayName("fromString returns null when no name or description matches")
    void fromString_completelyUnrelated_returnsNull() {
        assertNull(AuditEventType.fromString("definitely-not-an-audit-event"));
    }

    // --- fromString: name match takes precedence and is deterministic ------------------------

    @Test
    @DisplayName("fromString is deterministic: repeated calls return the identical constant")
    void fromString_isDeterministic() {
        AuditEventType first = AuditEventType.fromString("user_login");
        AuditEventType second = AuditEventType.fromString("USER LOGIN");
        assertSame(AuditEventType.USER_LOGIN, first);
        assertSame(first, second);
    }
}
