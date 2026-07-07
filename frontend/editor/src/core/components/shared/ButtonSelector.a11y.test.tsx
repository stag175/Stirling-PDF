import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import ButtonSelector from "@app/components/shared/ButtonSelector";

/**
 * Accessibility regression test (roadmap A4). The codebase has hundreds of aria/role usages but,
 * before this, zero automated a11y assertions. This pins a representative shared component against
 * axe-core's WCAG ruleset using the existing jsdom render infra; extend the same pattern to other
 * components. (axe's layout-dependent rules — e.g. color-contrast — are reported as "incomplete"
 * under jsdom rather than failing, so this gate is stable.)
 */
describe("ButtonSelector accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <ButtonSelector
          value="a"
          onChange={() => {}}
          options={[
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
          ]}
          label="Choose an option"
        />
      </MantineProvider>,
    );

    const results = await axe(container);
    // Map to rule ids so a failure names the violated rule(s) instead of dumping the whole node.
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
