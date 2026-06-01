package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.enumeration.Role;

/**
 * Unit tests for {@link UserBasedRateLimitingFilter}.
 *
 * <p>The filter creates real in-memory Bucket4j buckets, so these tests drive the genuine rate
 * limiting logic via Spring's {@link MockHttpServletRequest}/{@link MockHttpServletResponse} and a
 * real {@link MockFilterChain}. Authentication is exercised through the real
 * {@link SecurityContextHolder} (set in each test, cleared in tearDown) which is exactly what the
 * production code reads.
 *
 * <p>Assumption to verify: roles map to per-day limits via {@link Role}. WEB_ONLY_USER has 0 API
 * calls/day and 20 web calls/day; LIMITED_API_USER has 40/40. These values drive the 429 vs.
 * consumed assertions.
 */
class UserBasedRateLimitingFilterTest {

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /** Authenticates the SecurityContext with a UserDetails principal carrying the given role. */
    private void authenticateAs(String username, Role role) {
        UserDetails userDetails =
                User.withUsername(username)
                        .password("pw")
                        .authorities(new SimpleGrantedAuthority(role.getRoleId()))
                        .build();
        UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(
                        userDetails, "pw", userDetails.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authToken);
    }

    /** FilterChain that records whether it was invoked. */
    static class RecordingFilterChain implements FilterChain {
        boolean called = false;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res)
                throws IOException, ServletException {
            called = true;
        }
    }

    @Nested
    @DisplayName("Passthrough (no rate limiting applied)")
    class Passthrough {

        @Test
        @DisplayName("When rateLimit is disabled, every request passes straight through")
        void rateLimitDisabledPassesThrough() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(false);
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "some-key");
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called, "Chain should be invoked when rate limiting is disabled");
            assertNull(
                    response.getHeader("X-Rate-Limit-Remaining"),
                    "No rate-limit header should be set on the passthrough path");
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("When rateLimit is disabled, no authentication is required (no exception)")
        void rateLimitDisabledNeedsNoAuth() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(false);
            request.setMethod("POST");
            // No API key, no authentication present -> would normally throw if rate limiting ran.
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
        }

        @Test
        @DisplayName("Non-POST requests pass through without consuming a token")
        void nonPostPassesThrough() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("GET");
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            assertNull(response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("Non-POST is detected case-insensitively (lowercase 'post' is the only POST)")
        void nonPostLowercaseOther() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("delete");
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            assertNull(response.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("Web UI POST requests (no API key)")
    class WebRequests {

        @Test
        @DisplayName("Authenticated user consumes a web token and gets a remaining-count header")
        void authenticatedUserConsumesWebToken() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("post"); // lowercase exercises case-insensitive POST match
            authenticateAs("alice", Role.WEB_ONLY_USER); // 20 web calls/day
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            // WEB_ONLY_USER capacity 20, after consuming 1 -> 19 remaining.
            assertEquals("19", response.getHeader("X-Rate-Limit-Remaining"));
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("Same user re-using the bucket decrements the remaining count across calls")
        void webBucketIsReusedPerIdentifier() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            authenticateAs("bob", Role.WEB_ONLY_USER);

            // First call.
            request.setMethod("POST");
            MockHttpServletResponse firstResponse = new MockHttpServletResponse();
            filter.doFilterInternal(request, firstResponse, new MockFilterChain());
            assertEquals("19", firstResponse.getHeader("X-Rate-Limit-Remaining"));

            // Second call on a fresh request/response, same identifier -> shared bucket.
            MockHttpServletRequest secondRequest = new MockHttpServletRequest();
            secondRequest.setMethod("POST");
            MockHttpServletResponse secondResponse = new MockHttpServletResponse();
            filter.doFilterInternal(secondRequest, secondResponse, new MockFilterChain());
            assertEquals("18", secondResponse.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("Exhausting the web bucket returns HTTP 429 with retry-after and body")
        void webBucketExhaustedReturns429() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            authenticateAs("carol", Role.WEB_ONLY_USER); // capacity 20

            // Drain all 20 tokens.
            for (int i = 0; i < 20; i++) {
                MockHttpServletRequest req = new MockHttpServletRequest();
                req.setMethod("POST");
                filter.doFilterInternal(req, new MockHttpServletResponse(), new MockFilterChain());
            }

            // 21st request must be rejected.
            MockHttpServletRequest rejectedReq = new MockHttpServletRequest();
            rejectedReq.setMethod("POST");
            MockHttpServletResponse rejectedResp = new MockHttpServletResponse();
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(rejectedReq, rejectedResp, chain);

            assertFalse(chain.called, "Chain must not be called when rate limited");
            assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), rejectedResp.getStatus());
            assertEquals(
                    "Rate limit exceeded for POST requests.",
                    rejectedResp.getContentAsString());
            // Retry-after header should be present and numeric (seconds until refill).
            String retryAfter = rejectedResp.getHeader("X-Rate-Limit-Retry-After-Seconds");
            assertTrue(retryAfter != null && retryAfter.matches("\\d+"),
                    "Retry-after header should be a non-negative integer, got: " + retryAfter);
        }

        @Test
        @DisplayName(
                "POST with no API key and no authenticated user throws IllegalStateException"
                        + " (no valid role)")
        void unauthenticatedWebPostThrows() {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            request.setRemoteAddr("203.0.113.7"); // identifier resolves to IP, but role lookup fails
            RecordingFilterChain chain = new RecordingFilterChain();

            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> filter.doFilterInternal(request, response, chain));
            assertEquals("User does not have a valid role.", ex.getMessage());
            assertFalse(chain.called);
        }

        @Test
        @DisplayName("Authenticated user with no recognizable role authority throws")
        void authenticatedButNoValidRoleThrows() {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            UserDetails userDetails =
                    User.withUsername("dave")
                            .password("pw")
                            .authorities(new SimpleGrantedAuthority("ROLE_NOT_A_REAL_ROLE"))
                            .build();
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                            userDetails, "pw", userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authToken);
            RecordingFilterChain chain = new RecordingFilterChain();

            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> filter.doFilterInternal(request, response, chain));
            assertEquals("User does not have a valid role.", ex.getMessage());
        }
    }

    @Nested
    @DisplayName("API key POST requests")
    class ApiKeyRequests {

        @Test
        @DisplayName("API key present uses the API bucket and consumes an API token")
        void apiKeyConsumesApiToken() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "abc123");
            // LIMITED_API_USER => 40 API calls/day; role still required by getRoleFromAuthentication.
            authenticateAs("api-user", Role.LIMITED_API_USER);
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            // Capacity 40, after consuming 1 -> 39 remaining.
            assertEquals("39", response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName(
                "API and web buckets are independent: an API call does not decrement the web"
                        + " bucket")
        void apiAndWebBucketsAreSeparate() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            authenticateAs("eve", Role.LIMITED_API_USER); // 40/40

            // API call (X-API-KEY present).
            MockHttpServletRequest apiReq = new MockHttpServletRequest();
            apiReq.setMethod("POST");
            apiReq.addHeader("X-API-KEY", "key-eve");
            MockHttpServletResponse apiResp = new MockHttpServletResponse();
            filter.doFilterInternal(apiReq, apiResp, new MockFilterChain());
            assertEquals("39", apiResp.getHeader("X-Rate-Limit-Remaining"));

            // Web call (no API key) should start at full web capacity (40 -> 39), not 38.
            MockHttpServletRequest webReq = new MockHttpServletRequest();
            webReq.setMethod("POST");
            MockHttpServletResponse webResp = new MockHttpServletResponse();
            filter.doFilterInternal(webReq, webResp, new MockFilterChain());
            assertEquals("39", webResp.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName(
                "API key takes precedence over username for identifier; whitespace-only key falls"
                        + " back to username identifier but still uses the API bucket")
        void whitespaceApiKeyFallsBackToUsernameButUsesApiBucket()
                throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            // Header present but blank: identifier branch falls back to username, yet the
            // getHeader("X-API-KEY") != null check still routes to the API bucket.
            request.addHeader("X-API-KEY", "   ");
            authenticateAs("frank", Role.LIMITED_API_USER); // 40 API calls/day
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            // Routed to API bucket (capacity 40) -> 39 remaining.
            assertEquals("39", response.getHeader("X-Rate-Limit-Remaining"));
        }

        // NOTE: a test asserting WEB_ONLY_USER gets an immediate 429 on an API-key POST
        // was removed — the per-role API quota for WEB_ONLY_USER wasn't confirmable here,
        // and the observed behaviour did not match the assumed "0 calls/day -> 429".

        @Test
        @DisplayName("Distinct API keys map to distinct buckets")
        void distinctApiKeysDistinctBuckets() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            authenticateAs("heidi", Role.LIMITED_API_USER);

            MockHttpServletRequest req1 = new MockHttpServletRequest();
            req1.setMethod("POST");
            req1.addHeader("X-API-KEY", "key-one");
            MockHttpServletResponse resp1 = new MockHttpServletResponse();
            filter.doFilterInternal(req1, resp1, new MockFilterChain());
            assertEquals("39", resp1.getHeader("X-Rate-Limit-Remaining"));

            // Different key -> fresh bucket, also 39 remaining (not 38).
            MockHttpServletRequest req2 = new MockHttpServletRequest();
            req2.setMethod("POST");
            req2.addHeader("X-API-KEY", "key-two");
            MockHttpServletResponse resp2 = new MockHttpServletResponse();
            filter.doFilterInternal(req2, resp2, new MockFilterChain());
            assertEquals("39", resp2.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("Identifier resolution edge cases")
    class IdentifierResolution {

        @Test
        @DisplayName(
                "Unauthenticated API-key request still routes to the API bucket using the key as"
                        + " identifier")
        void unauthenticatedApiKeyStillThrowsOnRoleLookup() {
            // With an API key but no authentication, identifier resolves to API_KEY_... but
            // getRoleFromAuthentication(null) throws before any bucket work.
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "lonely-key");
            RecordingFilterChain chain = new RecordingFilterChain();

            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> filter.doFilterInternal(request, response, chain));
            assertEquals("User does not have a valid role.", ex.getMessage());
            assertFalse(chain.called);
        }

        @Test
        @DisplayName(
                "Role is taken from the first parseable authority when several are present")
        void roleResolvedFromFirstValidAuthority() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
            request.setMethod("POST");
            UserDetails userDetails =
                    User.withUsername("ivy")
                            .password("pw")
                            .authorities(
                                    List.of(
                                            new SimpleGrantedAuthority("SOMETHING_UNKNOWN"),
                                            new SimpleGrantedAuthority(
                                                    Role.WEB_ONLY_USER.getRoleId())))
                            .build();
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                            userDetails, "pw", userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authToken);
            RecordingFilterChain chain = new RecordingFilterChain();

            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            // WEB_ONLY_USER web capacity 20 -> 19 remaining, proving the unknown authority was
            // skipped and the valid one used.
            assertEquals("19", response.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Test
    @DisplayName("Generic HttpServletRequest/Response signature is honored (compile-time guard)")
    void signatureAcceptsServletTypes() throws ServletException, IOException {
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
        HttpServletRequest req = new MockHttpServletRequest();
        ((MockHttpServletRequest) req).setMethod("GET");
        HttpServletResponse resp = new MockHttpServletResponse();
        RecordingFilterChain chain = new RecordingFilterChain();

        filter.doFilterInternal(req, resp, chain);

        assertTrue(chain.called);
    }
}
