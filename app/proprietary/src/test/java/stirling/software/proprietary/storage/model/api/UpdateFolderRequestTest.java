package stirling.software.proprietary.storage.model.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link UpdateFolderRequest}.
 *
 * <p>This is a pure Lombok {@code @Data} POJO with no collaborators, so the tests construct it
 * directly with the no-arg constructor + setters and the all-args constructor - no Spring context,
 * no Jackson, no mocks. The behavior of interest is {@link UpdateFolderRequest#shouldReparent()},
 * which collapses the nullable boxed {@code Boolean reparent} field to a primitive: only
 * {@code Boolean.TRUE} yields {@code true}; {@code null} and {@code Boolean.FALSE} both yield
 * {@code false}. The Lombok-generated accessors / equals / hashCode round out coverage.
 */
class UpdateFolderRequestTest {

    // ─── shouldReparent(): the null -> false -> true collapse ────────────────────

    @Test
    void shouldReparent_defaultNoArgConstruction_isFalse() {
        // reparent field defaults to null on a freshly constructed request.
        UpdateFolderRequest request = new UpdateFolderRequest();

        assertThat(request.getReparent()).isNull();
        assertThat(request.shouldReparent()).isFalse();
    }

    @Test
    void shouldReparent_explicitNull_isFalse() {
        UpdateFolderRequest request = new UpdateFolderRequest();
        request.setReparent(null);

        assertThat(request.shouldReparent()).isFalse();
    }

    @Test
    void shouldReparent_false_isFalse() {
        UpdateFolderRequest request = new UpdateFolderRequest();
        request.setReparent(Boolean.FALSE);

        assertThat(request.getReparent()).isFalse();
        assertThat(request.shouldReparent()).isFalse();
    }

    @Test
    void shouldReparent_true_isTrue() {
        UpdateFolderRequest request = new UpdateFolderRequest();
        request.setReparent(Boolean.TRUE);

        assertThat(request.getReparent()).isTrue();
        assertThat(request.shouldReparent()).isTrue();
    }

    @Test
    void shouldReparent_nonCachedTrueInstance_isStillTrue() {
        // Boolean.TRUE.equals(reparent) compares by value, so a distinct (non-interned) Boolean
        // holding true must behave identically to Boolean.TRUE.
        UpdateFolderRequest request = new UpdateFolderRequest();
        request.setReparent(Boolean.valueOf("true"));

        assertThat(request.shouldReparent()).isTrue();
    }

    @Test
    void shouldReparent_isIndependentOfParentFolderId() {
        // The whole point of the flag: parentFolderId == null is ambiguous, so reparenting is
        // driven solely by the flag, never by whether a parent id happens to be present.
        UpdateFolderRequest moveToRoot = new UpdateFolderRequest();
        moveToRoot.setReparent(Boolean.TRUE);
        moveToRoot.setParentFolderId(null);
        assertThat(moveToRoot.shouldReparent()).isTrue();

        UpdateFolderRequest parentSetButNoFlag = new UpdateFolderRequest();
        parentSetButNoFlag.setParentFolderId(UUID.randomUUID());
        assertThat(parentSetButNoFlag.getParentFolderId()).isNotNull();
        assertThat(parentSetButNoFlag.shouldReparent()).isFalse();
    }

    // ─── all-args constructor + getters ──────────────────────────────────────────

    @Test
    void allArgsConstructor_populatesEveryField() {
        UUID parentId = UUID.fromString("11111111-1111-1111-1111-111111111111");

        UpdateFolderRequest request =
                new UpdateFolderRequest("Reports", Boolean.TRUE, parentId, "#FF0000", "folder-star");

        assertThat(request.getName()).isEqualTo("Reports");
        assertThat(request.getReparent()).isTrue();
        assertThat(request.getParentFolderId()).isEqualTo(parentId);
        assertThat(request.getColor()).isEqualTo("#FF0000");
        assertThat(request.getIcon()).isEqualTo("folder-star");
        assertThat(request.shouldReparent()).isTrue();
    }

    @Test
    void allArgsConstructor_withNullReparent_shouldReparentIsFalse() {
        UpdateFolderRequest request =
                new UpdateFolderRequest("name", null, null, null, null);

        assertThat(request.shouldReparent()).isFalse();
    }

    // ─── setters round-trip ──────────────────────────────────────────────────────

    @Test
    void setters_roundTripEveryField() {
        UUID parentId = UUID.randomUUID();
        UpdateFolderRequest request = new UpdateFolderRequest();

        request.setName("Invoices");
        request.setReparent(Boolean.FALSE);
        request.setParentFolderId(parentId);
        request.setColor("#0011223344".substring(0, 7)); // "#001122"
        request.setIcon("home_2-icon");

        assertThat(request.getName()).isEqualTo("Invoices");
        assertThat(request.getReparent()).isFalse();
        assertThat(request.getParentFolderId()).isEqualTo(parentId);
        assertThat(request.getColor()).isEqualTo("#001122");
        assertThat(request.getIcon()).isEqualTo("home_2-icon");
    }

    @Test
    void fields_defaultToNullOnNoArgConstruction() {
        UpdateFolderRequest request = new UpdateFolderRequest();

        assertThat(request.getName()).isNull();
        assertThat(request.getReparent()).isNull();
        assertThat(request.getParentFolderId()).isNull();
        assertThat(request.getColor()).isNull();
        assertThat(request.getIcon()).isNull();
    }

    // ─── Lombok @Data value semantics ────────────────────────────────────────────

    @Test
    void equalsAndHashCode_sameComponents_areEqual() {
        UUID parentId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        UpdateFolderRequest a =
                new UpdateFolderRequest("n", Boolean.TRUE, parentId, "#abcdef", "icon");
        UpdateFolderRequest b =
                new UpdateFolderRequest("n", Boolean.TRUE, parentId, "#abcdef", "icon");

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_differingInReparent_areNotEqual() {
        UpdateFolderRequest withTrue =
                new UpdateFolderRequest("n", Boolean.TRUE, null, null, null);
        UpdateFolderRequest withNull =
                new UpdateFolderRequest("n", null, null, null, null);

        assertThat(withTrue).isNotEqualTo(withNull);
    }

    @Test
    void equals_sameInstanceAndNullAndOtherType() {
        UpdateFolderRequest request =
                new UpdateFolderRequest("n", Boolean.FALSE, null, null, null);

        assertThat(request).isEqualTo(request);
        assertThat(request).isNotEqualTo(null);
        assertThat(request).isNotEqualTo("not a request");
    }

    @Test
    void toString_containsFieldValues() {
        UpdateFolderRequest request =
                new UpdateFolderRequest("Reports", Boolean.TRUE, null, "#FF0000", "star");

        // Lombok @Data renders all fields; assert the human-readable values are present.
        assertThat(request.toString())
                .contains("Reports")
                .contains("#FF0000")
                .contains("star")
                .contains("true");
    }
}
