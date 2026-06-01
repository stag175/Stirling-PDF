package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import jakarta.servlet.MultipartConfigElement;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.SPDF.controller.web.UploadLimitService;

/**
 * Unit tests for {@link MultipartConfiguration#multipartConfigElement()}.
 *
 * <p>The bean method resolves the multipart upload limit through three branches:
 *
 * <ol>
 *   <li>the {@code SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE} environment variable (highest priority),
 *   <li>the value returned by {@link UploadLimitService#getUploadLimit()} when greater than zero,
 *   <li>a hard-coded default of 2000MB when neither of the above provides a positive value.
 * </ol>
 *
 * <p>{@code UploadLimitService} is field-injected, so it is wired in via
 * {@link ReflectionTestUtils#setField}. The environment variable cannot be set portably from a unit
 * test, so the tests that rely on branches 2 and 3 assume it is absent (guarded with {@link
 * Assumptions}); if a CI environment sets that variable those assumptions skip rather than fail.
 */
class MultipartConfigurationTest {

    private static final String SPRING_ENV = "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE";

    private static final long DEFAULT_LIMIT_BYTES = 2000L * 1024 * 1024;

    private MultipartConfiguration configuration;
    private UploadLimitService uploadLimitService;

    @BeforeEach
    void setUp() {
        configuration = new MultipartConfiguration();
        uploadLimitService = mock(UploadLimitService.class);
        ReflectionTestUtils.setField(configuration, "uploadLimitService", uploadLimitService);
    }

    private static boolean springEnvUnset() {
        String v = java.lang.System.getenv(SPRING_ENV);
        return v == null || v.trim().isEmpty();
    }

    @Test
    void usesUploadLimitServiceValueWhenPositive() {
        Assumptions.assumeTrue(springEnvUnset(), "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is set");

        long limit = 50L * 1024 * 1024; // 50MB
        when(uploadLimitService.getUploadLimit()).thenReturn(limit);
        when(uploadLimitService.getReadableUploadLimit()).thenReturn("50.0 MB");

        MultipartConfigElement element = configuration.multipartConfigElement();

        assertNotNull(element);
        assertEquals(limit, element.getMaxFileSize());
        assertEquals(limit, element.getMaxRequestSize());
        // getReadableUploadLimit() is consulted only on the success-logging path
        verify(uploadLimitService).getUploadLimit();
        verify(uploadLimitService).getReadableUploadLimit();
    }

    @Test
    void fallsBackToDefaultWhenServiceReturnsZero() {
        Assumptions.assumeTrue(springEnvUnset(), "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is set");

        when(uploadLimitService.getUploadLimit()).thenReturn(0L);

        MultipartConfigElement element = configuration.multipartConfigElement();

        assertNotNull(element);
        assertEquals(DEFAULT_LIMIT_BYTES, element.getMaxFileSize());
        assertEquals(DEFAULT_LIMIT_BYTES, element.getMaxRequestSize());
        verify(uploadLimitService).getUploadLimit();
        // readable limit is NOT consulted when the limit stays zero
        verify(uploadLimitService, never()).getReadableUploadLimit();
    }

    @Test
    void maxFileSizeAndMaxRequestSizeAreAlwaysEqual() {
        Assumptions.assumeTrue(springEnvUnset(), "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is set");

        long limit = 1L * 1024 * 1024 * 1024; // 1GB
        when(uploadLimitService.getUploadLimit()).thenReturn(limit);
        when(uploadLimitService.getReadableUploadLimit()).thenReturn("1.0 GB");

        MultipartConfigElement element = configuration.multipartConfigElement();

        assertEquals(element.getMaxFileSize(), element.getMaxRequestSize());
        assertEquals(limit, element.getMaxFileSize());
    }

    @Test
    void smallServiceLimitIsHonoured() {
        Assumptions.assumeTrue(springEnvUnset(), "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is set");

        long limit = 1024L; // 1KB
        when(uploadLimitService.getUploadLimit()).thenReturn(limit);
        when(uploadLimitService.getReadableUploadLimit()).thenReturn("1.0 KB");

        MultipartConfigElement element = configuration.multipartConfigElement();

        assertEquals(limit, element.getMaxFileSize());
        assertEquals(limit, element.getMaxRequestSize());
    }

    @Test
    void defaultLimitIsTwoThousandMegabytes() {
        Assumptions.assumeTrue(springEnvUnset(), "SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is set");

        when(uploadLimitService.getUploadLimit()).thenReturn(0L);

        MultipartConfigElement element = configuration.multipartConfigElement();

        // 2000MB expressed in bytes
        assertEquals(2_097_152_000L, element.getMaxFileSize());
    }

    @Test
    void returnsNonNullConfigElementOnEveryBranch() {
        // No assumption: regardless of whether the env var is set, the method must always
        // produce a usable MultipartConfigElement. When the env var is absent the service is
        // consulted (stubbed below); when present the env value wins and the stub is ignored.
        when(uploadLimitService.getUploadLimit()).thenReturn(0L);

        MultipartConfigElement element = configuration.multipartConfigElement();

        assertNotNull(element);
        assertTrue(element.getMaxFileSize() > 0, "max file size must be positive");
        assertTrue(element.getMaxRequestSize() > 0, "max request size must be positive");
    }
}
