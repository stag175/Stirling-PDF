/**
 * Unit tests for scarfTracking (scarfTracking.ts).
 *
 * Determinism notes:
 * - The global `Image` constructor is replaced with a fake that records every
 *   instance created plus the `src` / `referrerPolicy` it is assigned, so we can
 *   assert exactly when (and with what URL) a pixel fires without any network.
 * - `Date.now` is stubbed via `vi.spyOn` so the 250ms throttle window is fully
 *   controlled and never depends on wall-clock time.
 * - `resetScarfConfig()` is exported specifically for tests; it is called in
 *   `beforeEach` so module-level state never leaks between cases.
 *
 * Note: `resetScarfConfig()` clears consent/enable/throttle state but does NOT
 * reset the `configured` flag (by design). Because the module is imported once,
 * `configured` is set on the first `setScarfConfig()` call and stays true for
 * the rest of the suite, so the "before initialization" warning branch is
 * covered first via `vi.resetModules()` + a fresh dynamic import.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import {
  firePixel,
  setScarfConfig,
  resetScarfConfig,
} from "@app/utils/scarfTracking";

const SCARF_BASE =
  "https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7";

interface FakeImage {
  src: string;
  referrerPolicy: string;
}

/** All Image instances created since the last reset. */
let createdImages: FakeImage[] = [];

const RealImage = globalThis.Image;

/**
 * Install a deterministic fake `Image` constructor that records each instance.
 * Returns nothing; instances accumulate in the module-level `createdImages`.
 */
function installFakeImage(): void {
  createdImages = [];
  (globalThis as { Image: unknown }).Image = class {
    src = "";
    referrerPolicy = "";
    constructor() {
      createdImages.push(this as unknown as FakeImage);
    }
  };
}

describe("scarfTracking", () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installFakeImage();
    resetScarfConfig();
    // Default clock; individual tests advance it as needed.
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    (globalThis as { Image: unknown }).Image = RealImage;
  });

  describe("firePixel before initialization", () => {
    it("warns and does not fire when setScarfConfig has never been called", async () => {
      // Use an isolated module instance whose `configured` flag is still false.
      vi.resetModules();
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const fresh = await import("@app/utils/scarfTracking");
      fresh.firePixel("/before-init");

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("firePixel() called before setScarfConfig()"),
      );
      expect(createdImages).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe("global enable flag", () => {
    it("does not fire when scarf is globally disabled (enableScarf === false)", () => {
      const consent = vi.fn().mockReturnValue(true);
      setScarfConfig(false, consent);

      firePixel("/disabled");

      // Short-circuits before the consent check is ever consulted.
      expect(consent).not.toHaveBeenCalled();
      expect(createdImages).toHaveLength(0);
    });

    it("proceeds past the enable check when scarf is enabled (true)", () => {
      const consent = vi.fn().mockReturnValue(true);
      setScarfConfig(true, consent);

      firePixel("/enabled");

      expect(consent).toHaveBeenCalledWith("scarf", "analytics");
      expect(createdImages).toHaveLength(1);
    });

    it("proceeds past the enable check when scarf flag is null (not strictly false)", () => {
      const consent = vi.fn().mockReturnValue(true);
      setScarfConfig(null, consent);

      firePixel("/null-flag");

      expect(consent).toHaveBeenCalledWith("scarf", "analytics");
      expect(createdImages).toHaveLength(1);
    });
  });

  describe("consent gating", () => {
    it("does not fire when the consent checker returns false", () => {
      const consent = vi.fn().mockReturnValue(false);
      setScarfConfig(true, consent);

      firePixel("/no-consent");

      expect(consent).toHaveBeenCalledWith("scarf", "analytics");
      expect(createdImages).toHaveLength(0);
    });

    it("does not fire when consent state is later revoked", () => {
      const consent = vi
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      setScarfConfig(true, consent);

      // First call: consent granted -> fires.
      firePixel("/page-a");
      expect(createdImages).toHaveLength(1);

      // Second call (different path): consent revoked -> blocked.
      firePixel("/page-b");
      expect(createdImages).toHaveLength(1);
    });
  });

  describe("successful firing", () => {
    it("creates an Image with the correct URL and referrer policy", () => {
      setScarfConfig(true, () => true);

      firePixel("/dashboard");

      expect(createdImages).toHaveLength(1);
      const img = createdImages[0];
      expect(img.referrerPolicy).toBe("no-referrer-when-downgrade");
      expect(img.src).toBe(`${SCARF_BASE}&path=%2Fdashboard`);
    });

    it("url-encodes complex pathnames including query and unicode chars", () => {
      setScarfConfig(true, () => true);

      const path = "/files/résumé?id=1&x=a b";
      firePixel(path);

      expect(createdImages).toHaveLength(1);
      expect(createdImages[0].src).toBe(
        `${SCARF_BASE}&path=${encodeURIComponent(path)}`,
      );
    });

    it("fires for an empty pathname (encodes to empty string)", () => {
      setScarfConfig(true, () => true);

      firePixel("");

      expect(createdImages).toHaveLength(1);
      expect(createdImages[0].src).toBe(`${SCARF_BASE}&path=`);
    });
  });

  describe("throttle / dedupe logic", () => {
    it("blocks a repeat of the same pathname within the 250ms window", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(10_000);
      firePixel("/same");
      expect(createdImages).toHaveLength(1);

      // 249ms later, same path -> within window -> blocked.
      nowSpy.mockReturnValue(10_000 + 249);
      firePixel("/same");
      expect(createdImages).toHaveLength(1);
    });

    it("treats exactly 250ms as outside the window and fires again", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(20_000);
      firePixel("/same");
      expect(createdImages).toHaveLength(1);

      // Exactly 250ms later: `now - last < 250` is false -> fires.
      nowSpy.mockReturnValue(20_000 + 250);
      firePixel("/same");
      expect(createdImages).toHaveLength(2);
    });

    it("fires again after the window fully elapses for the same path", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(30_000);
      firePixel("/same");
      nowSpy.mockReturnValue(30_000 + 1_000);
      firePixel("/same");

      expect(createdImages).toHaveLength(2);
    });

    it("always fires on a pathname change even within the time window", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(40_000);
      firePixel("/page-1");
      expect(createdImages).toHaveLength(1);

      // 10ms later but a DIFFERENT path -> pathname guard fails -> fires.
      nowSpy.mockReturnValue(40_010);
      firePixel("/page-2");
      expect(createdImages).toHaveLength(2);

      expect(createdImages[0].src).toBe(`${SCARF_BASE}&path=%2Fpage-1`);
      expect(createdImages[1].src).toBe(`${SCARF_BASE}&path=%2Fpage-2`);
    });

    it("updates the throttle bookkeeping so an A->B->A sequence within window still fires", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(50_000);
      firePixel("/a"); // fires, last = /a @ 50000
      nowSpy.mockReturnValue(50_050);
      firePixel("/b"); // path change -> fires, last = /b @ 50050
      nowSpy.mockReturnValue(50_100);
      firePixel("/a"); // path differs from last (/b) -> fires

      expect(createdImages).toHaveLength(3);
    });
  });

  describe("resetScarfConfig", () => {
    it("clears throttle state so the same path fires immediately after reset", () => {
      setScarfConfig(true, () => true);

      nowSpy.mockReturnValue(60_000);
      firePixel("/keep");
      expect(createdImages).toHaveLength(1);

      // Reset clears lastFiredPathname/lastFiredTime (but keeps `configured`).
      resetScarfConfig();
      // Must re-supply config because reset also nulls the consent checker.
      setScarfConfig(true, () => true);

      // Same path, same instant: would normally be throttled, but state was wiped.
      firePixel("/keep");
      expect(createdImages).toHaveLength(2);
    });

    it("nulls the consent checker so firePixel is blocked until reconfigured", () => {
      setScarfConfig(true, () => true);
      resetScarfConfig();

      // After reset, isServiceAccepted is null -> guard blocks firing.
      firePixel("/after-reset");
      expect(createdImages).toHaveLength(0);
    });
  });
});
