package stirling.software.common.model.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.exception.UnsupportedClaimException;

@DisplayName("Tests for KeycloakProvider")
class KeycloakProviderTest {

    private static KeycloakProvider provider(
            String issuer,
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            UsernameAttribute useAsUsername) {
        return new KeycloakProvider(issuer, clientId, clientSecret, scopes, useAsUsername);
    }

    @Nested
    @DisplayName("Fixed name and clientName")
    class NameTests {

        @Test
        @DisplayName("getName should always return the keycloak constant")
        void getNameReturnsKeycloak() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertEquals("keycloak", p.getName());
        }

        @Test
        @DisplayName("getClientName should always return Keycloak")
        void getClientNameReturnsKeycloak() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertEquals("Keycloak", p.getClientName());
        }

        @Test
        @DisplayName("No-args constructor still reports fixed name and clientName")
        void noArgsConstructorReportsFixedNames() {
            KeycloakProvider p = new KeycloakProvider();

            assertEquals("keycloak", p.getName());
            assertEquals("Keycloak", p.getClientName());
        }
    }

    @Nested
    @DisplayName("Constructor wiring and inherited state")
    class ConstructorTests {

        @Test
        @DisplayName("Should propagate issuer, clientId and clientSecret to the parent")
        void shouldPropagateCoreFields() {
            KeycloakProvider p =
                    provider(
                            "https://keycloak.example/realm",
                            "my-client",
                            "my-secret",
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            assertEquals("https://keycloak.example/realm", p.getIssuer());
            assertEquals("my-client", p.getClientId());
            assertEquals("my-secret", p.getClientSecret());
        }

        @Test
        @DisplayName("Should leave authorization, token and userInfo URIs null")
        void shouldLeaveOptionalUrisNull() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertNull(p.getAuthorizationUri());
            assertNull(p.getTokenUri());
            assertNull(p.getUserInfoUri());
        }

        @Test
        @DisplayName("Should accept null issuer, clientId and clientSecret")
        void shouldAcceptNullCoreFields() {
            KeycloakProvider p = provider(null, null, null, null, UsernameAttribute.EMAIL);

            assertNull(p.getIssuer());
            assertNull(p.getClientId());
            assertNull(p.getClientSecret());
        }

        @Test
        @DisplayName("Null useAsUsername should default to EMAIL")
        void nullUseAsUsernameDefaultsToEmail() {
            KeycloakProvider p = provider("https://issuer", "client", "secret", null, null);

            assertEquals(UsernameAttribute.EMAIL, p.getUseAsUsername());
        }
    }

    @Nested
    @DisplayName("getScopes default behaviour")
    class ScopesTests {

        @Test
        @DisplayName("Null scopes should default to profile and email")
        void nullScopesDefaultsToProfileAndEmail() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertEquals(List.of("profile", "email"), p.getScopes());
        }

        @Test
        @DisplayName("Empty scopes should default to profile and email")
        void emptyScopesDefaultsToProfileAndEmail() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            "secret",
                            new ArrayList<>(),
                            UsernameAttribute.EMAIL);

            assertEquals(List.of("profile", "email"), p.getScopes());
        }

        @Test
        @DisplayName("Non-empty scopes should be returned unchanged")
        void nonEmptyScopesReturnedUnchanged() {
            Collection<String> scopes = List.of("openid", "roles");
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", scopes, UsernameAttribute.EMAIL);

            assertEquals(List.of("openid", "roles"), p.getScopes());
        }

        @Test
        @DisplayName("Single custom scope should not trigger the profile/email default")
        void singleCustomScopeNotOverridden() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            "secret",
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            assertEquals(List.of("openid"), p.getScopes());
        }

        @Test
        @DisplayName("setScopes(String) should override the default with parsed, trimmed values")
        void setScopesStringOverridesDefault() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            p.setScopes(" openid , roles ,profile ");

            assertEquals(List.of("openid", "roles", "profile"), p.getScopes());
        }

        @Test
        @DisplayName("setScopes(null) should leave scopes defaulting to profile/email")
        void setScopesNullKeepsDefault() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            p.setScopes((String) null);

            assertEquals(List.of("profile", "email"), p.getScopes());
        }

        @Test
        @DisplayName("setScopes(blank) should leave scopes defaulting to profile/email")
        void setScopesBlankKeepsDefault() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            p.setScopes("   ");

            assertEquals(List.of("profile", "email"), p.getScopes());
        }
    }

    @Nested
    @DisplayName("toString secret masking")
    class ToStringTests {

        @Test
        @DisplayName("Should mask a non-blank client secret with asterisks")
        void shouldMaskNonBlankSecret() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            "topsecret",
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            String result = p.toString();

            assertTrue(result.contains("clientSecret=*****"), result);
            assertFalse(result.contains("topsecret"), result);
        }

        @Test
        @DisplayName("Should render NULL for a null client secret")
        void shouldRenderNullForNullSecret() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            null,
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            assertTrue(p.toString().contains("clientSecret=NULL"), p.toString());
        }

        @Test
        @DisplayName("Should render NULL for an empty client secret")
        void shouldRenderNullForEmptySecret() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            "",
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            assertTrue(p.toString().contains("clientSecret=NULL"), p.toString());
        }

        @Test
        @DisplayName("Should render NULL for a blank (whitespace-only) client secret")
        void shouldRenderNullForBlankSecret() {
            KeycloakProvider p =
                    provider(
                            "https://issuer",
                            "client",
                            "   ",
                            List.of("openid"),
                            UsernameAttribute.EMAIL);

            assertTrue(p.toString().contains("clientSecret=NULL"), p.toString());
        }

        @Test
        @DisplayName("Should include issuer, label, scopes and useAsUsername")
        void shouldIncludeIssuerLabelScopesAndUsername() {
            KeycloakProvider p =
                    provider(
                            "https://keycloak.example",
                            "client",
                            "secret",
                            List.of("openid"),
                            UsernameAttribute.PREFERRED_USERNAME);

            String result = p.toString();

            assertTrue(result.startsWith("Keycloak ["), result);
            assertTrue(result.contains("issuer=https://keycloak.example"), result);
            assertTrue(result.contains("scopes=[openid]"), result);
            assertTrue(
                    result.contains("useAsUsername=" + UsernameAttribute.PREFERRED_USERNAME),
                    result);
        }

        @Test
        @DisplayName("toString should reflect the profile/email default when no scopes are set")
        void toStringReflectsDefaultScopes() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertTrue(p.toString().contains("scopes=[profile, email]"), p.toString());
        }
    }

    @Nested
    @DisplayName("useAsUsername validation for keycloak")
    class UsernameValidationTests {

        @ParameterizedTest(name = "{0} should be accepted")
        @EnumSource(
                value = UsernameAttribute.class,
                names = {"EMAIL", "NAME", "GIVEN_NAME", "FAMILY_NAME", "PREFERRED_USERNAME"})
        @DisplayName("Supported claims should be stored as-is")
        void supportedClaimsAccepted(UsernameAttribute attribute) {
            KeycloakProvider p = provider("https://issuer", "client", "secret", null, attribute);

            assertEquals(attribute, p.getUseAsUsername());
        }

        @ParameterizedTest(name = "{0} should be rejected")
        @EnumSource(
                value = UsernameAttribute.class,
                names = {"EMAIL", "NAME", "GIVEN_NAME", "FAMILY_NAME", "PREFERRED_USERNAME"},
                mode = EnumSource.Mode.EXCLUDE)
        @DisplayName("Unsupported claims should throw UnsupportedClaimException")
        void unsupportedClaimsRejected(UsernameAttribute attribute) {
            assertThrows(
                    UnsupportedClaimException.class,
                    () -> provider("https://issuer", "client", "secret", null, attribute));
        }

        @Test
        @DisplayName("Exception message should name the offending attribute and the client name")
        void exceptionMessageIncludesAttributeAndClientName() {
            UnsupportedClaimException ex =
                    assertThrows(
                            UnsupportedClaimException.class,
                            () ->
                                    provider(
                                            "https://issuer",
                                            "client",
                                            "secret",
                                            null,
                                            UsernameAttribute.LOGIN));

            assertEquals(
                    String.format(
                            stirling.software.common.model.oauth2.Provider.EXCEPTION_MESSAGE,
                            UsernameAttribute.LOGIN,
                            "Keycloak"),
                    ex.getMessage());
        }
    }

    @Nested
    @DisplayName("Inheritance contract")
    class InheritanceTests {

        @Test
        @DisplayName("KeycloakProvider should be a Provider")
        void shouldBeAProvider() {
            KeycloakProvider p =
                    provider("https://issuer", "client", "secret", null, UsernameAttribute.EMAIL);

            assertInstanceOf(Provider.class, p);
        }

        @ParameterizedTest(name = "issuer \"{0}\" should round-trip")
        @ValueSource(strings = {"https://a", "https://b/realm/master", "issuer-without-scheme"})
        @DisplayName("getIssuer should return the value supplied at construction")
        void issuerRoundTrips(String issuer) {
            KeycloakProvider p =
                    provider(issuer, "client", "secret", null, UsernameAttribute.EMAIL);

            assertEquals(issuer, p.getIssuer());
        }
    }
}
