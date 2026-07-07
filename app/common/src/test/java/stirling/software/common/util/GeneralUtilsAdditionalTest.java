package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GeneralUtilsAdditionalTest {

    @Test
    void testConvertSizeToBytes() {
        assertEquals(1024L, GeneralUtils.convertSizeToBytes("1KB"));
        assertEquals(1024L * 1024, GeneralUtils.convertSizeToBytes("1MB"));
        assertEquals(1024L * 1024 * 1024, GeneralUtils.convertSizeToBytes("1GB"));
        assertEquals(100L * 1024 * 1024, GeneralUtils.convertSizeToBytes("100"));
        assertNull(GeneralUtils.convertSizeToBytes("invalid"));
        assertNull(GeneralUtils.convertSizeToBytes(null));
    }

    @Test
    void testConvertSizeToBytesEdgeCases() {
        assertNull(GeneralUtils.convertSizeToBytes("-10MB"));
        assertNull(GeneralUtils.convertSizeToBytes("10000000TB")); // overflow beyond long
        assertEquals(1099511627776L, GeneralUtils.convertSizeToBytes("1TB"));
        assertEquals(2684354560L, GeneralUtils.convertSizeToBytes("2.5GB"));
    }

    @Test
    void testFormatBytes() {
        assertEquals("512 B", GeneralUtils.formatBytes(512));
        assertEquals("1.00 KB", GeneralUtils.formatBytes(1024));
        assertEquals("1.00 MB", GeneralUtils.formatBytes(1024L * 1024));
        assertEquals("1.00 GB", GeneralUtils.formatBytes(1024L * 1024 * 1024));
    }

    @Test
    void testURLHelpersAndUUID() {
        assertTrue(GeneralUtils.isValidURL("https://example.com"));
        assertFalse(GeneralUtils.isValidURL("htp:/bad"));
        assertFalse(GeneralUtils.isURLReachable("http://localhost"));
        assertFalse(GeneralUtils.isURLReachable("http://0.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://192.168.1.1"));
        assertFalse(GeneralUtils.isURLReachable("http://169.254.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://172.16.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://192.0.2.1"));
        assertFalse(GeneralUtils.isURLReachable("http://192.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://192.168.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://198.18.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://198.51.100.0"));
        assertFalse(GeneralUtils.isURLReachable("http://203.0.113.0"));
        assertFalse(GeneralUtils.isURLReachable("http://10.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://100.64.0.1"));
        assertFalse(GeneralUtils.isURLReachable("http://224.0.0.0"));
        assertFalse(GeneralUtils.isURLReachable("http://[::ffff:127.0.0.1]/"));
        assertFalse(GeneralUtils.isURLReachable("http://[fd12:3456:789a::1]/"));
        assertFalse(GeneralUtils.isURLReachable("ftp://example.com"));

        assertTrue(GeneralUtils.isValidUUID("123e4567-e89b-12d3-a456-426614174000"));
        assertFalse(GeneralUtils.isValidUUID("not-a-uuid"));

        assertFalse(GeneralUtils.isVersionHigher(null, "1.0"));
        assertTrue(GeneralUtils.isVersionHigher("2.0", "1.9"));
        assertFalse(GeneralUtils.isVersionHigher("1.0", "1.0.1"));
    }

    /**
     * SSRF regression guard (roadmap D4 — the "unit-testable validation portion").
     *
     * <p>{@link GeneralUtils#isURLReachable(String)} must refuse to even attempt a connection to
     * loopback, link-local, private, broadcast/reserved and cloud-metadata targets. Blocked
     * addresses short-circuit inside {@code isDisallowedNetworkLocation} <em>before</em> any socket
     * is opened, and literal IPs are not DNS-resolved, so every assertion below is deterministic
     * and network-free.
     *
     * <p>{@link #testURLHelpersAndUUID()} already covers one representative IP per range; this
     * method pins the canonical attack destinations that were missing — cloud IMDS, its IPv4-mapped
     * form, the IPv4 loopback literal, IPv6 loopback/link-local, and the limited-broadcast /
     * 240.0.0.0/4 reserved space — so a future refactor of the address classifier can't silently
     * reopen them.
     */
    @Test
    void isURLReachable_blocksCanonicalSsrfTargets() {
        // Cloud instance-metadata service (AWS/GCP/Azure IMDS) — the headline SSRF target.
        assertFalse(GeneralUtils.isURLReachable("http://169.254.169.254/latest/meta-data/"));
        // The IPv4-mapped IPv6 form of the same metadata IP must not bypass the IPv4 range checks.
        assertFalse(GeneralUtils.isURLReachable("http://[::ffff:169.254.169.254]/"));
        // IPv4 loopback as a literal (not just the "localhost" hostname) — whole 127.0.0.0/8.
        assertFalse(GeneralUtils.isURLReachable("http://127.0.0.1/"));
        assertFalse(GeneralUtils.isURLReachable("http://127.255.255.254/"));
        // IPv6 loopback and link-local.
        assertFalse(GeneralUtils.isURLReachable("http://[::1]/"));
        assertFalse(GeneralUtils.isURLReachable("http://[fe80::1]/"));
        // Limited broadcast and the 240.0.0.0/4 reserved block (the first >= 224 rule).
        assertFalse(GeneralUtils.isURLReachable("http://255.255.255.255/"));
        assertFalse(GeneralUtils.isURLReachable("http://240.0.0.1/"));
        // Non-HTTP schemes are rejected outright regardless of host.
        assertFalse(GeneralUtils.isURLReachable("file://attacker.example/etc/passwd"));
    }

    /**
     * Defence-in-depth at the URL <em>format</em> layer (independent of any network check): {@link
     * GeneralUtils#isValidURL(String)} accepts ordinary public http(s) URLs and returns {@code
     * false} — never throws — for malformed input, non-http schemes, and denied
     * common-infrastructure targets. The non-http and infrastructure cases are the regression guard
     * for the D4 fix that broadened the catch beyond {@code MalformedURLException} to include the
     * {@code SecurityException} that {@code Urls.create} throws for those inputs.
     */
    @Test
    void isValidURL_acceptsPublicHttpRejectsMalformedNonHttpAndInfraTargets() {
        assertTrue(GeneralUtils.isValidURL("https://example.com/path?q=1"));
        assertTrue(GeneralUtils.isValidURL("http://example.org"));
        // Non-http scheme (well-formed) → SecurityException internally → must be false, not thrown.
        assertFalse(GeneralUtils.isValidURL("ftp://example.com"));
        // Denied common-infrastructure target (cloud metadata) rejected at the format layer too.
        assertFalse(GeneralUtils.isValidURL("http://169.254.169.254/"));
        // Plain malformed input.
        assertFalse(GeneralUtils.isValidURL("not a url"));
        assertFalse(GeneralUtils.isValidURL(""));
    }
}
