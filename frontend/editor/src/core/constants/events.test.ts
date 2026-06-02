import { describe, expect, it } from "vitest";

import {
  dispatchTourState,
  requestStartTour,
  SERVER_LICENSE_REQUEST_EVENT,
  START_TOUR_EVENT,
  type StartTourPayload,
  TOUR_STATE_EVENT,
  type TourStatePayload,
  UPGRADE_BANNER_ALERT_EVENT,
  UPGRADE_BANNER_TEST_EVENT,
} from "@app/constants/events";

describe("requestStartTour", () => {
  it("dispatches a START_TOUR_EVENT CustomEvent carrying the tour type", () => {
    let captured: CustomEvent<StartTourPayload> | undefined;
    const handler = (e: Event) => {
      captured = e as CustomEvent<StartTourPayload>;
    };
    window.addEventListener(START_TOUR_EVENT, handler);
    try {
      requestStartTour("admin");
    } finally {
      window.removeEventListener(START_TOUR_EVENT, handler);
    }
    expect(captured?.type).toBe(START_TOUR_EVENT);
    expect(captured?.detail).toEqual({ tourType: "admin" });
  });

  it("forwards each tour type verbatim", () => {
    const seen: string[] = [];
    const handler = (e: Event) => {
      seen.push((e as CustomEvent<StartTourPayload>).detail.tourType);
    };
    window.addEventListener(START_TOUR_EVENT, handler);
    try {
      requestStartTour("tools");
      requestStartTour("whatsnew");
    } finally {
      window.removeEventListener(START_TOUR_EVENT, handler);
    }
    expect(seen).toEqual(["tools", "whatsnew"]);
  });
});

describe("dispatchTourState", () => {
  it("dispatches a TOUR_STATE_EVENT CustomEvent with the open flag", () => {
    const states: boolean[] = [];
    const handler = (e: Event) => {
      states.push((e as CustomEvent<TourStatePayload>).detail.isOpen);
    };
    window.addEventListener(TOUR_STATE_EVENT, handler);
    try {
      dispatchTourState(true);
      dispatchTourState(false);
    } finally {
      window.removeEventListener(TOUR_STATE_EVENT, handler);
    }
    expect(states).toEqual([true, false]);
  });
});

describe("event name constants", () => {
  it("are all unique (no two events share a name => no cross-wiring)", () => {
    const names = [
      SERVER_LICENSE_REQUEST_EVENT,
      UPGRADE_BANNER_TEST_EVENT,
      UPGRADE_BANNER_ALERT_EVENT,
      START_TOUR_EVENT,
      TOUR_STATE_EVENT,
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it("are all namespaced under 'stirling:'", () => {
    const names = [
      SERVER_LICENSE_REQUEST_EVENT,
      UPGRADE_BANNER_TEST_EVENT,
      UPGRADE_BANNER_ALERT_EVENT,
      START_TOUR_EVENT,
      TOUR_STATE_EVENT,
    ];
    for (const name of names) {
      expect(name.startsWith("stirling:")).toBe(true);
    }
  });
});
