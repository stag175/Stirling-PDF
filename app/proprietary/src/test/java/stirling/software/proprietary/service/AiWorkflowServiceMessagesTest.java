package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.InternalApiTimeoutException;

/**
 * Pins the user-facing tool timeout/failure messages built by AiWorkflowService. These strings are
 * surfaced to the operator when a workflow step times out or errors, so the endpoint and the
 * timeout/reason must appear verbatim.
 */
class AiWorkflowServiceMessagesTest {

    @Test
    @DisplayName("timeout message names the endpoint and the timeout in seconds")
    void timeoutMessage() {
        InternalApiTimeoutException e =
                new InternalApiTimeoutException("/api/v1/x", Duration.ofSeconds(45), null);
        String msg = AiWorkflowService.toolTimeoutMessage("/api/v1/x", e);
        assertTrue(msg.contains("/api/v1/x"), msg);
        assertTrue(msg.contains("45 seconds"), msg);
        assertTrue(msg.contains("did not respond within"), msg);
        assertTrue(msg.contains("aborted"), msg);
    }

    @Test
    @DisplayName("failure message uses the cause's message when present")
    void failureMessageWithMessage() {
        assertEquals(
                "The /api/v1/y tool failed: boom",
                AiWorkflowService.toolFailureMessage("/api/v1/y", new RuntimeException("boom")));
    }

    @Test
    @DisplayName(
            "failure message falls back to the exception's simple class name when message is null")
    void failureMessageNullMessage() {
        assertEquals(
                "The /api/v1/y tool failed: RuntimeException",
                AiWorkflowService.toolFailureMessage("/api/v1/y", new RuntimeException()));
        assertEquals(
                "The /ep tool failed: IllegalStateException",
                AiWorkflowService.toolFailureMessage("/ep", new IllegalStateException()));
    }
}
