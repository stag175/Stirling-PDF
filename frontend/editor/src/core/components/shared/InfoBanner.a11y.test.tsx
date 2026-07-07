import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import { InfoBanner } from "@app/components/shared/InfoBanner";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage seeded by
 * ButtonSelector.a11y.test.tsx to another simple shared/presentational component.
 */
describe("InfoBanner accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <InfoBanner
          icon="info"
          title="Heads up"
          message="Your document was processed."
          buttonText="View"
          onButtonClick={() => {}}
          onDismiss={() => {}}
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
