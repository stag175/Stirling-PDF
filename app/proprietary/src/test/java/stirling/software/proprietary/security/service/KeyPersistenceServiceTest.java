package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.spec.InvalidKeySpecException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/**
 * Coverage-focused unit tests for {@link KeyPersistenceService}.
 *
 * <p>Complements {@code KeyPersistenceServiceInterfaceTest} by exercising the RSA encode/decode
 * round-trips, key-id generation, cache-backed active-key logic, cleanup eligibility (Caffeine
 * native cache), key removal/refresh, the disabled-keystore branch, and the legacy public-key
 * migration path. Uses a real {@link CaffeineCacheManager} so {@code getKeysEligibleForCleanup}
 * (which casts to {@code CaffeineCache}) is exercised, and a {@code @TempDir} only for the
 * keystore-enabled paths that read/write key files. No Spring context, DB, or network is used.
 */
@ExtendWith(MockitoExtension.class)
class KeyPersistenceServiceTest {

    @Mock private ApplicationProperties applicationProperties;

    @Mock private ApplicationProperties.Security security;

    @Mock private ApplicationProperties.Security.Jwt jwtConfig;

    @TempDir Path tempDir;

    private CacheManager cacheManager;
    private KeyPair testKeyPair;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        // CaffeineCacheManager (dynamic) lazily creates a CaffeineCache for "verifyingKeys",
        // matching production so getKeysEligibleForCleanup's cast succeeds.
        cacheManager = new CaffeineCacheManager("verifyingKeys");

        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtConfig);
        lenient().when(jwtConfig.isEnableKeystore()).thenReturn(true);
    }

    private KeyPersistenceService newService() {
        return new KeyPersistenceService(applicationProperties, cacheManager);
    }

    private Cache verifyingKeysCache() {
        return cacheManager.getCache("verifyingKeys");
    }

    // ---------------------------------------------------------------------
    // Constructor / isKeystoreEnabled
    // ---------------------------------------------------------------------

    @Test
    void constructorResolvesVerifyingKeysCache() {
        KeyPersistenceService service = newService();
        assertNotNull(service);
        assertTrue(service.isKeystoreEnabled());
    }

    @Test
    void isKeystoreEnabledReflectsJwtPropertyFalse() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        assertFalse(newService().isKeystoreEnabled());
    }

    // ---------------------------------------------------------------------
    // decodePublicKey + encode round-trip
    // ---------------------------------------------------------------------

    @Test
    void decodePublicKeyRoundTripsX509EncodedKey() throws Exception {
        KeyPersistenceService service = newService();
        String encoded = Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());

        PublicKey decoded = service.decodePublicKey(encoded);

        assertNotNull(decoded);
        assertEquals("RSA", decoded.getAlgorithm());
        // X509 encoding is canonical, so the re-encoded bytes must equal the originals.
        assertArrayEquals(testKeyPair.getPublic().getEncoded(), decoded.getEncoded());
    }

    @Test
    void decodePublicKeyWithInvalidBase64Throws() {
        KeyPersistenceService service = newService();
        // Not valid base64 -> Base64 decoder throws IllegalArgumentException.
        assertThrows(
                IllegalArgumentException.class, () -> service.decodePublicKey("not valid base64 !!!"));
    }

    @Test
    void decodePublicKeyWithValidBase64ButNonKeyBytesThrowsInvalidKeySpec() {
        KeyPersistenceService service = newService();
        // Well-formed base64 but the bytes are not a valid X509 SubjectPublicKeyInfo.
        String garbage = Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4, 5});
        assertThrows(InvalidKeySpecException.class, () -> service.decodePublicKey(garbage));
    }

    // ---------------------------------------------------------------------
    // getActiveKey (in-memory generation when no active key)
    // ---------------------------------------------------------------------

    @Test
    void getActiveKeyGeneratesKeyWhenNoneActive() throws Exception {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            JwtVerificationKey key = service.getActiveKey();

            assertNotNull(key);
            assertNotNull(key.getKeyId());
            assertTrue(key.getKeyId().startsWith("jwt-key-"));
            assertNotNull(key.getVerifyingKey());
            // The generated verifying key must be a decodable RSA public key.
            PublicKey decoded = service.decodePublicKey(key.getVerifyingKey());
            assertEquals("RSA", decoded.getAlgorithm());
            // Cached under its keyId.
            assertNotNull(verifyingKeysCache().get(key.getKeyId(), JwtVerificationKey.class));
        }
    }

    @Test
    void getActiveKeyReturnsSameInstanceOnSecondCall() {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            JwtVerificationKey first = service.getActiveKey();
            JwtVerificationKey second = service.getActiveKey();

            // Second call returns the cached active key, not a freshly generated one.
            assertEquals(first.getKeyId(), second.getKeyId());
            assertEquals(first.getVerifyingKey(), second.getVerifyingKey());
        }
    }

    // ---------------------------------------------------------------------
    // refreshActiveKeyPair
    // ---------------------------------------------------------------------

    @Test
    void refreshActiveKeyPairGeneratesNewActiveKey() {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            JwtVerificationKey original = service.getActiveKey();
            JwtVerificationKey refreshed = service.refreshActiveKeyPair();

            assertNotNull(refreshed);
            assertNotNull(refreshed.getKeyId());
            assertNotNull(refreshed.getVerifyingKey());
            // The refreshed key becomes the new active key.
            assertEquals(refreshed.getKeyId(), service.getActiveKey().getKeyId());
            // Both keys remain in the cache (historical retention).
            assertNotNull(verifyingKeysCache().get(original.getKeyId(), JwtVerificationKey.class));
            assertNotNull(verifyingKeysCache().get(refreshed.getKeyId(), JwtVerificationKey.class));
        }
    }

    // ---------------------------------------------------------------------
    // getKeyPair
    // ---------------------------------------------------------------------

    @Test
    void getKeyPairReturnsEmptyWhenKeystoreDisabled() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);
        KeyPersistenceService service = newService();

        Optional<KeyPair> result = service.getKeyPair("anything");

        assertTrue(result.isEmpty());
    }

    @Test
    void getKeyPairReturnsEmptyWhenKeyNotInCache() {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            Optional<KeyPair> result = service.getKeyPair("missing-key");

            assertTrue(result.isEmpty());
        }
    }

    @Test
    void getKeyPairLoadsPrivateKeyAndDecodesPublicKey() throws Exception {
        String keyId = "jwt-key-2024-01-01-000000";
        String publicKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        String privateKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        Files.writeString(tempDir.resolve(keyId + KeyPersistenceService.KEY_SUFFIX), privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            verifyingKeysCache().put(keyId, new JwtVerificationKey(keyId, publicKeyBase64));

            Optional<KeyPair> result = service.getKeyPair(keyId);

            assertTrue(result.isPresent());
            assertArrayEquals(
                    testKeyPair.getPublic().getEncoded(), result.get().getPublic().getEncoded());
            assertArrayEquals(
                    testKeyPair.getPrivate().getEncoded(), result.get().getPrivate().getEncoded());
        }
    }

    @Test
    void getKeyPairReturnsEmptyWhenPrivateKeyFileMissing() {
        String keyId = "jwt-key-no-file";
        String publicKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            // Cache entry exists but no .key file on disk -> loadPrivateKey throws -> empty.
            verifyingKeysCache().put(keyId, new JwtVerificationKey(keyId, publicKeyBase64));

            Optional<KeyPair> result = service.getKeyPair(keyId);

            assertTrue(result.isEmpty());
        }
    }

    // ---------------------------------------------------------------------
    // removeKey
    // ---------------------------------------------------------------------

    @Test
    void removeKeyEvictsEntryFromCache() {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            String keyId = "jwt-key-to-remove";
            verifyingKeysCache()
                    .put(
                            keyId,
                            new JwtVerificationKey(
                                    keyId,
                                    Base64.getEncoder()
                                            .encodeToString(testKeyPair.getPublic().getEncoded())));
            assertNotNull(verifyingKeysCache().get(keyId, JwtVerificationKey.class));

            service.removeKey(keyId);

            assertNull(verifyingKeysCache().get(keyId, JwtVerificationKey.class));
        }
    }

    // ---------------------------------------------------------------------
    // getKeysEligibleForCleanup (Caffeine native cache)
    // ---------------------------------------------------------------------

    @Test
    void getKeysEligibleForCleanupReturnsOnlyKeysCreatedBeforeCutoff() {
        KeyPersistenceService service = newService();

        JwtVerificationKey oldKey =
                new JwtVerificationKey(
                        "jwt-key-old",
                        Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded()));
        oldKey.setCreatedAt(LocalDateTime.now().minusDays(30));

        JwtVerificationKey freshKey =
                new JwtVerificationKey(
                        "jwt-key-fresh",
                        Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded()));
        freshKey.setCreatedAt(LocalDateTime.now());

        verifyingKeysCache().put(oldKey.getKeyId(), oldKey);
        verifyingKeysCache().put(freshKey.getKeyId(), freshKey);

        List<JwtVerificationKey> eligible =
                service.getKeysEligibleForCleanup(LocalDateTime.now().minusDays(7));

        assertEquals(1, eligible.size());
        assertEquals("jwt-key-old", eligible.get(0).getKeyId());
    }

    @Test
    void getKeysEligibleForCleanupReturnsEmptyWhenCacheEmpty() {
        KeyPersistenceService service = newService();

        List<JwtVerificationKey> eligible =
                service.getKeysEligibleForCleanup(LocalDateTime.now());

        assertTrue(eligible.isEmpty());
    }

    @Test
    void getKeysEligibleForCleanupIgnoresNonJwtVerificationKeyValues() {
        KeyPersistenceService service = newService();

        // A non-JwtVerificationKey value in the cache must be filtered out, not cause a ClassCast.
        verifyingKeysCache().put("not-a-key", "some-string-value");

        JwtVerificationKey oldKey =
                new JwtVerificationKey(
                        "jwt-key-old",
                        Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded()));
        oldKey.setCreatedAt(LocalDateTime.now().minusYears(1));
        verifyingKeysCache().put(oldKey.getKeyId(), oldKey);

        List<JwtVerificationKey> eligible =
                service.getKeysEligibleForCleanup(LocalDateTime.now());

        assertEquals(1, eligible.size());
        assertEquals("jwt-key-old", eligible.get(0).getKeyId());
    }

    // ---------------------------------------------------------------------
    // initializeKeystore
    // ---------------------------------------------------------------------

    @Test
    void initializeKeystoreDisabledDoesNotTouchDiskOrGenerate() {
        when(jwtConfig.isEnableKeystore()).thenReturn(false);

        // No MockedStatic needed: disabled path returns before reading InstallationPathConfig.
        KeyPersistenceService service = newService();
        service.initializeKeystore();

        // No active key should have been generated yet (activeKey stays null until requested).
        // getActiveKey would generate one, so we assert the cache is still empty pre-request.
        // (CaffeineCache native size check.)
        assertEquals(
                0,
                ((org.springframework.cache.caffeine.CaffeineCache) verifyingKeysCache())
                        .getNativeCache()
                        .estimatedSize());
    }

    @Test
    void initializeKeystoreCreatesDirectoryAndGeneratesKeyWhenEmpty() throws Exception {
        Path keyDir = tempDir.resolve("keys");

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(keyDir.toString());

            KeyPersistenceService service = newService();
            service.initializeKeystore();

            assertTrue(Files.isDirectory(keyDir));
            JwtVerificationKey active = service.getActiveKey();
            assertNotNull(active);
            assertTrue(active.getKeyId().startsWith("jwt-key-"));
        }
    }

    @Test
    void initializeKeystoreLoadsExistingKeyAndSetsActive() throws Exception {
        String keyId = "jwt-key-2023-12-31-235959";
        String publicKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        String privateKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        Files.writeString(tempDir.resolve(keyId + KeyPersistenceService.KEY_SUFFIX), privateKeyBase64);
        Files.writeString(
                tempDir.resolve(keyId + KeyPersistenceService.PUB_KEY_SUFFIX), publicKeyBase64);

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            service.initializeKeystore();

            JwtVerificationKey active = service.getActiveKey();
            assertEquals(keyId, active.getKeyId());
            assertEquals(publicKeyBase64, active.getVerifyingKey());
        }
    }

    @Test
    void initializeKeystoreMigratesLegacyKeyMissingPublicFile() throws Exception {
        String keyId = "jwt-key-legacy-000000";
        String privateKeyBase64 =
                Base64.getEncoder().encodeToString(testKeyPair.getPrivate().getEncoded());

        // Only the private .key file exists -> migration generates the .pub from it.
        Files.writeString(tempDir.resolve(keyId + KeyPersistenceService.KEY_SUFFIX), privateKeyBase64);

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            service.initializeKeystore();

            // Public key file should have been written during migration.
            Path pubFile = tempDir.resolve(keyId + KeyPersistenceService.PUB_KEY_SUFFIX);
            assertTrue(Files.exists(pubFile));

            JwtVerificationKey active = service.getActiveKey();
            assertEquals(keyId, active.getKeyId());
            // The migrated public key must equal the original key pair's public key (derived from
            // the RSA private CRT key).
            assertArrayEquals(
                    testKeyPair.getPublic().getEncoded(),
                    service.decodePublicKey(active.getVerifyingKey()).getEncoded());
        }
    }

    @Test
    void initializeKeystoreSkipsCorruptKeyAndGeneratesFresh() throws Exception {
        String corruptKeyId = "jwt-key-corrupt-000000";

        // A .key file whose contents are not a valid base64 PKCS8 key -> load fails, key skipped.
        Files.writeString(
                tempDir.resolve(corruptKeyId + KeyPersistenceService.KEY_SUFFIX),
                "this-is-not-a-valid-key");

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(tempDir.toString());

            KeyPersistenceService service = newService();
            service.initializeKeystore();

            // Loaded count was zero (corrupt skipped) -> a fresh keypair is generated.
            JwtVerificationKey active = service.getActiveKey();
            assertNotNull(active);
            assertTrue(active.getKeyId().startsWith("jwt-key-"));
            assertNotEquals(corruptKeyId, active.getKeyId());
        }
    }

    @Test
    void initializeKeystoreGeneratesWhenDirectoryDoesNotExist() {
        // Point at a non-existent path; ensurePrivateKeyDirectoryExists creates it but then
        // loadExistingKeysFromDisk also handles the no-directory branch by generating a keypair.
        Path missing = tempDir.resolve("does-not-exist-yet");

        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getPrivateKeyPath).thenReturn(missing.toString());

            KeyPersistenceService service = newService();
            service.initializeKeystore();

            JwtVerificationKey active = service.getActiveKey();
            assertNotNull(active);
            assertTrue(active.getKeyId().startsWith("jwt-key-"));
        }
    }
}
