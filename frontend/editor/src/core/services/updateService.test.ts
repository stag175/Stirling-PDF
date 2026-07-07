/**
 * Unit tests for UpdateService (updateService.ts).
 *
 * Determinism notes:
 * - `global.fetch` is replaced with a `vi.fn()` in `beforeEach`, so every network
 *   call is fully controlled. No real requests are ever made. Each test sets up
 *   exactly the Response-like object (status + json()/text()) it needs.
 * - `console.log` / `console.error` are stubbed so the service's logging never
 *   pollutes test output and so we can assert error-path logging fires.
 * - `DOWNLOAD_BASE_URL` is imported from the same `@app/constants/downloads`
 *   module the service uses, so URL assertions stay in lock-step with the source.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { DOWNLOAD_BASE_URL } from "@app/constants/downloads";
import {
  UpdateService,
  updateService,
  type MachineInfo,
} from "@app/services/updateService";

/** Build a minimal fetch Response stub exposing the bits the service touches. */
function makeResponse(opts: {
  status: number;
  json?: unknown;
  text?: string;
}): Response {
  return {
    status: opts.status,
    json: vi.fn().mockResolvedValue(opts.json),
    text: vi.fn().mockResolvedValue(opts.text ?? ""),
  } as unknown as Response;
}

/** Convenience MachineInfo factory with sane defaults. */
function machine(overrides: Partial<MachineInfo> = {}): MachineInfo {
  return {
    machineType: "Server-jar",
    activeSecurity: false,
    licenseType: "NORMAL",
    ...overrides,
  };
}

describe("UpdateService", () => {
  let service: UpdateService;
  let fetchMock: Mock;

  beforeEach(() => {
    service = new UpdateService();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("compareVersions", () => {
    it("returns 1 when the first version is greater (patch)", () => {
      expect(service.compareVersions("1.0.1", "1.0.0")).toBe(1);
    });

    it("returns -1 when the first version is lower (minor)", () => {
      expect(service.compareVersions("1.1.0", "1.2.0")).toBe(-1);
    });

    it("returns 0 for equal versions", () => {
      expect(service.compareVersions("2.3.4", "2.3.4")).toBe(0);
    });

    it("compares the major segment first and short-circuits", () => {
      expect(service.compareVersions("2.0.0", "1.9.9")).toBe(1);
    });

    it("treats a longer version with extra non-zero segment as greater", () => {
      // Loop runs while i < v1.length OR i < v2.length, so the trailing ".1"
      // is compared against an implicit 0.
      expect(service.compareVersions("1.0.0.1", "1.0.0")).toBe(1);
    });

    it("treats trailing zero segments as equal (1.0.0.0 == 1.0.0)", () => {
      expect(service.compareVersions("1.0.0.0", "1.0.0")).toBe(0);
    });

    it("coerces non-numeric / missing segments to 0 (NaN || 0 branch)", () => {
      // parseInt('') -> NaN -> 0, so both sides collapse to 0.0.0.
      expect(service.compareVersions("", "")).toBe(0);
      // 'abc' parses to NaN -> 0, compared against 0 -> equal.
      expect(service.compareVersions("abc", "0")).toBe(0);
    });

    it("uses only the leading integer of a mixed segment via parseInt", () => {
      // parseInt('2beta') === 2, so 2 > 1.
      expect(service.compareVersions("2beta.0", "1.0")).toBe(1);
    });
  });

  describe("getDownloadUrl", () => {
    it("returns null for Docker installations", () => {
      expect(service.getDownloadUrl(machine({ machineType: "Docker" }))).toBe(
        null,
      );
    });

    it("returns null for Kubernetes installations", () => {
      expect(
        service.getDownloadUrl(machine({ machineType: "Kubernetes" })),
      ).toBe(null);
    });

    it("returns the plain jar for Server-jar without security", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Server-jar", activeSecurity: false }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}Stirling-PDF.jar`);
    });

    it("returns the with-login jar for Server-jar with security", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Server-jar", activeSecurity: true }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}Stirling-PDF-with-login.jar`);
    });

    it("returns the unix server jar for Client-unix without security", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Client-unix", activeSecurity: false }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}unix-server.jar`);
    });

    it("returns the unix server-security jar for Client-unix with security", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Client-unix", activeSecurity: true }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}unix-server-security.jar`);
    });

    it("returns the Windows installer exe (security flag ignored for win)", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Client-win", activeSecurity: false }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}win-installer.exe`);
      // Security toggled on still yields the same installer for win.
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Client-win", activeSecurity: true }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}win-installer.exe`);
    });

    it("returns the macOS installer dmg", () => {
      expect(
        service.getDownloadUrl(
          machine({ machineType: "Client-mac", activeSecurity: false }),
        ),
      ).toBe(`${DOWNLOAD_BASE_URL}mac-installer.dmg`);
    });

    it("returns null for an unknown Client OS (falls through the if/else chain)", () => {
      expect(
        service.getDownloadUrl(machine({ machineType: "Client-solaris" })),
      ).toBe(null);
    });

    it("returns null for a machine type that matches no known branch", () => {
      expect(
        service.getDownloadUrl(machine({ machineType: "Unknown-thing" })),
      ).toBe(null);
    });
  });

  describe("getUpdateSummary", () => {
    it("returns parsed summary data on a 200 response and maps NORMAL -> normal", async () => {
      const summary = {
        latest_version: "2.0.0",
        max_priority: "normal",
        any_breaking: false,
      };
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: summary }));

      const result = await service.getUpdateSummary(
        "1.0.0",
        machine({ licenseType: "NORMAL", activeSecurity: false }),
      );

      expect(result).toEqual(summary);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("from=1.0.0");
      expect(calledUrl).toContain("type=normal");
      expect(calledUrl).toContain("login=false");
      expect(calledUrl).toContain("summary=true");
    });

    it("maps SERVER license to type=server and forwards activeSecurity=true", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: {} }));

      await service.getUpdateSummary(
        "1.2.3",
        machine({ licenseType: "SERVER", activeSecurity: true }),
      );

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("type=server");
      expect(calledUrl).toContain("login=true");
    });

    it("maps ENTERPRISE license to type=enterprise", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: {} }));

      await service.getUpdateSummary(
        "1.2.3",
        machine({ licenseType: "ENTERPRISE" }),
      );

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("type=enterprise");
    });

    it("returns null and logs error on a non-200 response", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 500 }));

      const result = await service.getUpdateSummary("1.0.0", machine());

      expect(result).toBe(null);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to fetch update summary from Supabase:",
        500,
      );
    });

    it("returns null and logs error when fetch rejects", async () => {
      const boom = new Error("network down");
      fetchMock.mockRejectedValue(boom);

      const result = await service.getUpdateSummary("1.0.0", machine());

      expect(result).toBe(null);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to fetch update summary from Supabase:",
        boom,
      );
    });
  });

  describe("getFullUpdateInfo", () => {
    it("returns parsed info on a 200 response with summary=false in the URL", async () => {
      const info = {
        latest_version: "3.0.0",
        new_versions: [],
      };
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: info }));

      const result = await service.getFullUpdateInfo(
        "2.5.0",
        machine({ licenseType: "NORMAL" }),
      );

      expect(result).toEqual(info);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("from=2.5.0");
      expect(calledUrl).toContain("type=normal");
      expect(calledUrl).toContain("summary=false");
    });

    it("maps SERVER license to type=server", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: {} }));

      await service.getFullUpdateInfo(
        "2.5.0",
        machine({ licenseType: "SERVER" }),
      );

      expect(fetchMock.mock.calls[0][0] as string).toContain("type=server");
    });

    it("maps ENTERPRISE license to type=enterprise", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 200, json: {} }));

      await service.getFullUpdateInfo(
        "2.5.0",
        machine({ licenseType: "ENTERPRISE" }),
      );

      expect(fetchMock.mock.calls[0][0] as string).toContain("type=enterprise");
    });

    it("returns null and logs error on a non-200 response", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 404 }));

      const result = await service.getFullUpdateInfo("2.5.0", machine());

      expect(result).toBe(null);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to fetch full update info from Supabase:",
        404,
      );
    });

    it("returns null and logs error when fetch rejects", async () => {
      const boom = new Error("timeout");
      fetchMock.mockRejectedValue(boom);

      const result = await service.getFullUpdateInfo("2.5.0", machine());

      expect(result).toBe(null);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to fetch full update info from Supabase:",
        boom,
      );
    });
  });

  describe("getCurrentVersionFromGitHub", () => {
    it("extracts the version from a matching build.gradle on a 200 response", async () => {
      const gradle = `plugins { id 'java' }\nversion = '1.4.2'\n`;
      fetchMock.mockResolvedValue(makeResponse({ status: 200, text: gradle }));

      const result = await service.getCurrentVersionFromGitHub();

      expect(result).toBe("1.4.2");
    });

    it("supports double-quoted version declarations", async () => {
      const gradle = `version = "10.20.30"`;
      fetchMock.mockResolvedValue(makeResponse({ status: 200, text: gradle }));

      expect(await service.getCurrentVersionFromGitHub()).toBe("10.20.30");
    });

    it("returns empty string when 200 but no version match is found", async () => {
      // No version line -> regex fails -> throws -> caught -> "".
      fetchMock.mockResolvedValue(
        makeResponse({ status: 200, text: "no version here" }),
      );

      const result = await service.getCurrentVersionFromGitHub();

      expect(result).toBe("");
      expect(console.error).toHaveBeenCalled();
    });

    it("returns empty string on a non-200 response (throws then caught)", async () => {
      fetchMock.mockResolvedValue(makeResponse({ status: 503, text: "" }));

      const result = await service.getCurrentVersionFromGitHub();

      expect(result).toBe("");
      expect(console.error).toHaveBeenCalledWith(
        "Failed to fetch latest version from build.gradle:",
        expect.any(Error),
      );
    });

    it("returns empty string when fetch itself rejects", async () => {
      fetchMock.mockRejectedValue(new Error("dns failure"));

      const result = await service.getCurrentVersionFromGitHub();

      expect(result).toBe("");
    });
  });

  describe("module singleton", () => {
    it("exports a ready-to-use updateService instance", () => {
      expect(updateService).toBeInstanceOf(UpdateService);
      expect(updateService.compareVersions("1.0.0", "1.0.0")).toBe(0);
    });
  });
});
