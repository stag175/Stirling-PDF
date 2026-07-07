package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.RedirectStrategy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class CustomAuthenticationFailureHandlerTest {

    @Mock private LoginAttemptService loginAttemptService;
    @Mock private UserService userService;
    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;
    @Mock private RedirectStrategy redirectStrategy;

    private CustomAuthenticationFailureHandler handler;

    @BeforeEach
    void setUp() {
        handler = new CustomAuthenticationFailureHandler(loginAttemptService, userService);
        // Inject a mock redirect strategy via the inherited setter so we can verify target URLs
        // without a real web/servlet container.
        handler.setRedirectStrategy(redirectStrategy);
    }

    private static User userWithAuthorities(String... authorities) {
        User user = new User();
        for (String auth : authorities) {
            // Authority constructor wires itself into the user's authority set.
            new Authority(auth, user);
        }
        return user;
    }

    @Test
    void disabledExceptionRedirectsToLogoutAndShortCircuits() throws Exception {
        AuthenticationException exception = new DisabledException("deactivated");

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy)
                .sendRedirect(request, response, "/logout?userIsDisabled=true");
        // Disabled branch returns before touching IP / username / services.
        verify(request, never()).getRemoteAddr();
        verifyNoInteractions(userService, loginAttemptService);
    }

    @Test
    void lockedExceptionRedirectsToLockedErrorBeforeServiceLookup() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.1");
        AuthenticationException exception = new LockedException("locked");

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy).sendRedirect(request, response, "/login?error=locked");
        // Locked branch returns before username lookup.
        verifyNoInteractions(userService, loginAttemptService);
    }

    @Test
    void badCredentialsRedirectsToBadCredentialsWhenUserUnknown() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.2");
        when(request.getParameter("username")).thenReturn("ghost");
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
        // No known user -> attempt tracking is skipped.
        verifyNoInteractions(loginAttemptService);
    }

    @Test
    void usernameNotFoundRedirectsToBadCredentials() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.3");
        when(request.getParameter("username")).thenReturn(null);
        when(userService.findByUsernameIgnoreCase(null)).thenReturn(Optional.empty());
        AuthenticationException exception = new UsernameNotFoundException("no user");

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
        verifyNoInteractions(loginAttemptService);
    }

    @Test
    void knownUserNotBlockedRecordsFailureThenBadCredentialsRedirect() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.4");
        when(request.getParameter("username")).thenReturn("alice");
        when(userService.findByUsernameIgnoreCase("alice"))
                .thenReturn(Optional.of(userWithAuthorities("ROLE_USER")));
        when(loginAttemptService.getRemainingAttempts("alice")).thenReturn(2);
        when(loginAttemptService.isBlocked("alice")).thenReturn(false);
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        verify(loginAttemptService).getRemainingAttempts("alice");
        verify(loginAttemptService).loginFailed("alice");
        verify(loginAttemptService).isBlocked("alice");
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
    }

    @Test
    void knownUserBecomesBlockedRedirectsToLockedAndShortCircuits() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.5");
        when(request.getParameter("username")).thenReturn("bob");
        when(userService.findByUsernameIgnoreCase("bob"))
                .thenReturn(Optional.of(userWithAuthorities("ROLE_USER")));
        when(loginAttemptService.getRemainingAttempts("bob")).thenReturn(0);
        when(loginAttemptService.isBlocked("bob")).thenReturn(true);
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        verify(loginAttemptService).loginFailed("bob");
        // Block-after-failure branch wins and short-circuits before the badCredentials check.
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=locked");
        verify(redirectStrategy, never())
                .sendRedirect(any(), any(), eq("/login?error=badCredentials"));
    }

    @Test
    void demoUserIsNotTrackedAndFallsThroughToBadCredentials() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.6");
        when(request.getParameter("username")).thenReturn("demo");
        when(userService.findByUsernameIgnoreCase("demo"))
                .thenReturn(Optional.of(userWithAuthorities("ROLE_DEMO_USER")));
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        // Demo users bypass the attempt-tracking block entirely.
        verifyNoInteractions(loginAttemptService);
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
    }

    @Test
    void internalAuthenticationServiceExceptionRedirectsToOauthError() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.7");
        when(request.getParameter("username")).thenReturn("carol");
        when(userService.findByUsernameIgnoreCase("carol")).thenReturn(Optional.empty());
        AuthenticationException exception =
                new InternalAuthenticationServiceException("boom");

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy)
                .sendRedirect(request, response, "/login?error=oauth2AuthenticationError");
    }

    @Test
    void passwordMustNotBeNullMessageRedirectsToOauthError() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.8");
        when(request.getParameter("username")).thenReturn("dave");
        when(userService.findByUsernameIgnoreCase("dave")).thenReturn(Optional.empty());
        // A generic AuthenticationException whose message triggers the oauth2 branch.
        AuthenticationException exception =
                new AuthenticationException("Password must not be null") {};

        handler.onAuthenticationFailure(request, response, exception);

        verify(redirectStrategy)
                .sendRedirect(request, response, "/login?error=oauth2AuthenticationError");
    }

    @Test
    void blockedKnownUserStillTakesLockedBranchEvenForOauthStyleException() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.0.0.9");
        when(request.getParameter("username")).thenReturn("erin");
        when(userService.findByUsernameIgnoreCase("erin"))
                .thenReturn(Optional.of(userWithAuthorities("ROLE_USER")));
        when(loginAttemptService.getRemainingAttempts("erin")).thenReturn(0);
        when(loginAttemptService.isBlocked("erin")).thenReturn(true);
        AuthenticationException exception =
                new InternalAuthenticationServiceException("boom");

        handler.onAuthenticationFailure(request, response, exception);

        verify(loginAttemptService).loginFailed("erin");
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=locked");
        verify(redirectStrategy, never())
                .sendRedirect(any(), any(), eq("/login?error=oauth2AuthenticationError"));
    }

    @Test
    void unhandledExceptionFallsThroughToSuperHandlerWithoutRedirect() throws Exception {
        // No redirect strategy interactions expected on the super fallthrough; the parent
        // SimpleUrlAuthenticationFailureHandler with a null default failure URL sends a 401
        // error instead. Use a real response to observe that without a servlet container.
        MockHttpServletResponse realResponse = new MockHttpServletResponse();
        when(request.getRemoteAddr()).thenReturn("10.0.0.10");
        when(request.getParameter("username")).thenReturn("frank");
        when(userService.findByUsernameIgnoreCase("frank")).thenReturn(Optional.empty());
        AuthenticationException exception = new AuthenticationException("some other failure") {};

        handler.onAuthenticationFailure(request, realResponse, exception);

        verifyNoInteractions(redirectStrategy);
        assertEquals(HttpServletResponse.SC_UNAUTHORIZED, realResponse.getStatus());
    }

    @Test
    void knownUserWithNullUsernameSkipsTrackingBlock() throws Exception {
        // username == null is guarded explicitly even when a user is (improbably) returned.
        when(request.getRemoteAddr()).thenReturn("10.0.0.11");
        when(request.getParameter("username")).thenReturn(null);
        lenient()
                .when(userService.findByUsernameIgnoreCase(null))
                .thenReturn(Optional.of(userWithAuthorities("ROLE_USER")));
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        // username == null short-circuits the attempt-tracking branch.
        verifyNoInteractions(loginAttemptService);
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
    }

    @Test
    void emptyAuthoritySetUserIsTreatedAsNonDemo() throws Exception {
        User user = new User();
        // Explicitly assert the User starts with an empty authority set (isDemoUser -> false).
        assertEquals(Set.of(), user.getAuthorities());
        when(request.getRemoteAddr()).thenReturn("10.0.0.12");
        when(request.getParameter("username")).thenReturn("grace");
        when(userService.findByUsernameIgnoreCase("grace")).thenReturn(Optional.of(user));
        when(loginAttemptService.getRemainingAttempts("grace")).thenReturn(3);
        when(loginAttemptService.isBlocked("grace")).thenReturn(false);
        AuthenticationException exception = new BadCredentialsException("bad");

        handler.onAuthenticationFailure(request, response, exception);

        verify(loginAttemptService).loginFailed("grace");
        verify(redirectStrategy).sendRedirect(request, response, "/login?error=badCredentials");
    }
}
