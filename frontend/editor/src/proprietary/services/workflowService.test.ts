import { describe, it, expect, beforeEach, vi } from "vitest";
import workflowService, {
  type ParticipantResponse,
  type SignatureSubmissionRequest,
  type WorkflowSessionResponse,
} from "@app/services/workflowService";
import api from "@app/services/apiClient";
import type { AxiosResponse } from "axios";

// Mock the underlying axios api client so we can assert request shape
// (url, body, params, options) without performing any network I/O.
vi.mock("@app/services/apiClient");

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

/** Build a minimal AxiosResponse wrapper around arbitrary data. */
function axiosResponse<T>(data: T): AxiosResponse<T> {
  return { data } as unknown as AxiosResponse<T>;
}

/** Pull the FormData passed as the body of the most recent api.post call. */
function lastPostFormData(): FormData {
  const call = mockedPost.mock.calls[mockedPost.mock.calls.length - 1];
  return call[1] as FormData;
}

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
  documentName: "doc.pdf",
  status: "IN_PROGRESS",
  finalized: false,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  participants: [sampleParticipant],
  hasProcessedFile: false,
};

describe("WorkflowService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSessionByToken", () => {
    it("issues a GET to the participant session endpoint with the token param", async () => {
      mockedGet.mockResolvedValueOnce(axiosResponse(sampleSession));

      const result = await workflowService.getSessionByToken("tok-123");

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/workflow/participant/session",
        { params: { token: "tok-123" } },
      );
      expect(result).toEqual(sampleSession);
    });

    it("propagates errors from the api client", async () => {
      const err = new Error("boom");
      mockedGet.mockRejectedValueOnce(err);

      await expect(workflowService.getSessionByToken("tok")).rejects.toThrow(
        "boom",
      );
    });
  });

  describe("getParticipantDetails", () => {
    it("issues a GET to the participant details endpoint with the token param", async () => {
      mockedGet.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      const result = await workflowService.getParticipantDetails("tok-abc");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/workflow/participant/details",
        { params: { token: "tok-abc" } },
      );
      expect(result).toEqual(sampleParticipant);
    });
  });

  describe("submitSignature", () => {
    it("appends only the participant token when no optional fields are set", async () => {
      mockedPost.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      const request: SignatureSubmissionRequest = {
        participantToken: "only-token",
      };

      const result = await workflowService.submitSignature(request);

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/workflow/participant/submit-signature");
      expect(body).toBeInstanceOf(FormData);

      const fd = lastPostFormData();
      expect(fd.get("participantToken")).toBe("only-token");
      // None of the optional fields should be present.
      expect(fd.get("certType")).toBeNull();
      expect(fd.get("password")).toBeNull();
      expect(fd.get("p12File")).toBeNull();
      expect(fd.get("jksFile")).toBeNull();
      expect(fd.get("showSignature")).toBeNull();
      expect(fd.get("pageNumber")).toBeNull();
      expect(fd.get("location")).toBeNull();
      expect(fd.get("reason")).toBeNull();
      expect(fd.get("showLogo")).toBeNull();
      expect(fd.get("wetSignatureData")).toBeNull();

      expect(result).toEqual(sampleParticipant);
    });

    it("appends every optional field when all are provided (truthy branches)", async () => {
      mockedPost.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      const p12File = new File(["p12-bytes"], "cert.p12");
      const jksFile = new File(["jks-bytes"], "store.jks");

      const request: SignatureSubmissionRequest = {
        participantToken: "full-token",
        certType: "PKCS12",
        password: "s3cret",
        p12File,
        jksFile,
        showSignature: true,
        pageNumber: 3,
        location: "London",
        reason: "Approval",
        showLogo: true,
        wetSignatureData: "data:image/png;base64,AAAA",
      };

      await workflowService.submitSignature(request);

      const fd = lastPostFormData();
      expect(fd.get("participantToken")).toBe("full-token");
      expect(fd.get("certType")).toBe("PKCS12");
      expect(fd.get("password")).toBe("s3cret");
      expect(fd.get("p12File")).toBe(p12File);
      expect(fd.get("jksFile")).toBe(jksFile);
      expect(fd.get("showSignature")).toBe("true");
      expect(fd.get("pageNumber")).toBe("3");
      expect(fd.get("location")).toBe("London");
      expect(fd.get("reason")).toBe("Approval");
      expect(fd.get("showLogo")).toBe("true");
      expect(fd.get("wetSignatureData")).toBe("data:image/png;base64,AAAA");
    });

    it("serializes explicit false booleans (showSignature/showLogo) but drops falsy pageNumber 0", async () => {
      mockedPost.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      const request: SignatureSubmissionRequest = {
        participantToken: "edge-token",
        // showSignature / showLogo are defined-but-false: the `!== undefined`
        // guard means they should still be serialized.
        showSignature: false,
        showLogo: false,
        // pageNumber 0 is falsy, so the `if (request.pageNumber)` guard skips it.
        pageNumber: 0,
        // Empty strings are falsy and must be skipped by the truthy guards.
        location: "",
        reason: "",
        wetSignatureData: "",
      };

      await workflowService.submitSignature(request);

      const fd = lastPostFormData();
      expect(fd.get("participantToken")).toBe("edge-token");
      expect(fd.get("showSignature")).toBe("false");
      expect(fd.get("showLogo")).toBe("false");
      expect(fd.get("pageNumber")).toBeNull();
      expect(fd.get("location")).toBeNull();
      expect(fd.get("reason")).toBeNull();
      expect(fd.get("wetSignatureData")).toBeNull();
    });

    it("propagates errors from the api client", async () => {
      mockedPost.mockRejectedValueOnce(new Error("submit failed"));

      await expect(
        workflowService.submitSignature({ participantToken: "t" }),
      ).rejects.toThrow("submit failed");
    });
  });

  describe("declineParticipation", () => {
    it("posts a null body with token and reason params when a reason is given", async () => {
      mockedPost.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      const result = await workflowService.declineParticipation(
        "tok-d",
        "Not my document",
      );

      expect(mockedPost).toHaveBeenCalledWith(
        "/api/v1/workflow/participant/decline",
        null,
        { params: { token: "tok-d", reason: "Not my document" } },
      );
      expect(result).toEqual(sampleParticipant);
    });

    it("omits the reason param when none is provided", async () => {
      mockedPost.mockResolvedValueOnce(axiosResponse(sampleParticipant));

      await workflowService.declineParticipation("tok-only");

      expect(mockedPost).toHaveBeenCalledWith(
        "/api/v1/workflow/participant/decline",
        null,
        { params: { token: "tok-only", reason: undefined } },
      );
    });
  });

  describe("getParticipantDocument", () => {
    it("requests the document endpoint as a blob with the token param", async () => {
      const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
      mockedGet.mockResolvedValueOnce(axiosResponse(blob));

      const result = await workflowService.getParticipantDocument("tok-doc");

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/workflow/participant/document",
        { params: { token: "tok-doc" }, responseType: "blob" },
      );
      expect(result).toBe(blob);
    });
  });
});
