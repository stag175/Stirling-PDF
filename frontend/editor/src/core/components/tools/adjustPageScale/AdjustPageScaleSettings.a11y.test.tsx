import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import AdjustPageScaleSettings from "@app/components/tools/adjustPageScale/AdjustPageScaleSettings";
import {
  AdjustPageScaleParameters,
  PageSize,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage from
 * the shared/ components to a tool settings component rendered under MantineProvider.
 */
describe("AdjustPageScaleSettings accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const parameters: AdjustPageScaleParameters = {
      scaleFactor: 1.0,
      pageSize: PageSize.KEEP,
      orientation: "PORTRAIT",
    };

    const { container } = render(
      <MantineProvider>
        <AdjustPageScaleSettings
          parameters={parameters}
          onParameterChange={() => {}}
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
