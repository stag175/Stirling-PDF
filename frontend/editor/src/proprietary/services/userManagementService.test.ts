import { describe, it, expect, beforeEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import {
  userManagementService,
  type AdminSettingsData,
  type User,
  type InviteUsersResponse,
  type InviteLinkResponse,
  type InviteToken,
} from "@app/services/userManagementService";

// Auto-mock the apiClient (axios instance). This turns get/post/delete into
// vi.fn() stubs, matching the convention used by springAuthClient.test.ts.
vi.mock("@app/services/apiClient");

/**
 * Extract a FormData payload into a plain object of string entries so we can
 * make deterministic assertions about which fields were appended.
 */
function formDataToObject(body: unknown): Record<string, string> {
  expect(body).toBeInstanceOf(FormData);
  const result: Record<string, string> = {};
  for (const [key, value] of (body as FormData).entries()) {
    result[key] = String(value);
  }
  return result;
}

describe("userManagementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUsers", () => {
    it("returns admin settings data from the response", async () => {
      const data: AdminSettingsData = {
        users: [],
        userSessions: {},
        userLastRequest: {},
        totalUsers: 0,
        activeUsers: 0,
        disabledUsers: 0,
        maxAllowedUsers: 5,
        availableSlots: 5,
        grandfatheredUserCount: 0,
        licenseMaxUsers: 5,
        premiumEnabled: false,
        mailEnabled: true,
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data });

      const result = await userManagementService.getUsers();

      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/admin-settings",
      );
      expect(result).toBe(data);
    });

    it("propagates errors from the request", async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("boom"));

      await expect(userManagementService.getUsers()).rejects.toThrow("boom");
    });
  });

  describe("getUsersWithoutTeam", () => {
    it("returns the list of users without a team", async () => {
      const users: User[] = [
        { id: 1, username: "alice", roleName: "user", enabled: true },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: users });

      const result = await userManagementService.getUsersWithoutTeam();

      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/users/without-team");
      expect(result).toEqual(users);
    });
  });

  describe("createUser", () => {
    it("appends every optional field when all are provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.createUser({
        username: "bob",
        password: "secret",
        role: "ROLE_ADMIN",
        teamId: 42,
        authType: "WEB",
        forceChange: true,
        forceMFA: false,
      });

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/saveUser");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        username: "bob",
        password: "secret",
        role: "ROLE_ADMIN",
        teamId: "42",
        authType: "WEB",
        forceChange: "true",
        forceMFA: "false",
      });
    });

    it("omits optional fields when not provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.createUser({
        username: "carol",
        role: "ROLE_USER",
        authType: "OAUTH2",
      });

      const body = vi.mocked(apiClient.post).mock.calls[0][1];
      expect(formDataToObject(body)).toEqual({
        username: "carol",
        role: "ROLE_USER",
        authType: "OAUTH2",
      });
    });

    it("omits teamId when it is zero (falsy)", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.createUser({
        username: "dave",
        role: "ROLE_USER",
        teamId: 0,
        authType: "SAML2",
        forceChange: false,
        forceMFA: true,
      });

      const body = formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]);
      expect(body.teamId).toBeUndefined();
      expect(body.forceChange).toBe("false");
      expect(body.forceMFA).toBe("true");
      expect(body.authType).toBe("SAML2");
    });

    it("propagates request errors", async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("save failed"));

      await expect(
        userManagementService.createUser({
          username: "x",
          role: "ROLE_USER",
          authType: "WEB",
        }),
      ).rejects.toThrow("save failed");
    });
  });

  describe("updateUserRole", () => {
    it("appends teamId when provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.updateUserRole({
        username: "erin",
        role: "ROLE_ADMIN",
        teamId: 7,
      });

      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changeRole");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        username: "erin",
        role: "ROLE_ADMIN",
        teamId: "7",
      });
    });

    it("omits teamId when not provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.updateUserRole({
        username: "frank",
        role: "ROLE_USER",
      });

      expect(
        formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]),
      ).toEqual({
        username: "frank",
        role: "ROLE_USER",
      });
    });
  });

  describe("toggleUserEnabled", () => {
    it("posts enabled=true to the username-scoped endpoint", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.toggleUserEnabled("grace", true);

      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changeUserEnabled/grace");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({ enabled: "true" });
    });

    it("posts enabled=false", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.toggleUserEnabled("heidi", false);

      expect(
        formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]),
      ).toEqual({ enabled: "false" });
    });
  });

  describe("deleteUser", () => {
    it("posts null body to the delete endpoint with suppressed errors", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.deleteUser("ivan");

      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/user/admin/deleteUser/ivan",
        null,
        { suppressErrorToast: true },
      );
    });
  });

  describe("inviteUsers", () => {
    it("appends teamId and returns the response data", async () => {
      const response: InviteUsersResponse = {
        successCount: 2,
        failureCount: 0,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: response });

      const result = await userManagementService.inviteUsers({
        emails: "a@x.com,b@x.com",
        role: "ROLE_USER",
        teamId: 3,
      });

      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/inviteUsers");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        emails: "a@x.com,b@x.com",
        role: "ROLE_USER",
        teamId: "3",
      });
      expect(result).toBe(response);
    });

    it("omits teamId when not provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { successCount: 1, failureCount: 1 },
      });

      await userManagementService.inviteUsers({
        emails: "solo@x.com",
        role: "ROLE_USER",
      });

      expect(
        formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]),
      ).toEqual({
        emails: "solo@x.com",
        role: "ROLE_USER",
      });
    });
  });

  describe("generateInviteLink", () => {
    it("appends all optional fields when present and trimmed email is non-empty", async () => {
      const response: InviteLinkResponse = {
        token: "tok",
        inviteUrl: "https://x/invite",
        email: "user@x.com",
        expiresAt: "2026-01-01T00:00:00Z",
        expiryHours: 24,
      };
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: response });

      const result = await userManagementService.generateInviteLink({
        email: "user@x.com",
        role: "ROLE_USER",
        teamId: 9,
        expiryHours: 24,
        sendEmail: true,
        frontendBaseUrl: "https://app.example.com",
      });

      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/invite/generate");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        email: "user@x.com",
        role: "ROLE_USER",
        teamId: "9",
        expiryHours: "24",
        sendEmail: "true",
        frontendBaseUrl: "https://app.example.com",
      });
      expect(result).toBe(response);
    });

    it("omits email when it is only whitespace and omits other optional fields", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          token: "t",
          inviteUrl: "u",
          email: "",
          expiresAt: "",
          expiryHours: 0,
        },
      });

      await userManagementService.generateInviteLink({
        email: "   ",
        role: "ROLE_USER",
        sendEmail: false,
      });

      const body = formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]);
      expect(body.email).toBeUndefined();
      expect(body.sendEmail).toBe("false");
      expect(body).toEqual({ role: "ROLE_USER", sendEmail: "false" });
    });

    it("omits email when undefined and skips falsy expiryHours/teamId", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          token: "t",
          inviteUrl: "u",
          email: "",
          expiresAt: "",
          expiryHours: 0,
        },
      });

      await userManagementService.generateInviteLink({
        role: "ROLE_ADMIN",
        teamId: 0,
        expiryHours: 0,
      });

      expect(
        formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]),
      ).toEqual({ role: "ROLE_ADMIN" });
    });
  });

  describe("getInviteLinks", () => {
    it("unwraps the invites array from the response", async () => {
      const invites: InviteToken[] = [
        {
          id: 1,
          email: "a@x.com",
          role: "ROLE_USER",
          createdBy: "admin",
          createdAt: "2026-01-01",
          expiresAt: "2026-01-02",
        },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { invites } });

      const result = await userManagementService.getInviteLinks();

      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/invite/list");
      expect(result).toBe(invites);
    });
  });

  describe("revokeInviteLink", () => {
    it("deletes the invite by id with suppressed errors", async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: undefined });

      await userManagementService.revokeInviteLink(55);

      expect(apiClient.delete).toHaveBeenCalledWith(
        "/api/v1/invite/revoke/55",
        {
          suppressErrorToast: true,
        },
      );
    });
  });

  describe("cleanupExpiredInvites", () => {
    it("returns the deleted count from the response", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { deletedCount: 4 },
      });

      const result = await userManagementService.cleanupExpiredInvites();

      expect(apiClient.post).toHaveBeenCalledWith("/api/v1/invite/cleanup");
      expect(result).toEqual({ deletedCount: 4 });
    });
  });

  describe("changeUserPassword", () => {
    it("appends every optional field when all are provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.changeUserPassword({
        username: "judy",
        newPassword: "newpass",
        generateRandom: false,
        sendEmail: true,
        includePassword: false,
        forcePasswordChange: true,
      });

      const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changePasswordForUser");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        username: "judy",
        newPassword: "newpass",
        generateRandom: "false",
        sendEmail: "true",
        includePassword: "false",
        forcePasswordChange: "true",
      });
    });

    it("omits all optional fields when only username is provided", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.changeUserPassword({ username: "mallory" });

      expect(
        formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]),
      ).toEqual({ username: "mallory" });
    });

    it("omits newPassword when it is an empty string but keeps booleans", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.changeUserPassword({
        username: "niaj",
        newPassword: "",
        generateRandom: true,
        sendEmail: false,
        includePassword: true,
        forcePasswordChange: false,
      });

      const body = formDataToObject(vi.mocked(apiClient.post).mock.calls[0][1]);
      expect(body.newPassword).toBeUndefined();
      expect(body).toEqual({
        username: "niaj",
        generateRandom: "true",
        sendEmail: "false",
        includePassword: "true",
        forcePasswordChange: "false",
      });
    });
  });

  describe("unlockUser", () => {
    it("posts null body to the unlock endpoint", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.unlockUser("olivia");

      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/user/admin/unlockUser/olivia",
        null,
        { suppressErrorToast: true },
      );
    });
  });

  describe("disableMfaByAdmin", () => {
    it("url-encodes the username and posts undefined body", async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: undefined });

      await userManagementService.disableMfaByAdmin("peggy sue+admin");

      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/auth/mfa/disable/admin/peggy%20sue%2Badmin",
        undefined,
      );
    });

    it("propagates request errors", async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("mfa failed"));

      await expect(
        userManagementService.disableMfaByAdmin("trent"),
      ).rejects.toThrow("mfa failed");
    });
  });
});
