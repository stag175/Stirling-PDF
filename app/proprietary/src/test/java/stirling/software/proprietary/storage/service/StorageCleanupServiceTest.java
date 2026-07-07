package stirling.software.proprietary.storage.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StorageCleanupEntry;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;

/**
 * Unit tests for {@link StorageCleanupService}.
 *
 * <p>All three collaborators ({@link StorageProvider}, {@link StorageCleanupEntryRepository} and
 * {@link FileShareRepository}) are mocked with Mockito. No Spring context, database, filesystem, or
 * network is involved.
 *
 * <p>Covered behaviors:
 *
 * <ul>
 *   <li>{@code cleanupOrphanedStorage}: empty list short-circuit, successful delete + entry removal,
 *       {@link IOException} -> attempt-count increment + save (retry), and abandonment (delete)
 *       once the attempt count reaches {@code MAX_CLEANUP_ATTEMPTS} (10).
 *   <li>{@code cleanupExpiredShareLinks}: empty list short-circuit and bulk delete of expired
 *       shares.
 * </ul>
 *
 * <p>MAX_CLEANUP_ATTEMPTS in the production class is private; the mirror constant below tracks it.
 * The abandonment branch fires when {@code attemptCount + 1 >= 10}, i.e. when the stored
 * attemptCount is already {@code >= 9}.
 */
@ExtendWith(MockitoExtension.class)
class StorageCleanupServiceTest {

    /** Mirror of the private MAX_CLEANUP_ATTEMPTS constant in the production class. */
    private static final int MAX_CLEANUP_ATTEMPTS = 10;

    @Mock private StorageProvider storageProvider;
    @Mock private StorageCleanupEntryRepository cleanupEntryRepository;
    @Mock private FileShareRepository fileShareRepository;

    @InjectMocks private StorageCleanupService service;

    private static StorageCleanupEntry entry(String key, int attemptCount) {
        StorageCleanupEntry entry = new StorageCleanupEntry();
        entry.setStorageKey(key);
        entry.setAttemptCount(attemptCount);
        return entry;
    }

    // ---------------------------------------------------------------------
    // cleanupOrphanedStorage
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("Empty cleanup list: returns early, never touches the storage provider")
    void cleanupOrphanedStorage_emptyList_doesNothing() {
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc())
                .thenReturn(Collections.emptyList());

        service.cleanupOrphanedStorage();

        verify(cleanupEntryRepository, times(1)).findTop50ByOrderByUpdatedAtAsc();
        verifyNoMoreInteractions(cleanupEntryRepository);
        verifyNoInteractions(storageProvider);
    }

    @Test
    @DisplayName("Successful delete: blob removed then the cleanup entry is deleted")
    void cleanupOrphanedStorage_successfulDelete_removesBlobAndEntry() throws IOException {
        StorageCleanupEntry e = entry("blob-1", 0);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));

        service.cleanupOrphanedStorage();

        verify(storageProvider, times(1)).delete("blob-1");
        verify(cleanupEntryRepository, times(1)).delete(e);
        verify(cleanupEntryRepository, never()).save(any(StorageCleanupEntry.class));
    }

    @Test
    @DisplayName("Multiple entries processed independently in one pass")
    void cleanupOrphanedStorage_multipleEntries_allProcessed() throws IOException {
        StorageCleanupEntry e1 = entry("blob-a", 0);
        StorageCleanupEntry e2 = entry("blob-b", 0);
        StorageCleanupEntry e3 = entry("blob-c", 0);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc())
                .thenReturn(List.of(e1, e2, e3));

        service.cleanupOrphanedStorage();

        verify(storageProvider, times(1)).delete("blob-a");
        verify(storageProvider, times(1)).delete("blob-b");
        verify(storageProvider, times(1)).delete("blob-c");
        verify(cleanupEntryRepository, times(1)).delete(e1);
        verify(cleanupEntryRepository, times(1)).delete(e2);
        verify(cleanupEntryRepository, times(1)).delete(e3);
    }

    @Test
    @DisplayName("IOException below the cap: attempt count incremented and entry re-saved (retry)")
    void cleanupOrphanedStorage_ioException_incrementsAttemptAndSaves() throws IOException {
        StorageCleanupEntry e = entry("blob-fail", 0);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));
        doThrow(new IOException("simulated storage failure"))
                .when(storageProvider)
                .delete("blob-fail");

        service.cleanupOrphanedStorage();

        // attemptCount goes 0 -> 1 and the entry is persisted for a future retry; not deleted.
        assertEquals(1, e.getAttemptCount(), "attempt count should be incremented on failure");
        verify(cleanupEntryRepository, times(1)).save(e);
        verify(cleanupEntryRepository, never()).delete(e);
    }

    @Test
    @DisplayName("IOException one attempt before the cap (8 -> 9): still retried, not abandoned")
    void cleanupOrphanedStorage_ioExceptionJustBelowCap_stillRetries() throws IOException {
        // attemptCount 8 -> attempts becomes 9, which is < 10, so the retry branch runs.
        StorageCleanupEntry e = entry("blob-fail", MAX_CLEANUP_ATTEMPTS - 2);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));
        doThrow(new IOException("simulated storage failure"))
                .when(storageProvider)
                .delete("blob-fail");

        service.cleanupOrphanedStorage();

        assertEquals(MAX_CLEANUP_ATTEMPTS - 1, e.getAttemptCount());
        verify(cleanupEntryRepository, times(1)).save(e);
        verify(cleanupEntryRepository, never()).delete(e);
    }

    @Test
    @DisplayName("IOException at the cap boundary (9 -> 10): entry abandoned and deleted")
    void cleanupOrphanedStorage_ioExceptionReachesCap_abandonsAndDeletes() throws IOException {
        // attemptCount 9 -> attempts becomes 10, which is >= MAX_CLEANUP_ATTEMPTS, so abandon.
        StorageCleanupEntry e = entry("blob-fail", MAX_CLEANUP_ATTEMPTS - 1);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));
        doThrow(new IOException("simulated storage failure"))
                .when(storageProvider)
                .delete("blob-fail");

        service.cleanupOrphanedStorage();

        // Abandon branch: the entry is deleted and never re-saved. attemptCount is not persisted.
        verify(cleanupEntryRepository, times(1)).delete(e);
        verify(cleanupEntryRepository, never()).save(any(StorageCleanupEntry.class));
    }

    @Test
    @DisplayName("IOException above the cap is also abandoned (defensive >= check)")
    void cleanupOrphanedStorage_ioExceptionAboveCap_abandonsAndDeletes() throws IOException {
        StorageCleanupEntry e = entry("blob-fail", MAX_CLEANUP_ATTEMPTS + 5);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));
        doThrow(new IOException("simulated storage failure"))
                .when(storageProvider)
                .delete("blob-fail");

        service.cleanupOrphanedStorage();

        verify(cleanupEntryRepository, times(1)).delete(e);
        verify(cleanupEntryRepository, never()).save(any(StorageCleanupEntry.class));
    }

    @Test
    @DisplayName("Mixed batch: a failing entry is retried while a healthy entry is still deleted")
    void cleanupOrphanedStorage_mixedBatch_failuresIsolated() throws IOException {
        StorageCleanupEntry ok = entry("blob-ok", 0);
        StorageCleanupEntry bad = entry("blob-bad", 0);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc())
                .thenReturn(List.of(ok, bad));
        // Only the "bad" key throws; "ok" succeeds. lenient() because the unmatched
        // delete("blob-ok") call would otherwise trip strict-stubbing on this stub.
        org.mockito.Mockito.lenient()
                .doThrow(new IOException("boom"))
                .when(storageProvider)
                .delete("blob-bad");

        service.cleanupOrphanedStorage();

        // Healthy entry deleted; failing entry retried (saved) but not deleted.
        verify(cleanupEntryRepository, times(1)).delete(ok);
        verify(cleanupEntryRepository, times(1)).save(bad);
        verify(cleanupEntryRepository, never()).delete(bad);
        assertEquals(1, bad.getAttemptCount());
    }

    @Test
    @DisplayName("Successful delete passes the entry's storage key through to the provider")
    void cleanupOrphanedStorage_passesStorageKeyToProvider() throws IOException {
        StorageCleanupEntry e = entry("custom/key/path.bin", 3);
        when(cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc()).thenReturn(List.of(e));

        service.cleanupOrphanedStorage();

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(storageProvider).delete(keyCaptor.capture());
        assertEquals("custom/key/path.bin", keyCaptor.getValue());
        verify(cleanupEntryRepository).delete(e);
    }

    // ---------------------------------------------------------------------
    // cleanupExpiredShareLinks
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("No expired shares: returns early, never calls deleteAll")
    void cleanupExpiredShareLinks_emptyList_doesNothing() {
        when(fileShareRepository.findByExpiresAtBeforeAndShareTokenNotNull(
                        any(LocalDateTime.class)))
                .thenReturn(Collections.emptyList());

        service.cleanupExpiredShareLinks();

        verify(fileShareRepository, times(1))
                .findByExpiresAtBeforeAndShareTokenNotNull(any(LocalDateTime.class));
        verify(fileShareRepository, never()).deleteAll(anyList());
    }

    @Test
    @DisplayName("Expired shares present: the whole list is bulk-deleted")
    void cleanupExpiredShareLinks_withExpired_deletesAll() {
        List<FileShare> expired = List.of(new FileShare(), new FileShare());
        when(fileShareRepository.findByExpiresAtBeforeAndShareTokenNotNull(
                        any(LocalDateTime.class)))
                .thenReturn(expired);

        service.cleanupExpiredShareLinks();

        verify(fileShareRepository, times(1)).deleteAll(expired);
    }

    @Test
    @DisplayName("Expiry cutoff passed to the query is approximately 'now'")
    void cleanupExpiredShareLinks_queryUsesNowAsCutoff() {
        when(fileShareRepository.findByExpiresAtBeforeAndShareTokenNotNull(
                        any(LocalDateTime.class)))
                .thenReturn(Collections.emptyList());

        LocalDateTime before = LocalDateTime.now();
        service.cleanupExpiredShareLinks();
        LocalDateTime after = LocalDateTime.now();

        ArgumentCaptor<LocalDateTime> cutoffCaptor =
                ArgumentCaptor.forClass(LocalDateTime.class);
        verify(fileShareRepository)
                .findByExpiresAtBeforeAndShareTokenNotNull(cutoffCaptor.capture());

        LocalDateTime cutoff = cutoffCaptor.getValue();
        assertEquals(
                true,
                !cutoff.isBefore(before) && !cutoff.isAfter(after),
                "Cutoff should be captured between the before/after timestamps around the call");
    }

    @Test
    @DisplayName("The two scheduled jobs are independent: share cleanup ignores storage repos")
    void cleanupExpiredShareLinks_doesNotTouchStorageCollaborators() {
        List<FileShare> expired = List.of(new FileShare());
        when(fileShareRepository.findByExpiresAtBeforeAndShareTokenNotNull(
                        any(LocalDateTime.class)))
                .thenReturn(expired);

        service.cleanupExpiredShareLinks();

        verify(fileShareRepository).deleteAll(expired);
        verifyNoInteractions(storageProvider);
        verifyNoInteractions(cleanupEntryRepository);
    }
}
