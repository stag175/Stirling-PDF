package stirling.software.proprietary.cluster.s3;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins S3FileStore.normalizePrefix — the S3 key-prefix normaliser. Blank/null collapses to "";
 * otherwise the value is trimmed, a single leading slash is removed, and a trailing slash is
 * ensured (so keys join cleanly as {@code prefix + name}).
 */
class S3FileStoreNormalizePrefixTest {

    @Test
    @DisplayName("null/blank/'/'-only collapse to empty (no prefix)")
    void emptyCases() {
        assertEquals("", S3FileStore.normalizePrefix(null));
        assertEquals("", S3FileStore.normalizePrefix(""));
        assertEquals("", S3FileStore.normalizePrefix("   "));
        assertEquals("", S3FileStore.normalizePrefix("/"));
    }

    @Test
    @DisplayName("a plain prefix gains a trailing slash")
    void addsTrailingSlash() {
        assertEquals("docs/", S3FileStore.normalizePrefix("docs"));
        assertEquals("a/b/", S3FileStore.normalizePrefix("a/b"));
    }

    @Test
    @DisplayName("an existing trailing slash is preserved (not doubled)")
    void preservesTrailingSlash() {
        assertEquals("docs/", S3FileStore.normalizePrefix("docs/"));
    }

    @Test
    @DisplayName("a single leading slash is stripped")
    void stripsLeadingSlash() {
        assertEquals("docs/", S3FileStore.normalizePrefix("/docs"));
        assertEquals("docs/", S3FileStore.normalizePrefix("/docs/"));
    }

    @Test
    @DisplayName("surrounding whitespace is trimmed before normalising")
    void trimsWhitespace() {
        assertEquals("docs/", S3FileStore.normalizePrefix("  docs  "));
    }

    @Test
    @DisplayName("only ONE leading slash is removed")
    void stripsOnlyOneLeadingSlash() {
        assertEquals("/x/", S3FileStore.normalizePrefix("//x"));
    }
}
