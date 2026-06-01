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
import org.junit.jupiter.params.provider.EnumSource.Mode;

import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.exception.UnsupportedClaimException;

@DisplayName("Tests for GitHubProvider")
class GitHubProviderTest {

    private static final String AUTHORIZATION_URI = "https://github.com/login/oauth/authorize";
    private static final String TOKEN_URI = "https://github.com/login/oauth/access_token";
    private static final String USER_INFO_URI = "https://api.github.com/user";

    @Nested
    @DisplayName("Constant getters")
    class ConstantGetterTests {

        @Test
        @DisplayName("Should expose the fixed GitHub name and client name")
        void shouldExposeNameAndClientName() {
            GitHubProvider provider =
                    new GitHubProvider(
                            "id", "secret", List.of("read:user"), UsernameAttribute.LOGIN);

            assertEquals("github", provider.getName());
            assertEquals("GitHub", provider.getClientName());
        }

        @Test
        @DisplayName("Should expose the fixed GitHub endpoint URIs")
        void shouldExposeEndpointUris() {
            GitHubProvider provider =
                    new GitHubProvider(
                            "id", "secret", List.of("read:user"), UsernameAttribute.LOGIN);

            assertEquals(AUTHORIZATION_URI, provider.getAuthorizationUri());
            assertEquals(TOKEN_URI, provider.getTokenUri());
            assertEquals(USER_INFO_URI, provider.getUserInfoUri());
        }

        @Test
        @DisplayName("Endpoint getters should be deterministic and ignore stored fields")
        void endpointGettersIgnoreStoredFields() {
            // The no-arg constructor leaves the inherited URI fields null, but the overridden
            // getters return the hard-coded constants regardless of stored state.
            GitHubProvider provider = new GitHubProvider();

            assertEquals(AUTHORIZATION_URI, provider.getAuthorizationUri());
            assertEquals(TOKEN_URI, provider.getTokenUri());
            assertEquals(USER_INFO_URI, provider.getUserInfoUri());
            assertEquals("github", provider.getName());
            assertEquals("GitHub", provider.getClientName());
        }
    }

    @Nested
    @DisplayName("useAsUsername defaulting")
    class UseAsUsernameTests {

        @Test
        @DisplayName("Null useAsUsername should default to LOGIN")
        void nullUseAsUsernameDefaultsToLogin() {
            GitHubProvider provider =
                    new GitHubProvider("id", "secret", List.of("read:user"), null);

            assertEquals(UsernameAttribute.LOGIN, provider.getUseAsUsername());
        }

        @ParameterizedTest(name = "useAsUsername={0} should be preserved")
        @EnumSource(
                value = UsernameAttribute.class,
                names = {"LOGIN", "EMAIL", "NAME"})
        @DisplayName("Valid GitHub username attributes should be preserved")
        void validUsernameAttributesPreserved(UsernameAttribute attribute) {
            GitHubProvider provider =
                    new GitHubProvider("id", "secret", List.of("read:user"), attribute);

            assertEquals(attribute, provider.getUseAsUsername());
        }

        @ParameterizedTest(name = "useAsUsername={0} should be rejected")
        @EnumSource(
                value = UsernameAttribute.class,
                names = {"LOGIN", "EMAIL", "NAME"},
                mode = Mode.EXCLUDE)
        @DisplayName("Unsupported GitHub username attributes should throw")
        void unsupportedUsernameAttributesThrow(UsernameAttribute attribute) {
            assertThrows(
                    UnsupportedClaimException.class,
                    () -> new GitHubProvider("id", "secret", List.of("read:user"), attribute));
        }

        @Test
        @DisplayName("Unsupported attribute exception message should name attribute and GitHub")
        void unsupportedAttributeMessage() {
            UnsupportedClaimException ex =
                    assertThrows(
                            UnsupportedClaimException.class,
                            () ->
                                    new GitHubProvider(
                                            "id",
                                            "secret",
                                            List.of("read:user"),
                                            UsernameAttribute.GIVEN_NAME));

            assertEquals("The attribute GIVEN_NAME is not supported for GitHub.", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("getScopes fallback")
    class ScopeTests {

        @Test
        @DisplayName("Provided non-empty scopes should be returned unchanged")
        void nonEmptyScopesReturnedAsIs() {
            Collection<String> scopes = List.of("repo", "read:org");

            GitHubProvider provider =
                    new GitHubProvider("id", "secret", scopes, UsernameAttribute.LOGIN);

            assertEquals(scopes, provider.getScopes());
        }

        @Test
        @DisplayName("Null scopes should fall back to read:user")
        void nullScopesFallBackToReadUser() {
            GitHubProvider provider =
                    new GitHubProvider("id", "secret", null, UsernameAttribute.LOGIN);

            assertEquals(List.of("read:user"), provider.getScopes());
        }

        @Test
        @DisplayName("Empty scopes should fall back to read:user")
        void emptyScopesFallBackToReadUser() {
            GitHubProvider provider =
                    new GitHubProvider("id", "secret", new ArrayList<>(), UsernameAttribute.LOGIN);

            assertEquals(List.of("read:user"), provider.getScopes());
        }

        @Test
        @DisplayName("No-arg constructor should still fall back to read:user")
        void noArgConstructorFallsBackToReadUser() {
            GitHubProvider provider = new GitHubProvider();

            assertEquals(List.of("read:user"), provider.getScopes());
        }

        @Test
        @DisplayName("Single provided scope should be preserved and not replaced by fallback")
        void singleScopePreserved() {
            GitHubProvider provider =
                    new GitHubProvider(
                            "id", "secret", List.of("read:org"), UsernameAttribute.LOGIN);

            assertEquals(List.of("read:org"), provider.getScopes());
        }
    }

    @Nested
    @DisplayName("toString secret masking")
    class ToStringTests {

        @Test
        @DisplayName("Non-empty client secret should be masked as *****")
        void nonEmptySecretIsMasked() {
            GitHubProvider provider =
                    new GitHubProvider(
                            "my-id", "super-secret", List.of("read:user"), UsernameAttribute.LOGIN);

            String result = provider.toString();

            assertTrue(result.contains("clientSecret=*****"), result);
            assertFalse(result.contains("super-secret"), result);
        }

        @Test
        @DisplayName("Null client secret should render as NULL")
        void nullSecretRendersNull() {
            GitHubProvider provider =
                    new GitHubProvider(
                            "my-id", null, List.of("read:user"), UsernameAttribute.LOGIN);

            assertTrue(provider.toString().contains("clientSecret=NULL"), provider.toString());
        }

        @Test
        @DisplayName("Empty client secret should render as NULL")
        void emptySecretRendersNull() {
            GitHubProvider provider =
                    new GitHubProvider("my-id", "", List.of("read:user"), UsernameAttribute.LOGIN);

            assertTrue(provider.toString().contains("clientSecret=NULL"), provider.toString());
        }

        @Test
        @DisplayName("toString should expose clientId, resolved scopes and useAsUsername")
        void toStringIncludesKeyFields() {
            GitHubProvider provider =
                    new GitHubProvider("my-id", "secret", null, UsernameAttribute.EMAIL);

            String result = provider.toString();

            assertTrue(result.startsWith("GitHub ["), result);
            assertTrue(result.contains("clientId=my-id"), result);
            // Scopes were null so the getter fallback should surface in toString.
            assertTrue(result.contains("scopes=[read:user]"), result);
            assertTrue(result.contains("useAsUsername=EMAIL"), result);
        }
    }
}
