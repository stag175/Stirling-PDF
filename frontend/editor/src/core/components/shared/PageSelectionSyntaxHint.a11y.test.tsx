import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { axe } from "jest-axe";
import PageSelectionSyntaxHint from "@app/components/shared/PageSelectionSyntaxHint";

/**
 * Accessibility regression test (roadmap A4). Extends the jest-axe coverage seeded by
 * ButtonSelector.a11y.test.tsx to another simple shared/presentational component.
 * Uses a deliberately malformed selection so the error Text branch actually renders.
 */
describe("PageSelectionSyntaxHint accessibility (A4)", () => {
  test("renders with no axe violations", async () => {
    const { container } = render(
      <MantineProvider>
        <PageSelectionSyntaxHint input="1-" maxPages={10} />
      </MantineProvider>,
    );

    const results = await axe(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
