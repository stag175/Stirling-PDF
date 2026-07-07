package stirling.software.proprietary.security.session;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpSessionEvent;

/**
 * Pure unit tests for {@link CustomHttpSessionListener}.
 *
 * <p>The listener's only collaborator is {@link SessionPersistentRegistry}, which is mocked with
 * Mockito (it is a concrete {@code @Component} with a non-final {@code expireSession(String)}
 * method, so it is mockable). No Spring context, servlet container, database, or IO is involved.
 *
 * <p>{@code sessionDestroyed} reads {@code se.getSession().getId()} and forwards the id to {@code
 * SessionPersistentRegistry.expireSession}; {@code sessionCreated} is a documented no-op. Both
 * behaviours, plus the propagation of an NPE when the event exposes no session, are exercised here.
 */
@ExtendWith(MockitoExtension.class)
class CustomHttpSessionListenerTest {

    @Mock private SessionPersistentRegistry sessionPersistentRegistry;

    private CustomHttpSessionListener listener;

    @BeforeEach
    void setUp() {
        listener = new CustomHttpSessionListener(sessionPersistentRegistry);
    }

    @Test
    @DisplayName("sessionDestroyed forwards the destroyed session id to expireSession")
    void sessionDestroyed_expiresSessionById() {
        String sessionId = "session-123";
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn(sessionId);
        HttpSessionEvent event = mock(HttpSessionEvent.class);
        when(event.getSession()).thenReturn(session);

        listener.sessionDestroyed(event);

        verify(sessionPersistentRegistry).expireSession(sessionId);
        verifyNoMoreInteractions(sessionPersistentRegistry);
    }

    @Test
    @DisplayName("sessionDestroyed passes the id through verbatim, even when blank")
    void sessionDestroyed_passesBlankIdThrough() {
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("");
        HttpSessionEvent event = mock(HttpSessionEvent.class);
        when(event.getSession()).thenReturn(session);

        listener.sessionDestroyed(event);

        verify(sessionPersistentRegistry).expireSession("");
    }

    @Test
    @DisplayName("sessionDestroyed forwards a null id without short-circuiting")
    void sessionDestroyed_forwardsNullId() {
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn(null);
        HttpSessionEvent event = mock(HttpSessionEvent.class);
        when(event.getSession()).thenReturn(session);

        listener.sessionDestroyed(event);

        verify(sessionPersistentRegistry).expireSession(null);
    }

    @Test
    @DisplayName("sessionDestroyed propagates NPE when the event exposes no session")
    void sessionDestroyed_nullSession_throwsAndDoesNotExpire() {
        HttpSessionEvent event = mock(HttpSessionEvent.class);
        when(event.getSession()).thenReturn(null);

        org.junit.jupiter.api.Assertions.assertThrows(
                NullPointerException.class, () -> listener.sessionDestroyed(event));

        verify(sessionPersistentRegistry, never()).expireSession(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("sessionCreated is a no-op that never touches the registry")
    void sessionCreated_isNoOp() {
        HttpSessionEvent event = mock(HttpSessionEvent.class);

        listener.sessionCreated(event);

        verifyNoInteractions(sessionPersistentRegistry);
    }

    @Test
    @DisplayName("each destroyed session triggers its own expireSession call")
    void sessionDestroyed_multipleEvents_expireEach() {
        HttpSession firstSession = mock(HttpSession.class);
        when(firstSession.getId()).thenReturn("a");
        HttpSessionEvent firstEvent = mock(HttpSessionEvent.class);
        when(firstEvent.getSession()).thenReturn(firstSession);

        HttpSession secondSession = mock(HttpSession.class);
        when(secondSession.getId()).thenReturn("b");
        HttpSessionEvent secondEvent = mock(HttpSessionEvent.class);
        when(secondEvent.getSession()).thenReturn(secondSession);

        listener.sessionDestroyed(firstEvent);
        listener.sessionDestroyed(secondEvent);

        verify(sessionPersistentRegistry).expireSession("a");
        verify(sessionPersistentRegistry).expireSession("b");
        verifyNoMoreInteractions(sessionPersistentRegistry);
    }
}
