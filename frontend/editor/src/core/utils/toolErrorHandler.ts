/**
 * Standardized error handling utilities for tool operations
 */

import { normalizeAxiosErrorData } from "@app/services/errorUtils";

/** Minimal view of the axios-style error shape these helpers read from. */
interface ToolErrorLike {
  message?: unknown;
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
}

/**
 * Default error extractor that follows the standard pattern
 */
export const extractErrorMessage = (error: unknown): string => {
  const err = (error ?? {}) as ToolErrorLike;
  if (err.response?.data && typeof err.response.data === "string") {
    return err.response.data;
  }
  if (typeof err.message === "string" && err.message) {
    return err.message;
  }
  return "There was an error processing your request.";
};

/**
 * Creates a standardized error handler for tool operations
 * @param fallbackMessage - Message to show when no specific error can be extracted
 * @returns Error handler function that follows the standard pattern
 */
export const createStandardErrorHandler = (fallbackMessage: string) => {
  return (error: unknown): string => {
    const err = (error ?? {}) as ToolErrorLike;
    if (err.response?.data && typeof err.response.data === "string") {
      return err.response.data;
    }
    if (typeof err.message === "string" && err.message) {
      return err.message;
    }
    return fallbackMessage;
  };
};

/**
 * Parses a 422 response, extracts errored file IDs from the payload (JSON or UUID regex),
 * and marks them in the UI. Returns true if IDs were found and handled, false otherwise.
 */
export const handle422Error = async (
  error: unknown,
  markFileError: (fileId: string) => void,
): Promise<boolean> => {
  const err = (error ?? {}) as ToolErrorLike;
  const status = err.response?.status;
  if (typeof status !== "number" || status !== 422) return false;

  const payload = err.response?.data;
  let parsed: unknown = payload;

  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      parsed = payload;
    }
  } else if (payload && typeof (payload as Blob).text === "function") {
    const text = await (payload as Blob).text();
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  let ids: string[] | undefined = Array.isArray(
    (parsed as { errorFileIds?: unknown })?.errorFileIds,
  )
    ? (parsed as { errorFileIds: string[] }).errorFileIds
    : undefined;

  if (!ids && typeof parsed === "string") {
    const match = parsed.match(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    );
    if (match && match.length > 0) ids = Array.from(new Set(match));
  }

  if (ids && ids.length > 0) {
    for (const id of ids) {
      try {
        markFileError(id);
      } catch (_e) {
        void _e;
      }
    }
    return true;
  }

  return false;
};

/**
 * Handles password-related errors with status code checking
 * @param error - The error object from axios
 * @param incorrectPasswordMessage - Message to show for incorrect password (typically 500 status)
 * @param fallbackMessage - Message to show for other errors
 * @returns Error message string
 */
export const handlePasswordError = async (
  error: unknown,
  incorrectPasswordMessage: string,
  fallbackMessage: string,
): Promise<string> => {
  const err = (error ?? {}) as ToolErrorLike;
  const status = err.response?.status;

  // Handle specific error cases with user-friendly messages
  // Backend returns 400 with PdfPasswordException for incorrect/missing PDF passwords
  if (status === 500) {
    return incorrectPasswordMessage;
  }
  if (status === 400) {
    const data = err.response?.data;
    // ProblemDetail JSON has type "/errors/pdf-password", blob needs parsing
    const isPasswordError = await (async () => {
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          return text.includes("pdf-password") || text.includes("passworded");
        } catch {
          return false;
        }
      }
      const type = (data as { type?: unknown })?.type ?? "";
      return typeof type === "string" && type.includes("pdf-password");
    })();
    if (isPasswordError) {
      return incorrectPasswordMessage;
    }
  }

  // For other errors, try to extract the message
  const normalizedData = await normalizeAxiosErrorData(err.response?.data);
  const errorWithNormalizedData = {
    ...err,
    response: {
      ...err.response,
      data: normalizedData,
    },
  };
  return extractErrorMessage(errorWithNormalizedData) || fallbackMessage;
};
