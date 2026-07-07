package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.function.Executable;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.filter.IPRateLimitingFilter;

/**
 * Pure unit tests for {@link RateLimitResetScheduler}.
 *
 * <p>The scheduler is a thin delegate: its single {@code @Scheduled} method {@code resetRateLimit()}
 * forwards to {@link IPRateLimitingFilter#resetRequestCounts()}. The collaborator is a Mockito mock
 * so no Spring scheduling context, no servlet container and no real rate-limit state are required.
 * {@code resetRequestCounts()} is a non-final method on a concrete class, so Mockito can stub and
 * verify it directly.
 */
@ExtendWith(MockitoExtension.class)
class RateLimitResetSchedulerTest {

    @Mock private IPRateLimitingFilter rateLimitingFilter;

    @InjectMocks private RateLimitResetScheduler scheduler;

    @Test
    @DisplayName("resetRateLimit delegates exactly once to IPRateLimitingFilter.resetRequestCounts")
    void resetRateLimit_delegatesToFilter() {
        scheduler.resetRateLimit();

        verify(rateLimitingFilter, times(1)).resetRequestCounts();
        verifyNoMoreInteractions(rateLimitingFilter);
    }

    @Test
    @DisplayName("resetRateLimit invoked repeatedly delegates once per invocation")
    void resetRateLimit_isIdempotentlyDelegatedPerCall() {
        scheduler.resetRateLimit();
        scheduler.resetRateLimit();
        scheduler.resetRateLimit();

        verify(rateLimitingFilter, times(3)).resetRequestCounts();
        verifyNoMoreInteractions(rateLimitingFilter);
    }

    @Test
    @DisplayName("resetRateLimit performs no interaction other than resetRequestCounts")
    void resetRateLimit_doesNotTouchFilterBeforeCall() {
        // No method called yet -> no interaction should have happened on the collaborator.
        verify(rateLimitingFilter, never()).resetRequestCounts();
        verifyNoMoreInteractions(rateLimitingFilter);
    }

    @Test
    @DisplayName("resetRateLimit propagates a RuntimeException thrown by the collaborator")
    void resetRateLimit_propagatesCollaboratorException() {
        RuntimeException boom = new IllegalStateException("reset failed");
        doThrow(boom).when(rateLimitingFilter).resetRequestCounts();

        Executable call = () -> scheduler.resetRateLimit();

        RuntimeException thrown = assertThrows(IllegalStateException.class, call);
        // The scheduler must not wrap or swallow the failure; the same instance bubbles up.
        assertSame(boom, thrown, "scheduler must propagate the collaborator's exception unchanged");
        verify(rateLimitingFilter, times(1)).resetRequestCounts();
    }

    @Test
    @DisplayName("a fresh scheduler can be constructed with the injected collaborator and run safely")
    void resetRateLimit_runsWithoutThrowingForDefaultMock() {
        // Default Mockito behaviour for a void method is a no-op, so the call must complete cleanly.
        assertDoesNotThrow(() -> scheduler.resetRateLimit());

        verify(rateLimitingFilter).resetRequestCounts();
    }

    @Test
    @DisplayName("constructor stores the supplied filter and delegation targets it")
    void constructor_usesSuppliedFilterForDelegation() {
        // Verify the Lombok @RequiredArgsConstructor wires the exact instance we pass in by
        // building the scheduler manually rather than relying on @InjectMocks.
        IPRateLimitingFilter explicitFilter = rateLimitingFilter;
        RateLimitResetScheduler manualScheduler = new RateLimitResetScheduler(explicitFilter);

        manualScheduler.resetRateLimit();

        verify(explicitFilter, times(1)).resetRequestCounts();
    }
}
