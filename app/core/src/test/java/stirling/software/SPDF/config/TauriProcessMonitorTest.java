package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.ScheduledExecutorService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Unit tests for {@link TauriProcessMonitor}.
 *
 * <p>The class is a plain Spring component with constructor injection. We exercise the public
 * surface ({@code getCurrentProcessId}, {@code init}, {@code cleanup}) directly and reach the
 * private lifecycle/branch logic ({@code startMonitoring}, {@code checkParentProcess},
 * {@code isProcessAlive}, {@code initiateGracefulShutdown}) via reflection. No Spring context,
 * DB, network or native tooling is used; the {@link ApplicationContext} collaborator is mocked.
 *
 * <p>The {@code System.exit(0)} fallback branch in {@code initiateGracefulShutdown} (non
 * {@link ConfigurableApplicationContext}) is intentionally NOT triggered because it would
 * terminate the test JVM.
 */
class TauriProcessMonitorTest {

    private TauriProcessMonitor monitor;

    @AfterEach
    void tearDown() throws Exception {
        // Always tear down any scheduler a test may have created so no virtual-thread
        // executor leaks between tests.
        if (monitor != null) {
            monitor.cleanup();
        }
    }

    // ---------------------------------------------------------------------
    // getCurrentProcessId() - pure static
    // ---------------------------------------------------------------------

    @Test
    void getCurrentProcessId_returnsNumericPidUnderNormalConditions() {
        String pid = TauriProcessMonitor.getCurrentProcessId();

        assertNotNull(pid);
        assertNotEquals("unknown", pid);
        // The runtime name is "<pid>@<host>"; the split must yield a parseable long.
        assertDoesNotThrow(() -> Long.parseLong(pid));
        assertEquals(String.valueOf(ProcessHandle.current().pid()), pid);
    }

    @Test
    void getCurrentProcessId_returnsUnknownWhenRuntimeNameThrows() {
        try (MockedStatic<ManagementFactory> mocked = mockStatic(ManagementFactory.class)) {
            RuntimeMXBean bean = mock(RuntimeMXBean.class);
            when(bean.getName()).thenThrow(new RuntimeException("boom"));
            mocked.when(ManagementFactory::getRuntimeMXBean).thenReturn(bean);

            assertEquals("unknown", TauriProcessMonitor.getCurrentProcessId());
        }
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    @Test
    void constructor_storesApplicationContext() throws Exception {
        ApplicationContext ctx = mock(ApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);

        assertSame(ctx, getField(monitor, "applicationContext"));
        // No monitoring before init / startMonitoring.
        assertFalse((boolean) getField(monitor, "monitoring"));
        assertNull(getField(monitor, "scheduler"));
    }

    // ---------------------------------------------------------------------
    // init() - environment variable branches
    // ---------------------------------------------------------------------

    @Test
    void init_doesNotStartMonitoringWhenParentPidEnvVarAbsent() throws Exception {
        // In a normal CI/test environment TAURI_PARENT_PID is not set. If it happens to be
        // present (e.g. running inside Tauri), the assertion is skipped via assumption-like guard.
        String envPid = System.getenv("TAURI_PARENT_PID");
        if (envPid != null && !envPid.trim().isEmpty()) {
            return; // environment provides a PID; the disabled-monitoring branch is unreachable
        }

        ApplicationContext ctx = mock(ApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);

        monitor.init();

        assertFalse((boolean) getField(monitor, "monitoring"));
        assertNull(getField(monitor, "scheduler"));
        assertNull(getField(monitor, "parentProcessId"));
    }

    // ---------------------------------------------------------------------
    // startMonitoring() - reached via reflection so we do not depend on env vars
    // ---------------------------------------------------------------------

    @Test
    void startMonitoring_initialisesSchedulerAndEnablesMonitoring() throws Exception {
        ApplicationContext ctx = mock(ApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "parentProcessId", String.valueOf(ProcessHandle.current().pid()));

        invokePrivate(monitor, "startMonitoring");

        assertTrue((boolean) getField(monitor, "monitoring"));
        ScheduledExecutorService scheduler =
                (ScheduledExecutorService) getField(monitor, "scheduler");
        assertNotNull(scheduler);
        assertFalse(scheduler.isShutdown());
        // The periodic task only fires after a 5s initial delay, so it will not run during the
        // test; cleanup() in tearDown shuts the scheduler down.
    }

    // ---------------------------------------------------------------------
    // isProcessAlive() - private, exercised via reflection
    // ---------------------------------------------------------------------

    @Test
    void isProcessAlive_returnsTrueForCurrentLiveProcess() throws Exception {
        monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        String livePid = String.valueOf(ProcessHandle.current().pid());

        boolean alive = (boolean) invokePrivate(monitor, "isProcessAlive", String.class, livePid);

        assertTrue(alive);
    }

    @Test
    void isProcessAlive_returnsFalseForNonExistentPid() throws Exception {
        monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        // A very large PID that is exceedingly unlikely to map to a real process.
        String deadPid = "999999999";

        boolean alive = (boolean) invokePrivate(monitor, "isProcessAlive", String.class, deadPid);

        assertFalse(alive);
    }

    @Test
    void isProcessAlive_returnsFalseForInvalidPidFormat() throws Exception {
        monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        boolean alive =
                (boolean) invokePrivate(monitor, "isProcessAlive", String.class, "not-a-number");

        assertFalse(alive);
    }

    @Test
    void isProcessAlive_returnsFalseForNullPid() throws Exception {
        monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        // Long.parseLong(null) throws NumberFormatException -> handled, returns false.
        boolean alive = (boolean) invokePrivate(monitor, "isProcessAlive", String.class, (Object) null);

        assertFalse(alive);
    }

    // ---------------------------------------------------------------------
    // checkParentProcess() - private, exercised via reflection
    // ---------------------------------------------------------------------

    @Test
    void checkParentProcess_returnsEarlyWhenNotMonitoring() throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        // monitoring defaults to false; use a dead PID so that, if the early return were missing,
        // a shutdown would be triggered. It must NOT be.
        setField(monitor, "parentProcessId", "999999999");
        setField(monitor, "monitoring", false);

        invokePrivate(monitor, "checkParentProcess");

        // No shutdown attempted because the method short-circuits on !monitoring.
        verify(ctx, never()).close();
        assertFalse((boolean) getField(monitor, "monitoring"));
    }

    @Test
    void checkParentProcess_doesNotShutDownWhenParentAlive() throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "parentProcessId", String.valueOf(ProcessHandle.current().pid()));
        setField(monitor, "monitoring", true);

        invokePrivate(monitor, "checkParentProcess");

        verify(ctx, never()).close();
        assertTrue((boolean) getField(monitor, "monitoring"));
    }

    @Test
    void checkParentProcess_initiatesShutdownWhenParentDead() throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "parentProcessId", "999999999");
        setField(monitor, "monitoring", true);

        invokePrivate(monitor, "checkParentProcess");

        // Shutdown happens on a virtual thread after a 1s sleep -> await it.
        verify(ctx, timeout(5000)).close();
        assertFalse((boolean) getField(monitor, "monitoring"));
    }

    @Test
    void checkParentProcess_swallowsExceptionFromShutdownPath() throws Exception {
        // initiateGracefulShutdown spawns its own thread; checkParentProcess itself should not
        // propagate exceptions. We verify monitoring is flipped off (the synchronous part of
        // the shutdown) without any throwable escaping.
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "parentProcessId", "999999999");
        setField(monitor, "monitoring", true);

        assertDoesNotThrow(() -> invokePrivate(monitor, "checkParentProcess"));
        assertFalse((boolean) getField(monitor, "monitoring"));
    }

    // ---------------------------------------------------------------------
    // initiateGracefulShutdown() - private, exercised via reflection
    // ---------------------------------------------------------------------

    @Test
    void initiateGracefulShutdown_closesConfigurableContextAndDisablesMonitoring()
            throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "monitoring", true);

        invokePrivate(monitor, "initiateGracefulShutdown");

        // monitoring is flipped synchronously before the async thread starts.
        assertFalse((boolean) getField(monitor, "monitoring"));
        // Context close happens on the virtual thread after a 1s delay.
        verify(ctx, timeout(5000)).close();
    }

    // ---------------------------------------------------------------------
    // cleanup() - @PreDestroy
    // ---------------------------------------------------------------------

    @Test
    void cleanup_isNoOpWhenSchedulerNull() {
        monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        // No scheduler created yet; cleanup must not throw.
        assertDoesNotThrow(() -> monitor.cleanup());
    }

    @Test
    void cleanup_shutsDownRunningScheduler() throws Exception {
        ApplicationContext ctx = mock(ApplicationContext.class);
        monitor = new TauriProcessMonitor(ctx);
        setField(monitor, "parentProcessId", String.valueOf(ProcessHandle.current().pid()));
        invokePrivate(monitor, "startMonitoring");

        ScheduledExecutorService scheduler =
                (ScheduledExecutorService) getField(monitor, "scheduler");
        assertNotNull(scheduler);
        assertFalse(scheduler.isShutdown());

        monitor.cleanup();

        assertFalse((boolean) getField(monitor, "monitoring"));
        assertTrue(scheduler.isShutdown());

        // Calling cleanup again on an already-shutdown scheduler is still safe.
        assertDoesNotThrow(() -> monitor.cleanup());
    }

    // ---------------------------------------------------------------------
    // Reflection helpers
    // ---------------------------------------------------------------------

    private static Object getField(Object target, String name) throws Exception {
        Field field = TauriProcessMonitor.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = TauriProcessMonitor.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static Object invokePrivate(Object target, String methodName) throws Exception {
        Method method = TauriProcessMonitor.class.getDeclaredMethod(methodName);
        method.setAccessible(true);
        return method.invoke(target);
    }

    private static Object invokePrivate(
            Object target, String methodName, Class<?> paramType, Object arg) throws Exception {
        Method method = TauriProcessMonitor.class.getDeclaredMethod(methodName, paramType);
        method.setAccessible(true);
        return method.invoke(target, arg);
    }
}
