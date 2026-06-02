import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import { TextInput } from "@app/components/shared/TextInput";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage seeded by
 * ButtonSelector.a11y.test.tsx to another simple shared/presentational component.
 */
describe("TextInput accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <TextInput
          id="search"
          name="search"
          value="hello"
          onChange={() => {}}
          aria-label="Search"
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
