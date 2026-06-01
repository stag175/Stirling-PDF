/**
 * Unit tests for ConnectionModeService (desktop layer).
 *
 * The service is a singleton state machine that resolves the active connection
 * mode (saas | selfhosted | local) by combining a Rust-side config (fetched via
 * the Tauri `invoke` command "get_connection_config") with a localStorage
 * override flag, and exposes mode-switching, subscription, and an exhaustive
 * multi-stage `testConnection` network diagnostic routine.
 *
 * All external dependencies are mocked with vi.mock for full determinism:
 *   - `@tauri-apps/api/core`        -> invoke / isTauri
 *   - `@tauri-apps/plugin-http`     -> fetch (no real network)
 *   - `@app/services/endpointAvailabilityService` -> clearCache spy
 *   - `@app/services/selfHostedServerMonitor`      -> start spy
 *
 * localStorage is provided by the shared jsdom setup (src/core/setupTests.ts).
 *
 * Because the module instantiates the singleton at import time AND caches its
 * loaded config in instance state (configLoadedOnce / currentConfig), each test
 * loads a FRESH module via vi.resetModules() + dynamic import so no state leaks
 * between cases. Imports use the "@app/*" alias as required by the repo lint
 * rules (for the desktop layer this resolves to src/desktop/*).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- mocks ------------------------------------------------------------------

const invokeMock = vi.fn();
const isTauriMock = vi.fn(() => true);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => isTauriMock(),
}));

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

const clearCacheMock = vi.fn();
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: { clearCache: () => clearCacheMock() },
}));

const monitorStartMock = vi.fn();
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { start: (url: string) => monitorStartMock(url) },
}));

// --- types & helpers --------------------------------------------------------

type ConnectionMode = "saas" | "selfhosted" | "local";

interface ServerConfig {
  url: string;
  enabledOAuthProviders?: unknown[];
  loginMethod?: string;
}

interface ConnectionConfig {
  mode: ConnectionMode;
  server_config: ServerConfig | null;
  lock_connection_mode: boolean;
}

interface DiagnosticResult {
  stage: string;
  success: boolean;
  message: string;
  duration?: number;
}

interface ConnectionTestResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  diagnostics?: DiagnosticResult[];
}

interface ServiceInstance {
  getCurrentConfig(): Promise<ConnectionConfig>;
  getCurrentMode(): Promise<ConnectionMode>;
  getServerConfig(): Promise<ServerConfig | null>;
  subscribeToModeChanges(
    listener: (config: ConnectionConfig) => void,
  ): () => void;
  switchToSaaS(url: string): Promise<void>;
  switchToLocal(): Promise<void>;
  switchToSelfHosted(serverConfig: ServerConfig): Promise<void>;
  testConnection(url: string): Promise<ConnectionTestResult>;
  isFirstLaunch(): Promise<boolean>;
  resetSetupCompletion(): Promise<void>;
}

interface ServiceModule {
  ConnectionModeService: {
    getInstance(): ServiceInstance;
  };
  connectionModeService: ServiceInstance;
  LOCAL_MODE_STORAGE_KEY: string;
  JWT_EXPIRED_PROMPTED_KEY: string;
}

/** Load a pristine copy of the module so the singleton's cached config resets. */
async function loadModule(): Promise<ServiceModule> {
  vi.resetModules();
  return (await import("@app/services/connectionModeService")) as unknown as ServiceModule;
}

/** A minimal Response-like object the diagnostic code reads `.ok` / `.status` from. */
function makeResponse(status: number): { ok: boolean; status: number } {
  return { ok: status >= 200 && status < 300, status };
}

/**
 * Default invoke handler: returns a sane config for get_connection_config and
 * resolves undefined for every mutating command. Tests that need a specific
 * stored config override get_connection_config with mockResolvedValueOnce.
 */
function defaultInvoke(config: ConnectionConfig) {
  return (cmd: string) => {
    if (cmd === "get_connection_config") {
      return Promise.resolve({ ...config });
    }
    return Promise.resolve(undefined);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isTauriMock.mockReturnValue(true);
  localStorage.clear();
  // Quiet the very chatty diagnostic logging for deterministic, readable output.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// getInstance / singleton identity
// ===========================================================================

describe("getInstance & singleton export", () => {
  it("returns the same instance on repeated getInstance() calls", async () => {
    const mod = await loadModule();
    const a = mod.ConnectionModeService.getInstance();
    const b = mod.ConnectionModeService.getInstance();
    expect(a).toBe(b);
  });

  it("exposes a module-level singleton equal to getInstance()", async () => {
    const mod = await loadModule();
    expect(mod.connectionModeService).toBe(
      mod.ConnectionModeService.getInstance(),
    );
  });

  it("exports the expected storage-key constants", async () => {
    const mod = await loadModule();
    expect(mod.LOCAL_MODE_STORAGE_KEY).toBe("stirling-local-mode");
    expect(mod.JWT_EXPIRED_PROMPTED_KEY).toBe("stirling-jwt-expired-prompted");
  });
});

// ===========================================================================
// loadConfig branches (exercised lazily through getCurrentConfig)
// ===========================================================================

describe("loadConfig / getCurrentConfig", () => {
  it("returns the Rust config verbatim for a normal saas deployment", async () => {
    const serverConfig: ServerConfig = { url: "https://saas.example.com" };
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: serverConfig,
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(invokeMock).toHaveBeenCalledWith("get_connection_config");
    expect(config.mode).toBe("saas");
    expect(config.server_config).toEqual(serverConfig);
  });

  it("loads config only once and caches it (no second invoke)", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "selfhosted",
      server_config: { url: "https://host.example.com" },
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();
    await mod.connectionModeService.getCurrentConfig();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("overrides any store mode with 'local' when the local-mode flag is set", async () => {
    localStorage.setItem("stirling-local-mode", "true");
    invokeMock.mockResolvedValueOnce({
      mode: "selfhosted",
      server_config: { url: "https://host.example.com" },
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.mode).toBe("local");
    // server_config / lock are preserved from the store.
    expect(config.lock_connection_mode).toBe(true);
  });

  it("defaults a fresh install (saas, null server, unlocked, no flag) to local", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    const mode = await mod.connectionModeService.getCurrentMode();
    expect(mode).toBe("local");
  });

  it("keeps saas when a server_config is present (MSI provisioned install)", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: { url: "https://provisioned.example.com" },
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    expect(await mod.connectionModeService.getCurrentMode()).toBe("saas");
  });

  it("keeps saas when the deployment is locked even with a null server_config", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: null,
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    expect(await mod.connectionModeService.getCurrentMode()).toBe("saas");
  });

  it("keeps saas when the local flag is explicitly 'false' (not null)", async () => {
    localStorage.setItem("stirling-local-mode", "false");
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    // localFlag !== "true" and localFlag !== null -> neither branch taken.
    expect(await mod.connectionModeService.getCurrentMode()).toBe("saas");
  });

  it("falls back to local mode when invoke() rejects", async () => {
    invokeMock.mockRejectedValueOnce(new Error("ipc down"));
    const mod = await loadModule();
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config).toEqual({
      mode: "local",
      server_config: null,
      lock_connection_mode: false,
    });
  });

  it("getServerConfig returns the loaded server_config", async () => {
    const serverConfig: ServerConfig = { url: "https://srv.example.com" };
    invokeMock.mockResolvedValueOnce({
      mode: "selfhosted",
      server_config: serverConfig,
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    expect(await mod.connectionModeService.getServerConfig()).toEqual(
      serverConfig,
    );
  });
});

// ===========================================================================
// subscribeToModeChanges + notifyListeners
// ===========================================================================

describe("subscribeToModeChanges", () => {
  it("notifies subscribers when the mode changes via a switch", async () => {
    invokeMock.mockResolvedValue(undefined);
    const mod = await loadModule();
    const listener = vi.fn();
    mod.connectionModeService.subscribeToModeChanges(listener);

    await mod.connectionModeService.switchToSelfHosted({
      url: "https://host.example.com",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "selfhosted" }),
    );
  });

  it("stops notifying after the returned unsubscribe is invoked", async () => {
    invokeMock.mockResolvedValue(undefined);
    const mod = await loadModule();
    const listener = vi.fn();
    const unsubscribe =
      mod.connectionModeService.subscribeToModeChanges(listener);

    unsubscribe();

    await mod.connectionModeService.switchToLocal();
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies every active subscriber on a change", async () => {
    invokeMock.mockResolvedValue(undefined);
    const mod = await loadModule();
    const a = vi.fn();
    const b = vi.fn();
    mod.connectionModeService.subscribeToModeChanges(a);
    mod.connectionModeService.subscribeToModeChanges(b);

    await mod.connectionModeService.switchToSaaS("https://saas.example.com");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// switchToSaaS
// ===========================================================================

describe("switchToSaaS", () => {
  it("invokes set_connection_mode, updates state, clears the cache", async () => {
    invokeMock.mockImplementation(
      defaultInvoke({
        mode: "saas",
        server_config: { url: "https://saas.example.com" },
        lock_connection_mode: false,
      }),
    );
    localStorage.setItem("stirling-local-mode", "true");
    localStorage.setItem("stirling-jwt-expired-prompted", "1");

    const mod = await loadModule();
    // Prime the cache so getCurrentConfig() returns the switch's in-memory state
    // rather than triggering a fresh store reload.
    await mod.connectionModeService.getCurrentConfig();
    await mod.connectionModeService.switchToSaaS("https://saas.example.com");

    expect(localStorage.getItem("stirling-local-mode")).toBeNull();
    expect(localStorage.getItem("stirling-jwt-expired-prompted")).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("set_connection_mode", {
      mode: "saas",
      serverConfig: { url: "https://saas.example.com" },
    });
    expect(clearCacheMock).toHaveBeenCalledTimes(1);

    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.mode).toBe("saas");
    expect(config.server_config).toEqual({ url: "https://saas.example.com" });
    // Primed config was unlocked -> preserved as false.
    expect(config.lock_connection_mode).toBe(false);
  });

  it("throws and does nothing when the connection mode is locked", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "selfhosted",
      server_config: { url: "https://locked.example.com" },
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    // Prime currentConfig so the lock guard sees lock_connection_mode === true.
    await mod.connectionModeService.getCurrentConfig();
    invokeMock.mockClear();

    await expect(
      mod.connectionModeService.switchToSaaS("https://saas.example.com"),
    ).rejects.toThrow("Connection mode is locked by provisioning");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(clearCacheMock).not.toHaveBeenCalled();
  });

  it("preserves an existing lock_connection_mode value of false when switching", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: { url: "https://x.example.com" },
      lock_connection_mode: false,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();

    await mod.connectionModeService.switchToSaaS("https://saas.example.com");
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.lock_connection_mode).toBe(false);
  });
});

// ===========================================================================
// switchToLocal
// ===========================================================================

describe("switchToLocal", () => {
  it("sets the local flag, records saas in Rust, and clears the cache", async () => {
    invokeMock.mockImplementation(
      defaultInvoke({
        mode: "saas",
        server_config: { url: "https://x.example.com" },
        lock_connection_mode: false,
      }),
    );
    const mod = await loadModule();
    // Prime so getCurrentConfig() reflects the switch's in-memory result.
    await mod.connectionModeService.getCurrentConfig();

    await mod.connectionModeService.switchToLocal();

    expect(localStorage.getItem("stirling-local-mode")).toBe("true");
    expect(invokeMock).toHaveBeenCalledWith("set_connection_mode", {
      mode: "saas",
      serverConfig: null,
    });
    expect(clearCacheMock).toHaveBeenCalledTimes(1);

    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.mode).toBe("local");
    // Unlocked and no prior config -> server_config nulled out.
    expect(config.server_config).toBeNull();
    expect(config.lock_connection_mode).toBe(false);
  });

  it("preserves the server_config for locked deployments", async () => {
    const lockedServer: ServerConfig = { url: "https://locked.example.com" };
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: lockedServer,
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();
    invokeMock.mockResolvedValue(undefined);

    await mod.connectionModeService.switchToLocal();
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.mode).toBe("local");
    expect(config.server_config).toEqual(lockedServer);
    expect(config.lock_connection_mode).toBe(true);
  });

  it("uses null when a locked deployment has no stored server_config", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: null,
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();
    invokeMock.mockResolvedValue(undefined);

    await mod.connectionModeService.switchToLocal();
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.server_config).toBeNull();
    expect(config.lock_connection_mode).toBe(true);
  });
});

// ===========================================================================
// switchToSelfHosted
// ===========================================================================

describe("switchToSelfHosted", () => {
  it("invokes set_connection_mode, starts the monitor, and clears cache", async () => {
    invokeMock.mockImplementation(
      defaultInvoke({
        mode: "saas",
        server_config: null,
        lock_connection_mode: false,
      }),
    );
    localStorage.setItem("stirling-local-mode", "true");
    localStorage.setItem("stirling-jwt-expired-prompted", "1");

    const mod = await loadModule();
    // Prime the cache so getCurrentConfig() reflects the switch's in-memory state.
    await mod.connectionModeService.getCurrentConfig();
    const serverConfig: ServerConfig = { url: "https://host.example.com" };
    await mod.connectionModeService.switchToSelfHosted(serverConfig);

    expect(localStorage.getItem("stirling-local-mode")).toBeNull();
    expect(localStorage.getItem("stirling-jwt-expired-prompted")).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("set_connection_mode", {
      mode: "selfhosted",
      serverConfig,
    });
    expect(monitorStartMock).toHaveBeenCalledWith("https://host.example.com");
    expect(clearCacheMock).toHaveBeenCalledTimes(1);

    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.mode).toBe("selfhosted");
    expect(config.server_config).toEqual(serverConfig);
  });

  it("preserves a pre-existing lock_connection_mode flag", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: { url: "https://x.example.com" },
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();
    invokeMock.mockResolvedValue(undefined);

    await mod.connectionModeService.switchToSelfHosted({
      url: "https://host.example.com",
    });
    const config = await mod.connectionModeService.getCurrentConfig();
    expect(config.lock_connection_mode).toBe(true);
  });
});

// ===========================================================================
// isFirstLaunch
// ===========================================================================

describe("isFirstLaunch", () => {
  it("returns the boolean from the Rust command", async () => {
    invokeMock.mockResolvedValueOnce(true);
    const mod = await loadModule();
    expect(await mod.connectionModeService.isFirstLaunch()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("is_first_launch");
  });

  it("returns false (safe default) when the command rejects", async () => {
    invokeMock.mockRejectedValueOnce(new Error("nope"));
    const mod = await loadModule();
    expect(await mod.connectionModeService.isFirstLaunch()).toBe(false);
  });
});

// ===========================================================================
// resetSetupCompletion
// ===========================================================================

describe("resetSetupCompletion", () => {
  it("invokes reset_setup_completion when unlocked", async () => {
    invokeMock.mockResolvedValue(undefined);
    const mod = await loadModule();
    await mod.connectionModeService.resetSetupCompletion();
    expect(invokeMock).toHaveBeenCalledWith("reset_setup_completion");
  });

  it("is a no-op (no invoke) when the deployment is locked", async () => {
    invokeMock.mockResolvedValueOnce({
      mode: "saas",
      server_config: null,
      lock_connection_mode: true,
    });
    const mod = await loadModule();
    await mod.connectionModeService.getCurrentConfig();
    invokeMock.mockClear();

    await mod.connectionModeService.resetSetupCompletion();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("re-throws when reset_setup_completion fails (unlocked)", async () => {
    invokeMock.mockRejectedValueOnce(new Error("reset failed"));
    const mod = await loadModule();
    await expect(
      mod.connectionModeService.resetSetupCompletion(),
    ).rejects.toThrow("reset failed");
  });
});

// ===========================================================================
// testConnection — HTTP-first path
// ===========================================================================

describe("testConnection (HTTP URL)", () => {
  it("succeeds immediately when stage 1 HTTP returns 200", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200));
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "http://localhost:8080",
    );
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/info/status",
      expect.objectContaining({ method: "GET", connectTimeout: 10000 }),
    );
    expect(result.diagnostics?.[0]).toMatchObject({ success: true });
  });

  it("reports HTTP_NOT_AVAILABLE when HTTP fails but HTTPS fallback works", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("connection refused")) // stage 1 HTTP
      .mockResolvedValueOnce(makeResponse(200)); // stage 2 HTTPS fallback
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "http://srv.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("HTTP_NOT_AVAILABLE");
    // The HTTPS fallback URL is derived by swapping the scheme.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://srv.example.com/api/v1/info/status",
      expect.objectContaining({ method: "GET", connectTimeout: 10000 }),
    );
  });
});

// ===========================================================================
// testConnection — HTTPS-first path
// ===========================================================================

describe("testConnection (HTTPS URL)", () => {
  it("succeeds on stage 1 standard HTTPS", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200));
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://srv.example.com/",
    );
    expect(result.success).toBe(true);
    // Trailing slash trimmed before the health path is appended.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://srv.example.com/api/v1/info/status",
      expect.anything(),
    );
  });

  it("succeeds via stage 2 cert-bypass when standard HTTPS fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("certificate has expired")) // stage 1
      .mockResolvedValueOnce(makeResponse(200)); // stage 2 (cert disabled)
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://selfsigned.example.com",
    );
    expect(result.success).toBe(true);
    // Stage 2 passes the danger.acceptInvalidCerts option.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://selfsigned.example.com/api/v1/info/status",
      expect.objectContaining({
        danger: {
          acceptInvalidCerts: true,
          acceptInvalidHostnames: true,
        },
      }),
    );
  });

  it("reports HTTPS_NOT_AVAILABLE when only HTTP (stage 3) works", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ssl handshake failed")) // stage 1 HTTPS
      .mockRejectedValueOnce(new Error("ssl handshake failed")) // stage 2 cert-bypass
      .mockResolvedValueOnce(makeResponse(200)); // stage 3 HTTP
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://httponly.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("HTTPS_NOT_AVAILABLE");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://httponly.example.com/api/v1/info/status",
      expect.anything(),
    );
  });
});

// ===========================================================================
// testConnection — deeper diagnostic stages
// ===========================================================================

describe("testConnection (extended diagnostic stages)", () => {
  it("succeeds at stage 4 (extended timeout) for a slow server", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("timed out")) // stage 1 HTTPS
      .mockRejectedValueOnce(new Error("timed out")) // stage 2 cert-bypass
      .mockRejectedValueOnce(new Error("timed out")) // stage 3 HTTP
      .mockResolvedValueOnce(makeResponse(200)); // stage 4 long timeout
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://slow.example.com",
    );
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reports NETWORK_BLOCKED when every external connectivity probe fails", async () => {
    // stages 1-4 against the target fail, then 5A/5B/5C external probes fail.
    fetchMock.mockRejectedValue(new Error("blocked by firewall"));
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://unreachable.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("NETWORK_BLOCKED");
    // 1 (https) + 1 (cert) + 1 (http) + 1 (timeout) + 3 (external) = 7 calls.
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("reports DNS_RESOLUTION_FAILED when external works but DNS lookup fails", async () => {
    fetchMock.mockImplementation((url: string) => {
      // External connectivity probes succeed...
      if (
        url.includes("google.com") ||
        url.includes("1.1.1.1") ||
        url.includes("httpbin.org")
      ) {
        return Promise.resolve(makeResponse(200));
      }
      // ...the stage-6 DNS HEAD probe yields a DNS error...
      if (url === "https://baddns.example.com") {
        return Promise.reject(new Error("getaddrinfo ENOTFOUND baddns"));
      }
      // ...all target health probes fail with a generic error.
      return Promise.reject(new Error("no route to host"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://baddns.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DNS_RESOLUTION_FAILED");
    expect(result.error).toContain("baddns.example.com");
  });

  it("reports METHOD_MISMATCH when HEAD works but GET does not (stage 7)", async () => {
    fetchMock.mockImplementation((url: string, opts: { method?: string }) => {
      if (
        url.includes("google.com") ||
        url.includes("1.1.1.1") ||
        url.includes("httpbin.org")
      ) {
        return Promise.resolve(makeResponse(200)); // external OK
      }
      // Stage 6 DNS probe (HEAD to base host) resolves -> DNS fine.
      if (url === "https://method.example.com") {
        return Promise.resolve(makeResponse(200));
      }
      // Target health endpoint: HEAD succeeds, everything else fails.
      if (opts?.method === "HEAD") {
        return Promise.resolve(makeResponse(200));
      }
      return Promise.reject(new Error("connection reset"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://method.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("METHOD_MISMATCH");
  });

  it("reports USER_AGENT_BLOCKED when only the browser User-Agent succeeds (stage 8)", async () => {
    fetchMock.mockImplementation(
      (
        url: string,
        opts: { method?: string; headers?: Record<string, string> },
      ) => {
        if (
          url.includes("google.com") ||
          url.includes("1.1.1.1") ||
          url.includes("httpbin.org")
        ) {
          return Promise.resolve(makeResponse(200)); // external OK
        }
        if (url === "https://uablock.example.com") {
          return Promise.resolve(makeResponse(200)); // stage 6 DNS OK
        }
        // Only the request carrying a browser User-Agent header succeeds.
        if (opts?.headers?.["User-Agent"]?.startsWith("Mozilla/5.0")) {
          return Promise.resolve(makeResponse(200));
        }
        return Promise.reject(new Error("connection reset"));
      },
    );
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://uablock.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("USER_AGENT_BLOCKED");
  });

  it("reports SERVER_UNREACHABLE when external works but every target probe fails", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (
        url.includes("google.com") ||
        url.includes("1.1.1.1") ||
        url.includes("httpbin.org")
      ) {
        return Promise.resolve(makeResponse(200)); // external OK
      }
      if (url === "https://dead.example.com") {
        // Stage 6 DNS probe inconclusive (non-DNS error) -> not DNS_RESOLUTION_FAILED.
        return Promise.reject(new Error("connection refused"));
      }
      return Promise.reject(new Error("connection refused"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://dead.example.com",
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("SERVER_UNREACHABLE");
    // Diagnostics accumulate across all stages run.
    expect(result.diagnostics?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});

// ===========================================================================
// testConnection — error categorization branches (via diagnostic messages)
// ===========================================================================

describe("testConnection error categorization", () => {
  it("categorizes a TLS-version mismatch on the HTTPS stage", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (
        url.includes("google.com") ||
        url.includes("1.1.1.1") ||
        url.includes("httpbin.org")
      ) {
        return Promise.resolve(makeResponse(200));
      }
      if (url === "https://oldtls.example.com") {
        return Promise.resolve(makeResponse(200)); // DNS ok
      }
      return Promise.reject(new Error("peer is incompatible: ProtocolVersion"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://oldtls.example.com",
    );
    const stage1 = result.diagnostics?.find((d) =>
      d.stage.includes("Standard HTTPS"),
    );
    expect(stage1?.message).toContain("TLS version not supported");
  });

  it("categorizes an HTTP non-2xx response as a server-status failure", async () => {
    // HTTP stage 1 returns 503 (not ok) -> message includes the status code.
    fetchMock.mockImplementation((url: string) => {
      if (
        url.includes("google.com") ||
        url.includes("1.1.1.1") ||
        url.includes("httpbin.org")
      ) {
        return Promise.resolve(makeResponse(200));
      }
      // target http -> 503, https fallback rejects.
      if (url.startsWith("http://target.example.com")) {
        return Promise.resolve(makeResponse(503));
      }
      return Promise.reject(new Error("refused"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "http://target.example.com",
    );
    const httpStage = result.diagnostics?.find((d) =>
      d.stage.includes("HTTP (as specified)"),
    );
    expect(httpStage?.success).toBe(false);
    expect(httpStage?.message).toContain("503");
  });

  it("treats stage 5A google.com 301/302 redirects as connectivity confirmed", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("google.com")) {
        return Promise.resolve(makeResponse(301)); // redirect counts as reachable
      }
      // Everything else fails so we reach the stage-5 evaluation, then continue.
      return Promise.reject(new Error("refused"));
    });
    const mod = await loadModule();
    const result = await mod.connectionModeService.testConnection(
      "https://target2.example.com",
    );
    const stage5a = result.diagnostics?.find((d) =>
      d.stage.includes("Stage 5A"),
    );
    expect(stage5a?.success).toBe(true);
    // External worked, target didn't -> not NETWORK_BLOCKED.
    expect(result.errorCode).not.toBe("NETWORK_BLOCKED");
  });
});
