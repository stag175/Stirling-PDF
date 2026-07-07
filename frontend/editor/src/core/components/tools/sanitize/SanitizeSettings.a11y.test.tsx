import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import SanitizeSettings from "@app/components/tools/sanitize/SanitizeSettings";
import type { SanitizeParameters } from "@app/hooks/tools/sanitize/useSanitizeParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage from
 * the shared/ components to a tool settings component rendered under MantineProvider.
 */
describe("SanitizeSettings accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const parameters: SanitizeParameters = {
      removeJavaScript: true,
      removeEmbeddedFiles: true,
      removeXMPMetadata: false,
      removeMetadata: false,
      removeLinks: false,
      removeFonts: false,
    };

    const { container } = render(
      <MantineProvider>
        <SanitizeSettings parameters={parameters} onParameterChange={() => {}} />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
