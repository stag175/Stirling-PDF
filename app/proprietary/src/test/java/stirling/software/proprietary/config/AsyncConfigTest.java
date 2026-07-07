package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

/**
 * Unit tests for {@link AsyncConfig} and its nested {@link AsyncConfig.MDCContextTaskDecorator}.
 *
 * <p>The decorator is pure logic: it captures the caller thread's MDC context map at decorate time,
 * applies it to the worker thread before running the wrapped {@link Runnable}, then clears the MDC
 * afterwards (even on exception). These tests instantiate the decorator directly (no Spring context)
 * and assert MDC state observed from inside the wrapped Runnable as well as after it returns.
 *
 * <p>Convention note: mirrors {@code CorrelationIdFilterTest} in the same module — JUnit Jupiter
 * Assertions, {@code MDC.clear()} in setUp/tearDown, and capturing MDC inside the executed unit
 * before the {@code finally} clear happens.
 */
class AsyncConfigTest {

    @BeforeEach
    void setUp() {
        MDC.clear();
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Nested
    @DisplayName("MDCContextTaskDecorator.decorate")
    class DecoratorBehavior {

        private final AsyncConfig.MDCContextTaskDecorator decorator =
                new AsyncConfig.MDCContextTaskDecorator();

        @Test
        @DisplayName("Should return a wrapper that is not the original Runnable")
        void shouldReturnNewWrapper() {
            Runnable original = () -> {};

            Runnable decorated = decorator.decorate(original);

            assertNotNull(decorated);
            assertNotSame(original, decorated);
        }

        @Test
        @DisplayName("Should invoke the wrapped Runnable exactly once when run")
        void shouldInvokeWrappedRunnable() {
            AtomicBoolean ran = new AtomicBoolean(false);

            Runnable decorated = decorator.decorate(() -> ran.set(true));
            decorated.run();

            assertTrue(ran.get());
        }

        @Test
        @DisplayName("Should propagate captured MDC context into the Runnable, then clear it after")
        void shouldPropagateMdcDuringRunAndClearAfter() {
            MDC.put("requestId", "req-42");
            MDC.put("user", "alice");

            AtomicReference<Map<String, String>> seenInside = new AtomicReference<>();
            Runnable decorated =
                    decorator.decorate(() -> seenInside.set(MDC.getCopyOfContextMap()));

            decorated.run();

            // Context observed inside the Runnable matches what was set on the caller thread.
            Map<String, String> inside = seenInside.get();
            assertNotNull(inside);
            assertEquals("req-42", inside.get("requestId"));
            assertEquals("alice", inside.get("user"));

            // After run() the MDC is cleared (regardless of what was on the caller thread before).
            assertNull(MDC.get("requestId"));
            assertNull(MDC.get("user"));
            assertTrue(
                    MDC.getCopyOfContextMap() == null || MDC.getCopyOfContextMap().isEmpty(),
                    "MDC should be empty after the decorated Runnable returns");
        }

        @Test
        @DisplayName("Should snapshot MDC at decorate time, not at run time")
        void shouldSnapshotContextAtDecorateTime() {
            MDC.put("key", "at-decorate");

            AtomicReference<String> seen = new AtomicReference<>();
            Runnable decorated = decorator.decorate(() -> seen.set(MDC.get("key")));

            // Mutate the caller MDC AFTER decoration but BEFORE running the wrapper.
            MDC.put("key", "after-decorate");

            decorated.run();

            // The value captured at decorate() time is what the Runnable sees.
            assertEquals("at-decorate", seen.get());
        }

        @Test
        @DisplayName(
                "Should not set a context map when caller MDC is empty, but still clear any "
                        + "pre-existing worker-thread MDC afterwards")
        void shouldHandleNullContextMapAndStillClear() {
            // No MDC on the caller thread -> getCopyOfContextMap() returns null at decorate time.
            assertNull(MDC.getCopyOfContextMap());

            AtomicReference<Map<String, String>> seenInside = new AtomicReference<>();
            Runnable decorated =
                    decorator.decorate(
                            () -> {
                                // Simulate a dirty worker thread that already had MDC state.
                                seenInside.set(MDC.getCopyOfContextMap());
                                MDC.put("leftover", "value");
                            });

            // Pre-seed the *current* thread (acting as the worker) to prove setContextMap is
            // skipped: since contextMap is null, MDC is left as-is going into the Runnable.
            MDC.put("preexisting", "x");

            decorated.run();

            // Because contextMap was null, MDC.setContextMap was NOT called, so the pre-existing
            // value was still visible inside the Runnable.
            Map<String, String> inside = seenInside.get();
            assertNotNull(inside);
            assertEquals("x", inside.get("preexisting"));

            // The finally block clears everything, including the leftover put inside the Runnable.
            assertNull(MDC.get("preexisting"));
            assertNull(MDC.get("leftover"));
        }

        @Test
        @DisplayName("Should clear MDC even when the wrapped Runnable throws")
        void shouldClearMdcWhenRunnableThrows() {
            MDC.put("requestId", "req-boom");

            Runnable decorated =
                    decorator.decorate(
                            () -> {
                                // Context is present at the moment of failure.
                                assertEquals("req-boom", MDC.get("requestId"));
                                throw new IllegalStateException("boom");
                            });

            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, decorated::run);
            assertEquals("boom", ex.getMessage());

            // finally cleared the MDC despite the exception.
            assertNull(MDC.get("requestId"));
            assertTrue(
                    MDC.getCopyOfContextMap() == null || MDC.getCopyOfContextMap().isEmpty(),
                    "MDC should be empty after an exception in the decorated Runnable");
        }

        @Test
        @DisplayName("Should propagate MDC onto a genuinely different worker thread")
        void shouldPropagateAcrossThreads() throws InterruptedException {
            MDC.put("requestId", "cross-thread");

            AtomicReference<String> seenOnWorker = new AtomicReference<>();
            Runnable decorated =
                    decorator.decorate(() -> seenOnWorker.set(MDC.get("requestId")));

            Thread worker = new Thread(decorated);
            worker.start();
            worker.join();

            // The worker thread, which had no MDC of its own, saw the caller's context.
            assertEquals("cross-thread", seenOnWorker.get());

            // Caller thread MDC is untouched by the worker (each thread has its own MDC).
            assertEquals("cross-thread", MDC.get("requestId"));
        }
    }

    @Nested
    @DisplayName("Bean factory methods")
    class BeanFactory {

        private final AsyncConfig config = new AsyncConfig();

        @Test
        @DisplayName("auditExecutor should return a non-null executor that runs tasks")
        void auditExecutorRunsTasks() throws InterruptedException {
            Executor executor = config.auditExecutor();
            assertNotNull(executor);

            assertMdcPropagatesThrough(executor);
        }

        @Test
        @DisplayName("aiStreamExecutor should return a non-null executor that runs tasks")
        void aiStreamExecutorRunsTasks() throws InterruptedException {
            Executor executor = config.aiStreamExecutor();
            assertNotNull(executor);

            assertMdcPropagatesThrough(executor);
        }

        /**
         * Submits a task through the executor and verifies that the caller's MDC value is visible
         * on the executing (virtual) thread, exercising the wired-up {@link
         * AsyncConfig.MDCContextTaskDecorator}.
         */
        private void assertMdcPropagatesThrough(Executor executor) throws InterruptedException {
            MDC.put("requestId", "bean-prop");

            AtomicReference<String> seen = new AtomicReference<>();
            AtomicBoolean ran = new AtomicBoolean(false);
            java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

            executor.execute(
                    () -> {
                        try {
                            seen.set(MDC.get("requestId"));
                            ran.set(true);
                        } finally {
                            latch.countDown();
                        }
                    });

            assertTrue(
                    latch.await(5, java.util.concurrent.TimeUnit.SECONDS),
                    "Executor task should complete within timeout");
            assertTrue(ran.get());
            assertEquals("bean-prop", seen.get());
        }
    }
}
