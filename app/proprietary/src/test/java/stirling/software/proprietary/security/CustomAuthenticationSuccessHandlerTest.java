package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.RedirectStrategy;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class CustomAuthenticationSuccessHandlerTest {

    private static final String SAVED_REQUEST_ATTR = "SPRING_SECURITY_SAVED_REQUEST";

    private LoginAttemptService loginAttemptService;
    private UserService userService;
    private JwtServiceInterface jwtService;
    private RedirectStrategy redirectStrategy;

    private CustomAuthenticationSuccessHandler handler;

    private HttpServletRequest request;
    private HttpServletResponse response;
    private Authentication authentication;

    @BeforeEach
    void setUp() {
        loginAttemptService = mock(LoginAttemptService.class);
        userService = mock(UserService.class);
        jwtService = mock(JwtServiceInterface.class);
        redirectStrategy = mock(RedirectStrategy.class);

        handler =
                new CustomAuthenticationSuccessHandler(
                        loginAttemptService, userService, jwtService);
        // Inject a mock redirect strategy so we can verify redirects without a servlet container.
        // setRedirectStrategy is inherited from
        // AbstractAuthenticationTargetUrlRequestHandler (used by both the direct redirects in this
        // class and the super.onAuthenticationSuccess saved-request path).
        handler.setRedirectStrategy(redirectStrategy);

        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        authentication = mock(Authentication.class);
    }

    @Test
    void disabledUserRedirectsToLogoutAndShortCircuits() throws Exception {
        when(request.getParameter("username")).thenReturn("disabledUser");
        when(userService.isUserDisabled("disabledUser")).thenReturn(true);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(redirectStrategy).sendRedirect(request, response, "/logout?userIsDisabled=true");
        // Short-circuit: no success recorded, no JWT path touched.
        verify(loginAttemptService, never()).loginSucceeded(any());
        verifyNoInteractions(jwtService);
    }

    @Test
    void jwtEnabledGeneratesTokenAndRedirectsHome() throws Exception {
        when(request.getParameter("username")).thenReturn("alice");
        when(userService.isUserDisabled("alice")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(authentication), anyMap())).thenReturn("jwt-token");

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(loginAttemptService).loginSucceeded("alice");
        verify(jwtService)
                .generateToken(authentication, Map.of("authType", AuthenticationType.WEB));
        verify(redirectStrategy).sendRedirect(request, response, "/");
    }

    @Test
    void noSessionRedirectsHome() throws Exception {
        when(request.getParameter("username")).thenReturn("bob");
        when(userService.isUserDisabled("bob")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(false);
        when(request.getSession(false)).thenReturn(null);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(loginAttemptService).loginSucceeded("bob");
        verify(redirectStrategy).sendRedirect(request, response, "/");
    }

    @Test
    void noSavedRequestInSessionRedirectsHome() throws Exception {
        HttpSession session = mock(HttpSession.class);
        when(request.getParameter("username")).thenReturn("carol");
        when(userService.isUserDisabled("carol")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(false);
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(SAVED_REQUEST_ATTR)).thenReturn(null);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(redirectStrategy).sendRedirect(request, response, "/");
    }

    @Test
    void savedRequestForStaticResourceRedirectsHome() throws Exception {
        HttpSession session = mock(HttpSession.class);
        SavedRequest savedRequest = mock(SavedRequest.class);
        when(request.getParameter("username")).thenReturn("dave");
        when(userService.isUserDisabled("dave")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(false);
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(SAVED_REQUEST_ATTR)).thenReturn(savedRequest);
        when(request.getContextPath()).thenReturn("");
        // A CSS asset is a static resource per RequestUriUtils.isStaticResource.
        when(savedRequest.getRedirectUrl()).thenReturn("/css/app.css");

        handler.onAuthenticationSuccess(request, response, authentication);

        // Static resource: ignore saved request, send to home page.
        verify(redirectStrategy).sendRedirect(request, response, "/");
    }

    @Test
    void savedRequestForNonStaticResourceDelegatesToSuper() throws Exception {
        HttpSession session = mock(HttpSession.class);
        SavedRequest savedRequest = mock(SavedRequest.class);
        String originalDestination = "/app/dashboard";

        when(request.getParameter("username")).thenReturn("erin");
        when(userService.isUserDisabled("erin")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(false);
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(SAVED_REQUEST_ATTR)).thenReturn(savedRequest);
        when(request.getContextPath()).thenReturn("");
        when(savedRequest.getRedirectUrl()).thenReturn(originalDestination);

        handler.onAuthenticationSuccess(request, response, authentication);

        // super.onAuthenticationSuccess (SavedRequestAwareAuthenticationSuccessHandler) reads the
        // saved request from the same session attribute and redirects to its URL via the injected
        // redirect strategy. We must never have sent the user straight home in this branch.
        verify(redirectStrategy).sendRedirect(request, response, originalDestination);
        verify(redirectStrategy, never()).sendRedirect(request, response, "/");
    }

    @Test
    void nullUsernameTreatedAsNotDisabledAndProceeds() throws Exception {
        // request.getParameter("username") returns null when the param is absent; verify the
        // handler does not NPE and proceeds down the (non-JWT) redirect path.
        when(request.getParameter("username")).thenReturn(null);
        when(userService.isUserDisabled(null)).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(false);
        when(request.getSession(false)).thenReturn(null);

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(loginAttemptService).loginSucceeded(null);
        verify(redirectStrategy).sendRedirect(request, response, "/");
    }

    @Test
    void jwtPathSkipsSavedRequestLookup() throws Exception {
        // When JWT is enabled, the saved-request branch must not be reached at all.
        when(request.getParameter("username")).thenReturn("frank");
        when(userService.isUserDisabled("frank")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(eq(authentication), anyMap())).thenReturn("token");

        handler.onAuthenticationSuccess(request, response, authentication);

        verify(request, never()).getSession(false);
        verify(redirectStrategy).sendRedirect(request, response, "/");
        assertEquals(false, response.isCommitted());
    }
}
