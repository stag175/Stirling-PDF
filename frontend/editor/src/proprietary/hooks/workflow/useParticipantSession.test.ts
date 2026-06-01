import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import type {
  ParticipantResponse,
  SignatureSubmissionRequest,
  WorkflowSessionResponse,
} from "@app/services/workflowService";
import { useParticipantSession } from "@app/hooks/workflow/useParticipantSession";

// The hook delegates every network call to the default-exported workflowService
// instance. Mock that module so renderHook coverage is fully deterministic with
// no real axios/network I/O.
vi.mock("@app/services/workflowService", () => ({
  default: {
    getSessionByToken: vi.fn(),
    getParticipantDetails: vi.fn(),
    submitSignature: vi.fn(),
    declineParticipation: vi.fn(),
    getParticipantDocument: vi.fn(),
  },
}));

// Pull the mocked instance back out so each test can program return values.
import workflowService from "@app/services/workflowService";
const mockedService = vi.mocked(workflowService, true);

const sampleParticipant: ParticipantResponse = {
  id: 7,
  email: "signer@example.com",
  name: "Signer",
  status: "SIGNED",
  shareToken: null,
  accessRole: "EDITOR",
  lastUpdated: "2026-06-01T00:00:00Z",
  hasCompleted: true,
  isExpired: false,
};

const sampleSession: WorkflowSessionResponse = {
  sessionId: "sess-1",
  ownerId: 1,
  ownerUsername: "owner",
  workflowType: "SIGNING",
  documentName: "contract.pdf",
  status: "IN_PROGRESS",
  finalized: false,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  participants: [sampleParticipant],
  hasProcessedFile: false,
};

/** Build an AxiosError carrying a server-supplied response.data.message. */
function axiosErrorWithMessage(message: string): AxiosError {
  const err = new AxiosError("network failure");
  err.response = {
    data: { message },
    status: 400,
    statusText: "Bad Request",
    headers: {},
    // config is required by the type but unused by the hook.
    config: {} as never,
  };
  return err;
}

/** Build an AxiosError that has NO response body (e.g. timeout / no server). */
function axiosErrorWithoutResponse(message: string): AxiosError {
  return new AxiosError(message);
}

describe("useParticipantSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadSession", () => {
    it("starts with empty/idle state when no token is supplied", () => {
      const { result } = renderHook(() => useParticipantSession());

      expect(result.current.session).toBeNull();
      expect(result.current.participant).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      // Auto-load effect must not fire without a token.
      expect(mockedService.getSessionByToken).not.toHaveBeenCalled();
    });

    it("loads session + participant in parallel and populates state", async () => {
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.loadSession("tok-load");
      });

      expect(mockedService.getSessionByToken).toHaveBeenCalledWith("tok-load");
      expect(mockedService.getParticipantDetails).toHaveBeenCalledWith(
        "tok-load",
      );
      expect(result.current.session).toEqual(sampleSession);
      expect(result.current.participant).toEqual(sampleParticipant);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("auto-loads when a token is passed to the hook", async () => {
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession("auto-tok"));

      await waitFor(() =>
        expect(result.current.session).toEqual(sampleSession),
      );
      expect(mockedService.getSessionByToken).toHaveBeenCalledWith("auto-tok");
      expect(result.current.participant).toEqual(sampleParticipant);
    });

    it("re-runs the auto-load effect when the token prop changes", async () => {
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { rerender } = renderHook(
        ({ tok }: { tok?: string }) => useParticipantSession(tok),
        { initialProps: { tok: "first" } },
      );

      await waitFor(() =>
        expect(mockedService.getSessionByToken).toHaveBeenCalledWith("first"),
      );

      rerender({ tok: "second" });

      await waitFor(() =>
        expect(mockedService.getSessionByToken).toHaveBeenCalledWith("second"),
      );
    });

    it("captures the axios response.data.message on failure", async () => {
      mockedService.getSessionByToken.mockRejectedValue(
        axiosErrorWithMessage("Token expired"),
      );
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.loadSession("bad-tok");
      });

      expect(result.current.error).toBe("Token expired");
      expect(result.current.loading).toBe(false);
      expect(result.current.session).toBeNull();
    });

    it("falls back to err.message for an axios error without a response body", async () => {
      mockedService.getSessionByToken.mockRejectedValue(
        axiosErrorWithoutResponse("Network Error"),
      );
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.loadSession("bad-tok");
      });

      expect(result.current.error).toBe("Network Error");
    });

    it("uses err.message for a plain (non-axios) Error", async () => {
      mockedService.getSessionByToken.mockRejectedValue(
        new Error("plain failure"),
      );
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.loadSession("bad-tok");
      });

      expect(result.current.error).toBe("plain failure");
    });

    it("falls back to the default message for a non-Error rejection", async () => {
      // Reject with a non-Error value so both the axios and Error branches miss
      // and the `|| "Failed to load session"` default is taken.
      mockedService.getSessionByToken.mockRejectedValue("oops-string");
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.loadSession("bad-tok");
      });

      expect(result.current.error).toBe("Failed to load session");
    });
  });

  describe("submitSignature", () => {
    it("submits, updates the participant, and reloads the session when a token is present", async () => {
      const updatedParticipant: ParticipantResponse = {
        ...sampleParticipant,
        status: "SIGNED",
      };
      mockedService.submitSignature.mockResolvedValue(updatedParticipant);
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      const request: SignatureSubmissionRequest = {
        participantToken: "submit-tok",
        reason: "Approved",
      };

      await act(async () => {
        await result.current.submitSignature(request);
      });

      expect(mockedService.submitSignature).toHaveBeenCalledWith(request);
      // The reload path runs because participantToken is truthy.
      expect(mockedService.getSessionByToken).toHaveBeenCalledWith(
        "submit-tok",
      );
      expect(result.current.session).toEqual(sampleSession);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("skips the session reload when participantToken is empty", async () => {
      mockedService.submitSignature.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.submitSignature({ participantToken: "" });
      });

      expect(mockedService.submitSignature).toHaveBeenCalledTimes(1);
      // Empty token is falsy → loadSession (and getSessionByToken) is NOT called.
      expect(mockedService.getSessionByToken).not.toHaveBeenCalled();
      expect(result.current.participant).toEqual(sampleParticipant);
    });

    it("sets error and rethrows with axios message on submit failure", async () => {
      mockedService.submitSignature.mockRejectedValue(
        axiosErrorWithMessage("Invalid certificate"),
      );

      const { result } = renderHook(() => useParticipantSession());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.submitSignature({ participantToken: "t" });
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("Invalid certificate");
      expect(result.current.error).toBe("Invalid certificate");
      expect(result.current.loading).toBe(false);
    });

    it("rethrows the default message for a non-Error submit rejection", async () => {
      mockedService.submitSignature.mockRejectedValue(12345);

      const { result } = renderHook(() => useParticipantSession());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.submitSignature({ participantToken: "t" });
        } catch (e) {
          thrown = e;
        }
      });

      expect((thrown as Error).message).toBe("Failed to submit signature");
      expect(result.current.error).toBe("Failed to submit signature");
    });
  });

  describe("decline", () => {
    it("declines with a reason, updates participant, and reloads the session", async () => {
      const declined: ParticipantResponse = {
        ...sampleParticipant,
        status: "DECLINED",
      };
      mockedService.declineParticipation.mockResolvedValue(declined);
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(declined);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.decline("decline-tok", "Not my document");
      });

      expect(mockedService.declineParticipation).toHaveBeenCalledWith(
        "decline-tok",
        "Not my document",
      );
      expect(mockedService.getSessionByToken).toHaveBeenCalledWith(
        "decline-tok",
      );
      expect(result.current.session).toEqual(sampleSession);
      expect(result.current.error).toBeNull();
    });

    it("declines without a reason (reason argument omitted)", async () => {
      mockedService.declineParticipation.mockResolvedValue(sampleParticipant);
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.decline("decline-tok");
      });

      expect(mockedService.declineParticipation).toHaveBeenCalledWith(
        "decline-tok",
        undefined,
      );
    });

    it("sets error and rethrows on decline failure (axios message)", async () => {
      mockedService.declineParticipation.mockRejectedValue(
        axiosErrorWithMessage("Already declined"),
      );

      const { result } = renderHook(() => useParticipantSession());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.decline("decline-tok");
        } catch (e) {
          thrown = e;
        }
      });

      expect((thrown as Error).message).toBe("Already declined");
      expect(result.current.error).toBe("Already declined");
      expect(result.current.loading).toBe(false);
    });

    it("rethrows the default message for a non-Error decline rejection", async () => {
      mockedService.declineParticipation.mockRejectedValue(null);

      const { result } = renderHook(() => useParticipantSession());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.decline("decline-tok");
        } catch (e) {
          thrown = e;
        }
      });

      expect((thrown as Error).message).toBe("Failed to decline");
      expect(result.current.error).toBe("Failed to decline");
    });
  });

  describe("downloadDocument", () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    // Bind the real createElement up front so the createElement spy can
    // delegate to it without recursing into the mock.
    const originalCreateElement = document.createElement.bind(document);

    beforeEach(() => {
      window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      window.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("downloads using the session document name when a session is loaded", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedService.getParticipantDocument.mockResolvedValue(blob);
      mockedService.getSessionByToken.mockResolvedValue(sampleSession);
      mockedService.getParticipantDetails.mockResolvedValue(sampleParticipant);

      // Capture the anchor element the hook creates via createElement. We let
      // the real appendChild/removeChild run (so the hook's DOM cleanup
      // succeeds) and only stub click() to avoid jsdom's
      // "navigation not implemented" noise.
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      let anchor: HTMLAnchorElement | undefined;
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tagName: string) => {
          const el = originalCreateElement(tagName);
          if (tagName === "a") anchor = el as HTMLAnchorElement;
          return el;
        });
      const appendSpy = vi.spyOn(document.body, "appendChild");
      const removeSpy = vi.spyOn(document.body, "removeChild");

      // Load a session first so session?.documentName drives the file name.
      const { result } = renderHook(() => useParticipantSession());
      await act(async () => {
        await result.current.loadSession("tok");
      });

      await act(async () => {
        await result.current.downloadDocument("download-tok");
      });

      expect(mockedService.getParticipantDocument).toHaveBeenCalledWith(
        "download-tok",
      );
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(anchor?.href).toContain("blob:mock-url");
      expect(anchor?.download).toBe("contract.pdf");
      expect(clickSpy).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      // The anchor is appended then removed, so it must not linger in the DOM.
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(anchor && document.body.contains(anchor)).toBe(false);
      expect(result.current.error).toBeNull();

      clickSpy.mockRestore();
      createSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it("falls back to document.pdf when no session is loaded", async () => {
      const blob = new Blob(["pdf"], { type: "application/pdf" });
      mockedService.getParticipantDocument.mockResolvedValue(blob);

      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      let anchor: HTMLAnchorElement | undefined;
      const createSpy = vi
        .spyOn(document, "createElement")
        .mockImplementation((tagName: string) => {
          const el = originalCreateElement(tagName);
          if (tagName === "a") anchor = el as HTMLAnchorElement;
          return el;
        });

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.downloadDocument("download-tok");
      });

      // No session → session?.documentName is undefined → default name used.
      expect(anchor?.download).toBe("document.pdf");
      expect(clickSpy).toHaveBeenCalled();
      expect(result.current.error).toBeNull();

      clickSpy.mockRestore();
      createSpy.mockRestore();
    });

    it("captures the axios message on download failure without rethrowing", async () => {
      mockedService.getParticipantDocument.mockRejectedValue(
        axiosErrorWithMessage("Document not ready"),
      );

      const { result } = renderHook(() => useParticipantSession());

      // downloadDocument swallows the error (no throw), unlike submit/decline.
      await act(async () => {
        await result.current.downloadDocument("download-tok");
      });

      expect(result.current.error).toBe("Document not ready");
      expect(result.current.loading).toBe(false);
    });

    it("uses the default message for a non-Error download rejection", async () => {
      mockedService.getParticipantDocument.mockRejectedValue(undefined);

      const { result } = renderHook(() => useParticipantSession());

      await act(async () => {
        await result.current.downloadDocument("download-tok");
      });

      expect(result.current.error).toBe("Failed to download document");
    });
  });
});
