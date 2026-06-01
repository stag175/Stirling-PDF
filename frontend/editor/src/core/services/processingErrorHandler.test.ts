import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { ProcessingErrorHandler } from "@app/services/processingErrorHandler";
import { ProcessingError } from "@app/types/processing";

/**
 * Unit tests for ProcessingErrorHandler.
 *
 * The class is pure error-classification + retry logic with no real external
 * dependencies. Determinism comes from:
 *   - vi.useFakeTimers() to drive the internal setTimeout-based delay / timeout
 *     helpers (executeWithRetry backoff, withTimeout, createTimeoutController,
 *     delay) without real wall-clock waits.
 *   - vi.spyOn(console, "log") to silence + assert the retry log line.
 *
 * createProcessingError exercises the private determineErrorType /
 * isRecoverable / formatErrorMessage branches indirectly via the public API.
 */

// Backoff schedule mirrored from the source (RETRY_DELAYS).
const RETRY_DELAYS = [1000, 2000, 4000];

describe("ProcessingErrorHandler", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  describe("createProcessingError - type classification", () => {
    test("classifies network errors from the message", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("Network request failed"),
      );
      expect(err.type).toBe("network");
      expect(err.message).toBe(
        "Network connection failed. Please check your internet connection and try again.",
      );
      expect(err.recoverable).toBe(true);
    });

    test("classifies fetch and connection keywords as network", () => {
      expect(
        ProcessingErrorHandler.createProcessingError(new Error("fetch aborted"))
          .type,
      ).toBe("network");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("Connection reset"),
        ).type,
      ).toBe("network");
    });

    test("classifies memory keywords as memory", () => {
      expect(
        ProcessingErrorHandler.createProcessingError(new Error("Out of memory"))
          .type,
      ).toBe("memory");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("storage quota exceeded"),
        ).type,
      ).toBe("memory");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("allocation failure"),
        ).type,
      ).toBe("memory");
    });

    test("classifies a QuotaExceededError by error name as memory", () => {
      const err = new Error("boom");
      err.name = "QuotaExceededError";
      const result = ProcessingErrorHandler.createProcessingError(err);
      expect(result.type).toBe("memory");
      expect(result.message).toBe(
        "Insufficient memory to process this file. Try closing other applications or processing a smaller file.",
      );
    });

    test("classifies timeout keyword as timeout", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("Request timeout after 30s"),
      );
      expect(err.type).toBe("timeout");
      expect(err.message).toBe(
        "Processing timed out. This file may be too large or complex to process.",
      );
    });

    test("classifies an AbortError name as timeout (timeout branch wins first)", () => {
      // 'aborted' is caught by the timeout block, and AbortError name also
      // matches there before the cancellation block is reached.
      const err = new Error("the signal was aborted");
      err.name = "AbortError";
      expect(ProcessingErrorHandler.createProcessingError(err).type).toBe(
        "timeout",
      );
    });

    test("classifies a bare 'cancel' message as cancelled", () => {
      // 'cancel' does not match timeout keywords, so it reaches the
      // cancellation block.
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("User cancelled the operation"),
      );
      expect(err.type).toBe("cancelled");
      expect(err.message).toBe("Processing was cancelled by user.");
      expect(err.recoverable).toBe(false);
    });

    test("classifies PDF / corruption keywords as corruption", () => {
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("Invalid PDF structure"),
        ).type,
      ).toBe("corruption");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("failed to parse document"),
        ).type,
      ).toBe("corruption");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("file is corrupt"),
        ).type,
      ).toBe("corruption");
      expect(
        ProcessingErrorHandler.createProcessingError(
          new Error("malformed header"),
        ).type,
      ).toBe("corruption");
      const corruption = ProcessingErrorHandler.createProcessingError(
        new Error("invalid input"),
      );
      expect(corruption.message).toBe(
        "This PDF file appears to be corrupted or encrypted. Please try a different file.",
      );
      expect(corruption.recoverable).toBe(false);
    });

    test("defaults to parsing for an unrecognized message", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("something unexpected went wrong"),
      );
      expect(err.type).toBe("parsing");
      expect(err.message).toBe(
        "Failed to process PDF: something unexpected went wrong",
      );
      expect(err.recoverable).toBe(true);
    });
  });

  describe("createProcessingError - non-Error inputs", () => {
    test("wraps a string error into an Error and classifies it", () => {
      const err = ProcessingErrorHandler.createProcessingError("network down");
      expect(err.type).toBe("network");
      expect(err.originalError).toBeInstanceOf(Error);
      expect(err.originalError?.message).toBe("network down");
    });

    test("stringifies non-string, non-Error inputs", () => {
      const err = ProcessingErrorHandler.createProcessingError(42);
      expect(err.originalError).toBeInstanceOf(Error);
      expect(err.originalError?.message).toBe("42");
      // "42" matches none of the keyword groups -> parsing.
      expect(err.type).toBe("parsing");
    });

    test("preserves an existing Error instance as originalError", () => {
      const original = new Error("Network glitch");
      const err = ProcessingErrorHandler.createProcessingError(original);
      expect(err.originalError).toBe(original);
    });
  });

  describe("createProcessingError - recoverability and counters", () => {
    test("records retryCount and maxRetries on the result", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("network"),
        2,
        5,
      );
      expect(err.retryCount).toBe(2);
      expect(err.maxRetries).toBe(5);
      expect(err.recoverable).toBe(true);
    });

    test("is not recoverable once retryCount reaches maxRetries", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("network"),
        3,
        3,
      );
      expect(err.recoverable).toBe(false);
    });

    test("memory errors are recoverable only on the very first attempt", () => {
      const first = ProcessingErrorHandler.createProcessingError(
        new Error("memory"),
        0,
        3,
      );
      expect(first.recoverable).toBe(true);

      const second = ProcessingErrorHandler.createProcessingError(
        new Error("memory"),
        1,
        3,
      );
      expect(second.recoverable).toBe(false);
    });

    test("timeout errors are recoverable while retries remain", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("timeout"),
        0,
        2,
      );
      expect(err.recoverable).toBe(true);
    });

    test("cancelled errors are never recoverable even with retries left", () => {
      const err = ProcessingErrorHandler.createProcessingError(
        new Error("operation cancelled"),
        0,
        3,
      );
      expect(err.recoverable).toBe(false);
    });
  });

  describe("shouldRetry", () => {
    test("returns true when recoverable and under the retry cap", () => {
      const error: ProcessingError = {
        type: "network",
        message: "x",
        recoverable: true,
        retryCount: 1,
        maxRetries: 3,
      };
      expect(ProcessingErrorHandler.shouldRetry(error)).toBe(true);
    });

    test("returns false when not recoverable", () => {
      const error: ProcessingError = {
        type: "corruption",
        message: "x",
        recoverable: false,
        retryCount: 0,
        maxRetries: 3,
      };
      expect(ProcessingErrorHandler.shouldRetry(error)).toBe(false);
    });

    test("returns false when the retry cap is reached", () => {
      const error: ProcessingError = {
        type: "network",
        message: "x",
        recoverable: true,
        retryCount: 3,
        maxRetries: 3,
      };
      expect(ProcessingErrorHandler.shouldRetry(error)).toBe(false);
    });
  });

  describe("getErrorSuggestions", () => {
    const make = (type: ProcessingError["type"]): ProcessingError => ({
      type,
      message: "x",
      recoverable: true,
      retryCount: 0,
      maxRetries: 3,
    });

    test("returns network-specific suggestions", () => {
      const suggestions = ProcessingErrorHandler.getErrorSuggestions(
        make("network"),
      );
      expect(suggestions).toContain("Check your internet connection");
      expect(suggestions).toHaveLength(3);
    });

    test("returns memory-specific suggestions", () => {
      const suggestions = ProcessingErrorHandler.getErrorSuggestions(
        make("memory"),
      );
      expect(suggestions).toContain("Restart your browser");
      expect(suggestions).toHaveLength(4);
    });

    test("returns timeout-specific suggestions", () => {
      expect(
        ProcessingErrorHandler.getErrorSuggestions(make("timeout")),
      ).toContain("Break large files into smaller sections");
    });

    test("returns corruption-specific suggestions", () => {
      expect(
        ProcessingErrorHandler.getErrorSuggestions(make("corruption")),
      ).toContain("Try re-downloading the file");
    });

    test("returns parsing-specific suggestions", () => {
      expect(
        ProcessingErrorHandler.getErrorSuggestions(make("parsing")),
      ).toContain("Verify this is a valid PDF file");
    });

    test("falls back to generic suggestions for the cancelled type", () => {
      const suggestions = ProcessingErrorHandler.getErrorSuggestions(
        make("cancelled"),
      );
      expect(suggestions).toEqual([
        "Try refreshing the page",
        "Try again in a few moments",
        "Contact support if the problem persists",
      ]);
    });
  });

  describe("executeWithRetry", () => {
    test("returns the result immediately when the operation succeeds", async () => {
      const operation = vi.fn().mockResolvedValue("ok");
      const onError = vi.fn();

      const result = await ProcessingErrorHandler.executeWithRetry(
        operation,
        onError,
      );

      expect(result).toBe("ok");
      expect(operation).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    test("retries a recoverable failure then succeeds, applying backoff", async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce("recovered");
      const onError = vi.fn();

      const promise = ProcessingErrorHandler.executeWithRetry(
        operation,
        onError,
        3,
      );

      // First attempt fails -> onError fired, then a 1000ms backoff is awaited.
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);

      const result = await promise;
      expect(result).toBe("recovered");
      expect(operation).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].type).toBe("network");
      expect(logSpy).toHaveBeenCalledWith(
        "Retrying operation (attempt 2/4) after 1000ms delay",
      );
    });

    test("exhausts all retries on a persistently recoverable error and throws the last error", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("network unreachable"));
      const onError = vi.fn();

      const promise = ProcessingErrorHandler.executeWithRetry(
        operation,
        onError,
        2,
      );
      // Avoid an unhandled rejection warning while timers are advanced.
      const settled = promise.catch((e) => e as ProcessingError);

      // Two backoff waits between the three attempts (1000ms then 2000ms).
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] + RETRY_DELAYS[1]);

      const error = (await settled) as ProcessingError;
      expect(operation).toHaveBeenCalledTimes(3); // attempts 0,1,2
      expect(onError).toHaveBeenCalledTimes(3);
      expect(error.type).toBe("network");
      expect(error.retryCount).toBe(2);
    });

    test("stops immediately on a non-recoverable error without waiting", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Invalid PDF / corrupt"));
      const onError = vi.fn();

      await expect(
        ProcessingErrorHandler.executeWithRetry(operation, onError, 3),
      ).rejects.toMatchObject({ type: "corruption", recoverable: false });

      expect(operation).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    });

    test("works without an onError callback", async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout reached"))
        .mockResolvedValueOnce("done");

      const promise = ProcessingErrorHandler.executeWithRetry(operation);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);

      await expect(promise).resolves.toBe("done");
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test("clamps the backoff index to the last RETRY_DELAYS entry on later attempts", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("network outage"));
      const onError = vi.fn();

      const promise = ProcessingErrorHandler.executeWithRetry(
        operation,
        onError,
        5,
      );
      const settled = promise.catch((e) => e as ProcessingError);

      // Backoffs across 5 retries: 1000, 2000, 4000, 4000, 4000 (clamped).
      const total =
        RETRY_DELAYS[0] +
        RETRY_DELAYS[1] +
        RETRY_DELAYS[2] +
        RETRY_DELAYS[2] +
        RETRY_DELAYS[2];
      await vi.advanceTimersByTimeAsync(total);

      const error = (await settled) as ProcessingError;
      expect(operation).toHaveBeenCalledTimes(6); // attempts 0..5
      expect(error.retryCount).toBe(5);
      // The final two retry logs use the clamped 4000ms delay.
      expect(logSpy).toHaveBeenCalledWith(
        "Retrying operation (attempt 5/6) after 4000ms delay",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Retrying operation (attempt 6/6) after 4000ms delay",
      );
    });

    test("maxRetries of 0 runs exactly once before throwing", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("network gone"));

      await expect(
        ProcessingErrorHandler.executeWithRetry(operation, undefined, 0),
      ).rejects.toMatchObject({ type: "network" });

      expect(operation).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("withTimeout", () => {
    test("resolves with the operation result when it finishes in time", async () => {
      const operation = vi.fn().mockResolvedValue("value");
      const promise = ProcessingErrorHandler.withTimeout(operation, 1000);

      // Let the resolved operation microtask settle.
      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).resolves.toBe("value");
    });

    test("rejects with the timeout message when the operation is too slow", async () => {
      const operation = vi.fn(
        () => new Promise<string>(() => {}), // never settles
      );
      const promise = ProcessingErrorHandler.withTimeout(
        operation,
        500,
        "Too slow",
      );
      const settled = promise.catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(500);

      const error = await settled;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Too slow");
    });

    test("uses the default timeout message and propagates operation rejection", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("operation broke"));
      const promise = ProcessingErrorHandler.withTimeout(operation, 1000);
      const settled = promise.catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(0);

      const error = await settled;
      expect((error as Error).message).toBe("operation broke");
    });
  });

  describe("createTimeoutController", () => {
    test("returns an unaborted controller that aborts after the timeout", () => {
      const controller = ProcessingErrorHandler.createTimeoutController(1000);
      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(controller.signal.aborted).toBe(true);
    });

    test("does not abort before the timeout elapses", () => {
      const controller = ProcessingErrorHandler.createTimeoutController(1000);
      vi.advanceTimersByTime(999);
      expect(controller.signal.aborted).toBe(false);
    });
  });
});
