package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

/**
 * Unit tests for {@link UserAuthenticationFilter#doFilterInternal} and {@code shouldNotFilter},
 * driven entirely with Mockito mocks for the servlet request/response/chain and the injected
 * collaborators ({@link UserService}, {@link SessionPersistentRegistry}, {@link
 * ApplicationProperties.Security}). No Spring context, no real IO: {@code response.getWriter()} is
 * backed by an in-memory {@link StringWriter} so the JSON error bodies can be asserted, and {@link
 * SecurityContextHolder} is replaced with a {@link MockedStatic} per test so the {@link
 * SecurityContext}'s authentication can be staged without touching thread-local state.
 *
 * <p>{@code isPublicAuthEndpoint} (from {@code RequestUriUtils}) is a pure, deterministic static
 * helper, so it is exercised with real URIs rather than being stubbed.
 *
 * <p>ASSUMPTION TO VERIFY: a {@link User} mock returning an empty authorities collection is enough
 * for the API-key happy path; the production code builds an {@code ApiKeyAuthenticationToken} from
 * {@code user.getAuthorities()} and immediately marks it authenticated, so the username-validation
 * branch then runs against a {@code null} username (mock {@code User} principal is neither a
 * UserDetails/OAuth2User/SAML2/String at the filter's instanceof checks) and falls straight through
 * to {@code filterChain.doFilter}.
 */
@ExtendWith(MockitoExtension.class)
class UserAuthenticationFilterTest {

    @Mock private ApplicationProperties.Security securityProp;
    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionPersistentRegistry;

    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;
    @Mock private FilterChain filterChain;

    @Mock private SecurityContext securityContext;

    private StringWriter responseBody;

    private UserAuthenticationFilter newFilter(boolean loginEnabled) {
        return new UserAuthenticationFilter(
                securityProp, userService, sessionPersistentRegistry, loginEnabled);
    }

    @BeforeEach
    void setUp() throws IOException {
        responseBody = new StringWriter();
        // Lenient: tests that pass straight through the chain never touch the writer.
        lenient().when(response.getWriter()).thenReturn(new PrintWriter(responseBody));
    }

    // ---------------------------------------------------------------------
    // Login-disabled short circuit
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("login disabled: every request passes straight through with no auth work")
    void loginDisabled_passesThrough() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(false);

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(request, never()).getRequestURI();
        verifyNoInteractions(userService, sessionPersistentRegistry, securityProp);
    }

    // ---------------------------------------------------------------------
    // API-key authentication branch (no existing authentication)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("API key present but unknown: responds 401 with 'Invalid API Key.' and stops")
    void apiKey_unknown_returns401() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getHeader("X-API-KEY")).thenReturn("bad-key");
        when(userService.getUserByApiKey("bad-key")).thenReturn(Optional.empty());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(response).setStatus(HttpStatus.UNAUTHORIZED.value());
        assertEquals("Invalid API Key.", responseBody.toString());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("API key present and valid: sets authentication and proceeds down the chain")
    void apiKey_valid_setsAuthenticationAndProceeds() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getHeader("X-API-KEY")).thenReturn("good-key");

        // Real (not mocked) User entity: @NoArgsConstructor + Lombok @Getter give an empty
        // authorities Set and a null username out of the box. A null username means the filter's
        // UserDetails branch sets username == null, so the userService existence/disabled checks
        // are skipped and the request is allowed through.
        User user = new User();
        when(userService.getUserByApiKey("good-key")).thenReturn(Optional.of(user));

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);

            // The newly created ApiKeyAuthenticationToken is stored back in the context.
            verify(securityContext).setAuthentication(any(Authentication.class));
        }

        // getAllSessions is still consulted for the now-authenticated principal.
        verify(sessionPersistentRegistry).getAllSessions(eq(user), eq(false));
        verify(userService, never()).usernameExistsIgnoreCase(anyString());
        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    @DisplayName("API key lookup throws AuthenticationException: responds 401 and stops")
    void apiKey_authenticationException_returns401() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getHeader("X-API-KEY")).thenReturn("explosive-key");
        when(userService.getUserByApiKey("explosive-key"))
                .thenThrow(new TestAuthenticationException("boom"));

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(response).setStatus(HttpStatus.UNAUTHORIZED.value());
        assertEquals("Invalid API Key.", responseBody.toString());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("blank API key header is ignored (treated as no key)")
    void apiKey_blankHeader_ignored_thenPublicEndpointPassesThrough()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/auth/login");
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("X-API-KEY")).thenReturn("   ");

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        // Blank key never consults UserService; falls through to the public-endpoint check.
        verify(userService, never()).getUserByApiKey(anyString());
        verify(filterChain).doFilter(request, response);
    }

    // ---------------------------------------------------------------------
    // No authentication, no API key: public vs protected endpoint
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no auth + public auth endpoint: passes through")
    void noAuth_publicEndpoint_passesThrough() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("X-API-KEY")).thenReturn(null);

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("no auth + public auth endpoint behind context path: context path is stripped")
    void noAuth_publicEndpointWithContextPath_passesThrough()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/stirling/api/v1/auth/refresh");
        when(request.getContextPath()).thenReturn("/stirling");
        when(request.getHeader("X-API-KEY")).thenReturn(null);

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("no auth + protected endpoint: responds 401 JSON and stops")
    void noAuth_protectedEndpoint_returns401Json() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("X-API-KEY")).thenReturn(null);

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(null);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(response).setStatus(HttpStatus.UNAUTHORIZED.value());
        verify(response).setContentType("application/json");
        assertTrue(responseBody.toString().contains("\"status\": 401"));
        assertTrue(responseBody.toString().contains("Authentication required"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("present-but-unauthenticated token + protected endpoint: responds 401 JSON")
    void unauthenticatedToken_protectedEndpoint_returns401Json()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getContextPath()).thenReturn("");
        when(request.getHeader("X-API-KEY")).thenReturn(null);

        // An Authentication whose isAuthenticated() == false must be treated like "no auth".
        Authentication notAuthenticated = new UsernamePasswordAuthenticationToken("u", "p");
        assertFalse(notAuthenticated.isAuthenticated());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(notAuthenticated);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(response).setStatus(HttpStatus.UNAUTHORIZED.value());
        verify(filterChain, never()).doFilter(request, response);
    }

    // ---------------------------------------------------------------------
    // Authenticated user validation - UserDetails principal
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("authenticated UserDetails, exists & enabled: passes through")
    void authenticatedUserDetails_validUser_passesThrough() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        UserDetails principal = org.mockito.Mockito.mock(UserDetails.class);
        when(principal.getUsername()).thenReturn("alice");
        Authentication auth = authenticated(principal);

        when(userService.usernameExistsIgnoreCase("alice")).thenReturn(true);
        when(userService.isUserDisabled("alice")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(anyInt()); // no status set
    }

    @Test
    @DisplayName("authenticated UserDetails, user does not exist: 401 invalid credentials + cleared")
    void authenticatedUserDetails_userMissing_returns401AndExpiresSessions()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        UserDetails principal = org.mockito.Mockito.mock(UserDetails.class);
        when(principal.getUsername()).thenReturn("ghost");
        Authentication auth = authenticated(principal);

        when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);
        when(userService.isUserDisabled("ghost")).thenReturn(false);

        SessionInformation session = org.mockito.Mockito.mock(SessionInformation.class);
        when(session.getSessionId()).thenReturn("sess-1");
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(List.of(session));

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);

            // SecurityContextHolder.clearContext() is invoked on the invalid-credentials path.
            ctx.verify(SecurityContextHolder::clearContext);
        }

        // Non-existent user => sessions are expired in both places.
        verify(session).expireNow();
        verify(sessionPersistentRegistry).expireSession("sess-1");

        verify(response).setStatus(HttpStatus.UNAUTHORIZED.value());
        verify(response).setContentType("application/json");
        assertTrue(responseBody.toString().contains("Invalid credentials"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("authenticated UserDetails, user disabled: 403 disabled + sessions expired")
    void authenticatedUserDetails_userDisabled_returns403()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        UserDetails principal = org.mockito.Mockito.mock(UserDetails.class);
        when(principal.getUsername()).thenReturn("bob");
        Authentication auth = authenticated(principal);

        when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
        when(userService.isUserDisabled("bob")).thenReturn(true);

        SessionInformation session = org.mockito.Mockito.mock(SessionInformation.class);
        when(session.getSessionId()).thenReturn("sess-bob");
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(List.of(session));

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);

            ctx.verify(SecurityContextHolder::clearContext);
        }

        // Disabled user => sessions expired even though the account exists.
        verify(session).expireNow();
        verify(sessionPersistentRegistry).expireSession("sess-bob");

        verify(response).setStatus(HttpStatus.FORBIDDEN.value());
        assertTrue(responseBody.toString().contains("User account is disabled"));
        verify(filterChain, never()).doFilter(request, response);
    }

    // ---------------------------------------------------------------------
    // OAuth2 principal: block-registration and SSO-skip behaviour
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("OAuth2 user, registration blocked & user new: 403 registration blocked")
    void oauth2_blockRegistrationNewUser_returns403()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        OAuth2User principal = org.mockito.Mockito.mock(OAuth2User.class);
        when(principal.getName()).thenReturn("oauthnew");
        Authentication auth = authenticated(principal);

        ApplicationProperties.Security.OAUTH2 oauth2 =
                new ApplicationProperties.Security.OAUTH2();
        oauth2.setBlockRegistration(true);
        when(securityProp.getOauth2()).thenReturn(oauth2);

        when(userService.usernameExistsIgnoreCase("oauthnew")).thenReturn(false);
        when(userService.isUserDisabled("oauthnew")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);

            ctx.verify(SecurityContextHolder::clearContext);
        }

        verify(response).setStatus(HttpStatus.FORBIDDEN.value());
        assertTrue(responseBody.toString().contains("User registration is blocked"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("OAuth2 user that does not exist but SSO: skips the 401 invalid-credentials path")
    void oauth2_missingUser_notBlocked_passesThroughDespiteMissingAccount()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        OAuth2User principal = org.mockito.Mockito.mock(OAuth2User.class);
        when(principal.getName()).thenReturn("ssoUser");
        Authentication auth = authenticated(principal);

        // blockRegistration false: a brand-new SSO user is allowed; notSsoLogin == false so the
        // "!isUserExists && notSsoLogin" 401 branch is skipped.
        ApplicationProperties.Security.OAUTH2 oauth2 =
                new ApplicationProperties.Security.OAUTH2();
        oauth2.setBlockRegistration(false);
        when(securityProp.getOauth2()).thenReturn(oauth2);

        when(userService.usernameExistsIgnoreCase("ssoUser")).thenReturn(false);
        when(userService.isUserDisabled("ssoUser")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(response, never()).setStatus(HttpStatus.UNAUTHORIZED.value());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("OAuth2 user, getOauth2() null: blockRegistration treated as false, proceeds")
    void oauth2_nullOauthConfig_doesNotBlock() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        OAuth2User principal = org.mockito.Mockito.mock(OAuth2User.class);
        when(principal.getName()).thenReturn("ssoUser2");
        Authentication auth = authenticated(principal);

        when(securityProp.getOauth2()).thenReturn(null);
        when(userService.usernameExistsIgnoreCase("ssoUser2")).thenReturn(true);
        when(userService.isUserDisabled("ssoUser2")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(anyInt());
    }

    // ---------------------------------------------------------------------
    // SAML2 principal
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("SAML2 user, registration blocked & user new: 403 registration blocked")
    void saml2_blockRegistrationNewUser_returns403() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        "samlNew", Collections.emptyMap(), "nameId", List.of());
        Authentication auth = authenticated(principal);

        ApplicationProperties.Security.SAML2 saml2 = new ApplicationProperties.Security.SAML2();
        saml2.setBlockRegistration(true);
        when(securityProp.getSaml2()).thenReturn(saml2);

        when(userService.usernameExistsIgnoreCase("samlNew")).thenReturn(false);
        when(userService.isUserDisabled("samlNew")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);

            ctx.verify(SecurityContextHolder::clearContext);
        }

        verify(response).setStatus(HttpStatus.FORBIDDEN.value());
        assertTrue(responseBody.toString().contains("User registration is blocked"));
        verify(filterChain, never()).doFilter(request, response);
    }

    // ---------------------------------------------------------------------
    // String principal (e.g. anonymous-style string), and unknown principal
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("String principal, valid user: passes through")
    void stringPrincipal_validUser_passesThrough() throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        String principal = "stringuser";
        Authentication auth = authenticated(principal);

        when(userService.usernameExistsIgnoreCase("stringuser")).thenReturn(true);
        when(userService.isUserDisabled("stringuser")).thenReturn(false);
        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);
        }

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    @DisplayName("unknown principal type: username stays null, validation skipped, proceeds")
    void unknownPrincipal_skipsValidation_passesThrough()
            throws ServletException, IOException {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        // A principal that is none of UserDetails/OAuth2User/SAML2/String.
        Object principal = Integer.valueOf(42);
        Authentication auth = authenticated(principal);

        when(sessionPersistentRegistry.getAllSessions(principal, false))
                .thenReturn(Collections.emptyList());

        try (MockedStatic<SecurityContextHolder> ctx = mockStatic(SecurityContextHolder.class)) {
            ctx.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(securityContext.getAuthentication()).thenReturn(auth);

            filter.doFilterInternal(request, response, filterChain);
        }

        // No username => userService validation never runs.
        verify(userService, never()).usernameExistsIgnoreCase(anyString());
        verify(userService, never()).isUserDisabled(anyString());
        verify(filterChain).doFilter(request, response);
    }

    // ---------------------------------------------------------------------
    // shouldNotFilter
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("shouldNotFilter: GET static resource is skipped")
    void shouldNotFilter_getStaticResource_true() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/css/site.css");
        when(request.getContextPath()).thenReturn("");

        assertTrue(filter.shouldNotFilter(request));
    }

    @Test
    @DisplayName("shouldNotFilter: HEAD frontend route is skipped")
    void shouldNotFilter_headFrontendRoute_true() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("HEAD");
        when(request.getRequestURI()).thenReturn("/dashboard");
        when(request.getContextPath()).thenReturn("");

        assertTrue(filter.shouldNotFilter(request));
    }

    @Test
    @DisplayName("shouldNotFilter: public API status endpoint is skipped regardless of method")
    void shouldNotFilter_publicApiStatus_true() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/v1/info/status");
        when(request.getContextPath()).thenReturn("");

        assertTrue(filter.shouldNotFilter(request));
    }

    @Test
    @DisplayName("shouldNotFilter: public API auth/login endpoint behind context path is skipped")
    void shouldNotFilter_publicApiLoginWithContextPath_true() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/ctx/api/v1/auth/login");
        when(request.getContextPath()).thenReturn("/ctx");

        assertTrue(filter.shouldNotFilter(request));
    }

    @Test
    @DisplayName("shouldNotFilter: protected POST API endpoint is NOT skipped")
    void shouldNotFilter_protectedApi_false() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");
        when(request.getContextPath()).thenReturn("");

        assertFalse(filter.shouldNotFilter(request));
    }

    @Test
    @DisplayName("shouldNotFilter: POST to a static-resource path is NOT skipped (method gate)")
    void shouldNotFilter_postStaticResource_false() {
        UserAuthenticationFilter filter = newFilter(true);
        when(request.getMethod()).thenReturn("POST");
        when(request.getRequestURI()).thenReturn("/css/site.css");
        // Static-resource / frontend-route checks are gated on GET/HEAD only, and the URI does not
        // match any public API pattern, so the filter still applies.
        assertFalse(filter.shouldNotFilter(request));
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /** Builds an already-authenticated token wrapping the supplied principal. */
    private static Authentication authenticated(Object principal) {
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        principal, "credentials", Collections.emptyList());
        // ctor with authorities sets authenticated == true
        return token;
    }

    /** Minimal concrete {@link AuthenticationException} for the API-key failure path. */
    private static class TestAuthenticationException extends AuthenticationException {
        TestAuthenticationException(String msg) {
            super(msg);
        }
    }
}
