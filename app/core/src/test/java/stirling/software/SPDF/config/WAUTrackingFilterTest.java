package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.service.WeeklyActiveUsersService;

@ExtendWith(MockitoExtension.class)
class WAUTrackingFilterTest {

    @Mock private WeeklyActiveUsersService wauService;
    @Mock private HttpServletRequest httpRequest;
    @Mock private ServletResponse response;
    @Mock private FilterChain chain;

    private WAUTrackingFilter filter;

    @BeforeEach
    void setUp() {
        filter = new WAUTrackingFilter(wauService);
    }

    @Test
    void recordsBrowserAccessWhenHeaderPresent() throws IOException, ServletException {
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn("browser-123");

        filter.doFilter(httpRequest, response, chain);

        verify(wauService).recordBrowserAccess("browser-123");
        verify(chain).doFilter(httpRequest, response);
    }

    @Test
    void doesNotRecordWhenHeaderNull() throws IOException, ServletException {
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn(null);

        filter.doFilter(httpRequest, response, chain);

        verify(wauService, never()).recordBrowserAccess(org.mockito.ArgumentMatchers.anyString());
        verify(chain).doFilter(httpRequest, response);
    }

    @Test
    void doesNotRecordWhenHeaderEmptyString() throws IOException, ServletException {
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn("");

        filter.doFilter(httpRequest, response, chain);

        verify(wauService, never()).recordBrowserAccess(org.mockito.ArgumentMatchers.anyString());
        verify(chain).doFilter(httpRequest, response);
    }

    @Test
    void doesNotRecordWhenHeaderBlankWhitespace() throws IOException, ServletException {
        // browserId is non-null but trim().isEmpty() is true -> skip recording
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn("   \t  ");

        filter.doFilter(httpRequest, response, chain);

        verify(wauService, never()).recordBrowserAccess(org.mockito.ArgumentMatchers.anyString());
        verify(chain).doFilter(httpRequest, response);
    }

    @Test
    void recordsBrowserAccessWithUntrimmedHeaderValue() throws IOException, ServletException {
        // Has surrounding whitespace but contains real content, so trim().isEmpty() is false.
        // The filter passes the raw (untrimmed) value through to the service.
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn("  abc  ");

        filter.doFilter(httpRequest, response, chain);

        verify(wauService).recordBrowserAccess("  abc  ");
        verify(chain).doFilter(httpRequest, response);
    }

    @Test
    void skipsHeaderLookupForNonHttpServletRequest() throws IOException, ServletException {
        // Plain ServletRequest (not an HttpServletRequest): instanceof branch is false,
        // so the service is never touched but the chain must still continue.
        ServletRequest plainRequest = mock(ServletRequest.class);

        filter.doFilter(plainRequest, response, chain);

        verifyNoInteractions(wauService);
        verify(chain).doFilter(plainRequest, response);
    }

    @Test
    void propagatesIOExceptionFromChain() throws IOException, ServletException {
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn("browser-xyz");
        doThrow(new IOException("boom")).when(chain).doFilter(httpRequest, response);

        assertThrows(IOException.class, () -> filter.doFilter(httpRequest, response, chain));

        // Recording still happened before the chain threw.
        verify(wauService).recordBrowserAccess("browser-xyz");
    }

    @Test
    void propagatesServletExceptionFromChain() throws IOException, ServletException {
        when(httpRequest.getHeader("X-Browser-Id")).thenReturn(null);
        doThrow(new ServletException("fail")).when(chain).doFilter(httpRequest, response);

        assertThrows(ServletException.class, () -> filter.doFilter(httpRequest, response, chain));
    }
}
