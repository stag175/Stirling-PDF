package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

/**
 * Unit tests for {@link InitialSetup}.
 *
 * <p>Uses real {@link ApplicationProperties} instances (matching the convention in the sibling
 * {@code AppUpdateServiceTest}) and Mockito static mocking for the {@link GeneralUtils} utility
 * class collaborators ({@code isValidUUID}, {@code saveKeyToSettings}, {@code extractPipeline}).
 * No Spring context, no real IO. {@code GeneralUtils} is a Lombok {@code @UtilityClass}, so all
 * its members are static and {@code mockStatic} applies.
 */
class InitialSetupTest {

    private ApplicationProperties newProps() {
        // ApplicationProperties is @Data with field initializers:
        //   legal = new Legal(); automaticallyGenerated = new AutomaticallyGenerated();
        return new ApplicationProperties();
    }

    // ----------------------------------------------------------------------
    // initUUIDKey
    // ----------------------------------------------------------------------

    @Test
    void initUUIDKey_whenInvalid_generatesSavesAndSets() throws Exception {
        ApplicationProperties props = newProps();
        assertNull(props.getAutomaticallyGenerated().getUUID());

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            // Existing value (null) is treated as invalid.
            util.when(() -> GeneralUtils.isValidUUID(null)).thenReturn(false);

            setup.initUUIDKey();

            // A real UUID should have been generated and stored on the model.
            String saved = props.getAutomaticallyGenerated().getUUID();
            assertNotNull(saved);
            assertDoesNotThrow(() -> UUID.fromString(saved));

            // It should have been persisted under the documented settings key.
            util.verify(() -> GeneralUtils.saveKeyToSettings(eq("AutomaticallyGenerated.UUID"), eq(saved)));
        }
    }

    @Test
    void initUUIDKey_whenValid_doesNothing() throws Exception {
        ApplicationProperties props = newProps();
        String existing = "11111111-1111-1111-1111-111111111111";
        props.getAutomaticallyGenerated().setUUID(existing);

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            util.when(() -> GeneralUtils.isValidUUID(existing)).thenReturn(true);

            setup.initUUIDKey();

            // Value untouched, nothing persisted.
            assertEquals(existing, props.getAutomaticallyGenerated().getUUID());
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
        }
    }

    // ----------------------------------------------------------------------
    // initSecretKey
    // ----------------------------------------------------------------------

    @Test
    void initSecretKey_whenInvalid_generatesSavesAndSets() throws Exception {
        ApplicationProperties props = newProps();
        assertNull(props.getAutomaticallyGenerated().getKey());

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            util.when(() -> GeneralUtils.isValidUUID(null)).thenReturn(false);

            setup.initSecretKey();

            String saved = props.getAutomaticallyGenerated().getKey();
            assertNotNull(saved);
            assertDoesNotThrow(() -> UUID.fromString(saved));

            // Note the lowercase "key" segment in the production key string.
            util.verify(() -> GeneralUtils.saveKeyToSettings(eq("AutomaticallyGenerated.key"), eq(saved)));
        }
    }

    @Test
    void initSecretKey_whenValid_doesNothing() throws Exception {
        ApplicationProperties props = newProps();
        String existing = "22222222-2222-2222-2222-222222222222";
        props.getAutomaticallyGenerated().setKey(existing);

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            util.when(() -> GeneralUtils.isValidUUID(existing)).thenReturn(true);

            setup.initSecretKey();

            assertEquals(existing, props.getAutomaticallyGenerated().getKey());
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
        }
    }

    // ----------------------------------------------------------------------
    // initLegalUrls
    // ----------------------------------------------------------------------

    @Test
    void initLegalUrls_whenBothEmpty_setsDefaultsAndPersists() throws Exception {
        ApplicationProperties props = newProps();
        // Legal terms/privacy default to null -> StringUtils.isEmpty true.

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initLegalUrls();

            assertEquals(
                    "https://www.stirlingpdf.com/terms",
                    props.getLegal().getTermsAndConditions());
            assertEquals(
                    "https://www.stirlingpdf.com/privacy-policy",
                    props.getLegal().getPrivacyPolicy());

            util.verify(
                    () ->
                            GeneralUtils.saveKeyToSettings(
                                    eq("legal.termsAndConditions"),
                                    eq("https://www.stirlingpdf.com/terms")));
            util.verify(
                    () ->
                            GeneralUtils.saveKeyToSettings(
                                    eq("legal.privacyPolicy"),
                                    eq("https://www.stirlingpdf.com/privacy-policy")));
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), times(2));
        }
    }

    @Test
    void initLegalUrls_whenBothPresent_leavesUntouched() throws Exception {
        ApplicationProperties props = newProps();
        props.getLegal().setTermsAndConditions("https://example.com/terms");
        props.getLegal().setPrivacyPolicy("https://example.com/privacy");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initLegalUrls();

            assertEquals("https://example.com/terms", props.getLegal().getTermsAndConditions());
            assertEquals("https://example.com/privacy", props.getLegal().getPrivacyPolicy());
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
        }
    }

    @Test
    void initLegalUrls_whenOnlyTermsEmpty_setsOnlyTerms() throws Exception {
        ApplicationProperties props = newProps();
        // terms null/empty, privacy already set.
        props.getLegal().setTermsAndConditions("");
        props.getLegal().setPrivacyPolicy("https://example.com/privacy");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initLegalUrls();

            assertEquals(
                    "https://www.stirlingpdf.com/terms",
                    props.getLegal().getTermsAndConditions());
            assertEquals("https://example.com/privacy", props.getLegal().getPrivacyPolicy());

            util.verify(
                    () ->
                            GeneralUtils.saveKeyToSettings(
                                    eq("legal.termsAndConditions"), any()));
            util.verify(
                    () -> GeneralUtils.saveKeyToSettings(eq("legal.privacyPolicy"), any()),
                    never());
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), times(1));
        }
    }

    @Test
    void initLegalUrls_whenOnlyPrivacyEmpty_setsOnlyPrivacy() throws Exception {
        ApplicationProperties props = newProps();
        props.getLegal().setTermsAndConditions("https://example.com/terms");
        props.getLegal().setPrivacyPolicy("");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initLegalUrls();

            assertEquals("https://example.com/terms", props.getLegal().getTermsAndConditions());
            assertEquals(
                    "https://www.stirlingpdf.com/privacy-policy",
                    props.getLegal().getPrivacyPolicy());

            util.verify(
                    () -> GeneralUtils.saveKeyToSettings(eq("legal.privacyPolicy"), any()));
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), times(1));
        }
    }

    // ----------------------------------------------------------------------
    // initSetAppVersion
    // ----------------------------------------------------------------------

    @Test
    void initSetAppVersion_whenExistingVersionNull_marksNewServer() throws Exception {
        ApplicationProperties props = newProps();
        assertNull(props.getAutomaticallyGenerated().getAppVersion());

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initSetAppVersion();

            // A version is always resolved (defaults to "0.0.0" when version.properties is
            // unavailable; may be the real bundled version when on the test classpath).
            String saved = props.getAutomaticallyGenerated().getAppVersion();
            assertNotNull(saved);
            assertFalse(saved.isEmpty());

            assertEquals(Boolean.TRUE, props.getAutomaticallyGenerated().getIsNewServer());
            assertTrue(InitialSetup.isNewServer());

            util.verify(
                    () ->
                            GeneralUtils.saveKeyToSettings(
                                    eq("AutomaticallyGenerated.appVersion"), eq(saved)));
        }
    }

    @Test
    void initSetAppVersion_whenExistingVersionEmpty_marksNewServer() throws Exception {
        ApplicationProperties props = newProps();
        props.getAutomaticallyGenerated().setAppVersion("");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initSetAppVersion();

            assertEquals(Boolean.TRUE, props.getAutomaticallyGenerated().getIsNewServer());
            assertTrue(InitialSetup.isNewServer());
        }
    }

    @Test
    void initSetAppVersion_whenExistingVersionZeroZeroZero_marksNewServer() throws Exception {
        ApplicationProperties props = newProps();
        props.getAutomaticallyGenerated().setAppVersion("0.0.0");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initSetAppVersion();

            assertEquals(Boolean.TRUE, props.getAutomaticallyGenerated().getIsNewServer());
            assertTrue(InitialSetup.isNewServer());
        }
    }

    @Test
    void initSetAppVersion_whenExistingRealVersion_notNewServer() throws Exception {
        ApplicationProperties props = newProps();
        props.getAutomaticallyGenerated().setAppVersion("1.2.3");

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            setup.initSetAppVersion();

            assertEquals(Boolean.FALSE, props.getAutomaticallyGenerated().getIsNewServer());
            assertFalse(InitialSetup.isNewServer());

            // The resolved version is still persisted, overwriting the prior placeholder.
            String saved = props.getAutomaticallyGenerated().getAppVersion();
            assertNotNull(saved);
            util.verify(
                    () ->
                            GeneralUtils.saveKeyToSettings(
                                    eq("AutomaticallyGenerated.appVersion"), eq(saved)));
        }
    }

    // ----------------------------------------------------------------------
    // init() orchestration
    // ----------------------------------------------------------------------

    @Test
    void init_runsAllStepsAndExtractsPipeline() throws Exception {
        ApplicationProperties props = newProps();

        InitialSetup setup = new InitialSetup(props);

        try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
            // Default mockStatic returns false for isValidUUID -> UUID + key both regenerated.
            setup.init();

            // UUID and secret key both populated.
            String uuid = props.getAutomaticallyGenerated().getUUID();
            String key = props.getAutomaticallyGenerated().getKey();
            assertNotNull(uuid);
            assertNotNull(key);
            assertDoesNotThrow(() -> UUID.fromString(uuid));
            assertDoesNotThrow(() -> UUID.fromString(key));

            // Legal defaults applied.
            assertEquals(
                    "https://www.stirlingpdf.com/terms",
                    props.getLegal().getTermsAndConditions());
            assertEquals(
                    "https://www.stirlingpdf.com/privacy-policy",
                    props.getLegal().getPrivacyPolicy());

            // App version resolved and new-server flag set.
            assertNotNull(props.getAutomaticallyGenerated().getAppVersion());
            assertEquals(Boolean.TRUE, props.getAutomaticallyGenerated().getIsNewServer());

            // The pipeline extraction step was invoked.
            util.verify(GeneralUtils::extractPipeline);

            // Persistence happened for UUID, key, both legal urls and the app version: 5 saves.
            util.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), times(5));
        }
    }
}
