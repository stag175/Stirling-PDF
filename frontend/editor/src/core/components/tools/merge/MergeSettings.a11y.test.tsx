import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import MergeSettings from "@app/components/tools/merge/MergeSettings";
import type { MergeParameters } from "@app/hooks/tools/merge/useMergeParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage from
 * the shared/ components to a tool settings component rendered under MantineProvider.
 */
describe("MergeSettings accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const parameters: MergeParameters = {
      removeDigitalSignature: false,
      generateTableOfContents: false,
    };

    const { container } = render(
      <MantineProvider>
        <MergeSettings parameters={parameters} onParameterChange={() => {}} />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
