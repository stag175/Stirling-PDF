import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import { ButtonToggle } from "@app/components/shared/ButtonToggle";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage seeded by
 * ButtonSelector.a11y.test.tsx to another simple shared/presentational component.
 */
describe("ButtonToggle accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <ButtonToggle
          value="a"
          onChange={() => {}}
          options={[
            { value: "a", label: "Option A", description: "First choice" },
            { value: "b", label: "Option B" },
          ]}
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
