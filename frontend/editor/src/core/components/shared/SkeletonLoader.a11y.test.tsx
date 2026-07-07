import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage seeded by
 * ButtonSelector.a11y.test.tsx to another simple shared/presentational component.
 */
describe("SkeletonLoader accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <SkeletonLoader type="block" width={200} height={20} />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
