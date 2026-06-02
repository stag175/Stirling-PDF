package stirling.software.proprietary.storage.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins ClusterStorageGate.normalize — the storage-provider/artifact-store value normaliser used by
 * the cluster compatibility checks. Only a NULL value defaults to "local"; everything else is
 * trimmed and lower-cased (so an empty string stays "", it does NOT become "local").
 */
class ClusterStorageGateNormalizeTest {

    @Test
    @DisplayName("null defaults to 'local'")
    void nullDefaultsToLocal() {
        assertEquals("local", ClusterStorageGate.normalize(null));
    }

    @Test
    @DisplayName("values are lower-cased")
    void lowercases() {
        assertEquals("s3", ClusterStorageGate.normalize("S3"));
        assertEquals("database", ClusterStorageGate.normalize("DATABASE"));
        assertEquals("mixedcase", ClusterStorageGate.normalize("MixedCase"));
    }

    @Test
    @DisplayName("surrounding whitespace is trimmed (and combined with lower-casing)")
    void trims() {
        assertEquals("local", ClusterStorageGate.normalize("  Local  "));
        assertEquals("s3", ClusterStorageGate.normalize("  s3"));
    }

    @Test
    @DisplayName("an empty (non-null) string stays empty, NOT 'local'")
    void emptyStaysEmpty() {
        assertEquals("", ClusterStorageGate.normalize(""));
        assertEquals("", ClusterStorageGate.normalize("   "));
    }
}
