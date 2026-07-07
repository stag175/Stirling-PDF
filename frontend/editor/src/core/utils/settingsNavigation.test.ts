/**
 * Unit tests for settingsNavigation.
 *
 * The module reads window.location.pathname and writes via
 * window.history.pushState, then dispatches a synthetic popstate event so
 * listening components can react. To keep tests deterministic:
 *   - window.location is replaced with a controllable plain object so we can
 *     set pathname per test (the only piece of location the module reads).
 *   - window.history.pushState is spied (no real navigation occurs).
 *   - window.dispatchEvent is spied so we can assert the popstate notification
 *     without relying on listener side effects.
 *
 * getSettingsUrl is pure and is exercised for real. NavKey values come from the
 * real VALID_NAV_KEYS list to keep section strings valid.
 */

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
  navigateToSettings,
  getSettingsUrl,
  isInSettings,
} from "@app/utils/settingsNavigation";
import type { NavKey } from "@app/components/shared/config/types";

let pushStateSpy: Mock;
let dispatchEventSpy: Mock;
let originalLocation: Location;

/** Replace window.location with a controllable pathname. */
function setPathname(pathname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, pathname } as unknown as Location,
  });
}

beforeEach(() => {
  originalLocation = window.location;
  setPathname("/");

  pushStateSpy = vi.fn();
  vi.spyOn(window.history, "pushState").mockImplementation(pushStateSpy);
  // dispatchEvent returns a boolean; default the mock to true.
  dispatchEventSpy = vi.fn().mockReturnValue(true);
  vi.spyOn(window, "dispatchEvent").mockImplementation(dispatchEventSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

// --- navigateToSettings ----------------------------------------------------

describe("navigateToSettings", () => {
  it("appends /settings/<section> to a root path base and notifies via popstate", () => {
    // "/".split("/settings")[0] === "/" (truthy), so the base is "/" itself.
    setPathname("/");
    navigateToSettings("people" as NavKey);

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "//settings/people");

    // A single PopStateEvent of type "popstate" is dispatched.
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0][0] as Event;
    expect(event).toBeInstanceOf(PopStateEvent);
    expect(event.type).toBe("popstate");
  });

  it("preserves an existing base path that already contains /settings", () => {
    // split("/settings")[0] yields the segment before the first /settings.
    setPathname("/workspace/settings/account");
    navigateToSettings("security" as NavKey);

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      "",
      "/workspace/settings/security",
    );
  });

  it("keeps a non-settings prefix as the base path", () => {
    // No "/settings" substring -> split returns the whole pathname as base.
    setPathname("/app/dashboard");
    navigateToSettings("preferences" as NavKey);

    expect(pushStateSpy).toHaveBeenCalledWith(
      {},
      "",
      "/app/dashboard/settings/preferences",
    );
  });

  it("falls back to an empty base when the path begins with /settings", () => {
    // split("/settings")[0] === "" here, exercising the `|| ''` fallback.
    setPathname("/settings/general");
    navigateToSettings("adminPremium" as NavKey);

    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/settings/adminPremium");
  });
});

// --- getSettingsUrl --------------------------------------------------------

describe("getSettingsUrl", () => {
  it("builds the canonical /settings/<section> path", () => {
    expect(getSettingsUrl("people" as NavKey)).toBe("/settings/people");
    expect(getSettingsUrl("adminAudit" as NavKey)).toBe("/settings/adminAudit");
  });

  it("does not read or mutate history/location", () => {
    setPathname("/anything");
    getSettingsUrl("api-keys" as NavKey);
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });
});

// --- isInSettings ----------------------------------------------------------

describe("isInSettings", () => {
  it("returns true for any settings path when no section is given", () => {
    setPathname("/settings/people");
    expect(isInSettings()).toBe(true);

    setPathname("/settings");
    expect(isInSettings()).toBe(true);
  });

  it("returns false outside settings when no section is given", () => {
    setPathname("/dashboard");
    expect(isInSettings()).toBe(false);
  });

  it("returns true when the pathname exactly matches the requested section", () => {
    setPathname("/settings/teams");
    expect(isInSettings("teams" as NavKey)).toBe(true);
  });

  it("returns false when on settings but a different section is requested", () => {
    setPathname("/settings/teams");
    expect(isInSettings("people" as NavKey)).toBe(false);
  });

  it("requires an exact match, rejecting nested or prefixed section paths", () => {
    // Trailing segment beyond the section must not match.
    setPathname("/settings/teams/members");
    expect(isInSettings("teams" as NavKey)).toBe(false);

    // A base-prefixed settings path is not an exact "/settings/<section>".
    setPathname("/workspace/settings/teams");
    expect(isInSettings("teams" as NavKey)).toBe(false);
  });
});
