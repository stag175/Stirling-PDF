package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Premium.EnterpriseFeatures.Audit;
import stirling.software.proprietary.audit.AuditLevel;

/**
 * Unit tests for {@link AuditConfigurationProperties}.
 *
 * <p>The class under test reads its values once in the constructor from {@code
 * ApplicationProperties.premium.enterpriseFeatures.audit}. The collaborator is a Lombok {@code
 * @Data} POJO graph that is fully constructable with real nested defaults, so these tests drive it
 * with a real {@link ApplicationProperties} instance and its setters rather than Mockito (the
 * chain getPremium().getEnterpriseFeatures().getAudit() never returns null by default).
 *
 * <p>Covered logic: level clamping to 0..3 (Math.min/Math.max), {@link
 * AuditConfigurationProperties#getAuditLevel()}, {@link
 * AuditConfigurationProperties#isLevelEnabled(AuditLevel)} enabled-and-includes branching, and
 * {@link AuditConfigurationProperties#getEffectiveRetentionDays()} (0/negative -> -1). Pure unit
 * test: no Spring context, no IO.
 *
 * <p>Assumption to verify: the production constructor relies on the nested {@code Audit} object
 * being non-null; this mirrors the @Data default ({@code audit = new Audit()}). If that default is
 * ever removed the constructor would NPE, which is intentionally not asserted here.
 */
class AuditConfigurationPropertiesTest {

    /**
     * Builds the class under test from a real ApplicationProperties graph, applying the supplied
     * raw configuration values to the nested Audit POJO before construction.
     */
    private static AuditConfigurationProperties build(
            boolean enabled,
            int level,
            int retentionDays,
            boolean captureFileHash,
            boolean capturePdfAuthor,
            boolean captureOperationResults) {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        Audit audit =
                applicationProperties.getPremium().getEnterpriseFeatures().getAudit();
        audit.setEnabled(enabled);
        audit.setLevel(level);
        audit.setRetentionDays(retentionDays);
        audit.setCaptureFileHash(captureFileHash);
        audit.setCapturePdfAuthor(capturePdfAuthor);
        audit.setCaptureOperationResults(captureOperationResults);
        return new AuditConfigurationProperties(applicationProperties);
    }

    /** Convenience overload that only varies the level (other flags default to off / 90 days). */
    private static AuditConfigurationProperties buildWithLevel(boolean enabled, int level) {
        return build(enabled, level, 90, false, false, false);
    }

    @Nested
    @DisplayName("constructor field mapping")
    class ConstructorMapping {

        @Test
        @DisplayName("copies every configured value through to the getters verbatim")
        void copiesAllConfiguredValues() {
            AuditConfigurationProperties props = build(true, 3, 45, true, true, true);

            assertAll(
                    () -> assertTrue(props.isEnabled(), "enabled"),
                    () -> assertEquals(3, props.getLevel(), "level"),
                    () -> assertEquals(45, props.getRetentionDays(), "retentionDays"),
                    () -> assertTrue(props.isCaptureFileHash(), "captureFileHash"),
                    () -> assertTrue(props.isCapturePdfAuthor(), "capturePdfAuthor"),
                    () ->
                            assertTrue(
                                    props.isCaptureOperationResults(),
                                    "captureOperationResults"));
        }

        @Test
        @DisplayName("propagates the false/disabled values for the boolean flags")
        void copiesDisabledFlags() {
            AuditConfigurationProperties props = build(false, 0, 10, false, false, false);

            assertAll(
                    () -> assertFalse(props.isEnabled(), "enabled"),
                    () -> assertFalse(props.isCaptureFileHash(), "captureFileHash"),
                    () -> assertFalse(props.isCapturePdfAuthor(), "capturePdfAuthor"),
                    () ->
                            assertFalse(
                                    props.isCaptureOperationResults(),
                                    "captureOperationResults"));
        }

        @Test
        @DisplayName("uses the @Data defaults when nothing is overridden (enabled, level 2, 90d)")
        void usesAuditDefaults() {
            ApplicationProperties applicationProperties = new ApplicationProperties();

            AuditConfigurationProperties props =
                    new AuditConfigurationProperties(applicationProperties);

            assertAll(
                    () -> assertTrue(props.isEnabled(), "default enabled"),
                    () -> assertEquals(2, props.getLevel(), "default level"),
                    () -> assertSame(AuditLevel.STANDARD, props.getAuditLevel(), "default level enum"),
                    () -> assertEquals(90, props.getRetentionDays(), "default retentionDays"),
                    () -> assertEquals(90, props.getEffectiveRetentionDays(), "default effective"),
                    () -> assertFalse(props.isCaptureFileHash(), "default fileHash"),
                    () -> assertFalse(props.isCapturePdfAuthor(), "default pdfAuthor"),
                    () ->
                            assertFalse(
                                    props.isCaptureOperationResults(),
                                    "default operationResults"));
        }
    }

    @Nested
    @DisplayName("level clamping (Math.min(Math.max(level,0),3))")
    class LevelClamping {

        @ParameterizedTest(name = "config level {0} -> clamped {1}")
        @CsvSource({
            "-2147483648, 0",
            "-100, 0",
            "-1, 0",
            "0, 0",
            "1, 1",
            "2, 2",
            "3, 3",
            "4, 3",
            "99, 3",
            "2147483647, 3",
        })
        @DisplayName("clamps the raw config level into the inclusive 0..3 range")
        void clampsLevel(int configLevel, int expectedLevel) {
            AuditConfigurationProperties props = buildWithLevel(true, configLevel);
            assertEquals(expectedLevel, props.getLevel());
        }

        @ParameterizedTest(name = "config level {0} -> {1}")
        @CsvSource({
            "-5, OFF",
            "0, OFF",
            "1, BASIC",
            "2, STANDARD",
            "3, VERBOSE",
            "7, VERBOSE",
        })
        @DisplayName("getAuditLevel maps the clamped int level to the matching enum constant")
        void auditLevelEnumMapping(int configLevel, AuditLevel expected) {
            AuditConfigurationProperties props = buildWithLevel(true, configLevel);
            assertSame(expected, props.getAuditLevel());
        }

        @Test
        @DisplayName("an in-range level is stored unchanged and round-trips via getAuditLevel")
        void inRangeLevelRoundTrips() {
            for (AuditLevel level : AuditLevel.values()) {
                AuditConfigurationProperties props = buildWithLevel(true, level.getLevel());
                assertAll(
                        () -> assertEquals(level.getLevel(), props.getLevel()),
                        () -> assertSame(level, props.getAuditLevel()));
            }
        }
    }

    @Nested
    @DisplayName("isLevelEnabled(AuditLevel)")
    class IsLevelEnabled {

        @Test
        @DisplayName("returns false for every required level when auditing is disabled")
        void disabledShortCircuitsToFalse() {
            // Configure the highest level so only the 'enabled' flag can make this false.
            AuditConfigurationProperties props = buildWithLevel(false, 3);

            assertAll(
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.OFF)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.BASIC)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.STANDARD)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.VERBOSE)));
        }

        @Test
        @DisplayName("when enabled at VERBOSE, every required level is included")
        void enabledVerboseIncludesEverything() {
            AuditConfigurationProperties props = buildWithLevel(true, 3);

            assertAll(
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.OFF)),
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.BASIC)),
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.STANDARD)),
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.VERBOSE)));
        }

        @Test
        @DisplayName("when enabled at STANDARD, includes <= STANDARD but not VERBOSE")
        void enabledStandardExcludesVerbose() {
            AuditConfigurationProperties props = buildWithLevel(true, 2);

            assertAll(
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.OFF)),
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.BASIC)),
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.STANDARD)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.VERBOSE)));
        }

        @Test
        @DisplayName("when enabled at OFF (level 0), only the OFF requirement is satisfied")
        void enabledOffIncludesOnlyOff() {
            AuditConfigurationProperties props = buildWithLevel(true, 0);

            assertAll(
                    () -> assertTrue(props.isLevelEnabled(AuditLevel.OFF)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.BASIC)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.STANDARD)),
                    () -> assertFalse(props.isLevelEnabled(AuditLevel.VERBOSE)));
        }

        @ParameterizedTest
        @EnumSource(AuditLevel.class)
        @DisplayName("disabled overrides the includes() result for any required level")
        void disabledBeatsIncludesForEveryRequiredLevel(AuditLevel required) {
            AuditConfigurationProperties enabledProps = buildWithLevel(true, 3);
            AuditConfigurationProperties disabledProps = buildWithLevel(false, 3);

            // Sanity: when enabled at the max level it would be true for all required levels.
            assertTrue(enabledProps.isLevelEnabled(required));
            // The disabled instance must report false regardless of the configured level.
            assertFalse(disabledProps.isLevelEnabled(required));
        }
    }

    @Nested
    @DisplayName("getEffectiveRetentionDays()")
    class EffectiveRetentionDays {

        @ParameterizedTest(name = "retentionDays {0} -> -1 (infinite)")
        @ValueSource(ints = {0, -1, -90, Integer.MIN_VALUE})
        @DisplayName("zero or negative retention maps to -1 (infinite retention)")
        void nonPositiveBecomesInfinite(int retentionDays) {
            AuditConfigurationProperties props =
                    build(true, 2, retentionDays, false, false, false);

            assertAll(
                    () -> assertEquals(retentionDays, props.getRetentionDays(), "raw stored value"),
                    () ->
                            assertEquals(
                                    -1,
                                    props.getEffectiveRetentionDays(),
                                    "effective should be -1"));
        }

        @ParameterizedTest(name = "retentionDays {0} stays {0}")
        @ValueSource(ints = {1, 7, 30, 90, 365, Integer.MAX_VALUE})
        @DisplayName("a positive retention period is returned unchanged")
        void positiveReturnedUnchanged(int retentionDays) {
            AuditConfigurationProperties props =
                    build(true, 2, retentionDays, false, false, false);

            assertEquals(retentionDays, props.getEffectiveRetentionDays());
        }

        @Test
        @DisplayName("boundary: 1 day is the smallest value that is NOT treated as infinite")
        void oneDayBoundary() {
            assertAll(
                    () ->
                            assertEquals(
                                    1,
                                    build(true, 2, 1, false, false, false)
                                            .getEffectiveRetentionDays(),
                                    "1 is finite"),
                    () ->
                            assertEquals(
                                    -1,
                                    build(true, 2, 0, false, false, false)
                                            .getEffectiveRetentionDays(),
                                    "0 is infinite"));
        }
    }
}
