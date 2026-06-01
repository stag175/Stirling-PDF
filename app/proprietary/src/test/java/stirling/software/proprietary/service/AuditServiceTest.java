package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.service.JwtServiceInterface;

/**
 * Pure unit tests for {@link AuditService}.
 *
 * <p>All collaborators ({@link AuditEventRepository}, {@link AuditConfigurationProperties},
 * {@link CustomPDFDocumentFactory}, {@link JwtServiceInterface}) are Mockito mocks; the
 * {@code runningEE} flag is supplied directly to the constructor. No Spring container, database,
 * network, or real file IO is used.
 *
 * <p>The service reads from three thread-local statics ({@link MDC}, {@link SecurityContextHolder},
 * {@link RequestContextHolder}); every test that touches them clears them in {@link #tearDown()} to
 * keep tests independent.
 *
 * <p>Lenient strictness is used because the broad gating guards mean a given test only exercises a
 * subset of the configured stubs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuditServiceTest {

    @Mock private AuditEventRepository repository;
    @Mock private AuditConfigurationProperties auditConfig;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private JwtServiceInterface jwtService;

    private AuditService service;

    private AuditService newService(boolean runningEE) {
        return new AuditService(repository, auditConfig, runningEE, pdfDocumentFactory, jwtService);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    /** Convenience: enable auditing at a given level (covers both isEnabled/getAuditLevel paths). */
    private void enableAudit(AuditLevel level) {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(level);
        when(auditConfig.isLevelEnabled(any(AuditLevel.class)))
                .thenAnswer(inv -> level.includes(inv.getArgument(0)));
    }

    private AuditEvent captureSingleEvent() {
        ArgumentCaptor<AuditEvent> captor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(repository).add(captor.capture());
        return captor.getValue();
    }

    // =====================================================================================
    // audit(AuditEventType, data, level) -- current user, enum type
    // =====================================================================================

    @Nested
    class CurrentUserEnumAudit {

        @Test
        @DisplayName("Skips when auditing disabled")
        void skipsWhenDisabled() {
            when(auditConfig.isEnabled()).thenReturn(false);
            service = newService(true);

            service.audit(AuditEventType.PDF_PROCESS, Map.of("k", "v"), AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("Skips when level not included by configured level")
        void skipsWhenLevelTooHigh() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.BASIC);
            service = newService(true);

            // VERBOSE is not included by BASIC -> skip
            service.audit(AuditEventType.PDF_PROCESS, Map.of("k", "v"), AuditLevel.VERBOSE);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("Skips when not running Enterprise Edition")
        void skipsWhenNotEE() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);
            service = newService(false);

            service.audit(AuditEventType.PDF_PROCESS, Map.of("k", "v"), AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("Persists with principal 'system' and __origin SYSTEM when no auth context")
        void persistsWithSystemPrincipalAndOrigin() {
            enableAudit(AuditLevel.VERBOSE);
            service = newService(true);

            service.audit(AuditEventType.PDF_PROCESS, Map.of("k", "v"), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("system", event.getPrincipal());
            assertEquals(AuditEventType.PDF_PROCESS.name(), event.getType());
            assertEquals("v", event.getData().get("k"));
            assertEquals("SYSTEM", event.getData().get("__origin"));
        }

        @Test
        @DisplayName("Uses authenticated username as principal and WEB origin")
        void usesAuthenticatedPrincipal() {
            enableAudit(AuditLevel.STANDARD);
            Authentication auth =
                    new UsernamePasswordAuthenticationToken("alice", "pw", List.of());
            SecurityContextHolder.getContext().setAuthentication(auth);
            service = newService(true);

            service.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("alice", event.getPrincipal());
            assertEquals("WEB", event.getData().get("__origin"));
        }

        @Test
        @DisplayName("ApiKeyAuthenticationToken yields API origin")
        void apiKeyOrigin() {
            enableAudit(AuditLevel.STANDARD);
            SecurityContextHolder.getContext()
                    .setAuthentication(new ApiKeyAuthenticationToken("the-key"));
            service = newService(true);

            service.audit(AuditEventType.HTTP_REQUEST, new HashMap<>(), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("API", event.getData().get("__origin"));
        }

        @Test
        @DisplayName("Two-arg overload defaults to STANDARD level")
        void twoArgDefaultsToStandard() {
            enableAudit(AuditLevel.STANDARD);
            service = newService(true);

            service.audit(AuditEventType.FILE_OPERATION, Map.of("a", 1));

            verify(repository).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("Two-arg overload skipped when only BASIC enabled (STANDARD not included)")
        void twoArgSkippedWhenBelowStandard() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.BASIC);
            service = newService(true);

            service.audit(AuditEventType.FILE_OPERATION, Map.of("a", 1));

            verifyNoInteractions(repository);
        }
    }

    // =====================================================================================
    // audit(principal, type, data, level) -- explicit principal, uses isLevelEnabled
    // =====================================================================================

    @Nested
    class ExplicitPrincipalAudit {

        @Test
        @DisplayName("Enum overload: persists raw data without __origin enrichment")
        void enumPersistsRawData() {
            when(auditConfig.isLevelEnabled(AuditLevel.BASIC)).thenReturn(true);
            service = newService(true);

            Map<String, Object> data = Map.of("x", 42);
            service.audit("bob", AuditEventType.PDF_PROCESS, data, AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("bob", event.getPrincipal());
            assertEquals(42, event.getData().get("x"));
            assertNull(event.getData().get("__origin"), "explicit-principal overload must not enrich");
        }

        @Test
        @DisplayName("Enum overload skipped when level disabled")
        void enumSkippedWhenLevelDisabled() {
            when(auditConfig.isLevelEnabled(AuditLevel.VERBOSE)).thenReturn(false);
            service = newService(true);

            service.audit("bob", AuditEventType.PDF_PROCESS, Map.of(), AuditLevel.VERBOSE);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("Enum overload skipped when not EE even if level enabled")
        void enumSkippedWhenNotEE() {
            when(auditConfig.isLevelEnabled(AuditLevel.BASIC)).thenReturn(true);
            service = newService(false);

            service.audit("bob", AuditEventType.PDF_PROCESS, Map.of(), AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("Enum two-arg overload defaults to STANDARD and persists")
        void enumTwoArgDefault() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
            service = newService(true);

            service.audit("carol", AuditEventType.SETTINGS_CHANGED, Map.of());

            AuditEvent event = captureSingleEvent();
            assertEquals("carol", event.getPrincipal());
            assertEquals(AuditEventType.SETTINGS_CHANGED.name(), event.getType());
        }

        @Test
        @DisplayName("String type overload persists with given string type and enriched __origin")
        void stringTypeEnriches() {
            when(auditConfig.isLevelEnabled(AuditLevel.BASIC)).thenReturn(true);
            service = newService(true);

            service.audit("CUSTOM_EVENT", Map.of("foo", "bar"), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("CUSTOM_EVENT", event.getType());
            assertEquals("bar", event.getData().get("foo"));
            assertEquals("SYSTEM", event.getData().get("__origin"));
        }

        @Test
        @DisplayName("String type overload skipped when not EE")
        void stringTypeSkippedWhenNotEE() {
            when(auditConfig.isLevelEnabled(AuditLevel.BASIC)).thenReturn(true);
            service = newService(false);

            service.audit("CUSTOM_EVENT", Map.of(), AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("String type two-arg overload defaults to STANDARD")
        void stringTypeTwoArgDefault() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
            service = newService(true);

            service.audit("STR_EVT", Map.of());

            verify(repository).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("Explicit-principal string overload persists raw data (no enrichment)")
        void explicitPrincipalStringRaw() {
            when(auditConfig.isLevelEnabled(AuditLevel.BASIC)).thenReturn(true);
            service = newService(true);

            service.audit("dave", "STR_EVT", Map.of("n", "m"), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("dave", event.getPrincipal());
            assertEquals("STR_EVT", event.getType());
            assertNull(event.getData().get("__origin"));
        }

        @Test
        @DisplayName("Explicit-principal string two-arg overload defaults to STANDARD")
        void explicitPrincipalStringTwoArg() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
            service = newService(true);

            service.audit("dave", "STR_EVT", Map.of());

            verify(repository).add(any(AuditEvent.class));
        }
    }

    // =====================================================================================
    // audit(principal, origin, ipAddress, type, data, level) -- aspect overloads
    // =====================================================================================

    @Nested
    class PreCapturedAudit {

        @Test
        @DisplayName("Enum aspect overload enriches with origin and ip")
        void enumWithIp() {
            enableAudit(AuditLevel.STANDARD);
            service = newService(true);

            service.audit(
                    "erin",
                    "API",
                    "10.0.0.1",
                    AuditEventType.FILE_OPERATION,
                    Map.of("z", 1),
                    AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("erin", event.getPrincipal());
            assertEquals(AuditEventType.FILE_OPERATION.name(), event.getType());
            assertEquals("API", event.getData().get("__origin"));
            assertEquals("10.0.0.1", event.getData().get("__ipAddress"));
        }

        @Test
        @DisplayName("Enum aspect overload omits __ipAddress when ip is null")
        void enumNullIpOmitted() {
            enableAudit(AuditLevel.STANDARD);
            service = newService(true);

            service.audit(
                    "erin", "WEB", null, AuditEventType.FILE_OPERATION, Map.of(), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("WEB", event.getData().get("__origin"));
            assertFalse(event.getData().containsKey("__ipAddress"));
        }

        @Test
        @DisplayName("Enum aspect overload skipped when disabled")
        void enumSkippedWhenDisabled() {
            when(auditConfig.isEnabled()).thenReturn(false);
            service = newService(true);

            service.audit(
                    "erin", "WEB", "1.2.3.4", AuditEventType.FILE_OPERATION, Map.of(),
                    AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }

        @Test
        @DisplayName("String aspect overload enriches with origin and ip")
        void stringWithIp() {
            enableAudit(AuditLevel.STANDARD);
            service = newService(true);

            service.audit(
                    "frank", "SYSTEM", "192.168.0.5", "CUSTOM", Map.of("p", "q"), AuditLevel.BASIC);

            AuditEvent event = captureSingleEvent();
            assertEquals("frank", event.getPrincipal());
            assertEquals("CUSTOM", event.getType());
            assertEquals("SYSTEM", event.getData().get("__origin"));
            assertEquals("192.168.0.5", event.getData().get("__ipAddress"));
        }

        @Test
        @DisplayName("String aspect overload skipped when not EE")
        void stringSkippedWhenNotEE() {
            enableAudit(AuditLevel.STANDARD);
            service = newService(false);

            service.audit("frank", "SYSTEM", "1.1.1.1", "CUSTOM", Map.of(), AuditLevel.BASIC);

            verifyNoInteractions(repository);
        }
    }

    // =====================================================================================
    // createBaseAuditData
    // =====================================================================================

    @Nested
    class CreateBaseAuditData {

        private ProceedingJoinPoint mockJoinPoint(Class<?> targetClass, String methodName) {
            ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
            MethodSignature sig = mock(MethodSignature.class);
            lenient().when(jp.getSignature()).thenReturn(sig);
            lenient().when(jp.getTarget()).thenReturn(mockTarget(targetClass));
            try {
                Method m = SampleController.class.getDeclaredMethod("sampleGet");
                lenient().when(sig.getMethod()).thenReturn(m);
            } catch (NoSuchMethodException e) {
                throw new RuntimeException(e);
            }
            return jp;
        }

        private Object mockTarget(Class<?> targetClass) {
            // Return an actual instance whose getClass() name is deterministic.
            return new SampleController();
        }

        @Test
        @DisplayName("BASIC level: timestamp + principal, no class/method")
        void basicLevel() {
            service = newService(true);
            ProceedingJoinPoint jp = mockJoinPoint(SampleController.class, "sampleGet");

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.BASIC);

            assertNotNull(data.get("timestamp"));
            assertEquals("system", data.get("principal"));
            assertFalse(data.containsKey("className"));
            assertFalse(data.containsKey("methodName"));
        }

        @Test
        @DisplayName("MDC auditPrincipal takes precedence over SecurityContext")
        void mdcPrincipalPreferred() {
            service = newService(true);
            MDC.put("auditPrincipal", "mdc-user");
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken("ctx-user", "p", List.of()));
            ProceedingJoinPoint jp = mockJoinPoint(SampleController.class, "sampleGet");

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.BASIC);

            assertEquals("mdc-user", data.get("principal"));
        }

        @Test
        @DisplayName("Falls back to SecurityContext name when MDC absent")
        void securityContextFallback() {
            service = newService(true);
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken("ctx-user", "p", List.of()));
            ProceedingJoinPoint jp = mockJoinPoint(SampleController.class, "sampleGet");

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.BASIC);

            assertEquals("ctx-user", data.get("principal"));
        }

        @Test
        @DisplayName("VERBOSE level adds className and methodName")
        void verboseAddsClassAndMethod() {
            service = newService(true);
            ProceedingJoinPoint jp = mockJoinPoint(SampleController.class, "sampleGet");

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.VERBOSE);

            assertEquals(SampleController.class.getName(), data.get("className"));
            assertEquals("sampleGet", data.get("methodName"));
        }
    }

    // =====================================================================================
    // addHttpData
    // =====================================================================================

    @Nested
    class AddHttpData {

        @Test
        @DisplayName("Returns early when method or path is null")
        void earlyReturnOnNulls() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, null, "/x", AuditLevel.STANDARD);
            service.addHttpData(data, "GET", null, AuditLevel.STANDARD);

            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("BASIC level records method and path only, even without request context")
        void basicMethodAndPath() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "GET", "/api/v1/thing", AuditLevel.BASIC);

            assertEquals("GET", data.get("httpMethod"));
            assertEquals("/api/v1/thing", data.get("path"));
            // No request context bound -> no clientIp at STANDARD anyway
            assertFalse(data.containsKey("clientIp"));
        }

        @Test
        @DisplayName("No-op for STANDARD data when no request attributes are bound")
        void noRequestContext() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "GET", "/p", AuditLevel.STANDARD);

            assertFalse(data.containsKey("clientIp"));
            assertFalse(data.containsKey("sessionId"));
        }

        @Test
        @DisplayName("STANDARD level adds clientIp, sessionId, requestId from bound request")
        void standardAddsRequestData() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/p");
            req.setRemoteAddr("9.9.9.9");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
            MDC.put("requestId", "req-123");
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "GET", "/p", AuditLevel.STANDARD);

            assertEquals("9.9.9.9", data.get("clientIp"));
            assertNull(data.get("sessionId"), "no session created -> null");
            assertEquals("req-123", data.get("requestId"));
        }

        @Test
        @DisplayName("Form params captured for POST urlencoded, _csrf removed")
        void formParamsCapturedAndCsrfRemoved() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/submit");
            req.setContentType("application/x-www-form-urlencoded");
            req.addParameter("field1", "value1");
            req.addParameter("_csrf", "secret-token");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "POST", "/submit", AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            Map<String, String[]> formParams = (Map<String, String[]>) data.get("formParams");
            assertNotNull(formParams);
            assertTrue(formParams.containsKey("field1"));
            assertFalse(formParams.containsKey("_csrf"), "_csrf must be stripped");
        }

        @Test
        @DisplayName("No formParams entry when only _csrf is present (empty after removal)")
        void formParamsEmptyWhenOnlyCsrf() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/submit");
            req.setContentType("multipart/form-data");
            req.addParameter("_csrf", "secret-token");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "POST", "/submit", AuditLevel.STANDARD);

            assertFalse(data.containsKey("formParams"));
        }

        @Test
        @DisplayName("No formParams for POST with non-form content type")
        void noFormParamsForJson() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/submit");
            req.setContentType("application/json");
            req.addParameter("field1", "value1");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "POST", "/submit", AuditLevel.STANDARD);

            assertFalse(data.containsKey("formParams"));
        }
    }

    // =====================================================================================
    // addFileData / addFileMetadata
    // =====================================================================================

    @Nested
    class AddFileData {

        private ProceedingJoinPoint jpWithArgs(Object... args) {
            ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
            lenient().when(jp.getArgs()).thenReturn(args);
            return jp;
        }

        @Test
        @DisplayName("Below STANDARD level: no file data collected")
        void belowStandardNoFiles() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();
            MultipartFile file = mock(MultipartFile.class);

            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.BASIC);

            assertFalse(data.containsKey("files"));
        }

        @Test
        @DisplayName("Direct MultipartFile argument is captured with name/size/type")
        void directMultipartFile() {
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);
            service = newService(true);

            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("a.pdf");
            when(file.getSize()).thenReturn(123L);
            when(file.getContentType()).thenReturn("application/pdf");
            Map<String, Object> data = new HashMap<>();

            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertEquals(1, files.size());
            assertEquals("a.pdf", files.get(0).get("name"));
            assertEquals(123L, files.get(0).get("size"));
            assertEquals("application/pdf", files.get(0).get("type"));
            assertFalse(files.get(0).containsKey("fileHash"));
        }

        @Test
        @DisplayName("MultipartFile[] and PDFFile arguments are all collected")
        void arrayAndPdfFileArgs() {
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);
            service = newService(true);

            MultipartFile f1 = mock(MultipartFile.class);
            MultipartFile f2 = mock(MultipartFile.class);
            MultipartFile inner = mock(MultipartFile.class);
            PDFFile pdfFile = new PDFFile();
            pdfFile.setFileInput(inner);
            // PDFFile with null fileInput should be ignored
            PDFFile emptyPdfFile = new PDFFile();

            Map<String, Object> data = new HashMap<>();
            service.addFileData(
                    data,
                    jpWithArgs(new MultipartFile[] {f1, f2}, pdfFile, emptyPdfFile, "ignored"),
                    AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertEquals(3, files.size(), "f1, f2 and pdfFile.fileInput");
        }

        @Test
        @DisplayName("No files entry when no file-like args present")
        void noFilesEntry() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addFileData(data, jpWithArgs("x", 1, null), AuditLevel.STANDARD);

            assertFalse(data.containsKey("files"));
        }

        @Test
        @DisplayName("captureFileHash computes SHA-256 hex digest")
        void capturesFileHash() throws Exception {
            when(auditConfig.isCaptureFileHash()).thenReturn(true);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);
            service = newService(true);

            byte[] content = "hello".getBytes();
            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("h.txt");
            when(file.getSize()).thenReturn((long) content.length);
            when(file.getContentType()).thenReturn("text/plain");
            when(file.getInputStream()).thenReturn(new ByteArrayInputStream(content));
            Map<String, Object> data = new HashMap<>();

            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            // SHA-256("hello") well-known value
            assertEquals(
                    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
                    files.get(0).get("fileHash"));
        }

        @Test
        @DisplayName("File hash failure (getInputStream throws) is swallowed, no fileHash key")
        void hashFailureSwallowed() throws Exception {
            when(auditConfig.isCaptureFileHash()).thenReturn(true);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);
            service = newService(true);

            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("boom.bin");
            when(file.getSize()).thenReturn(0L);
            when(file.getContentType()).thenReturn("application/octet-stream");
            when(file.getInputStream()).thenThrow(new java.io.IOException("stream boom"));
            Map<String, Object> data = new HashMap<>();

            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertFalse(files.get(0).containsKey("fileHash"));
        }

        @Test
        @DisplayName("capturePdfAuthor extracts author from a PDF via factory")
        void capturesPdfAuthor() throws Exception {
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(true);
            service = newService(true);

            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("doc.pdf");
            when(file.getSize()).thenReturn(10L);
            when(file.getContentType()).thenReturn("application/pdf");
            when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));

            PDDocument doc = mock(PDDocument.class);
            PDDocumentInformation info = new PDDocumentInformation();
            info.setAuthor("Jane Author");
            when(doc.getDocumentInformation()).thenReturn(info);
            when(pdfDocumentFactory.load(any(InputStream.class), eq(true))).thenReturn(doc);

            Map<String, Object> data = new HashMap<>();
            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertEquals("Jane Author", files.get(0).get("pdfAuthor"));
        }

        @Test
        @DisplayName("PDF author skipped for non-PDF content type")
        void pdfAuthorSkippedForNonPdf() throws Exception {
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(true);
            service = newService(true);

            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("notes.txt");
            when(file.getSize()).thenReturn(5L);
            when(file.getContentType()).thenReturn("text/plain");
            Map<String, Object> data = new HashMap<>();

            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertFalse(files.get(0).containsKey("pdfAuthor"));
            verify(pdfDocumentFactory, never()).load(any(InputStream.class), any(Boolean.class));
        }

        @Test
        @DisplayName("PDF author extraction failure is swallowed")
        void pdfAuthorFailureSwallowed() throws Exception {
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(true);
            service = newService(true);

            MultipartFile file = mock(MultipartFile.class);
            when(file.getOriginalFilename()).thenReturn("bad.pdf");
            when(file.getSize()).thenReturn(10L);
            when(file.getContentType()).thenReturn("application/pdf");
            when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {1}));
            when(pdfDocumentFactory.load(any(InputStream.class), eq(true)))
                    .thenThrow(new java.io.IOException("cannot parse"));

            Map<String, Object> data = new HashMap<>();
            service.addFileData(data, jpWithArgs((Object) file), AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertFalse(files.get(0).containsKey("pdfAuthor"));
        }
    }

    // =====================================================================================
    // addMethodArguments
    // =====================================================================================

    @Nested
    class AddMethodArguments {

        @Test
        @DisplayName("Below VERBOSE level: arguments not added")
        void belowVerbose() {
            service = newService(true);
            ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
            Map<String, Object> data = new HashMap<>();

            service.addMethodArguments(data, jp, AuditLevel.STANDARD);

            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("VERBOSE level adds arg_<name> entries with null support")
        void verboseAddsArgs() {
            service = newService(true);
            ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
            MethodSignature sig = mock(MethodSignature.class);
            when(jp.getSignature()).thenReturn(sig);
            when(sig.getParameterNames()).thenReturn(new String[] {"first", "second"});
            when(jp.getArgs()).thenReturn(new Object[] {"hello", null});
            Map<String, Object> data = new HashMap<>();

            service.addMethodArguments(data, jp, AuditLevel.VERBOSE);

            assertEquals("hello", data.get("arg_first"));
            assertTrue(data.containsKey("arg_second"));
            assertNull(data.get("arg_second"));
        }

        @Test
        @DisplayName("VERBOSE with null parameter names is a no-op")
        void verboseNullNames() {
            service = newService(true);
            ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
            MethodSignature sig = mock(MethodSignature.class);
            when(jp.getSignature()).thenReturn(sig);
            when(sig.getParameterNames()).thenReturn(null);
            when(jp.getArgs()).thenReturn(new Object[] {"x"});
            Map<String, Object> data = new HashMap<>();

            service.addMethodArguments(data, jp, AuditLevel.VERBOSE);

            assertTrue(data.isEmpty());
        }
    }

    // =====================================================================================
    // safeToString
    // =====================================================================================

    @Nested
    class SafeToString {

        @Test
        @DisplayName("null -> literal 'null'")
        void nullValue() {
            service = newService(true);
            assertEquals("null", service.safeToString(null, 100));
        }

        @Test
        @DisplayName("String passthrough")
        void stringPassthrough() {
            service = newService(true);
            assertEquals("hi", service.safeToString("hi", 100));
        }

        @Test
        @DisplayName("Number and Boolean use toString")
        void numberAndBoolean() {
            service = newService(true);
            assertEquals("42", service.safeToString(42, 100));
            assertEquals("true", service.safeToString(Boolean.TRUE, 100));
        }

        @Test
        @DisplayName("byte[] rendered as length summary")
        void byteArray() {
            service = newService(true);
            assertEquals("[binary data length=3]", service.safeToString(new byte[] {1, 2, 3}, 100));
        }

        @Test
        @DisplayName("Truncates long strings with ellipsis")
        void truncates() {
            service = newService(true);
            String result = service.safeToString("abcdefghij", 5);
            // truncate(value, maxLength-3) + "..." => "ab..."
            assertEquals("ab...", result);
        }

        @Test
        @DisplayName("toString() that throws is handled with class-name fallback")
        void toStringThrows() {
            service = newService(true);
            Object boom =
                    new Object() {
                        @Override
                        public String toString() {
                            throw new IllegalStateException("nope");
                        }
                    };

            String result = service.safeToString(boom, 100);
            assertTrue(result.endsWith("toString() failed]"));
            assertTrue(result.startsWith("["));
        }
    }

    // =====================================================================================
    // shouldAudit
    // =====================================================================================

    @Nested
    class ShouldAudit {

        @Test
        @DisplayName("false when not EE")
        void notEE() throws Exception {
            service = newService(false);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            assertFalse(service.shouldAudit(m, auditConfig));
            verify(auditConfig, never()).getAuditLevel();
        }

        @Test
        @DisplayName("false when audit disabled")
        void disabled() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(false);
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            assertFalse(service.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("Uses BASIC required level when no annotation present")
        void noAnnotationUsesBasic() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.BASIC);
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            assertTrue(service.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("Uses annotation level: VERBOSE required not met by STANDARD")
        void annotationLevelNotMet() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("verboseAnnotated");

            assertFalse(service.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("Uses annotation level: VERBOSE required met by VERBOSE")
        void annotationLevelMet() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("verboseAnnotated");

            assertTrue(service.shouldAudit(m, auditConfig));
        }
    }

    // =====================================================================================
    // addTimingData
    // =====================================================================================

    @Nested
    class AddTimingData {

        @Test
        @DisplayName("Below STANDARD: nothing added")
        void belowStandard() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addTimingData(data, 0L, null, AuditLevel.BASIC, false);

            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("Non-HTTP request adds latencyMs")
        void nonHttpAddsLatency() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();
            long start = System.currentTimeMillis() - 50;

            service.addTimingData(data, start, null, AuditLevel.STANDARD, false);

            assertTrue(data.containsKey("latencyMs"));
            assertTrue(((Long) data.get("latencyMs")) >= 0);
        }

        @Test
        @DisplayName("HTTP request omits latencyMs (handled elsewhere)")
        void httpOmitsLatency() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();

            service.addTimingData(data, 0L, null, AuditLevel.STANDARD, true);

            assertFalse(data.containsKey("latencyMs"));
        }

        @Test
        @DisplayName("Adds statusCode when response present")
        void addsStatusCode() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();
            HttpServletResponse response = mock(HttpServletResponse.class);
            when(response.getStatus()).thenReturn(204);

            service.addTimingData(data, 0L, response, AuditLevel.STANDARD, true);

            assertEquals(204, data.get("statusCode"));
        }

        @Test
        @DisplayName("statusCode read failure is swallowed")
        void statusCodeFailureSwallowed() {
            service = newService(true);
            Map<String, Object> data = new HashMap<>();
            HttpServletResponse response = mock(HttpServletResponse.class);
            when(response.getStatus()).thenThrow(new IllegalStateException("bad"));

            service.addTimingData(data, 0L, response, AuditLevel.STANDARD, true);

            assertFalse(data.containsKey("statusCode"));
        }
    }

    // =====================================================================================
    // resolveEventType
    // =====================================================================================

    @Nested
    class ResolveEventType {

        private Audited annotation(AuditEventType type) {
            Audited a = mock(Audited.class);
            lenient().when(a.type()).thenReturn(type);
            return a;
        }

        @Test
        @DisplayName("Explicit non-HTTP_REQUEST annotation type wins")
        void explicitAnnotation() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(
                            m, SampleController.class, "/x", "POST",
                            annotation(AuditEventType.USER_LOGIN));

            assertEquals(AuditEventType.USER_LOGIN, result);
        }

        @Test
        @DisplayName("GET on UI-data endpoint -> UI_DATA")
        void getUiData() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(
                            m, SampleController.class, "/api/v1/ui-data/x", "GET", null);

            assertEquals(AuditEventType.UI_DATA, result);
        }

        @Test
        @DisplayName("GET on non-UI endpoint -> HTTP_REQUEST")
        void getHttpRequest() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(
                            m, SampleController.class, "/api/v1/process", "GET", null);

            assertEquals(AuditEventType.HTTP_REQUEST, result);
        }

        @Test
        @DisplayName("POST to /user -> USER_PROFILE_UPDATE")
        void postUser() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(m, SampleController.class, "/user/x", "POST", null);

            assertEquals(AuditEventType.USER_PROFILE_UPDATE, result);
        }

        @Test
        @DisplayName("POST to /admin -> SETTINGS_CHANGED")
        void postAdmin() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(m, SampleController.class, "/admin/x", "POST", null);

            assertEquals(AuditEventType.SETTINGS_CHANGED, result);
        }

        @Test
        @DisplayName("POST to /file -> FILE_OPERATION")
        void postFile() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(m, SampleController.class, "/file/x", "POST", null);

            assertEquals(AuditEventType.FILE_OPERATION, result);
        }

        @Test
        @DisplayName("POST to upload/download path matches FILE_OPERATION via regex")
        void postUploadRegex() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(
                            m, SampleController.class, "/x/upload/y", "POST", null);

            assertEquals(AuditEventType.FILE_OPERATION, result);
        }

        @Test
        @DisplayName("Unmatched POST path -> PDF_PROCESS default")
        void postDefault() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(m, SampleController.class, "/random", "POST", null);

            assertEquals(AuditEventType.PDF_PROCESS, result);
        }

        @Test
        @DisplayName("Non-HTTP (null httpMethod/path) -> PDF_PROCESS")
        void nonHttpDefault() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(m, SampleController.class, null, null, null);

            assertEquals(AuditEventType.PDF_PROCESS, result);
        }

        @Test
        @DisplayName("Annotation of HTTP_REQUEST is treated as no explicit override")
        void annotationHttpRequestFallsThrough() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType result =
                    service.resolveEventType(
                            m,
                            SampleController.class,
                            "/admin/x",
                            "POST",
                            annotation(AuditEventType.HTTP_REQUEST));

            assertEquals(AuditEventType.SETTINGS_CHANGED, result);
        }
    }

    // =====================================================================================
    // getEffectiveAuditLevel & determineAuditEventType
    // =====================================================================================

    @Nested
    class LevelAndTypeResolution {

        @Test
        @DisplayName("getEffectiveAuditLevel returns annotation level when present")
        void effectiveLevelFromAnnotation() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("verboseAnnotated");

            AuditLevel level =
                    service.getEffectiveAuditLevel(m, AuditLevel.BASIC, auditConfig);

            assertEquals(AuditLevel.VERBOSE, level);
        }

        @Test
        @DisplayName("getEffectiveAuditLevel returns default when no annotation")
        void effectiveLevelDefault() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditLevel level =
                    service.getEffectiveAuditLevel(m, AuditLevel.STANDARD, auditConfig);

            assertEquals(AuditLevel.STANDARD, level);
        }

        @Test
        @DisplayName("determineAuditEventType returns annotation type when present")
        void determineFromAnnotation() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("verboseAnnotated");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/x", "POST");

            // verboseAnnotated has default type HTTP_REQUEST
            assertEquals(AuditEventType.HTTP_REQUEST, type);
        }

        @Test
        @DisplayName("determineAuditEventType GET -> HTTP_REQUEST")
        void determineGet() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/x", "GET");

            assertEquals(AuditEventType.HTTP_REQUEST, type);
        }

        @Test
        @DisplayName("determineAuditEventType POST /user -> USER_PROFILE_UPDATE")
        void determineUser() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/user/x", "POST");

            assertEquals(AuditEventType.USER_PROFILE_UPDATE, type);
        }

        @Test
        @DisplayName("determineAuditEventType POST /admin -> SETTINGS_CHANGED")
        void determineAdmin() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/admin/x", "POST");

            assertEquals(AuditEventType.SETTINGS_CHANGED, type);
        }

        @Test
        @DisplayName("determineAuditEventType POST /file -> FILE_OPERATION")
        void determineFile() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/file/x", "POST");

            assertEquals(AuditEventType.FILE_OPERATION, type);
        }

        @Test
        @DisplayName("determineAuditEventType unmatched POST -> PDF_PROCESS")
        void determineDefault() throws Exception {
            service = newService(true);
            Method m = SampleController.class.getDeclaredMethod("sampleGet");

            AuditEventType type =
                    service.determineAuditEventType(m, SampleController.class, "/random", "POST");

            assertEquals(AuditEventType.PDF_PROCESS, type);
        }
    }

    // =====================================================================================
    // getCurrentRequest / isStaticResourceRequest / isPollingCall / shouldCaptureOperationResults
    // =====================================================================================

    @Nested
    class RequestHelpers {

        @Test
        @DisplayName("getCurrentRequest returns null with no bound context")
        void currentRequestNull() {
            service = newService(true);
            assertNull(service.getCurrentRequest());
        }

        @Test
        @DisplayName("getCurrentRequest returns bound request")
        void currentRequestBound() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/a");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            assertSame(req, service.getCurrentRequest());
        }

        @Test
        @DisplayName("isStaticResourceRequest: null request -> false")
        void staticNull() {
            service = newService(true);
            assertFalse(service.isStaticResourceRequest(null));
        }

        @Test
        @DisplayName("isStaticResourceRequest: .png URI is static (not trackable) -> true")
        void staticPng() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/x.png");
            req.setRequestURI("/x.png");
            assertTrue(service.isStaticResourceRequest(req));
        }

        @Test
        @DisplayName("isStaticResourceRequest: trackable API path -> false")
        void staticApiFalse() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/process");
            req.setRequestURI("/api/v1/process");
            assertFalse(service.isStaticResourceRequest(req));
        }

        @Test
        @DisplayName("isPollingCall: null request -> false")
        void pollingNull() {
            service = newService(true);
            assertFalse(service.isPollingCall(null));
        }

        @Test
        @DisplayName("isPollingCall: non-GET -> false")
        void pollingNonGet() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/health");
            req.setRequestURI("/health");
            assertFalse(service.isPollingCall(req));
        }

        @Test
        @DisplayName("isPollingCall: exact polling path -> true")
        void pollingExactPath() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
            req.setRequestURI("/api/v1/auth/me");
            assertTrue(service.isPollingCall(req));
        }

        @Test
        @DisplayName("isPollingCall: health prefix -> true")
        void pollingHealthPrefix() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/actuator/health/db");
            req.setRequestURI("/actuator/health/db");
            assertTrue(service.isPollingCall(req));
        }

        @Test
        @DisplayName("isPollingCall: unrelated GET path -> false")
        void pollingUnrelated() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/things");
            req.setRequestURI("/api/v1/things");
            assertFalse(service.isPollingCall(req));
        }

        @Test
        @DisplayName("shouldCaptureOperationResults reflects config flag")
        void captureOperationResults() {
            when(auditConfig.isCaptureOperationResults()).thenReturn(true);
            service = newService(true);
            assertTrue(service.shouldCaptureOperationResults());
        }
    }

    // =====================================================================================
    // extractClientIp
    // =====================================================================================

    @Nested
    class ExtractClientIp {

        @Test
        @DisplayName("null request -> null")
        void nullRequest() {
            service = newService(true);
            assertNull(service.extractClientIp(null));
        }

        @Test
        @DisplayName("X-Forwarded-For first IP preferred and trimmed")
        void forwardedFor() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.addHeader("X-Forwarded-For", " 203.0.113.1 , 70.41.3.18");
            req.setRemoteAddr("10.0.0.1");

            assertEquals("203.0.113.1", service.extractClientIp(req));
        }

        @Test
        @DisplayName("X-Real-IP used when no X-Forwarded-For")
        void realIp() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.addHeader("X-Real-IP", "198.51.100.7");
            req.setRemoteAddr("10.0.0.1");

            assertEquals("198.51.100.7", service.extractClientIp(req));
        }

        @Test
        @DisplayName("Falls back to remote address")
        void remoteAddrFallback() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setRemoteAddr("10.0.0.42");

            assertEquals("10.0.0.42", service.extractClientIp(req));
        }
    }

    // =====================================================================================
    // captureCurrentPrincipal / captureCurrentOrigin + refresh-token attribution
    // =====================================================================================

    @Nested
    class PrincipalAndOriginCapture {

        @Test
        @DisplayName("captureCurrentPrincipal returns 'system' with no auth/request")
        void principalSystem() {
            service = newService(true);
            assertEquals("system", service.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal returns authenticated name")
        void principalAuthenticated() {
            service = newService(true);
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken("zoe", "p", List.of()));

            assertEquals("zoe", service.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal ignores anonymousUser, falls to refresh-token subject")
        void principalFromRefreshToken() {
            service = newService(true);
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "anonymousUser", "p", List.of()));
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
            when(jwtService.extractUsernameAllowExpired("tok")).thenReturn("refresh-user");

            assertEquals("refresh-user", service.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal: refresh token extraction throws -> 'system'")
        void principalRefreshThrows() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
            when(jwtService.extractUsernameAllowExpired("tok"))
                    .thenThrow(new RuntimeException("bad token"));

            assertEquals("system", service.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal: blank refresh token -> 'system'")
        void principalBlankToken() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("  ");

            assertEquals("system", service.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentOrigin: SYSTEM with no auth")
        void originSystem() {
            service = newService(true);
            assertEquals("SYSTEM", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: API for ApiKeyAuthenticationToken")
        void originApi() {
            service = newService(true);
            SecurityContextHolder.getContext()
                    .setAuthentication(new ApiKeyAuthenticationToken("key"));

            assertEquals("API", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: WEB for authenticated user")
        void originWeb() {
            service = newService(true);
            Authentication auth =
                    new UsernamePasswordAuthenticationToken("u", "p", List.of());
            SecurityContextHolder.getContext().setAuthentication(auth);

            assertEquals("WEB", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: refresh endpoint with API authType -> API")
        void originRefreshApi() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
            when(jwtService.extractClaimsAllowExpired("tok"))
                    .thenReturn(Map.of("authType", "API"));

            assertEquals("API", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: refresh endpoint non-API claim -> WEB")
        void originRefreshWeb() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
            when(jwtService.extractClaimsAllowExpired("tok"))
                    .thenReturn(Map.of("authType", "WEB"));

            assertEquals("WEB", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: refresh claims extraction throws -> SYSTEM")
        void originRefreshThrowsSystem() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
            when(jwtService.extractClaimsAllowExpired("tok"))
                    .thenThrow(new RuntimeException("bad"));

            // extractRefreshTokenOrigin returns null -> determineOrigin returns SYSTEM
            assertEquals("SYSTEM", service.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin: refresh endpoint with blank token -> SYSTEM")
        void originRefreshBlankToken() {
            service = newService(true);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            req.setRequestURI("/api/v1/auth/refresh");
            RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

            when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("");

            assertEquals("SYSTEM", service.captureCurrentOrigin());
        }
    }

    // =====================================================================================
    // Integration: audit() through getCurrentUsername()/determineOrigin() refresh path
    // =====================================================================================

    @Test
    @DisplayName("audit(type,data) uses refresh-token subject as principal on refresh endpoint")
    void auditUsesRefreshTokenSubject() {
        enableAudit(AuditLevel.STANDARD);
        service = newService(true);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
        req.setRequestURI("/api/v1/auth/refresh");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));

        when(jwtService.extractToken(any(HttpServletRequest.class))).thenReturn("tok");
        when(jwtService.extractUsernameAllowExpired("tok")).thenReturn("refresh-bob");
        when(jwtService.extractClaimsAllowExpired("tok")).thenReturn(Map.of("authType", "API"));

        service.audit(AuditEventType.USER_LOGIN, new HashMap<>());

        AuditEvent event = captureSingleEvent();
        assertEquals("refresh-bob", event.getPrincipal());
        assertEquals("API", event.getData().get("__origin"));
        assertInstanceOf(String.class, event.getData().get("__origin"));
    }

    // =====================================================================================
    // Test fixtures
    // =====================================================================================

    /** A controller-like fixture providing methods with and without @Audited for reflection. */
    static class SampleController {

        public void sampleGet() {}

        @Audited(level = AuditLevel.VERBOSE)
        public void verboseAnnotated() {}
    }
}
