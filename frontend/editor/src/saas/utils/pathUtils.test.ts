import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * pathUtils.ts reads `import.meta.env.VITE_RUN_SUBPATH` once at module load
 * to compute a module-level SUBPATH constant. Vitest runs in "test" mode and
 * does not load `.env.saas`, so VITE_RUN_SUBPATH is otherwise undefined.
 *
 * We stub the env var BEFORE importing the module (and reset modules between
 * groups) so we can deterministically exercise both the "no subpath" and the
 * configured-subpath ("app") branches of normalizePath().
 */

type PathUtils = typeof import("@app/utils/pathUtils");

async function importWithSubpath(subpath: string): Promise<PathUtils> {
  vi.resetModules();
  vi.stubEnv("VITE_RUN_SUBPATH", subpath);
  return import("@app/utils/pathUtils");
}

describe("pathUtils", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("normalizePath (no subpath configured)", () => {
    let normalizePath: PathUtils["normalizePath"];

    beforeEach(async () => {
      ({ normalizePath } = await importWithSubpath(""));
    });

    it("returns root unchanged", () => {
      expect(normalizePath("/")).toBe("/");
    });

    it("preserves a simple path with no trailing slash", () => {
      expect(normalizePath("/login")).toBe("/login");
    });

    it("adds a leading slash when missing", () => {
      expect(normalizePath("split")).toBe("/split");
    });

    it("adds a leading slash and strips a trailing slash together", () => {
      expect(normalizePath("merge/")).toBe("/merge");
    });

    it("strips a single trailing slash from a non-root path", () => {
      expect(normalizePath("/compress/")).toBe("/compress");
    });

    it("strips only one trailing slash, leaving an inner trailing slash", () => {
      // Only the final character is removed, so "a//" -> "a/"
      expect(normalizePath("/a//")).toBe("/a/");
    });

    it("keeps nested paths intact", () => {
      expect(normalizePath("/auth/callback")).toBe("/auth/callback");
    });

    it("does not collapse the root even when given as empty-ish input", () => {
      // "" becomes "/" via the leading-slash branch, and stays root.
      expect(normalizePath("")).toBe("/");
    });

    it("does NOT strip a subpath prefix when no subpath is configured", () => {
      expect(normalizePath("/app/split")).toBe("/app/split");
    });
  });

  describe("normalizePath (subpath = 'app')", () => {
    let normalizePath: PathUtils["normalizePath"];

    beforeEach(async () => {
      ({ normalizePath } = await importWithSubpath("app"));
    });

    it("strips the configured subpath prefix", () => {
      expect(normalizePath("/app/split")).toBe("/split");
    });

    it("maps the bare subpath to root", () => {
      expect(normalizePath("/app")).toBe("/");
    });

    it("strips the subpath prefix and trailing slash together", () => {
      expect(normalizePath("/app/merge/")).toBe("/merge");
    });

    it("treats '/app/' (subpath + slash) as the subpath root", () => {
      // "/app/" matches the `/${SUBPATH}/` prefix branch, leaving "/".
      expect(normalizePath("/app/")).toBe("/");
    });

    it("does not strip a subpath that is only a substring match", () => {
      // "/application" does not start with "/app/" nor equal "/app".
      expect(normalizePath("/application")).toBe("/application");
    });

    it("only strips the first occurrence of the subpath segment", () => {
      expect(normalizePath("/app/app/split")).toBe("/app/split");
    });

    it("normalizes a leading-slash-less subpath input", () => {
      expect(normalizePath("app/rotate")).toBe("/rotate");
    });
  });

  describe("normalizePath (subpath configured with surrounding slashes)", () => {
    it("trims leading/trailing slashes from the configured subpath", async () => {
      // SUBPATH is computed by stripping leading/trailing slashes, so "/app/"
      // is treated identically to "app".
      const { normalizePath } = await importWithSubpath("/app/");
      expect(normalizePath("/app/split")).toBe("/split");
      expect(normalizePath("/app")).toBe("/");
    });
  });

  describe("isAuthRoute", () => {
    let isAuthRoute: PathUtils["isAuthRoute"];

    beforeEach(async () => {
      ({ isAuthRoute } = await importWithSubpath(""));
    });

    it("returns true for /login", () => {
      expect(isAuthRoute("/login")).toBe(true);
    });

    it("returns true for /signup", () => {
      expect(isAuthRoute("/signup")).toBe(true);
    });

    it("returns true for /auth/callback", () => {
      expect(isAuthRoute("/auth/callback")).toBe(true);
    });

    it("normalizes a trailing slash before matching", () => {
      expect(isAuthRoute("/login/")).toBe(true);
    });

    it("normalizes a missing leading slash before matching", () => {
      expect(isAuthRoute("login")).toBe(true);
    });

    it("returns false for non-auth routes", () => {
      expect(isAuthRoute("/")).toBe(false);
      expect(isAuthRoute("/split")).toBe(false);
      expect(isAuthRoute("/auth")).toBe(false);
    });

    it("respects the configured subpath when matching auth routes", async () => {
      const { isAuthRoute: isAuthRouteApp } = await importWithSubpath("app");
      expect(isAuthRouteApp("/app/login")).toBe(true);
      expect(isAuthRouteApp("/app/auth/callback")).toBe(true);
      // Without the subpath, the raw "/app/login" would not be normalized away.
      expect(isAuthRoute("/app/login")).toBe(false);
    });
  });

  describe("isHomeRoute", () => {
    let isHomeRoute: PathUtils["isHomeRoute"];

    beforeEach(async () => {
      ({ isHomeRoute } = await importWithSubpath(""));
    });

    it("returns true for root", () => {
      expect(isHomeRoute("/")).toBe(true);
    });

    it("returns true for empty input (normalized to root)", () => {
      expect(isHomeRoute("")).toBe(true);
    });

    it("returns false for non-root paths", () => {
      expect(isHomeRoute("/login")).toBe(false);
      expect(isHomeRoute("/split")).toBe(false);
    });

    it("returns true for the bare subpath when configured", async () => {
      const { isHomeRoute: isHomeRouteApp } = await importWithSubpath("app");
      expect(isHomeRouteApp("/app")).toBe(true);
      expect(isHomeRouteApp("/app/")).toBe(true);
      expect(isHomeRouteApp("/app/split")).toBe(false);
    });
  });

  describe("isToolRoute", () => {
    let isToolRoute: PathUtils["isToolRoute"];

    beforeEach(async () => {
      ({ isToolRoute } = await importWithSubpath(""));
    });

    it("returns true for a known direct tool mapping", () => {
      expect(isToolRoute("/split")).toBe(true);
      expect(isToolRoute("/merge")).toBe(true);
      expect(isToolRoute("/compress")).toBe(true);
    });

    it("returns true for legacy/aliased tool URLs", () => {
      expect(isToolRoute("/pdf-organizer")).toBe(true);
      expect(isToolRoute("/split-pdfs")).toBe(true);
    });

    it("matches a known tool route given a trailing slash (normalized away)", () => {
      expect(isToolRoute("/split/")).toBe(true);
    });

    it("matches a known tool route given a missing leading slash", () => {
      expect(isToolRoute("split")).toBe(true);
    });

    it("returns false for unknown routes", () => {
      expect(isToolRoute("/")).toBe(false);
      expect(isToolRoute("/login")).toBe(false);
      expect(isToolRoute("/not-a-real-tool")).toBe(false);
    });

    it("matches tool routes under the configured subpath", async () => {
      const { isToolRoute: isToolRouteApp } = await importWithSubpath("app");
      expect(isToolRouteApp("/app/split")).toBe(true);
      expect(isToolRouteApp("/app/not-a-real-tool")).toBe(false);
    });
  });
});
