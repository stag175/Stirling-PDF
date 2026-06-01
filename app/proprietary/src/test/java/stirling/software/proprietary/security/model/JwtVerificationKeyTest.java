package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link JwtVerificationKey}, a plain Lombok POJO.
 *
 * <p>IMPORTANT Lombok semantics verified here: the class is annotated with {@code
 * @EqualsAndHashCode(onlyExplicitlyIncluded = true)} and {@code @ToString(onlyExplicitlyIncluded =
 * true)} but only the {@code @ToString.Include} marker is present (on {@code keyId} and {@code
 * createdAt}). There is NO {@code @EqualsAndHashCode.Include} on any field. Therefore Lombok
 * generates equals/hashCode that include ZERO fields, which means ALL instances of this type are
 * considered equal to each other (and share one hashCode), while {@code toString} only renders
 * {@code keyId} and {@code createdAt} (never {@code verifyingKey}). These tests assert the actual
 * generated behavior, not the field-by-field intuition.
 */
class JwtVerificationKeyTest {

    @Nested
    @DisplayName("Two-arg constructor")
    class TwoArgConstructor {

        @Test
        @DisplayName("sets keyId and verifyingKey from arguments")
        void setsProvidedFields() {
            JwtVerificationKey key = new JwtVerificationKey("kid-1", "pem-data");

            assertAll(
                    () -> assertEquals("kid-1", key.getKeyId(), "keyId should match constructor arg"),
                    () ->
                            assertEquals(
                                    "pem-data",
                                    key.getVerifyingKey(),
                                    "verifyingKey should match constructor arg"));
        }

        @Test
        @DisplayName("sets createdAt to roughly now() within the construction window")
        void setsCreatedAtToNow() {
            LocalDateTime before = LocalDateTime.now();
            JwtVerificationKey key = new JwtVerificationKey("kid-1", "pem-data");
            LocalDateTime after = LocalDateTime.now();

            LocalDateTime createdAt = key.getCreatedAt();
            assertNotNull(createdAt, "createdAt should be populated by the constructor");
            // Purpose: createdAt must fall inside [before, after]; use !isBefore/!isAfter so the
            // boundaries are inclusive and the assertion is robust to clock granularity.
            assertAll(
                    () ->
                            assertFalse(
                                    createdAt.isBefore(before),
                                    "createdAt should not predate construction start"),
                    () ->
                            assertFalse(
                                    createdAt.isAfter(after),
                                    "createdAt should not postdate construction end"));
        }

        @Test
        @DisplayName("accepts null arguments without throwing")
        void acceptsNullArguments() {
            JwtVerificationKey key = new JwtVerificationKey(null, null);

            assertAll(
                    () -> assertNull(key.getKeyId(), "keyId should be the null that was passed in"),
                    () ->
                            assertNull(
                                    key.getVerifyingKey(),
                                    "verifyingKey should be the null that was passed in"),
                    () ->
                            assertNotNull(
                                    key.getCreatedAt(),
                                    "createdAt is still set to now() even with null args"));
        }
    }

    @Nested
    @DisplayName("No-arg constructor (Lombok @NoArgsConstructor)")
    class NoArgConstructor {

        @Test
        @DisplayName("leaves all fields null (no createdAt initialization)")
        void leavesFieldsNull() {
            JwtVerificationKey key = new JwtVerificationKey();

            assertAll(
                    () -> assertNull(key.getKeyId(), "keyId should default to null"),
                    () -> assertNull(key.getVerifyingKey(), "verifyingKey should default to null"),
                    () ->
                            assertNull(
                                    key.getCreatedAt(),
                                    "createdAt is NOT set by the no-arg constructor"));
        }
    }

    @Nested
    @DisplayName("Getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("round-trip every field through its setter")
        void setterGetterRoundTrip() {
            LocalDateTime ts = LocalDateTime.of(2024, 1, 2, 3, 4, 5);
            JwtVerificationKey key = new JwtVerificationKey();

            key.setKeyId("new-kid");
            key.setVerifyingKey("new-key");
            key.setCreatedAt(ts);

            assertAll(
                    () -> assertEquals("new-kid", key.getKeyId()),
                    () -> assertEquals("new-key", key.getVerifyingKey()),
                    () -> assertEquals(ts, key.getCreatedAt()));
        }

        @Test
        @DisplayName("setters accept null and overwrite previous values")
        void settersAcceptNull() {
            JwtVerificationKey key = new JwtVerificationKey("kid", "key");

            key.setKeyId(null);
            key.setVerifyingKey(null);
            key.setCreatedAt(null);

            assertAll(
                    () -> assertNull(key.getKeyId()),
                    () -> assertNull(key.getVerifyingKey()),
                    () -> assertNull(key.getCreatedAt()));
        }
    }

    @Nested
    @DisplayName("toString (onlyExplicitlyIncluded = true)")
    class ToStringTests {

        @Test
        @DisplayName("includes keyId and createdAt but NOT verifyingKey (secret excluded)")
        void includesOnlyMarkedFields() {
            LocalDateTime ts = LocalDateTime.of(2024, 6, 1, 12, 30, 0);
            JwtVerificationKey key = new JwtVerificationKey("kid-abc", "super-secret-key");
            key.setCreatedAt(ts);

            String str = key.toString();

            assertAll(
                    () ->
                            assertTrue(
                                    str.contains("JwtVerificationKey"),
                                    "toString should name the type"),
                    () -> assertTrue(str.contains("kid-abc"), "toString should include keyId"),
                    () ->
                            assertTrue(
                                    str.contains(ts.toString()),
                                    "toString should include createdAt"),
                    () ->
                            assertFalse(
                                    str.contains("super-secret-key"),
                                    "toString must NOT leak the verifyingKey secret"),
                    () ->
                            assertFalse(
                                    str.contains("verifyingKey"),
                                    "toString must not even name the verifyingKey field"));
        }

        @Test
        @DisplayName("renders null included fields without throwing")
        void handlesNullIncludedFields() {
            JwtVerificationKey key = new JwtVerificationKey();

            String str = assertDoesNotThrow(key::toString);
            assertTrue(str.contains("JwtVerificationKey"), "type name should still be present");
            assertTrue(str.contains("null"), "null included fields should render as 'null'");
        }
    }

    @Nested
    @DisplayName("equals / hashCode (onlyExplicitlyIncluded = true, no @Include fields)")
    class EqualsHashCode {

        @Test
        @DisplayName("two instances with different field values are STILL equal (zero included fields)")
        void differentFieldValuesAreEqual() {
            JwtVerificationKey a = new JwtVerificationKey("kid-1", "key-1");
            JwtVerificationKey b = new JwtVerificationKey("kid-2", "key-2");
            // Force clearly different createdAt to prove createdAt is not part of equals either.
            a.setCreatedAt(LocalDateTime.of(2000, 1, 1, 0, 0));
            b.setCreatedAt(LocalDateTime.of(2030, 12, 31, 23, 59));

            // Documented Lombok behavior: no @EqualsAndHashCode.Include fields -> equals ignores
            // every field, so any two instances of the type are equal.
            assertEquals(a, b, "instances should be equal because no fields are included in equals");
            assertEquals(b, a, "equals should be symmetric");
            assertEquals(a.hashCode(), b.hashCode(), "equal objects must share a hashCode");
        }

        @Test
        @DisplayName("a default no-arg instance equals a fully populated instance")
        void emptyEqualsPopulated() {
            JwtVerificationKey empty = new JwtVerificationKey();
            JwtVerificationKey populated = new JwtVerificationKey("kid", "key");

            assertEquals(empty, populated, "no included fields means even empty == populated");
            assertEquals(empty.hashCode(), populated.hashCode());
        }

        @Test
        @DisplayName("reflexive: an instance equals itself")
        void reflexive() {
            JwtVerificationKey key = new JwtVerificationKey("kid", "key");
            assertEquals(key, key, "equals should be reflexive");
            assertEquals(key.hashCode(), key.hashCode(), "hashCode should be stable");
        }

        @Test
        @DisplayName("not equal to null and not equal to a different type")
        void notEqualToNullOrOtherType() {
            JwtVerificationKey key = new JwtVerificationKey("kid", "key");

            assertNotEquals(null, key, "an instance is never equal to null");
            assertNotEquals(
                    "JwtVerificationKey",
                    key,
                    "an instance is never equal to an unrelated type (canEqual guards this)");
            assertNotEquals(key, new Object(), "an instance is never equal to a plain Object");
        }

        @Test
        @DisplayName("hashCode is constant across instances (zero included fields)")
        void hashCodeConstant() {
            int h1 = new JwtVerificationKey().hashCode();
            int h2 = new JwtVerificationKey("a", "b").hashCode();
            int h3 = new JwtVerificationKey(null, null).hashCode();

            assertAll(
                    () -> assertEquals(h1, h2, "all instances should hash the same"),
                    () -> assertEquals(h2, h3, "all instances should hash the same"));
        }
    }

    @Nested
    @DisplayName("Java serialization (implements Serializable)")
    class Serialization {

        @Test
        @DisplayName("round-trips through ObjectOutputStream/ObjectInputStream preserving fields")
        void serializableRoundTrip() throws Exception {
            JwtVerificationKey original = new JwtVerificationKey("kid-ser", "key-ser");
            LocalDateTime ts = LocalDateTime.of(2025, 5, 5, 5, 5, 5);
            original.setCreatedAt(ts);

            byte[] bytes;
            try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    ObjectOutputStream oos = new ObjectOutputStream(baos)) {
                oos.writeObject(original);
                oos.flush();
                bytes = baos.toByteArray();
            }

            JwtVerificationKey restored;
            try (ObjectInputStream ois =
                    new ObjectInputStream(new ByteArrayInputStream(bytes))) {
                restored = (JwtVerificationKey) ois.readObject();
            }

            assertAll(
                    () -> assertEquals("kid-ser", restored.getKeyId()),
                    () -> assertEquals("key-ser", restored.getVerifyingKey()),
                    () -> assertEquals(ts, restored.getCreatedAt()));
        }
    }
}
