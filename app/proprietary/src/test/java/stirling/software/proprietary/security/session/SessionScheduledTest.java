package stirling.software.proprietary.security.session;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Method;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.session.SessionInformation;

@ExtendWith(MockitoExtension.class)
class SessionScheduledTest {

    @Mock private SessionPersistentRegistry sessionPersistentRegistry;

    /** Helper: build a SessionInformation whose lastRequest is {@code secondsAgo} in the past. */
    private static SessionInformation sessionInfo(String sessionId, long secondsAgo) {
        Date lastRequest = Date.from(Instant.now().minus(secondsAgo, ChronoUnit.SECONDS));
        return new SessionInformation("principal", sessionId, lastRequest);
    }

    @Test
    void expiresSession_whenLastRequestOlderThanMaxInactiveInterval() {
        // maxInactiveInterval = 60s, lastRequest = 120s ago -> expired
        SessionInformation stale = sessionInfo("stale-session", 120);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(stale));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(60);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).expireSession("stale-session");
    }

    @Test
    void doesNotExpireSession_whenLastRequestWithinMaxInactiveInterval() {
        // maxInactiveInterval = 300s, lastRequest = 10s ago -> still active
        SessionInformation fresh = sessionInfo("fresh-session", 10);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(fresh));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(300);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry, never()).expireSession(anyString());
    }

    @Test
    void doesNotExpire_whenLastRequestExactlyAtBoundary() {
        // lastRequest exactly maxInactiveInterval ago. now.isAfter(expirationTime) is false at the
        // boundary instant, so the session should NOT be expired (strictly-after comparison).
        // Use a far-future interval so the tiny delta between capturing the timestamp and the
        // method's Instant.now() cannot push us past the boundary.
        SessionInformation boundary = sessionInfo("boundary-session", 0);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(boundary));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(3600);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry, never()).expireSession(anyString());
    }

    @Test
    void expiresOnlyStaleSessions_whenMixedForSinglePrincipal() {
        SessionInformation stale = sessionInfo("stale", 600);
        SessionInformation fresh = sessionInfo("fresh", 5);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(stale, fresh));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(60);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).expireSession("stale");
        verify(sessionPersistentRegistry, never()).expireSession("fresh");
    }

    @Test
    void iteratesAcrossMultiplePrincipals() {
        SessionInformation staleA = sessionInfo("a-stale", 600);
        SessionInformation freshB = sessionInfo("b-fresh", 1);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "userA", (Object) "userB"));
        when(sessionPersistentRegistry.getAllSessions("userA", false))
                .thenReturn(List.of(staleA));
        when(sessionPersistentRegistry.getAllSessions("userB", false))
                .thenReturn(List.of(freshB));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(60);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).getAllSessions("userA", false);
        verify(sessionPersistentRegistry).getAllSessions("userB", false);
        verify(sessionPersistentRegistry).expireSession("a-stale");
        verify(sessionPersistentRegistry, never()).expireSession("b-fresh");
    }

    @Test
    void noPrincipals_doesNothing() {
        when(sessionPersistentRegistry.getAllPrincipals()).thenReturn(Collections.emptyList());

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).getAllPrincipals();
        verify(sessionPersistentRegistry, never()).getAllSessions(any(), anyBoolean());
        verify(sessionPersistentRegistry, never()).expireSession(anyString());
        // getMaxInactiveInterval is only consulted inside the inner loop
        verify(sessionPersistentRegistry, never()).getMaxInactiveInterval();
    }

    @Test
    void principalWithNoSessions_doesNothingForThatPrincipal() {
        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(Collections.emptyList());

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).getAllSessions("user1", false);
        verify(sessionPersistentRegistry, never()).expireSession(anyString());
        // inner loop body never runs, so interval is never read
        verify(sessionPersistentRegistry, never()).getMaxInactiveInterval();
    }

    @Test
    void zeroMaxInactiveInterval_expiresAnySessionWithPastLastRequest() {
        // With interval 0, expirationTime == lastRequest (in the past), so now.isAfter(...) is true.
        SessionInformation s = sessionInfo("zero-interval", 5);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(s));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(0);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry).expireSession("zero-interval");
    }

    @Test
    void readsMaxInactiveIntervalPerSession() {
        // Two stale sessions -> getMaxInactiveInterval consulted once per session (loop-local read).
        SessionInformation s1 = sessionInfo("s1", 600);
        SessionInformation s2 = sessionInfo("s2", 600);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(s1, s2));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(60);

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);
        scheduled.expireSessions();

        verify(sessionPersistentRegistry, times(2)).getMaxInactiveInterval();
        verify(sessionPersistentRegistry).expireSession("s1");
        verify(sessionPersistentRegistry).expireSession("s2");
    }

    @Test
    void propagatesException_fromExpireSession() {
        SessionInformation stale = sessionInfo("boom-session", 600);

        when(sessionPersistentRegistry.getAllPrincipals())
                .thenReturn(List.of((Object) "user1"));
        when(sessionPersistentRegistry.getAllSessions("user1", false))
                .thenReturn(List.of(stale));
        when(sessionPersistentRegistry.getMaxInactiveInterval()).thenReturn(60);
        doThrow(new RuntimeException("db down"))
                .when(sessionPersistentRegistry)
                .expireSession("boom-session");

        SessionScheduled scheduled = new SessionScheduled(sessionPersistentRegistry);

        RuntimeException ex =
                assertThrows(RuntimeException.class, scheduled::expireSessions);
        assertEquals("db down", ex.getMessage());
    }

    @Test
    void expireSessions_hasScheduledAnnotationWithExpectedCron() throws Exception {
        Method m = SessionScheduled.class.getDeclaredMethod("expireSessions");
        Scheduled scheduled = m.getAnnotation(Scheduled.class);
        assertNotNull(scheduled, "@Scheduled annotation missing on expireSessions()");
        assertEquals("0 0/5 * * * ?", scheduled.cron(), "Unexpected cron expression");
    }
}
