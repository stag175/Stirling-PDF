import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the apiClient default export. These vi.fns are reused across every test
// and reset in beforeEach so each test controls its own resolved/rejected value.
// vi.hoisted runs before the hoisted vi.mock factory, so the fns are initialized
// in time to be referenced inside the factory.
const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}));

// Default supabaseClient mock: NOT configured. The deleteUser supabase branch is
// exercised separately via vi.resetModules + vi.doMock so we can flip these values.
vi.mock("@app/services/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

import { userManagementService } from "@app/services/userManagementService";
import type {
  AdminSettingsData,
  CreateUserRequest,
  InviteUsersResponse,
  InviteLinkResponse,
  InviteToken,
  User,
} from "@app/services/userManagementService";

// Helper to read all key/value pairs out of a FormData captured by a mock call.
function formDataEntries(fd: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of (fd as FormData).entries()) {
    out[key] = String(value);
  }
  return out;
}

describe("userManagementService", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUsers", () => {
    it("returns the response data from the admin-settings endpoint", async () => {
      const data = {
        users: [],
        userSessions: {},
        userLastRequest: {},
        totalUsers: 0,
        activeUsers: 0,
        disabledUsers: 0,
        maxAllowedUsers: 5,
        availableSlots: 5,
        licenseMaxUsers: 5,
        premiumEnabled: true,
      } as AdminSettingsData;
      mockGet.mockResolvedValue({ data });

      const result = await userManagementService.getUsers();

      expect(result).toBe(data);
      expect(mockGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/admin-settings",
      );
    });

    it("propagates errors from the api client", async () => {
      mockGet.mockRejectedValue(new Error("boom"));
      await expect(userManagementService.getUsers()).rejects.toThrow("boom");
    });
  });

  describe("getUsersWithoutTeam", () => {
    it("returns the list of users without a team", async () => {
      const users: User[] = [
        { id: 1, username: "alice", roleName: "user", enabled: true },
      ];
      mockGet.mockResolvedValue({ data: users });

      const result = await userManagementService.getUsersWithoutTeam();

      expect(result).toBe(users);
      expect(mockGet).toHaveBeenCalledWith("/api/v1/users/without-team");
    });
  });

  describe("createUser", () => {
    it("builds FormData with all optional fields when provided", async () => {
      mockPost.mockResolvedValue({ data: undefined });
      const req: CreateUserRequest = {
        username: "bob",
        password: "secret",
        role: "ROLE_ADMIN",
        teamId: 42,
        authType: "password",
        forceChange: true,
      };

      await userManagementService.createUser(req);

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/saveUser");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataEntries(body)).toEqual({
        username: "bob",
        password: "secret",
        role: "ROLE_ADMIN",
        teamId: "42",
        authType: "password",
        forceChange: "true",
      });
    });

    it("omits optional fields when password/teamId absent and forceChange undefined", async () => {
      mockPost.mockResolvedValue({ data: undefined });
      const req: CreateUserRequest = {
        username: "carol",
        role: "ROLE_USER",
        authType: "SSO",
      };

      await userManagementService.createUser(req);

      const body = mockPost.mock.calls[0][1];
      expect(formDataEntries(body)).toEqual({
        username: "carol",
        role: "ROLE_USER",
        authType: "SSO",
      });
    });

    it("includes forceChange=false when explicitly false", async () => {
      mockPost.mockResolvedValue({ data: undefined });

      await userManagementService.createUser({
        username: "dan",
        role: "ROLE_USER",
        authType: "password",
        forceChange: false,
      });

      expect(formDataEntries(mockPost.mock.calls[0][1]).forceChange).toBe(
        "false",
      );
    });
  });

  describe("updateUserRole", () => {
    it("appends teamId when provided", async () => {
      mockPost.mockResolvedValue({ data: undefined });

      await userManagementService.updateUserRole({
        username: "eve",
        role: "ROLE_ADMIN",
        teamId: 7,
      });

      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changeRole");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataEntries(body)).toEqual({
        username: "eve",
        role: "ROLE_ADMIN",
        teamId: "7",
      });
    });

    it("omits teamId when not provided", async () => {
      mockPost.mockResolvedValue({ data: undefined });

      await userManagementService.updateUserRole({
        username: "frank",
        role: "ROLE_USER",
      });

      expect(formDataEntries(mockPost.mock.calls[0][1])).toEqual({
        username: "frank",
        role: "ROLE_USER",
      });
    });
  });

  describe("toggleUserEnabled", () => {
    it("posts enabled=true to the per-username endpoint", async () => {
      mockPost.mockResolvedValue({ data: undefined });

      await userManagementService.toggleUserEnabled("grace", true);

      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changeUserEnabled/grace");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataEntries(body)).toEqual({ enabled: "true" });
    });

    it("posts enabled=false", async () => {
      mockPost.mockResolvedValue({ data: undefined });

      await userManagementService.toggleUserEnabled("heidi", false);

      expect(formDataEntries(mockPost.mock.calls[0][1])).toEqual({
        enabled: "false",
      });
    });
  });

  describe("deleteUser (supabase not configured)", () => {
    it("resolves to undefined without calling supabase or the api client", async () => {
      const user: User = {
        id: 1,
        username: "ivan",
        email: "ivan@example.com",
        roleName: "user",
        enabled: true,
      };

      const result = await userManagementService.deleteUser(user);

      expect(result).toBeUndefined();
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("inviteUsers", () => {
    it("returns the response data and appends teamId when provided", async () => {
      const data: InviteUsersResponse = {
        successCount: 2,
        failureCount: 0,
      };
      mockPost.mockResolvedValue({ data });

      const result = await userManagementService.inviteUsers({
        emails: "a@x.com,b@x.com",
        role: "ROLE_USER",
        teamId: 3,
      });

      expect(result).toBe(data);
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/inviteUsers");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataEntries(body)).toEqual({
        emails: "a@x.com,b@x.com",
        role: "ROLE_USER",
        teamId: "3",
      });
    });

    it("omits teamId when not provided", async () => {
      mockPost.mockResolvedValue({
        data: { successCount: 0, failureCount: 1 } as InviteUsersResponse,
      });

      await userManagementService.inviteUsers({
        emails: "c@x.com",
        role: "ROLE_USER",
      });

      expect(formDataEntries(mockPost.mock.calls[0][1])).toEqual({
        emails: "c@x.com",
        role: "ROLE_USER",
      });
    });
  });

  describe("generateInviteLink", () => {
    it("appends every optional field when present", async () => {
      const data: InviteLinkResponse = {
        token: "tok",
        inviteUrl: "https://x/invite/tok",
        email: "j@x.com",
        expiresAt: "2026-01-01",
        expiryHours: 24,
      };
      mockPost.mockResolvedValue({ data });

      const result = await userManagementService.generateInviteLink({
        email: "j@x.com",
        role: "ROLE_USER",
        teamId: 9,
        expiryHours: 24,
        sendEmail: true,
      });

      expect(result).toBe(data);
      const [url, body, config] = mockPost.mock.calls[0];
      expect(url).toBe("/api/v1/invite/generate");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataEntries(body)).toEqual({
        email: "j@x.com",
        role: "ROLE_USER",
        teamId: "9",
        expiryHours: "24",
        sendEmail: "true",
      });
    });

    it("omits email when it is only whitespace and omits other optionals", async () => {
      mockPost.mockResolvedValue({
        data: {
          token: "t",
          inviteUrl: "u",
          email: "",
          expiresAt: "",
          expiryHours: 0,
        } as InviteLinkResponse,
      });

      await userManagementService.generateInviteLink({
        email: "   ",
        role: "ROLE_USER",
      });

      expect(formDataEntries(mockPost.mock.calls[0][1])).toEqual({
        role: "ROLE_USER",
      });
    });

    it("includes sendEmail=false when explicitly false and omits email when undefined", async () => {
      mockPost.mockResolvedValue({
        data: {
          token: "t",
          inviteUrl: "u",
          email: "",
          expiresAt: "",
          expiryHours: 0,
        } as InviteLinkResponse,
      });

      await userManagementService.generateInviteLink({
        role: "ROLE_USER",
        sendEmail: false,
      });

      expect(formDataEntries(mockPost.mock.calls[0][1])).toEqual({
        role: "ROLE_USER",
        sendEmail: "false",
      });
    });
  });

  describe("getInviteLinks", () => {
    it("unwraps the invites array from the response", async () => {
      const invites: InviteToken[] = [
        {
          id: 1,
          email: "k@x.com",
          role: "ROLE_USER",
          createdBy: "admin",
          createdAt: "2026-01-01",
          expiresAt: "2026-01-02",
        },
      ];
      mockGet.mockResolvedValue({ data: { invites } });

      const result = await userManagementService.getInviteLinks();

      expect(result).toBe(invites);
      expect(mockGet).toHaveBeenCalledWith("/api/v1/invite/list");
    });
  });

  describe("revokeInviteLink", () => {
    it("deletes the invite by id with suppressed error toast", async () => {
      mockDelete.mockResolvedValue({ data: undefined });

      await userManagementService.revokeInviteLink(55);

      expect(mockDelete).toHaveBeenCalledWith("/api/v1/invite/revoke/55", {
        suppressErrorToast: true,
      });
    });
  });

  describe("cleanupExpiredInvites", () => {
    it("returns the deletedCount payload", async () => {
      mockPost.mockResolvedValue({ data: { deletedCount: 3 } });

      const result = await userManagementService.cleanupExpiredInvites();

      expect(result).toEqual({ deletedCount: 3 });
      expect(mockPost).toHaveBeenCalledWith("/api/v1/invite/cleanup");
    });
  });

  // The supabase-configured branch of deleteUser reads module-level constants
  // (isSupabaseConfigured + supabase) that are fixed at import time. We isolate
  // the module registry, re-mock supabaseClient as "configured", and re-import a
  // fresh copy of the service so those branches execute.
  describe("deleteUser (supabase configured)", () => {
    const invoke = vi.fn();

    async function loadConfiguredService() {
      vi.resetModules();
      vi.doMock("@app/services/apiClient", () => ({
        default: { get: mockGet, post: mockPost, delete: mockDelete },
      }));
      vi.doMock("@app/services/supabaseClient", () => ({
        isSupabaseConfigured: true,
        supabase: { functions: { invoke } },
      }));
      const mod = await import("@app/services/userManagementService");
      return mod.userManagementService;
    }

    beforeEach(() => {
      invoke.mockReset();
    });

    afterEach(() => {
      vi.doUnmock("@app/services/apiClient");
      vi.doUnmock("@app/services/supabaseClient");
      vi.resetModules();
    });

    it("throws when the user has no email", async () => {
      const service = await loadConfiguredService();
      const user: User = {
        id: 2,
        username: "noemail",
        roleName: "user",
        enabled: true,
      };

      await expect(service.deleteUser(user)).rejects.toThrow(
        "Email missing for this user. Please contact support for manual removal.",
      );
      expect(invoke).not.toHaveBeenCalled();
    });

    it("invokes the delete-user function with notify_user defaulting to true", async () => {
      invoke.mockResolvedValue({ error: null });
      const service = await loadConfiguredService();
      const user: User = {
        id: 3,
        username: "withmail",
        email: "withmail@example.com",
        roleName: "user",
        enabled: true,
      };

      await expect(service.deleteUser(user)).resolves.toBeUndefined();
      expect(invoke).toHaveBeenCalledWith("delete-user", {
        body: { target_email: "withmail@example.com", notify_user: true },
      });
    });

    it("passes through an explicit notifyUser option of false", async () => {
      invoke.mockResolvedValue({ error: null });
      const service = await loadConfiguredService();
      const user: User = {
        id: 4,
        username: "quiet",
        email: "quiet@example.com",
        roleName: "user",
        enabled: true,
      };

      await service.deleteUser(user, { notifyUser: false });

      expect(invoke).toHaveBeenCalledWith("delete-user", {
        body: { target_email: "quiet@example.com", notify_user: false },
      });
    });

    it("throws the supabase error message when invoke returns an error", async () => {
      invoke.mockResolvedValue({ error: { message: "nope" } });
      const service = await loadConfiguredService();
      const user: User = {
        id: 5,
        username: "fail",
        email: "fail@example.com",
        roleName: "user",
        enabled: true,
      };

      await expect(service.deleteUser(user)).rejects.toThrow("nope");
    });

    it("throws a generic message when the supabase error lacks a message", async () => {
      invoke.mockResolvedValue({ error: {} });
      const service = await loadConfiguredService();
      const user: User = {
        id: 6,
        username: "fail2",
        email: "fail2@example.com",
        roleName: "user",
        enabled: true,
      };

      await expect(service.deleteUser(user)).rejects.toThrow(
        "Supabase deletion failed",
      );
    });
  });
});
