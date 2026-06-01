package stirling.software.proprietary.workflow.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Unit tests for the Lombok {@code @Data} DTO {@link WorkflowSessionResponse}. Exercises the
 * no-args and all-args constructors plus the generated getters/setters/equals/hashCode/toString as
 * a plain POJO (no Spring context, no DB, no session).
 */
class WorkflowSessionResponseTest {

    private static final LocalDateTime CREATED = LocalDateTime.of(2026, 1, 1, 10, 30, 0);
    private static final LocalDateTime UPDATED = LocalDateTime.of(2026, 1, 2, 11, 45, 0);

    private static ParticipantResponse participant() {
        // Use no-arg constructor + setter to avoid coupling to ParticipantResponse's full shape.
        ParticipantResponse p = new ParticipantResponse();
        p.setEmail("signer@example.com");
        return p;
    }

    /**
     * Builds a fully-populated instance via the all-args constructor. Field order MUST match the
     * declaration order in WorkflowSessionResponse: sessionId, ownerId, ownerUsername,
     * workflowType, documentName, ownerEmail, message, dueDate, status, finalized, createdAt,
     * updatedAt, participants, participantCount, signedCount, hasProcessedFile, originalFileId,
     * processedFileId.
     */
    private static WorkflowSessionResponse sample() {
        return new WorkflowSessionResponse(
                "sess-123",
                42L,
                "alice",
                WorkflowType.SIGNING,
                "contract.pdf",
                "alice@example.com",
                "Please sign",
                "2026-12-31",
                WorkflowStatus.IN_PROGRESS,
                false,
                CREATED,
                UPDATED,
                List.of(participant()),
                3,
                1,
                true,
                100L,
                200L);
    }

    // -------------------------------------------------------------------------
    // No-args constructor + default field values
    // -------------------------------------------------------------------------

    @Test
    void noArgsConstructor_objectFields_defaultToNull() {
        WorkflowSessionResponse r = new WorkflowSessionResponse();

        assertThat(r.getSessionId()).isNull();
        assertThat(r.getOwnerId()).isNull();
        assertThat(r.getOwnerUsername()).isNull();
        assertThat(r.getWorkflowType()).isNull();
        assertThat(r.getDocumentName()).isNull();
        assertThat(r.getOwnerEmail()).isNull();
        assertThat(r.getMessage()).isNull();
        assertThat(r.getDueDate()).isNull();
        assertThat(r.getStatus()).isNull();
        assertThat(r.getCreatedAt()).isNull();
        assertThat(r.getUpdatedAt()).isNull();
        assertThat(r.getParticipants()).isNull();
        assertThat(r.getOriginalFileId()).isNull();
        assertThat(r.getProcessedFileId()).isNull();
    }

    @Test
    void noArgsConstructor_primitiveFields_defaultToZeroOrFalse() {
        WorkflowSessionResponse r = new WorkflowSessionResponse();

        assertThat(r.isFinalized()).isFalse();
        assertThat(r.getParticipantCount()).isZero();
        assertThat(r.getSignedCount()).isZero();
        assertThat(r.isHasProcessedFile()).isFalse();
    }

    // -------------------------------------------------------------------------
    // All-args constructor maps every argument to the matching getter
    // -------------------------------------------------------------------------

    @Test
    void allArgsConstructor_populatesEveryField() {
        ParticipantResponse p = participant();
        List<ParticipantResponse> participants = List.of(p);

        WorkflowSessionResponse r =
                new WorkflowSessionResponse(
                        "sess-123",
                        42L,
                        "alice",
                        WorkflowType.SIGNING,
                        "contract.pdf",
                        "alice@example.com",
                        "Please sign",
                        "2026-12-31",
                        WorkflowStatus.IN_PROGRESS,
                        true,
                        CREATED,
                        UPDATED,
                        participants,
                        3,
                        1,
                        true,
                        100L,
                        200L);

        assertThat(r.getSessionId()).isEqualTo("sess-123");
        assertThat(r.getOwnerId()).isEqualTo(42L);
        assertThat(r.getOwnerUsername()).isEqualTo("alice");
        assertThat(r.getWorkflowType()).isEqualTo(WorkflowType.SIGNING);
        assertThat(r.getDocumentName()).isEqualTo("contract.pdf");
        assertThat(r.getOwnerEmail()).isEqualTo("alice@example.com");
        assertThat(r.getMessage()).isEqualTo("Please sign");
        assertThat(r.getDueDate()).isEqualTo("2026-12-31");
        assertThat(r.getStatus()).isEqualTo(WorkflowStatus.IN_PROGRESS);
        assertThat(r.isFinalized()).isTrue();
        assertThat(r.getCreatedAt()).isEqualTo(CREATED);
        assertThat(r.getUpdatedAt()).isEqualTo(UPDATED);
        assertThat(r.getParticipants()).isSameAs(participants).containsExactly(p);
        assertThat(r.getParticipantCount()).isEqualTo(3);
        assertThat(r.getSignedCount()).isEqualTo(1);
        assertThat(r.isHasProcessedFile()).isTrue();
        assertThat(r.getOriginalFileId()).isEqualTo(100L);
        assertThat(r.getProcessedFileId()).isEqualTo(200L);
    }

    @Test
    void allArgsConstructor_acceptsNullsAndEmptyCollections() {
        WorkflowSessionResponse r =
                new WorkflowSessionResponse(
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        false,
                        null,
                        null,
                        new ArrayList<>(),
                        0,
                        0,
                        false,
                        null,
                        null);

        assertThat(r.getSessionId()).isNull();
        assertThat(r.getWorkflowType()).isNull();
        assertThat(r.getStatus()).isNull();
        assertThat(r.getParticipants()).isEmpty();
        assertThat(r.getOriginalFileId()).isNull();
        assertThat(r.getProcessedFileId()).isNull();
        assertThat(r.isFinalized()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Setters round-trip through getters
    // -------------------------------------------------------------------------

    @Test
    void setters_roundTripThroughGetters() {
        WorkflowSessionResponse r = new WorkflowSessionResponse();
        ParticipantResponse p = participant();
        List<ParticipantResponse> participants = List.of(p);

        r.setSessionId("sess-999");
        r.setOwnerId(7L);
        r.setOwnerUsername("bob");
        r.setWorkflowType(WorkflowType.APPROVAL);
        r.setDocumentName("report.pdf");
        r.setOwnerEmail("bob@example.com");
        r.setMessage("Approve please");
        r.setDueDate("2027-01-15");
        r.setStatus(WorkflowStatus.COMPLETED);
        r.setFinalized(true);
        r.setCreatedAt(CREATED);
        r.setUpdatedAt(UPDATED);
        r.setParticipants(participants);
        r.setParticipantCount(5);
        r.setSignedCount(2);
        r.setHasProcessedFile(true);
        r.setOriginalFileId(11L);
        r.setProcessedFileId(22L);

        assertThat(r.getSessionId()).isEqualTo("sess-999");
        assertThat(r.getOwnerId()).isEqualTo(7L);
        assertThat(r.getOwnerUsername()).isEqualTo("bob");
        assertThat(r.getWorkflowType()).isEqualTo(WorkflowType.APPROVAL);
        assertThat(r.getDocumentName()).isEqualTo("report.pdf");
        assertThat(r.getOwnerEmail()).isEqualTo("bob@example.com");
        assertThat(r.getMessage()).isEqualTo("Approve please");
        assertThat(r.getDueDate()).isEqualTo("2027-01-15");
        assertThat(r.getStatus()).isEqualTo(WorkflowStatus.COMPLETED);
        assertThat(r.isFinalized()).isTrue();
        assertThat(r.getCreatedAt()).isEqualTo(CREATED);
        assertThat(r.getUpdatedAt()).isEqualTo(UPDATED);
        assertThat(r.getParticipants()).containsExactly(p);
        assertThat(r.getParticipantCount()).isEqualTo(5);
        assertThat(r.getSignedCount()).isEqualTo(2);
        assertThat(r.isHasProcessedFile()).isTrue();
        assertThat(r.getOriginalFileId()).isEqualTo(11L);
        assertThat(r.getProcessedFileId()).isEqualTo(22L);
    }

    @Test
    void setters_acceptNull_overwritingPreviousValues() {
        WorkflowSessionResponse r = sample();

        r.setSessionId(null);
        r.setOwnerId(null);
        r.setWorkflowType(null);
        r.setStatus(null);
        r.setParticipants(null);
        r.setOriginalFileId(null);
        r.setProcessedFileId(null);

        assertThat(r.getSessionId()).isNull();
        assertThat(r.getOwnerId()).isNull();
        assertThat(r.getWorkflowType()).isNull();
        assertThat(r.getStatus()).isNull();
        assertThat(r.getParticipants()).isNull();
        assertThat(r.getOriginalFileId()).isNull();
        assertThat(r.getProcessedFileId()).isNull();
    }

    // -------------------------------------------------------------------------
    // equals / hashCode (Lombok @Data uses all fields)
    // -------------------------------------------------------------------------

    @Test
    void equals_and_hashCode_basedOnAllFields() {
        WorkflowSessionResponse a = sample();
        WorkflowSessionResponse b = sample();

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_isReflexive() {
        WorkflowSessionResponse a = sample();
        assertThat(a).isEqualTo(a);
    }

    @Test
    void equals_returnsFalseForNullAndOtherType() {
        WorkflowSessionResponse a = sample();

        assertThat(a).isNotEqualTo(null);
        assertThat(a).isNotEqualTo("not-a-response");
    }

    @Test
    void equals_twoFreshNoArgInstances_areEqual() {
        WorkflowSessionResponse a = new WorkflowSessionResponse();
        WorkflowSessionResponse b = new WorkflowSessionResponse();

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_differsWhenSessionIdDiffers() {
        WorkflowSessionResponse a = sample();
        WorkflowSessionResponse b = sample();
        b.setSessionId("different");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenStatusDiffers() {
        WorkflowSessionResponse a = sample();
        WorkflowSessionResponse b = sample();
        b.setStatus(WorkflowStatus.CANCELLED);

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenFinalizedPrimitiveDiffers() {
        WorkflowSessionResponse a = sample();
        WorkflowSessionResponse b = sample();
        b.setFinalized(true); // sample() uses finalized=false

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenParticipantCountDiffers() {
        WorkflowSessionResponse a = sample();
        WorkflowSessionResponse b = sample();
        b.setParticipantCount(99);

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_distinguishesNullVsNonNullField() {
        WorkflowSessionResponse withOwner = sample();
        WorkflowSessionResponse withoutOwner = sample();
        withoutOwner.setOwnerId(null);

        assertThat(withOwner).isNotEqualTo(withoutOwner);
    }

    // -------------------------------------------------------------------------
    // toString
    // -------------------------------------------------------------------------

    @Test
    void toString_containsClassNameAndFieldValues() {
        String text = sample().toString();

        assertThat(text)
                .contains("WorkflowSessionResponse")
                .contains("sessionId=sess-123")
                .contains("ownerUsername=alice")
                .contains("workflowType=SIGNING")
                .contains("status=IN_PROGRESS")
                .contains("finalized=false")
                .contains("participantCount=3");
    }
}
