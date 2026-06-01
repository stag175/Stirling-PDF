import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import apiClient from "@app/services/apiClient";
import { alert } from "@app/components/toast";
import { useApiKey } from "@app/components/shared/config/configSections/apiKeys/hooks/useApiKey";

// The hook delegates every network call to the default-exported apiClient
// (axios) instance. Auto-mock it so `.post` becomes a vi.fn() stub, matching
// the convention in auditService.test.ts. Under the "proprietary" Vitest
// project, both the hook (which imports "@app/services/apiClient") and this
// mock specifier resolve to src/core/services/apiClient, so the mock applies
// to the exact module the hook imports.
vi.mock("@app/services/apiClient");

// The hook surfaces user-facing failures via the toast `alert` helper. Mock it
// so we can assert which alert variant fires without rendering the real toast
// stack. The specifier resolves to src/core/components/toast under @app/*.
vi.mock("@app/components/toast", () => ({
  alert: vi.fn(),
}));

// `react-i18next` is globally mocked in core/setupTests.ts with
// t: (key) => key, so the i18n keys below are deterministic and need no
// per-file mock.

const mockedPost = vi.mocked(apiClient.post);
const mockedAlert = vi.mocked(alert);

/** Build an axios-style rejection carrying an HTTP status code. */
function httpError(status: number): { response: { status: number } } {
  return { response: { status } };
}

/** Pull the single i18n `body` key off the most recent alert() call. */
function lastAlertBody(): string | undefined {
  const calls = mockedAlert.mock.calls;
  if (calls.length === 0) return undefined;
  const arg = calls[calls.length - 1][0] as { body?: string };
  return arg.body;
}

/** Find the alertType of the most recent alert() call. */
function lastAlertType(): string | undefined {
  const calls = mockedAlert.mock.calls;
  if (calls.length === 0) return undefined;
  const arg = calls[calls.length - 1][0] as { alertType?: string };
  return arg.alertType;
}

const GET = "/api/v1/user/get-api-key";
const UPDATE = "/api/v1/user/update-api-key";

describe("useApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial mount / fetchKey", () => {
    it("auto-fetches on mount and stores a plain-string apiKey", async () => {
      mockedPost.mockResolvedValueOnce({ data: "string-key-123" });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      // The auto-fetch effect targets the GET endpoint with json responseType.
      expect(mockedPost).toHaveBeenCalledWith(GET, undefined, {
        responseType: "json",
      });
      expect(result.current.apiKey).toBe("string-key-123");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      // The happy path raises no alert.
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    it("extracts apiKey from an object response shape ({ apiKey })", async () => {
      mockedPost.mockResolvedValueOnce({ data: { apiKey: "obj-key-456" } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBe("obj-key-456");
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    it("alerts when the GET response has no usable apiKey (object without apiKey)", async () => {
      mockedPost.mockResolvedValueOnce({ data: { unexpected: true } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBeNull();
      expect(mockedAlert).toHaveBeenCalledTimes(1);
      expect(lastAlertType()).toBe("error");
      expect(lastAlertBody()).toBe(
        "config.apiKeys.alert.failedToRetrieveApiKey",
      );
      // A malformed-but-resolved response is not an error rejection.
      expect(result.current.error).toBeNull();
    });

    it("alerts when the GET response data is a non-string, non-object (number)", async () => {
      // data is a number → apiKeyValue is data?.apiKey === undefined → alert.
      mockedPost.mockResolvedValueOnce({ data: 42 });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBeNull();
      expect(lastAlertBody()).toBe(
        "config.apiKeys.alert.failedToRetrieveApiKey",
      );
    });
  });

  describe("404 create fallback", () => {
    it("creates a key via update when GET 404s and update returns a string", async () => {
      mockedPost
        .mockRejectedValueOnce(httpError(404)) // GET -> not found
        .mockResolvedValueOnce({ data: "created-key" }); // UPDATE -> created

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      // Second call is the create attempt at the UPDATE endpoint (no extra args).
      expect(mockedPost).toHaveBeenNthCalledWith(2, UPDATE);
      expect(result.current.apiKey).toBe("created-key");
      expect(result.current.error).toBeNull();
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    it("creates a key when update returns an object shape ({ apiKey })", async () => {
      mockedPost
        .mockRejectedValueOnce(httpError(404))
        .mockResolvedValueOnce({ data: { apiKey: "created-obj-key" } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBe("created-obj-key");
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    it("fires the create-failure alert when update resolves with no usable key", async () => {
      mockedPost
        .mockRejectedValueOnce(httpError(404))
        .mockResolvedValueOnce({ data: { nope: 1 } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBeNull();
      expect(lastAlertType()).toBe("error");
      expect(lastAlertBody()).toBe("config.apiKeys.alert.failedToCreateApiKey");
      // No rejection occurred, so error stays null on this branch.
      expect(result.current.error).toBeNull();
    });

    it("alerts and sets error when the create (update) call itself rejects", async () => {
      const createErr = new Error("create boom");
      mockedPost
        .mockRejectedValueOnce(httpError(404))
        .mockRejectedValueOnce(createErr);

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(result.current.apiKey).toBeNull();
      expect(lastAlertBody()).toBe("config.apiKeys.alert.failedToCreateApiKey");
      expect(result.current.error).toBe(createErr);
    });
  });

  describe("non-404 fetch failure", () => {
    it("alerts and records the error for a non-404 rejection (500)", async () => {
      const serverErr = httpError(500);
      mockedPost.mockRejectedValueOnce(serverErr);

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      // Only the GET endpoint is hit; the 404-create branch is skipped.
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(lastAlertBody()).toBe("config.apiKeys.alert.failedToFetchApiKey");
      expect(result.current.error).toBe(serverErr);
      expect(result.current.apiKey).toBeNull();
    });

    it("treats a rejection with no response object as a non-404 failure", async () => {
      // e?.response is undefined → optional chaining yields undefined !== 404.
      const networkErr = new Error("Network Error");
      mockedPost.mockRejectedValueOnce(networkErr);

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.hasAttempted).toBe(true));

      expect(lastAlertBody()).toBe("config.apiKeys.alert.failedToFetchApiKey");
      expect(result.current.error).toBe(networkErr);
    });
  });

  describe("refetch", () => {
    it("re-runs fetchKey when refetch is invoked manually", async () => {
      // Mount fetch succeeds, then a manual refetch returns a different key.
      mockedPost
        .mockResolvedValueOnce({ data: "first-key" })
        .mockResolvedValueOnce({ data: "second-key" });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.apiKey).toBe("first-key"));

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.apiKey).toBe("second-key");
      expect(mockedPost).toHaveBeenCalledTimes(2);
    });
  });

  describe("refresh", () => {
    it("refreshes the key (string response) and raises a success alert", async () => {
      // Suppress the mount auto-fetch noise with a benign resolved value.
      mockedPost
        .mockResolvedValueOnce({ data: "mount-key" }) // mount fetch
        .mockResolvedValueOnce({ data: "refreshed-key" }); // refresh

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.apiKey).toBe("mount-key"));

      await act(async () => {
        await result.current.refresh();
      });

      // Refresh hits the UPDATE endpoint with the suppressErrorToast flag.
      expect(mockedPost).toHaveBeenCalledWith(UPDATE, undefined, {
        responseType: "json",
        suppressErrorToast: true,
      });
      expect(result.current.apiKey).toBe("refreshed-key");
      expect(result.current.isRefreshing).toBe(false);
      expect(lastAlertType()).toBe("success");
      expect(lastAlertBody()).toBe("config.apiKeys.alert.apiKeyRefreshedBody");
      expect(result.current.error).toBeNull();
    });

    it("refreshes with an object response shape ({ apiKey })", async () => {
      mockedPost
        .mockResolvedValueOnce({ data: "mount-key" })
        .mockResolvedValueOnce({ data: { apiKey: "refreshed-obj-key" } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.apiKey).toBe("mount-key"));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.apiKey).toBe("refreshed-obj-key");
      expect(lastAlertType()).toBe("success");
    });

    it("raises a refresh-error alert when the response carries no usable key", async () => {
      mockedPost
        .mockResolvedValueOnce({ data: "mount-key" })
        .mockResolvedValueOnce({ data: { missing: true } });

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.apiKey).toBe("mount-key"));

      await act(async () => {
        await result.current.refresh();
      });

      // The mount key is retained; refresh did not overwrite it.
      expect(result.current.apiKey).toBe("mount-key");
      expect(lastAlertType()).toBe("error");
      expect(lastAlertBody()).toBe(
        "config.apiKeys.alert.failedToRefreshApiKey",
      );
      expect(result.current.error).toBeNull();
    });

    it("alerts and sets error when the refresh request rejects", async () => {
      const refreshErr = new Error("refresh boom");
      mockedPost
        .mockResolvedValueOnce({ data: "mount-key" })
        .mockRejectedValueOnce(refreshErr);

      const { result } = renderHook(() => useApiKey());

      await waitFor(() => expect(result.current.apiKey).toBe("mount-key"));

      await act(async () => {
        await result.current.refresh();
      });

      expect(lastAlertType()).toBe("error");
      expect(lastAlertBody()).toBe(
        "config.apiKeys.alert.failedToRefreshApiKey",
      );
      expect(result.current.error).toBe(refreshErr);
      expect(result.current.isRefreshing).toBe(false);
    });
  });
});
