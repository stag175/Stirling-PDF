import { describe, it, expect, beforeEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import {
  teamService,
  type Team,
  type TeamDetailsUIResponse,
} from "@app/services/teamService";

// Auto-mock the apiClient (axios instance). This turns get/post into vi.fn()
// stubs, matching the convention used by userManagementService.test.ts, so we
// can assert request shape (url, body, config) without any network I/O.
vi.mock("@app/services/apiClient");

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

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

describe("teamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTeams", () => {
    it("unwraps teamsWithCounts from the response data", async () => {
      const teams: Team[] = [
        { id: 1, name: "Alpha", userCount: 3 },
        { id: 2, name: "Beta" },
      ];
      mockedGet.mockResolvedValueOnce({ data: { teamsWithCounts: teams } });

      const result = await teamService.getTeams();

      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/teams",
      );
      expect(result).toBe(teams);
    });

    it("returns an empty list when no teams exist", async () => {
      mockedGet.mockResolvedValueOnce({ data: { teamsWithCounts: [] } });

      const result = await teamService.getTeams();

      expect(result).toEqual([]);
    });

    it("propagates errors from the request", async () => {
      mockedGet.mockRejectedValueOnce(new Error("teams boom"));

      await expect(teamService.getTeams()).rejects.toThrow("teams boom");
    });
  });

  describe("getTeamDetails", () => {
    it("requests the team-scoped endpoint and returns the response data", async () => {
      const details: TeamDetailsUIResponse = {
        team: { id: 5, name: "Gamma", userCount: 1 },
        teamUsers: [
          { id: 10, username: "alice", roleName: "user", enabled: true },
        ],
        availableUsers: [
          { id: 11, username: "bob", roleName: "user", enabled: false },
        ],
        userLastRequest: { alice: 1700000000 },
      };
      mockedGet.mockResolvedValueOnce({ data: details });

      const result = await teamService.getTeamDetails(5);

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/teams/5",
      );
      expect(result).toBe(details);
    });

    it("interpolates the numeric team id into the URL", async () => {
      mockedGet.mockResolvedValueOnce({
        data: {
          team: { id: 0, name: "Default" },
          teamUsers: [],
          availableUsers: [],
        },
      });

      await teamService.getTeamDetails(0);

      expect(mockedGet).toHaveBeenCalledWith(
        "/api/v1/proprietary/ui-data/teams/0",
      );
    });

    it("propagates errors from the request", async () => {
      mockedGet.mockRejectedValueOnce(new Error("details boom"));

      await expect(teamService.getTeamDetails(9)).rejects.toThrow(
        "details boom",
      );
    });
  });

  describe("createTeam", () => {
    it("posts the name as FormData with suppressed errors", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.createTeam("New Team");

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/team/create");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({ name: "New Team" });
    });

    it("preserves an empty name string in the payload", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.createTeam("");

      expect(formDataToObject(mockedPost.mock.calls[0][1])).toEqual({
        name: "",
      });
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("create failed"));

      await expect(teamService.createTeam("x")).rejects.toThrow(
        "create failed",
      );
    });
  });

  describe("renameTeam", () => {
    it("posts teamId (stringified) and newName as FormData", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.renameTeam(42, "Renamed");

      const [url, body, config] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/team/rename");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        teamId: "42",
        newName: "Renamed",
      });
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("rename failed"));

      await expect(teamService.renameTeam(1, "y")).rejects.toThrow(
        "rename failed",
      );
    });
  });

  describe("deleteTeam", () => {
    it("posts the stringified teamId as FormData with suppressed errors", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.deleteTeam(7);

      const [url, body, config] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/team/delete");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({ teamId: "7" });
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("delete failed"));

      await expect(teamService.deleteTeam(3)).rejects.toThrow("delete failed");
    });
  });

  describe("addUserToTeam", () => {
    it("posts both stringified ids as FormData with suppressed errors", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.addUserToTeam(8, 99);

      const [url, body, config] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/team/addUser");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        teamId: "8",
        userId: "99",
      });
    });

    it("stringifies zero ids rather than dropping them", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.addUserToTeam(0, 0);

      expect(formDataToObject(mockedPost.mock.calls[0][1])).toEqual({
        teamId: "0",
        userId: "0",
      });
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("add failed"));

      await expect(teamService.addUserToTeam(1, 2)).rejects.toThrow(
        "add failed",
      );
    });
  });

  describe("moveUserToTeam", () => {
    it("posts username, role and stringified teamId to the changeRole endpoint", async () => {
      mockedPost.mockResolvedValueOnce({ data: undefined });

      await teamService.moveUserToTeam("carol", "ROLE_USER", 1);

      const [url, body, config] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/user/admin/changeRole");
      expect(config).toEqual({ suppressErrorToast: true });
      expect(formDataToObject(body)).toEqual({
        username: "carol",
        role: "ROLE_USER",
        teamId: "1",
      });
    });

    it("propagates request errors", async () => {
      mockedPost.mockRejectedValueOnce(new Error("move failed"));

      await expect(
        teamService.moveUserToTeam("dave", "ROLE_ADMIN", 2),
      ).rejects.toThrow("move failed");
    });
  });
});
