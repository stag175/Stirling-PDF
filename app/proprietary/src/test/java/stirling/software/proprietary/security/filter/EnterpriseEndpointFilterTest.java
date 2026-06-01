package stirling.software.proprietary.security.filter;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@ExtendWith(MockitoExtension.class)
class EnterpriseEndpointFilterTest {

    @Mock private HttpServletRequest request;

    @Mock private HttpServletResponse response;

    @Mock private FilterChain filterChain;

    // --- Pro / higher: filter is a no-op gate, everything passes through ---

    @Test
    void proUser_actuatorNonHealthEndpoint_passesThrough()
            throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(true);
        // getRequestURI is only consulted by isPrometheusEndpointRequest, which is short-circuited
        // by the runningProOrHigher check, so it should never be queried.
        lenient().when(request.getRequestURI()).thenReturn("/actuator/prometheus");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void proUser_nonActuatorEndpoint_passesThrough() throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(true);
        lenient().when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    // --- Non-pro: non-actuator URIs are never blocked ---

    @Test
    void nonProUser_nonActuatorEndpoint_passesThrough() throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void nonProUser_uriContainingActuatorWithoutTrailingSlash_passesThrough()
            throws ServletException, IOException {
        // isPrometheusEndpointRequest requires the literal substring "/actuator/"; a path like
        // "/actuator" (no trailing slash) is NOT treated as a prometheus endpoint.
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    // --- Non-pro: actuator non-health endpoints are blocked with 404 ---

    @Test
    void nonProUser_actuatorPrometheusEndpoint_blockedWith404()
            throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/prometheus");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpStatus.NOT_FOUND.value());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void nonProUser_actuatorMetricsEndpoint_blockedWith404()
            throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/metrics");
        when(request.getContextPath()).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpStatus.NOT_FOUND.value());
        verify(filterChain, never()).doFilter(request, response);
    }

    // --- Non-pro: actuator health checks are allowed through ---

    @Test
    void nonProUser_actuatorHealthEndpoint_passesThrough()
            throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/health");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void nonProUser_actuatorHealthLivenessSubPath_passesThrough()
            throws ServletException, IOException {
        // trimmedUri.startsWith("/actuator/health") covers sub-paths like .../liveness
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/health/liveness");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    // --- Context-path stripping ---

    @Test
    void nonProUser_actuatorHealthBehindContextPath_passesThrough()
            throws ServletException, IOException {
        // URI carries the context path prefix; after stripping it matches "/actuator/health".
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/stirling/actuator/health");
        when(request.getContextPath()).thenReturn("/stirling");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void nonProUser_actuatorPrometheusBehindContextPath_blockedWith404()
            throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/stirling/actuator/prometheus");
        when(request.getContextPath()).thenReturn("/stirling");

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpStatus.NOT_FOUND.value());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void nonProUser_contextPathPresentButUriDoesNotStartWithIt_usesFullUri()
            throws ServletException, IOException {
        // contextPath is non-null but the URI does not start with it, so the ternary keeps the
        // full URI. The full URI is an actuator non-health path, so it is blocked.
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/prometheus");
        when(request.getContextPath()).thenReturn("/other");

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpStatus.NOT_FOUND.value());
        verify(filterChain, never()).doFilter(request, response);
    }

    // --- Bare health-check aliases require an actuator URI to even reach the strip logic ---

    @Test
    void nonProUser_bareHealthAlias_neverReachesHealthCheckBranch_blocked()
            throws ServletException, IOException {
        // "/actuator/health" is reachable, but a bare "/health" alias is only meaningful when the
        // request is also an actuator request. Here the prometheus check fails (no "/actuator/"),
        // so a plain "/health" simply passes straight through the chain.
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/health");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void nonProUser_actuatorUriWhoseTrimmedFormIsBareHealthAlias_passesThrough()
            throws ServletException, IOException {
        // Context path equals the actuator path so that stripping yields exactly "/healthz",
        // exercising the "/healthz".equals(trimmedUri) alias branch while still being an actuator
        // request (URI contains "/actuator/").
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/healthz");
        when(request.getContextPath()).thenReturn("/actuator");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/health", "/healthz", "/liveness", "/readiness"})
    void nonProUser_eachBareHealthAliasAfterContextStrip_passesThrough(String alias)
            throws ServletException, IOException {
        // Build an actuator URI whose context-path-stripped remainder is exactly the bare alias,
        // covering each of the four equals(...) health-alias branches.
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator" + alias);
        when(request.getContextPath()).thenReturn("/actuator");

        filter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(eq(HttpStatus.NOT_FOUND.value()));
    }

    @Test
    void blockedRequest_doesNotTouchFilterChainAtAll() throws ServletException, IOException {
        EnterpriseEndpointFilter filter = new EnterpriseEndpointFilter(false);
        when(request.getRequestURI()).thenReturn("/actuator/env");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpStatus.NOT_FOUND.value());
        verifyNoInteractions(filterChain);
    }
}
