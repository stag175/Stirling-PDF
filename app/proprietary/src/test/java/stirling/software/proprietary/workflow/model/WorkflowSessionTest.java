package stirling.software.proprietary.workflow.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.proprietary.storage.model.StoredFile;

class WorkflowSessionTest {

    @Test
    void defaults_areInitialized() {
        WorkflowSession session = new WorkflowSession();

        assertNotNull(session.getSessionId(), "sessionId should be auto-generated");
        assertEquals(36, session.getSessionId().length(), "sessionId should be a UUID string");
        assertEquals(WorkflowStatus.IN_PROGRESS, session.getStatus(), "default status");
        assertFalse(session.isFinalized(), "default finalized flag should be false");
        assertNotNull(session.getParticipants(), "participants list should be initialized");
        assertTrue(session.getParticipants().isEmpty(), "participants list should start empty");
        assertNotNull(session.getWorkflowMetadata(), "workflowMetadata map should be initialized");
        assertTrue(session.getWorkflowMetadata().isEmpty(), "workflowMetadata should start empty");
        assertNull(session.getProcessedFile(), "processedFile should start null");
    }

    @Test
    void defaultSession_isActive() {
        WorkflowSession session = new WorkflowSession();

        // Defaults: status == IN_PROGRESS and finalized == false
        assertTrue(session.isActive(), "fresh session should be active");
    }

    @Test
    void isActive_falseWhenFinalized_evenWhenInProgress() {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.IN_PROGRESS);
        session.setFinalized(true);

        assertFalse(session.isActive(), "finalized session must not be active");
    }

    @Test
    void isActive_falseWhenCompleted() {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.COMPLETED);
        session.setFinalized(false);

        assertFalse(session.isActive(), "completed session must not be active");
    }

    @Test
    void isActive_falseWhenCancelled() {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(WorkflowStatus.CANCELLED);
        session.setFinalized(false);

        assertFalse(session.isActive(), "cancelled session must not be active");
    }

    @Test
    void isActive_falseWhenStatusNull() {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(null);

        // status == IN_PROGRESS is false when status is null; no NPE expected.
        assertFalse(session.isActive(), "null status must not be active");
    }

    @ParameterizedTest
    @EnumSource(WorkflowStatus.class)
    void isActive_onlyTrueForInProgressAndNotFinalized(WorkflowStatus status) {
        WorkflowSession session = new WorkflowSession();
        session.setStatus(status);
        session.setFinalized(false);

        boolean expected = status == WorkflowStatus.IN_PROGRESS;
        assertEquals(
                expected,
                session.isActive(),
                "isActive should be true only for IN_PROGRESS when not finalized");
    }

    @Test
    void hasProcessedFile_falseWhenNull() {
        WorkflowSession session = new WorkflowSession();

        assertFalse(session.hasProcessedFile(), "no processed file by default");
    }

    @Test
    void hasProcessedFile_trueWhenSet() {
        WorkflowSession session = new WorkflowSession();
        session.setProcessedFile(new StoredFile());

        assertTrue(session.hasProcessedFile(), "processed file present");
    }

    @Test
    void hasProcessedFile_falseAfterClearing() {
        WorkflowSession session = new WorkflowSession();
        session.setProcessedFile(new StoredFile());
        assertTrue(session.hasProcessedFile());

        session.setProcessedFile(null);

        assertFalse(session.hasProcessedFile(), "clearing processed file flips flag back to false");
    }

    @Test
    void addParticipant_addsToList_andSetsBackReference() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant participant = new WorkflowParticipant();

        session.addParticipant(participant);

        assertEquals(1, session.getParticipants().size(), "participant should be added");
        assertTrue(session.getParticipants().contains(participant));
        assertSame(
                session,
                participant.getWorkflowSession(),
                "back-reference should point to owning session");
    }

    @Test
    void addParticipant_multiple_preservesInsertionOrder() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant first = new WorkflowParticipant();
        WorkflowParticipant second = new WorkflowParticipant();

        session.addParticipant(first);
        session.addParticipant(second);

        assertEquals(2, session.getParticipants().size());
        assertSame(first, session.getParticipants().get(0), "insertion order preserved");
        assertSame(second, session.getParticipants().get(1), "insertion order preserved");
        assertSame(session, first.getWorkflowSession());
        assertSame(session, second.getWorkflowSession());
    }

    @Test
    void addParticipant_sameInstanceTwice_addsDuplicate_dueToListSemantics() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant participant = new WorkflowParticipant();

        session.addParticipant(participant);
        session.addParticipant(participant);

        // participants is a List, so the same instance is stored twice.
        assertEquals(2, session.getParticipants().size(), "List allows duplicate entries");
        assertSame(session, participant.getWorkflowSession());
    }

    @Test
    void addParticipant_null_throwsNpeWhenSettingBackReference() {
        WorkflowSession session = new WorkflowSession();

        // ArrayList.add(null) succeeds, but participant.setWorkflowSession(this) dereferences null.
        assertThrows(NullPointerException.class, () -> session.addParticipant(null));
    }

    @Test
    void removeParticipant_removesFromList_andClearsBackReference() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant participant = new WorkflowParticipant();
        session.addParticipant(participant);
        assertSame(session, participant.getWorkflowSession());

        session.removeParticipant(participant);

        assertTrue(session.getParticipants().isEmpty(), "participant should be removed");
        assertFalse(session.getParticipants().contains(participant));
        assertNull(participant.getWorkflowSession(), "back-reference should be cleared");
    }

    @Test
    void removeParticipant_notInList_stillClearsBackReference() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant stranger = new WorkflowParticipant();
        // pre-set a back-reference to a different (empty) session to observe it being cleared
        stranger.setWorkflowSession(new WorkflowSession());

        session.removeParticipant(stranger);

        assertTrue(session.getParticipants().isEmpty(), "list remains empty");
        assertNull(
                stranger.getWorkflowSession(),
                "removeParticipant always nulls the back-reference, even if not present");
    }

    @Test
    void removeParticipant_onlyRemovesTargetParticipant() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant keep = new WorkflowParticipant();
        WorkflowParticipant drop = new WorkflowParticipant();
        session.addParticipant(keep);
        session.addParticipant(drop);

        session.removeParticipant(drop);

        assertEquals(1, session.getParticipants().size());
        assertTrue(session.getParticipants().contains(keep), "untargeted participant stays");
        assertSame(session, keep.getWorkflowSession(), "kept participant keeps its back-reference");
        assertNull(drop.getWorkflowSession(), "removed participant has cleared back-reference");
    }

    @Test
    void removeParticipant_null_throwsNpeWhenClearingBackReference() {
        WorkflowSession session = new WorkflowSession();

        // ArrayList.remove(null) is a no-op returning false, but the subsequent
        // null.setWorkflowSession(null) dereferences null.
        assertThrows(NullPointerException.class, () -> session.removeParticipant(null));
    }

    @Test
    void addThenRemove_returnsToEmptyAndDetachedState() {
        WorkflowSession session = new WorkflowSession();
        WorkflowParticipant participant = new WorkflowParticipant();

        session.addParticipant(participant);
        session.removeParticipant(participant);

        assertTrue(session.getParticipants().isEmpty());
        assertNull(participant.getWorkflowSession());
    }
}
