package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class TauriSamlUtilsTest {

    // ---------------------------------------------------------------------
    // isTauriRelayState
    // ---------------------------------------------------------------------

    @Test
    void isTauriRelayState_exactTauriValue() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "tauri");

        assertTrue(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_prefixedValue() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "tauri:nonce-123");

        assertTrue(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_prefixOnly() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", TauriSamlUtils.TAURI_RELAY_STATE_PREFIX);

        // "tauri:" starts with the prefix even though there is no nonce.
        assertTrue(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_nonTauriValue() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "some-other-state");

        assertFalse(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_tauriAsSubstringNotPrefix() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "not-tauri:nonce");

        assertFalse(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_emptyValue() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "");

        assertFalse(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_missingParameterReturnsFalse() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        // No RelayState parameter set -> getParameter returns null.
        assertFalse(TauriSamlUtils.isTauriRelayState(request));
    }

    @Test
    void isTauriRelayState_isCaseSensitive() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "Tauri:nonce");

        assertFalse(TauriSamlUtils.isTauriRelayState(request));
    }

    // ---------------------------------------------------------------------
    // extractNonceFromRelayState
    // ---------------------------------------------------------------------

    @Test
    void extractNonceFromRelayState_validSingleNonce() {
        assertEquals("nonce-123", TauriSamlUtils.extractNonceFromRelayState("tauri:nonce-123"));
    }

    @Test
    void extractNonceFromRelayState_multipleColonsReturnsLastSegment() {
        assertEquals(
                "nonce-with-colon",
                TauriSamlUtils.extractNonceFromRelayState(
                        "tauri:original:complex:nonce-with-colon"));
    }

    @Test
    void extractNonceFromRelayState_null() {
        assertNull(TauriSamlUtils.extractNonceFromRelayState(null));
    }

    @Test
    void extractNonceFromRelayState_notTauriPrefix() {
        assertNull(TauriSamlUtils.extractNonceFromRelayState("regular-state:with-colons"));
    }

    @Test
    void extractNonceFromRelayState_exactTauriWordHasNoPrefix() {
        // "tauri" does not start with "tauri:" so it is treated as non-Tauri here.
        assertNull(TauriSamlUtils.extractNonceFromRelayState("tauri"));
    }

    @Test
    void extractNonceFromRelayState_prefixOnlyReturnsNull() {
        // "tauri:".split(":") drops the trailing empty segment -> only one part.
        assertNull(TauriSamlUtils.extractNonceFromRelayState("tauri:"));
    }

    @Test
    void extractNonceFromRelayState_prefixWithTrailingColonsReturnsNull() {
        // "tauri::".split(":") drops trailing empties -> only one part.
        assertNull(TauriSamlUtils.extractNonceFromRelayState("tauri::"));
    }

    @Test
    void extractNonceFromRelayState_blankNonceReturnsNull() {
        assertNull(TauriSamlUtils.extractNonceFromRelayState("tauri: "));
    }

    @Test
    void extractNonceFromRelayState_trailingColonTrimmedToPreviousSegment() {
        // "tauri:abc:".split(":") drops the trailing empty -> last part is "abc".
        assertEquals("abc", TauriSamlUtils.extractNonceFromRelayState("tauri:abc:"));
    }

    @Test
    void extractNonceFromRelayState_emptyMiddleSegmentsKeepLastNonce() {
        // Empty interior segments are preserved; only the final non-empty one is returned.
        assertEquals("nonce", TauriSamlUtils.extractNonceFromRelayState("tauri::nonce"));
    }

    // ---------------------------------------------------------------------
    // extractNonceFromRequest
    // ---------------------------------------------------------------------

    @Test
    void extractNonceFromRequest_validRelayState() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "tauri:abc:nonce-123");

        assertEquals("nonce-123", TauriSamlUtils.extractNonceFromRequest(request));
    }

    @Test
    void extractNonceFromRequest_missingRelayStateReturnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        assertNull(TauriSamlUtils.extractNonceFromRequest(request));
    }

    @Test
    void extractNonceFromRequest_nonTauriRelayStateReturnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("RelayState", "regular-state");

        assertNull(TauriSamlUtils.extractNonceFromRequest(request));
    }

    // ---------------------------------------------------------------------
    // buildRelayState
    // ---------------------------------------------------------------------

    @Test
    void buildRelayState_withNonce() {
        assertEquals("tauri:my-nonce", TauriSamlUtils.buildRelayState("my-nonce"));
    }

    @Test
    void buildRelayState_nullNonceFallsBackToBareTauri() {
        assertEquals("tauri", TauriSamlUtils.buildRelayState(null));
    }

    @Test
    void buildRelayState_emptyNonceFallsBackToBareTauri() {
        assertEquals("tauri", TauriSamlUtils.buildRelayState(""));
    }

    @Test
    void buildRelayState_blankNonceFallsBackToBareTauri() {
        assertEquals("tauri", TauriSamlUtils.buildRelayState("   "));
    }

    @Test
    void buildRelayState_usesDeclaredPrefixConstant() {
        String built = TauriSamlUtils.buildRelayState("abc");

        assertTrue(built.startsWith(TauriSamlUtils.TAURI_RELAY_STATE_PREFIX));
        assertEquals(TauriSamlUtils.TAURI_RELAY_STATE_PREFIX + "abc", built);
    }

    // ---------------------------------------------------------------------
    // Round-trip: buildRelayState -> extractNonceFromRelayState
    // ---------------------------------------------------------------------

    @Test
    void roundTrip_buildThenExtractRecoversNonce() {
        String relayState = TauriSamlUtils.buildRelayState("round-trip-nonce");

        assertEquals("round-trip-nonce", TauriSamlUtils.extractNonceFromRelayState(relayState));
    }

    @Test
    void roundTrip_buildWithoutNonceHasNoExtractableNonce() {
        String relayState = TauriSamlUtils.buildRelayState(null);

        assertEquals("tauri", relayState);
        assertNull(TauriSamlUtils.extractNonceFromRelayState(relayState));
    }
}
