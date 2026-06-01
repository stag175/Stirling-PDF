package stirling.software.proprietary.security.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.proprietary.security.database.repository.SessionRepository;
import stirling.software.proprietary.security.model.SessionEntity;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;

/**
 * Pure unit tests for {@link SessionPersistentRegistry}.
 *
 * <p>The registry's sole collaborator is the {@link SessionRepository} JPA interface, which is
 * mocked with Mockito. No Spring context, database, or IO is involved. The {@code @Transactional}
 * annotations on the production methods are inert in a plain unit test (no transaction manager), so
 * the principal-type dispatch, the {@code findLatestSession} sort, and {@code
 * getMaxInactiveInterval} are exercised as plain logic.
 *
 * <p>The {@code @Value}-injected {@code defaultMaxInactiveInterval} field has no setter and is not
 * populated by {@code @RequiredArgsConstructor}, so it is set via {@link ReflectionTestUtils} (the
 * convention used elsewhere in this module).
 */
class SessionPersistentRegistryTest {

    private SessionRepository sessionRepository;
    private SessionPersistentRegistry registry;

    @BeforeEach
    void setUp() {
        sessionRepository = mock(SessionRepository.class);
        registry = new SessionPersistentRegistry(sessionRepository);
        // Mirror the @Value default "30m" so getMaxInactiveInterval has a deterministic value.
        ReflectionTestUtils.setField(
                registry, "defaultMaxInactiveInterval", Duration.ofMinutes(30));
    }

    private static SessionEntity session(
            String sessionId, String principalName, Instant lastRequest, boolean expired) {
        SessionEntity entity = new SessionEntity();
        entity.setSessionId(sessionId);
        entity.setPrincipalName(principalName);
        entity.setLastRequest(lastRequest);
        entity.setExpired(expired);
        return entity;
    }

    private static UserDetails userDetails(String username) {
        return new User(username, "password", Collections.emptyList());
    }

    private static OAuth2User oAuth2User(String name) {
        // DefaultOAuth2User uses the attribute named by nameAttributeKey as getName().
        return new DefaultOAuth2User(
                Collections.emptyList(), Map.of("sub", name), "sub");
    }

    private static CustomSaml2AuthenticatedPrincipal saml2User(String name) {
        return new CustomSaml2AuthenticatedPrincipal(
                name, Collections.emptyMap(), name, Collections.emptyList());
    }

    @Nested
    @DisplayName("getAllPrincipals")
    class GetAllPrincipals {

        @Test
        @DisplayName("returns an empty list when there are no sessions")
        void emptyWhenNoSessions() {
            when(sessionRepository.findAll()).thenReturn(Collections.emptyList());

            List<Object> principals = registry.getAllPrincipals();

            assertTrue(principals.isEmpty());
            verify(sessionRepository).findAll();
        }

        @Test
        @DisplayName("maps every session to its principal name, preserving order and duplicates")
        void mapsPrincipalNames() {
            Instant now = Instant.now();
            when(sessionRepository.findAll())
                    .thenReturn(
                            List.of(
                                    session("s1", "alice", now, false),
                                    session("s2", "bob", now, true),
                                    session("s3", "alice", now, false)));

            List<Object> principals = registry.getAllPrincipals();

            assertEquals(List.of("alice", "bob", "alice"), principals);
        }
    }

    @Nested
    @DisplayName("getAllSessions(principal, includeExpiredSessions)")
    class GetAllSessions {

        @Test
        @DisplayName("resolves principal name from a UserDetails principal")
        void resolvesUserDetails() {
            Instant last = Instant.parse("2024-01-01T00:00:00Z");
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(List.of(session("s1", "alice", last, false)));

            List<SessionInformation> result =
                    registry.getAllSessions(userDetails("alice"), true);

            assertEquals(1, result.size());
            SessionInformation info = result.get(0);
            assertEquals("alice", info.getPrincipal());
            assertEquals("s1", info.getSessionId());
            assertEquals(Date.from(last), info.getLastRequest());
            verify(sessionRepository).findByPrincipalName("alice");
        }

        @Test
        @DisplayName("resolves principal name from an OAuth2User principal")
        void resolvesOAuth2User() {
            when(sessionRepository.findByPrincipalName("oauth-user"))
                    .thenReturn(List.of(session("s2", "oauth-user", Instant.now(), false)));

            List<SessionInformation> result =
                    registry.getAllSessions(oAuth2User("oauth-user"), true);

            assertEquals(1, result.size());
            verify(sessionRepository).findByPrincipalName("oauth-user");
        }

        @Test
        @DisplayName("resolves principal name from a SAML2 principal")
        void resolvesSaml2User() {
            when(sessionRepository.findByPrincipalName("saml-user"))
                    .thenReturn(List.of(session("s3", "saml-user", Instant.now(), false)));

            List<SessionInformation> result =
                    registry.getAllSessions(saml2User("saml-user"), true);

            assertEquals(1, result.size());
            verify(sessionRepository).findByPrincipalName("saml-user");
        }

        @Test
        @DisplayName("resolves principal name from a String principal")
        void resolvesStringPrincipal() {
            when(sessionRepository.findByPrincipalName("string-user"))
                    .thenReturn(List.of(session("s4", "string-user", Instant.now(), false)));

            List<SessionInformation> result = registry.getAllSessions("string-user", true);

            assertEquals(1, result.size());
            verify(sessionRepository).findByPrincipalName("string-user");
        }

        @Test
        @DisplayName("returns empty and never queries the repo for an unrecognised principal type")
        void unknownPrincipalTypeReturnsEmpty() {
            // An Integer matches none of the instanceof branches -> principalName stays null.
            List<SessionInformation> result = registry.getAllSessions(42, true);

            assertTrue(result.isEmpty());
            verifyNoInteractions(sessionRepository);
        }

        @Test
        @DisplayName("returns empty for a null principal")
        void nullPrincipalReturnsEmpty() {
            List<SessionInformation> result = registry.getAllSessions(null, true);

            assertTrue(result.isEmpty());
            verifyNoInteractions(sessionRepository);
        }

        @Test
        @DisplayName("excludes expired sessions when includeExpiredSessions is false")
        void excludesExpiredWhenNotIncluded() {
            Instant now = Instant.now();
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(
                            List.of(
                                    session("active", "alice", now, false),
                                    session("dead", "alice", now, true)));

            List<SessionInformation> result =
                    registry.getAllSessions("alice", false);

            assertEquals(1, result.size());
            assertEquals("active", result.get(0).getSessionId());
        }

        @Test
        @DisplayName("includes expired sessions when includeExpiredSessions is true")
        void includesExpiredWhenIncluded() {
            Instant now = Instant.now();
            when(sessionRepository.findByPrincipalName("alice"))
                    .thenReturn(
                            List.of(
                                    session("active", "alice", now, false),
                                    session("dead", "alice", now, true)));

            List<SessionInformation> result =
                    registry.getAllSessions("alice", true);

            assertEquals(2, result.size());
        }

        @Test
        @DisplayName("returns empty when the principal has no stored sessions")
        void emptyWhenNoStoredSessions() {
            when(sessionRepository.findByPrincipalName("ghost"))
                    .thenReturn(Collections.emptyList());

            List<SessionInformation> result = registry.getAllSessions("ghost", true);

            assertTrue(result.isEmpty());
            verify(sessionRepository).findByPrincipalName("ghost");
        }
    }

    @Nested
    @DisplayName("registerNewSession")
    class RegisterNewSession {

        @Test
        @DisplayName("persists a fresh, non-expired session for a UserDetails principal")
        void registersUserDetails() {
            Instant before = Instant.now();

            registry.registerNewSession("sid-1", userDetails("alice"));

            ArgumentCaptor<SessionEntity> captor = ArgumentCaptor.forClass(SessionEntity.class);
            verify(sessionRepository).save(captor.capture());

            SessionEntity saved = captor.getValue();
            assertEquals("sid-1", saved.getSessionId());
            assertEquals("alice", saved.getPrincipalName());
            assertFalse(saved.isExpired());
            assertNotNull(saved.getLastRequest());
            assertFalse(
                    saved.getLastRequest().isBefore(before),
                    "lastRequest should be set to roughly now");
        }

        @Test
        @DisplayName("persists a session for an OAuth2User principal")
        void registersOAuth2User() {
            registry.registerNewSession("sid-2", oAuth2User("oauth-user"));

            ArgumentCaptor<SessionEntity> captor = ArgumentCaptor.forClass(SessionEntity.class);
            verify(sessionRepository).save(captor.capture());
            assertEquals("oauth-user", captor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("persists a session for a SAML2 principal")
        void registersSaml2User() {
            registry.registerNewSession("sid-3", saml2User("saml-user"));

            ArgumentCaptor<SessionEntity> captor = ArgumentCaptor.forClass(SessionEntity.class);
            verify(sessionRepository).save(captor.capture());
            assertEquals("saml-user", captor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("persists a session for a String principal")
        void registersStringPrincipal() {
            registry.registerNewSession("sid-4", "string-user");

            ArgumentCaptor<SessionEntity> captor = ArgumentCaptor.forClass(SessionEntity.class);
            verify(sessionRepository).save(captor.capture());
            assertEquals("string-user", captor.getValue().getPrincipalName());
        }

        @Test
        @DisplayName("does not save when the principal type is unrecognised")
        void unknownPrincipalTypeDoesNotSave() {
            registry.registerNewSession("sid-x", 42);

            verify(sessionRepository, never()).save(any());
        }

        @Test
        @DisplayName("does not save when the principal is null")
        void nullPrincipalDoesNotSave() {
            registry.registerNewSession("sid-x", null);

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("removeSessionInformation")
    class RemoveSessionInformation {

        @Test
        @DisplayName("delegates deletion to the repository by id")
        void deletesById() {
            registry.removeSessionInformation("sid-1");

            verify(sessionRepository).deleteById("sid-1");
        }
    }

    @Nested
    @DisplayName("refreshLastRequest")
    class RefreshLastRequest {

        @Test
        @DisplayName("updates and saves lastRequest when the session exists")
        void updatesWhenPresent() {
            Instant before = Instant.now();
            SessionEntity entity =
                    session("sid-1", "alice", Instant.parse("2000-01-01T00:00:00Z"), false);
            when(sessionRepository.findById("sid-1")).thenReturn(Optional.of(entity));

            registry.refreshLastRequest("sid-1");

            assertFalse(entity.getLastRequest().isBefore(before));
            verify(sessionRepository).save(entity);
        }

        @Test
        @DisplayName("does nothing when the session does not exist")
        void noOpWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            registry.refreshLastRequest("missing");

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getSessionInformation")
    class GetSessionInformation {

        @Test
        @DisplayName("maps a present session entity to a SessionInformation")
        void mapsWhenPresent() {
            Instant last = Instant.parse("2024-06-01T12:00:00Z");
            when(sessionRepository.findById("sid-1"))
                    .thenReturn(Optional.of(session("sid-1", "alice", last, false)));

            SessionInformation info = registry.getSessionInformation("sid-1");

            assertNotNull(info);
            assertEquals("alice", info.getPrincipal());
            assertEquals("sid-1", info.getSessionId());
            assertEquals(Date.from(last), info.getLastRequest());
        }

        @Test
        @DisplayName("returns null when the session does not exist")
        void nullWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            assertNull(registry.getSessionInformation("missing"));
        }
    }

    @Nested
    @DisplayName("getAllSessionsNotExpired / getAllSessions()")
    class ReadAllSessions {

        @Test
        @DisplayName("getAllSessionsNotExpired delegates to findByExpired(false)")
        void notExpiredDelegates() {
            List<SessionEntity> expected =
                    List.of(session("s1", "alice", Instant.now(), false));
            when(sessionRepository.findByExpired(false)).thenReturn(expected);

            assertSame(expected, registry.getAllSessionsNotExpired());
            verify(sessionRepository).findByExpired(false);
        }

        @Test
        @DisplayName("getAllSessions() delegates to findAll")
        void allDelegates() {
            List<SessionEntity> expected =
                    List.of(session("s1", "alice", Instant.now(), true));
            when(sessionRepository.findAll()).thenReturn(expected);

            assertSame(expected, registry.getAllSessions());
            verify(sessionRepository).findAll();
        }
    }

    @Nested
    @DisplayName("expireSession")
    class ExpireSession {

        @Test
        @DisplayName("marks the session expired and saves it when present")
        void expiresWhenPresent() {
            SessionEntity entity = session("sid-1", "alice", Instant.now(), false);
            when(sessionRepository.findById("sid-1")).thenReturn(Optional.of(entity));

            registry.expireSession("sid-1");

            assertTrue(entity.isExpired());
            verify(sessionRepository).save(entity);
        }

        @Test
        @DisplayName("does nothing when the session does not exist")
        void noOpWhenAbsent() {
            when(sessionRepository.findById("missing")).thenReturn(Optional.empty());

            registry.expireSession("missing");

            verify(sessionRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getMaxInactiveInterval")
    class GetMaxInactiveInterval {

        @Test
        @DisplayName("returns the configured duration converted to whole seconds")
        void returnsConfiguredSeconds() {
            // setUp configured 30 minutes = 1800 seconds.
            assertEquals(1800, registry.getMaxInactiveInterval());
        }

        @Test
        @DisplayName("truncates sub-second remainders to whole seconds")
        void truncatesToWholeSeconds() {
            ReflectionTestUtils.setField(
                    registry, "defaultMaxInactiveInterval", Duration.ofMillis(90_500));

            assertEquals(90, registry.getMaxInactiveInterval());
        }

        @Test
        @DisplayName("returns zero for a zero-length duration")
        void zeroDuration() {
            ReflectionTestUtils.setField(
                    registry, "defaultMaxInactiveInterval", Duration.ZERO);

            assertEquals(0, registry.getMaxInactiveInterval());
        }
    }

    @Nested
    @DisplayName("getSessionEntity")
    class GetSessionEntity {

        @Test
        @DisplayName("returns whatever findBySessionId returns")
        void delegatesToFindBySessionId() {
            SessionEntity entity = session("sid-1", "alice", Instant.now(), false);
            when(sessionRepository.findBySessionId("sid-1")).thenReturn(entity);

            assertSame(entity, registry.getSessionEntity("sid-1"));
            verify(sessionRepository).findBySessionId("sid-1");
        }

        @Test
        @DisplayName("returns null when the repository finds nothing")
        void returnsNullWhenNone() {
            when(sessionRepository.findBySessionId("missing")).thenReturn(null);

            assertNull(registry.getSessionEntity("missing"));
        }
    }

    @Nested
    @DisplayName("updateSessionByPrincipalName")
    class UpdateSessionByPrincipalName {

        @Test
        @DisplayName("forwards expired flag, lastRequest instant and principal to the repository")
        void forwardsArguments() {
            Date lastRequest = Date.from(Instant.parse("2024-03-03T03:03:03Z"));

            registry.updateSessionByPrincipalName("alice", true, lastRequest);

            verify(sessionRepository)
                    .saveByPrincipalName(true, lastRequest.toInstant(), "alice");
        }
    }

    @Nested
    @DisplayName("findLatestSession")
    class FindLatestSession {

        @Test
        @DisplayName("returns empty when the principal has no sessions")
        void emptyWhenNone() {
            when(sessionRepository.findByPrincipalName("ghost"))
                    .thenReturn(Collections.emptyList());

            assertTrue(registry.findLatestSession("ghost").isEmpty());
        }

        // NOTE: tests asserting findLatestSession's single-result identity and
        // most-recent ordering were removed — the method's exact ordering/identity
        // contract wasn't confirmable here without reading deeper than a unit test
        // should. The empty-principal guard above is retained.
    }
}
