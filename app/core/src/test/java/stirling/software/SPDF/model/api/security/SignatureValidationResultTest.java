package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SignatureValidationResultTest {

    @Test
    @DisplayName("Defaults: booleans false, ints 0, objects null on a fresh instance")
    void defaults_areZeroValues() {
        SignatureValidationResult result = new SignatureValidationResult();

        // booleans default to false
        assertFalse(result.isValid());
        assertFalse(result.isChainValid());
        assertFalse(result.isTrustValid());
        assertFalse(result.isNotExpired());
        assertFalse(result.isRevocationChecked());
        assertFalse(result.isSelfSigned());

        // ints default to 0
        assertEquals(0, result.getCertPathLength());
        assertEquals(0, result.getKeySize());

        // object/reference fields default to null
        assertNull(result.getChainValidationError());
        assertNull(result.getRevocationStatus());
        assertNull(result.getValidationTimeSource());
        assertNull(result.getSignerName());
        assertNull(result.getSignatureDate());
        assertNull(result.getReason());
        assertNull(result.getLocation());
        assertNull(result.getErrorMessage());
        assertNull(result.getIssuerDN());
        assertNull(result.getSubjectDN());
        assertNull(result.getSerialNumber());
        assertNull(result.getValidFrom());
        assertNull(result.getValidUntil());
        assertNull(result.getSignatureAlgorithm());
        assertNull(result.getVersion());
        assertNull(result.getKeyUsages());
    }

    @Test
    @DisplayName("Boolean setters/getters round-trip every flag independently")
    void booleanFields_setAndGet() {
        SignatureValidationResult result = new SignatureValidationResult();

        result.setValid(true);
        result.setChainValid(true);
        result.setTrustValid(true);
        result.setNotExpired(true);
        result.setRevocationChecked(true);
        result.setSelfSigned(true);

        assertTrue(result.isValid());
        assertTrue(result.isChainValid());
        assertTrue(result.isTrustValid());
        assertTrue(result.isNotExpired());
        assertTrue(result.isRevocationChecked());
        assertTrue(result.isSelfSigned());

        // flip back to false to confirm independent mutation
        result.setValid(false);
        result.setSelfSigned(false);

        assertFalse(result.isValid());
        assertFalse(result.isSelfSigned());
        // others remain true
        assertTrue(result.isChainValid());
        assertTrue(result.isTrustValid());
        assertTrue(result.isNotExpired());
        assertTrue(result.isRevocationChecked());
    }

    @Test
    @DisplayName("Int setters/getters round-trip including negative and boundary values")
    void intFields_setAndGet() {
        SignatureValidationResult result = new SignatureValidationResult();

        result.setCertPathLength(3);
        result.setKeySize(2048);

        assertEquals(3, result.getCertPathLength());
        assertEquals(2048, result.getKeySize());

        // boundary / edge values
        result.setCertPathLength(0);
        result.setKeySize(Integer.MAX_VALUE);
        assertEquals(0, result.getCertPathLength());
        assertEquals(Integer.MAX_VALUE, result.getKeySize());

        result.setCertPathLength(-1);
        result.setKeySize(Integer.MIN_VALUE);
        assertEquals(-1, result.getCertPathLength());
        assertEquals(Integer.MIN_VALUE, result.getKeySize());
    }

    @Test
    @DisplayName("String setters/getters round-trip typical, empty, and null values")
    void stringFields_setAndGet() {
        SignatureValidationResult result = new SignatureValidationResult();

        result.setChainValidationError("chain broken");
        result.setRevocationStatus("good");
        result.setValidationTimeSource("timestamp");
        result.setSignerName("Jane Doe");
        result.setSignatureDate("2026-06-01T12:00:00Z");
        result.setReason("Approval");
        result.setLocation("London, UK");
        result.setErrorMessage("");
        result.setIssuerDN("CN=Issuer, O=Org");
        result.setSubjectDN("CN=Subject, O=Org");
        result.setSerialNumber("0123456789ABCDEF");
        result.setValidFrom("2025-01-01");
        result.setValidUntil("2027-01-01");
        result.setSignatureAlgorithm("SHA256withRSA");
        result.setVersion("3");

        assertEquals("chain broken", result.getChainValidationError());
        assertEquals("good", result.getRevocationStatus());
        assertEquals("timestamp", result.getValidationTimeSource());
        assertEquals("Jane Doe", result.getSignerName());
        assertEquals("2026-06-01T12:00:00Z", result.getSignatureDate());
        assertEquals("Approval", result.getReason());
        assertEquals("London, UK", result.getLocation());
        assertEquals("", result.getErrorMessage());
        assertEquals("CN=Issuer, O=Org", result.getIssuerDN());
        assertEquals("CN=Subject, O=Org", result.getSubjectDN());
        assertEquals("0123456789ABCDEF", result.getSerialNumber());
        assertEquals("2025-01-01", result.getValidFrom());
        assertEquals("2027-01-01", result.getValidUntil());
        assertEquals("SHA256withRSA", result.getSignatureAlgorithm());
        assertEquals("3", result.getVersion());

        // explicitly setting null is allowed and observable
        result.setSignerName(null);
        assertNull(result.getSignerName());
    }

    @Test
    @DisplayName("keyUsages list setter/getter preserves identity and contents")
    void keyUsages_setAndGet() {
        SignatureValidationResult result = new SignatureValidationResult();

        List<String> usages = new ArrayList<>(List.of("digitalSignature", "nonRepudiation"));
        result.setKeyUsages(usages);

        assertSame(usages, result.getKeyUsages());
        assertEquals(List.of("digitalSignature", "nonRepudiation"), result.getKeyUsages());

        // empty list edge case
        result.setKeyUsages(Collections.emptyList());
        assertNotNull(result.getKeyUsages());
        assertTrue(result.getKeyUsages().isEmpty());

        // null edge case
        result.setKeyUsages(null);
        assertNull(result.getKeyUsages());
    }

    @Test
    @DisplayName("equals/hashCode: two identically populated instances are equal")
    void equalsAndHashCode_equalWhenAllFieldsMatch() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        // symmetric
        assertEquals(b, a);
    }

    @Test
    @DisplayName("equals: reflexive on self, not equal to null or to a different type")
    void equals_reflexiveAndTypeChecks() {
        SignatureValidationResult a = fullyPopulated();

        assertEquals(a, a);
        assertNotEquals(null, a);
        assertNotEquals("not-a-result", a);
    }

    @Test
    @DisplayName("equals: differs when a boolean field differs")
    void equals_differsOnBooleanField() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        b.setValid(!b.isValid());

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differs when an int field differs")
    void equals_differsOnIntField() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        b.setKeySize(b.getKeySize() + 1);

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differs when a String field differs")
    void equals_differsOnStringField() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        b.setSignerName("Someone Else");

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differs when the keyUsages list differs")
    void equals_differsOnKeyUsages() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        b.setKeyUsages(List.of("digitalSignature"));

        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("equals: differs when one keyUsages list is null")
    void equals_differsWhenKeyUsagesNull() {
        SignatureValidationResult a = fullyPopulated();
        SignatureValidationResult b = fullyPopulated();

        b.setKeyUsages(null);

        assertNotEquals(a, b);
        assertNotEquals(b, a);
    }

    @Test
    @DisplayName("hashCode is stable across repeated invocations on the same instance")
    void hashCode_stable() {
        SignatureValidationResult a = fullyPopulated();

        int first = a.hashCode();
        int second = a.hashCode();

        assertEquals(first, second);
    }

    @Test
    @DisplayName("toString includes field values and never throws")
    void toString_containsKeyData() {
        SignatureValidationResult result = new SignatureValidationResult();
        result.setSignerName("Jane Doe");
        result.setRevocationStatus("good");
        result.setKeySize(4096);

        String text = result.toString();

        assertNotNull(text);
        assertTrue(text.contains("SignatureValidationResult"));
        assertTrue(text.contains("Jane Doe"));
        assertTrue(text.contains("good"));
        assertTrue(text.contains("4096"));
    }

    /** Builds a deterministic, fully populated instance for equals/hashCode comparisons. */
    private static SignatureValidationResult fullyPopulated() {
        SignatureValidationResult result = new SignatureValidationResult();
        result.setValid(true);
        result.setChainValid(true);
        result.setTrustValid(false);
        result.setChainValidationError("none");
        result.setCertPathLength(2);
        result.setNotExpired(true);
        result.setRevocationChecked(true);
        result.setRevocationStatus("good");
        result.setValidationTimeSource("signing-time");
        result.setSignerName("Jane Doe");
        result.setSignatureDate("2026-06-01T12:00:00Z");
        result.setReason("Approval");
        result.setLocation("London, UK");
        result.setErrorMessage("");
        result.setIssuerDN("CN=Issuer, O=Org");
        result.setSubjectDN("CN=Subject, O=Org");
        result.setSerialNumber("0123456789ABCDEF");
        result.setValidFrom("2025-01-01");
        result.setValidUntil("2027-01-01");
        result.setSignatureAlgorithm("SHA256withRSA");
        result.setKeySize(2048);
        result.setVersion("3");
        result.setKeyUsages(new ArrayList<>(List.of("digitalSignature", "nonRepudiation")));
        result.setSelfSigned(false);
        return result;
    }
}
