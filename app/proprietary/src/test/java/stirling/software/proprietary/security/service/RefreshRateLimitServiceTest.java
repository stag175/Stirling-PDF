package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;

/**
 * Pure unit tests for {@link RefreshRateLimitService}.
 *
 * <p>The service is deterministic in-memory rate-limiting logic: it tracks refresh attempts per
 * token hash and denies the attempt once the count exceeds {@link
 * JwtConstants#MAX_REFRESH_ATTEMPTS_IN_GRACE} (= 3). It is constructed from a plain {@code @Data}
 * {@link ApplicationProperties} instance with no Spring context or database involved.
 *
 * <p>Timing-sensitive grace-window cleanup is exercised deterministically by choosing the grace
 * window so that the comparison outcome is independent of wall-clock jitter:
 *
 * <ul>
 *   <li>A large positive window pushes the cutoff into the past, so the just-created entry is never
 *       removed.
 *   <li>A negative window pushes the cutoff into the future, so the just-created entry is always
 *       removed.
 * </ul>
 */
class RefreshRateLimitServiceTest {

    /**
     * Grace window guaranteed to keep entries (cutoff = now - 1h, well before any firstAttempt).
     */
    private static final long LARGE_GRACE_MILLIS = 3_600_000L;

    /** Grace window guaranteed to evict entries (cutoff = now + 1h, after any firstAttempt). */
    private static final long NEGATIVE_GRACE_MILLIS = -3_600_000L;

    private RefreshRateLimitService service;

    @BeforeEach
    void setUp() {
        service = new RefreshRateLimitService(new ApplicationProperties());
    }

    @Test
    @DisplayName("isRefreshAllowed: first three attempts allowed, fourth denied (threshold = 3)")
    void isRefreshAllowed_allowsUpToThreshold_thenDenies() {
        String tokenHash = "token-hash-abc";

        // Attempts 1..3 -> count 1, 2, 3; none exceeds MAX_REFRESH_ATTEMPTS_IN_GRACE (3).
        assertTrue(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "1st attempt allowed");
        assertTrue(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "2nd attempt allowed");
        assertTrue(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "3rd attempt allowed");

        // Attempt 4 -> count 4 > 3 -> denied.
        assertFalse(
                service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS),
                "4th attempt exceeds the threshold and must be denied");
    }

    @Test
    @DisplayName("isRefreshAllowed: remains denied for all attempts beyond the threshold")
    void isRefreshAllowed_staysDeniedAfterThreshold() {
        String tokenHash = "token-hash-persistent";

        for (int i = 0; i < JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE; i++) {
            assertTrue(
                    service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS),
                    "attempt " + (i + 1) + " within threshold should be allowed");
        }

        // Several further attempts must all be denied (count keeps incrementing past 3).
        assertFalse(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "attempt 4 denied");
        assertFalse(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "attempt 5 denied");
        assertFalse(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "attempt 6 denied");
    }

    @Test
    @DisplayName("isRefreshAllowed: distinct token hashes are tracked independently")
    void isRefreshAllowed_tracksTokensIndependently() {
        String tokenA = "hash-a";
        String tokenB = "hash-b";

        // Exhaust token A's budget.
        assertTrue(service.isRefreshAllowed(tokenA, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(tokenA, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(tokenA, LARGE_GRACE_MILLIS));
        assertFalse(service.isRefreshAllowed(tokenA, LARGE_GRACE_MILLIS), "token A exhausted");

        // Token B has its own independent counter and is still allowed.
        assertTrue(
                service.isRefreshAllowed(tokenB, LARGE_GRACE_MILLIS),
                "token B should be unaffected by token A's exhausted budget");
    }

    @Test
    @DisplayName("isRefreshAllowed: counts tracked tokens and reflects them in stats")
    void isRefreshAllowed_tracksMultipleTokensInStats() {
        service.isRefreshAllowed("hash-1", LARGE_GRACE_MILLIS);
        service.isRefreshAllowed("hash-2", LARGE_GRACE_MILLIS);
        service.isRefreshAllowed("hash-3", LARGE_GRACE_MILLIS);

        assertEquals(
                3,
                service.getStats().get("tracked_tokens"),
                "three distinct token hashes should be tracked");
    }

    @Test
    @DisplayName(
            "isRefreshAllowed: short token hash does not trigger substring exception when denied")
    void isRefreshAllowed_shortTokenHashIsSafeWhenDenied() {
        // The denial branch logs tokenHash.substring(0, min(8, length)); a hash shorter than 8
        // chars must not throw. Empty string is the strictest boundary for that substring call.
        String shortHash = "ab";

        assertTrue(service.isRefreshAllowed(shortHash, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(shortHash, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(shortHash, LARGE_GRACE_MILLIS));
        assertFalse(
                service.isRefreshAllowed(shortHash, LARGE_GRACE_MILLIS),
                "denial path with a short hash must complete without exception");
    }

    @Test
    @DisplayName("isRefreshAllowed: empty token hash is handled without exception on denial")
    void isRefreshAllowed_emptyTokenHashIsSafe() {
        String emptyHash = "";

        assertTrue(service.isRefreshAllowed(emptyHash, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(emptyHash, LARGE_GRACE_MILLIS));
        assertTrue(service.isRefreshAllowed(emptyHash, LARGE_GRACE_MILLIS));
        assertFalse(
                service.isRefreshAllowed(emptyHash, LARGE_GRACE_MILLIS),
                "denial path with an empty hash (substring(0, 0)) must complete without exception");
    }

    @Test
    @DisplayName(
            "isRefreshAllowed: entry evicted when first attempt falls outside the grace window")
    void isRefreshAllowed_evictsEntryOutsideGraceWindow() {
        String tokenHash = "evictable-hash";

        // A negative grace window makes the cleanup cutoff strictly in the future, so the
        // just-created first-attempt instant is always before it and the entry is removed.
        assertTrue(
                service.isRefreshAllowed(tokenHash, NEGATIVE_GRACE_MILLIS),
                "attempt is still allowed (count 1 <= threshold) even though entry is evicted");

        assertEquals(
                0,
                service.getStats().get("tracked_tokens"),
                "entry whose first attempt is outside the grace window should be removed");
    }

    @Test
    @DisplayName("isRefreshAllowed: eviction resets the counter, allowing fresh attempts")
    void isRefreshAllowed_evictionResetsCounter() {
        String tokenHash = "reset-hash";

        // Each call evicts the entry (negative window), so the counter never accumulates and
        // every attempt starts fresh at count 1 -> always allowed.
        for (int i = 0; i < 6; i++) {
            assertTrue(
                    service.isRefreshAllowed(tokenHash, NEGATIVE_GRACE_MILLIS),
                    "repeated attempt " + (i + 1) + " should be allowed after eviction");
        }

        assertEquals(
                0,
                service.getStats().get("tracked_tokens"),
                "no entry should remain tracked after eviction on each attempt");
    }

    @Test
    @DisplayName("isRefreshAllowed: entry retained when first attempt is inside the grace window")
    void isRefreshAllowed_retainsEntryInsideGraceWindow() {
        String tokenHash = "retained-hash";

        // A large positive grace window places the cutoff well in the past, so the entry is kept.
        service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);

        assertEquals(
                1,
                service.getStats().get("tracked_tokens"),
                "entry within the grace window must be retained for rate-limiting");
    }

    @Test
    @DisplayName("clearRefreshAttempts: removes tracking for the given token hash")
    void clearRefreshAttempts_removesTrackedToken() {
        String tokenHash = "clear-hash";

        service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        assertEquals(1, service.getStats().get("tracked_tokens"), "token tracked before clear");

        service.clearRefreshAttempts(tokenHash);

        assertEquals(
                0,
                service.getStats().get("tracked_tokens"),
                "token should no longer be tracked after clearRefreshAttempts");
    }

    @Test
    @DisplayName("clearRefreshAttempts: resets the counter so attempts are allowed again")
    void clearRefreshAttempts_resetsCounterBudget() {
        String tokenHash = "clear-then-retry";

        // Exhaust the budget.
        service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        assertFalse(service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS), "budget exhausted");

        service.clearRefreshAttempts(tokenHash);

        // After clearing, the counter starts fresh and refresh is allowed again.
        assertTrue(
                service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS),
                "after clearing, a fresh attempt should be allowed");
    }

    @Test
    @DisplayName("clearRefreshAttempts: clearing an unknown token hash is a no-op")
    void clearRefreshAttempts_unknownTokenIsNoOp() {
        service.isRefreshAllowed("known-hash", LARGE_GRACE_MILLIS);

        // Removing a hash that was never tracked must not affect existing entries.
        service.clearRefreshAttempts("never-seen-hash");

        assertEquals(
                1,
                service.getStats().get("tracked_tokens"),
                "clearing an unknown token hash must not remove other tracked tokens");
    }

    @Test
    @DisplayName("getStats: reports zero tracked tokens for a fresh service")
    void getStats_initiallyEmpty() {
        Map<String, Object> stats = service.getStats();

        assertEquals(0, stats.get("tracked_tokens"), "fresh service tracks no tokens");
        assertEquals(
                JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE,
                stats.get("max_attempts_allowed"),
                "max_attempts_allowed must equal the configured threshold");
    }

    @Test
    @DisplayName("getStats: max_attempts_allowed is constant regardless of tracked token count")
    void getStats_maxAttemptsAllowedIsConstant() {
        service.isRefreshAllowed("a", LARGE_GRACE_MILLIS);
        service.isRefreshAllowed("b", LARGE_GRACE_MILLIS);

        Map<String, Object> stats = service.getStats();

        assertEquals(2, stats.get("tracked_tokens"));
        assertEquals(
                JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE,
                stats.get("max_attempts_allowed"),
                "threshold reported by stats must not change as tokens are tracked");
    }

    @ParameterizedTest(name = "attempt #{0} within threshold is allowed")
    @ValueSource(ints = {1, 2, 3})
    @DisplayName("isRefreshAllowed: every attempt at or below the threshold is allowed")
    void isRefreshAllowed_attemptsAtOrBelowThresholdAllowed(int attemptNumber) {
        String tokenHash = "param-hash";

        boolean lastResult = false;
        for (int i = 0; i < attemptNumber; i++) {
            lastResult = service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        }

        assertTrue(
                lastResult,
                "attempt #"
                        + attemptNumber
                        + " (<= threshold "
                        + JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE
                        + ") should be allowed");
    }

    @ParameterizedTest(name = "attempt #{0} beyond the threshold is denied")
    @ValueSource(ints = {4, 5, 8})
    @DisplayName("isRefreshAllowed: every attempt beyond the threshold is denied")
    void isRefreshAllowed_attemptsBeyondThresholdDenied(int attemptNumber) {
        String tokenHash = "param-hash-denied";

        boolean lastResult = true;
        for (int i = 0; i < attemptNumber; i++) {
            lastResult = service.isRefreshAllowed(tokenHash, LARGE_GRACE_MILLIS);
        }

        assertFalse(
                lastResult,
                "attempt #"
                        + attemptNumber
                        + " (> threshold "
                        + JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE
                        + ") should be denied");
    }
}
