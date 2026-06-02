package stirling.software.proprietary.security.configuration.ee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for {@link KeygenLicenseVerifier}.
 *
 * <p>Strategy: the class is {@code @RequiredArgsConstructor(ObjectMapper, ApplicationProperties)}
 * with no Spring wiring needed for the offline (certificate / JWT) verification paths. We exercise:
 *
 * <ul>
 *   <li>The {@code verifyLicense} public entry point: premium-disabled short-circuit and the
 *       cert/JWT prefix routing (signature always rejected because the production class pins a
 *       hard-coded Ed25519 public key we do not hold the private half of, so every crafted
 *       signature fails -> {@link License#NORMAL}).
 *   <li>The pure private helpers ({@code isCertificateLicense}, {@code isJWTLicense},
 *       {@code verifyCertificateLicense}, {@code verifyEd25519Signature},
 *       {@code processCertificateData}, {@code processJWTLicensePayload}, {@code verifyJWTLicense})
 *       via reflection, since the data-processing branches are only reachable after a valid
 *       signature in production. Reflection lets us cover those string/JSON branches directly.
 * </ul>
 *
 * <p>We use a real {@code tools.jackson.databind.ObjectMapper} (the same flavor the production class
 * uses) and a real {@link ApplicationProperties} POJO; only {@code readTree}/tree access is used so
 * Jackson's primitive/unknown-property binding flags are irrelevant here. No network, DB, Spring
 * context, or real files are involved (the standard-license path that uses the static HttpClient is
 * intentionally never reached).
 */
class KeygenLicenseVerifierTest {

    private static final String CERT_PREFIX = "-----BEGIN LICENSE FILE-----";
    private static final String CERT_SUFFIX = "-----END LICENSE FILE-----";

    private ObjectMapper objectMapper;
    private ApplicationProperties applicationProperties;
    private KeygenLicenseVerifier verifier;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        applicationProperties = new ApplicationProperties();
        verifier = new KeygenLicenseVerifier(objectMapper, applicationProperties);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static String base64(String raw) {
        return Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** Builds a certificate-file string: header + base64({"enc","sig","alg"}) + footer. */
    private static String buildCertFile(String enc, String sig, String alg) {
        String inner =
                String.format("{\"enc\":\"%s\",\"sig\":\"%s\",\"alg\":\"%s\"}", enc, sig, alg);
        String encoded = base64(inner);
        // Insert a newline to exercise the newline-stripping regex.
        return CERT_PREFIX + "\n" + encoded + "\n" + CERT_SUFFIX;
    }

    private LicenseContextHandle newContext() throws Exception {
        Class<?> ctxClass =
                Class.forName(
                        "stirling.software.proprietary.security.configuration.ee."
                                + "KeygenLicenseVerifier$LicenseContext");
        Constructor<?> ctor = ctxClass.getDeclaredConstructor();
        ctor.setAccessible(true);
        return new LicenseContextHandle(ctxClass, ctor.newInstance());
    }

    /** Wrapper exposing the private LicenseContext fields for assertions. */
    private static class LicenseContextHandle {
        final Class<?> clazz;
        final Object instance;

        LicenseContextHandle(Class<?> clazz, Object instance) {
            this.clazz = clazz;
            this.instance = instance;
        }

        boolean isEnterprise() throws Exception {
            return getBoolean("isEnterpriseLicense");
        }

        boolean isFloating() throws Exception {
            return getBoolean("isFloatingLicense");
        }

        int maxMachines() throws Exception {
            java.lang.reflect.Field f = clazz.getDeclaredField("maxMachines");
            f.setAccessible(true);
            return f.getInt(instance);
        }

        private boolean getBoolean(String name) throws Exception {
            java.lang.reflect.Field f = clazz.getDeclaredField(name);
            f.setAccessible(true);
            return f.getBoolean(instance);
        }
    }

    private boolean invokeBooleanPrivate(String method, Object... args) throws Exception {
        // Resolve parameter types from the verifier's declared methods by name.
        Method target = findMethod(method, args.length);
        target.setAccessible(true);
        return (boolean) target.invoke(verifier, args);
    }

    private Method findMethod(String name, int paramCount) {
        for (Method m : KeygenLicenseVerifier.class.getDeclaredMethods()) {
            if (m.getName().equals(name) && m.getParameterCount() == paramCount) {
                return m;
            }
        }
        throw new IllegalStateException("No method " + name + " with " + paramCount + " params");
    }

    // ------------------------------------------------------------------
    // verifyLicense: premium toggle + routing
    // ------------------------------------------------------------------

    @Test
    void verifyLicense_premiumDisabled_returnsNormalWithoutProcessing() {
        applicationProperties.getPremium().setEnabled(false);
        assertEquals(License.NORMAL, verifier.verifyLicense("anything-at-all"));
    }

    @Test
    void verifyLicense_certificateRoute_invalidSignature_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        // Valid envelope + correct algorithm, but the signature can never validate against the
        // pinned public key -> verification fails -> NORMAL.
        String cert =
                buildCertFile(base64("{\"data\":{}}"), base64("not-a-real-signature"),
                        "base64+ed25519");
        assertEquals(License.NORMAL, verifier.verifyLicense(cert));
    }

    @Test
    void verifyLicense_certificateRoute_unsupportedAlgorithm_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        String cert = buildCertFile(base64("{}"), base64("sig"), "rsa-sha256");
        assertEquals(License.NORMAL, verifier.verifyLicense(cert));
    }

    @Test
    void verifyLicense_jwtRoute_invalidSignature_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        String jwt = "key/" + base64("{\"id\":\"abc\"}") + "." + base64("bogus-signature");
        assertEquals(License.NORMAL, verifier.verifyLicense(jwt));
    }

    @Test
    void verifyLicense_jwtRoute_malformedNoDot_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        // No "." separator => parts.length != 2 => invalid format => NORMAL.
        String jwt = "key/" + base64("{\"id\":\"abc\"}");
        assertEquals(License.NORMAL, verifier.verifyLicense(jwt));
    }

    @Test
    void verifyLicense_certificateRoute_garbageBase64_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        // Header/footer present (routes to cert path), body is not valid base64.
        String cert = CERT_PREFIX + "\n%%%not-base64%%%\n" + CERT_SUFFIX;
        assertEquals(License.NORMAL, verifier.verifyLicense(cert));
    }

    @Test
    void verifyLicense_certificateRoute_decodesToNonJson_returnsNormal() {
        applicationProperties.getPremium().setEnabled(true);
        // Valid base64 but decodes to text that is not JSON -> readTree throws -> false -> NORMAL.
        String cert = CERT_PREFIX + "\n" + base64("this is not json") + "\n" + CERT_SUFFIX;
        assertEquals(License.NORMAL, verifier.verifyLicense(cert));
    }

    // ------------------------------------------------------------------
    // isCertificateLicense / isJWTLicense (prefix detection)
    // ------------------------------------------------------------------

    @Test
    void isCertificateLicense_detectsPrefixWithLeadingWhitespace() throws Exception {
        assertTrue(invokeBooleanPrivate("isCertificateLicense", "   " + CERT_PREFIX + "\nXYZ"));
        assertFalse(invokeBooleanPrivate("isCertificateLicense", "not a cert"));
    }

    @Test
    void isCertificateLicense_nullIsFalse() throws Exception {
        assertFalse(invokeBooleanPrivate("isCertificateLicense", new Object[] {null}));
    }

    @Test
    void isJWTLicense_detectsKeyPrefix() throws Exception {
        assertTrue(invokeBooleanPrivate("isJWTLicense", "  key/payload.sig"));
        assertFalse(invokeBooleanPrivate("isJWTLicense", "license/payload"));
    }

    @Test
    void isJWTLicense_nullIsFalse() throws Exception {
        assertFalse(invokeBooleanPrivate("isJWTLicense", new Object[] {null}));
    }

    // ------------------------------------------------------------------
    // verifyEd25519Signature: always rejects crafted signatures
    // ------------------------------------------------------------------

    @Test
    void verifyEd25519Signature_invalidSignatureRejected() throws Exception {
        boolean result =
                invokeBooleanPrivate(
                        "verifyEd25519Signature",
                        base64("some-data"),
                        base64("0123456789012345678901234567890123456789012345678901234567890123"));
        assertFalse(result);
    }

    @Test
    void verifyEd25519Signature_nonBase64SignatureRejected() throws Exception {
        // Base64 decode of the signature throws -> caught -> false.
        boolean result =
                invokeBooleanPrivate("verifyEd25519Signature", "data", "@@not-base64@@");
        assertFalse(result);
    }

    // ------------------------------------------------------------------
    // verifyCertificateLicense (private, full path up to signature rejection)
    // ------------------------------------------------------------------

    @Test
    void verifyCertificateLicense_unsupportedAlgorithm_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String cert = buildCertFile(base64("{}"), base64("sig"), "hmac");
        boolean result =
                (boolean)
                        findMethodAccessible("verifyCertificateLicense")
                                .invoke(verifier, cert, ctx.instance);
        assertFalse(result);
    }

    @Test
    void verifyCertificateLicense_validAlgorithmButBadSignature_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String cert =
                buildCertFile(base64("{\"data\":{}}"), base64("aaaa"), "base64+ed25519");
        boolean result =
                (boolean)
                        findMethodAccessible("verifyCertificateLicense")
                                .invoke(verifier, cert, ctx.instance);
        assertFalse(result);
    }

    @Test
    void verifyCertificateLicense_unparseablePayload_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        // Body decodes (valid base64) to non-JSON, so the inner readTree throws -> false.
        String cert = CERT_PREFIX + "\n" + base64("plain text not json") + "\n" + CERT_SUFFIX;
        boolean result =
                (boolean)
                        findMethodAccessible("verifyCertificateLicense")
                                .invoke(verifier, cert, ctx.instance);
        assertFalse(result);
    }

    private Method findMethodAccessible(String name) {
        Method m = findMethod(name, 2);
        m.setAccessible(true);
        return m;
    }

    // ------------------------------------------------------------------
    // processCertificateData (private) - reachable only via reflection
    // ------------------------------------------------------------------

    private boolean invokeProcessCertificateData(String certData, Object ctx) throws Exception {
        Method m = findMethod("processCertificateData", 2);
        m.setAccessible(true);
        return (boolean) m.invoke(verifier, certData, ctx);
    }

    @Test
    void processCertificateData_serverLicense_unlimitedUsers_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String json =
                "{\"data\":{\"attributes\":{\"floating\":true,\"maxMachines\":5,"
                        + "\"status\":\"ACTIVE\","
                        + "\"metadata\":{\"isEnterprise\":false,\"users\":0}}}}";
        assertTrue(invokeProcessCertificateData(json, ctx.instance));
        assertFalse(ctx.isEnterprise());
        assertTrue(ctx.isFloating());
        assertEquals(5, ctx.maxMachines());
        assertEquals(0, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processCertificateData_enterpriseLicense_setsMaxUsers_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String json =
                "{\"data\":{\"attributes\":{"
                        + "\"metadata\":{\"isEnterprise\":true,\"users\":25}}}}";
        assertTrue(invokeProcessCertificateData(json, ctx.instance));
        assertTrue(ctx.isEnterprise());
        assertEquals(25, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processCertificateData_enterpriseDefaultUsersWhenAbsent() throws Exception {
        LicenseContextHandle ctx = newContext();
        // isEnterprise=true but no users field -> defaults to 1.
        String json =
                "{\"data\":{\"attributes\":{\"metadata\":{\"isEnterprise\":true}}}}";
        assertTrue(invokeProcessCertificateData(json, ctx.instance));
        assertTrue(ctx.isEnterprise());
        assertEquals(1, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processCertificateData_validWithIssuedAndExpiryWindow_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String issued = Instant.now().minus(1, ChronoUnit.DAYS).toString();
        String expiry = Instant.now().plus(30, ChronoUnit.DAYS).toString();
        String json =
                "{\"meta\":{\"issued\":\"" + issued + "\",\"expiry\":\"" + expiry + "\"},"
                        + "\"data\":{\"attributes\":{\"metadata\":{\"isEnterprise\":false,"
                        + "\"users\":3}}}}";
        assertTrue(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_expiredLicense_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String issued = Instant.now().minus(10, ChronoUnit.DAYS).toString();
        String expiry = Instant.now().minus(1, ChronoUnit.DAYS).toString();
        String json =
                "{\"meta\":{\"issued\":\"" + issued + "\",\"expiry\":\"" + expiry + "\"},"
                        + "\"data\":{\"attributes\":{}}}";
        assertFalse(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_issuedInFuture_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String issued = Instant.now().plus(2, ChronoUnit.DAYS).toString();
        String expiry = Instant.now().plus(30, ChronoUnit.DAYS).toString();
        String json =
                "{\"meta\":{\"issued\":\"" + issued + "\",\"expiry\":\"" + expiry + "\"},"
                        + "\"data\":{\"attributes\":{}}}";
        assertFalse(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_missingDataObject_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String json = "{\"meta\":{}}";
        assertFalse(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_inactiveStatus_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String json =
                "{\"data\":{\"attributes\":{\"status\":\"SUSPENDED\","
                        + "\"metadata\":{\"isEnterprise\":false,\"users\":0}}}}";
        assertFalse(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_expiringStatusAccepted_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String json =
                "{\"data\":{\"attributes\":{\"status\":\"EXPIRING\","
                        + "\"metadata\":{\"isEnterprise\":true,\"users\":2}}}}";
        assertTrue(invokeProcessCertificateData(json, ctx.instance));
    }

    @Test
    void processCertificateData_invalidJson_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        assertFalse(invokeProcessCertificateData("not json at all", ctx.instance));
    }

    // ------------------------------------------------------------------
    // processJWTLicensePayload (private) - reachable only via reflection
    // ------------------------------------------------------------------

    private boolean invokeProcessJwt(String payload, Object ctx) throws Exception {
        Method m = findMethod("processJWTLicensePayload", 2);
        m.setAccessible(true);
        return (boolean) m.invoke(verifier, payload, ctx);
    }

    @Test
    void processJWTLicensePayload_withNestedLicenseAndPolicy_enterprise_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String payload =
                "{\"license\":{\"id\":\"lic-1\",\"expiry\":null},"
                        + "\"account\":{\"id\":\"e5430f69-e834-4ae4-befd-b602aae5f372\"},"
                        + "\"policy\":{\"id\":\"pol-1\",\"floating\":true,\"maxMachines\":4,"
                        + "\"isEnterprise\":true,\"users\":10}}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
        assertTrue(ctx.isEnterprise());
        assertTrue(ctx.isFloating());
        assertEquals(4, ctx.maxMachines());
        assertEquals(10, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processJWTLicensePayload_rootObjectAsLicense_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        // No nested "license" object, but a top-level "id" -> root is used as the license object.
        String payload = "{\"id\":\"root-lic\",\"floating\":false}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
    }

    @Test
    void processJWTLicensePayload_noLicenseNorId_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String payload = "{\"foo\":\"bar\"}";
        assertFalse(invokeProcessJwt(payload, ctx.instance));
    }

    @Test
    void processJWTLicensePayload_expiredLicense_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String expiry = Instant.now().minus(1, ChronoUnit.DAYS).toString();
        String payload = "{\"id\":\"lic\",\"expiry\":\"" + expiry + "\"}";
        assertFalse(invokeProcessJwt(payload, ctx.instance));
    }

    @Test
    void processJWTLicensePayload_validFutureExpiry_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String expiry = Instant.now().plus(10, ChronoUnit.DAYS).toString();
        String payload = "{\"id\":\"lic\",\"expiry\":\"" + expiry + "\"}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
    }

    @Test
    void processJWTLicensePayload_policyMetadataFallback_serverDefault() throws Exception {
        LicenseContextHandle ctx = newContext();
        // users absent at policy level (-1), falls back to metadata; isEnterprise false -> users 0.
        String payload =
                "{\"id\":\"lic\","
                        + "\"policy\":{\"id\":\"pol\",\"metadata\":{\"isEnterprise\":false}}}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
        assertFalse(ctx.isEnterprise());
        assertEquals(0, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processJWTLicensePayload_policyNoMetadata_defaultsByType() throws Exception {
        LicenseContextHandle ctx = newContext();
        // users absent (-1) and no metadata object -> defaults: isEnterprise true -> users 1.
        String payload =
                "{\"id\":\"lic\",\"policy\":{\"id\":\"pol\",\"isEnterprise\":true}}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
        assertTrue(ctx.isEnterprise());
        assertEquals(1, applicationProperties.getPremium().getMaxUsers());
    }

    @Test
    void processJWTLicensePayload_mismatchedAccountIdStillValid() throws Exception {
        LicenseContextHandle ctx = newContext();
        // Account id mismatch only warns; verification still succeeds.
        String payload =
                "{\"id\":\"lic\",\"account\":{\"id\":\"some-other-account\"}}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
    }

    @Test
    void processJWTLicensePayload_invalidJson_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        assertFalse(invokeProcessJwt("}{ broken", ctx.instance));
    }

    @Test
    void processJWTLicensePayload_floatingNoExpiry_true() throws Exception {
        LicenseContextHandle ctx = newContext();
        String payload =
                "{\"license\":{\"id\":\"lic\",\"floating\":true,\"maxMachines\":7}}";
        assertTrue(invokeProcessJwt(payload, ctx.instance));
        assertTrue(ctx.isFloating());
        assertEquals(7, ctx.maxMachines());
    }

    // ------------------------------------------------------------------
    // verifyJWTLicense (private) - format + signature rejection branches
    // ------------------------------------------------------------------

    private boolean invokeVerifyJwt(String key, Object ctx) throws Exception {
        Method m = findMethod("verifyJWTLicense", 2);
        m.setAccessible(true);
        return (boolean) m.invoke(verifier, key, ctx);
    }

    @Test
    void verifyJWTLicense_missingDotSeparator_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        assertFalse(invokeVerifyJwt("key/" + base64("{\"id\":\"x\"}"), ctx.instance));
    }

    @Test
    void verifyJWTLicense_badSignature_false() throws Exception {
        LicenseContextHandle ctx = newContext();
        String key = "key/" + base64("{\"id\":\"x\"}") + "." + base64("not-valid-sig");
        assertFalse(invokeVerifyJwt(key, ctx.instance));
    }

    @Test
    void licenseEnum_hasExpectedValues() {
        assertThat(License.values())
                .containsExactly(License.NORMAL, License.SERVER, License.ENTERPRISE);
        assertEquals(License.ENTERPRISE, License.valueOf("ENTERPRISE"));
    }
}
