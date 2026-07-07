import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openAppSettings, openPlanSettings } from "@app/utils/appSettings";

/**
 * appSettings dispatches DOM CustomEvents that the AppConfigModal listens for:
 *   - "appConfig:open"     — asks the UI to open the config modal (detail carries
 *                            an optional target section key and an optional notice)
 *   - "appConfig:navigate" — only emitted when a target section is requested, so
 *                            the modal jumps straight to that section once mounted.
 * We capture the real events off `window` rather than mocking dispatchEvent, so the
 * event names and detail payloads are pinned exactly as a consumer would receive them.
 */

interface Captured {
  type: string;
  detail: unknown;
}

let events: Captured[];
const record = (e: Event) => {
  events.push({ type: e.type, detail: (e as CustomEvent).detail });
};

beforeEach(() => {
  events = [];
  window.addEventListener("appConfig:open", record);
  window.addEventListener("appConfig:navigate", record);
});

afterEach(() => {
  window.removeEventListener("appConfig:open", record);
  window.removeEventListener("appConfig:navigate", record);
});

describe("openAppSettings", () => {
  it("with no arguments emits a single bare 'open' event (no navigate)", () => {
    openAppSettings();
    expect(events).toEqual([{ type: "appConfig:open", detail: {} }]);
  });

  it("with only a notice emits 'open' carrying the notice but no navigate", () => {
    openAppSettings(undefined, "Upgrade required");
    expect(events).toEqual([
      { type: "appConfig:open", detail: { notice: "Upgrade required" } },
    ]);
  });

  it("with a target key emits 'open' then a matching 'navigate'", () => {
    openAppSettings("plan", "see plans");
    expect(events).toEqual([
      { type: "appConfig:open", detail: { key: "plan", notice: "see plans" } },
      { type: "appConfig:navigate", detail: { key: "plan" } },
    ]);
  });

  it("with a target key but no notice omits notice from the open detail", () => {
    openAppSettings("plan");
    expect(events).toEqual([
      { type: "appConfig:open", detail: { key: "plan" } },
      { type: "appConfig:navigate", detail: { key: "plan" } },
    ]);
  });
});

describe("openPlanSettings", () => {
  it("is a shortcut for opening the 'plan' section", () => {
    openPlanSettings("you are out of credits");
    expect(events).toEqual([
      {
        type: "appConfig:open",
        detail: { key: "plan", notice: "you are out of credits" },
      },
      { type: "appConfig:navigate", detail: { key: "plan" } },
    ]);
  });
});
