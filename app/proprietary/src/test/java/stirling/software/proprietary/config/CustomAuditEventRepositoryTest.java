package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for {@link CustomAuditEventRepository}.
 *
 * <p>Collaborators ({@link PersistentAuditEventRepository} and the Jackson 3 {@link ObjectMapper}
 * from {@code tools.jackson}) are mocked with Mockito. No Spring context, database, file or network
 * IO is involved. The {@code @Async} annotation on {@code add} is a no-op when the method is
 * invoked directly (no Spring proxy), so the assertions run synchronously.
 *
 * <p>{@link stirling.software.proprietary.util.SecretMasker#mask} is a {@code static} method and
 * therefore cannot be mocked; the tests exercise it with real input maps and assert on its observed
 * effect through the data captured by the (mocked) mapper / repository.
 *
 * <p>Branches covered by {@code add(AuditEvent)}:
 *
 * <ul>
 *   <li>null event data -&gt; {@code CollectionUtils.isEmpty} true -&gt; {@code Map.of()} -&gt;
 *       early return (no mapper / repo interaction).
 *   <li>empty event data -&gt; same early return.
 *   <li>masked result that is effectively empty -&gt; early return.
 *   <li>masked result containing only the single key {@code "details"} -&gt; early return.
 *   <li>non-empty data with no {@code requestId} in MDC -&gt; serialize + persist (no requestId
 *       injected).
 *   <li>non-empty data with a {@code requestId} in MDC -&gt; requestId injected into the persisted
 *       map.
 *   <li>secret values masked before serialization.
 *   <li>fail-open when the mapper throws.
 *   <li>fail-open when the repository {@code save} throws.
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class CustomAuditEventRepositoryTest {

    private static final String MDC_REQUEST_ID_KEY = "requestId";

    @Mock private PersistentAuditEventRepository repo;
    @Mock private ObjectMapper mapper;

    private CustomAuditEventRepository repository;

    @BeforeEach
    void setUp() {
        repository = new CustomAuditEventRepository(repo, mapper);
        MDC.clear();
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Nested
    @DisplayName("find(...) read side")
    class FindReadSide {

        @Test
        @DisplayName("returns an empty, immutable list and never touches the repository")
        void find_returnsEmptyList() {
            List<AuditEvent> result = repository.find("principal", Instant.now(), "SOME_TYPE");

            assertNotNull(result);
            assertTrue(result.isEmpty(), "Read side is intentionally inert");
            verifyNoInteractions(repo, mapper);
        }

        @Test
        @DisplayName("tolerates null arguments and still returns an empty list")
        void find_withNullArgs_returnsEmptyList() {
            List<AuditEvent> result = repository.find(null, null, null);

            assertNotNull(result);
            assertTrue(result.isEmpty());
            verifyNoInteractions(repo, mapper);
        }
    }

    @Nested
    @DisplayName("add(...) early-return guards")
    class AddEarlyReturns {

        @Test
        @DisplayName("null event data -> early return, no serialization or persistence")
        void add_nullData_returnsEarly() {
            // Spring's AuditEvent constructor NPEs on a null data map, so use an empty map — it
            // still drives the CollectionUtils.isEmpty(...) == true early-return branch in add().
            AuditEvent ev = new AuditEvent("alice", "LOGIN", Map.<String, Object>of());

            repository.add(ev);

            verifyNoInteractions(repo, mapper);
        }

        @Test
        @DisplayName("empty event data -> early return, no serialization or persistence")
        void add_emptyData_returnsEarly() {
            AuditEvent ev = new AuditEvent("alice", "LOGIN", Map.of());

            repository.add(ev);

            verifyNoInteractions(repo, mapper);
        }

        @Test
        @DisplayName("data whose only surviving key is 'details' -> early return")
        void add_onlyDetailsKey_returnsEarly() {
            // 'details' is not a sensitive key, so SecretMasker keeps it; size==1 && contains
            // 'details' triggers the skip branch.
            AuditEvent ev = new AuditEvent("alice", "REQUEST", Map.of("details", "GET /foo"));

            repository.add(ev);

            verifyNoInteractions(repo, mapper);
        }

        @Test
        @DisplayName("data that becomes empty after masking (all values null) -> early return")
        void add_dataAllNullValues_masksToEmpty_returnsEarly() {
            // SecretMasker.mask filters out null values, leaving an empty map -> clean.isEmpty().
            Map<String, Object> data = new HashMap<>();
            data.put("password", null);
            data.put("note", null);
            AuditEvent ev = new AuditEvent("alice", "LOGIN", data);

            repository.add(ev);

            verifyNoInteractions(repo, mapper);
        }
    }

    @Nested
    @DisplayName("add(...) persistence path")
    class AddPersistence {

        @Test
        @DisplayName("persists a non-empty event, building the entity from the AuditEvent fields")
        void add_nonEmptyData_persistsEntity() {
            Instant ts = Instant.parse("2024-01-02T03:04:05Z");
            Map<String, Object> data = new HashMap<>();
            data.put("action", "view");
            data.put("resource", "doc-1");
            AuditEvent ev = new AuditEvent(ts, "bob", "ACCESS", data);

            when(mapper.writeValueAsString(anyMap())).thenReturn("{\"json\":true}");

            repository.add(ev);

            ArgumentCaptor<PersistentAuditEvent> entityCaptor =
                    ArgumentCaptor.forClass(PersistentAuditEvent.class);
            verify(repo, times(1)).save(entityCaptor.capture());

            PersistentAuditEvent saved = entityCaptor.getValue();
            assertEquals("bob", saved.getPrincipal());
            assertEquals("ACCESS", saved.getType());
            assertEquals("{\"json\":true}", saved.getData());
            assertEquals(ts, saved.getTimestamp());
        }

        @Test
        @DisplayName("serializes the masked map (no requestId) when MDC has no requestId")
        void add_noRequestIdInMdc_serializesMaskedMapWithoutRequestId() {
            Map<String, Object> data = new HashMap<>();
            data.put("user", "carol");
            data.put("password", "hunter2");
            AuditEvent ev = new AuditEvent("carol", "LOGIN", data);

            when(mapper.writeValueAsString(anyMap())).thenReturn("serialized");

            repository.add(ev);

            ArgumentCaptor<Map<String, Object>> mapCaptor = mapCaptor();
            verify(mapper).writeValueAsString(mapCaptor.capture());
            Map<String, Object> serialized = mapCaptor.getValue();

            // SecretMasker redacted the password but kept the username.
            assertEquals("carol", serialized.get("user"));
            assertEquals("***REDACTED***", serialized.get("password"));
            // No requestId because MDC was empty.
            assertTrue(
                    !serialized.containsKey(MDC_REQUEST_ID_KEY),
                    "requestId must not be present when MDC has none");

            verify(repo).save(any(PersistentAuditEvent.class));
        }

        @Test
        @DisplayName("injects the MDC requestId into the serialized map when present")
        void add_requestIdInMdc_injectedIntoSerializedMap() {
            MDC.put(MDC_REQUEST_ID_KEY, "req-42");

            Map<String, Object> data = new HashMap<>();
            data.put("action", "delete");
            AuditEvent ev = new AuditEvent("dave", "MUTATION", data);

            when(mapper.writeValueAsString(anyMap())).thenReturn("serialized-with-rid");

            repository.add(ev);

            ArgumentCaptor<Map<String, Object>> mapCaptor = mapCaptor();
            verify(mapper).writeValueAsString(mapCaptor.capture());
            Map<String, Object> serialized = mapCaptor.getValue();

            assertEquals("delete", serialized.get("action"));
            assertEquals("req-42", serialized.get(MDC_REQUEST_ID_KEY));

            verify(repo).save(any(PersistentAuditEvent.class));
        }

        @Test
        @DisplayName("'details' is preserved when accompanied by another key (no skip)")
        void add_detailsPlusOtherKey_persists() {
            Map<String, Object> data = new HashMap<>();
            data.put("details", "GET /foo");
            data.put("status", 200);
            AuditEvent ev = new AuditEvent("erin", "REQUEST", data);

            when(mapper.writeValueAsString(anyMap())).thenReturn("ok");

            repository.add(ev);

            ArgumentCaptor<Map<String, Object>> mapCaptor = mapCaptor();
            verify(mapper).writeValueAsString(mapCaptor.capture());
            Map<String, Object> serialized = mapCaptor.getValue();

            assertEquals("GET /foo", serialized.get("details"));
            assertEquals(200, serialized.get("status"));
            verify(repo).save(any(PersistentAuditEvent.class));
        }
    }

    @Nested
    @DisplayName("add(...) fail-open behavior")
    class AddFailOpen {

        @Test
        @DisplayName("mapper failure is swallowed; nothing is persisted")
        void add_mapperThrows_failsOpen() {
            Map<String, Object> data = new HashMap<>();
            data.put("action", "view");
            AuditEvent ev = new AuditEvent("frank", "ACCESS", data);

            // tools.jackson exceptions are unchecked; a generic RuntimeException reaches the same
            // catch(Exception) clause.
            when(mapper.writeValueAsString(anyMap()))
                    .thenThrow(new RuntimeException("boom-serialization"));

            // Must not propagate.
            repository.add(ev);

            verify(mapper).writeValueAsString(anyMap());
            verify(repo, never()).save(any(PersistentAuditEvent.class));
        }

        @Test
        @DisplayName("repository save failure is swallowed (fail-open) and does not propagate")
        void add_saveThrows_failsOpen() {
            Map<String, Object> data = new HashMap<>();
            data.put("action", "view");
            AuditEvent ev = new AuditEvent("grace", "ACCESS", data);

            when(mapper.writeValueAsString(anyMap())).thenReturn("payload");
            doThrow(new RuntimeException("db-down"))
                    .when(repo)
                    .save(any(PersistentAuditEvent.class));

            // Must not propagate.
            repository.add(ev);

            verify(repo, times(1)).save(any(PersistentAuditEvent.class));
        }
    }

    @Test
    @DisplayName(
            "constructor wires the injected collaborators (sanity / Lombok @RequiredArgsConstructor)")
    void constructor_storesCollaborators() {
        CustomAuditEventRepository instance = new CustomAuditEventRepository(repo, mapper);
        // repo/mapper are package-private: read them directly (no reflection).
        assertSame(repo, instance.repo);
        assertSame(mapper, instance.mapper);
    }

    // ---- helpers -----------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Map<String, Object>> mapCaptor() {
        return ArgumentCaptor.forClass(Map.class);
    }
}
