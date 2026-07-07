/**
 * Unit tests for SaasBillingService (desktop layer).
 *
 * SaasBillingService wraps Stripe + Supabase billing behind Tauri APIs. Every
 * collaborator is an injectable singleton / module export and is mocked with
 * vi.mock so the suite is fully deterministic (no network, Tauri, env, or
 * Supabase access):
 *   - @tauri-apps/plugin-shell   (open  -> shellOpen)
 *   - @tauri-apps/plugin-http    (fetch -> tauriFetch)
 *   - @app/auth/supabase         (supabase.functions.invoke)
 *   - @app/services/authService  (isAuthenticated / getAuthToken)
 *   - @app/services/connectionModeService (getCurrentMode)
 *   - @app/constants/connection  (URL + key constants, inlined in the factory)
 *   - @app/config/billing        (getCurrencySymbol)
 *
 * The tests drive isBillingAvailable gating, the getBillingStatus tier /
 * trial-days / credit-balance fallback matrix, getAvailablePlans price mapping,
 * and the openBillingPortal / openCheckout browser-redirect paths, exercising
 * the success, edge, and error/branch lines of each method.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- collaborator mocks -----------------------------------------------------

const shellOpen = vi.fn<(url: string) => Promise<void>>();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (url: string) => shellOpen(url),
}));

const tauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => tauriFetch(...args),
}));

const functionsInvoke = vi.fn();
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => functionsInvoke(...args),
    },
  },
}));

const isAuthenticated = vi.fn<() => Promise<boolean>>();
const getAuthToken = vi.fn<() => Promise<string | null>>();
vi.mock("@app/services/authService", () => ({
  authService: {
    isAuthenticated: () => isAuthenticated(),
    getAuthToken: () => getAuthToken(),
  },
}));

const getCurrentMode = vi.fn<() => Promise<string>>();
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => getCurrentMode(),
  },
}));

// vi.mock factories are hoisted, so the constants must be inlined. The mirror
// constants below are used in URL assertions.
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://saas.example.com",
  STIRLING_SAAS_BACKEND_API_URL: "https://api.example.com",
  SUPABASE_KEY: "test-anon-key",
}));

const SAAS_URL = "https://saas.example.com";
const BACKEND_URL = "https://api.example.com";
const SUPABASE_KEY = "test-anon-key";

// Mirror the real currency-symbol map: known codes map to a symbol, unknown
// codes fall back to the upper-cased code.
vi.mock("@app/config/billing", () => ({
  getCurrencySymbol: (currency: string) => {
    const map: Record<string, string> = { usd: "$", gbp: "£", eur: "€" };
    return map[currency.toLowerCase()] || currency.toUpperCase();
  },
}));

import {
  SaasBillingService,
  saasBillingService,
} from "@app/services/saasBillingService";

// --- helpers ----------------------------------------------------------------

/** A minimal Tauri Response stand-in (ok + json + text). */
function makeResponse(opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
}) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    statusText: opts.statusText ?? (opts.ok ? "OK" : "Server Error"),
    json: vi.fn().mockResolvedValue(opts.json),
    text: vi.fn().mockResolvedValue(opts.text ?? ""),
  };
}

/** Make billing available (saas mode + authenticated + token present). */
function enableBilling(token: string | null = "jwt-token") {
  getCurrentMode.mockResolvedValue("saas");
  isAuthenticated.mockResolvedValue(true);
  getAuthToken.mockResolvedValue(token);
}

const service = saasBillingService;

beforeEach(() => {
  vi.clearAllMocks();
  // Quiet, deterministic console (the service logs warn/error on many paths).
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Sensible defaults; individual tests override as needed.
  getCurrentMode.mockResolvedValue("saas");
  isAuthenticated.mockResolvedValue(true);
  getAuthToken.mockResolvedValue("jwt-token");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("SaasBillingService.getInstance", () => {
  it("returns the same instance and matches the exported singleton", () => {
    const a = SaasBillingService.getInstance();
    const b = SaasBillingService.getInstance();
    expect(a).toBe(b);
    expect(saasBillingService).toBe(a);
  });
});

describe("isBillingAvailable", () => {
  it("is true only when in saas mode AND authenticated", async () => {
    getCurrentMode.mockResolvedValue("saas");
    isAuthenticated.mockResolvedValue(true);
    expect(await service.isBillingAvailable()).toBe(true);
  });

  it("is false when not in saas mode", async () => {
    getCurrentMode.mockResolvedValue("local");
    isAuthenticated.mockResolvedValue(true);
    expect(await service.isBillingAvailable()).toBe(false);
  });

  it("is false when in saas mode but not authenticated", async () => {
    getCurrentMode.mockResolvedValue("saas");
    isAuthenticated.mockResolvedValue(false);
    expect(await service.isBillingAvailable()).toBe(false);
  });

  it("returns false (and logs) when a collaborator throws", async () => {
    getCurrentMode.mockRejectedValue(new Error("mode boom"));
    expect(await service.isBillingAvailable()).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("getBillingStatus — gating", () => {
  it("throws when billing is not available (non-saas mode)", async () => {
    getCurrentMode.mockResolvedValue("local");
    await expect(service.getBillingStatus()).rejects.toThrow(
      /only available in SaaS mode/,
    );
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it("throws when no auth token is available", async () => {
    enableBilling(null);
    await expect(service.getBillingStatus()).rejects.toThrow(
      /No authentication token available/,
    );
  });
});

describe("getBillingStatus — RPC error handling", () => {
  it("throws a status-bearing error when the RPC response is not ok", async () => {
    enableBilling();
    tauriFetch.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: "no access",
      }),
    );
    await expect(service.getBillingStatus()).rejects.toThrow(
      /RPC call failed: 403 Forbidden/,
    );
    expect(console.error).toHaveBeenCalledWith(
      "[Desktop Billing] RPC error response:",
      "no access",
    );
  });

  it("sends the correct RPC url, headers, and body", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] })) // RPC
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 5 } }),
      ); // credits
    await service.getBillingStatus();

    const [url, init] = tauriFetch.mock.calls[0];
    expect(url).toBe(`${SAAS_URL}/rest/v1/rpc/get_user_billing_status`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: "Bearer jwt-token",
    });
    expect(init.body).toBe(JSON.stringify({}));
  });
});

describe("getBillingStatus — free tier (not pro)", () => {
  it("returns the free tier when the RPC array is empty (no usage invoke)", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] }))
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 42 } }),
      );

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("free");
    expect(result.subscription).toBeNull();
    expect(result.meterUsage).toBeNull();
    expect(result.isTrialing).toBe(false);
    expect(result.trialDaysRemaining).toBeUndefined();
    expect(result.creditBalance).toBe(42);
    // Free users never invoke the usage edge function.
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it("normalises a single (non-array) RPC object and treats is_pro:false as free", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          json: {
            user_id: "u1",
            has_metered_billing_enabled: false,
            is_pro: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 7 } }),
      );

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("free");
    expect(result.creditBalance).toBe(7);
  });

  it("treats a null RPC body as an empty array (free tier)", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: null }))
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 0 } }),
      );

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("free");
    expect(result.creditBalance).toBe(0);
  });
});

describe("getBillingStatus — pro tier + usage details", () => {
  it("maps an active (non-trialing) subscription with meter usage", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: [{ is_pro: true }] }),
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 123 } }),
      );
    functionsInvoke.mockResolvedValueOnce({
      data: {
        subscription: {
          id: "sub_1",
          status: "active",
          currentPeriodStart: 1000,
          currentPeriodEnd: 2000,
        },
        meterUsage: { currentPeriodCredits: 10, estimatedCost: 500 },
      },
      error: null,
    });

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("team");
    expect(result.subscription?.id).toBe("sub_1");
    expect(result.meterUsage?.estimatedCost).toBe(500);
    expect(result.isTrialing).toBe(false);
    expect(result.trialDaysRemaining).toBeUndefined();
    expect(result.creditBalance).toBe(123);

    // Usage invoke gets the bearer token.
    expect(functionsInvoke).toHaveBeenCalledWith(
      "get-usage-billing",
      expect.objectContaining({
        headers: { Authorization: "Bearer jwt-token" },
        body: {},
      }),
    );
  });

  it("computes trialDaysRemaining (ceil) for a trialing subscription", async () => {
    enableBilling();
    const now = 1_700_000_000_000; // fixed ms
    vi.spyOn(Date, "now").mockReturnValue(now);
    const nowSec = Math.floor(now / 1000);
    // 3.5 days out -> ceil => 4 days.
    const trialEnd = nowSec + Math.floor(3.5 * 24 * 60 * 60);

    tauriFetch
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: [{ is_pro: true }] }),
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 1 } }),
      );
    functionsInvoke.mockResolvedValueOnce({
      data: {
        subscription: {
          id: "sub_trial",
          status: "trialing",
          currentPeriodStart: nowSec,
          currentPeriodEnd: trialEnd,
        },
        meterUsage: null,
      },
      error: null,
    });

    const result = await service.getBillingStatus();
    expect(result.isTrialing).toBe(true);
    expect(result.trialDaysRemaining).toBe(4);
  });

  it("ignores usage data when the usage invoke returns an error", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: [{ is_pro: true }] }),
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 9 } }),
      );
    functionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "usage failed" },
    });

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("team");
    expect(result.subscription).toBeNull();
    expect(result.meterUsage).toBeNull();
    expect(result.isTrialing).toBe(false);
    expect(result.creditBalance).toBe(9);
  });

  it("swallows a thrown usage invoke and still returns pro tier + credits", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: [{ is_pro: true }] }),
      )
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 3 } }),
      );
    functionsInvoke.mockRejectedValueOnce(new Error("network down"));

    const result = await service.getBillingStatus();
    expect(result.tier).toBe("team");
    expect(result.subscription).toBeNull();
    expect(result.creditBalance).toBe(3);
    expect(console.warn).toHaveBeenCalledWith(
      "[Desktop Billing] Failed to fetch usage data:",
      expect.any(Error),
    );
  });
});

describe("getBillingStatus — credit balance fallbacks", () => {
  it("defaults creditBalance to 0 when the credits field is not a number", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] }))
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: "lots" } }),
      );

    const result = await service.getBillingStatus();
    expect(result.creditBalance).toBe(0);
  });

  it("defaults creditBalance to 0 when the credits response is not ok", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] }))
      .mockResolvedValueOnce(
        makeResponse({ ok: false, status: 500, text: "server error" }),
      );

    const result = await service.getBillingStatus();
    expect(result.creditBalance).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      "[Desktop Billing] Failed to fetch credit balance:",
      500,
      "server error",
    );
  });

  it("defaults creditBalance to 0 when the credits fetch throws", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] }))
      .mockRejectedValueOnce(new Error("credits boom"));

    const result = await service.getBillingStatus();
    expect(result.creditBalance).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      "[Desktop Billing] Error fetching credit balance:",
      expect.any(Error),
    );
  });

  it("targets the backend credits endpoint with the bearer token", async () => {
    enableBilling();
    tauriFetch
      .mockResolvedValueOnce(makeResponse({ ok: true, json: [] }))
      .mockResolvedValueOnce(
        makeResponse({ ok: true, json: { totalAvailableCredits: 11 } }),
      );
    await service.getBillingStatus();

    const [creditsUrl, creditsInit] = tauriFetch.mock.calls[1];
    expect(creditsUrl).toBe(`${BACKEND_URL}/api/v1/credits`);
    expect(creditsInit.method).toBe("GET");
    expect(creditsInit.headers).toEqual({ Authorization: "Bearer jwt-token" });
  });
});

describe("getBillingStatus — outer error propagation", () => {
  it("rethrows an Error raised inside the try block", async () => {
    enableBilling();
    // The RPC fetch itself rejects with an Error.
    tauriFetch.mockRejectedValueOnce(new Error("rpc transport error"));
    await expect(service.getBillingStatus()).rejects.toThrow(
      /rpc transport error/,
    );
  });

  it("wraps a non-Error rejection into a generic billing error", async () => {
    enableBilling();
    // RPC fetch rejects with a non-Error value -> wrapped.
    tauriFetch.mockRejectedValueOnce("string failure");
    await expect(service.getBillingStatus()).rejects.toThrow(
      /Failed to fetch billing status/,
    );
  });
});

describe("openBillingPortal", () => {
  it("throws when billing is not available", async () => {
    getCurrentMode.mockResolvedValue("local");
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /Billing portal is only available in SaaS mode/,
    );
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it("throws when no auth token is available", async () => {
    enableBilling(null);
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /No authentication token available/,
    );
  });

  it("opens the returned portal url in the system browser", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/portal" },
      error: null,
    });
    shellOpen.mockResolvedValueOnce(undefined);

    await service.openBillingPortal("https://app.example/return");

    expect(functionsInvoke).toHaveBeenCalledWith(
      "manage-billing",
      expect.objectContaining({
        headers: { Authorization: "Bearer jwt-token" },
        body: { return_url: "https://app.example/return" },
      }),
    );
    expect(shellOpen).toHaveBeenCalledWith("https://stripe.example/portal");
  });

  it("throws the edge function error message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "portal denied" },
    });
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /portal denied/,
    );
    expect(shellOpen).not.toHaveBeenCalled();
  });

  it("throws a default message when the error has no message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({ data: null, error: {} });
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /Failed to create billing portal session/,
    );
  });

  it("throws when the response has no portal url", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /No portal URL returned from manage-billing/,
    );
  });

  it("wraps a non-Error rejection from the invoke into a generic error", async () => {
    enableBilling();
    functionsInvoke.mockRejectedValueOnce("weird failure");
    await expect(service.openBillingPortal("https://ret")).rejects.toThrow(
      /Failed to open billing portal/,
    );
  });
});

describe("getAvailablePlans", () => {
  it("throws when billing is not available", async () => {
    getCurrentMode.mockResolvedValue("local");
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /only available in SaaS mode/,
    );
  });

  it("throws when no auth token is available", async () => {
    enableBilling(null);
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /No authentication token available/,
    );
  });

  it("maps the pro price + overage and resolves the currency symbol (default usd)", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: {
        prices: {
          "plan:pro": { unit_amount: 1500, currency: "usd" },
          "meter:overage": { unit_amount: 7, currency: "usd" },
        },
        missing: [],
      },
      error: null,
    });

    const plans = await service.getAvailablePlans();
    expect(plans.get("team")).toEqual({
      price: 15,
      currency: "$",
      overagePrice: 0.07,
    });

    // Default currency code 'usd' is sent in the lookup body.
    expect(functionsInvoke).toHaveBeenCalledWith(
      "stripe-price-lookup",
      expect.objectContaining({
        body: {
          lookup_keys: ["plan:pro", "meter:overage"],
          currency: "usd",
        },
      }),
    );
  });

  it("falls back to a 0.05 overage when no meter price is returned", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: {
        prices: { "plan:pro": { unit_amount: 2000, currency: "gbp" } },
        missing: ["meter:overage"],
      },
      error: null,
    });

    const plans = await service.getAvailablePlans("gbp");
    expect(plans.get("team")).toEqual({
      price: 20,
      currency: "£",
      overagePrice: 0.05,
    });
  });

  it("uppercases an unknown currency code as the symbol fallback", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: {
        prices: { "plan:pro": { unit_amount: 999, currency: "zar" } },
        missing: [],
      },
      error: null,
    });

    const plans = await service.getAvailablePlans("zar");
    expect(plans.get("team")?.currency).toBe("ZAR");
  });

  it("returns an empty map when no pro price is present", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: {
        prices: { "meter:overage": { unit_amount: 5, currency: "usd" } },
        missing: [],
      },
      error: null,
    });

    const plans = await service.getAvailablePlans();
    expect(plans.size).toBe(0);
  });

  it("throws the edge function error message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "price lookup failed" },
    });
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /price lookup failed/,
    );
  });

  it("throws a default message when the error has no message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({ data: null, error: {} });
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /Failed to fetch plan pricing/,
    );
  });

  it("throws when no pricing data is returned", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: { prices: null },
      error: null,
    });
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /No pricing data returned/,
    );
  });

  it("rethrows a thrown invoke error verbatim", async () => {
    enableBilling();
    functionsInvoke.mockRejectedValueOnce(new Error("invoke exploded"));
    await expect(service.getAvailablePlans()).rejects.toThrow(
      /invoke exploded/,
    );
  });
});

describe("openCheckout", () => {
  it("throws when billing is not available", async () => {
    getCurrentMode.mockResolvedValue("local");
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /Checkout is only available in SaaS mode/,
    );
  });

  it("throws when no auth token is available", async () => {
    enableBilling(null);
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /No authentication token available/,
    );
  });

  it("creates a hosted checkout session and opens the url", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: { url: "https://stripe.example/checkout" },
      error: null,
    });
    shellOpen.mockResolvedValueOnce(undefined);

    await service.openCheckout("pro", "https://app.example");

    expect(functionsInvoke).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        headers: { Authorization: "Bearer jwt-token" },
        body: {
          ui_mode: "hosted",
          success_url: "https://app.example/checkout/success",
          cancel_url: "https://app.example/checkout/cancel",
          purchase_type: "subscription",
          plan: "pro",
        },
      }),
    );
    expect(shellOpen).toHaveBeenCalledWith("https://stripe.example/checkout");
  });

  it("throws the edge function error message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "checkout denied" },
    });
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /checkout denied/,
    );
    expect(shellOpen).not.toHaveBeenCalled();
  });

  it("throws a default message when the error has no message", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({ data: null, error: {} });
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /Failed to create checkout session/,
    );
  });

  it("throws when the response has no checkout url", async () => {
    enableBilling();
    functionsInvoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /No checkout URL returned from create-checkout/,
    );
  });

  it("wraps a non-Error rejection into a generic checkout error", async () => {
    enableBilling();
    functionsInvoke.mockRejectedValueOnce(42);
    await expect(service.openCheckout("pro", "https://ret")).rejects.toThrow(
      /Failed to create checkout session/,
    );
  });
});
