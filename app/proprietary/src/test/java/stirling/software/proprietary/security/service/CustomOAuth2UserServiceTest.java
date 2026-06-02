package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.IdTokenClaimNames;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * Coverage-focused round-4 unit test for {@link CustomOAuth2UserService}. Complements {@code
 * CustomOAuth2UserServiceDebugLoggingTest} by exercising the success path, the internal-user
 * locked/has-password branches, the null/blank useAsUsername paths, the unexpected-error debug dump,
 * and the static {@code suggestUsernameClaims}/{@code logClaimDump} helpers via reflection — all
 * without standing up a real OIDC provider (the network delegate is swapped for a stub).
 */
@ExtendWith(MockitoExtension.class)
class CustomOAuth2UserServiceTest {

    @Mock private UserService userService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private OidcUserRequest userRequest;

    private ListAppender<ILoggingEvent> appender;
    private Logger serviceLogger;

    @BeforeEach
    void attachLogCapture() {
        serviceLogger = (Logger) LoggerFactory.getLogger(CustomOAuth2UserService.class);
        appender = new ListAppender<>();
        appender.start();
        serviceLogger.addAppender(appender);
        serviceLogger.setLevel(Level.DEBUG);
    }

    @AfterEach
    void detachLogCapture() {
        serviceLogger.detachAppender(appender);
        appender.stop();
    }

    // ---------------------------------------------------------------------
    // Success path
    // ---------------------------------------------------------------------

    @Test
    void loadUser_success_returnsOidcUserWithConfiguredUsernameKey_noInternalUser()
            throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "jane.doe@example.com");
        replaceDelegateWithStub(service, claims, "email");

        // userRequest.getIdToken() feeds the final DefaultOidcUser construction and must contain
        // the configured username claim key so the constructor accepts it.
        when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        when(userService.findByUsernameIgnoreCase("jane.doe@example.com"))
                .thenReturn(Optional.empty());

        OidcUser result = service.loadUser(userRequest);

        assertThat(result).isNotNull();
        // The returned principal's name attribute resolves via the configured username key.
        assertEquals("jane.doe@example.com", result.getName());
        // No internal user => login attempt / has-password checks should not run.
        verify(loginAttemptService, never()).isBlocked(anyString());
        verify(userService, never()).hasPassword(anyString());
        // debugLogging=false => no diagnostic dump on success.
        assertThat(appender.list).noneMatch(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"));
    }

    @Test
    void loadUser_success_withDebugLogging_emitsInfoClaimDump() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "jane.doe@example.com");
        replaceDelegateWithStub(service, claims, "email");

        when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        when(userService.findByUsernameIgnoreCase("jane.doe@example.com"))
                .thenReturn(Optional.empty());

        OidcUser result = service.loadUser(userRequest);

        assertThat(result).isNotNull();
        List<ILoggingEvent> dumps =
                appender.list.stream()
                        .filter(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"))
                        .toList();
        assertThat(dumps).as("success-path debug dump expected").isNotEmpty();
        // Success dump uses INFO level (failure path uses ERROR).
        assertThat(dumps).anyMatch(e -> e.getLevel() == Level.INFO);
        String combined =
                String.join("\n", dumps.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(combined)
                .contains("OAuth2/OIDC login claims received")
                .contains("Configured useAsUsername: email")
                .contains("email = j***(len=20)"); // D2: PII value redacted
    }

    // ---------------------------------------------------------------------
    // Internal-user branches
    // ---------------------------------------------------------------------

    @Test
    void loadUser_internalUserBlocked_wrappedAsAuthenticationException() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "blocked@example.com");
        replaceDelegateWithStub(service, claims, "email");
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        User internal = new User();
        internal.setUsername("blocked@example.com");
        when(userService.findByUsernameIgnoreCase("blocked@example.com"))
                .thenReturn(Optional.of(internal));
        when(loginAttemptService.isBlocked("blocked@example.com")).thenReturn(true);

        // LockedException is not an IllegalArgumentException, so it falls into the generic catch
        // and is re-wrapped with the fixed "Unexpected error during authentication" message.
        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        // The generic-catch path throws `new OAuth2AuthenticationException(String errorCode)`, which
        // stores the text in the OAuth2Error code (getMessage() is null for that constructor).
        assertThat(thrown.getError().getErrorCode())
                .contains("Unexpected error during authentication");
        verify(loginAttemptService).isBlocked("blocked@example.com");
        verify(userService, never()).hasPassword(anyString());
    }

    @Test
    void loadUser_internalUserHasPassword_wrappedAsAuthenticationException() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "pwuser@example.com");
        replaceDelegateWithStub(service, claims, "email");
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        User internal = new User();
        internal.setUsername("pwuser@example.com");
        when(userService.findByUsernameIgnoreCase("pwuser@example.com"))
                .thenReturn(Optional.of(internal));
        when(loginAttemptService.isBlocked("pwuser@example.com")).thenReturn(false);
        // Source calls hasPassword(usernameAttributeKey) == hasPassword("email").
        when(userService.hasPassword("email")).thenReturn(true);

        // The thrown IllegalArgumentException ("Password must not be null") IS an
        // IllegalArgumentException, so it goes through the dedicated catch and is wrapped with the
        // original message preserved as the OAuth2Error description.
        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        assertThat(thrown.getCause()).isInstanceOf(IllegalArgumentException.class);
        assertThat(thrown.getError().getErrorCode()).contains("Password must not be null");
    }

    // ---------------------------------------------------------------------
    // Invalid / null / blank useAsUsername
    // ---------------------------------------------------------------------

    @Test
    void loadUser_nullUseAsUsername_npe_wrappedAsUnexpectedError() {
        // getUseAsUsername() == null => toUpperCase() NPE, caught by the generic Exception handler
        // (NOT the IllegalArgumentException one), producing the fixed unexpected-error message.
        ApplicationProperties.Security.OAUTH2 props = oauthProps(null, false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        // The generic-catch path throws `new OAuth2AuthenticationException(String errorCode)`, which
        // stores the text in the OAuth2Error code (getMessage() is null for that constructor).
        assertThat(thrown.getError().getErrorCode())
                .contains("Unexpected error during authentication");
    }

    @Test
    void loadUser_blankUseAsUsername_invalid_wrappedAsAuthenticationException() {
        // "" -> valueOf("") throws IllegalArgumentException before the delegate runs.
        ApplicationProperties.Security.OAUTH2 props = oauthProps("", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());

        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        assertThat(thrown.getCause()).isInstanceOf(IllegalArgumentException.class);
        // usernameAttributeKey never resolved => no claim dump even with debugLogging on.
        assertThat(appender.list).noneMatch(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"));
    }

    @Test
    void loadUser_lowercaseUseAsUsername_isUpperCasedBeforeValueOf() throws Exception {
        // Confirms the .toUpperCase() normalisation: "preferred_username" resolves successfully.
        ApplicationProperties.Security.OAUTH2 props = oauthProps("preferred_username", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("preferred_username", "jdoe");
        replaceDelegateWithStub(service, claims, "preferred_username");
        when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        when(userService.findByUsernameIgnoreCase("jdoe")).thenReturn(Optional.empty());

        OidcUser result = service.loadUser(userRequest);

        assertEquals("jdoe", result.getName());
    }

    // ---------------------------------------------------------------------
    // Unexpected-error debug dump (generic catch, debugLogging on, idToken present)
    // ---------------------------------------------------------------------

    @Test
    void loadUser_unexpectedError_withDebugLogging_dumpsIdTokenClaims() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "boom@example.com");
        replaceDelegateWithStub(service, claims, "email");
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        // idToken non-null so the unexpected-error dump branch (idToken != null) fires.
        when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        // Force a RuntimeException that is NOT an IllegalArgumentException => generic catch.
        when(userService.findByUsernameIgnoreCase("boom@example.com"))
                .thenThrow(new IllegalStateException("db down"));

        OAuth2AuthenticationException thrown =
                assertThrows(
                        OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        // The generic-catch path throws `new OAuth2AuthenticationException(String errorCode)`, which
        // stores the text in the OAuth2Error code (getMessage() is null for that constructor).
        assertThat(thrown.getError().getErrorCode())
                .contains("Unexpected error during authentication");

        String combined =
                String.join(
                        "\n",
                        appender.list.stream()
                                .map(ILoggingEvent::getFormattedMessage)
                                .filter(m -> m.contains("[OAUTH2 DEBUG]"))
                                .toList());
        assertThat(combined)
                .as("unexpected-error dump should include the ID token claims")
                .contains("OAuth2/OIDC login FAILED (unexpected error)")
                .contains("email = b***(len=16)"); // D2: PII value redacted
    }

    @Test
    void loadUser_unexpectedError_debugLoggingOff_noDump() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", false);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Map<String, Object> claims = baseClaims();
        claims.put("email", "boom@example.com");
        replaceDelegateWithStub(service, claims, "email");
        lenient().when(userRequest.getClientRegistration()).thenReturn(stubRegistration());
        lenient()
                .when(userRequest.getIdToken())
                .thenReturn(new OidcIdToken("token", Instant.now(), Instant.MAX, claims));
        when(userService.findByUsernameIgnoreCase("boom@example.com"))
                .thenThrow(new IllegalStateException("db down"));

        assertThrows(OAuth2AuthenticationException.class, () -> service.loadUser(userRequest));
        assertThat(appender.list).noneMatch(e -> e.getFormattedMessage().contains("[OAUTH2 DEBUG]"));
    }

    // ---------------------------------------------------------------------
    // Static helpers via reflection
    // ---------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void suggestUsernameClaims_returnsIntersectionWithUsernameAttributeEnum() throws Exception {
        Method m =
                CustomOAuth2UserService.class.getDeclaredMethod(
                        "suggestUsernameClaims", Set.class);
        m.setAccessible(true);

        // "email" + "preferred_username" are valid UsernameAttribute names; "upn"/"oid" are not.
        Set<String> available =
                new TreeSet<>(Set.of("email", "preferred_username", "upn", "oid"));
        Set<String> result = (Set<String>) m.invoke(null, available);

        assertThat(result).containsExactlyInAnyOrder("email", "preferred_username");
        assertThat(result).doesNotContain("upn", "oid");
    }

    @Test
    @SuppressWarnings("unchecked")
    void suggestUsernameClaims_noMatches_returnsEmptySet() throws Exception {
        Method m =
                CustomOAuth2UserService.class.getDeclaredMethod(
                        "suggestUsernameClaims", Set.class);
        m.setAccessible(true);

        Set<String> result = (Set<String>) m.invoke(null, Set.of("upn", "oid", "groups"));

        assertThat(result).isEmpty();
    }

    @Test
    void logClaimDump_nullIdTokenAndNullUserInfo_rendersFallbackLines() throws Exception {
        // Drive logClaimDump directly to cover the null-idToken / null-userInfo branches that the
        // public loadUser flow does not naturally reach together.
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Method m =
                CustomOAuth2UserService.class.getDeclaredMethod(
                        "logClaimDump",
                        String.class,
                        String.class,
                        String.class,
                        OidcIdToken.class,
                        OidcUserInfo.class,
                        Map.class,
                        boolean.class);
        m.setAccessible(true);

        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("upn", "jdoe@corp"); // present but not the configured key
        m.invoke(
                service,
                "DIRECT BANNER",
                "regId",
                "email",
                null, // idToken null branch
                null, // userInfo null branch
                merged,
                true); // failure => ERROR level

        String combined =
                String.join(
                        "\n",
                        appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(combined)
                .contains("DIRECT BANNER")
                .contains("Provider registrationId : regId")
                .contains("-- ID token: <null> --")
                .contains("-- UserInfo endpoint claims: none returned --")
                .contains("Merged attribute keys available to useAsUsername: [upn]")
                .contains("<NULL — this is why login fails>");
        // No valid UsernameAttribute key present in merged => no Hint line.
        assertThat(combined).doesNotContain("Hint:");
        assertThat(appender.list).anyMatch(e -> e.getLevel() == Level.ERROR);
    }

    @Test
    void logClaimDump_withUserInfoAndResolvedValue_omitsNullMarkerAndHint() throws Exception {
        ApplicationProperties.Security.OAUTH2 props = oauthProps("email", true);
        CustomOAuth2UserService service =
                new CustomOAuth2UserService(props, userService, loginAttemptService);

        Method m =
                CustomOAuth2UserService.class.getDeclaredMethod(
                        "logClaimDump",
                        String.class,
                        String.class,
                        String.class,
                        OidcIdToken.class,
                        OidcUserInfo.class,
                        Map.class,
                        boolean.class);
        m.setAccessible(true);

        Map<String, Object> idClaims = new LinkedHashMap<>();
        idClaims.put(IdTokenClaimNames.SUB, "abc");
        OidcIdToken idToken =
                new OidcIdToken("t", Instant.now(), Instant.now().plusSeconds(60), idClaims);

        Map<String, Object> userInfoClaims = new LinkedHashMap<>();
        userInfoClaims.put("email", "resolved@example.com");
        OidcUserInfo userInfo = new OidcUserInfo(userInfoClaims);

        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("email", "resolved@example.com");

        m.invoke(service, "OK BANNER", "regId", "email", idToken, userInfo, merged, false);

        String combined =
                String.join(
                        "\n",
                        appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(combined)
                .contains("-- ID token claims (1) --")
                .contains("ID token issued at :")
                .contains("ID token expires at:")
                .contains("-- UserInfo endpoint claims (1) --")
                .contains("Value at 'email' : r***(len=20)"); // D2: PII value redacted
        // Resolved value present => no NULL marker, no Hint line.
        assertThat(combined).doesNotContain("<NULL — this is why login fails>");
        assertThat(combined).doesNotContain("Hint:");
        // failure=false => INFO level.
        assertThat(appender.list).anyMatch(e -> e.getLevel() == Level.INFO);
    }

    // ---------------------------------------------------------------------
    // D2: PII-safe claim-value redaction
    // ---------------------------------------------------------------------

    @Test
    void redactClaimValue_masksPiiAndEmails_keepsStructuralClaims() {
        // null -> placeholder, never the literal value.
        assertThat(CustomOAuth2UserService.redactClaimValue("email", null)).isEqualTo("<null>");
        // Sensitive keys masked to first char + length, with no PII content leaking.
        assertThat(CustomOAuth2UserService.redactClaimValue("email", "jane.doe@example.com"))
                .isEqualTo("j***(len=20)");
        assertThat(CustomOAuth2UserService.redactClaimValue("given_name", "Jane"))
                .isEqualTo("J***(len=4)");
        assertThat(CustomOAuth2UserService.redactClaimValue("sub", "abc-123-def"))
                .isEqualTo("a***(len=11)");
        // Case-insensitive key matching.
        assertThat(CustomOAuth2UserService.redactClaimValue("Email", "a@b.co"))
                .isEqualTo("a***(len=6)");
        // Any value that looks like an email is masked even under a non-listed key.
        assertThat(CustomOAuth2UserService.redactClaimValue("custom_field", "x@y.z"))
                .isEqualTo("x***(len=5)");
        // Structural / non-PII claims are shown verbatim for diagnostics.
        assertThat(CustomOAuth2UserService.redactClaimValue("iss", "https://sts.example.com"))
                .isEqualTo("https://sts.example.com");
        assertThat(CustomOAuth2UserService.redactClaimValue("email_verified", Boolean.TRUE))
                .isEqualTo("true");
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private static ApplicationProperties.Security.OAUTH2 oauthProps(
            String useAsUsername, boolean debugLogging) {
        ApplicationProperties.Security.OAUTH2 p = new ApplicationProperties.Security.OAUTH2();
        p.setEnabled(true);
        p.setUseAsUsername(useAsUsername);
        p.setDebugLogging(debugLogging);
        return p;
    }

    private static Map<String, Object> baseClaims() {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put(IdTokenClaimNames.SUB, "abc-123");
        claims.put(IdTokenClaimNames.ISS, "https://sts.example.com/adfs");
        claims.put(IdTokenClaimNames.AUD, Collections.singletonList("client-id"));
        claims.put(IdTokenClaimNames.IAT, Instant.now());
        claims.put(IdTokenClaimNames.EXP, Instant.now().plusSeconds(3600));
        return claims;
    }

    private static ClientRegistration stubRegistration() {
        return ClientRegistration.withRegistrationId("demarest")
                .clientId("client-id")
                .clientSecret("client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("https://app.example.com/login/oauth2/code/demarest")
                .authorizationUri("https://sts.example.com/adfs/oauth2/authorize")
                .tokenUri("https://sts.example.com/adfs/oauth2/token")
                .jwkSetUri("https://sts.example.com/adfs/discovery/keys")
                .build();
    }

    /**
     * Swap the private {@code delegate} field for a stub returning a {@link DefaultOidcUser} built
     * from the supplied claims. {@code nameAttributeKey} must be a claim present in {@code claims}
     * (the DefaultOidcUser constructor validates it).
     */
    private void replaceDelegateWithStub(
            CustomOAuth2UserService service, Map<String, Object> claims, String nameAttributeKey)
            throws Exception {
        OidcIdToken idToken =
                new OidcIdToken("raw-token", Instant.now(), Instant.MAX, new HashMap<>(claims));
        DefaultOidcUser delegateUser =
                new DefaultOidcUser(Collections.emptyList(), idToken, nameAttributeKey);
        OidcUserService delegateMock = mock(OidcUserService.class);
        when(delegateMock.loadUser(any())).thenReturn(delegateUser);
        Field f = CustomOAuth2UserService.class.getDeclaredField("delegate");
        f.setAccessible(true);
        f.set(service, delegateMock);
    }
}
