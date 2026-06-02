package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.AuthenticationType;

/**
 * Pure unit tests for {@link SaveUserRequest}.
 *
 * <p>{@code SaveUserRequest} is a Lombok {@code @Builder}/{@code @Getter} value object with several
 * {@code @Builder.Default} fields. These tests pin down two contracts:
 *
 * <ul>
 *   <li>Building with only the mandatory-style {@code username} yields all documented defaults
 *       (authenticationType {@code WEB}, role {@code ROLE_USER}, enabled {@code true}, and the rest
 *       {@code null}/{@code false}).
 *   <li>Each builder setter overrides exactly its corresponding default and nothing else.
 * </ul>
 *
 * <p>No Spring context, mocking, IO or database is required: the class is a plain in-memory POJO and
 * {@link Team} is instantiated directly via its public no-arg constructor.
 */
class SaveUserRequestTest {

    /** {@code Role.USER.getRoleId()} is the documented default for {@code role}. */
    private static final String DEFAULT_ROLE = Role.USER.getRoleId();

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("building with only username applies every documented @Builder.Default")
        void buildWithOnlyUsername_appliesAllDefaults() {
            SaveUserRequest request = SaveUserRequest.builder().username("alice").build();

            assertEquals("alice", request.getUsername(), "username should be the value supplied");
            assertNull(request.getPassword(), "password default is null");
            assertNull(request.getSsoProviderId(), "ssoProviderId default is null");
            assertNull(request.getSsoProvider(), "ssoProvider default is null");
            assertEquals(
                    AuthenticationType.WEB,
                    request.getAuthenticationType(),
                    "authenticationType default is WEB");
            assertNull(request.getTeamId(), "teamId default is null");
            assertNull(request.getTeam(), "team default is null");
            assertEquals(DEFAULT_ROLE, request.getRole(), "role default is Role.USER's roleId");
            assertEquals("ROLE_USER", request.getRole(), "Role.USER roleId is the literal ROLE_USER");
            assertFalse(request.isFirstLogin(), "firstLogin default is false");
            assertTrue(request.isEnabled(), "enabled default is true");
            assertFalse(request.isRequireMfa(), "requireMfa default is false");
            assertFalse(request.isMfaEnabled(), "mfaEnabled default is false");
            assertNull(request.getMfaSecret(), "mfaSecret default is null");
            assertNull(request.getMfaLastUsedStep(), "mfaLastUsedStep default is null");
        }

        @Test
        @DisplayName("an entirely empty builder still applies defaults and leaves username null")
        void buildWithNoFields_appliesDefaultsAndNullUsername() {
            // username has no @Builder.Default, so it stays null (object reference, not primitive).
            SaveUserRequest request = SaveUserRequest.builder().build();

            assertNull(request.getUsername(), "username has no default and should be null");
            assertEquals(
                    AuthenticationType.WEB,
                    request.getAuthenticationType(),
                    "authenticationType default still applied when builder is otherwise empty");
            assertEquals(DEFAULT_ROLE, request.getRole(), "role default still applied");
            assertTrue(request.isEnabled(), "enabled default still true");
        }
    }

    @Nested
    @DisplayName("overrides")
    class Overrides {

        @Test
        @DisplayName("every field can be overridden independently of its default")
        void allFieldsOverridden_replaceDefaults() {
            Team team = new Team();
            team.setName("engineering");

            SaveUserRequest request =
                    SaveUserRequest.builder()
                            .username("bob")
                            .password("s3cr3t")
                            .ssoProviderId("provider-123")
                            .ssoProvider("okta")
                            .authenticationType(AuthenticationType.OAUTH2)
                            .teamId(42L)
                            .team(team)
                            .role(Role.ADMIN.getRoleId())
                            .firstLogin(true)
                            .enabled(false)
                            .requireMfa(true)
                            .mfaEnabled(true)
                            .mfaSecret("BASE32SECRET")
                            .mfaLastUsedStep(7L)
                            .build();

            assertEquals("bob", request.getUsername());
            assertEquals("s3cr3t", request.getPassword());
            assertEquals("provider-123", request.getSsoProviderId());
            assertEquals("okta", request.getSsoProvider());
            assertEquals(AuthenticationType.OAUTH2, request.getAuthenticationType());
            assertEquals(42L, request.getTeamId());
            assertSame(team, request.getTeam(), "team reference should be stored as-is");
            assertEquals(Role.ADMIN.getRoleId(), request.getRole());
            assertEquals("ROLE_ADMIN", request.getRole());
            assertTrue(request.isFirstLogin());
            assertFalse(request.isEnabled(), "enabled override of false must win over default true");
            assertTrue(request.isRequireMfa());
            assertTrue(request.isMfaEnabled());
            assertEquals("BASE32SECRET", request.getMfaSecret());
            assertEquals(7L, request.getMfaLastUsedStep());
        }

        @Test
        @DisplayName("overriding a single field leaves the other defaults untouched")
        void singleOverride_doesNotDisturbOtherDefaults() {
            SaveUserRequest request =
                    SaveUserRequest.builder().username("carol").enabled(false).build();

            assertFalse(request.isEnabled(), "enabled was explicitly overridden to false");
            // Everything else must remain at its documented default.
            assertEquals("carol", request.getUsername());
            assertNull(request.getPassword());
            assertEquals(AuthenticationType.WEB, request.getAuthenticationType());
            assertEquals(DEFAULT_ROLE, request.getRole());
            assertFalse(request.isFirstLogin());
            assertFalse(request.isRequireMfa());
            assertFalse(request.isMfaEnabled());
            assertNull(request.getTeam());
            assertNull(request.getTeamId());
        }

        @Test
        @DisplayName("explicitly setting a defaulted reference field back to null overrides the default")
        void explicitNullOverridesNonNullDefault() {
            // authenticationType defaults to WEB; explicitly building with null must override it.
            SaveUserRequest request =
                    SaveUserRequest.builder()
                            .username("dave")
                            .authenticationType(null)
                            .role(null)
                            .build();

            assertNull(
                    request.getAuthenticationType(),
                    "explicit null must override the WEB @Builder.Default");
            assertNull(request.getRole(), "explicit null must override the ROLE_USER @Builder.Default");
        }

        @Test
        @DisplayName("boolean true values supplied for fields whose default is false are retained")
        void booleanDefaultsCanBeFlippedTrue() {
            SaveUserRequest request =
                    SaveUserRequest.builder()
                            .username("erin")
                            .firstLogin(true)
                            .requireMfa(true)
                            .mfaEnabled(true)
                            .build();

            assertTrue(request.isFirstLogin());
            assertTrue(request.isRequireMfa());
            assertTrue(request.isMfaEnabled());
            // enabled default (true) is independent and must be unaffected.
            assertTrue(request.isEnabled());
        }

        @ParameterizedTest(name = "authenticationType override = {0}")
        @EnumSource(AuthenticationType.class)
        @DisplayName("authenticationType accepts every enum constant as an override")
        void authenticationTypeAcceptsEveryEnumConstant(AuthenticationType type) {
            SaveUserRequest request =
                    SaveUserRequest.builder().username("frank").authenticationType(type).build();

            assertEquals(type, request.getAuthenticationType());
        }
    }

    @Nested
    @DisplayName("builder behavior")
    class BuilderBehavior {

        @Test
        @DisplayName("builder() returns a fresh, non-null builder instance each call")
        void builderFactoryReturnsFreshInstances() {
            SaveUserRequest.Builder first = SaveUserRequest.builder();
            SaveUserRequest.Builder second = SaveUserRequest.builder();

            assertNotNull(first, "builder() must not return null");
            assertNotNull(second, "builder() must not return null");
            assertNotSame(first, second, "each builder() call should produce a distinct builder");
        }

        @Test
        @DisplayName("last write wins when the same field is set twice on one builder")
        void repeatedSetterCalls_lastWriteWins() {
            SaveUserRequest request =
                    SaveUserRequest.builder()
                            .username("first")
                            .username("second")
                            .role("ROLE_ADMIN")
                            .role("ROLE_USER")
                            .build();

            assertEquals("second", request.getUsername(), "later username setter should win");
            assertEquals("ROLE_USER", request.getRole(), "later role setter should win");
        }

        @Test
        @DisplayName("two builds from independently configured builders are isolated")
        void independentBuilders_doNotShareState() {
            SaveUserRequest enabledUser =
                    SaveUserRequest.builder().username("u1").enabled(true).build();
            SaveUserRequest disabledUser =
                    SaveUserRequest.builder().username("u2").enabled(false).build();

            assertTrue(enabledUser.isEnabled());
            assertFalse(disabledUser.isEnabled());
            assertEquals("u1", enabledUser.getUsername());
            assertEquals("u2", disabledUser.getUsername());
        }
    }
}
