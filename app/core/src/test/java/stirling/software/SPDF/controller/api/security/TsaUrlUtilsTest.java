package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link TsaUrlUtils} — the pure TSA-URL validation/normalization extracted from
 * {@link TimestampController}. These pin the security allow-list behaviour (a normalization
 * mismatch could admit a disallowed TSA endpoint or reject a valid one).
 */
class TsaUrlUtilsTest {

    // ---- isValidTsaUrlProtocol --------------------------------------------

    @Test
    void protocol_acceptsHttpAndHttpsCaseInsensitively() {
        assertTrue(TsaUrlUtils.isValidTsaUrlProtocol("http://tsa.example.com"));
        assertTrue(TsaUrlUtils.isValidTsaUrlProtocol("https://tsa.example.com"));
        assertTrue(TsaUrlUtils.isValidTsaUrlProtocol("HTTPS://TSA.EXAMPLE.COM"));
    }

    @Test
    void protocol_rejectsOtherSchemes() {
        assertFalse(TsaUrlUtils.isValidTsaUrlProtocol("ftp://tsa.example.com"));
        assertFalse(TsaUrlUtils.isValidTsaUrlProtocol("file:///etc/passwd"));
        assertFalse(TsaUrlUtils.isValidTsaUrlProtocol("javascript:alert(1)"));
        assertFalse(TsaUrlUtils.isValidTsaUrlProtocol("tsa.example.com"));
    }

    @Test
    void protocol_isNotTrimmed_leadingWhitespaceRejected() {
        // The original deliberately does not trim before the prefix check.
        assertFalse(TsaUrlUtils.isValidTsaUrlProtocol("   http://tsa.example.com"));
    }

    // ---- normalizeTsaUrl --------------------------------------------------

    @Test
    void normalize_lowercasesSchemeAndHost_preservesPathCase() {
        assertEquals(
                "https://tsa.example.com/TSR/Path",
                TsaUrlUtils.normalizeTsaUrl("HTTPS://TSA.Example.COM/TSR/Path"));
    }

    @Test
    void normalize_keepsExplicitPort_dropsDefaultMinusOne() {
        assertEquals(
                "https://tsa.example.com:8443/tsr",
                TsaUrlUtils.normalizeTsaUrl("https://tsa.example.com:8443/tsr"));
        assertEquals(
                "https://tsa.example.com", TsaUrlUtils.normalizeTsaUrl("https://tsa.example.com"));
    }

    @Test
    void normalize_trimsSurroundingWhitespace() {
        assertEquals(
                "http://tsa.example.com/x",
                TsaUrlUtils.normalizeTsaUrl("  http://tsa.example.com/x  "));
    }

    @Test
    void normalize_equivalentUrlsCanonicalizeEqually_forAllowListMatching() {
        // Differing only by case must normalize to the same string so allow-list contains()
        // matches.
        assertEquals(
                TsaUrlUtils.normalizeTsaUrl("http://Time.Example.com/tsa"),
                TsaUrlUtils.normalizeTsaUrl("HTTP://time.EXAMPLE.COM/tsa"));
    }

    @Test
    void normalize_malformedUrlFallsBackToLowerCase() {
        // A value with a space cannot be parsed by URI.create -> fallback to lower-cased input.
        assertEquals("bad url value", TsaUrlUtils.normalizeTsaUrl("BAD URL VALUE"));
    }
}
