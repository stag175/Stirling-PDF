package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.exception.CacheUnavailableException;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link ConvertPdfJsonExceptionHandler}.
 *
 * <p>The {@code @ControllerAdvice} handler method is invoked directly with a real or mocked
 * Jackson 3 ({@code tools.jackson}) {@link ObjectMapper}, so no MockMvc / Spring web context is
 * needed. Tests cover the primary HTTP 410 GONE response, the second-tier serialization fallback,
 * and the hard-coded last-ditch fallback.
 */
@ExtendWith(MockitoExtension.class)
class ConvertPdfJsonExceptionHandlerTest {

    // A real Jackson 3 mapper for end-to-end (de)serialization assertions. Jackson 3 enables
    // FAIL_ON_NULL_FOR_PRIMITIVES by default and ignores unknown properties by default; this test
    // only serializes Map<String, String> values so neither flag affects the result, but we build
    // it via JsonMapper.builder() to mirror the production Jackson flavor.
    private final ObjectMapper realMapper = JsonMapper.builder().build();

    @Mock private ObjectMapper objectMapper;

    @Test
    @DisplayName("Primary path: serializes a 410 GONE JSON body with the real mapper")
    void handleCacheUnavailable_primaryPath_realMapper() {
        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(realMapper);
        CacheUnavailableException ex = new CacheUnavailableException("cache gone for job 42");

        ResponseEntity<byte[]> response = handler.handleCacheUnavailable(ex);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertNotNull(response.getBody());

        Map<String, String> parsed = readJson(response.getBody());
        assertEquals("cache_unavailable", parsed.get("error"));
        assertEquals("reupload", parsed.get("action"));
        assertEquals("cache gone for job 42", parsed.get("message"));
    }

    @Test
    @DisplayName("Primary path: returns the exact bytes produced by a mocked mapper")
    void handleCacheUnavailable_primaryPath_mockedMapper() {
        byte[] serialized = "{\"error\":\"cache_unavailable\"}".getBytes(StandardCharsets.UTF_8);
        when(objectMapper.writeValueAsBytes(any())).thenReturn(serialized);

        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(objectMapper);
        CacheUnavailableException ex = new CacheUnavailableException("boom");

        ResponseEntity<byte[]> response = handler.handleCacheUnavailable(ex);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertArrayEquals(serialized, response.getBody());

        // Only the primary serialization should have been attempted (no fallback tiers).
        verify(objectMapper, times(1)).writeValueAsBytes(any());
        verifyNoMoreInteractions(objectMapper);
    }

    @Test
    @DisplayName("Primary path: the serialized map carries error, action and message keys")
    void handleCacheUnavailable_primaryPath_capturesMapPayload() {
        when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[] {1, 2, 3});

        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(objectMapper);
        handler.handleCacheUnavailable(new CacheUnavailableException("detailed reason"));

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(objectMapper).writeValueAsBytes(captor.capture());

        Object payload = captor.getValue();
        assertTrue(payload instanceof Map, "Expected a Map payload");
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) payload;
        assertEquals("cache_unavailable", map.get("error"));
        assertEquals("reupload", map.get("action"));
        assertEquals("detailed reason", map.get("message"));
    }

    @Test
    @DisplayName("Second-tier fallback: first serialize throws, second succeeds (mocked mapper)")
    void handleCacheUnavailable_fallbackTier_mockedMapper() {
        byte[] fallbackBytes = "{\"fallback\":true}".getBytes(StandardCharsets.UTF_8);
        when(objectMapper.writeValueAsBytes(any()))
                .thenThrow(new RuntimeException("primary serialization failed"))
                .thenReturn(fallbackBytes);

        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(objectMapper);

        ResponseEntity<byte[]> response =
                handler.handleCacheUnavailable(new CacheUnavailableException("oops"));

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertArrayEquals(fallbackBytes, response.getBody());
        // Primary attempt + fallback attempt = exactly two serialization calls.
        verify(objectMapper, times(2)).writeValueAsBytes(any());
    }

    @Test
    @DisplayName("Last-ditch fallback: both serialize attempts throw -> hard-coded JSON bytes")
    void handleCacheUnavailable_lastDitchFallback_bothSerializationsFail() {
        when(objectMapper.writeValueAsBytes(any()))
                .thenThrow(new RuntimeException("primary failed"))
                .thenThrow(new RuntimeException("fallback failed"));

        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(objectMapper);

        ResponseEntity<byte[]> response =
                handler.handleCacheUnavailable(new CacheUnavailableException("total failure"));

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());

        byte[] expected =
                "{\"error\":\"cache_unavailable\",\"action\":\"reupload\",\"message\":\"Cache unavailable\"}"
                        .getBytes(StandardCharsets.UTF_8);
        assertArrayEquals(expected, response.getBody());
        verify(objectMapper, times(2)).writeValueAsBytes(any());

        // The hard-coded body must itself be valid JSON with the expected keys.
        Map<String, String> parsed = readJson(response.getBody());
        assertEquals("cache_unavailable", parsed.get("error"));
        assertEquals("reupload", parsed.get("action"));
        assertEquals("Cache unavailable", parsed.get("message"));
    }

    @Test
    @DisplayName("Null message: Map.of rejects null on primary path, fallback uses \"null\" literal")
    void handleCacheUnavailable_nullMessage_fallsBackToStringValueOf() {
        // ex.getMessage() == null makes the primary Map.of(...) throw NPE before serialization,
        // so the handler falls through to the fallback which uses String.valueOf(null) == "null".
        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(realMapper);
        CacheUnavailableException ex = new CacheUnavailableException(null);

        ResponseEntity<byte[]> response = handler.handleCacheUnavailable(ex);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());

        Map<String, String> parsed = readJson(response.getBody());
        assertEquals("cache_unavailable", parsed.get("error"));
        assertEquals("reupload", parsed.get("action"));
        assertEquals("null", parsed.get("message"));
    }

    @Test
    @DisplayName("Empty message is serialized verbatim on the primary path")
    void handleCacheUnavailable_emptyMessage() {
        ConvertPdfJsonExceptionHandler handler = new ConvertPdfJsonExceptionHandler(realMapper);
        CacheUnavailableException ex = new CacheUnavailableException("");

        ResponseEntity<byte[]> response = handler.handleCacheUnavailable(ex);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<String, String> parsed = readJson(response.getBody());
        assertEquals("", parsed.get("message"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> readJson(byte[] body) {
        return realMapper.readValue(body, Map.class);
    }
}
