package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.http.Cookie;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomSaml2AuthenticationSuccessHandlerTest {

    private static final String USERNAME = "alice";

    @Mock private LoginAttemptService loginAttemptService;
    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private UserLicenseSettingsService licenseSettingsService;

    private ApplicationProperties.Security.SAML2 saml2Properties;
    private ApplicationProperties applicationProperties;

    private CustomSaml2AuthenticationSuccessHandler handler;

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        saml2Properties = new ApplicationProperties.Security.SAML2();
        saml2Properties.setAutoCreateUser(true);
        saml2Properties.setBlockRegistration(false);

        applicationProperties = new ApplicationProperties();

        handler =
                new CustomSaml2AuthenticationSuccessHandler(
                        loginAttemptService,
                        saml2Properties,
                        userService,
                        jwtService,
                        licenseSettingsService,
                        applicationProperties);

        request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);

        response = new MockHttpServletResponse();
    }

    private Authentication samlAuthentication(String username) {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        username, Map.of(), "name-id-123", List.of("session-index-1"));
        return new UsernamePasswordAuthenticationToken(principal, "n/a", List.of());
    }

    // ----- Non-SAML2 principal: delegates to parent handler -----

    @Test
    void nonSaml2PrincipalDelegatesToParent() throws Exception {
        Authentication auth =
                new UsernamePasswordAuthenticationToken("not-a-saml-principal", "creds", List.of());

        handler.onAuthenticationSuccess(request, response, auth);

        // Parent SavedRequestAwareAuthenticationSuccessHandler redirects to the default target.
        assertNotNull(response.getRedirectedUrl());
        verify(userService, never()).usernameExistsIgnoreCase(anyString());
        verify(loginAttemptService, never()).isBlocked(anyString());
    }

    // ----- Existing user not SAML eligible: blocked with license redirect -----

    @Test
    void existingUserNotEligibleRedirectsToLicenseLogout() throws Exception {
        User user = new User();
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(true);
        when(userService.findByUsernameIgnoreCase(USERNAME)).thenReturn(Optional.of(user));
        when(licenseSettingsService.isSamlEligible(user)).thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/logout?saml2RequiresLicense=true",
                response.getRedirectedUrl());
        verify(loginAttemptService, never()).isBlocked(anyString());
    }

    // ----- New user not eligible (no enterprise license) -----

    @Test
    void newUserNotEligibleRedirectsToLicenseLogout() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/logout?saml2RequiresLicense=true",
                response.getRedirectedUrl());
    }

    // ----- Saved request present and non-static: delegate to parent (no SSO processing) -----

    @Test
    void validSavedRequestDelegatesToParentWithoutSsoProcessing() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(true);
        when(userService.findByUsernameIgnoreCase(USERNAME))
                .thenReturn(Optional.of(new User()));
        when(licenseSettingsService.isSamlEligible(any())).thenReturn(true);

        SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
        when(savedRequest.getRedirectUrl()).thenReturn("http://localhost:8080/original/page");

        request.getSession(true)
                .setAttribute("SPRING_SECURITY_SAVED_REQUEST", savedRequest);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        // Branch took the saved-request path: SSO login machinery must not run.
        verify(loginAttemptService, never()).isBlocked(anyString());
        verify(userService, never())
                .processSSOPostLogin(anyString(), anyString(), anyString(), anyBoolean(), any());
    }

    // ----- Static-resource saved request is ignored, normal SSO flow continues -----

    @Test
    void staticResourceSavedRequestIsIgnoredAndContinuesSsoFlow() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(true);
        when(userService.findByUsernameIgnoreCase(USERNAME))
                .thenReturn(Optional.of(new User()));
        when(licenseSettingsService.isSamlEligible(any())).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(userService.hasPassword(USERNAME)).thenReturn(false);
        when(userService.isSsoAuthenticationTypeByUsername(USERNAME)).thenReturn(true);
        when(userService.isAuthenticationTypeByUsername(USERNAME, AuthenticationType.SAML2))
                .thenReturn(true);
        when(jwtService.isJwtEnabled()).thenReturn(false);

        SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
        when(savedRequest.getRedirectUrl())
                .thenReturn("http://localhost:8080/css/styles.css");
        request.getSession(true)
                .setAttribute("SPRING_SECURITY_SAVED_REQUEST", savedRequest);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        // Static resource saved request is skipped -> SSO processing happens, v1 redirect home.
        verify(loginAttemptService).isBlocked(USERNAME);
        verify(userService)
                .processSSOPostLogin(
                        USERNAME, "name-id-123", "saml2", true, AuthenticationType.SAML2);
        assertEquals("/", response.getRedirectedUrl());
    }

    // ----- Blocked user throws LockedException and clears the saved request -----

    @Test
    void blockedUserThrowsLockedExceptionAndClearsSavedRequest() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(true);
        when(userService.findByUsernameIgnoreCase(USERNAME))
                .thenReturn(Optional.of(new User()));
        when(licenseSettingsService.isSamlEligible(any())).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(true);

        // A static-resource saved request keeps us in the else branch but still removable.
        SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
        when(savedRequest.getRedirectUrl())
                .thenReturn("http://localhost:8080/js/app.js");
        request.getSession(true)
                .setAttribute("SPRING_SECURITY_SAVED_REQUEST", savedRequest);

        Authentication auth = samlAuthentication(USERNAME);
        assertThrows(
                LockedException.class,
                () -> handler.onAuthenticationSuccess(request, response, auth));

        // Saved request attribute is removed when blocked.
        assertEquals(
                null,
                request.getSession(false).getAttribute("SPRING_SECURITY_SAVED_REQUEST"));
    }

    // ----- Existing user with password, not SSO, autoCreateUser: redirect to logout error -----

    @Test
    void existingPasswordUserNotSsoRedirectsToOauthErrorLogout() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(true);
        when(userService.findByUsernameIgnoreCase(USERNAME))
                .thenReturn(Optional.of(new User()));
        when(licenseSettingsService.isSamlEligible(any())).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(userService.hasPassword(USERNAME)).thenReturn(true);
        when(userService.isSsoAuthenticationTypeByUsername(USERNAME)).thenReturn(false);
        when(userService.isAuthenticationTypeByUsername(USERNAME, AuthenticationType.SAML2))
                .thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/logout?oAuth2AuthenticationErrorWeb=true",
                response.getRedirectedUrl());
        verify(userService, never())
                .processSSOPostLogin(anyString(), anyString(), anyString(), anyBoolean(), any());
    }

    // ----- New user with blockRegistration true: admin-blocked redirect -----

    @Test
    void newUserWithBlockRegistrationRedirectsToAdminBlocked() throws Exception {
        saml2Properties.setBlockRegistration(true);
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/login?errorOAuth=oAuth2AdminBlockedUser",
                response.getRedirectedUrl());
    }

    // ----- New user with autoCreateUser false: admin-blocked redirect -----

    @Test
    void newUserWithAutoCreateDisabledRedirectsToAdminBlocked() throws Exception {
        saml2Properties.setAutoCreateUser(false);
        saml2Properties.setBlockRegistration(false);
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/login?errorOAuth=oAuth2AdminBlockedUser",
                response.getRedirectedUrl());
    }

    // ----- New user that would exceed the license seat limit -----

    @Test
    void newUserExceedingSeatLimitRedirectsToMaxUsersReached() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(true);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/logout?maxUsersReached=true",
                response.getRedirectedUrl());
    }

    // ----- Success: JWT disabled -> v1 home redirect using contextPath -----

    @Test
    void successJwtDisabledRedirectsToContextRoot() throws Exception {
        request.setContextPath("/stirling");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(false);

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        verify(userService)
                .processSSOPostLogin(
                        USERNAME, "name-id-123", "saml2", true, AuthenticationType.SAML2);
        assertEquals("/stirling/", response.getRedirectedUrl());
    }

    // ----- Success: JWT enabled web client -> token in fragment + cookie cleared -----

    @Test
    void successJwtEnabledWebRedirectsWithAccessTokenFragment() throws Exception {
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("web-jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/auth/callback#access_token=web-jwt",
                response.getRedirectedUrl());
        // Redirect cookie cleared.
        assertTrue(
                response.getHeaders("Set-Cookie").stream()
                        .anyMatch(h -> h.startsWith("stirling_redirect_path=")));
    }

    // ----- Success: desktop client uses username-based token with desktop expiry -----

    @Test
    void successDesktopClientUsesDesktopExpiryToken() throws Exception {
        request.addHeader("User-Agent", "StirlingPDF-Desktop/1.0 Tauri");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(USERNAME), anyMap(), anyInt())).thenReturn("desktop-jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/auth/callback#access_token=desktop-jwt",
                response.getRedirectedUrl());
        verify(jwtService).generateToken(eq(USERNAME), anyMap(), anyInt());
        verify(jwtService, never()).generateToken(any(Authentication.class), anyMap());
    }

    // ----- Success: redirect cookie path is honored in the redirect URL -----

    @Test
    void successUsesRedirectCookiePath() throws Exception {
        request.setCookies(new Cookie("stirling_redirect_path", "/workspace/files"));
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/workspace/files#access_token=jwt",
                response.getRedirectedUrl());
    }

    // ----- Success: Tauri relay state -> tauri callback path + nonce appended -----

    @Test
    void successTauriRelayStateUsesTauriCallbackAndAppendsNonce() throws Exception {
        request.setParameter("RelayState", "tauri:my-nonce");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "http://localhost:8080/auth/callback/tauri#access_token=jwt&nonce=my-nonce",
                response.getRedirectedUrl());
    }

    // ----- Origin resolution: configured frontendUrl wins over request host -----

    @Test
    void successUsesConfiguredFrontendUrl() throws Exception {
        applicationProperties.getSystem().setFrontendUrl("https://app.example.com");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "https://app.example.com/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    // ----- Origin resolution: X-Forwarded-Host/Proto/Port headers -----

    @Test
    void successUsesForwardedHeadersForOrigin() throws Exception {
        request.addHeader("X-Forwarded-Host", "proxy.example.com");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Port", "8443");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "https://proxy.example.com:8443/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    // ----- Origin resolution: forwarded default port is dropped -----

    @Test
    void successForwardedDefaultPortIsDropped() throws Exception {
        request.addHeader("X-Forwarded-Host", "proxy.example.com");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Port", "443");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "https://proxy.example.com/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    // ----- Origin resolution: falls back to Referer when no forwarded headers -----

    @Test
    void successUsesRefererWhenNoForwardedHeaders() throws Exception {
        request.addHeader("Referer", "https://referer.example.com:9000/some/page");
        primeSuccessfulNewUser();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(any(Authentication.class), anyMap())).thenReturn("jwt");

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals(
                "https://referer.example.com:9000/auth/callback#access_token=jwt",
                response.getRedirectedUrl());
    }

    // ----- Error path: processSSOPostLogin throws -> invalidUsername logout (contextPath based) -----

    @Test
    void ssoProcessingExceptionRedirectsToInvalidUsername() throws Exception {
        request.setContextPath("/ctx");
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
        org.mockito.Mockito.doThrow(new SQLException("boom"))
                .when(userService)
                .processSSOPostLogin(
                        anyString(), anyString(), anyString(), anyBoolean(), any());

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        assertEquals("/ctx/logout?invalidUsername=true", response.getRedirectedUrl());
    }

    // ----- Error path: UnsupportedProviderException is also caught -----

    @Test
    void ssoProcessingUnsupportedProviderRedirectsToInvalidUsername() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
        org.mockito.Mockito.doThrow(new UnsupportedProviderException("nope"))
                .when(userService)
                .processSSOPostLogin(
                        anyString(), anyString(), anyString(), anyBoolean(), any());

        handler.onAuthenticationSuccess(request, response, samlAuthentication(USERNAME));

        // contextPath is empty in setUp -> redirect is /logout?...
        assertEquals("/logout?invalidUsername=true", response.getRedirectedUrl());
    }

    // ----- Helper: existing user that flows through to a successful SSO login -----

    private void primeSuccessfulNewUser() throws Exception {
        when(userService.usernameExistsIgnoreCase(USERNAME)).thenReturn(false);
        when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(false);
        when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
        // processSSOPostLogin is a void mock -> no stubbing needed (does nothing by default).
    }
}
