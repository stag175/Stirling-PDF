package stirling.software.proprietary.security.supabase;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

class SupabaseEndpointsTest {

    private static SupabaseEndpoints endpointsWithUrl(String url) {
        SupabaseEndpoints endpoints = new SupabaseEndpoints();
        ReflectionTestUtils.setField(endpoints, "url", url);
        return endpoints;
    }

    @Test
    void defaultUrlConstantHasExpectedValue() {
        assertThat(SupabaseEndpoints.DEFAULT_URL).isEqualTo("https://auth.stirling.com");
    }

    @Test
    void defaultPublishableKeyConstantHasExpectedValue() {
        assertThat(SupabaseEndpoints.DEFAULT_PUBLISHABLE_KEY)
                .isEqualTo("sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb");
    }

    @Test
    void getUrlReturnsInjectedUrl() {
        SupabaseEndpoints endpoints = endpointsWithUrl("https://example.supabase.co");

        assertThat(endpoints.getUrl()).isEqualTo("https://example.supabase.co");
    }

    @Test
    void getIssuerAppendsAuthV1PathToDefaultUrl() {
        SupabaseEndpoints endpoints = endpointsWithUrl(SupabaseEndpoints.DEFAULT_URL);

        assertThat(endpoints.getIssuer()).isEqualTo("https://auth.stirling.com/auth/v1");
    }

    @Test
    void getIssuerAppendsAuthV1PathToCustomUrl() {
        SupabaseEndpoints endpoints = endpointsWithUrl("https://example.supabase.co");

        assertThat(endpoints.getIssuer()).isEqualTo("https://example.supabase.co/auth/v1");
    }

    @Test
    void getJwksUrlIsIssuerPlusWellKnownJwks() {
        SupabaseEndpoints endpoints = endpointsWithUrl("https://example.supabase.co");

        assertThat(endpoints.getJwksUrl())
                .isEqualTo("https://example.supabase.co/auth/v1/.well-known/jwks.json");
    }

    @Test
    void getJwksUrlForDefaultUrl() {
        SupabaseEndpoints endpoints = endpointsWithUrl(SupabaseEndpoints.DEFAULT_URL);

        assertThat(endpoints.getJwksUrl())
                .isEqualTo("https://auth.stirling.com/auth/v1/.well-known/jwks.json");
    }

    @Test
    void getJwksUrlIsConsistentWithGetIssuer() {
        SupabaseEndpoints endpoints = endpointsWithUrl("https://tenant.example.org");

        assertThat(endpoints.getJwksUrl())
                .isEqualTo(endpoints.getIssuer() + "/.well-known/jwks.json");
    }

    @ParameterizedTest
    @CsvSource({
        "https://auth.stirling.com,https://auth.stirling.com/auth/v1",
        "https://example.supabase.co,https://example.supabase.co/auth/v1",
        "http://localhost:8000,http://localhost:8000/auth/v1",
        "https://tenant.example.org/,https://tenant.example.org//auth/v1"
    })
    void getIssuerDerivesFromUrlVerbatim(String url, String expectedIssuer) {
        SupabaseEndpoints endpoints = endpointsWithUrl(url);

        assertThat(endpoints.getIssuer()).isEqualTo(expectedIssuer);
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://auth.stirling.com", "http://localhost:8000"})
    void getJwksUrlAlwaysEndsWithWellKnownJwksSuffix(String url) {
        SupabaseEndpoints endpoints = endpointsWithUrl(url);

        assertThat(endpoints.getJwksUrl()).endsWith("/auth/v1/.well-known/jwks.json");
    }

    @Test
    void getIssuerWithEmptyUrlProducesBarePathOnly() {
        SupabaseEndpoints endpoints = endpointsWithUrl("");

        assertThat(endpoints.getIssuer()).isEqualTo("/auth/v1");
        assertThat(endpoints.getJwksUrl()).isEqualTo("/auth/v1/.well-known/jwks.json");
    }

    @Test
    void getIssuerWithNullUrlConcatenatesNullLiteral() {
        SupabaseEndpoints endpoints = endpointsWithUrl(null);

        assertThat(endpoints.getUrl()).isNull();
        // String + concatenation renders a null reference as the literal "null".
        assertThat(endpoints.getIssuer()).isEqualTo("null/auth/v1");
        assertThat(endpoints.getJwksUrl()).isEqualTo("null/auth/v1/.well-known/jwks.json");
    }

    @Test
    void getPublishableKeyReturnsInjectedKey() {
        SupabaseEndpoints endpoints = new SupabaseEndpoints();
        ReflectionTestUtils.setField(endpoints, "publishableKey", "sb_publishable_custom");

        assertThat(endpoints.getPublishableKey()).isEqualTo("sb_publishable_custom");
    }
}
