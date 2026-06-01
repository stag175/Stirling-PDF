import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlans } from "@app/hooks/usePlans";
import { supabase } from "@app/auth/supabase";
import { useAuth } from "@app/auth/UseSession";

// Override the global setup mock for supabase to add the `functions.invoke`
// surface that usePlans relies on. The `react-i18next` mock from
// src/saas/setupTests.ts (where `t` returns the key) is reused as-is, which
// makes plan/feature names deterministic.
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock the auth context so `isPro` / `refreshProStatus` are controllable.
vi.mock("@app/auth/UseSession", () => ({
  useAuth: vi.fn(),
}));

const mockedInvoke = vi.mocked(supabase.functions.invoke);
const mockedUseAuth = vi.mocked(useAuth);

const refreshProStatus = vi.fn();

/** Build a typed return for `supabase.functions.invoke`. */
function invokeResult(
  data: unknown,
  error: unknown = null,
): { data: unknown; error: unknown } {
  return { data, error };
}

/** Configure the auth mock with a given pro status. */
function setAuth(isPro: boolean | null) {
  mockedUseAuth.mockReturnValue({
    isPro,
    refreshProStatus,
  } as unknown as ReturnType<typeof useAuth>);
}

describe("usePlans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence the hook's diagnostic logging while still exercising the lines.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    setAuth(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds static plans/packages with fallback pricing when no prices are returned", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({ prices: {}, missing: [] }) as never,
    );

    const { result } = renderHook(() => usePlans());

    // Wait for the initial fetch effect to settle.
    await waitFor(() => expect(result.current.loading).toBe(false));

    const data = result.current.data!;
    expect(data).not.toBeNull();

    // Three plan tiers, keyed by id.
    expect(Array.from(data.plans.keys())).toEqual([
      "free",
      "pro",
      "enterprise",
    ]);
    expect(result.current.plans).toHaveLength(3);

    const free = data.plans.get("free")!;
    expect(free.price).toBe(0);
    // Default currency "gbp" -> "£".
    expect(free.currency).toBe("£");
    expect(free.name).toBe("plan.free.name");
    expect(free.features).toHaveLength(6);
    expect(free.features[0].included).toBe(true);
    expect(free.features[1].included).toBe(false);

    // Pro plan uses the static fallback price of 8 and is marked popular.
    const pro = data.plans.get("pro")!;
    expect(pro.price).toBe(8);
    expect(pro.popular).toBe(true);
    expect(pro.currency).toBe("£");

    // Enterprise is contact-only with empty period.
    const enterprise = data.plans.get("enterprise")!;
    expect(enterprise.isContactOnly).toBe(true);
    expect(enterprise.period).toBe("");

    // API packages with computed fallback discounts.
    expect(data.apiPackages.map((p) => p.id)).toEqual([
      "xsmall",
      "small",
      "medium",
      "large",
    ]);
    const [xsmall, small, medium, large] = data.apiPackages;
    expect(xsmall.price).toBe(4);
    expect(xsmall.credits).toBe(100);
    expect(xsmall.currency).toBe("£");
    expect(xsmall.description).toBe("£0.040 per credit");
    // Discounts: small 25%, medium 38%, large 55%.
    expect(small.description).toBe("£0.030 per credit • 25% discount");
    expect(medium.description).toBe("£0.025 per credit • 38% discount");
    expect(large.description).toBe("£0.018 per credit • 55% discount");

    // currentPlan defaults to free (isPro=false), with billing metadata.
    expect(data.currentPlan.id).toBe("free");
    expect(data.nextBillingDate).toBe("Feb 15, 2025");
    expect(data.activeSince).toBe("January 2025");
    expect(result.current.error).toBeNull();

    // refetch is wired to the auth context's refreshProStatus.
    expect(result.current.refetch).toBe(refreshProStatus);
  });

  it("applies dynamic Stripe pricing and currency from the lookup response", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({
        prices: {
          "plan:pro": { unit_amount: 999, currency: "usd" },
          "api:xsmall": { unit_amount: 500, currency: "usd" },
          "api:small": { unit_amount: 2000, currency: "usd" },
          "api:medium": { unit_amount: 3000, currency: "usd" },
          "api:large": { unit_amount: 10000, currency: "usd" },
        },
        missing: [],
      }) as never,
    );

    const { result } = renderHook(() => usePlans("usd"));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    await waitFor(() =>
      expect(result.current.data!.plans.get("pro")!.price).toBe(9.99),
    );

    const data = result.current.data!;
    const pro = data.plans.get("pro")!;
    // unit_amount 999 -> 9.99, currency usd -> "$".
    expect(pro.price).toBe(9.99);
    expect(pro.currency).toBe("$");

    const [xsmall, small, medium, large] = data.apiPackages;
    // xsmall 500 -> 5, perCredit 5/100 = 0.05.
    expect(xsmall.price).toBe(5);
    expect(xsmall.currency).toBe("$");
    expect(xsmall.description).toBe("$0.050 per credit");
    // small 2000 -> 20, perCredit 20/500 = 0.04 -> discount round((1-0.04/0.05)*100)=20.
    expect(small.price).toBe(20);
    expect(small.description).toBe("$0.040 per credit • 20% discount");
    // medium 3000 -> 30, perCredit 30/1000 = 0.03 -> discount 40.
    expect(medium.description).toBe("$0.030 per credit • 40% discount");
    // large 10000 -> 100, perCredit 100/5000 = 0.02 -> discount 60.
    expect(large.description).toBe("$0.020 per credit • 60% discount");

    // Verify the lookup keys + currency were forwarded to the edge function.
    expect(mockedInvoke).toHaveBeenCalledWith("stripe-price-lookup", {
      body: {
        lookup_keys: [
          "plan:pro",
          "api:xsmall",
          "api:small",
          "api:medium",
          "api:large",
        ],
        currency: "usd",
      },
    });
  });

  it("omits the discount suffix when computed discount is not positive", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({
        prices: {
          // Equal per-credit cost across tiers -> 0% discount everywhere.
          "api:xsmall": { unit_amount: 100, currency: "gbp" },
          "api:small": { unit_amount: 500, currency: "gbp" },
          "api:medium": { unit_amount: 1000, currency: "gbp" },
          "api:large": { unit_amount: 5000, currency: "gbp" },
        },
        missing: [],
      }) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.data).not.toBeNull());
    await waitFor(() =>
      expect(result.current.data!.apiPackages[0].price).toBe(1),
    );

    const [, small, medium, large] = result.current.data!.apiPackages;
    // No "% discount" suffix because the discount is 0.
    expect(small.description).toBe("£0.010 per credit");
    expect(medium.description).toBe("£0.010 per credit");
    expect(large.description).toBe("£0.010 per credit");
  });

  it("defaults unit_amount to 0 when the price entry omits it", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({
        prices: {
          "plan:pro": { currency: "eur" },
        },
        missing: [],
      }) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.data).not.toBeNull());
    await waitFor(() =>
      expect(result.current.data!.plans.get("pro")!.currency).toBe("€"),
    );

    const pro = result.current.data!.plans.get("pro")!;
    // unit_amount missing -> coerced to 0 -> price 0; currency eur -> "€".
    expect(pro.price).toBe(0);
    expect(pro.currency).toBe("€");
  });

  it("logs a warning when the response reports missing prices", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedInvoke.mockResolvedValue(
      invokeResult({
        prices: { "plan:pro": { unit_amount: 700, currency: "cny" } },
        missing: ["api:xsmall", "api:large"],
      }) as never,
    );

    const { result } = renderHook(() => usePlans("cny"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.data!.plans.get("pro")!.currency).toBe("¥"),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "Missing prices for",
      ["api:xsmall", "api:large"],
      "in",
      "cny",
    );
    // pro still resolves from dynamic pricing.
    expect(result.current.data!.plans.get("pro")!.price).toBe(7);
  });

  it("captures the error message when invoke returns an error", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult(null, new Error("edge boom")) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.error).toBe("edge boom"));
    expect(result.current.loading).toBe(false);
    // Falls back to static prices; data is still assembled.
    expect(result.current.data!.plans.get("pro")!.price).toBe(8);
  });

  it("throws and reports when the response payload is incomplete", async () => {
    // `prices` present but `missing` absent -> "No pricing data returned".
    mockedInvoke.mockResolvedValue(invokeResult({ prices: {} }) as never);

    const { result } = renderHook(() => usePlans());

    await waitFor(() =>
      expect(result.current.error).toBe("No pricing data returned"),
    );
    expect(result.current.loading).toBe(false);
  });

  it("uses a generic message when a non-Error value is thrown", async () => {
    mockedInvoke.mockRejectedValue("string failure" as never);

    const { result } = renderHook(() => usePlans());

    await waitFor(() =>
      expect(result.current.error).toBe("Failed to fetch pricing data"),
    );
  });

  it("selects the pro plan as current when isPro is true", async () => {
    setAuth(true);
    mockedInvoke.mockResolvedValue(
      invokeResult({ prices: {}, missing: [] }) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.data).not.toBeNull());
    await waitFor(() =>
      expect(result.current.data!.currentPlan.id).toBe("pro"),
    );
  });

  it("keeps the default free plan when isPro is null", async () => {
    setAuth(null);
    mockedInvoke.mockResolvedValue(
      invokeResult({ prices: {}, missing: [] }) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.currentPlan.id).toBe("free");
  });

  it("updates the current plan via updateCurrentPlan and nulls data for unknown ids", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({ prices: {}, missing: [] }) as never,
    );

    const { result } = renderHook(() => usePlans());

    await waitFor(() => expect(result.current.data).not.toBeNull());

    // Switch to a known plan id.
    act(() => {
      result.current.updateCurrentPlan("enterprise");
    });
    await waitFor(() =>
      expect(result.current.data!.currentPlan.id).toBe("enterprise"),
    );

    // Unknown plan id -> currentPlan undefined -> data becomes null, plans [].
    act(() => {
      result.current.updateCurrentPlan("does-not-exist");
    });
    await waitFor(() => expect(result.current.data).toBeNull());
    expect(result.current.plans).toEqual([]);
  });

  it("falls back to an upper-cased symbol for an unknown currency", async () => {
    mockedInvoke.mockResolvedValue(
      invokeResult({ prices: {}, missing: [] }) as never,
    );

    const { result } = renderHook(() => usePlans("xyz"));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    // Unknown currency -> getCurrencySymbol returns the upper-cased code.
    expect(result.current.data!.plans.get("free")!.currency).toBe("XYZ");
  });
});
