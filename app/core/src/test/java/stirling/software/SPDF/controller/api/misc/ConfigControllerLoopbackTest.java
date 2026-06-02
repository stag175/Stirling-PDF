package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Focused unit tests for {@link ConfigController#isLoopbackHost(String)} — the loopback-host check
 * used to decide whether to expose a derived backend URL (an SSRF-adjacent guard).
 */
class ConfigControllerLoopbackTest {

    @Test
    void localhostIsLoopbackCaseInsensitively() {
        assertTrue(ConfigController.isLoopbackHost("localhost"));
        assertTrue(ConfigController.isLoopbackHost("LOCALHOST"));
        assertTrue(ConfigController.isLoopbackHost("LocalHost"));
    }

    @Test
    void loopbackIpLiteralsAreRecognised() {
        assertTrue(ConfigController.isLoopbackHost("127.0.0.1"));
        assertTrue(ConfigController.isLoopbackHost("::1"));
        assertTrue(ConfigController.isLoopbackHost("0:0:0:0:0:0:0:1"));
    }

    @Test
    void nonLoopbackHostsAreRejected() {
        assertFalse(ConfigController.isLoopbackHost("example.com"));
        assertFalse(ConfigController.isLoopbackHost("192.168.1.1"));
        assertFalse(ConfigController.isLoopbackHost("10.0.0.1"));
        assertFalse(ConfigController.isLoopbackHost("")); // empty
    }

    @Test
    void ipv4LiteralsOutsideTheExactMatchAreRejected() {
        // The check matches 127.0.0.1 exactly, not the whole 127.0.0.0/8 block.
        assertFalse(ConfigController.isLoopbackHost("127.0.0.2"));
        assertFalse(ConfigController.isLoopbackHost("127.0.0.1 ")); // trailing space, exact equals
    }

    @Test
    void ipLiteralsAreCaseSensitiveExactMatches() {
        // only "localhost" uses equalsIgnoreCase; the IP literals use exact equals
        assertFalse(ConfigController.isLoopbackHost("LOCALHOST.LOCALDOMAIN"));
    }
}
