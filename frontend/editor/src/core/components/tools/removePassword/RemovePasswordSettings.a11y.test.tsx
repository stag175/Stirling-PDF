import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import RemovePasswordSettings from "@app/components/tools/removePassword/RemovePasswordSettings";
import { defaultParameters } from "@app/hooks/tools/removePassword/useRemovePasswordParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage from
 * the shared/ components to a tool settings component rendered under MantineProvider.
 */
describe("RemovePasswordSettings accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <RemovePasswordSettings
          parameters={defaultParameters}
          onParameterChange={() => {}}
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
