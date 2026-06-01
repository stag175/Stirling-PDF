import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/core/setupTests.ts"],
    css: false,
    exclude: [
      "node_modules/",
      "src/**/*.spec.ts", // Exclude Playwright E2E tests
      "src/tests/test-fixtures/**",
    ],
    // 20s (not 10s): v8 coverage instrumentation materially slows the heavy
    // integration tests (e.g. the Convert smart-detection suite), which
    // intermittently tripped a 10s limit under a fully-parallel --coverage run.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      reporter: ["text", "json", "json-summary", "html"],
      exclude: [
        "node_modules/",
        "src/core/setupTests.ts",
        "src/proprietary/setupTests.ts",
        "src/saas/setupTests.ts",
        "**/*.d.ts",
        "src/tests/test-fixtures/**",
        "src/**/*.spec.ts",
      ],
      // Regression-floor ratchet. Set just below the current aggregate so the
      // build fails if coverage drops, NOT as a target. Raise as tests are added
      // (see AGENTS.md Testing Strategy).
      //
      // 2026-06: a STALE floor (stmts/lines 7.7, funcs 27, branches 55) was found
      // to sit ABOVE the actual aggregate — a measured baseline was
      // 6.96 / 53.64 / 25.45 / 6.96, i.e. the gate had been red on all four metrics
      // since the B1 MUI->Mantine migration added uncovered UI wrapper code without
      // re-verification. Two waves of new tests (pure-logic utils, then
      // statement-heavy services/hooks/reducers) lifted every metric, with a full
      // 101-file green run measuring 8.21 / 61.19 / 30.14 / 8.21 -- now comfortably
      // ABOVE the old phantom floor. Floors pinned just below that. Only move up.
      thresholds: {
        statements: 8.1,
        branches: 60,
        functions: 30,
        lines: 8.1,
      },
    },
    projects: [
      {
        test: {
          name: "core",
          include: ["src/core/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.core.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "proprietary",
          include: ["src/proprietary/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.proprietary.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "desktop",
          include: ["src/desktop/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.desktop.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "saas",
          include: ["src/saas/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/saas/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.saas.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
      {
        test: {
          name: "prototypes",
          include: ["src/prototypes/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/core/setupTests.ts"],
        },
        plugins: [
          react(),
          tsconfigPaths({
            projects: ["./tsconfig.prototypes.vite.json"],
          }),
        ],
        esbuild: {
          target: "es2020",
        },
      },
    ],
  },
  esbuild: {
    target: "es2020",
  },
});
