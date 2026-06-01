package stirling.software.proprietary.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Unit tests for {@link AuditAspect#auditMethod(ProceedingJoinPoint)}.
 *
 * <p>The aspect's collaborators ({@link AuditService} and {@link AuditConfigurationProperties}) are
 * Mockito mocks; the {@link ProceedingJoinPoint} / {@link MethodSignature} are also mocked. Real
 * {@code @Audited}-annotated fixture methods on this test class are returned from the mocked
 * signature so {@code method.getAnnotation(Audited.class)} resolves to genuine annotation values.
 *
 * <p>The HTTP-context branches are exercised by binding a {@link ServletRequestAttributes} (built
 * from Spring's mock servlet request/response) into the {@link RequestContextHolder} for the
 * current thread. No Spring application context, database, network, or real file IO is involved.
 *
 * <p>Assumption to verify: the production code uses the six-arg {@code audit(principal, origin, ip,
 * type, data, level)} overloads (enum and String flavours); these tests verify the aspect dispatches
 * to the correct overload but do not re-test {@code AuditService}'s own enabled/EE gating.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuditAspectTest {

    @Mock private AuditService auditService;
    @Mock private AuditConfigurationProperties auditConfig;
    @Mock private ProceedingJoinPoint joinPoint;
    @Mock private MethodSignature signature;

    private AuditAspect aspect;

    @BeforeEach
    void setUp() {
        aspect = new AuditAspect(auditService, auditConfig);
        MDC.clear();
        RequestContextHolder.resetRequestAttributes();
        when(joinPoint.getSignature()).thenReturn(signature);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
        RequestContextHolder.resetRequestAttributes();
    }

    // ====================================================================
    // Fixture methods carrying real @Audited annotations.
    // ====================================================================

    @Audited(type = AuditEventType.PDF_PROCESS, level = AuditLevel.STANDARD)
    public void defaultEnumPdfProcess() {}

    @Audited(level = AuditLevel.STANDARD) // type defaults to HTTP_REQUEST, typeString empty
    public void httpRequestNoStringType() {}

    @Audited(
            typeString = "CUSTOM_EVENT",
            level = AuditLevel.STANDARD) // type defaults to HTTP_REQUEST + non-empty typeString
    public void httpRequestWithStringType() {}

    @Audited(
            type = AuditEventType.PDF_PROCESS,
            level = AuditLevel.STANDARD,
            includeResult = true,
            includeArgs = true)
    public void includeResultAndArgs() {}

    @Audited(
            type = AuditEventType.PDF_PROCESS,
            level = AuditLevel.STANDARD,
            includeResult = true,
            includeArgs = false)
    public void includeResultNoArgs() {}

    private Method method(String name) {
        try {
            return AuditAspectTest.class.getMethod(name);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Wire the mocked signature to return the given fixture method. */
    private void useMethod(String name) {
        when(signature.getMethod()).thenReturn(method(name));
    }

    private void bindRequestContext(MockHttpServletRequest req, MockHttpServletResponse resp) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req, resp));
    }

    // ====================================================================
    // Fast path: auditing disabled.
    // ====================================================================

    @Test
    @DisplayName("Disabled fast-path: just proceeds and collects no audit data")
    void disabled_fastPath_proceedsOnly() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Object expected = new Object();
        when(joinPoint.proceed()).thenReturn(expected);
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);

        Object result = aspect.auditMethod(joinPoint);

        assertSame(expected, result);
        verify(joinPoint, times(1)).proceed();
        // No data collection / capture / audit when disabled.
        verify(auditService).shouldAudit(any(Method.class), eq(auditConfig));
        verify(auditService, never()).createBaseAuditData(any(), any());
        verify(auditService, never()).captureCurrentPrincipal();
        verify(auditService, never())
                .audit(
                        any(String.class),
                        any(String.class),
                        any(),
                        any(AuditEventType.class),
                        any(),
                        any(AuditLevel.class));
    }

    @Test
    @DisplayName("Disabled fast-path still propagates the proceed() exception")
    void disabled_fastPath_propagatesException() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        RuntimeException boom = new RuntimeException("boom");
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);
        when(joinPoint.proceed()).thenThrow(boom);

        RuntimeException thrown =
                assertThrows(RuntimeException.class, () -> aspect.auditMethod(joinPoint));
        assertSame(boom, thrown);
        verify(auditService, never()).createBaseAuditData(any(), any());
    }

    // ====================================================================
    // Enabled, non-HTTP context, success path.
    // ====================================================================

    @Test
    @DisplayName("Enabled non-HTTP success: captures via service, records success + enum audit")
    void enabled_nonHttp_success_enumType() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Map<String, Object> data = new HashMap<>();
        Object expected = "ok";

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn(null); // no request
        when(joinPoint.proceed()).thenReturn(expected);
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditMethod(joinPoint);

        assertSame(expected, result);
        assertEquals("success", data.get("status"));

        // No HTTP context => addHttpData / addFileData not invoked.
        verify(auditService, never()).addHttpData(any(), any(), any(), any());
        verify(auditService, never()).addFileData(any(), any(), any());

        // includeArgs default true => method args captured.
        verify(auditService).addMethodArguments(eq(data), eq(joinPoint), eq(AuditLevel.STANDARD));

        // Timing recorded with isHttpRequest=false and null response.
        verify(auditService)
                .addTimingData(eq(data), anyLong(), eq(null), eq(AuditLevel.STANDARD), eq(false));

        // Enum overload used (HTTP_REQUEST? no -> still enum because typeString empty AND eventType
        // is PDF_PROCESS, not HTTP_REQUEST).
        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.PDF_PROCESS, data, AuditLevel.STANDARD);
        verify(auditService, never())
                .audit(
                        any(String.class),
                        any(String.class),
                        any(),
                        any(String.class),
                        any(),
                        any(AuditLevel.class));
    }

    @Test
    @DisplayName("includeResult true + capture enabled + non-null result stores stringified result")
    void enabled_includeResult_capturesResult() throws Throwable {
        useMethod("includeResultNoArgs");
        Map<String, Object> data = new HashMap<>();
        Object expected = new Object();

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("bob");
        when(auditService.captureCurrentOrigin()).thenReturn("API");
        when(joinPoint.proceed()).thenReturn(expected);
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.shouldCaptureOperationResults()).thenReturn(true);
        when(auditService.safeToString(expected, 1000)).thenReturn("STRINGIFIED");
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditMethod(joinPoint);

        assertEquals("success", data.get("status"));
        assertEquals("STRINGIFIED", data.get("result"));
        verify(auditService).safeToString(expected, 1000);
        // includeArgs=false on this fixture => method args NOT captured.
        verify(auditService, never()).addMethodArguments(any(), any(), any());
    }

    @Test
    @DisplayName("includeResult true but capture flag OFF leaves result unset")
    void enabled_includeResult_butCaptureDisabled_noResult() throws Throwable {
        useMethod("includeResultAndArgs");
        Map<String, Object> data = new HashMap<>();

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("bob");
        when(auditService.captureCurrentOrigin()).thenReturn("API");
        when(joinPoint.proceed()).thenReturn("value");
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.shouldCaptureOperationResults()).thenReturn(false);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditMethod(joinPoint);

        assertNull(data.get("result"));
        verify(auditService, never()).safeToString(any(), anyInt());
        // includeArgs=true here => args captured.
        verify(auditService).addMethodArguments(eq(data), eq(joinPoint), eq(AuditLevel.STANDARD));
    }

    @Test
    @DisplayName("includeResult true with null result does not store result key")
    void enabled_includeResult_nullResult_noResult() throws Throwable {
        useMethod("includeResultNoArgs");
        Map<String, Object> data = new HashMap<>();

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("bob");
        when(auditService.captureCurrentOrigin()).thenReturn("API");
        when(joinPoint.proceed()).thenReturn(null);
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.shouldCaptureOperationResults()).thenReturn(true);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditMethod(joinPoint);

        assertNull(result);
        assertEquals("success", data.get("status"));
        assertNull(data.get("result"));
        verify(auditService, never()).safeToString(any(), anyInt());
    }

    // ====================================================================
    // Enabled, failure path.
    // ====================================================================

    @Test
    @DisplayName("Failure path records failure status + error metadata and re-throws")
    void enabled_failure_recordsErrorAndRethrows() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Map<String, Object> data = new HashMap<>();
        IllegalStateException boom = new IllegalStateException("kapow");

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenThrow(boom);
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        IllegalStateException thrown =
                assertThrows(IllegalStateException.class, () -> aspect.auditMethod(joinPoint));
        assertSame(boom, thrown);

        assertEquals("failure", data.get("status"));
        assertEquals(IllegalStateException.class.getName(), data.get("errorType"));
        assertEquals("kapow", data.get("errorMessage"));

        // The finally block still audits even on failure.
        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.PDF_PROCESS, data, AuditLevel.STANDARD);
        // Result never captured on failure.
        verify(auditService, never()).safeToString(any(), anyInt());
    }

    @Test
    @DisplayName("Failure with null message stores null errorMessage")
    void enabled_failure_nullMessage() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Map<String, Object> data = new HashMap<>();
        RuntimeException boom = new RuntimeException(); // null message

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenThrow(boom);
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        assertThrows(RuntimeException.class, () -> aspect.auditMethod(joinPoint));

        assertEquals("failure", data.get("status"));
        assertEquals(RuntimeException.class.getName(), data.get("errorType"));
        assertNull(data.get("errorMessage"));
    }

    // ====================================================================
    // MDC-based early capture (skips service capture fallback).
    // ====================================================================

    @Test
    @DisplayName("MDC values are preferred over service capture for principal/origin/ip")
    void enabled_mdcCapture_preferredOverService() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Map<String, Object> data = new HashMap<>();

        MDC.put("auditPrincipal", "mdcUser");
        MDC.put("auditOrigin", "SYSTEM");
        MDC.put("auditIp", "10.0.0.9");

        stubEnabledCommon(data);
        when(joinPoint.proceed()).thenReturn("ok");
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditMethod(joinPoint);

        // Service-based fallbacks must NOT be consulted when MDC has the values.
        verify(auditService, never()).captureCurrentPrincipal();
        verify(auditService, never()).captureCurrentOrigin();
        verify(auditService, never()).extractClientIp(any());

        verify(auditService)
                .audit(
                        "mdcUser",
                        "SYSTEM",
                        "10.0.0.9",
                        AuditEventType.PDF_PROCESS,
                        data,
                        AuditLevel.STANDARD);
    }

    // ====================================================================
    // Enabled, HTTP context.
    // ====================================================================

    @Test
    @DisplayName("HTTP context: adds http+file data and resolves event type with path/method")
    void enabled_httpContext_addsHttpAndFileData() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        Map<String, Object> data = new HashMap<>();

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/merge");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        resp.setStatus(200);
        bindRequestContext(req, resp);

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("ok");
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), eq("/api/v1/general/merge"), eq("POST"), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditMethod(joinPoint);

        verify(auditService).addHttpData(data, "POST", "/api/v1/general/merge", AuditLevel.STANDARD);
        verify(auditService).addFileData(data, joinPoint, AuditLevel.STANDARD);

        // Timing uses the response from the bound attributes and isHttpRequest=true.
        verify(auditService)
                .addTimingData(eq(data), anyLong(), eq(resp), eq(AuditLevel.STANDARD), eq(true));

        verify(auditService)
                .audit(
                        "alice",
                        "WEB",
                        "1.2.3.4",
                        AuditEventType.PDF_PROCESS,
                        data,
                        AuditLevel.STANDARD);
    }

    @Test
    @DisplayName("HTTP context with 'files' key triggers debug logging branch without error")
    void enabled_httpContext_filesKey_logsDebug() throws Throwable {
        useMethod("defaultEnumPdfProcess");
        // Pre-seed the data map so the containsKey("files") branch is taken.
        Map<String, Object> data = new HashMap<>();
        data.put("files", "f.pdf");
        data.put("fileHash", "abc123");

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/file/upload");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        bindRequestContext(req, resp);

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("ok");
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.FILE_OPERATION);

        aspect.auditMethod(joinPoint);

        verify(auditService).addHttpData(data, "POST", "/file/upload", AuditLevel.STANDARD);
        verify(auditService)
                .audit(
                        "alice",
                        "WEB",
                        "1.2.3.4",
                        AuditEventType.FILE_OPERATION,
                        data,
                        AuditLevel.STANDARD);
    }

    // ====================================================================
    // String-type dispatch (HTTP_REQUEST eventType + non-empty typeString).
    // ====================================================================

    @Test
    @DisplayName("HTTP_REQUEST eventType with non-empty typeString uses String audit overload")
    void enabled_stringTypeOverload() throws Throwable {
        useMethod("httpRequestWithStringType");
        Map<String, Object> data = new HashMap<>();

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("ok");
        when(joinPoint.getTarget()).thenReturn(this);
        // resolveEventType returns HTTP_REQUEST -> with non-empty typeString -> String overload.
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.HTTP_REQUEST);

        aspect.auditMethod(joinPoint);

        verify(auditService)
                .audit("alice", "WEB", null, "CUSTOM_EVENT", data, AuditLevel.STANDARD);
        // Enum overload NOT used in this branch.
        verify(auditService, never())
                .audit(
                        any(String.class),
                        any(String.class),
                        any(),
                        any(AuditEventType.class),
                        any(),
                        any(AuditLevel.class));
    }

    @Test
    @DisplayName("HTTP_REQUEST eventType with EMPTY typeString falls back to enum overload")
    void enabled_httpRequestEmptyTypeString_usesEnumOverload() throws Throwable {
        useMethod("httpRequestNoStringType");
        Map<String, Object> data = new HashMap<>();

        stubEnabledCommon(data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("ok");
        when(joinPoint.getTarget()).thenReturn(this);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.HTTP_REQUEST);

        aspect.auditMethod(joinPoint);

        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.HTTP_REQUEST, data, AuditLevel.STANDARD);
        verify(auditService, never())
                .audit(
                        any(String.class),
                        any(String.class),
                        any(),
                        any(String.class),
                        any(),
                        any(AuditLevel.class));
    }

    // ====================================================================
    // Helper: common stubs for the "enabled" branch.
    // ====================================================================

    private void stubEnabledCommon(Map<String, Object> data) {
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditService.createBaseAuditData(eq(joinPoint), eq(AuditLevel.STANDARD)))
                .thenReturn(data);
    }
}
