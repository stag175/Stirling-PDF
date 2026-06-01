package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

/**
 * Unit tests for {@link KeyPairCleanupService#cleanup()}.
 *
 * <p>Both collaborators are mocked with Mockito: the concrete {@link KeyPersistenceService} (only
 * its public, non-final methods are stubbed) and the {@link ApplicationProperties} chain that the
 * constructor unwraps into the {@code Jwt} config. The constructor calls
 * {@code applicationProperties.getSecurity().getJwt()}, so the service is built manually rather than
 * via {@code @InjectMocks}.
 *
 * <p>No Spring context, database, or network is used. The private-key filesystem path inside
 * {@code removePrivateKey} is exercised only where unavoidable by combining a {@code @TempDir} with
 * a {@code mockStatic(InstallationPathConfig)} stub (mirroring {@code
 * KeyPersistenceServiceInterfaceTest}); the temp directory is deliberately left empty so {@code
 * Files.exists} returns false and no real deletion occurs.
 */
@ExtendWith(MockitoExtension.class)
class KeyPairCleanupServiceTest {

    @Mock private KeyPersistenceService keyPersistenceService;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Security security;
    @Mock private ApplicationProperties.Security.Jwt jwtProperties;

    @TempDir Path tempDir;

    private KeyPairCleanupService service;

    @BeforeEach
    void setUp() {
        // The constructor immediately resolves applicationProperties.getSecurity().getJwt().
        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(security.getJwt()).thenReturn(jwtProperties);
        service = new KeyPairCleanupService(keyPersistenceService, applicationProperties);
    }

    private JwtVerificationKey key(String keyId) {
        // Constructor sets createdAt = now(); verifyingKey value is irrelevant for cleanup logic.
        return new JwtVerificationKey(keyId, "irrelevant-public-key");
    }

    @Test
    @DisplayName("Cleanup disabled: returns immediately, never touches the keystore")
    void cleanup_keyCleanupDisabled_doesNothing() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(false);

        service.cleanup();

        // Short-circuit on the first half of the OR means isKeystoreEnabled may be evaluated, but
        // no retention/eligibility/removal work happens.
        verify(keyPersistenceService, never()).getKeysEligibleForCleanup(any());
        verify(keyPersistenceService, never()).removeKey(anyString());
        verify(keyPersistenceService, never()).refreshActiveKeyPair();
    }

    @Test
    @DisplayName("Keystore disabled: returns immediately, never reads retention days")
    void cleanup_keystoreDisabled_doesNothing() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(false);

        service.cleanup();

        verify(jwtProperties, never()).getKeyRetentionDays();
        verify(keyPersistenceService, never()).getKeysEligibleForCleanup(any());
        verify(keyPersistenceService, never()).removeKey(anyString());
        verify(keyPersistenceService, never()).refreshActiveKeyPair();
    }

    @Test
    @DisplayName("Empty eligible list: queries once, removes nothing, no refresh")
    void cleanup_noEligibleKeys_queriesThenStops() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(30);
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(Collections.emptyList());

        service.cleanup();

        verify(keyPersistenceService, times(1)).getKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(keyPersistenceService, never()).removeKey(anyString());
        verify(keyPersistenceService, never()).refreshActiveKeyPair();
    }

    @Test
    @DisplayName("Eligible keys present: removes each key then refreshes the active key pair")
    void cleanup_withEligibleKeys_removesAllAndRefreshes() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(30);

        List<JwtVerificationKey> eligible = List.of(key("jwt-key-a"), key("jwt-key-b"));
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(eligible);

        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            // removePrivateKey resolves keyId + ".key" under this directory; leaving it empty means
            // Files.exists(...) is false and nothing is deleted.
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());

            service.cleanup();
        }

        verify(keyPersistenceService, times(1)).removeKey("jwt-key-a");
        verify(keyPersistenceService, times(1)).removeKey("jwt-key-b");
        verify(keyPersistenceService, times(1)).refreshActiveKeyPair();
    }

    @Test
    @DisplayName("Cutoff date passed to the query is now() minus the configured retention days")
    void cleanup_cutoffDate_reflectsRetentionDays() {
        int retentionDays = 45;
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(retentionDays);
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(Collections.emptyList());

        LocalDateTime before = LocalDateTime.now().minusDays(retentionDays);
        service.cleanup();
        LocalDateTime after = LocalDateTime.now().minusDays(retentionDays);

        ArgumentCaptor<LocalDateTime> cutoffCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(keyPersistenceService).getKeysEligibleForCleanup(cutoffCaptor.capture());

        LocalDateTime cutoff = cutoffCaptor.getValue();
        assertTrue(
                !cutoff.isBefore(before) && !cutoff.isAfter(after),
                "Cutoff should be approximately now() minus the retention period");
    }

    @Test
    @DisplayName(
            "IOException from Files.delete is caught per-key; processing continues and refreshes")
    void cleanup_privateKeyDeleteThrowsIOException_isSwallowedAndContinues() throws IOException {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(30);

        List<JwtVerificationKey> eligible = List.of(key("bad-key"), key("good-key"));
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(eligible);

        // The only checked IOException the catch in removeKeys can observe originates in
        // removePrivateKey's Files.delete(...). Stub the static Files calls so the delete throws.
        try (MockedStatic<InstallationPathConfig> pathStatic =
                        mockStatic(InstallationPathConfig.class);
                MockedStatic<Files> filesStatic = mockStatic(Files.class)) {
            pathStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());
            filesStatic.when(() -> Files.exists(any(Path.class))).thenReturn(true);
            filesStatic
                    .when(() -> Files.delete(any(Path.class)))
                    .thenThrow(new IOException("boom"));

            service.cleanup();
        }

        // Both keys are attempted; the exception on the first does not abort the forEach.
        verify(keyPersistenceService, times(1)).removeKey("bad-key");
        verify(keyPersistenceService, times(1)).removeKey("good-key");
        // refreshActiveKeyPair still runs because the exception is handled inside removeKeys.
        verify(keyPersistenceService, times(1)).refreshActiveKeyPair();
    }

    @Test
    @DisplayName(
            "removePrivateKey deletes an existing on-disk key file when keystore stays enabled")
    void cleanup_removePrivateKey_deletesExistingFile() throws IOException {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(30);

        String keyId = "jwt-key-on-disk";
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(List.of(key(keyId)));

        // Create the matching private-key file so Files.exists(...) is true and Files.delete runs.
        Path keyFile = tempDir.resolve(keyId + KeyPersistenceService.KEY_SUFFIX);
        Files.writeString(keyFile, "dummy-private-key");
        assertTrue(Files.exists(keyFile), "precondition: key file should exist");

        try (MockedStatic<InstallationPathConfig> mockedStatic =
                mockStatic(InstallationPathConfig.class)) {
            mockedStatic
                    .when(InstallationPathConfig::getPrivateKeyPath)
                    .thenReturn(tempDir.toString());

            service.cleanup();
        }

        // The private key file should have been physically deleted by removePrivateKey.
        org.junit.jupiter.api.Assertions.assertFalse(
                Files.exists(keyFile), "private key file should be deleted after cleanup");
        verify(keyPersistenceService, times(1)).removeKey(keyId);
        verify(keyPersistenceService, times(1)).refreshActiveKeyPair();
    }

    @Test
    @DisplayName(
            "removePrivateKey short-circuits when keystore reports disabled mid-removal"
                    + " (no filesystem access)")
    void cleanup_removePrivateKey_keystoreDisabledMidway_skipsFilesystem() {
        when(jwtProperties.isEnableKeyCleanup()).thenReturn(true);
        // First call (the cleanup gate) returns true; the second call inside removePrivateKey
        // returns false so the filesystem branch is skipped entirely.
        when(keyPersistenceService.isKeystoreEnabled()).thenReturn(true).thenReturn(false);
        when(jwtProperties.getKeyRetentionDays()).thenReturn(30);
        when(keyPersistenceService.getKeysEligibleForCleanup(any(LocalDateTime.class)))
                .thenReturn(List.of(key("jwt-key-x")));

        // No mockStatic here: if removePrivateKey reached InstallationPathConfig it would call the
        // real (filesystem) implementation. The early return guarantees it does not.
        service.cleanup();

        verify(keyPersistenceService, atLeastOnce()).isKeystoreEnabled();
        verify(keyPersistenceService, times(1)).getKeysEligibleForCleanup(any(LocalDateTime.class));
        verify(keyPersistenceService, times(1)).removeKey("jwt-key-x");
        verify(keyPersistenceService, times(1)).refreshActiveKeyPair();
        verifyNoMoreInteractions(keyPersistenceService);
    }
}
