package stirling.software.proprietary.security.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class PremiumEndpointAspectTest {

    @Mock private ProceedingJoinPoint joinPoint;

    @Test
    void proceedsAndReturnsResultWhenRunningProOrHigher() throws Throwable {
        PremiumEndpointAspect aspect = new PremiumEndpointAspect(true);
        Object expected = new Object();
        when(joinPoint.proceed()).thenReturn(expected);

        Object result = aspect.checkPremiumAccess(joinPoint);

        assertSame(expected, result);
        verify(joinPoint).proceed();
    }

    @Test
    void returnsNullResultFromProceedWhenRunningProOrHigher() throws Throwable {
        PremiumEndpointAspect aspect = new PremiumEndpointAspect(true);
        when(joinPoint.proceed()).thenReturn(null);

        Object result = aspect.checkPremiumAccess(joinPoint);

        assertNull(result);
        verify(joinPoint).proceed();
    }

    @Test
    void propagatesThrowableFromProceedWhenRunningProOrHigher() throws Throwable {
        PremiumEndpointAspect aspect = new PremiumEndpointAspect(true);
        IllegalStateException underlying = new IllegalStateException("boom");
        when(joinPoint.proceed()).thenThrow(underlying);

        IllegalStateException thrown =
                assertThrows(
                        IllegalStateException.class, () -> aspect.checkPremiumAccess(joinPoint));

        assertSame(underlying, thrown);
        verify(joinPoint).proceed();
    }

    @Test
    void throwsForbiddenWhenNotRunningProOrHigher() {
        PremiumEndpointAspect aspect = new PremiumEndpointAspect(false);

        ResponseStatusException thrown =
                assertThrows(
                        ResponseStatusException.class,
                        () -> aspect.checkPremiumAccess(joinPoint));

        assertEquals(HttpStatus.FORBIDDEN, thrown.getStatusCode());
        assertEquals(
                "This endpoint requires a Server or Enterprise license", thrown.getReason());
    }

    @Test
    void doesNotInvokeProceedWhenNotRunningProOrHigher() throws Throwable {
        PremiumEndpointAspect aspect = new PremiumEndpointAspect(false);

        assertThrows(
                ResponseStatusException.class, () -> aspect.checkPremiumAccess(joinPoint));

        verify(joinPoint, never()).proceed();
        verifyNoInteractions(joinPoint);
    }
}
