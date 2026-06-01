import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import {
  pollLicenseKeyWithBackoff,
  activateLicenseKey,
  resyncExistingLicense,
} from "@app/utils/licenseCheckoutUtils";
import licenseService, { LicenseInfo } from "@app/services/licenseService";

// Mock the license service so all network/Supabase/axios calls are deterministic.
vi.mock("@app/services/licenseService", () => ({
  default: {
    checkLicenseKey: vi.fn(),
    saveLicenseKey: vi.fn(),
    getLicenseInfo: vi.fn(),
    resyncLicense: vi.fn(),
  },
}));

const checkLicenseKey = licenseService.checkLicenseKey as Mock;
const saveLicenseKey = licenseService.saveLicenseKey as Mock;
const getLicenseInfo = licenseService.getLicenseInfo as Mock;
const resyncLicense = licenseService.resyncLicense as Mock;

const SAMPLE_LICENSE_INFO: LicenseInfo = {
  licenseType: "SERVER",
  enabled: true,
  maxUsers: 0,
  hasKey: true,
  licenseKey: "lic-abc",
};

// Silence noisy console output from the module under test.
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * Helper that drains the microtask queue + advances fake timers repeatedly so a
 * recursive `await setTimeout` chain can settle. Returns once the polling
 * promise resolves.
 */
async function runWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  const wrapped = promise.then((value) => {
    settled = true;
    return value;
  });

  // Up to a generous number of iterations to flush all backoff steps.
  for (let i = 0; i < 50 && !settled; i++) {
    // Flush pending microtasks (resolved fetch promises) before advancing time.
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20000);
  }

  return wrapped;
}

describe("pollLicenseKeyWithBackoff", () => {
  it("returns success immediately when the key is ready on the first attempt", async () => {
    checkLicenseKey.mockResolvedValue({
      status: "ready",
      license_key: "key-123",
    });
    const onStatusChange = vi.fn();

    const result = await pollLicenseKeyWithBackoff("install-1", {
      onStatusChange,
    });

    expect(result).toEqual({ success: true, licenseKey: "key-123" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(1);
    expect(checkLicenseKey).toHaveBeenCalledWith("install-1");
    expect(onStatusChange).toHaveBeenNthCalledWith(1, "polling");
    expect(onStatusChange).toHaveBeenNthCalledWith(2, "ready");
  });

  it("treats a 'ready' status without a license_key as not-ready and keeps polling", async () => {
    vi.useFakeTimers();
    // status ready but no key -> falls through to retry, then real ready.
    checkLicenseKey
      .mockResolvedValueOnce({ status: "ready" })
      .mockResolvedValueOnce({ status: "ready", license_key: "later-key" });

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-2", { backoffMs: [10, 20, 30] }),
    );

    expect(result).toEqual({ success: true, licenseKey: "later-key" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(2);
  });

  it("polls with backoff and succeeds on a later attempt", async () => {
    vi.useFakeTimers();
    checkLicenseKey
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "ready", license_key: "key-late" });
    const onStatusChange = vi.fn();

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-3", {
        onStatusChange,
        backoffMs: [100, 200, 400, 800],
      }),
    );

    expect(result).toEqual({ success: true, licenseKey: "key-late" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(3);
    expect(onStatusChange).toHaveBeenCalledWith("polling");
    expect(onStatusChange).toHaveBeenCalledWith("ready");
    expect(onStatusChange).not.toHaveBeenCalledWith("timeout");
  });

  it("times out after exhausting all backoff attempts when never ready", async () => {
    vi.useFakeTimers();
    checkLicenseKey.mockResolvedValue({ status: "pending" });
    const onStatusChange = vi.fn();

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-4", {
        onStatusChange,
        backoffMs: [10, 20, 30],
      }),
    );

    expect(result).toEqual({
      success: false,
      timedOut: true,
      error: "Polling timeout - license key not ready",
    });
    // With 3 backoff slots, attemptIndex reaches length on the 3rd poll.
    expect(checkLicenseKey).toHaveBeenCalledTimes(3);
    expect(onStatusChange).toHaveBeenLastCalledWith("timeout");
  });

  it("retries after an error and eventually succeeds", async () => {
    vi.useFakeTimers();
    checkLicenseKey
      .mockRejectedValueOnce(new Error("network glitch"))
      .mockResolvedValueOnce({ status: "ready", license_key: "after-error" });

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-5", { backoffMs: [10, 20, 30] }),
    );

    expect(result).toEqual({ success: true, licenseKey: "after-error" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(2);
  });

  it("returns the error message when all attempts fail with errors", async () => {
    vi.useFakeTimers();
    checkLicenseKey.mockRejectedValue(new Error("server exploded"));
    const onStatusChange = vi.fn();

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-6", {
        onStatusChange,
        backoffMs: [10, 20],
      }),
    );

    expect(result).toEqual({ success: false, error: "server exploded" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenLastCalledWith("timeout");
  });

  it("falls back to a generic message when a non-Error is thrown on the final attempt", async () => {
    vi.useFakeTimers();
    checkLicenseKey.mockRejectedValue("string failure");

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-7", { backoffMs: [10] }),
    );

    expect(result).toEqual({ success: false, error: "Polling failed" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(1);
  });

  it("cancels immediately when the component is unmounted before the first poll", async () => {
    const result = await pollLicenseKeyWithBackoff("install-8", {
      isMounted: () => false,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(checkLicenseKey).not.toHaveBeenCalled();
  });

  it("returns unmounted after the network call resolves if the component unmounted", async () => {
    let mounted = true;
    checkLicenseKey.mockImplementation(async () => {
      // Simulate unmount happening during the in-flight request.
      mounted = false;
      return { status: "ready", license_key: "ignored" };
    });

    const result = await pollLicenseKeyWithBackoff("install-9", {
      isMounted: () => mounted,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(1);
  });

  it("returns unmounted when the component unmounts after a failed network call", async () => {
    let mounted = true;
    checkLicenseKey.mockImplementation(async () => {
      mounted = false;
      throw new Error("boom");
    });

    const result = await pollLicenseKeyWithBackoff("install-10", {
      isMounted: () => mounted,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(checkLicenseKey).toHaveBeenCalledTimes(1);
  });

  it("uses the default backoff schedule when none is provided", async () => {
    vi.useFakeTimers();
    checkLicenseKey.mockResolvedValue({ status: "pending" });

    const result = await runWithFakeTimers(
      pollLicenseKeyWithBackoff("install-11"),
    );

    expect(result.timedOut).toBe(true);
    // Default schedule has 5 slots -> 5 attempts before timeout.
    expect(checkLicenseKey).toHaveBeenCalledTimes(5);
  });
});

describe("activateLicenseKey", () => {
  it("saves the key, fetches info, and invokes onActivated on success", async () => {
    saveLicenseKey.mockResolvedValue({ success: true, licenseType: "SERVER" });
    getLicenseInfo.mockResolvedValue(SAMPLE_LICENSE_INFO);
    const onActivated = vi.fn();

    const result = await activateLicenseKey("my-key", { onActivated });

    expect(saveLicenseKey).toHaveBeenCalledWith("my-key");
    expect(getLicenseInfo).toHaveBeenCalledTimes(1);
    expect(onActivated).toHaveBeenCalledWith(SAMPLE_LICENSE_INFO);
    expect(result).toEqual({
      success: true,
      licenseType: "SERVER",
      licenseInfo: SAMPLE_LICENSE_INFO,
    });
  });

  it("returns success with a warning when fetching license info fails after save", async () => {
    saveLicenseKey.mockResolvedValue({
      success: true,
      licenseType: "ENTERPRISE",
    });
    getLicenseInfo.mockRejectedValue(new Error("info down"));
    const onActivated = vi.fn();

    const result = await activateLicenseKey("my-key", { onActivated });

    expect(onActivated).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      licenseType: "ENTERPRISE",
      error: "Failed to fetch updated license info",
    });
  });

  it("returns the save error when saveLicenseKey reports failure", async () => {
    saveLicenseKey.mockResolvedValue({
      success: false,
      error: "invalid key",
    });

    const result = await activateLicenseKey("bad-key");

    expect(getLicenseInfo).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "invalid key" });
  });

  it("uses a default message when save fails without an error string", async () => {
    saveLicenseKey.mockResolvedValue({ success: false });

    const result = await activateLicenseKey("bad-key");

    expect(result).toEqual({
      success: false,
      error: "Failed to save license key",
    });
  });

  it("returns the thrown error message when saveLicenseKey rejects", async () => {
    saveLicenseKey.mockRejectedValue(new Error("save threw"));

    const result = await activateLicenseKey("my-key");

    expect(result).toEqual({ success: false, error: "save threw" });
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    saveLicenseKey.mockRejectedValue("not-an-error");

    const result = await activateLicenseKey("my-key");

    expect(result).toEqual({ success: false, error: "Activation failed" });
  });

  it("returns unmounted (and skips getLicenseInfo) when unmounted right after save", async () => {
    saveLicenseKey.mockResolvedValue({ success: true, licenseType: "SERVER" });
    getLicenseInfo.mockResolvedValue(SAMPLE_LICENSE_INFO);

    const result = await activateLicenseKey("my-key", {
      isMounted: () => false,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(getLicenseInfo).not.toHaveBeenCalled();
  });

  it("returns unmounted (and skips onActivated) when unmounted after fetching info", async () => {
    saveLicenseKey.mockResolvedValue({ success: true, licenseType: "SERVER" });
    let mounted = true;
    getLicenseInfo.mockImplementation(async () => {
      mounted = false;
      return SAMPLE_LICENSE_INFO;
    });
    const onActivated = vi.fn();

    const result = await activateLicenseKey("my-key", {
      isMounted: () => mounted,
      onActivated,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(onActivated).not.toHaveBeenCalled();
  });
});

describe("resyncExistingLicense", () => {
  it("resyncs, fetches info, and invokes onActivated on success", async () => {
    resyncLicense.mockResolvedValue({ success: true, licenseType: "SERVER" });
    getLicenseInfo.mockResolvedValue(SAMPLE_LICENSE_INFO);
    const onActivated = vi.fn();

    const result = await resyncExistingLicense({ onActivated });

    expect(resyncLicense).toHaveBeenCalledTimes(1);
    expect(getLicenseInfo).toHaveBeenCalledTimes(1);
    expect(onActivated).toHaveBeenCalledWith(SAMPLE_LICENSE_INFO);
    expect(result).toEqual({
      success: true,
      licenseType: "SERVER",
      licenseInfo: SAMPLE_LICENSE_INFO,
    });
  });

  it("returns success with a warning when fetching info fails after resync", async () => {
    resyncLicense.mockResolvedValue({
      success: true,
      licenseType: "ENTERPRISE",
    });
    getLicenseInfo.mockRejectedValue(new Error("info down"));

    const result = await resyncExistingLicense();

    expect(result).toEqual({
      success: true,
      licenseType: "ENTERPRISE",
      error: "Failed to fetch updated license info",
    });
  });

  it("returns the resync error when resyncLicense reports failure", async () => {
    resyncLicense.mockResolvedValue({ success: false, error: "no key set" });

    const result = await resyncExistingLicense();

    expect(getLicenseInfo).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "no key set" });
  });

  it("uses a default message when resync fails without an error string", async () => {
    resyncLicense.mockResolvedValue({ success: false });

    const result = await resyncExistingLicense();

    expect(result).toEqual({
      success: false,
      error: "Failed to resync license",
    });
  });

  it("returns the thrown error message when resyncLicense rejects", async () => {
    resyncLicense.mockRejectedValue(new Error("resync threw"));

    const result = await resyncExistingLicense();

    expect(result).toEqual({ success: false, error: "resync threw" });
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    resyncLicense.mockRejectedValue(42);

    const result = await resyncExistingLicense();

    expect(result).toEqual({ success: false, error: "Resync failed" });
  });

  it("returns unmounted (and skips getLicenseInfo) when unmounted right after resync", async () => {
    resyncLicense.mockResolvedValue({ success: true, licenseType: "SERVER" });

    const result = await resyncExistingLicense({ isMounted: () => false });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(getLicenseInfo).not.toHaveBeenCalled();
  });

  it("returns unmounted (and skips onActivated) when unmounted after fetching info", async () => {
    resyncLicense.mockResolvedValue({ success: true, licenseType: "SERVER" });
    let mounted = true;
    getLicenseInfo.mockImplementation(async () => {
      mounted = false;
      return SAMPLE_LICENSE_INFO;
    });
    const onActivated = vi.fn();

    const result = await resyncExistingLicense({
      isMounted: () => mounted,
      onActivated,
    });

    expect(result).toEqual({ success: false, error: "Component unmounted" });
    expect(onActivated).not.toHaveBeenCalled();
  });
});
