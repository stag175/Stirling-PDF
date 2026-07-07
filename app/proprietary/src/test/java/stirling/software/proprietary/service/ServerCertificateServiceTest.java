package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.service.ServerCertificateServiceInterface.ServerCertificateInfo;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

/**
 * Unit tests for {@link ServerCertificateService}.
 *
 * <p>{@link LicenseKeyChecker} is mocked. The {@code @Value} fields are populated via {@link
 * ReflectionTestUtils}. The on-disk keystore location ({@link InstallationPathConfig#getConfigPath()})
 * is redirected to a JUnit {@code @TempDir} with {@code mockStatic} so the real filesystem is never
 * touched — mirroring the pattern used by {@code KeyPersistenceServiceInterfaceTest} in this module.
 */
@ExtendWith(MockitoExtension.class)
class ServerCertificateServiceTest {

    private static final String KEYSTORE_FILENAME = "server-certificate.p12";
    private static final String KEYSTORE_ALIAS = "stirling-pdf-server";
    private static final String DEFAULT_PASSWORD = "stirling-pdf-server-cert";

    @Mock private LicenseKeyChecker licenseKeyChecker;

    @TempDir Path tempDir;

    private ServerCertificateService service;

    @BeforeEach
    void setUp() {
        service = new ServerCertificateService(licenseKeyChecker);
        // Defaults mirror the @Value fallbacks declared on the production fields.
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "organizationName", "Stirling-PDF");
        ReflectionTestUtils.setField(service, "validityDays", 365);
        ReflectionTestUtils.setField(service, "regenerateOnStartup", false);
    }

    // -------------------------------------------------------------------------
    // isEnabled — requires both the flag AND a Pro/Enterprise license
    // -------------------------------------------------------------------------

    @Test
    void isEnabled_trueWhenFlagOnAndServerLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        assertTrue(service.isEnabled());
    }

    @Test
    void isEnabled_trueWhenFlagOnAndEnterpriseLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        assertTrue(service.isEnabled());
    }

    @Test
    void isEnabled_falseWhenFlagOnButNormalLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertFalse(service.isEnabled());
    }

    @Test
    void isEnabled_falseWhenFlagOff_shortCircuitsLicenseCheck() {
        ReflectionTestUtils.setField(service, "enabled", false);

        assertFalse(service.isEnabled());
        // Short-circuit: license must not be consulted when the feature flag is off.
        verifyNoInteractions(licenseKeyChecker);
    }

    // -------------------------------------------------------------------------
    // getServerCertificatePassword — constant getter
    // -------------------------------------------------------------------------

    @Test
    void getServerCertificatePassword_returnsConstant() {
        assertThat(service.getServerCertificatePassword()).isEqualTo(DEFAULT_PASSWORD);
        verifyNoInteractions(licenseKeyChecker);
    }

    // -------------------------------------------------------------------------
    // hasServerCertificate — pure Files.exists check on the keystore path
    // -------------------------------------------------------------------------

    @Test
    void hasServerCertificate_falseWhenFileMissing() {
        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            assertFalse(service.hasServerCertificate());
            verifyNoInteractions(licenseKeyChecker);
        }
    }

    @Test
    void hasServerCertificate_trueWhenFilePresent() throws Exception {
        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));

            assertTrue(service.hasServerCertificate());
        }
    }

    // -------------------------------------------------------------------------
    // getServerKeyStore — license gate first, then enabled+exists gate
    // -------------------------------------------------------------------------

    @Test
    void getServerKeyStore_throwsWhenNoLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertThatThrownBy(() -> service.getServerKeyStore())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("requires Pro or Enterprise license");
    }

    @Test
    void getServerKeyStore_throwsWhenDisabledEvenWithLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        ReflectionTestUtils.setField(service, "enabled", false);

        assertThatThrownBy(() -> service.getServerKeyStore())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Server certificate is not available");
    }

    @Test
    void getServerKeyStore_throwsWhenEnabledButCertMissing() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            assertThatThrownBy(() -> service.getServerKeyStore())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("Server certificate is not available");
        }
    }

    @Test
    void getServerKeyStore_loadsKeystoreWhenPresentAndLicensed() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));

            KeyStore ks = service.getServerKeyStore();

            assertNotNull(ks);
            assertTrue(ks.containsAlias(KEYSTORE_ALIAS));
        }
    }

    // -------------------------------------------------------------------------
    // getServerCertificate / getServerCertificatePublicKey — delegate to keystore
    // -------------------------------------------------------------------------

    @Test
    void getServerCertificate_returnsX509FromKeystore() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));

            X509Certificate cert = service.getServerCertificate();

            assertNotNull(cert);
            assertThat(cert.getSubjectX500Principal().getName()).contains("CN=test");
        }
    }

    @Test
    void getServerCertificatePublicKey_returnsEncodedCertBytes() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));

            byte[] encoded = service.getServerCertificatePublicKey();

            assertNotNull(encoded);
            assertThat(encoded.length).isGreaterThan(0);
        }
    }

    @Test
    void getServerCertificate_propagatesLicenseGate() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        assertThatThrownBy(() -> service.getServerCertificate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("requires Pro or Enterprise license");
    }

    // -------------------------------------------------------------------------
    // uploadServerCertificate — license gate, validation, persistence
    // -------------------------------------------------------------------------

    @Test
    void uploadServerCertificate_throwsWhenNoLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);
        InputStream stream = new ByteArrayInputStream(new byte[0]);

        assertThatThrownBy(() -> service.uploadServerCertificate(stream, "pw"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("requires Pro or Enterprise license");
    }

    @Test
    void uploadServerCertificate_persistsUnderStandardAliasAndPassword() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        String uploadPassword = "upload-pw";
        byte[] p12 = buildP12(uploadPassword);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            service.uploadServerCertificate(new ByteArrayInputStream(p12), uploadPassword);

            // Re-open the stored keystore with the SERVICE's standard password to prove the
            // upload was re-encrypted under DEFAULT_PASSWORD and aliased to KEYSTORE_ALIAS.
            Path stored = tempDir.resolve(KEYSTORE_FILENAME);
            assertTrue(Files.exists(stored));

            KeyStore reopened = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(stored)) {
                reopened.load(in, DEFAULT_PASSWORD.toCharArray());
            }
            assertTrue(reopened.containsAlias(KEYSTORE_ALIAS));
            assertTrue(reopened.isKeyEntry(KEYSTORE_ALIAS));
        }
    }

    @Test
    void uploadServerCertificate_throwsWhenNoPrivateKeyEntry() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);
        // Keystore that contains only a trusted-cert entry (no private key).
        byte[] certOnly = buildCertOnlyP12("cert-pw");

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            assertThatThrownBy(
                            () ->
                                    service.uploadServerCertificate(
                                            new ByteArrayInputStream(certOnly), "cert-pw"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("No private key found");

            // Nothing should have been written to disk on the failure path.
            assertFalse(Files.exists(tempDir.resolve(KEYSTORE_FILENAME)));
        }
    }

    // -------------------------------------------------------------------------
    // getServerCertificateInfo — empty info vs populated info
    // -------------------------------------------------------------------------

    @Test
    void getServerCertificateInfo_returnsEmptyWhenNoCert() throws Exception {
        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            ServerCertificateInfo info = service.getServerCertificateInfo();

            assertFalse(info.isExists());
            assertThat(info.getSubject()).isNull();
            assertThat(info.getIssuer()).isNull();
            assertThat(info.getValidFrom()).isNull();
            assertThat(info.getValidTo()).isNull();
            // The empty-info short-circuit never consults the license checker.
            verifyNoInteractions(licenseKeyChecker);
        }
    }

    @Test
    void getServerCertificateInfo_returnsPopulatedWhenCertPresent() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));

            ServerCertificateInfo info = service.getServerCertificateInfo();

            assertTrue(info.isExists());
            assertThat(info.getSubject()).contains("CN=test");
            assertThat(info.getIssuer()).contains("CN=test");
            assertNotNull(info.getValidFrom());
            assertNotNull(info.getValidTo());
        }
    }

    // -------------------------------------------------------------------------
    // deleteServerCertificate — no-op when absent, removes file when present
    // -------------------------------------------------------------------------

    @Test
    void deleteServerCertificate_noOpWhenAbsent() throws Exception {
        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            // Should not throw even though there is nothing to delete.
            service.deleteServerCertificate();

            assertFalse(Files.exists(tempDir.resolve(KEYSTORE_FILENAME)));
        }
    }

    @Test
    void deleteServerCertificate_removesExistingFile() throws Exception {
        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            writeKeystore(buildP12(DEFAULT_PASSWORD));
            assertTrue(Files.exists(tempDir.resolve(KEYSTORE_FILENAME)));

            service.deleteServerCertificate();

            assertFalse(Files.exists(tempDir.resolve(KEYSTORE_FILENAME)));
        }
    }

    // -------------------------------------------------------------------------
    // initializeServerCertificate — feature-flag and license gating
    // -------------------------------------------------------------------------

    @Test
    void initializeServerCertificate_skipsWhenDisabled() {
        ReflectionTestUtils.setField(service, "enabled", false);

        service.initializeServerCertificate();

        // Disabled feature returns before any license check or FS access.
        verifyNoInteractions(licenseKeyChecker);
    }

    @Test
    void initializeServerCertificate_skipsWhenNoLicense() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            service.initializeServerCertificate();

            // No license -> generation skipped, nothing written.
            assertFalse(Files.exists(tempDir.resolve(KEYSTORE_FILENAME)));
        }
    }

    @Test
    void initializeServerCertificate_generatesWhenLicensedAndMissing() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            service.initializeServerCertificate();

            Path stored = tempDir.resolve(KEYSTORE_FILENAME);
            assertTrue(Files.exists(stored));

            // Generated keystore must be openable with the standard password and aliased correctly.
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(stored)) {
                ks.load(in, DEFAULT_PASSWORD.toCharArray());
            }
            assertTrue(ks.containsAlias(KEYSTORE_ALIAS));

            X509Certificate cert = (X509Certificate) ks.getCertificate(KEYSTORE_ALIAS);
            assertThat(cert.getSubjectX500Principal().getName()).contains("Stirling-PDF");
        }
    }

    @Test
    void initializeServerCertificate_keepsExistingWhenPresentAndNoRegenerate() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            // Pre-seed an external keystore using a non-default password so we can detect
            // whether the service regenerated (regeneration would re-key it to DEFAULT_PASSWORD).
            writeKeystore(buildP12("sentinel-pw"));

            service.initializeServerCertificate();

            Path stored = tempDir.resolve(KEYSTORE_FILENAME);
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(stored)) {
                // Still openable with the original sentinel password => file untouched.
                ks.load(in, "sentinel-pw".toCharArray());
            }
            assertTrue(ks.aliases().hasMoreElements());
        }
    }

    @Test
    void initializeServerCertificate_regeneratesWhenRegenerateOnStartupTrue() throws Exception {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
        ReflectionTestUtils.setField(service, "regenerateOnStartup", true);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            // Pre-existing file with a sentinel password; regeneration must overwrite it.
            writeKeystore(buildP12("sentinel-pw"));

            service.initializeServerCertificate();

            Path stored = tempDir.resolve(KEYSTORE_FILENAME);
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (InputStream in = Files.newInputStream(stored)) {
                // The regenerated keystore uses DEFAULT_PASSWORD, not the sentinel.
                ks.load(in, DEFAULT_PASSWORD.toCharArray());
            }
            assertTrue(ks.containsAlias(KEYSTORE_ALIAS));
        }
    }

    @Test
    void initializeServerCertificate_swallowsGenerationException() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

        try (MockedStatic<InstallationPathConfig> mocked = mockConfigPath()) {
            // Point the config path at a location whose parent cannot be created because a
            // *file* already sits where the parent directory must be. generateServerCertificate
            // will fail on Files.createDirectories, and the failure must be logged + swallowed
            // (no exception propagated out of initializeServerCertificate).
            Path fileBlockingDir = tempDir.resolve("blocker");
            mocked.when(InstallationPathConfig::getConfigPath)
                    .thenReturn(fileBlockingDir.resolve("nested").toString());

            try {
                Files.createFile(fileBlockingDir);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }

            // Must not throw — initialize() catches and logs generation failures.
            service.initializeServerCertificate();

            verify(licenseKeyChecker, org.mockito.Mockito.atLeastOnce())
                .getPremiumLicenseEnabledResult();
        }
    }

    @Test
    void initializeServerCertificate_doesNotAccessFsWhenLicenseMissing() {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

        // No static mock here: with a NORMAL license, initialize() must return before
        // getKeystorePath()/InstallationPathConfig is ever touched.
        service.initializeServerCertificate();

        verify(licenseKeyChecker, org.mockito.Mockito.atLeastOnce())
                .getPremiumLicenseEnabledResult();
        verify(licenseKeyChecker, never()).requireProOrEnterprise(org.mockito.ArgumentMatchers.any());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Redirects {@code InstallationPathConfig.getConfigPath()} to the test temp dir. */
    private MockedStatic<InstallationPathConfig> mockConfigPath() {
        MockedStatic<InstallationPathConfig> mocked = mockStatic(InstallationPathConfig.class);
        mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
        return mocked;
    }

    private void writeKeystore(byte[] p12Bytes) throws Exception {
        Files.write(tempDir.resolve(KEYSTORE_FILENAME), p12Bytes);
    }

    /**
     * Builds a minimal PKCS12 keystore containing a self-signed RSA key + cert, using the same
     * BouncyCastle provider already on the classpath. Mirrors the helper in
     * {@code UserServerCertificateServiceTest}.
     */
    private static byte[] buildP12(String password) throws Exception {
        KeyPair kp = generateKeyPair();
        X509Certificate cert = selfSigned(kp);

        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        // Store under the SERVICE's standard alias so direct getCertificate(KEYSTORE_ALIAS)
        // lookups in the load tests resolve (the upload path re-keys regardless, so it is unaffected).
        ks.setKeyEntry(
                KEYSTORE_ALIAS, kp.getPrivate(), password.toCharArray(), new Certificate[] {cert});

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ks.store(baos, password.toCharArray());
        return baos.toByteArray();
    }

    /** Builds a PKCS12 keystore that holds only a trusted certificate (no private-key entry). */
    private static byte[] buildCertOnlyP12(String password) throws Exception {
        KeyPair kp = generateKeyPair();
        X509Certificate cert = selfSigned(kp);

        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        ks.setCertificateEntry("trusted", cert);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ks.store(baos, password.toCharArray());
        return baos.toByteArray();
    }

    private static KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA", "BC");
        kpg.initialize(2048, new SecureRandom());
        return kpg.generateKeyPair();
    }

    private static X509Certificate selfSigned(KeyPair kp) throws Exception {
        X500Name subject = new X500Name("CN=test");
        BigInteger serial = BigInteger.valueOf(System.currentTimeMillis());
        Date notBefore = new Date();
        Date notAfter = new Date(notBefore.getTime() + 365L * 24 * 60 * 60 * 1000);

        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        subject, serial, notBefore, notAfter, subject, kp.getPublic());

        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(kp.getPrivate());

        return new JcaX509CertificateConverter()
                .setProvider(new BouncyCastleProvider())
                .getCertificate(builder.build(signer));
    }
}
