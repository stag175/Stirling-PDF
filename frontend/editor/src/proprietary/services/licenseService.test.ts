import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import { getCheckoutMode } from "@app/utils/protocolDetection";
import licenseService, {
  mapLicenseToTier,
  type PlanTier,
} from "@app/services/licenseService";
import type { LicenseInfo } from "@app/types/license";

// Auto-mock the apiClient (axios instance) so get/post become vi.fn() stubs,
// matching the convention used by userManagementService.test.ts.
vi.mock("@app/services/apiClient");

// Mock protocol detection so checkout-mode branches are deterministic.
vi.mock("@app/utils/protocolDetection", () => ({
  getCheckoutMode: vi.fn(() => "embedded"),
}));

// Mutable supabase mock. The module under test reads `isSupabaseConfigured` and
// `supabase` as live ESM bindings at call time, so we expose them through
// getters whose backing state we can flip between tests to exercise both the
// configured and not-configured branches.
const supabaseState: {
  configured: boolean;
  invoke: ReturnType<typeof vi.fn>;
} = {
  configured: true,
  invoke: vi.fn(),
};

vi.mock("@app/services/supabaseClient", () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured
      ? { functions: { invoke: supabaseState.invoke } }
      : null;
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedGetCheckoutMode = vi.mocked(getCheckoutMode);

/** Build the `prices` payload shape returned by the stripe-price-lookup fn. */
function priceEntry(unit_amount: number, currency = "usd") {
  return { unit_amount, currency, lookup_key: "" };
}

/** A full set of valid prices for all four self-hosted lookup keys. */
function fullPrices() {
  return {
    "selfhosted:server:monthly": priceEntry(1000),
    "selfhosted:server:yearly": priceEntry(10000),
    "selfhosted:enterpriseseat:monthly": priceEntry(500),
    "selfhosted:enterpriseseat:yearly": priceEntry(5000),
  };
}

describe("licenseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseState.configured = true;
    supabaseState.invoke = vi.fn();
    mockedGetCheckoutMode.mockReturnValue("embedded");
    // window.location.origin used by checkout/seat methods.
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: { origin: "https://app.example.com" },
    });
    // Silence the deliberate console.warn / console.error paths.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPlans", () => {
    it("builds free + 4 paid tiers with converted prices, symbol, and seat pricing", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { prices: fullPrices(), missing: [] },
        error: null,
      });

      const result = await licenseService.getPlans("gbp");

      // stripe-price-lookup invoked with the self-hosted keys + currency.
      expect(supabaseState.invoke).toHaveBeenCalledWith("stripe-price-lookup", {
        body: {
          lookup_keys: [
            "selfhosted:server:monthly",
            "selfhosted:server:yearly",
            "selfhosted:enterpriseseat:monthly",
            "selfhosted:enterpriseseat:yearly",
          ],
          currency: "gbp",
        },
      });

      // Free + 4 paid plans (none filtered since all prices > 0).
      expect(result.plans).toHaveLength(5);

      const byId = Object.fromEntries(result.plans.map((p) => [p.id, p]));
      expect(byId.free.price).toBe(0);
      expect(byId.free.currency).toBe("£");
      expect(byId["selfhosted:server:monthly"].price).toBe(10); // 1000 / 100
      expect(byId["selfhosted:server:yearly"].price).toBe(100); // 10000 / 100
      expect(byId["selfhosted:server:yearly"].popular).toBe(true);
      // Enterprise reuses server price + adds seat price.
      expect(byId["selfhosted:enterprise:monthly"].price).toBe(10);
      expect(byId["selfhosted:enterprise:monthly"].seatPrice).toBe(5); // 500 / 100
      expect(byId["selfhosted:enterprise:monthly"].requiresSeats).toBe(true);
      expect(byId["selfhosted:enterprise:yearly"].seatPrice).toBe(50); // 5000 / 100
      // Free plan is always first.
      expect(result.plans[0].id).toBe("free");
    });

    it("defaults to usd ($) and logs missing keys without filtering present ones", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: {
          prices: fullPrices(),
          missing: ["some:missing:key"],
        },
        error: null,
      });

      const result = await licenseService.getPlans();

      expect(supabaseState.invoke).toHaveBeenCalledWith(
        "stripe-price-lookup",
        expect.objectContaining({
          body: expect.objectContaining({ currency: "usd" }),
        }),
      );
      // Missing-prices debug warning fired.
      expect(console.warn).toHaveBeenCalledWith(
        "Missing Stripe prices for lookup keys:",
        ["some:missing:key"],
        "in currency:",
        "usd",
      );
      expect(result.plans.find((p) => p.id === "free")?.currency).toBe("$");
      expect(result.plans).toHaveLength(5);
    });

    it("uppercases unknown currency codes as the symbol", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { prices: fullPrices(), missing: [] },
        error: null,
      });

      const result = await licenseService.getPlans("xyz");

      expect(result.plans[0].currency).toBe("XYZ");
    });

    it("filters out paid plans whose Stripe price is missing (price === 0)", async () => {
      // Only the server-monthly key has a price; everything else is absent so
      // those plans resolve to fallback 0 and get filtered out.
      supabaseState.invoke.mockResolvedValueOnce({
        data: {
          prices: { "selfhosted:server:monthly": priceEntry(1500) },
          missing: [
            "selfhosted:server:yearly",
            "selfhosted:enterpriseseat:monthly",
            "selfhosted:enterpriseseat:yearly",
          ],
        },
        error: null,
      });

      const result = await licenseService.getPlans("usd");
      const ids = result.plans.map((p) => p.id);

      // free + server-monthly survive. enterprise-monthly also survives because
      // its `price` is derived from the present `selfhosted:server:monthly` key
      // (seatPrice is 0, but the filter only checks `price > 0`). The yearly
      // plans (server + enterprise) derive from the absent server:yearly key, so
      // their price is 0 and they are filtered out.
      expect(ids).toContain("free");
      expect(ids).toContain("selfhosted:server:monthly");
      expect(ids).toContain("selfhosted:enterprise:monthly");
      expect(ids).not.toContain("selfhosted:server:yearly");
      expect(ids).not.toContain("selfhosted:enterprise:yearly");
      // The surviving enterprise-monthly plan has a missing (0) seat price.
      expect(
        result.plans.find((p) => p.id === "selfhosted:enterprise:monthly")
          ?.seatPrice,
      ).toBe(0);
      // Warning about filtered-out plans was logged.
      expect(console.warn).toHaveBeenCalledWith(
        "Filtered out plans with missing prices:",
        expect.arrayContaining([
          "selfhosted:server:yearly",
          "selfhosted:enterprise:yearly",
        ]),
      );
    });

    it("throws (and logs) when Supabase is not configured", async () => {
      supabaseState.configured = false;

      await expect(licenseService.getPlans("usd")).rejects.toThrow(
        "Supabase is not configured",
      );
      expect(console.error).toHaveBeenCalled();
      expect(supabaseState.invoke).not.toHaveBeenCalled();
    });

    it("throws when the edge function returns an error", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "boom" },
      });

      await expect(licenseService.getPlans("usd")).rejects.toThrow(
        "Failed to fetch plans: boom",
      );
    });

    it("throws when no pricing data is returned", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { missing: [] },
        error: null,
      });

      await expect(licenseService.getPlans("usd")).rejects.toThrow(
        "No pricing data returned",
      );
    });
  });

  describe("groupPlansByTier", () => {
    it("groups free, server, and enterprise plans with popularity from yearly", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { prices: fullPrices(), missing: [] },
        error: null,
      });
      const { plans } = await licenseService.getPlans("usd");

      const groups = licenseService.groupPlansByTier(plans);
      const byTier = Object.fromEntries(groups.map((g) => [g.tier, g]));

      expect(groups.map((g) => g.tier)).toEqual([
        "free",
        "server",
        "enterprise",
      ]);
      expect(byTier.free.monthly?.id).toBe("free");
      expect(byTier.free.yearly).toBeNull();
      // server tier picks up both monthly + yearly and popular flag (yearly).
      expect(byTier.server.monthly?.id).toBe("selfhosted:server:monthly");
      expect(byTier.server.yearly?.id).toBe("selfhosted:server:yearly");
      expect(byTier.server.popular).toBe(true);
      expect(byTier.enterprise.monthly?.id).toBe(
        "selfhosted:enterprise:monthly",
      );
      expect(byTier.enterprise.yearly?.id).toBe("selfhosted:enterprise:yearly");
    });

    it("returns an empty array when no plans match any tier", () => {
      const groups = licenseService.groupPlansByTier([]);
      expect(groups).toEqual([]);
    });

    it("handles a server tier present only via the yearly plan", () => {
      const yearly: PlanTier = {
        id: "selfhosted:server:yearly",
        lookupKey: "selfhosted:server:yearly",
        name: "Server - Yearly",
        price: 100,
        currency: "$",
        period: "/year",
        popular: true,
        features: [],
        highlights: [],
      };

      const groups = licenseService.groupPlansByTier([yearly]);

      expect(groups).toHaveLength(1);
      expect(groups[0].tier).toBe("server");
      expect(groups[0].monthly).toBeNull();
      expect(groups[0].yearly?.id).toBe("selfhosted:server:yearly");
      expect(groups[0].popular).toBe(true);
    });

    it("handles an enterprise tier present only via the monthly plan", () => {
      const monthly: PlanTier = {
        id: "selfhosted:enterprise:monthly",
        lookupKey: "selfhosted:server:monthly",
        name: "Enterprise - Monthly",
        price: 10,
        currency: "$",
        period: "/month",
        requiresSeats: true,
        features: [],
        highlights: [],
      };

      // Includes a server-monthly lookupKey collision is avoided because the
      // enterprise plan keeps the server lookupKey; ensure it still lands in
      // both the server group (lookupKey match) and enterprise group (id match).
      const groups = licenseService.groupPlansByTier([monthly]);
      const tiers = groups.map((g) => g.tier);

      expect(tiers).toContain("enterprise");
      const enterprise = groups.find((g) => g.tier === "enterprise")!;
      expect(enterprise.monthly?.id).toBe("selfhosted:enterprise:monthly");
      expect(enterprise.yearly).toBeNull();
      expect(enterprise.popular).toBe(false);
    });
  });

  describe("createCheckoutSession", () => {
    it("invokes create-checkout in embedded mode without hosted URLs", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { clientSecret: "cs_123", sessionId: "sess_1" },
        error: null,
      });

      const result = await licenseService.createCheckoutSession({
        lookup_key: "selfhosted:server:monthly",
        installation_id: "inst-1",
        current_license_key: "lic-1",
        requires_seats: true,
        seat_count: 3,
        email: "buyer@example.com",
      });

      expect(supabaseState.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          self_hosted: true,
          lookup_key: "selfhosted:server:monthly",
          installation_id: "inst-1",
          current_license_key: "lic-1",
          requires_seats: true,
          seat_count: 3,
          email: "buyer@example.com",
          callback_base_url: "https://app.example.com",
          ui_mode: "embedded",
          success_url: undefined,
          cancel_url: undefined,
        },
      });
      expect(result).toEqual({ clientSecret: "cs_123", sessionId: "sess_1" });
    });

    it("defaults seat_count to 1 and adds hosted success/cancel URLs in hosted mode", async () => {
      mockedGetCheckoutMode.mockReturnValue("hosted");
      supabaseState.invoke.mockResolvedValueOnce({
        data: { clientSecret: "", sessionId: "sess_2", url: "https://pay" },
        error: null,
      });

      await licenseService.createCheckoutSession({
        lookup_key: "selfhosted:server:yearly",
      });

      const body = supabaseState.invoke.mock.calls[0][1].body;
      expect(body.seat_count).toBe(1);
      expect(body.ui_mode).toBe("hosted");
      expect(body.success_url).toBe(
        "https://app.example.com/settings/adminPlan?session_id={CHECKOUT_SESSION_ID}&payment_status=success",
      );
      expect(body.cancel_url).toBe(
        "https://app.example.com/settings/adminPlan?payment_status=canceled",
      );
    });

    it("throws when Supabase is not configured", async () => {
      supabaseState.configured = false;

      await expect(
        licenseService.createCheckoutSession({ lookup_key: "x" }),
      ).rejects.toThrow("Checkout is not available");
    });

    it("throws when the edge function returns an error", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "stripe down" },
      });

      await expect(
        licenseService.createCheckoutSession({ lookup_key: "x" }),
      ).rejects.toThrow("Failed to create checkout session: stripe down");
    });
  });

  describe("createBillingPortalSession", () => {
    it("invokes manage-billing with return URL and license key", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { url: "https://billing" },
        error: null,
      });

      const result = await licenseService.createBillingPortalSession(
        "https://return",
        "lic-key",
      );

      expect(supabaseState.invoke).toHaveBeenCalledWith("manage-billing", {
        body: {
          return_url: "https://return",
          license_key: "lic-key",
          self_hosted: true,
        },
      });
      expect(result).toEqual({ url: "https://billing" });
    });

    it("throws when Supabase is not configured", async () => {
      supabaseState.configured = false;

      await expect(
        licenseService.createBillingPortalSession("https://r", "k"),
      ).rejects.toThrow("Billing portal is not available");
    });

    it("throws when the edge function returns an error", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "no portal" },
      });

      await expect(
        licenseService.createBillingPortalSession("https://r", "k"),
      ).rejects.toThrow("Failed to create billing portal session: no portal");
    });
  });

  describe("getInstallationId", () => {
    it("returns the installation id from the admin endpoint", async () => {
      mockedGet.mockResolvedValueOnce({ data: { installationId: "abc-123" } });

      const id = await licenseService.getInstallationId();

      expect(mockedGet).toHaveBeenCalledWith("/api/v1/admin/installation-id");
      expect(id).toBe("abc-123");
    });

    it("logs and rethrows on request failure", async () => {
      mockedGet.mockRejectedValueOnce(new Error("net down"));

      await expect(licenseService.getInstallationId()).rejects.toThrow(
        "net down",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("checkLicenseKey", () => {
    it("invokes get-license-key with the installation id", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { status: "ready", license_key: "LK", plan: "server" },
        error: null,
      });

      const result = await licenseService.checkLicenseKey("inst-9");

      expect(supabaseState.invoke).toHaveBeenCalledWith("get-license-key", {
        body: { installation_id: "inst-9" },
      });
      expect(result.status).toBe("ready");
      expect(result.license_key).toBe("LK");
    });

    it("throws when Supabase is not configured", async () => {
      supabaseState.configured = false;

      await expect(licenseService.checkLicenseKey("inst")).rejects.toThrow(
        "License key lookup is not available",
      );
    });

    it("throws when the edge function returns an error", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "lookup failed" },
      });

      await expect(licenseService.checkLicenseKey("inst")).rejects.toThrow(
        "Failed to check license key: lookup failed",
      );
    });
  });

  describe("saveLicenseKey", () => {
    it("posts the license key and returns the response data", async () => {
      const data = { success: true, licenseType: "SERVER" };
      mockedPost.mockResolvedValueOnce({ data });

      const result = await licenseService.saveLicenseKey("MY-KEY");

      expect(mockedPost).toHaveBeenCalledWith("/api/v1/admin/license-key", {
        licenseKey: "MY-KEY",
      });
      expect(result).toBe(data);
    });

    it("logs and rethrows on failure", async () => {
      mockedPost.mockRejectedValueOnce(new Error("save boom"));

      await expect(licenseService.saveLicenseKey("k")).rejects.toThrow(
        "save boom",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("saveLicenseFile", () => {
    it("uploads the file as multipart form data", async () => {
      const data = { success: true, filename: "license.lic" };
      mockedPost.mockResolvedValueOnce({ data });
      const file = new File(["cert-bytes"], "license.lic", {
        type: "application/octet-stream",
      });

      const result = await licenseService.saveLicenseFile(file);

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockedPost.mock.calls[0];
      expect(url).toBe("/api/v1/admin/license-file");
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get("file")).toBe(file);
      expect(result).toBe(data);
    });

    it("logs and rethrows on upload failure", async () => {
      mockedPost.mockRejectedValueOnce(new Error("upload boom"));
      const file = new File(["x"], "bad.lic");

      await expect(licenseService.saveLicenseFile(file)).rejects.toThrow(
        "upload boom",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("getLicenseInfo", () => {
    it("requests license info with suppressed error toast", async () => {
      const data: LicenseInfo = {
        licenseType: "SERVER",
        enabled: true,
        maxUsers: 0,
        hasKey: true,
      };
      mockedGet.mockResolvedValueOnce({ data });

      const result = await licenseService.getLicenseInfo();

      expect(mockedGet).toHaveBeenCalledWith("/api/v1/admin/license-info", {
        suppressErrorToast: true,
      });
      expect(result).toBe(data);
    });

    it("logs and rethrows on failure", async () => {
      mockedGet.mockRejectedValueOnce(new Error("info boom"));

      await expect(licenseService.getLicenseInfo()).rejects.toThrow(
        "info boom",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("resyncLicense", () => {
    it("posts to the resync endpoint and returns data", async () => {
      const data = { success: true, message: "resynced" };
      mockedPost.mockResolvedValueOnce({ data });

      const result = await licenseService.resyncLicense();

      expect(mockedPost).toHaveBeenCalledWith("/api/v1/admin/license/resync");
      expect(result).toBe(data);
    });

    it("logs and rethrows on failure", async () => {
      mockedPost.mockRejectedValueOnce(new Error("resync boom"));

      await expect(licenseService.resyncLicense()).rejects.toThrow(
        "resync boom",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("updateEnterpriseSeats", () => {
    it("invokes manage-billing with the seat count and returns the portal URL", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: { url: "https://seats-portal" },
        error: null,
      });

      const url = await licenseService.updateEnterpriseSeats(7, "lic-seat");

      expect(supabaseState.invoke).toHaveBeenCalledWith("manage-billing", {
        body: {
          return_url:
            "https://app.example.com/settings/adminPlan?seats_updated=true",
          license_key: "lic-seat",
          self_hosted: true,
          new_seat_count: 7,
        },
      });
      expect(url).toBe("https://seats-portal");
    });

    it("throws when Supabase is not configured", async () => {
      supabaseState.configured = false;

      await expect(
        licenseService.updateEnterpriseSeats(2, "k"),
      ).rejects.toThrow("Seat updates are not available");
    });

    it("throws when the edge function returns an error", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: "seat boom" },
      });

      await expect(
        licenseService.updateEnterpriseSeats(2, "k"),
      ).rejects.toThrow("Failed to update seat count: seat boom");
    });

    it("throws when no billing portal URL is returned", async () => {
      supabaseState.invoke.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      await expect(
        licenseService.updateEnterpriseSeats(2, "k"),
      ).rejects.toThrow("No billing portal URL returned");
    });
  });

  describe("mapLicenseToTier", () => {
    it("returns null when licenseInfo is null", () => {
      expect(mapLicenseToTier(null)).toBeNull();
    });

    it("returns 'free' for a NORMAL license type", () => {
      const info: LicenseInfo = {
        licenseType: "NORMAL",
        enabled: true,
        maxUsers: 5,
        hasKey: false,
      };
      expect(mapLicenseToTier(info)).toBe("free");
    });

    it("returns 'free' when not enabled even if type is SERVER", () => {
      const info: LicenseInfo = {
        licenseType: "SERVER",
        enabled: false,
        maxUsers: 0,
        hasKey: true,
      };
      expect(mapLicenseToTier(info)).toBe("free");
    });

    it("returns 'server' for an enabled SERVER license", () => {
      const info: LicenseInfo = {
        licenseType: "SERVER",
        enabled: true,
        maxUsers: 0,
        hasKey: true,
      };
      expect(mapLicenseToTier(info)).toBe("server");
    });

    it("returns 'enterprise' for an enabled ENTERPRISE license with seats", () => {
      const info: LicenseInfo = {
        licenseType: "ENTERPRISE",
        enabled: true,
        maxUsers: 25,
        hasKey: true,
      };
      expect(mapLicenseToTier(info)).toBe("enterprise");
    });

    it("falls back to 'free' for an ENTERPRISE license with zero seats", () => {
      const info: LicenseInfo = {
        licenseType: "ENTERPRISE",
        enabled: true,
        maxUsers: 0,
        hasKey: true,
      };
      expect(mapLicenseToTier(info)).toBe("free");
    });
  });
});
