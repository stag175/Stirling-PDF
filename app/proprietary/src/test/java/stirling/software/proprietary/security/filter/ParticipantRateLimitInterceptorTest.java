package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Pure unit tests for {@link ParticipantRateLimitInterceptor}.
 *
 * <p>The interceptor is a plain {@link org.springframework.web.servlet.HandlerInterceptor} with no
 * Spring/IO collaborators: it keeps a per-IP sliding-window counter in an in-memory {@link
 * ConcurrentHashMap} and rejects the request with HTTP 429 once more than 20 requests arrive from
 * the same {@code request.getRemoteAddr()} within a 60-second window. The HttpServletRequest /
 * HttpServletResponse are mocked, and the {@code response.getWriter()} is backed by an in-memory
 * {@link StringWriter} so the JSON error body can be asserted without any real network or file IO.
 *
 * <p>The window-start timestamps and {@code cleanupExpiredWindows()} cutoff both derive from {@code
 * System.currentTimeMillis()}, which cannot be injected. The eviction test therefore reaches into
 * the package-private {@code requestCounts} map directly (same package, no reflection) and seeds
 * entries with explicit window-start timestamps (one far in the past, one "now") so the cutoff
 * comparison is independent of wall-clock jitter. The field is named {@code requestCounts} and
 * stores {@code long[]{count, windowStartMs}}.
 */
@ExtendWith(MockitoExtension.class)
class ParticipantRateLimitInterceptorTest {

    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;

    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;

    private ParticipantRateLimitInterceptor interceptor;
    private StringWriter responseBody;

    @BeforeEach
    void setUp() throws Exception {
        interceptor = new ParticipantRateLimitInterceptor();
        responseBody = new StringWriter();
        // Mockito is lenient here because the "allowed" tests never touch the writer / status.
        lenient().when(response.getWriter()).thenReturn(new PrintWriter(responseBody));
        lenient().when(request.getRemoteAddr()).thenReturn("203.0.113.7");
        lenient().when(request.getRequestURI()).thenReturn("/api/v1/participant/token");
    }

    // requestCounts is package-private: return it directly (no reflection).
    private ConcurrentHashMap<String, long[]> requestCounts() {
        return interceptor.requestCounts;
    }

    @Test
    @DisplayName("preHandle: first request from an IP is allowed and does not touch the response")
    void preHandle_firstRequest_allowed() throws Exception {
        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result, "first request must be allowed");
        verify(response, never()).setStatus(anyInt());
        verify(response, never()).setHeader(anyString(), anyString());
        assertEquals("", responseBody.toString(), "no error body should be written when allowed");
    }

    @Test
    @DisplayName("preHandle: exactly MAX_REQUESTS_PER_MINUTE requests are all allowed")
    void preHandle_atLimit_allAllowed() throws Exception {
        for (int i = 1; i <= MAX_REQUESTS_PER_MINUTE; i++) {
            assertTrue(
                    interceptor.preHandle(request, response, new Object()),
                    "request #" + i + " (<= limit) must be allowed");
        }
        verify(response, never()).setStatus(anyInt());
        assertEquals("", responseBody.toString());
    }

    @Test
    @DisplayName(
            "preHandle: the request beyond the limit is rejected with 429 + Retry-After + JSON")
    void preHandle_overLimit_rejectedWith429() throws Exception {
        // Burn through the allowed quota.
        for (int i = 1; i <= MAX_REQUESTS_PER_MINUTE; i++) {
            assertTrue(interceptor.preHandle(request, response, new Object()));
        }

        // The next request (count = 21) exceeds the limit.
        boolean result = interceptor.preHandle(request, response, new Object());

        assertFalse(result, "request over the limit must be rejected");
        verify(response).setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        verify(response).setStatus(429);
        verify(response).setHeader("Retry-After", "60");
        verify(response).setContentType("application/json");
        assertEquals(
                "{\"error\":\"Rate limit exceeded. Try again in 60 seconds.\"}",
                responseBody.toString());
    }

    @Test
    @DisplayName("preHandle: counter is tracked independently per client IP")
    void preHandle_perIpIsolation() throws Exception {
        // Exhaust the quota for the default IP.
        for (int i = 1; i <= MAX_REQUESTS_PER_MINUTE; i++) {
            assertTrue(interceptor.preHandle(request, response, new Object()));
        }

        // A different IP starts a fresh window and is allowed.
        when(request.getRemoteAddr()).thenReturn("198.51.100.42");
        assertTrue(
                interceptor.preHandle(request, response, new Object()),
                "a different IP must have its own independent window");

        ConcurrentHashMap<String, long[]> counts = requestCounts();
        assertEquals(20L, counts.get("203.0.113.7")[0], "original IP count preserved");
        assertEquals(1L, counts.get("198.51.100.42")[0], "second IP starts at 1");
    }

    @Test
    @DisplayName("preHandle: a stale window (older than WINDOW_MS) resets the counter to 1")
    void preHandle_expiredWindow_resetsCounter() throws Exception {
        String ip = "203.0.113.7";
        // Seed an existing entry whose window started well over a minute ago and was nearly full.
        long staleStart = System.currentTimeMillis() - (WINDOW_MS + 5_000L);
        requestCounts().put(ip, new long[] {MAX_REQUESTS_PER_MINUTE, staleStart});

        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result, "request in a fresh window after expiry must be allowed");
        long[] entry = requestCounts().get(ip);
        assertEquals(1L, entry[0], "expired window resets the count to 1");
        assertTrue(entry[1] > staleStart, "window-start timestamp must be refreshed to ~now");
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    @DisplayName("preHandle: an active window increments the existing counter in place")
    void preHandle_activeWindow_incrementsExistingEntry() throws Exception {
        String ip = "203.0.113.7";
        long start = System.currentTimeMillis();
        requestCounts().put(ip, new long[] {3, start});

        assertTrue(interceptor.preHandle(request, response, new Object()));

        long[] entry = requestCounts().get(ip);
        assertEquals(4L, entry[0], "count incremented within active window");
        assertEquals(start, entry[1], "window-start timestamp unchanged for active window");
    }

    @Test
    @DisplayName("cleanupExpiredWindows: evicts entries whose window started before the cutoff")
    void cleanupExpiredWindows_evictsExpiredEntries() throws Exception {
        ConcurrentHashMap<String, long[]> counts = requestCounts();
        long now = System.currentTimeMillis();
        // Expired: started more than WINDOW_MS ago, so windowStart < (now - WINDOW_MS).
        counts.put("expired-ip", new long[] {5, now - (WINDOW_MS + 10_000L)});
        // Fresh: started just now, well after the cutoff.
        counts.put("fresh-ip", new long[] {2, now});

        interceptor.cleanupExpiredWindows();

        assertFalse(counts.containsKey("expired-ip"), "expired window must be evicted");
        assertTrue(counts.containsKey("fresh-ip"), "fresh window must be retained");
        assertEquals(1, counts.size());
    }

    @Test
    @DisplayName("cleanupExpiredWindows: no-op when the map is empty")
    void cleanupExpiredWindows_emptyMapIsNoOp() throws Exception {
        ConcurrentHashMap<String, long[]> counts = requestCounts();
        assertTrue(counts.isEmpty());

        interceptor.cleanupExpiredWindows();

        assertTrue(counts.isEmpty(), "cleanup on an empty map must not fail or add entries");
    }

    @Test
    @DisplayName(
            "getClientIp: the rate-limit key is request.getRemoteAddr(), not a spoofable header")
    void preHandle_usesRemoteAddrNotForwardedHeader() throws Exception {
        when(request.getRemoteAddr()).thenReturn("10.1.2.3");

        assertTrue(interceptor.preHandle(request, response, new Object()));

        ConcurrentHashMap<String, long[]> counts = requestCounts();
        assertNotNull(counts.get("10.1.2.3"), "entry must be keyed by remote address");
        verify(request).getRemoteAddr();
        // X-Forwarded-For (or any header) must never be consulted for the rate-limit key.
        verify(request, never()).getHeader(anyString());
    }
}
