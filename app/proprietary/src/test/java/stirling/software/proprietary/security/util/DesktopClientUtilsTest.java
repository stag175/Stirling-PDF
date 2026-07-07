package stirling.software.proprietary.security.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
class DesktopClientUtilsTest {

    @Mock private HttpServletRequest request;

    // ---------------------------------------------------------------------
    // isDesktopClient
    // ---------------------------------------------------------------------

    @Test
    void isDesktopClientReturnsFalseWhenUserAgentHeaderIsNull() {
        when(request.getHeader("User-Agent")).thenReturn(null);

        assertFalse(DesktopClientUtils.isDesktopClient(request));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    void isDesktopClientReturnsFalseForEmptyOrBlankUserAgent(String userAgent) {
        when(request.getHeader("User-Agent")).thenReturn(userAgent);

        assertFalse(DesktopClientUtils.isDesktopClient(request));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Tauri",
                "tauri",
                "TAURI",
                "Mozilla/5.0 tauri-plugin-http",
                "StirlingPDF-Desktop/1.0",
                "stirlingpdf-desktop",
                "Electron",
                "electron/28.0",
                "MyApp (Electron 28; Windows NT 10.0)"
            })
    void isDesktopClientReturnsTrueForKnownDesktopUserAgents(String userAgent) {
        when(request.getHeader("User-Agent")).thenReturn(userAgent);

        assertTrue(DesktopClientUtils.isDesktopClient(request));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
                "curl/8.4.0",
                "PostmanRuntime/7.36.0",
                "stirlingpdf",
                "electro",
                "taur"
            })
    void isDesktopClientReturnsFalseForBrowserOrPartialUserAgents(String userAgent) {
        when(request.getHeader("User-Agent")).thenReturn(userAgent);

        assertFalse(DesktopClientUtils.isDesktopClient(request));
    }

    @Test
    void isDesktopClientIsCaseInsensitiveForStirlingIdentifier() {
        when(request.getHeader("User-Agent")).thenReturn("App StIrLiNgPdF-DeSkToP build 42");

        assertTrue(DesktopClientUtils.isDesktopClient(request));
    }

    @Test
    void isDesktopClientDetectsTauriSubstringInLongerUserAgent() {
        when(request.getHeader("User-Agent"))
                .thenReturn(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) wry/0.24 Tauri/1.5 Chrome/120.0");

        assertTrue(DesktopClientUtils.isDesktopClient(request));
    }

    @Test
    void isDesktopClientThrowsWhenRequestIsNull() {
        assertThrows(NullPointerException.class, () -> DesktopClientUtils.isDesktopClient(null));
    }

    // ---------------------------------------------------------------------
    // getDesktopTokenExpiryMinutes
    // ---------------------------------------------------------------------

    @Test
    void getDesktopTokenExpiryReturnsConfiguredPositiveValue() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setDesktopTokenExpiryMinutes(15);

        assertEquals(15, DesktopClientUtils.getDesktopTokenExpiryMinutes(properties));
    }

    @Test
    void getDesktopTokenExpiryReturnsDefaultWhenConfiguredZero() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setDesktopTokenExpiryMinutes(0);

        assertEquals(
                JwtConstants.DEFAULT_DESKTOP_TOKEN_EXPIRY_MINUTES,
                DesktopClientUtils.getDesktopTokenExpiryMinutes(properties));
    }

    @Test
    void getDesktopTokenExpiryReturnsDefaultWhenConfiguredNegative() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setDesktopTokenExpiryMinutes(-5);

        assertEquals(
                JwtConstants.DEFAULT_DESKTOP_TOKEN_EXPIRY_MINUTES,
                DesktopClientUtils.getDesktopTokenExpiryMinutes(properties));
    }

    @Test
    void getDesktopTokenExpiryUsesDefaultFromFreshProperties() {
        // A freshly constructed Jwt section already defaults to 43200 (positive),
        // so the configured value is returned, and it equals the documented default.
        ApplicationProperties properties = new ApplicationProperties();

        int actual = DesktopClientUtils.getDesktopTokenExpiryMinutes(properties);

        assertEquals(JwtConstants.DEFAULT_DESKTOP_TOKEN_EXPIRY_MINUTES, actual);
        assertEquals(43200, actual);
    }

    @Test
    void getDesktopTokenExpiryReturnsOneForMinimalPositiveBoundary() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setDesktopTokenExpiryMinutes(1);

        assertEquals(1, DesktopClientUtils.getDesktopTokenExpiryMinutes(properties));
    }

    // ---------------------------------------------------------------------
    // getWebTokenExpiryMinutes
    // ---------------------------------------------------------------------

    @Test
    void getWebTokenExpiryReturnsConfiguredPositiveValue() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setTokenExpiryMinutes(720);

        assertEquals(720, DesktopClientUtils.getWebTokenExpiryMinutes(properties));
    }

    @Test
    void getWebTokenExpiryReturnsDefaultWhenConfiguredZero() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setTokenExpiryMinutes(0);

        assertEquals(
                JwtConstants.DEFAULT_TOKEN_EXPIRY_MINUTES,
                DesktopClientUtils.getWebTokenExpiryMinutes(properties));
    }

    @Test
    void getWebTokenExpiryReturnsDefaultWhenConfiguredNegative() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setTokenExpiryMinutes(-100);

        assertEquals(
                JwtConstants.DEFAULT_TOKEN_EXPIRY_MINUTES,
                DesktopClientUtils.getWebTokenExpiryMinutes(properties));
    }

    @Test
    void getWebTokenExpiryUsesDefaultFromFreshProperties() {
        // A freshly constructed Jwt section already defaults to 1440 (positive).
        ApplicationProperties properties = new ApplicationProperties();

        int actual = DesktopClientUtils.getWebTokenExpiryMinutes(properties);

        assertEquals(JwtConstants.DEFAULT_TOKEN_EXPIRY_MINUTES, actual);
        assertEquals(1440, actual);
    }

    @Test
    void getWebTokenExpiryReturnsOneForMinimalPositiveBoundary() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setTokenExpiryMinutes(1);

        assertEquals(1, DesktopClientUtils.getWebTokenExpiryMinutes(properties));
    }

    @Test
    void desktopAndWebExpiryAreIndependentlyConfigured() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getJwt().setTokenExpiryMinutes(60);
        properties.getSecurity().getJwt().setDesktopTokenExpiryMinutes(43200);

        assertEquals(60, DesktopClientUtils.getWebTokenExpiryMinutes(properties));
        assertEquals(43200, DesktopClientUtils.getDesktopTokenExpiryMinutes(properties));
    }
}
