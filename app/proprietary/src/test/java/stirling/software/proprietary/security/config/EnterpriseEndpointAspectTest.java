package stirling.software.proprietary.security.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class EnterpriseEndpointAspectTest {

    @Test
    void notRunningEE_throwsForbidden_andDoesNotProceed() throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        EnterpriseEndpointAspect aspect = new EnterpriseEndpointAspect(false);

        assertThatThrownBy(() -> aspect.checkEnterpriseAccess(joinPoint))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex -> {
                            ResponseStatusException rse = (ResponseStatusException) ex;
                            assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                            assertThat(rse.getReason())
                                    .isEqualTo("This endpoint requires an Enterprise license");
                        });

        // The join point must never be executed when EE is disabled.
        verify(joinPoint, never()).proceed();
    }

    @Test
    void runningEE_proceeds_andReturnsJoinPointResult() throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        Object expectedResult = new Object();
        when(joinPoint.proceed()).thenReturn(expectedResult);
        EnterpriseEndpointAspect aspect = new EnterpriseEndpointAspect(true);

        Object actual = aspect.checkEnterpriseAccess(joinPoint);

        assertThat(actual).isSameAs(expectedResult);
        verify(joinPoint).proceed();
    }

    @Test
    void runningEE_returnsNullWhenJoinPointReturnsNull() throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        when(joinPoint.proceed()).thenReturn(null);
        EnterpriseEndpointAspect aspect = new EnterpriseEndpointAspect(true);

        Object actual = aspect.checkEnterpriseAccess(joinPoint);

        assertThat(actual).isNull();
        verify(joinPoint).proceed();
    }

    @Test
    void runningEE_propagatesThrowableFromJoinPoint() throws Throwable {
        ProceedingJoinPoint joinPoint = mock(ProceedingJoinPoint.class);
        IOException downstream = new IOException("boom");
        when(joinPoint.proceed()).thenThrow(downstream);
        EnterpriseEndpointAspect aspect = new EnterpriseEndpointAspect(true);

        assertThatThrownBy(() -> aspect.checkEnterpriseAccess(joinPoint)).isSameAs(downstream);

        verify(joinPoint).proceed();
    }
}
