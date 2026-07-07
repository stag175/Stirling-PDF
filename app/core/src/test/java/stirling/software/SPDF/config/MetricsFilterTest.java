package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Unit tests for {@link MetricsFilter}.
 *
 * <p>The filter is exercised by calling the {@code protected doFilterInternal} method directly;
 * this test lives in the same package as the production class, so {@code protected} access is
 * permitted. A real {@link SimpleMeterRegistry} is used so we can assert on the recorded
 * {@code http.requests} counters and their tags, while the servlet objects are Mockito mocks.
 */
class MetricsFilterTest {

    private SimpleMeterRegistry meterRegistry;
    private MetricsFilter filter;
    private HttpServletRequest request;
    private HttpServletResponse response;
    private FilterChain filterChain;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        filter = new MetricsFilter(meterRegistry);
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        filterChain = mock(FilterChain.class);
    }

    private Counter findHttpRequestsCounter() {
        return meterRegistry.find("http.requests").counter();
    }

    @Test
    void trackableRequestWithSessionIncrementsCounterWithSessionTag() throws Exception {
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("session-123");
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
        when(request.getContextPath()).thenReturn("");
        when(request.getMethod()).thenReturn("POST");
        when(request.getSession(false)).thenReturn(session);

        filter.doFilterInternal(request, response, filterChain);

        Counter counter = findHttpRequestsCounter();
        assertNotNull(counter, "Trackable URI should register an http.requests counter");
        assertEquals(1.0, counter.count(), 0.0);
        assertEquals("session-123", counter.getId().getTag("session"));
        assertEquals("POST", counter.getId().getTag("method"));
        assertEquals("/api/v1/general/merge-pdfs", counter.getId().getTag("uri"));
        // The chain must always continue.
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void trackableRequestWithoutSessionUsesNoSessionTag() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
        when(request.getContextPath()).thenReturn("");
        when(request.getMethod()).thenReturn("GET");
        // getSession(false) returns null when no session exists -> "no-session"
        when(request.getSession(false)).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);

        Counter counter = findHttpRequestsCounter();
        assertNotNull(counter);
        assertEquals(1.0, counter.count(), 0.0);
        assertEquals("no-session", counter.getId().getTag("session"));
        assertEquals("GET", counter.getId().getTag("method"));
        verify(filterChain).doFilter(request, response);
        // Session id is never read because the session is null.
        verify(request).getSession(false);
    }

    @Test
    void nonTrackableStaticResourceDoesNotIncrementCounterButContinuesChain() throws Exception {
        // URIs starting with "/js" are filtered out by RequestUriUtils.isTrackableResource.
        when(request.getRequestURI()).thenReturn("/js/bundle.js");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        assertNull(findHttpRequestsCounter(), "Non-trackable URI must not register a counter");
        // No counter means no session lookup, method lookup, etc.
        verify(request, never()).getSession(anyBoolean());
        verify(request, never()).getMethod();
        // The chain must still continue for non-trackable resources.
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void apiInfoEndpointIsNotTracked() throws Exception {
        // "/api/v1/info" prefix is explicitly excluded from tracking.
        when(request.getRequestURI()).thenReturn("/api/v1/info/status");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        assertNull(findHttpRequestsCounter());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void swaggerUriIsNotTracked() throws Exception {
        // Any URI containing "swagger" is excluded.
        when(request.getRequestURI()).thenReturn("/some/swagger-ui/index.html");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        assertNull(findHttpRequestsCounter());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void pngExtensionIsNotTracked() throws Exception {
        when(request.getRequestURI()).thenReturn("/branding/logo.png");
        when(request.getContextPath()).thenReturn("");

        filter.doFilterInternal(request, response, filterChain);

        assertNull(findHttpRequestsCounter());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void repeatedTrackableRequestsAccumulateOnSameCounter() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
        when(request.getContextPath()).thenReturn("");
        when(request.getMethod()).thenReturn("POST");
        when(request.getSession(false)).thenReturn(null);

        filter.doFilterInternal(request, response, filterChain);
        filter.doFilterInternal(request, response, filterChain);
        filter.doFilterInternal(request, response, filterChain);

        Counter counter = findHttpRequestsCounter();
        assertNotNull(counter);
        // Identical tags (session/method/uri) resolve to the same counter instance.
        assertEquals(3.0, counter.count(), 0.0);
        assertEquals(1, meterRegistry.find("http.requests").counters().size());
        verify(filterChain, times(3)).doFilter(request, response);
    }

    @Test
    void differentUrisCreateSeparateCounters() throws Exception {
        HttpServletRequest first = mock(HttpServletRequest.class);
        when(first.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
        when(first.getContextPath()).thenReturn("");
        when(first.getMethod()).thenReturn("POST");
        when(first.getSession(false)).thenReturn(null);

        HttpServletRequest second = mock(HttpServletRequest.class);
        when(second.getRequestURI()).thenReturn("/api/v1/general/split-pdf");
        when(second.getContextPath()).thenReturn("");
        when(second.getMethod()).thenReturn("POST");
        when(second.getSession(false)).thenReturn(null);

        filter.doFilterInternal(first, response, filterChain);
        filter.doFilterInternal(second, response, filterChain);

        // Two distinct uri tags -> two distinct counters, each incremented once.
        assertEquals(2, meterRegistry.find("http.requests").counters().size());
        assertEquals(
                2.0,
                meterRegistry.find("http.requests").counters().stream()
                        .mapToDouble(Counter::count)
                        .sum(),
                0.0);
    }

    @Test
    void doFilterInternalPropagatesFilterChainException() throws Exception {
        when(request.getRequestURI()).thenReturn("/api/v1/general/merge-pdfs");
        when(request.getContextPath()).thenReturn("");
        when(request.getMethod()).thenReturn("POST");
        when(request.getSession(false)).thenReturn(null);
        jakarta.servlet.ServletException boom = new jakarta.servlet.ServletException("boom");
        doThrow(boom).when(filterChain).doFilter(request, response);

        jakarta.servlet.ServletException thrown =
                assertThrows(
                        jakarta.servlet.ServletException.class,
                        () -> filter.doFilterInternal(request, response, filterChain));
        assertSame(boom, thrown);
        // The counter was still incremented before the chain threw.
        Counter counter = findHttpRequestsCounter();
        assertNotNull(counter);
        assertEquals(1.0, counter.count(), 0.0);
    }
}
