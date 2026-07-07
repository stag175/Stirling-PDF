import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserId } from "@app/utils/browserIdentifier";

const KEY = "stirling_browser_id";

describe("getBrowserId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates and persists a new id on first call", () => {
    expect(localStorage.getItem(KEY)).toBeNull();
    const id = getBrowserId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it("is idempotent — repeated calls return the persisted id", () => {
    const first = getBrowserId();
    const second = getBrowserId();
    expect(second).toBe(first);
    expect(localStorage.getItem(KEY)).toBe(first);
  });

  it("returns an already-stored id without regenerating", () => {
    localStorage.setItem(KEY, "existing-id");
    expect(getBrowserId()).toBe("existing-id");
  });

  it("falls back to a session_-prefixed id when localStorage is unavailable", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });
    const id = getBrowserId();
    expect(id.startsWith("session_")).toBe(true);
    expect(id.length).toBeGreaterThan("session_".length);
  });
});
