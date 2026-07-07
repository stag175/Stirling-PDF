package stirling.software.proprietary.workflow.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.storage.model.ShareAccessRole;

/**
 * Pure unit tests for the deterministic helper methods on {@link WorkflowParticipant}: {@code
 * isExpired()}, {@code hasCompleted()}, {@code getEffectiveRole()}, {@code canEdit()} and {@code
 * addNotification(String)}.
 *
 * <p>No JPA/DB/Spring context is required - the entity is exercised through its plain Lombok
 * setters.
 */
class WorkflowParticipantTest {

    private static WorkflowParticipant participant(
            ParticipantStatus status, ShareAccessRole role, LocalDateTime expiresAt) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(status);
        p.setAccessRole(role);
        p.setExpiresAt(expiresAt);
        return p;
    }

    // -------------------------------------------------------------------------
    // Default state (no-args constructor + field initializers)
    // -------------------------------------------------------------------------

    @Test
    void defaults_statusIsPending_collectionsInitialized() {
        WorkflowParticipant p = new WorkflowParticipant();

        assertThat(p.getStatus()).isEqualTo(ParticipantStatus.PENDING);
        assertThat(p.getParticipantMetadata()).isNotNull().isEmpty();
        assertThat(p.getNotifications()).isNotNull().isEmpty();
        assertThat(p.getAccessRole()).isNull();
        assertThat(p.getExpiresAt()).isNull();
    }

    // -------------------------------------------------------------------------
    // isExpired()
    // -------------------------------------------------------------------------

    @Test
    void isExpired_falseWhenExpiresAtIsNull() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setExpiresAt(null);

        assertThat(p.isExpired()).isFalse();
    }

    @Test
    void isExpired_trueWhenExpiryInThePast() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setExpiresAt(LocalDateTime.now().minusDays(1));

        assertThat(p.isExpired()).isTrue();
    }

    @Test
    void isExpired_falseWhenExpiryInTheFuture() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setExpiresAt(LocalDateTime.now().plusDays(1));

        assertThat(p.isExpired()).isFalse();
    }

    @Test
    void isExpired_falseWhenExpiryIsEffectivelyNow_boundaryIsExclusive() {
        // isAfter(expiresAt) is strictly greater-than, so an expiry just barely in the future
        // must not be considered expired.
        WorkflowParticipant p = new WorkflowParticipant();
        p.setExpiresAt(LocalDateTime.now().plusSeconds(5));

        assertThat(p.isExpired()).isFalse();
    }

    // -------------------------------------------------------------------------
    // hasCompleted()
    // -------------------------------------------------------------------------

    @Test
    void hasCompleted_trueForSigned() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.SIGNED);

        assertThat(p.hasCompleted()).isTrue();
    }

    @Test
    void hasCompleted_trueForDeclined() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.DECLINED);

        assertThat(p.hasCompleted()).isTrue();
    }

    @Test
    void hasCompleted_falseForPendingNotifiedViewed() {
        WorkflowParticipant pending = new WorkflowParticipant();
        pending.setStatus(ParticipantStatus.PENDING);

        WorkflowParticipant notified = new WorkflowParticipant();
        notified.setStatus(ParticipantStatus.NOTIFIED);

        WorkflowParticipant viewed = new WorkflowParticipant();
        viewed.setStatus(ParticipantStatus.VIEWED);

        assertThat(pending.hasCompleted()).isFalse();
        assertThat(notified.hasCompleted()).isFalse();
        assertThat(viewed.hasCompleted()).isFalse();
    }

    // -------------------------------------------------------------------------
    // getEffectiveRole()
    // -------------------------------------------------------------------------

    @Test
    void getEffectiveRole_returnsConfiguredRoleWhenNotCompleted() {
        WorkflowParticipant editor =
                participant(ParticipantStatus.VIEWED, ShareAccessRole.EDITOR, null);
        WorkflowParticipant commenter =
                participant(ParticipantStatus.PENDING, ShareAccessRole.COMMENTER, null);

        assertThat(editor.getEffectiveRole()).isEqualTo(ShareAccessRole.EDITOR);
        assertThat(commenter.getEffectiveRole()).isEqualTo(ShareAccessRole.COMMENTER);
    }

    @Test
    void getEffectiveRole_downgradesToViewerWhenSigned() {
        WorkflowParticipant p = participant(ParticipantStatus.SIGNED, ShareAccessRole.EDITOR, null);

        assertThat(p.getEffectiveRole()).isEqualTo(ShareAccessRole.VIEWER);
    }

    @Test
    void getEffectiveRole_downgradesToViewerWhenDeclined() {
        WorkflowParticipant p =
                participant(ParticipantStatus.DECLINED, ShareAccessRole.COMMENTER, null);

        assertThat(p.getEffectiveRole()).isEqualTo(ShareAccessRole.VIEWER);
    }

    @Test
    void getEffectiveRole_returnsNullWhenRoleUnsetAndNotCompleted() {
        // accessRole is null by default; not-completed path returns it as-is.
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.PENDING);

        assertThat(p.getEffectiveRole()).isNull();
    }

    @Test
    void getEffectiveRole_completedWinsOverNullRole() {
        // Even with a null configured role, completion forces VIEWER without touching accessRole.
        WorkflowParticipant p = new WorkflowParticipant();
        p.setStatus(ParticipantStatus.SIGNED);
        p.setAccessRole(null);

        assertThat(p.getEffectiveRole()).isEqualTo(ShareAccessRole.VIEWER);
    }

    // -------------------------------------------------------------------------
    // canEdit()
    // -------------------------------------------------------------------------

    @Test
    void canEdit_trueForActiveEditor() {
        WorkflowParticipant p =
                participant(
                        ParticipantStatus.VIEWED,
                        ShareAccessRole.EDITOR,
                        LocalDateTime.now().plusDays(1));

        assertThat(p.canEdit()).isTrue();
    }

    @Test
    void canEdit_trueForActiveCommenter() {
        WorkflowParticipant p =
                participant(ParticipantStatus.PENDING, ShareAccessRole.COMMENTER, null);

        assertThat(p.canEdit()).isTrue();
    }

    @Test
    void canEdit_falseForViewerRole() {
        WorkflowParticipant p =
                participant(ParticipantStatus.PENDING, ShareAccessRole.VIEWER, null);

        assertThat(p.canEdit()).isFalse();
    }

    @Test
    void canEdit_falseWhenRoleIsNull() {
        WorkflowParticipant p = participant(ParticipantStatus.PENDING, null, null);

        assertThat(p.canEdit()).isFalse();
    }

    @Test
    void canEdit_falseWhenCompletedEvenWithEditorRole() {
        WorkflowParticipant signed =
                participant(ParticipantStatus.SIGNED, ShareAccessRole.EDITOR, null);
        WorkflowParticipant declined =
                participant(ParticipantStatus.DECLINED, ShareAccessRole.COMMENTER, null);

        assertThat(signed.canEdit()).isFalse();
        assertThat(declined.canEdit()).isFalse();
    }

    @Test
    void canEdit_falseWhenExpiredEvenWithEditorRole() {
        WorkflowParticipant p =
                participant(
                        ParticipantStatus.VIEWED,
                        ShareAccessRole.EDITOR,
                        LocalDateTime.now().minusMinutes(1));

        assertThat(p.canEdit()).isFalse();
    }

    @Test
    void canEdit_trueWhenExpiresAtNullAndEditor() {
        // Null expiry means "never expires" - editing remains allowed.
        WorkflowParticipant p =
                participant(ParticipantStatus.NOTIFIED, ShareAccessRole.EDITOR, null);

        assertThat(p.canEdit()).isTrue();
    }

    // -------------------------------------------------------------------------
    // addNotification(String)
    // -------------------------------------------------------------------------

    @Test
    void addNotification_appendsInOrder() {
        WorkflowParticipant p = new WorkflowParticipant();

        p.addNotification("first");
        p.addNotification("second");

        assertThat(p.getNotifications()).containsExactly("first", "second");
    }

    @Test
    void addNotification_allowsDuplicatesAndNullAndEmpty() {
        WorkflowParticipant p = new WorkflowParticipant();

        p.addNotification("dup");
        p.addNotification("dup");
        p.addNotification(null);
        p.addNotification("");

        assertThat(p.getNotifications()).containsExactly("dup", "dup", null, "");
        assertThat(p.getNotifications()).hasSize(4);
    }

    @Test
    void addNotification_usesProvidedListInstance() {
        WorkflowParticipant p = new WorkflowParticipant();
        List<String> backing = p.getNotifications();

        p.addNotification("x");

        // addNotification mutates the existing list rather than replacing it.
        assertThat(p.getNotifications()).isSameAs(backing);
        assertThat(backing).containsExactly("x");
    }

    @Test
    void addNotification_throwsNpeWhenBackingListIsNull() {
        // The helper does not guard against a null list, so a null collection NPEs on add.
        WorkflowParticipant p = new WorkflowParticipant();
        p.setNotifications(null);

        assertThatNullPointerException().isThrownBy(() -> p.addNotification("boom"));
    }
}
