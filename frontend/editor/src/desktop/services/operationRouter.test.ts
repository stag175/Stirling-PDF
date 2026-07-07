/**
 * Unit tests for the OperationRouter singleton (desktop layer).
 *
 * OperationRouter routes operations between the local bundled backend and the
 * SaaS backend based on the current connection mode plus per-endpoint
 * capability checks. All of its collaborators are mockable singletons:
 *   - connectionModeService  (getCurrentMode / getServerConfig)
 *   - tauriBackendService    (getBackendUrl / isOnline)
 *   - endpointAvailabilityService (isEndpointSupportedLocally / *OnSaaS)
 *   - selfHostedServerMonitor (getSnapshot)
 *   - i18n                   (t — used only for fallback error strings)
 *   - the SaaS backend URL constant
 *
 * Every external dep is mocked with vi.mock so the tests are fully
 * deterministic (no network, Tauri, or env access). The default SaaS backend
 * URL constant is mocked to a real value; the "not configured" branches are
 * exercised in an isolated module registry via vi.resetModules + vi.doMock so
 * the global mock is never mutated.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- collaborator mocks -----------------------------------------------------

const getCurrentMode = vi.fn<() => Promise<string>>();
const getServerConfig =
  vi.fn<() => Promise<{ url: string } | null | undefined>>();
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => getCurrentMode(),
    getServerConfig: () => getServerConfig(),
  },
}));

const getBackendUrl = vi.fn<() => string | null | undefined>();
const backendState = { isOnline: false };
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    getBackendUrl: () => getBackendUrl(),
    get isOnline() {
      return backendState.isOnline;
    },
  },
}));

const isEndpointSupportedLocally =
  vi.fn<(name: string, url?: string | null) => Promise<boolean>>();
const isEndpointSupportedOnSaaS = vi.fn<(name: string) => Promise<boolean>>();
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: (name: string, url?: string | null) =>
      isEndpointSupportedLocally(name, url),
    isEndpointSupportedOnSaaS: (name: string) =>
      isEndpointSupportedOnSaaS(name),
  },
}));

const getSnapshot = vi.fn<() => { status: string }>();
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => getSnapshot(),
  },
}));

// i18n.t(key, fallback, interpolation?) -> return the fallback with naive
// {{var}} interpolation so the self-hosted-offline error message is assertable.
vi.mock("@app/i18n", () => ({
  default: {
    t: (_key: string, fallback: string, vars?: Record<string, unknown>) => {
      if (!vars) return fallback;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
        String(vars[name] ?? ""),
      );
    },
  },
}));

// NOTE: vi.mock factories are hoisted above all top-level code, so the URL must
// be inlined here. SAAS_URL below mirrors it for assertions.
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://saas.example.com",
}));

const SAAS_URL = "https://saas.example.com";

import {
  operationRouter,
  OperationRouter,
} from "@app/services/operationRouter";

beforeEach(() => {
  vi.clearAllMocks();
  backendState.isOnline = false;
  // Sensible defaults; individual tests override as needed.
  getCurrentMode.mockResolvedValue("local");
  getServerConfig.mockResolvedValue(null);
  getBackendUrl.mockReturnValue("http://localhost:8080/");
  isEndpointSupportedLocally.mockResolvedValue(true);
  isEndpointSupportedOnSaaS.mockResolvedValue(true);
  getSnapshot.mockReturnValue({ status: "online" });
});

describe("OperationRouter singleton", () => {
  it("getInstance returns the same instance and the exported singleton", () => {
    const a = OperationRouter.getInstance();
    const b = OperationRouter.getInstance();
    expect(a).toBe(b);
    expect(operationRouter).toBe(a);
  });
});

describe("getExecutionTarget", () => {
  it("routes saas mode to local", async () => {
    getCurrentMode.mockResolvedValue("saas");
    expect(await operationRouter.getExecutionTarget()).toBe("local");
  });

  it("routes local mode to local", async () => {
    getCurrentMode.mockResolvedValue("local");
    expect(await operationRouter.getExecutionTarget("/api/v1/general/x")).toBe(
      "local",
    );
  });

  it("routes selfhosted mode to remote", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    expect(await operationRouter.getExecutionTarget()).toBe("remote");
  });

  it("routes an unknown mode to remote (default branch)", async () => {
    getCurrentMode.mockResolvedValue("mystery");
    expect(await operationRouter.getExecutionTarget()).toBe("remote");
  });
});

describe("isSelfHostedMode / isSaaSMode", () => {
  it("isSelfHostedMode is true only for selfhosted", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    expect(await operationRouter.isSelfHostedMode()).toBe(true);
    getCurrentMode.mockResolvedValue("local");
    expect(await operationRouter.isSelfHostedMode()).toBe(false);
  });

  it("isSaaSMode is true only for saas", async () => {
    getCurrentMode.mockResolvedValue("saas");
    expect(await operationRouter.isSaaSMode()).toBe(true);
    getCurrentMode.mockResolvedValue("selfhosted");
    expect(await operationRouter.isSaaSMode()).toBe(false);
  });
});

describe("getBaseUrl — local mode", () => {
  it("returns the trimmed backend URL for a non-tool operation", async () => {
    getCurrentMode.mockResolvedValue("local");
    getBackendUrl.mockReturnValue("http://localhost:9000/");
    const url = await operationRouter.getBaseUrl("/api/v1/team/users");
    expect(url).toBe("http://localhost:9000");
    // Non-tool endpoint => no capability lookup.
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("returns local backend URL for a tool endpoint supported locally", async () => {
    getCurrentMode.mockResolvedValue("local");
    isEndpointSupportedLocally.mockResolvedValue(true);
    getBackendUrl.mockReturnValue("http://localhost:8080");
    const url = await operationRouter.getBaseUrl("/api/v1/misc/repair");
    expect(url).toBe("http://localhost:8080");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "repair",
      "http://localhost:8080",
    );
  });

  it("dispatches a navigate event and throws when a tool is unsupported locally", async () => {
    getCurrentMode.mockResolvedValue("local");
    isEndpointSupportedLocally.mockResolvedValue(false);
    getBackendUrl.mockReturnValue("http://localhost:8080");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/repair"),
    ).rejects.toThrow(/requires an account/i);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const evt = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe("appConfig:navigate");
    expect(evt.detail).toEqual({ key: "connectionMode" });
    dispatchSpy.mockRestore();
  });

  it("skips the capability check when the backend URL is not yet available (tool endpoint)", async () => {
    getCurrentMode.mockResolvedValue("local");
    // First getBackendUrl call (inside the tool branch) returns null, so the
    // capability check is skipped; the second call also returns null => throw.
    getBackendUrl.mockReturnValue(null);
    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/repair"),
    ).rejects.toThrow(/Backend URL not available/);
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("throws when the backend URL is missing for a non-tool operation", async () => {
    getCurrentMode.mockResolvedValue("local");
    getBackendUrl.mockReturnValue(undefined);
    await expect(operationRouter.getBaseUrl()).rejects.toThrow(
      /Backend URL not available/,
    );
  });
});

describe("getBaseUrl — saas mode (team / SaaS-backend endpoints)", () => {
  it("routes team endpoints straight to the SaaS backend (trimmed)", async () => {
    getCurrentMode.mockResolvedValue("saas");
    const url = await operationRouter.getBaseUrl("/api/v1/team/list");
    expect(url).toBe(SAAS_URL);
    // Team endpoints bypass the capability lookup entirely.
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("routes auth endpoints to the SaaS backend", async () => {
    getCurrentMode.mockResolvedValue("saas");
    const url = await operationRouter.getBaseUrl("/api/v1/auth/login");
    expect(url).toBe(SAAS_URL);
  });
});

describe("getBaseUrl — saas mode (tool capability routing)", () => {
  it("routes to local backend when the tool is supported locally and backend healthy", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080/");
    isEndpointSupportedLocally.mockResolvedValue(true);
    const url = await operationRouter.getBaseUrl("/api/v1/general/merge-pdfs");
    expect(url).toBe("http://localhost:8080");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "merge-pdfs",
      "http://localhost:8080/",
    );
    // Supported locally => no SaaS fallback lookup.
    expect(isEndpointSupportedOnSaaS).not.toHaveBeenCalled();
  });

  it("routes to SaaS when unsupported locally but supported on SaaS", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(false);
    isEndpointSupportedOnSaaS.mockResolvedValue(true);
    const url = await operationRouter.getBaseUrl("/api/v1/misc/repair");
    expect(url).toBe(SAAS_URL);
    expect(isEndpointSupportedOnSaaS).toHaveBeenCalledWith("repair");
  });

  it("throws when unsupported both locally and on SaaS", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(false);
    isEndpointSupportedOnSaaS.mockResolvedValue(false);
    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/repair"),
    ).rejects.toThrow(/not available/);
  });

  it("falls through to local routing when the local backend is not healthy yet", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = false; // not healthy => skip capability block
    getBackendUrl.mockReturnValue("http://localhost:7000/");
    const url = await operationRouter.getBaseUrl("/api/v1/security/sanitize");
    // Falls through to getExecutionTarget('saas') => 'local' => backend URL.
    expect(url).toBe("http://localhost:7000");
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("falls through to local routing when backendUrl is null even if healthy", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    // Tool branch sees null url -> skip; final local branch also null -> throw.
    getBackendUrl.mockReturnValue(null);
    await expect(
      operationRouter.getBaseUrl("/api/v1/filter/filter-page"),
    ).rejects.toThrow(/Backend URL not available/);
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("extracts ui-data endpoint names for the capability check", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(true);
    await operationRouter.getBaseUrl("/api/v1/ui-data/ocr-pdf");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "ocr-pdf",
      "http://localhost:8080",
    );
  });

  it("resolves convert endpoint names from CONVERSION_ENDPOINTS constants", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(true);
    // /api/v1/convert/pdf/presentation maps to "pdf-to-presentation".
    await operationRouter.getBaseUrl("/api/v1/convert/pdf/presentation");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "pdf-to-presentation",
      "http://localhost:8080",
    );
  });

  it("falls back to pattern extraction for unknown convert endpoints", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(true);
    // Not present in CONVERSION_ENDPOINTS => "{from}-to-{to}".
    await operationRouter.getBaseUrl("/api/v1/convert/foo/bar");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "foo-to-bar",
      "http://localhost:8080",
    );
  });
});

describe("getBaseUrl — selfhosted offline fallback", () => {
  it("routes to local backend when server offline and tool supported locally", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getSnapshot.mockReturnValue({ status: "offline" });
    getBackendUrl.mockReturnValue("http://localhost:8080/");
    isEndpointSupportedLocally.mockResolvedValue(true);
    const url = await operationRouter.getBaseUrl("/api/v1/misc/repair");
    expect(url).toBe("http://localhost:8080");
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "repair",
      "http://localhost:8080/",
    );
  });

  it("throws a localized message when offline and tool unsupported locally", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getSnapshot.mockReturnValue({ status: "offline" });
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(false);
    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/repair"),
    ).rejects.toThrow(/"repair" is not available on the local backend/);
  });

  it("throws when offline and no local backend URL is available", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getSnapshot.mockReturnValue({ status: "offline" });
    getBackendUrl.mockReturnValue(null);
    await expect(
      operationRouter.getBaseUrl("/api/v1/general/merge-pdfs"),
    ).rejects.toThrow(/not available on the local backend/);
    expect(isEndpointSupportedLocally).not.toHaveBeenCalled();
  });

  it("falls through to remote routing when the self-hosted server is online", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getSnapshot.mockReturnValue({ status: "online" });
    getServerConfig.mockResolvedValue({ url: "https://remote.example.com/" });
    const url = await operationRouter.getBaseUrl("/api/v1/misc/repair");
    // Online => skip offline block => getExecutionTarget => 'remote' => config.
    expect(url).toBe("https://remote.example.com");
    expect(getSnapshot).toHaveBeenCalled();
  });
});

describe("getBaseUrl — remote routing", () => {
  it("returns the trimmed remote server URL from config", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getServerConfig.mockResolvedValue({ url: "https://server.example.com/" });
    // Non-tool endpoint so the selfhosted offline block is skipped entirely.
    const url = await operationRouter.getBaseUrl("/api/v1/team/info");
    expect(url).toBe("https://server.example.com");
  });

  it("throws when no server config is found in remote mode", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    getServerConfig.mockResolvedValue(null);
    await expect(
      operationRouter.getBaseUrl("/api/v1/team/info"),
    ).rejects.toThrow(/Server configuration not found/);
  });
});

describe("shouldSkipBackendReadyCheck", () => {
  it("returns true for team/SaaS-backend endpoints regardless of mode", async () => {
    getCurrentMode.mockResolvedValue("local");
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/team/list"),
    ).toBe(true);
  });

  it("returns false for an undefined endpoint", async () => {
    getCurrentMode.mockResolvedValue("saas");
    expect(await operationRouter.shouldSkipBackendReadyCheck()).toBe(false);
  });

  it("returns false for a tool endpoint when backend not ready (no url)", async () => {
    getCurrentMode.mockResolvedValue("saas");
    getBackendUrl.mockReturnValue(null);
    backendState.isOnline = true;
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/repair"),
    ).toBe(false);
  });

  it("returns false for a tool endpoint when backend not online", async () => {
    getCurrentMode.mockResolvedValue("saas");
    getBackendUrl.mockReturnValue("http://localhost:8080");
    backendState.isOnline = false;
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/repair"),
    ).toBe(false);
  });

  it("returns true (skip) when tool not supported locally", async () => {
    getCurrentMode.mockResolvedValue("saas");
    getBackendUrl.mockReturnValue("http://localhost:8080");
    backendState.isOnline = true;
    isEndpointSupportedLocally.mockResolvedValue(false);
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/repair"),
    ).toBe(true);
  });

  it("returns false (don't skip) when tool IS supported locally", async () => {
    getCurrentMode.mockResolvedValue("saas");
    getBackendUrl.mockReturnValue("http://localhost:8080");
    backendState.isOnline = true;
    isEndpointSupportedLocally.mockResolvedValue(true);
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/repair"),
    ).toBe(false);
  });

  it("returns false for a tool endpoint when not in saas mode", async () => {
    getCurrentMode.mockResolvedValue("local");
    expect(
      await operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/repair"),
    ).toBe(false);
  });
});

describe("willRouteToSaaS", () => {
  it("returns false in selfhosted mode (not saas/local)", async () => {
    getCurrentMode.mockResolvedValue("selfhosted");
    expect(await operationRouter.willRouteToSaaS("/api/v1/misc/repair")).toBe(
      false,
    );
  });

  it("returns true for team endpoints in saas mode", async () => {
    getCurrentMode.mockResolvedValue("saas");
    expect(await operationRouter.willRouteToSaaS("/api/v1/team/list")).toBe(
      true,
    );
  });

  it("returns true for tool endpoints not supported locally (local mode badge)", async () => {
    getCurrentMode.mockResolvedValue("local");
    isEndpointSupportedLocally.mockResolvedValue(false);
    getBackendUrl.mockReturnValue("http://localhost:8080");
    expect(await operationRouter.willRouteToSaaS("/api/v1/misc/repair")).toBe(
      true,
    );
    expect(isEndpointSupportedLocally).toHaveBeenCalledWith(
      "repair",
      "http://localhost:8080",
    );
  });

  it("returns false for tool endpoints supported locally", async () => {
    getCurrentMode.mockResolvedValue("saas");
    isEndpointSupportedLocally.mockResolvedValue(true);
    getBackendUrl.mockReturnValue("http://localhost:8080");
    expect(await operationRouter.willRouteToSaaS("/api/v1/general/merge")).toBe(
      false,
    );
  });

  it("returns false for a non-tool, non-team endpoint", async () => {
    getCurrentMode.mockResolvedValue("saas");
    expect(
      await operationRouter.willRouteToSaaS("/api/v1/config/settings"),
    ).toBe(false);
  });
});

// --- isolated-registry tests for the "SaaS URL not configured" branches -----
// These re-import the module with STIRLING_SAAS_BACKEND_API_URL mocked to an
// empty string so the module-level constant is falsy at evaluation time.
describe("getBaseUrl — SaaS backend URL not configured", () => {
  async function loadWithEmptySaasUrl() {
    vi.resetModules();
    vi.doMock("@app/constants/connection", () => ({
      STIRLING_SAAS_BACKEND_API_URL: "",
    }));
    vi.doMock("@app/services/connectionModeService", () => ({
      connectionModeService: {
        getCurrentMode: () => getCurrentMode(),
        getServerConfig: () => getServerConfig(),
      },
    }));
    vi.doMock("@app/services/tauriBackendService", () => ({
      tauriBackendService: {
        getBackendUrl: () => getBackendUrl(),
        get isOnline() {
          return backendState.isOnline;
        },
      },
    }));
    vi.doMock("@app/services/endpointAvailabilityService", () => ({
      endpointAvailabilityService: {
        isEndpointSupportedLocally: (name: string, url?: string | null) =>
          isEndpointSupportedLocally(name, url),
        isEndpointSupportedOnSaaS: (name: string) =>
          isEndpointSupportedOnSaaS(name),
      },
    }));
    vi.doMock("@app/services/selfHostedServerMonitor", () => ({
      selfHostedServerMonitor: { getSnapshot: () => getSnapshot() },
    }));
    vi.doMock("@app/i18n", () => ({
      default: { t: (_k: string, fb: string) => fb },
    }));
    const mod = await import("@app/services/operationRouter");
    return mod.operationRouter;
  }

  it("throws on team endpoint when SaaS URL missing", async () => {
    getCurrentMode.mockResolvedValue("saas");
    const router = await loadWithEmptySaasUrl();
    await expect(router.getBaseUrl("/api/v1/team/list")).rejects.toThrow(
      /VITE_SAAS_BACKEND_API_URL not configured/,
    );
    vi.resetModules();
  });

  it("throws when capability fallback needs SaaS but URL missing", async () => {
    getCurrentMode.mockResolvedValue("saas");
    backendState.isOnline = true;
    getBackendUrl.mockReturnValue("http://localhost:8080");
    isEndpointSupportedLocally.mockResolvedValue(false);
    isEndpointSupportedOnSaaS.mockResolvedValue(true);
    const router = await loadWithEmptySaasUrl();
    await expect(router.getBaseUrl("/api/v1/misc/repair")).rejects.toThrow(
      /Cloud processing is required/,
    );
    vi.resetModules();
  });
});
