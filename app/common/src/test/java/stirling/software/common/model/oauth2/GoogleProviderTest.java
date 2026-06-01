package stirling.software.common.model.oauth2;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.exception.UnsupportedClaimException;

@DisplayName("Tests for GoogleProvider")
class GoogleProviderTest {

    private static final String AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URI = "https://www.googleapis.com/oauth2/v4/token";
    private static final String USER_INFO_URI =
            "https://www.googleapis.com/oauth2/v3/userinfo?alt=json";
    private static final String DEFAULT_EMAIL_SCOPE =
            "https://www.googleapis.com/auth/userinfo.email";
    private static final String DEFAULT_PROFILE_SCOPE =
            "https://www.googleapis.com/auth/userinfo.profile";

    private GoogleProvider newProvider(Collection<String> scopes) {
        return new GoogleProvider("clientId", "clientSecret", scopes, UsernameAttribute.EMAIL);
    }

    @Test
    @DisplayName("fixed name and client name are hardcoded constants")
    void exposesFixedNameAndClientName() {
        GoogleProvider provider = newProvider(List.of("scope"));

        assertAll(
                () -> assertEquals("google", provider.getName()),
                () -> assertEquals("Google", provider.getClientName()));
    }

    @Test
    @DisplayName("authorization, token and userinfo URIs are fixed Google endpoints")
    void exposesFixedUris() {
        GoogleProvider provider = newProvider(List.of("scope"));

        assertAll(
                () -> assertEquals(AUTHORIZATION_URI, provider.getAuthorizationUri()),
                () -> assertEquals(TOKEN_URI, provider.getTokenUri()),
                () -> assertEquals(USER_INFO_URI, provider.getUserinfoUri()));
    }

    @Test
    @DisplayName("the overridden getters match the URIs stored on the parent Provider")
    void overriddenUriGettersMatchParentState() {
        GoogleProvider provider = newProvider(List.of("scope"));

        assertAll(
                () -> assertEquals(AUTHORIZATION_URI, provider.getAuthorizationUri()),
                () -> assertEquals(TOKEN_URI, provider.getTokenUri()),
                // Parent stores the user info URI under the userInfoUri property.
                () -> assertEquals(USER_INFO_URI, provider.getUserInfoUri()),
                () -> assertEquals(USER_INFO_URI, provider.getUserinfoUri()));
    }

    @Test
    @DisplayName("getScopes injects the default email and profile scopes when null is supplied")
    void injectsDefaultScopesWhenNull() {
        // The parent constructor converts a null scope collection into an empty list,
        // and getScopes() then substitutes the Google defaults.
        GoogleProvider provider = newProvider(null);

        assertIterableEquals(
                List.of(DEFAULT_EMAIL_SCOPE, DEFAULT_PROFILE_SCOPE), provider.getScopes());
    }

    @Test
    @DisplayName("getScopes injects the default scopes when an empty collection is supplied")
    void injectsDefaultScopesWhenEmpty() {
        GoogleProvider provider = newProvider(new ArrayList<>());

        Collection<String> scopes = provider.getScopes();

        assertAll(
                () -> assertEquals(2, scopes.size()),
                () -> assertTrue(scopes.contains(DEFAULT_EMAIL_SCOPE)),
                () -> assertTrue(scopes.contains(DEFAULT_PROFILE_SCOPE)));
    }

    @Test
    @DisplayName("getScopes preserves the supplied scopes when they are non-empty")
    void preservesSuppliedScopes() {
        Collection<String> supplied = List.of("openid", "custom-scope");

        GoogleProvider provider = newProvider(supplied);

        Collection<String> scopes = provider.getScopes();

        assertAll(
                () -> assertIterableEquals(supplied, scopes),
                () -> assertFalse(scopes.contains(DEFAULT_EMAIL_SCOPE)),
                () -> assertFalse(scopes.contains(DEFAULT_PROFILE_SCOPE)));
    }

    @Test
    @DisplayName("a single supplied scope is treated as non-empty and is not replaced by defaults")
    void preservesSingleSuppliedScope() {
        GoogleProvider provider = newProvider(List.of("only-scope"));

        assertIterableEquals(List.of("only-scope"), provider.getScopes());
    }

    @Test
    @DisplayName("default scopes returned in the order email then profile")
    void defaultScopesAreOrderedEmailThenProfile() {
        GoogleProvider provider = newProvider(null);

        List<String> scopes = new ArrayList<>(provider.getScopes());

        assertAll(
                () -> assertEquals(DEFAULT_EMAIL_SCOPE, scopes.get(0)),
                () -> assertEquals(DEFAULT_PROFILE_SCOPE, scopes.get(1)));
    }

    @Test
    @DisplayName(
            "no-args constructor still reports fixed name/client name and injects default scopes")
    void noArgsConstructorReportsFixedValues() {
        GoogleProvider provider = new GoogleProvider();

        assertAll(
                () -> assertEquals("google", provider.getName()),
                () -> assertEquals("Google", provider.getClientName()),
                () ->
                        assertIterableEquals(
                                List.of(DEFAULT_EMAIL_SCOPE, DEFAULT_PROFILE_SCOPE),
                                provider.getScopes()));
    }

    @ParameterizedTest
    @EnumSource(
            value = UsernameAttribute.class,
            names = {"EMAIL", "NAME", "GIVEN_NAME", "FAMILY_NAME"})
    @DisplayName("supported username attributes are accepted by the constructor")
    void acceptsSupportedUsernameAttributes(UsernameAttribute attribute) {
        GoogleProvider provider =
                new GoogleProvider("clientId", "clientSecret", List.of("scope"), attribute);

        assertSame(attribute, provider.getUseAsUsername());
    }

    @ParameterizedTest
    @EnumSource(
            value = UsernameAttribute.class,
            names = {"EMAIL", "NAME", "GIVEN_NAME", "FAMILY_NAME"},
            mode = EnumSource.Mode.EXCLUDE)
    @DisplayName("unsupported username attributes are rejected with UnsupportedClaimException")
    void rejectsUnsupportedUsernameAttributes(UsernameAttribute attribute) {
        UnsupportedClaimException exception =
                assertThrows(
                        UnsupportedClaimException.class,
                        () ->
                                new GoogleProvider(
                                        "clientId", "clientSecret", List.of("scope"), attribute));

        assertTrue(exception.getMessage().contains("Google"));
    }

    @Test
    @DisplayName("a null username attribute defaults to EMAIL")
    void nullUsernameAttributeDefaultsToEmail() {
        GoogleProvider provider =
                new GoogleProvider("clientId", "clientSecret", List.of("scope"), null);

        assertSame(UsernameAttribute.EMAIL, provider.getUseAsUsername());
    }

    @Test
    @DisplayName("toString masks a populated client secret and surfaces the resolved fields")
    void toStringMasksPopulatedSecret() {
        GoogleProvider provider =
                new GoogleProvider(
                        "my-client-id", "super-secret", List.of("openid"), UsernameAttribute.EMAIL);

        String result = provider.toString();

        assertAll(
                () -> assertTrue(result.startsWith("Google [")),
                () -> assertTrue(result.contains("clientId=my-client-id")),
                () -> assertTrue(result.contains("clientSecret=*****")),
                () -> assertFalse(result.contains("super-secret")),
                () -> assertTrue(result.contains("scopes=[openid]")),
                () -> assertTrue(result.contains("useAsUsername=EMAIL")));
    }

    @Test
    @DisplayName("toString reports NULL when the client secret is null")
    void toStringReportsNullForNullSecret() {
        GoogleProvider provider =
                new GoogleProvider(
                        "my-client-id", null, List.of("openid"), UsernameAttribute.EMAIL);

        String result = provider.toString();

        assertAll(
                () -> assertTrue(result.contains("clientSecret=NULL")),
                () -> assertFalse(result.contains("*****")));
    }

    @Test
    @DisplayName("toString reports NULL when the client secret is an empty string")
    void toStringReportsNullForEmptySecret() {
        GoogleProvider provider =
                new GoogleProvider("my-client-id", "", List.of("openid"), UsernameAttribute.EMAIL);

        assertTrue(provider.toString().contains("clientSecret=NULL"));
    }

    @Test
    @DisplayName("toString includes the injected default scopes when none were supplied")
    void toStringIncludesInjectedDefaultScopes() {
        GoogleProvider provider = newProvider(null);

        String result = provider.toString();

        assertAll(
                () -> assertTrue(result.contains(DEFAULT_EMAIL_SCOPE)),
                () -> assertTrue(result.contains(DEFAULT_PROFILE_SCOPE)));
    }
}
