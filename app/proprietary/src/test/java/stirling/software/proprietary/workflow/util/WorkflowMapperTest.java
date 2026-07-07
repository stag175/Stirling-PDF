package stirling.software.proprietary.workflow.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.WetSignatureMetadata;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Unit tests for {@link WorkflowMapper} entity->DTO conversion. Focuses on full-field mapping, null
 * guards, signed-count filtering, original/processed file id propagation, and the
 * ObjectMapper-based wet-signature extraction path (including its empty and exception branches).
 *
 * <p>Share-token include/exclude behaviour (GHSA-qgg6-mxw4-xg62) is covered separately in {@code
 * WorkflowMapperShareTokenTest}; this class focuses on the remaining mapping behaviour.
 *
 * <p>{@link WorkflowMapper} consumes the legacy {@code com.fasterxml.jackson.databind.ObjectMapper}
 * (matching the production {@code SigningSessionController}), so this test constructs that type
 * rather than the {@code tools.jackson} variant used by other neighbours.
 */
class WorkflowMapperTest {

    private User owner(long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    private StoredFile storedFile(long id) {
        StoredFile file = new StoredFile();
        file.setId(id);
        return file;
    }

    private WorkflowParticipant participant(
            long id, String email, String name, ParticipantStatus status) {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setId(id);
        p.setEmail(email);
        p.setName(name);
        p.setStatus(status);
        p.setAccessRole(ShareAccessRole.EDITOR);
        p.setShareToken("token-" + id);
        return p;
    }

    private WorkflowSession baseSession() {
        WorkflowSession session = new WorkflowSession();
        session.setSessionId("session-123");
        session.setOwner(owner(7L, "owner@example.com"));
        session.setOriginalFile(storedFile(100L));
        session.setWorkflowType(WorkflowType.SIGNING);
        session.setDocumentName("contract.pdf");
        return session;
    }

    // -------------------------------------------------------------------------
    // toResponse(session) — null guard
    // -------------------------------------------------------------------------

    @Test
    void toResponse_nullSession_returnsNull() {
        assertThat(WorkflowMapper.toResponse(null)).isNull();
    }

    @Test
    void toResponse_nullSession_withObjectMapper_returnsNull() {
        assertThat(WorkflowMapper.toResponse(null, new ObjectMapper())).isNull();
    }

    @Test
    void toResponse_nullSession_withObjectMapperAndFlag_returnsNull() {
        assertThat(WorkflowMapper.toResponse(null, new ObjectMapper(), false)).isNull();
    }

    // -------------------------------------------------------------------------
    // toResponse(session) — full scalar field mapping
    // -------------------------------------------------------------------------

    @Test
    void toResponse_mapsAllScalarFields() {
        LocalDateTime created = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
        LocalDateTime updated = LocalDateTime.of(2024, 6, 7, 8, 9, 10);

        WorkflowSession session = baseSession();
        session.setOwnerEmail("owner@example.com");
        session.setMessage("please sign");
        session.setDueDate("2024-12-31");
        session.setStatus(WorkflowStatus.COMPLETED);
        session.setFinalized(true);
        session.setCreatedAt(created);
        session.setUpdatedAt(updated);
        session.setProcessedFile(storedFile(200L));

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response).isNotNull();
        assertThat(response.getSessionId()).isEqualTo("session-123");
        assertThat(response.getOwnerId()).isEqualTo(7L);
        assertThat(response.getOwnerUsername()).isEqualTo("owner@example.com");
        assertThat(response.getWorkflowType()).isEqualTo(WorkflowType.SIGNING);
        assertThat(response.getDocumentName()).isEqualTo("contract.pdf");
        assertThat(response.getOwnerEmail()).isEqualTo("owner@example.com");
        assertThat(response.getMessage()).isEqualTo("please sign");
        assertThat(response.getDueDate()).isEqualTo("2024-12-31");
        assertThat(response.getStatus()).isEqualTo(WorkflowStatus.COMPLETED);
        assertThat(response.isFinalized()).isTrue();
        assertThat(response.getCreatedAt()).isEqualTo(created);
        assertThat(response.getUpdatedAt()).isEqualTo(updated);
    }

    // -------------------------------------------------------------------------
    // toResponse(session) — file id propagation / null guards
    // -------------------------------------------------------------------------

    @Test
    void toResponse_withBothFiles_propagatesFileIdsAndHasProcessedFileTrue() {
        WorkflowSession session = baseSession();
        session.setProcessedFile(storedFile(200L));

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getOriginalFileId()).isEqualTo(100L);
        assertThat(response.getProcessedFileId()).isEqualTo(200L);
        assertThat(response.isHasProcessedFile()).isTrue();
    }

    @Test
    void toResponse_withoutProcessedFile_leavesProcessedIdNullAndHasProcessedFileFalse() {
        WorkflowSession session = baseSession();

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getOriginalFileId()).isEqualTo(100L);
        assertThat(response.getProcessedFileId()).isNull();
        assertThat(response.isHasProcessedFile()).isFalse();
    }

    @Test
    void toResponse_withoutOriginalFile_leavesOriginalIdNull() {
        WorkflowSession session = baseSession();
        session.setOriginalFile(null);

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getOriginalFileId()).isNull();
    }

    // -------------------------------------------------------------------------
    // toResponse(session) — participant counts and SIGNED filter
    // -------------------------------------------------------------------------

    @Test
    void toResponse_noParticipants_countsAreZero() {
        WorkflowSession session = baseSession();

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getParticipants()).isEmpty();
        assertThat(response.getParticipantCount()).isZero();
        assertThat(response.getSignedCount()).isZero();
    }

    @Test
    void toResponse_signedCount_countsOnlySignedParticipants() {
        WorkflowSession session = baseSession();
        session.addParticipant(participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED));
        session.addParticipant(participant(2L, "b@x.com", "B", ParticipantStatus.PENDING));
        session.addParticipant(participant(3L, "c@x.com", "C", ParticipantStatus.SIGNED));
        session.addParticipant(participant(4L, "d@x.com", "D", ParticipantStatus.DECLINED));
        session.addParticipant(participant(5L, "e@x.com", "E", ParticipantStatus.VIEWED));

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getParticipantCount()).isEqualTo(5);
        assertThat(response.getSignedCount()).isEqualTo(2);
        assertThat(response.getParticipants()).hasSize(5);
    }

    @Test
    void toResponse_signedCount_zeroWhenNoneSigned() {
        WorkflowSession session = baseSession();
        session.addParticipant(participant(1L, "a@x.com", "A", ParticipantStatus.PENDING));
        session.addParticipant(participant(2L, "b@x.com", "B", ParticipantStatus.DECLINED));

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getParticipantCount()).isEqualTo(2);
        assertThat(response.getSignedCount()).isZero();
    }

    // -------------------------------------------------------------------------
    // toResponse(session, objectMapper) vs toResponse(session) — wetSignatures branch
    // -------------------------------------------------------------------------

    @Test
    void toResponse_withoutObjectMapper_doesNotPopulateWetSignatures() {
        WorkflowSession session = baseSession();
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(metadataWithOneWetSignature());
        session.addParticipant(p);

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertThat(response.getParticipants().get(0).getWetSignatures()).isNull();
    }

    @Test
    void toResponse_withObjectMapper_populatesWetSignatures() {
        WorkflowSession session = baseSession();
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(metadataWithOneWetSignature());
        session.addParticipant(p);

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session, new ObjectMapper());

        List<WetSignatureMetadata> sigs = response.getParticipants().get(0).getWetSignatures();
        assertThat(sigs).hasSize(1);
        assertThat(sigs.get(0).getType()).isEqualTo("text");
        assertThat(sigs.get(0).getPage()).isEqualTo(0);
    }

    // -------------------------------------------------------------------------
    // toParticipantResponse(participant) — null guard and field mapping
    // -------------------------------------------------------------------------

    @Test
    void toParticipantResponse_nullParticipant_returnsNull() {
        assertThat(WorkflowMapper.toParticipantResponse(null)).isNull();
    }

    @Test
    void toParticipantResponse_nullParticipant_withFlag_returnsNull() {
        assertThat(WorkflowMapper.toParticipantResponse(null, false)).isNull();
    }

    @Test
    void toParticipantResponse_mapsAllFields() {
        LocalDateTime expiresAt = LocalDateTime.of(2030, 1, 1, 0, 0);
        WorkflowParticipant p = participant(9L, "p@x.com", "Pat", ParticipantStatus.SIGNED);
        p.setUser(owner(55L, "linkeduser"));
        p.setExpiresAt(expiresAt);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p);

        assertThat(response.getId()).isEqualTo(9L);
        assertThat(response.getUserId()).isEqualTo(55L);
        assertThat(response.getEmail()).isEqualTo("p@x.com");
        assertThat(response.getName()).isEqualTo("Pat");
        assertThat(response.getStatus()).isEqualTo(ParticipantStatus.SIGNED);
        assertThat(response.getShareToken()).isEqualTo("token-9");
        assertThat(response.getAccessRole()).isEqualTo(ShareAccessRole.EDITOR);
        assertThat(response.getExpiresAt()).isEqualTo(expiresAt);
        // SIGNED -> hasCompleted() true; expiry in the future -> isExpired() false.
        assertThat(response.isHasCompleted()).isTrue();
        assertThat(response.isExpired()).isFalse();
    }

    @Test
    void toParticipantResponse_nullUser_leavesUserIdNull() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.PENDING);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p);

        assertThat(response.getUserId()).isNull();
    }

    @Test
    void toParticipantResponse_pendingNonExpired_hasCompletedFalse() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.PENDING);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p);

        assertThat(response.isHasCompleted()).isFalse();
        assertThat(response.isExpired()).isFalse();
    }

    @Test
    void toParticipantResponse_pastExpiry_isExpiredTrue() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.PENDING);
        p.setExpiresAt(LocalDateTime.of(2000, 1, 1, 0, 0));

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p);

        assertThat(response.isExpired()).isTrue();
    }

    // -------------------------------------------------------------------------
    // toParticipantResponse(participant, objectMapper, ...) — wetSignatures
    // -------------------------------------------------------------------------

    @Test
    void toParticipantResponse_withObjectMapper_extractsWetSignatures() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(metadataWithTwoWetSignatures());

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).hasSize(2);
        assertThat(response.getWetSignatures().get(0).getType()).isEqualTo("text");
        assertThat(response.getWetSignatures().get(1).getType()).isEqualTo("canvas");
        // Default legacy overload still includes the share token.
        assertThat(response.getShareToken()).isEqualTo("token-1");
    }

    @Test
    void toParticipantResponse_withObjectMapperAndFlagFalse_stripsTokenButKeepsSignatures() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(metadataWithOneWetSignature());

        ParticipantResponse response =
                WorkflowMapper.toParticipantResponse(p, new ObjectMapper(), false);

        assertThat(response.getShareToken()).isNull();
        assertThat(response.getWetSignatures()).hasSize(1);
    }

    @Test
    void toParticipantResponse_withObjectMapper_nullParticipant_returnsNull() {
        assertThat(WorkflowMapper.toParticipantResponse(null, new ObjectMapper())).isNull();
    }

    // -------------------------------------------------------------------------
    // extractWetSignatures (via public overloads) — empty / missing-key branches
    // -------------------------------------------------------------------------

    @Test
    void wetSignatures_nullMetadata_returnsEmptyList() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(null);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).isEmpty();
    }

    @Test
    void wetSignatures_emptyMetadata_returnsEmptyList() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        p.setParticipantMetadata(new HashMap<>());

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).isEmpty();
    }

    @Test
    void wetSignatures_metadataWithoutWetSignaturesKey_returnsEmptyList() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("someOtherKey", "value");
        p.setParticipantMetadata(metadata);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).isEmpty();
    }

    @Test
    void wetSignatures_wetSignaturesNotAnArray_returnsEmptyList() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", "not-an-array");
        p.setParticipantMetadata(metadata);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).isEmpty();
    }

    // -------------------------------------------------------------------------
    // extractWetSignatures — exception branch (malformed element fails treeToValue)
    // -------------------------------------------------------------------------

    @Test
    void wetSignatures_malformedArrayElement_swallowsExceptionAndReturnsEmptyList() {
        WorkflowParticipant p = participant(1L, "a@x.com", "A", ParticipantStatus.SIGNED);
        Map<String, Object> metadata = new HashMap<>();
        // An array whose element is a scalar string cannot bind to the WetSignatureMetadata
        // POJO, so treeToValue throws and the catch block returns the (empty) accumulator.
        metadata.put("wetSignatures", List.of("this-is-not-an-object"));
        p.setParticipantMetadata(metadata);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, new ObjectMapper());

        assertThat(response.getWetSignatures()).isEmpty();
    }

    // -------------------------------------------------------------------------
    // Helpers — metadata builders
    // -------------------------------------------------------------------------

    private Map<String, Object> wetSignature(String type, int page) {
        Map<String, Object> sig = new LinkedHashMap<>();
        sig.put("type", type);
        sig.put("data", "text".equals(type) ? "John Doe" : "data:image/png;base64,abc==");
        sig.put("page", page);
        sig.put("x", 0.1);
        sig.put("y", 0.1);
        sig.put("width", 0.3);
        sig.put("height", 0.2);
        return sig;
    }

    private Map<String, Object> metadataWithOneWetSignature() {
        List<Object> sigs = new ArrayList<>();
        sigs.add(wetSignature("text", 0));
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", sigs);
        return metadata;
    }

    private Map<String, Object> metadataWithTwoWetSignatures() {
        List<Object> sigs = new ArrayList<>();
        sigs.add(wetSignature("text", 0));
        sigs.add(wetSignature("canvas", 1));
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", sigs);
        return metadata;
    }
}
