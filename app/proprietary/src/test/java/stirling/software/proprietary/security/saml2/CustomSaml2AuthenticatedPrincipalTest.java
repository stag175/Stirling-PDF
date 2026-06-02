package stirling.software.proprietary.security.saml2;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;

/**
 * Unit tests for the {@link CustomSaml2AuthenticatedPrincipal} record.
 *
 * <p>The {@code @ConditionalOnProperty} annotation only affects Spring bean registration, not
 * direct construction, so no Spring context is required. These tests exercise the overridden
 * {@code getName()} / {@code getAttributes()} accessors, the generated record components, the
 * inherited {@link Saml2AuthenticatedPrincipal} default methods, value semantics
 * (equals/hashCode/toString) and JDK serialization.
 */
class CustomSaml2AuthenticatedPrincipalTest {

    private static Map<String, List<Object>> sampleAttributes() {
        // Mirrors the production shape produced by CustomSaml2ResponseAuthenticationConverter:
        // Map<String, List<Object>> keyed by SAML attribute name. Use mutable, Serializable
        // collections so the JDK-serialization round-trip test also works.
        Map<String, List<Object>> attributes = new HashMap<>();
        attributes.put("username", new ArrayList<>(List.of("alice")));
        attributes.put("emailaddress", new ArrayList<>(List.of("alice@example.com", "a@corp.com")));
        return attributes;
    }

    private static CustomSaml2AuthenticatedPrincipal sample() {
        return new CustomSaml2AuthenticatedPrincipal(
                "alice", sampleAttributes(), "name-id-123", new ArrayList<>(List.of("idx-1", "idx-2")));
    }

    // -------------------------------------------------------------------------
    // Overridden interface accessors: getName / getAttributes
    // -------------------------------------------------------------------------

    @Test
    void getName_returnsNameComponent() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat(principal.getName()).isEqualTo("alice");
    }

    @Test
    void getName_matchesRecordComponentAccessor() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        // getName() simply delegates to the record component.
        assertThat(principal.getName()).isEqualTo(principal.name());
    }

    @Test
    void getName_returnsNullWhenNameIsNull() {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(null, sampleAttributes(), "nid", List.of());

        assertThat(principal.getName()).isNull();
    }

    @Test
    void getAttributes_returnsAttributesComponent() {
        Map<String, List<Object>> attributes = sampleAttributes();
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal("alice", attributes, "nid", List.of());

        assertThat(principal.getAttributes()).isEqualTo(attributes);
    }

    @Test
    void getAttributes_returnsSameMapInstance_noDefensiveCopy() {
        Map<String, List<Object>> attributes = sampleAttributes();
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal("alice", attributes, "nid", List.of());

        // Records do not defensively copy; the accessor exposes the original reference.
        assertThat(principal.getAttributes()).isSameAs(attributes);
        assertThat(principal.attributes()).isSameAs(attributes);
    }

    @Test
    void getAttributes_matchesRecordComponentAccessor() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat(principal.getAttributes()).isSameAs(principal.attributes());
    }

    @Test
    void getAttributes_returnsNullWhenAttributesNull() {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal("alice", null, "nid", List.of());

        // No compact constructor / null-guard, and the override returns the raw field.
        assertThat(principal.getAttributes()).isNull();
    }

    // -------------------------------------------------------------------------
    // Record component accessors: name / attributes / nameId / sessionIndexes
    // -------------------------------------------------------------------------

    @Test
    void recordComponents_returnConstructorArguments() {
        Map<String, List<Object>> attributes = sampleAttributes();
        List<String> sessionIndexes = new ArrayList<>(List.of("idx-1", "idx-2"));

        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        "alice", attributes, "name-id-123", sessionIndexes);

        assertThat(principal.name()).isEqualTo("alice");
        assertThat(principal.attributes()).isSameAs(attributes);
        assertThat(principal.nameId()).isEqualTo("name-id-123");
        assertThat(principal.sessionIndexes()).isSameAs(sessionIndexes);
    }

    @Test
    void allNullableComponents_acceptNull() {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(null, null, null, null);

        assertThat(principal.name()).isNull();
        assertThat(principal.attributes()).isNull();
        assertThat(principal.nameId()).isNull();
        assertThat(principal.sessionIndexes()).isNull();
    }

    @Test
    void sessionIndexes_componentPreservesContents() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat(principal.sessionIndexes()).containsExactly("idx-1", "idx-2");
    }

    // -------------------------------------------------------------------------
    // Inherited Saml2AuthenticatedPrincipal default methods (NOT overridden here)
    // -------------------------------------------------------------------------

    @Test
    void getAttribute_returnsListForKnownKey() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        // Default getAttribute delegates to the overridden getAttributes().get(name).
        List<Object> values = principal.getAttribute("emailaddress");

        assertThat(values).containsExactly("alice@example.com", "a@corp.com");
    }

    @Test
    void getAttribute_returnsNullForUnknownKey() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat((Object) principal.getAttribute("does-not-exist")).isNull();
    }

    @Test
    void getFirstAttribute_returnsFirstElementForKnownKey() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        // Default getFirstAttribute = CollectionUtils.firstElement(getAttribute(name)).
        String first = principal.getFirstAttribute("emailaddress");

        assertThat(first).isEqualTo("alice@example.com");
    }

    @Test
    void getFirstAttribute_returnsNullForUnknownKey() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat((Object) principal.getFirstAttribute("does-not-exist")).isNull();
    }

    @Test
    void getFirstAttribute_returnsNullWhenValueListIsEmpty() {
        Map<String, List<Object>> attributes = new HashMap<>();
        attributes.put("groups", new ArrayList<>());
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal("alice", attributes, "nid", List.of());

        // CollectionUtils.firstElement(emptyList) -> null.
        assertThat((Object) principal.getFirstAttribute("groups")).isNull();
    }

    @Test
    void getRelyingPartyRegistrationId_isNullByDefault() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        // The record does not override the default, which returns null.
        assertThat(principal.getRelyingPartyRegistrationId()).isNull();
    }

    @Test
    void getSessionIndexes_returnsEmptyList_notTheComponent() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        // IMPORTANT: getSessionIndexes() is the interface default (Collections.emptyList())
        // and is NOT overridden by this record, even though a sessionIndexes() component exists.
        // So the interface view differs from the record component view.
        assertThat(principal.getSessionIndexes()).isEmpty();
        assertThat(principal.sessionIndexes()).containsExactly("idx-1", "idx-2");
    }

    @Test
    void implementsSaml2AuthenticatedPrincipalAndSerializable() {
        CustomSaml2AuthenticatedPrincipal principal = sample();

        assertThat(principal).isInstanceOf(Saml2AuthenticatedPrincipal.class);
        assertThat(principal).isInstanceOf(java.io.Serializable.class);
    }

    // -------------------------------------------------------------------------
    // equals / hashCode / toString (record value semantics)
    // -------------------------------------------------------------------------

    @Test
    void equals_and_hashCode_basedOnAllComponents() {
        CustomSaml2AuthenticatedPrincipal a = sample();
        CustomSaml2AuthenticatedPrincipal b = sample();

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_isReflexive() {
        CustomSaml2AuthenticatedPrincipal a = sample();

        assertThat(a).isEqualTo(a);
    }

    @Test
    void equals_differsWhenNameDiffers() {
        CustomSaml2AuthenticatedPrincipal a = sample();
        CustomSaml2AuthenticatedPrincipal b =
                new CustomSaml2AuthenticatedPrincipal(
                        "bob",
                        sampleAttributes(),
                        "name-id-123",
                        new ArrayList<>(List.of("idx-1", "idx-2")));

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenNameIdDiffers() {
        CustomSaml2AuthenticatedPrincipal a = sample();
        CustomSaml2AuthenticatedPrincipal b =
                new CustomSaml2AuthenticatedPrincipal(
                        "alice",
                        sampleAttributes(),
                        "different-name-id",
                        new ArrayList<>(List.of("idx-1", "idx-2")));

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenAttributesDiffer() {
        CustomSaml2AuthenticatedPrincipal a = sample();
        CustomSaml2AuthenticatedPrincipal b =
                new CustomSaml2AuthenticatedPrincipal(
                        "alice",
                        new HashMap<>(),
                        "name-id-123",
                        new ArrayList<>(List.of("idx-1", "idx-2")));

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_differsWhenSessionIndexesDiffer() {
        CustomSaml2AuthenticatedPrincipal a = sample();
        CustomSaml2AuthenticatedPrincipal b =
                new CustomSaml2AuthenticatedPrincipal(
                        "alice",
                        sampleAttributes(),
                        "name-id-123",
                        new ArrayList<>(List.of("idx-1")));

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void equals_distinguishesNullVsNonNullComponent() {
        CustomSaml2AuthenticatedPrincipal withName = sample();
        CustomSaml2AuthenticatedPrincipal withoutName =
                new CustomSaml2AuthenticatedPrincipal(
                        null,
                        sampleAttributes(),
                        "name-id-123",
                        new ArrayList<>(List.of("idx-1", "idx-2")));

        assertThat(withName).isNotEqualTo(withoutName);
    }

    @Test
    void equals_twoAllNullRecords_areEqual() {
        CustomSaml2AuthenticatedPrincipal a =
                new CustomSaml2AuthenticatedPrincipal(null, null, null, null);
        CustomSaml2AuthenticatedPrincipal b =
                new CustomSaml2AuthenticatedPrincipal(null, null, null, null);

        assertThat(a).isEqualTo(b);
        assertThat(a).hasSameHashCodeAs(b);
    }

    @Test
    void equals_returnsFalseForNullAndOtherType() {
        CustomSaml2AuthenticatedPrincipal a = sample();

        assertThat(a).isNotEqualTo(null);
        assertThat(a).isNotEqualTo("alice");
    }

    @Test
    void toString_containsComponentValues() {
        String text = sample().toString();

        assertThat(text)
                .contains("CustomSaml2AuthenticatedPrincipal")
                .contains("name=alice")
                .contains("nameId=name-id-123");
    }

    // -------------------------------------------------------------------------
    // JDK serialization (record implements java.io.Serializable)
    // -------------------------------------------------------------------------

    @Test
    void isSerializable_roundTripPreservesValueEquality() throws Exception {
        CustomSaml2AuthenticatedPrincipal original = sample();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ObjectOutputStream oos = new ObjectOutputStream(baos)) {
            oos.writeObject(original);
        }

        Object restored;
        try (ObjectInputStream ois =
                new ObjectInputStream(new ByteArrayInputStream(baos.toByteArray()))) {
            restored = ois.readObject();
        }

        assertThat(restored).isInstanceOf(CustomSaml2AuthenticatedPrincipal.class);
        assertThat(restored).isEqualTo(original);
        CustomSaml2AuthenticatedPrincipal copy = (CustomSaml2AuthenticatedPrincipal) restored;
        assertThat(copy.getName()).isEqualTo("alice");
        assertThat(copy.getAttributes()).isEqualTo(original.getAttributes());
        assertThat(copy.sessionIndexes()).containsExactly("idx-1", "idx-2");
    }

    @Test
    void serialization_withEmptyImmutableCollections_roundTrips() throws Exception {
        // List.of()/Map.of() are also Serializable; verify the empty-collection case round-trips.
        CustomSaml2AuthenticatedPrincipal original =
                new CustomSaml2AuthenticatedPrincipal(
                        "u", Collections.emptyMap(), "u", Collections.emptyList());

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ObjectOutputStream oos = new ObjectOutputStream(baos)) {
            oos.writeObject(original);
        }
        try (ObjectInputStream ois =
                new ObjectInputStream(new ByteArrayInputStream(baos.toByteArray()))) {
            assertThat(ois.readObject()).isEqualTo(original);
        }
    }
}
