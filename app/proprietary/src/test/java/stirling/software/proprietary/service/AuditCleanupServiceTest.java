package stirling.software.proprietary.service;

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

import java.time.Instant;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/**
 * Unit tests for {@link AuditCleanupService#cleanupOldAuditEvents()}.
 *
 * <p>Collaborators ({@link PersistentAuditEventRepository} and {@link AuditConfigurationProperties})
 * are mocked with Mockito. The private batch-deletion helpers are exercised indirectly through the
 * single public entry point. No Spring context, database, or file IO is involved.
 *
 * <p>BATCH_SIZE in the production class is 10000; the loop continues while a full batch (== 10000
 * IDs) is returned and stops as soon as a batch smaller than 10000 (including empty) is returned.
 */
@ExtendWith(MockitoExtension.class)
class AuditCleanupServiceTest {

    /** Mirror of the private BATCH_SIZE constant in the production class. */
    private static final int BATCH_SIZE = 10000;

    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private AuditConfigurationProperties auditConfig;

    @InjectMocks private AuditCleanupService service;

    @Test
    @DisplayName("Does nothing and touches no repository when auditing is disabled")
    void cleanup_disabled_doesNothing() {
        when(auditConfig.isEnabled()).thenReturn(false);

        service.cleanupOldAuditEvents();

        // Disabled guard returns before reading retentionDays or hitting the repository.
        verify(auditConfig, never()).getRetentionDays();
        verifyNoInteractions(auditRepository);
    }

    @Test
    @DisplayName("Does nothing when retention is zero (infinite retention)")
    void cleanup_zeroRetention_doesNothing() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(0);

        service.cleanupOldAuditEvents();

        verifyNoInteractions(auditRepository);
    }

    @Test
    @DisplayName("Does nothing when retention is negative")
    void cleanup_negativeRetention_doesNothing() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(-5);

        service.cleanupOldAuditEvents();

        verifyNoInteractions(auditRepository);
    }

    @Test
    @DisplayName("Single empty batch: queries once, deletes nothing")
    void cleanup_noMatchingEvents_queriesOnceDeletesNothing() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(Collections.emptyList());

        service.cleanupOldAuditEvents();

        verify(auditRepository, times(1))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        verify(auditRepository, never()).deleteAllByIdInBatch(anyList());
    }

    @Test
    @DisplayName("Single partial batch terminates the loop after one delete")
    void cleanup_singlePartialBatch_deletesOnceThenStops() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        List<Long> partialBatch = List.of(1L, 2L, 3L);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(partialBatch);

        service.cleanupOldAuditEvents();

        // Batch size (3) < BATCH_SIZE => loop ends without re-querying.
        verify(auditRepository, times(1))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        verify(auditRepository, times(1)).deleteAllByIdInBatch(partialBatch);
    }

    @Test
    @DisplayName("Full batch followed by partial batch loops twice then stops")
    void cleanup_fullThenPartialBatch_loopsTwice() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        // First a full batch (exactly BATCH_SIZE => keep going), then a partial batch (=> stop).
        List<Long> fullBatch = Collections.nCopies(BATCH_SIZE, 7L);
        List<Long> partialBatch = List.of(42L);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(fullBatch)
                .thenReturn(partialBatch);

        service.cleanupOldAuditEvents();

        // Two find calls (full, partial), two deletes.
        verify(auditRepository, times(2))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        verify(auditRepository, times(1)).deleteAllByIdInBatch(fullBatch);
        verify(auditRepository, times(1)).deleteAllByIdInBatch(partialBatch);
    }

    @Test
    @DisplayName("Full batch followed by empty batch loops twice then stops")
    void cleanup_fullThenEmptyBatch_loopsTwice() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        List<Long> fullBatch = Collections.nCopies(BATCH_SIZE, 9L);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(fullBatch)
                .thenReturn(Collections.emptyList());

        service.cleanupOldAuditEvents();

        verify(auditRepository, times(2))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        // Only the full batch is deleted; the empty batch ends the loop without a delete.
        verify(auditRepository, times(1)).deleteAllByIdInBatch(fullBatch);
        verify(auditRepository, never()).deleteAllByIdInBatch(Collections.emptyList());
    }

    @Test
    @DisplayName("Exception during find is caught and does not propagate")
    void cleanup_findThrows_isSwallowed() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenThrow(new RuntimeException("simulated DB failure"));

        // The try/catch in cleanupOldAuditEvents must absorb the exception.
        service.cleanupOldAuditEvents();

        verify(auditRepository, times(1))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        verify(auditRepository, never()).deleteAllByIdInBatch(anyList());
    }

    @Test
    @DisplayName("Exception during delete is caught and does not propagate")
    void cleanup_deleteThrows_isSwallowed() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        List<Long> partialBatch = List.of(1L, 2L);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(partialBatch);
        doThrow(new RuntimeException("simulated delete failure"))
                .when(auditRepository)
                .deleteAllByIdInBatch(partialBatch);

        // Should not throw despite the delete blowing up.
        service.cleanupOldAuditEvents();

        verify(auditRepository, times(1)).deleteAllByIdInBatch(partialBatch);
        // After the failed delete the loop is interrupted; no further find calls.
        verify(auditRepository, times(1))
                .findIdsForBatchDeletion(any(Instant.class), any(Pageable.class));
        verifyNoMoreInteractions(auditRepository);
    }

    @Test
    @DisplayName("Cutoff date is derived from retentionDays (roughly now - retentionDays)")
    void cleanup_cutoffDate_reflectsRetentionDays() {
        int retentionDays = 30;
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getRetentionDays()).thenReturn(retentionDays);
        when(auditRepository.findIdsForBatchDeletion(any(Instant.class), any(Pageable.class)))
                .thenReturn(Collections.emptyList());

        Instant before = Instant.now();
        service.cleanupOldAuditEvents();
        Instant after = Instant.now();

        ArgumentCaptor<Instant> cutoffCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(auditRepository)
                .findIdsForBatchDeletion(cutoffCaptor.capture(), any(Pageable.class));

        Instant cutoff = cutoffCaptor.getValue();
        // cutoff should sit between (before - retentionDays) and (after - retentionDays).
        Instant lowerBound = before.minusSeconds((long) retentionDays * 24 * 60 * 60);
        Instant upperBound = after.minusSeconds((long) retentionDays * 24 * 60 * 60);

        // cutoff >= lowerBound  and  cutoff <= upperBound
        assertEquals(
                true,
                !cutoff.isBefore(lowerBound) && !cutoff.isAfter(upperBound),
                "Cutoff date should be approximately now minus the retention period");
    }
}
