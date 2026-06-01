package stirling.software.proprietary.storage.model.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.storage.model.Folder;

/**
 * Unit tests for {@link FolderResponse} and its {@link FolderResponse#from(Folder)} mapper.
 *
 * <p>{@code Folder} is a plain Lombok POJO entity, so these tests build it directly with setters -
 * no Hibernate, no Spring context, no mocks. The behavior under test is the field-by-field copy and
 * the null-safe {@code parent -> parentFolderId} derivation.
 */
class FolderResponseTest {

    private static Folder folder(UUID id, String name, Folder parent) {
        Folder f = new Folder();
        f.setId(id);
        f.setName(name);
        f.setParent(parent);
        return f;
    }

    // ─── from(): full mapping with a parent ──────────────────────────────────────

    @Test
    void from_copiesEveryFieldAndDerivesParentId() {
        UUID parentId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID childId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        LocalDateTime created = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
        LocalDateTime updated = LocalDateTime.of(2024, 6, 7, 8, 9, 10);

        Folder parent = folder(parentId, "parent", null);

        Folder child = folder(childId, "Reports", parent);
        child.setColor("#FF0000");
        child.setIcon("folder-star");
        child.setVersion(7L);
        child.setCreatedAt(created);
        child.setUpdatedAt(updated);

        FolderResponse response = FolderResponse.from(child);

        assertThat(response.id()).isEqualTo(childId);
        assertThat(response.name()).isEqualTo("Reports");
        assertThat(response.parentFolderId()).isEqualTo(parentId);
        assertThat(response.color()).isEqualTo("#FF0000");
        assertThat(response.icon()).isEqualTo("folder-star");
        assertThat(response.version()).isEqualTo(7L);
        assertThat(response.createdAt()).isEqualTo(created);
        assertThat(response.updatedAt()).isEqualTo(updated);
    }

    // ─── from(): null-safe parent derivation ─────────────────────────────────────

    @Test
    void from_rootFolderWithNullParent_yieldsNullParentFolderId() {
        Folder root = folder(UUID.randomUUID(), "root", null);

        FolderResponse response = FolderResponse.from(root);

        assertThat(response.parentFolderId()).isNull();
    }

    @Test
    void from_parentPresentButParentIdNull_yieldsNullParentFolderId() {
        // A parent association exists, but the parent's own id is null (e.g. a not-yet-persisted
        // or partially-initialised parent). The mapper reads getParent().getId(), so the result
        // must be null rather than throwing.
        Folder parentWithoutId = folder(null, "ghost-parent", null);
        Folder child = folder(UUID.randomUUID(), "child", parentWithoutId);

        FolderResponse response = FolderResponse.from(child);

        assertThat(response.parentFolderId()).isNull();
    }

    @Test
    void from_nestedParentChain_usesImmediateParentIdOnly() {
        UUID grandParentId = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        UUID parentId = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

        Folder grandParent = folder(grandParentId, "grandparent", null);
        Folder parent = folder(parentId, "parent", grandParent);
        Folder child = folder(UUID.randomUUID(), "child", parent);

        FolderResponse response = FolderResponse.from(child);

        // Only the immediate parent id is surfaced, never the grandparent.
        assertThat(response.parentFolderId()).isEqualTo(parentId);
        assertThat(response.parentFolderId()).isNotEqualTo(grandParentId);
    }

    // ─── from(): optional / nullable scalar fields ───────────────────────────────

    @Test
    void from_allOptionalScalarsNull_arePreservedAsNull() {
        // Only id is set; everything else (name, color, icon, version, timestamps, parent) is null.
        Folder bare = new Folder();

        FolderResponse response = FolderResponse.from(bare);

        assertThat(response.id()).isNull();
        assertThat(response.name()).isNull();
        assertThat(response.parentFolderId()).isNull();
        assertThat(response.color()).isNull();
        assertThat(response.icon()).isNull();
        assertThat(response.version()).isNull();
        assertThat(response.createdAt()).isNull();
        assertThat(response.updatedAt()).isNull();
    }

    @Test
    void from_emptyStringFieldsArePreservedNotCoercedToNull() {
        Folder f = folder(UUID.randomUUID(), "", null);
        f.setColor("");
        f.setIcon("");

        FolderResponse response = FolderResponse.from(f);

        assertThat(response.name()).isEmpty();
        assertThat(response.color()).isEmpty();
        assertThat(response.icon()).isEmpty();
    }

    @Test
    void from_versionZeroBoundary_isPreserved() {
        Folder f = folder(UUID.randomUUID(), "v0", null);
        f.setVersion(0L);

        FolderResponse response = FolderResponse.from(f);

        assertThat(response.version()).isEqualTo(0L);
    }

    // ─── from(): null argument ───────────────────────────────────────────────────

    @Test
    void from_nullFolder_throwsNullPointerException() {
        assertThatThrownBy(() -> FolderResponse.from(null))
                .isInstanceOf(NullPointerException.class);
    }

    // ─── record value semantics ──────────────────────────────────────────────────

    @Test
    void records_withEqualComponents_areEqualAndShareHashCode() {
        UUID id = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        LocalDateTime created = LocalDateTime.of(2025, 3, 3, 3, 3, 3);
        LocalDateTime updated = LocalDateTime.of(2025, 4, 4, 4, 4, 4);

        FolderResponse a =
                new FolderResponse(id, "n", parentId, "#fff", "icon", 1L, created, updated);
        FolderResponse b =
                new FolderResponse(id, "n", parentId, "#fff", "icon", 1L, created, updated);

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void records_differingInOneComponent_areNotEqual() {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.of(2025, 1, 1, 0, 0);

        FolderResponse a = new FolderResponse(id, "a", null, null, null, 1L, now, now);
        FolderResponse b = new FolderResponse(id, "b", null, null, null, 1L, now, now);

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void from_twoCallsOnSameFolder_produceEqualResponses() {
        Folder parent = folder(UUID.randomUUID(), "parent", null);
        Folder f = folder(UUID.randomUUID(), "child", parent);
        f.setColor("#abc");
        f.setIcon("home");
        f.setVersion(3L);
        LocalDateTime ts = LocalDateTime.of(2026, 2, 2, 2, 2, 2);
        f.setCreatedAt(ts);
        f.setUpdatedAt(ts);

        // The mapper is a pure function of the folder's state - deterministic, no side effects.
        assertThat(FolderResponse.from(f)).isEqualTo(FolderResponse.from(f));
    }
}
