import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import OAuthButtons from "@app/routes/login/OAuthButtons";

// Mock i18n (matches OAuthButtons.test.tsx).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

/**
 * Accessibility regression test (roadmap A4). This test originally surfaced a real
 * `image-redundant-alt` violation: each provider icon used `alt={p.label}` while its button
 * already carries an `aria-label`/visible text with the same provider name. The fix made those
 * decorative icons use `alt=""`; this test pins that they stay accessible.
 */
describe("OAuthButtons accessibility (A4)", () => {
  test("renders with no axe violations (decorative provider icons use empty alt)", async () => {
    const { container } = render(
      <MantineProvider>
        <OAuthButtons
          onProviderClick={() => {}}
          isSubmitting={false}
          enabledProviders={["google", "github", "authentik"]}
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
