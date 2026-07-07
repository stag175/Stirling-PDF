package stirling.software.proprietary.security.supabase;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class SupabaseUserLoginPropertiesTest {

    private static SupabaseUserLoginProperties newProperties() {
        return new SupabaseUserLoginProperties();
    }

    private static SupabaseUserLoginProperties enabledWithIssuer(String issuer) {
        SupabaseUserLoginProperties props = newProperties();
        props.setEnabled(true);
        props.setIssuer(issuer);
        return props;
    }

    // ---- Default values --------------------------------------------------

    @Test
    void defaultsAreSafeAndDisabled() {
        SupabaseUserLoginProperties props = newProperties();

        assertThat(props.isEnabled()).isFalse();
        assertThat(props.getIssuer()).isNull();
        assertThat(props.getExpectedAud()).isNull();
        assertThat(props.getClockSkewSeconds()).isEqualTo(120L);
        assertThat(props.isAutoCreate()).isFalse();
    }

    @Test
    void defaultInstanceIsNotJwtConfigured() {
        assertThat(newProperties().isJwtConfigured()).isFalse();
    }

    // ---- isJwtConfigured: enabled flag branch ----------------------------

    @Test
    void isJwtConfiguredFalseWhenDisabledEvenWithValidIssuer() {
        SupabaseUserLoginProperties props = newProperties();
        props.setEnabled(false);
        props.setIssuer("https://abcd1234.supabase.co/auth/v1");

        assertThat(props.isJwtConfigured()).isFalse();
    }

    @Test
    void isJwtConfiguredTrueWhenEnabledWithValidIssuer() {
        SupabaseUserLoginProperties props = enabledWithIssuer("https://abcd1234.supabase.co/auth/v1");

        assertThat(props.isJwtConfigured()).isTrue();
    }

    // ---- isJwtConfigured: issuer null / blank branches -------------------

    @Test
    void isJwtConfiguredFalseWhenEnabledButIssuerNull() {
        SupabaseUserLoginProperties props = newProperties();
        props.setEnabled(true);
        props.setIssuer(null);

        assertThat(props.isJwtConfigured()).isFalse();
    }

    @Test
    void isJwtConfiguredFalseWhenEnabledButIssuerEmpty() {
        assertThat(enabledWithIssuer("").isJwtConfigured()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {" ", "   ", "\t", "\n", " \t \n "})
    void isJwtConfiguredFalseWhenEnabledButIssuerBlankWhitespace(String issuer) {
        assertThat(enabledWithIssuer(issuer).isJwtConfigured()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "https://abcd1234.supabase.co/auth/v1",
                "http://localhost:8000/auth/v1",
                "x",
                "  surrounded-by-spaces-but-has-content  "
            })
    void isJwtConfiguredTrueForAnyNonBlankIssuerWhenEnabled(String issuer) {
        assertThat(enabledWithIssuer(issuer).isJwtConfigured()).isTrue();
    }

    @ParameterizedTest
    @CsvSource({
        // enabled, issuer, expected
        "true,  https://x.supabase.co/auth/v1, true",
        "false, https://x.supabase.co/auth/v1, false",
        "true,  '',                            false",
        "true,  '   ',                         false",
        "false, '',                            false",
        "false, '   ',                         false"
    })
    void isJwtConfiguredTruthTable(boolean enabled, String issuer, boolean expected) {
        SupabaseUserLoginProperties props = newProperties();
        props.setEnabled(enabled);
        props.setIssuer(issuer);

        assertThat(props.isJwtConfigured()).isEqualTo(expected);
    }

    // ---- Lombok-generated accessors --------------------------------------

    @Test
    void settersAndGettersRoundTripAllFields() {
        SupabaseUserLoginProperties props = newProperties();
        props.setEnabled(true);
        props.setIssuer("https://issuer.example/auth/v1");
        props.setExpectedAud("authenticated");
        props.setClockSkewSeconds(300L);
        props.setAutoCreate(true);

        assertThat(props.isEnabled()).isTrue();
        assertThat(props.getIssuer()).isEqualTo("https://issuer.example/auth/v1");
        assertThat(props.getExpectedAud()).isEqualTo("authenticated");
        assertThat(props.getClockSkewSeconds()).isEqualTo(300L);
        assertThat(props.isAutoCreate()).isTrue();
    }

    @Test
    void clockSkewSecondsAcceptsZeroAndNegativeValues() {
        SupabaseUserLoginProperties props = newProperties();

        props.setClockSkewSeconds(0L);
        assertThat(props.getClockSkewSeconds()).isEqualTo(0L);

        props.setClockSkewSeconds(-5L);
        assertThat(props.getClockSkewSeconds()).isEqualTo(-5L);
    }

    @Test
    void expectedAudCanBeNullEmptyOrValue() {
        SupabaseUserLoginProperties props = newProperties();

        props.setExpectedAud(null);
        assertThat(props.getExpectedAud()).isNull();

        props.setExpectedAud("");
        assertThat(props.getExpectedAud()).isEmpty();

        props.setExpectedAud("my-audience");
        assertThat(props.getExpectedAud()).isEqualTo("my-audience");
    }

    // ---- Lombok @Data equals/hashCode/toString ---------------------------

    @Test
    void equalsAndHashCodeReflectFieldValues() {
        SupabaseUserLoginProperties a = enabledWithIssuer("https://issuer/auth/v1");
        SupabaseUserLoginProperties b = enabledWithIssuer("https://issuer/auth/v1");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        assertThat(a).isEqualTo(a);
    }

    @Test
    void notEqualWhenAFieldDiffers() {
        SupabaseUserLoginProperties a = enabledWithIssuer("https://issuer/auth/v1");
        SupabaseUserLoginProperties b = enabledWithIssuer("https://other/auth/v1");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void notEqualToNullOrDifferentType() {
        SupabaseUserLoginProperties props = newProperties();

        assertThat(props).isNotEqualTo(null);
        assertThat(props).isNotEqualTo("not-a-properties-object");
    }

    @Test
    void toStringIncludesFieldNames() {
        SupabaseUserLoginProperties props = enabledWithIssuer("https://issuer/auth/v1");
        props.setExpectedAud("authenticated");
        props.setAutoCreate(true);

        assertThat(props.toString())
                .contains("enabled=true")
                .contains("issuer=https://issuer/auth/v1")
                .contains("expectedAud=authenticated")
                .contains("clockSkewSeconds=120")
                .contains("autoCreate=true");
    }
}
