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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Unit tests for {@link ControllerAuditAspect}.
 *
 * <p>The aspect's collaborators ({@link AuditService} and {@link AuditConfigurationProperties}) are
 * Mockito mocks; the {@link ProceedingJoinPoint} / {@link MethodSignature} are also mocked. Real
 * fixture methods declared on this test class (some carrying genuine {@code @Audited} /
 * {@code @GetMapping} / {@code @PostMapping} annotations) are returned from the mocked signature so
 * reflective annotation lookups inside the aspect resolve to real annotation values.
 *
 * <p>HTTP-context branches are exercised by binding a {@link ServletRequestAttributes} (built from
 * Spring's mock servlet request/response) into the {@link RequestContextHolder} for the current
 * thread. No Spring application context, database, network, or real file IO is involved.
 *
 * <p>Assumptions to verify:
 *
 * <ul>
 *   <li>The aspect only ever dispatches to the six-arg enum {@code audit(principal, origin, ip,
 *       AuditEventType, data, level)} overload: the {@code @Audited}-present branch returns early
 *       (line ~161) before any {@code audit(...)} call, so the String-type overload path
 *       (lines ~218-238) is unreachable from this aspect and is intentionally not asserted as
 *       reached.
 *   <li>{@code getRequestPath} prefers the bound request URI; only when no request context exists
 *       does it reconstruct the path from {@code @RequestMapping} + mapping annotations.
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ControllerAuditAspectTest {

    @Mock private AuditService auditService;
    @Mock private AuditConfigurationProperties auditConfig;
    @Mock private ProceedingJoinPoint joinPoint;
    @Mock private MethodSignature signature;

    private ControllerAuditAspect aspect;

    @BeforeEach
    void setUp() {
        aspect = new ControllerAuditAspect(auditService, auditConfig);
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
    // Fixture methods (some carry real annotations resolved via reflection).
    // ====================================================================

    public void plainController() {}

    @Audited(type = AuditEventType.PDF_PROCESS, level = AuditLevel.STANDARD)
    public void annotatedController() {}

    @RequestMapping("/base")
    static class AnnotatedFixtures {
        @GetMapping("/get-path")
        public void getMapped() {}

        @PostMapping("/post-path")
        public void postMapped() {}
    }

    @AutoJobPostMapping
    public void autoJob() {}

    private Method method(String name) {
        try {
            return ControllerAuditAspectTest.class.getMethod(name);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }

    private Method fixtureMethod(Class<?> declaring, String name) {
        try {
            return declaring.getMethod(name);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }

    private void useMethod(String name) {
        when(signature.getMethod()).thenReturn(method(name));
    }

    private void bindRequestContext(MockHttpServletRequest req, MockHttpServletResponse resp) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req, resp));
    }

    /** Common stubs for the "enabled, not annotated" success branch. */
    private void stubEnabled(AuditLevel level, Map<String, Object> data) {
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(level);
        when(auditService.createBaseAuditData(eq(joinPoint), eq(level))).thenReturn(data);
        when(joinPoint.getTarget()).thenReturn(this);
    }

    // ====================================================================
    // Fast path: auditing disabled.
    // ====================================================================

    @Test
    @DisplayName("Disabled fast-path: proceeds, no capture, no audit")
    void disabled_fastPath_proceedsOnly() throws Throwable {
        useMethod("plainController");
        Object expected = new Object();
        when(joinPoint.proceed()).thenReturn(expected);
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);

        Object result = aspect.auditGetMethod(joinPoint);

        assertSame(expected, result);
        verify(joinPoint, times(1)).proceed();
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
        useMethod("plainController");
        RuntimeException boom = new RuntimeException("boom");
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);
        when(joinPoint.proceed()).thenThrow(boom);

        RuntimeException thrown =
                assertThrows(RuntimeException.class, () -> aspect.auditPostMethod(joinPoint));
        assertSame(boom, thrown);
        verify(auditService, never()).createBaseAuditData(any(), any());
    }

    // ====================================================================
    // @Audited present: aspect captures MDC then proceeds WITHOUT auditing
    // (annotated methods are handled by AuditAspect to avoid duplicates).
    // ====================================================================

    @Test
    @DisplayName("@Audited method: captures principal/origin/ip into MDC, proceeds, no audit call")
    void annotated_capturesMdc_thenProceedsWithoutAudit() throws Throwable {
        useMethod("annotatedController");
        Object expected = "annotated-ok";
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
        when(auditService.captureCurrentPrincipal()).thenReturn("carol");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn(expected);

        Object result = aspect.auditPostMethod(joinPoint);

        assertSame(expected, result);
        // Early capture happened.
        verify(auditService).captureCurrentPrincipal();
        verify(auditService).captureCurrentOrigin();
        // But no data collection nor audit dispatch for annotated methods.
        verify(auditService, never()).createBaseAuditData(any(), any());
        verify(auditService, never()).addHttpData(any(), any(), any(), any());
        verify(auditService, never())
                .audit(any(), any(), any(), any(AuditEventType.class), any(), any());
        // MDC restored (previous values were null -> removed).
        assertNull(MDC.get("auditPrincipal"));
        assertNull(MDC.get("auditOrigin"));
    }

    @Test
    @DisplayName("@Audited GET still proceeds without audit even with bound HTTP context")
    void annotated_get_withHttpContext_noAudit() throws Throwable {
        useMethod("annotatedController");
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        bindRequestContext(req, resp);

        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(false);
        when(auditService.isPollingCall(req)).thenReturn(false);
        when(auditService.captureCurrentPrincipal()).thenReturn("carol");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("9.9.9.9");
        when(joinPoint.proceed()).thenReturn("ok");

        Object result = aspect.auditGetMethod(joinPoint);

        assertEquals("ok", result);
        verify(auditService, never()).createBaseAuditData(any(), any());
        verify(auditService, never())
                .audit(any(), any(), any(), any(AuditEventType.class), any(), any());
    }

    // ====================================================================
    // GET skip branches: static resource and polling-at-STANDARD.
    // ====================================================================

    @Test
    @DisplayName("GET static resource: short-circuits to proceed with no audit")
    void get_staticResource_skips() throws Throwable {
        useMethod("plainController");
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/css/app.css");
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(true);
        when(joinPoint.proceed()).thenReturn("static");

        Object result = aspect.auditGetMethod(joinPoint);

        assertEquals("static", result);
        verify(auditService, never()).createBaseAuditData(any(), any());
        verify(auditService, never())
                .audit(any(), any(), any(), any(AuditEventType.class), any(), any());
    }

    @Test
    @DisplayName("GET polling call at STANDARD level: short-circuits to proceed with no audit")
    void get_pollingAtStandard_skips() throws Throwable {
        useMethod("plainController");
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(false);
        when(auditService.isPollingCall(req)).thenReturn(true);
        when(joinPoint.proceed()).thenReturn("polled");

        Object result = aspect.auditGetMethod(joinPoint);

        assertEquals("polled", result);
        verify(auditService, never()).createBaseAuditData(any(), any());
        verify(auditService, never())
                .audit(any(), any(), any(), any(AuditEventType.class), any(), any());
    }

    @Test
    @DisplayName("GET polling call at VERBOSE level is NOT skipped (still audited)")
    void get_pollingAtVerbose_notSkipped() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        resp.setStatus(200);
        bindRequestContext(req, resp);

        stubEnabled(AuditLevel.VERBOSE, data);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(false);
        when(auditService.isPollingCall(req)).thenReturn(true); // polling, but VERBOSE != STANDARD
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.UI_DATA);

        Object result = aspect.auditGetMethod(joinPoint);

        assertEquals("ok", result);
        // VERBOSE includes VERBOSE -> method arguments captured.
        verify(auditService).addMethodArguments(eq(data), eq(joinPoint), eq(AuditLevel.VERBOSE));
        verify(auditService)
                .audit("alice", "WEB", "1.2.3.4", AuditEventType.UI_DATA, data, AuditLevel.VERBOSE);
    }

    // ====================================================================
    // Enabled, non-HTTP context (no bound request), success path.
    // ====================================================================

    @Test
    @DisplayName("POST non-HTTP success: enum audit, no http/file data, timing isHttpRequest=true")
    void post_nonHttp_success_enumAudit() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();
        Object expected = "result";

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn(expected);
        when(auditService.resolveEventType(any(), any(), any(), eq("POST"), eq(null)))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditPostMethod(joinPoint);

        assertSame(expected, result);
        assertEquals("success", data.get("outcome"));
        // No bound request => addHttpData/addFileData are still called by the aspect; but path
        // comes from annotation reconstruction (empty here). The aspect always calls them.
        verify(auditService).addHttpData(eq(data), eq("POST"), any(), eq(AuditLevel.STANDARD));
        verify(auditService).addFileData(eq(data), eq(joinPoint), eq(AuditLevel.STANDARD));
        // STANDARD does NOT include VERBOSE -> no method args.
        verify(auditService, never()).addMethodArguments(any(), any(), any());
        // resp is null (no request context).
        verify(auditService)
                .addTimingData(eq(data), anyLong(), eq(null), eq(AuditLevel.STANDARD), eq(true));
        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.PDF_PROCESS, data, AuditLevel.STANDARD);
        // latencyMs added by the aspect directly (STANDARD includes STANDARD).
        org.junit.jupiter.api.Assertions.assertNotNull(data.get("latencyMs"));
        // statusCode not set because resp is null.
        assertNull(data.get("statusCode"));
    }

    // ====================================================================
    // Enabled, HTTP context, success path.
    // ====================================================================

    @Test
    @DisplayName("POST HTTP success: path from request URI, status code captured from response")
    void post_httpContext_success_capturesStatus() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/merge");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        resp.setStatus(201);
        bindRequestContext(req, resp);

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(
                        any(), any(), eq("/api/v1/general/merge"), eq("POST"), eq(null)))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditPostMethod(joinPoint);

        assertEquals("ok", result);
        assertEquals("success", data.get("outcome"));
        // Path taken from the request URI (preferred over annotations).
        verify(auditService)
                .addHttpData(data, "POST", "/api/v1/general/merge", AuditLevel.STANDARD);
        verify(auditService).addFileData(data, joinPoint, AuditLevel.STANDARD);
        verify(auditService)
                .addTimingData(eq(data), anyLong(), eq(resp), eq(AuditLevel.STANDARD), eq(true));
        verify(auditService)
                .audit("alice", "WEB", "1.2.3.4", AuditEventType.PDF_PROCESS, data,
                        AuditLevel.STANDARD);
        // statusCode captured directly from the bound response.
        assertEquals(201, data.get("statusCode"));
    }

    @Test
    @DisplayName("captureOperationResults + non-null result + non-UI_DATA stores stringified result")
    void httpContext_capturesResult_whenEnabled() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();
        Object proceedResult = new Object();

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/merge");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        bindRequestContext(req, resp);

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn(proceedResult);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);
        when(auditService.shouldCaptureOperationResults()).thenReturn(true);
        when(auditService.safeToString(proceedResult, 1000)).thenReturn("STRINGIFIED");

        aspect.auditPostMethod(joinPoint);

        assertEquals("STRINGIFIED", data.get("result"));
        verify(auditService).safeToString(proceedResult, 1000);
    }

    @Test
    @DisplayName("captureOperationResults enabled but UI_DATA event type skips result capture")
    void httpContext_uiData_skipsResultCapture() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/ui-data/foo");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        bindRequestContext(req, resp);

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(false);
        when(auditService.isPollingCall(req)).thenReturn(false);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("payload");
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.UI_DATA);
        when(auditService.shouldCaptureOperationResults()).thenReturn(true);

        aspect.auditGetMethod(joinPoint);

        // UI_DATA -> result intentionally not stored even though capture is enabled.
        assertNull(data.get("result"));
        verify(auditService, never()).safeToString(any(), anyInt());
        verify(auditService)
                .audit("alice", "WEB", "1.2.3.4", AuditEventType.UI_DATA, data, AuditLevel.STANDARD);
    }

    @Test
    @DisplayName("captureOperationResults enabled but null result does not store result key")
    void httpContext_nullResult_noResultStored() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn(null);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);
        when(auditService.shouldCaptureOperationResults()).thenReturn(true);

        Object result = aspect.auditPostMethod(joinPoint);

        assertNull(result);
        assertNull(data.get("result"));
        verify(auditService, never()).safeToString(any(), anyInt());
    }

    // ====================================================================
    // Failure path.
    // ====================================================================

    @Test
    @DisplayName("Failure path records failure/errorType/errorMessage, audits, then re-throws")
    void failure_recordsErrorAndRethrows() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();
        IllegalStateException boom = new IllegalStateException("kapow");

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenThrow(boom);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        IllegalStateException thrown =
                assertThrows(IllegalStateException.class, () -> aspect.auditPostMethod(joinPoint));
        assertSame(boom, thrown);

        assertEquals("failure", data.get("outcome"));
        assertEquals("IllegalStateException", data.get("errorType"));
        assertEquals("kapow", data.get("errorMessage"));
        // Audit still happens in the finally block.
        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.PDF_PROCESS, data, AuditLevel.STANDARD);
        // No result captured on failure.
        verify(auditService, never()).safeToString(any(), anyInt());
    }

    @Test
    @DisplayName("Failure with null message stores null errorMessage")
    void failure_nullMessage() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();
        RuntimeException boom = new RuntimeException(); // null message

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenThrow(boom);
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        assertThrows(RuntimeException.class, () -> aspect.auditPostMethod(joinPoint));

        assertEquals("failure", data.get("outcome"));
        assertEquals("RuntimeException", data.get("errorType"));
        assertNull(data.get("errorMessage"));
    }

    // ====================================================================
    // MDC early-capture preference.
    // ====================================================================

    @Test
    @DisplayName("MDC values preferred over service capture and restored to prior values after")
    void mdcValues_preferred_andRestored() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        MDC.put("auditPrincipal", "mdcUser");
        MDC.put("auditOrigin", "SYSTEM");
        MDC.put("auditIp", "10.0.0.9");

        stubEnabled(AuditLevel.STANDARD, data);
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditPutMethod(joinPoint);

        // Service-based fallbacks not consulted when MDC already populated.
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

        // Pre-existing MDC values restored after completion.
        assertEquals("mdcUser", MDC.get("auditPrincipal"));
        assertEquals("SYSTEM", MDC.get("auditOrigin"));
        assertEquals("10.0.0.9", MDC.get("auditIp"));
    }

    @Test
    @DisplayName("No prior MDC: service-captured principal/origin put into MDC then removed after")
    void noPriorMdc_capturedThenRemoved() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditDeleteMethod(joinPoint);

        verify(auditService).captureCurrentPrincipal();
        verify(auditService).captureCurrentOrigin();
        // Previous MDC values were null -> restoreMdcValue removes them.
        assertNull(MDC.get("auditPrincipal"));
        assertNull(MDC.get("auditOrigin"));
        assertNull(MDC.get("auditIp"));
    }

    // ====================================================================
    // getRequestPath fallback: no request context -> reconstruct from annotations.
    // ====================================================================

    @Test
    @DisplayName("No request context: GET path reconstructed from @RequestMapping + @GetMapping")
    void getRequestPath_fallbackReconstruction_get() throws Throwable {
        when(signature.getMethod())
                .thenReturn(fixtureMethod(AnnotatedFixtures.class, "getMapped"));
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        // No request context bound -> getCurrentRequest returns null (default mock), GET skip
        // branches not entered.
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(any(), any(), eq("/base/get-path"), eq("GET"), eq(null)))
                .thenReturn(AuditEventType.HTTP_REQUEST);

        aspect.auditGetMethod(joinPoint);

        // The reconstructed path "/base/get-path" flows to addHttpData and resolveEventType.
        verify(auditService).addHttpData(data, "GET", "/base/get-path", AuditLevel.STANDARD);
        verify(auditService)
                .resolveEventType(any(), any(), eq("/base/get-path"), eq("GET"), eq(null));
    }

    @Test
    @DisplayName("No request context: POST path reconstructed from @RequestMapping + @PostMapping")
    void getRequestPath_fallbackReconstruction_post() throws Throwable {
        when(signature.getMethod())
                .thenReturn(fixtureMethod(AnnotatedFixtures.class, "postMapped"));
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(
                        any(), any(), eq("/base/post-path"), eq("POST"), eq(null)))
                .thenReturn(AuditEventType.PDF_PROCESS);

        aspect.auditPostMethod(joinPoint);

        verify(auditService).addHttpData(data, "POST", "/base/post-path", AuditLevel.STANDARD);
    }

    // ====================================================================
    // Entry points: auditStaticResource (GET) and auditAutoJobMethod (POST).
    // ====================================================================

    @Test
    @DisplayName("auditStaticResource routes through the GET path and audits when enabled")
    void auditStaticResource_routesAsGet() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/index");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        bindRequestContext(req, resp);

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.getCurrentRequest()).thenReturn(req);
        when(auditService.isStaticResourceRequest(req)).thenReturn(false);
        when(auditService.isPollingCall(req)).thenReturn(false);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
        when(joinPoint.proceed()).thenReturn("ok");
        when(auditService.resolveEventType(any(), any(), eq("/index"), eq("GET"), eq(null)))
                .thenReturn(AuditEventType.HTTP_REQUEST);

        Object result = aspect.auditStaticResource(joinPoint);

        assertEquals("ok", result);
        verify(auditService).addHttpData(data, "GET", "/index", AuditLevel.STANDARD);
        verify(auditService)
                .audit("alice", "WEB", "1.2.3.4", AuditEventType.HTTP_REQUEST, data,
                        AuditLevel.STANDARD);
    }

    @Test
    @DisplayName("auditAutoJobMethod routes through the POST path and audits when enabled")
    void auditAutoJobMethod_routesAsPost() throws Throwable {
        useMethod("autoJob");
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("job-done");
        when(auditService.resolveEventType(any(), any(), any(), eq("POST"), eq(null)))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditAutoJobMethod(joinPoint);

        assertEquals("job-done", result);
        verify(auditService)
                .addHttpData(eq(data), eq("POST"), any(), eq(AuditLevel.STANDARD));
        verify(auditService)
                .audit("alice", "WEB", null, AuditEventType.PDF_PROCESS, data, AuditLevel.STANDARD);
    }

    @Test
    @DisplayName("auditPatchMethod dispatches with PATCH http method")
    void auditPatchMethod_dispatchesPatch() throws Throwable {
        useMethod("plainController");
        Map<String, Object> data = new HashMap<>();

        stubEnabled(AuditLevel.STANDARD, data);
        when(auditService.captureCurrentPrincipal()).thenReturn("alice");
        when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        when(joinPoint.proceed()).thenReturn("patched");
        when(auditService.resolveEventType(any(), any(), any(), eq("PATCH"), eq(null)))
                .thenReturn(AuditEventType.PDF_PROCESS);

        Object result = aspect.auditPatchMethod(joinPoint);

        assertEquals("patched", result);
        verify(auditService).addHttpData(eq(data), eq("PATCH"), any(), eq(AuditLevel.STANDARD));
    }
}
