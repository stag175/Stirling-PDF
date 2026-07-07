package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link InviteToken}.
 *
 * <p>Although InviteToken is a JPA {@code @Entity}, the methods under test ({@code isExpired()} and
 * {@code isValid()}) are pure time/flag logic. We exercise them by setting {@code expiresAt} and
 * {@code used} via the Lombok-generated setters; no persistence, Spring context, or database is
 * required. Time-based assertions use generous offsets (minutes) to avoid clock-granularity
 * flakiness.
 */
class InviteTokenTest {

    @Nested
    @DisplayName("isExpired()")
    class IsExpired {

        @Test
        @DisplayName("returns true when expiresAt is in the past")
        void returnsTrue_whenExpiresAtInPast() {
            InviteToken token = new InviteToken();
            token.setExpiresAt(LocalDateTime.now().minusMinutes(5));

            assertTrue(token.isExpired(), "A token whose expiresAt is in the past must be expired");
        }

        @Test
        @DisplayName("returns false when expiresAt is in the future")
        void returnsFalse_whenExpiresAtInFuture() {
            InviteToken token = new InviteToken();
            token.setExpiresAt(LocalDateTime.now().plusMinutes(5));

            assertFalse(
                    token.isExpired(),
                    "A token whose expiresAt is in the future must not be expired");
        }

        @Test
        @DisplayName(
                "returns false when expiresAt is essentially 'now' (now() is not strictly after it)")
        void returnsFalse_whenExpiresAtIsNow() {
            InviteToken token = new InviteToken();
            // Set expiresAt slightly in the future so that the now() captured inside isExpired()
            // (taken a moment later) is still not strictly after it. isExpired uses
            // now().isAfter(expiresAt), which is exclusive, so the boundary is not "expired".
            token.setExpiresAt(LocalDateTime.now().plusSeconds(30));

            assertFalse(
                    token.isExpired(),
                    "At/just-before the boundary the token is not yet expired (isAfter is"
                            + " exclusive)");
        }

        @Test
        @DisplayName("throws NullPointerException when expiresAt is null")
        void throwsNpe_whenExpiresAtNull() {
            InviteToken token = new InviteToken();
            // expiresAt is never initialized -> LocalDateTime.now().isAfter(null) throws NPE.
            assertThrows(NullPointerException.class, token::isExpired);
        }
    }

    @Nested
    @DisplayName("isValid()")
    class IsValid {

        @Test
        @DisplayName("returns true when not used and not expired")
        void returnsTrue_whenNotUsedAndNotExpired() {
            InviteToken token = new InviteToken();
            token.setUsed(false);
            token.setExpiresAt(LocalDateTime.now().plusMinutes(10));

            assertTrue(token.isValid(), "Fresh, unused, future-dated token must be valid");
        }

        @Test
        @DisplayName("returns false when used even though not expired")
        void returnsFalse_whenUsedButNotExpired() {
            InviteToken token = new InviteToken();
            token.setUsed(true);
            token.setExpiresAt(LocalDateTime.now().plusMinutes(10));

            assertFalse(token.isValid(), "A used token is never valid, regardless of expiry");
        }

        @Test
        @DisplayName("returns false when expired even though not used")
        void returnsFalse_whenExpiredButNotUsed() {
            InviteToken token = new InviteToken();
            token.setUsed(false);
            token.setExpiresAt(LocalDateTime.now().minusMinutes(10));

            assertFalse(token.isValid(), "An expired token is not valid even if unused");
        }

        @Test
        @DisplayName("returns false when both used and expired")
        void returnsFalse_whenUsedAndExpired() {
            InviteToken token = new InviteToken();
            token.setUsed(true);
            token.setExpiresAt(LocalDateTime.now().minusMinutes(10));

            assertFalse(token.isValid(), "A used and expired token is not valid");
        }

        @Test
        @DisplayName("default 'used' is false, so a future-dated fresh token is valid")
        void defaultUsedIsFalse_makesFutureTokenValid() {
            InviteToken token = new InviteToken();
            // Do NOT touch 'used' -> relies on the field default of false.
            token.setExpiresAt(LocalDateTime.now().plusMinutes(10));

            assertTrue(token.isValid(), "Default used=false plus future expiry should be valid");
        }
    }

    @Nested
    @DisplayName("Getters / setters and entity shape")
    class Accessors {

        @Test
        @DisplayName("default boolean 'used' is false on a new instance")
        void usedDefaultsToFalse() {
            assertFalse(new InviteToken().isUsed(), "used should default to false");
        }

        @Test
        @DisplayName("all simple properties round-trip through their accessors")
        void propertiesRoundTrip() {
            InviteToken token = new InviteToken();

            LocalDateTime expires = LocalDateTime.now().plusDays(1);
            LocalDateTime created = LocalDateTime.now().minusDays(1);
            LocalDateTime usedAt = LocalDateTime.now();

            token.setId(42L);
            token.setToken("abc-123");
            token.setEmail("invitee@example.com");
            token.setRole("ROLE_USER");
            token.setTeamId(7L);
            token.setExpiresAt(expires);
            token.setUsed(true);
            token.setCreatedBy("admin@example.com");
            token.setCreatedAt(created);
            token.setUsedAt(usedAt);

            assertAll(
                    () -> assertEquals(42L, token.getId()),
                    () -> assertEquals("abc-123", token.getToken()),
                    () -> assertEquals("invitee@example.com", token.getEmail()),
                    () -> assertEquals("ROLE_USER", token.getRole()),
                    () -> assertEquals(7L, token.getTeamId()),
                    () -> assertEquals(expires, token.getExpiresAt()),
                    () -> assertTrue(token.isUsed()),
                    () -> assertEquals("admin@example.com", token.getCreatedBy()),
                    () -> assertEquals(created, token.getCreatedAt()),
                    () -> assertEquals(usedAt, token.getUsedAt()));
        }

        @Test
        @DisplayName("email is optional and may be left null")
        void emailMayBeNull() {
            InviteToken token = new InviteToken();
            token.setEmail(null);
            assertNull(token.getEmail(), "email is documented as optional / nullable");
        }

        @Test
        @DisplayName("InviteToken is Serializable")
        void isSerializable() {
            assertInstanceOf(Serializable.class, new InviteToken());
        }
    }
}
