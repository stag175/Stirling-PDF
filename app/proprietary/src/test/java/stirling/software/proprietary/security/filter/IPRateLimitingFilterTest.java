package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

/**
 * Unit tests for {@link IPRateLimitingFilter}.
 *
 * <p>The filter is a plain servlet {@link jakarta.servlet.Filter} with no Spring context required.
 * We drive it with Spring's {@link MockHttpServletRequest}/{@link MockHttpServletResponse} (which
 * provide a real {@code getWriter()} so the rate-limit message can be asserted) and a Mockito-mocked
 * {@link FilterChain} so chain invocation can be verified.
 *
 * <p>Notable behaviour of the production class that these tests pin down:
 *
 * <ul>
 *   <li>The real {@code RequestUriUtils.isStaticResource(...)} static method is exercised directly
 *       (not mocked); static resource URIs such as {@code /css/...} short-circuit and always pass
 *       through the chain regardless of count.
 *   <li>Both GET and non-GET branches increment the SAME {@code requestCounts} map; {@code
 *       getCounts} is never incremented (only cleared by {@code resetRequestCounts()}).
 *   <li>The threshold is strictly greater-than: a count equal to the max is still allowed; the
 *       first request that makes the count exceed the max is blocked.
 *   <li>When the limit is exceeded the filter writes a message and returns WITHOUT calling the
 *       chain.
 * </ul>
 */
class IPRateLimitingFilterTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final String DYNAMIC_URI = "/api/v1/general/merge-pdfs";

    private MockHttpServletRequest newRequest(String method, String uri, String remoteAddr) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setMethod(method);
        request.setRequestURI(uri);
        request.setContextPath("");
        request.setRemoteAddr(remoteAddr);
        return request;
    }

    // ---------------------------------------------------------------------
    // Static resource skip branch
    // ---------------------------------------------------------------------

    @Test
    void staticResourceAlwaysPassesThroughChainEvenBeyondLimit()
            throws ServletException, IOException {
        // maxRequests/maxGetRequests = 0 so any counted request would be blocked,
        // proving the static-resource branch skips counting entirely.
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 0);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("GET", "/css/app.css", CLIENT_IP);

        // Call several times - all should pass straight through.
        filter.doFilter(request, response, chain);
        filter.doFilter(request, response, chain);
        filter.doFilter(request, response, chain);

        verify(chain, times(3)).doFilter(request, response);
        assertEquals("", response.getContentAsString());
    }

    // ---------------------------------------------------------------------
    // Non-HttpServletRequest branch (instanceof guard fails)
    // ---------------------------------------------------------------------

    @Test
    void nonHttpServletRequestSkipsAllLogicAndContinuesChain()
            throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 0);
        ServletRequest request = mock(ServletRequest.class);
        ServletResponse response = mock(ServletResponse.class);
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        // Falls through to the final chain.doFilter without touching request/response.
        verify(chain).doFilter(request, response);
        verifyNoInteractions(request);
        verifyNoInteractions(response);
    }

    // ---------------------------------------------------------------------
    // GET branch
    // ---------------------------------------------------------------------

    @Test
    void getRequestUnderLimitPassesThrough() throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 5);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("GET", DYNAMIC_URI, CLIENT_IP);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertEquals("", response.getContentAsString());
    }

    @Test
    void getRequestAtExactLimitIsStillAllowed() throws ServletException, IOException {
        // maxGetRequests = 2: counts 1 and 2 are allowed (incrementAndGet > max is false),
        // count 3 is blocked.
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 2);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("GET", DYNAMIC_URI, CLIENT_IP);

        MockHttpServletResponse first = new MockHttpServletResponse();
        MockHttpServletResponse second = new MockHttpServletResponse();
        filter.doFilter(request, first, chain); // count 1 -> 1 > 2 false -> allowed
        filter.doFilter(request, second, chain); // count 2 -> 2 > 2 false -> allowed

        verify(chain).doFilter(request, first);
        verify(chain).doFilter(request, second);
        assertEquals("", first.getContentAsString());
        assertEquals("", second.getContentAsString());

        // count 3 -> 3 > 2 true -> blocked
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(request, blocked, chain);
        verify(chain, never()).doFilter(request, blocked);
        assertEquals("GET Rate limit exceeded", blocked.getContentAsString());
    }

    @Test
    void getRequestExceedingLimitIsBlockedWithGetMessage() throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 1);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("GET", DYNAMIC_URI, CLIENT_IP);

        // count 1 -> allowed (1 > 1 is false)
        MockHttpServletResponse firstResponse = new MockHttpServletResponse();
        filter.doFilter(request, firstResponse, chain);

        // count 2 -> blocked (2 > 1 is true)
        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        filter.doFilter(request, blockedResponse, chain);

        // Chain invoked once (for the allowed request), never for the blocked one.
        verify(chain, times(1)).doFilter(request, firstResponse);
        verify(chain, never()).doFilter(request, blockedResponse);
        assertEquals("", firstResponse.getContentAsString());
        assertEquals("GET Rate limit exceeded", blockedResponse.getContentAsString());
    }

    // ---------------------------------------------------------------------
    // Non-GET branch (POST / PUT / DELETE etc.)
    // ---------------------------------------------------------------------

    @Test
    void postRequestUnderLimitPassesThrough() throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(5, 0);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("POST", DYNAMIC_URI, CLIENT_IP);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertEquals("", response.getContentAsString());
    }

    @Test
    void postRequestExceedingLimitIsBlockedWithNonGetMessage()
            throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(1, 0);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("POST", DYNAMIC_URI, CLIENT_IP);

        MockHttpServletResponse firstResponse = new MockHttpServletResponse();
        filter.doFilter(request, firstResponse, chain); // count 1 -> allowed

        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        filter.doFilter(request, blockedResponse, chain); // count 2 -> blocked

        verify(chain, times(1)).doFilter(request, firstResponse);
        verify(chain, never()).doFilter(request, blockedResponse);
        assertEquals("Rate limit exceeded", blockedResponse.getContentAsString());
    }

    @Test
    void lowercaseGetMethodIsTreatedAsGet() throws ServletException, IOException {
        // "GET".equalsIgnoreCase(method) must take the GET branch even for lowercase "get",
        // so the GET message (not the non-GET message) is produced when blocked.
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 0);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("get", DYNAMIC_URI, CLIENT_IP);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain); // count 1 -> 1 > 0 true -> blocked

        verify(chain, never()).doFilter(request, response);
        assertEquals("GET Rate limit exceeded", response.getContentAsString());
    }

    // ---------------------------------------------------------------------
    // Per-IP isolation: counts are keyed by remote address
    // ---------------------------------------------------------------------

    @Test
    void countsAreTrackedPerClientIp() throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 1);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest ipA = newRequest("GET", DYNAMIC_URI, "1.1.1.1");
        MockHttpServletRequest ipB = newRequest("GET", DYNAMIC_URI, "2.2.2.2");

        // Each IP gets its own counter: first request for each is allowed.
        MockHttpServletResponse respA = new MockHttpServletResponse();
        MockHttpServletResponse respB = new MockHttpServletResponse();
        filter.doFilter(ipA, respA, chain);
        filter.doFilter(ipB, respB, chain);

        verify(chain).doFilter(ipA, respA);
        verify(chain).doFilter(ipB, respB);
        assertEquals("", respA.getContentAsString());
        assertEquals("", respB.getContentAsString());
    }

    // ---------------------------------------------------------------------
    // resetRequestCounts
    // ---------------------------------------------------------------------

    @Test
    void resetRequestCountsAllowsTrafficAgainAfterLimitHit() throws ServletException, IOException {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(0, 1);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = newRequest("GET", DYNAMIC_URI, CLIENT_IP);

        filter.doFilter(request, new MockHttpServletResponse(), chain); // count 1 -> allowed

        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        filter.doFilter(request, blockedResponse, chain); // count 2 -> blocked
        assertEquals("GET Rate limit exceeded", blockedResponse.getContentAsString());

        // After reset, the counter is cleared and the next request is allowed again.
        filter.resetRequestCounts();

        MockHttpServletResponse afterReset = new MockHttpServletResponse();
        filter.doFilter(request, afterReset, chain);
        assertEquals("", afterReset.getContentAsString());

        // chain called for the first request and the post-reset request (2 total),
        // never for the blocked one.
        verify(chain, times(2))
                .doFilter(org.mockito.ArgumentMatchers.eq(request), any(MockHttpServletResponse.class));
        verify(chain, never()).doFilter(request, blockedResponse);
    }

    @Test
    void resetRequestCountsOnFreshFilterDoesNotThrow() {
        IPRateLimitingFilter filter = new IPRateLimitingFilter(5, 5);
        // Should be a safe no-op clearing two empty maps.
        filter.resetRequestCounts();
        assertTrue(true);
    }
}
