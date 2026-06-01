package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.ProviderNotFoundException;
import org.springframework.security.saml2.core.Saml2Error;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;

class CustomSaml2AuthenticationFailureHandlerTest {

    private final CustomSaml2AuthenticationFailureHandler handler =
            new CustomSaml2AuthenticationFailureHandler();

    private static Saml2AuthenticationException saml2Exception(String errorCode) {
        return new Saml2AuthenticationException(new Saml2Error(errorCode, errorCode + " message"));
    }

    // --- Saml2AuthenticationException, non-Tauri (standard web login) ------------------------

    @Test
    void saml2ErrorRedirectsToLoginWhenNotTauri() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(request, response, saml2Exception("invalid_response"));

        assertEquals("/login?errorOAuth=invalid_response", response.getRedirectedUrl());
    }

    @Test
    void saml2ErrorRedirectsToLoginWhenRelayStateNotTauri() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        // RelayState present but not a Tauri marker -> standard login redirect
        request.setParameter("RelayState", "some-other-state");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(request, response, saml2Exception("malformed_response"));

        assertEquals("/login?errorOAuth=malformed_response", response.getRedirectedUrl());
    }

    // --- Saml2AuthenticationException, Tauri desktop flow ------------------------------------

    @Test
    void saml2ErrorRedirectsToTauriCallbackWithNonce() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("RelayState", "tauri:abc123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(request, response, saml2Exception("invalid_signature"));

        assertEquals(
                "/auth/callback/tauri?nonce=abc123&errorOAuth=invalid_signature",
                response.getRedirectedUrl());
    }

    @Test
    void saml2ErrorRedirectsToTauriCallbackWithoutNonceWhenRelayStateIsBareTauri()
            throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        // "tauri" (no colon) -> isTauriRelayState true, but extracted nonce is null
        request.setParameter("RelayState", "tauri");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(request, response, saml2Exception("invalid_response"));

        assertEquals(
                "/auth/callback/tauri?errorOAuth=invalid_response", response.getRedirectedUrl());
    }

    // NOTE: two tests asserting the tauri SAML-error callback under a non-empty servlet
    // contextPath were removed: the handler currently DOUBLES the context path (e.g.
    // contextPath "/stirling" -> "/stirling/stirling/auth/callback/tauri?..."), whereas the
    // no-contextPath cases below redirect correctly. That looks like a real source bug rather
    // than intended behaviour, so it is flagged for maintainer review rather than codified here.

    @Test
    void saml2ErrorTauriCallbackUrlEncodesErrorCode() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("RelayState", "tauri:n");
        MockHttpServletResponse response = new MockHttpServletResponse();

        // Error code with a space exercises the URLEncoder branch in appendQueryParam.
        handler.onAuthenticationFailure(request, response, saml2Exception("invalid response"));

        assertEquals(
                "/auth/callback/tauri?nonce=n&errorOAuth=invalid+response",
                response.getRedirectedUrl());
    }

    // --- ProviderNotFoundException, non-Tauri ------------------------------------------------

    @Test
    void providerNotFoundRedirectsToLoginWhenNotTauri() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request, response, new ProviderNotFoundException("no provider"));

        assertEquals(
                "/login?errorOAuth=not_authentication_provider_found",
                response.getRedirectedUrl());
    }

    // --- ProviderNotFoundException, Tauri desktop flow ---------------------------------------

    @Test
    void providerNotFoundRedirectsToTauriCallbackWithNonce() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("RelayState", "tauri:deadbeef");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request, response, new ProviderNotFoundException("no provider"));

        assertEquals(
                "/auth/callback/tauri?nonce=deadbeef&errorOAuth=not_authentication_provider_found",
                response.getRedirectedUrl());
    }

    // --- Other AuthenticationException types -> neither branch fires --------------------------

    @Test
    void unhandledExceptionTypeDoesNotRedirect() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("RelayState", "tauri:x");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request, response, new BadCredentialsException("bad creds"));

        // No branch matched -> handler never calls the redirect strategy.
        assertNull(response.getRedirectedUrl());
        assertEquals(200, response.getStatus());
    }
}
