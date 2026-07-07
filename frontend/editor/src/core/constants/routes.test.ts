import { describe, expect, it } from "vitest";

import { AUTH_ROUTES, isAuthRoute } from "@app/constants/routes";

describe("isAuthRoute", () => {
  it("matches each declared auth route exactly", () => {
    for (const route of AUTH_ROUTES) {
      expect(isAuthRoute(route)).toBe(true);
    }
  });

  it("matches by prefix, so sub-paths and query strings still count as auth routes", () => {
    expect(isAuthRoute("/auth/callback")).toBe(true);
    expect(isAuthRoute("/reset-password?token=abc")).toBe(true);
    expect(isAuthRoute("/login/sso")).toBe(true);
  });

  it("is a startsWith check, not a segment match (a documented sharp edge)", () => {
    // "/loginx" is not a real route, but it shares the "/login" prefix, so the
    // current implementation reports it as an auth route. Pinned so a future
    // tightening to segment-aware matching is a deliberate, visible change.
    expect(isAuthRoute("/loginx")).toBe(true);
  });

  it("rejects ordinary app routes", () => {
    expect(isAuthRoute("/dashboard")).toBe(false);
    expect(isAuthRoute("/")).toBe(false);
    expect(isAuthRoute("")).toBe(false);
    expect(isAuthRoute("/settings/login")).toBe(false); // prefix is in the middle, not the start
  });

  it("exposes the canonical list of auth routes", () => {
    expect(AUTH_ROUTES).toEqual([
      "/login",
      "/signup",
      "/auth",
      "/invite",
      "/forgot-password",
      "/reset-password",
    ]);
  });
});
