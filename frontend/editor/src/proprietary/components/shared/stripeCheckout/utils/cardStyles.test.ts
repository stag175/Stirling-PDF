import { describe, expect, it } from "vitest";

import {
  CARD_MIN_HEIGHT,
  getBaseCardStyle,
  getCardBorderStyle,
  getClickablePaperStyle,
} from "@app/components/shared/stripeCheckout/utils/cardStyles";

describe("getCardBorderStyle", () => {
  it("highlighted -> green 2px border", () => {
    expect(getCardBorderStyle(true)).toEqual({
      borderColor: "var(--mantine-color-green-6)",
      borderWidth: "2px",
    });
  });

  it("not highlighted -> undefined border props (no border)", () => {
    expect(getCardBorderStyle(false)).toEqual({
      borderColor: undefined,
      borderWidth: undefined,
    });
  });
});

describe("getBaseCardStyle", () => {
  it("is a relative flex column with the shared min-height", () => {
    const style = getBaseCardStyle(true);
    expect(style.position).toBe("relative");
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(style.minHeight).toBe(CARD_MIN_HEIGHT);
    // highlighted border spread in
    expect(style.borderColor).toBe("var(--mantine-color-green-6)");
    expect(style.borderWidth).toBe("2px");
  });

  it("defaults to not highlighted", () => {
    expect(getBaseCardStyle()).toEqual(getBaseCardStyle(false));
    expect(getBaseCardStyle().borderColor).toBeUndefined();
    expect(getBaseCardStyle().borderWidth).toBeUndefined();
  });
});

describe("getClickablePaperStyle", () => {
  it("is a full-height clickable paper that spreads in the border", () => {
    const style = getClickablePaperStyle(true);
    expect(style.cursor).toBe("pointer");
    expect(style.transition).toBe("all 0.2s");
    expect(style.height).toBe("100%");
    expect(style.position).toBe("relative");
    expect(style.borderColor).toBe("var(--mantine-color-green-6)");
    expect(style.borderWidth).toBe("2px");
  });

  it("defaults to not highlighted", () => {
    expect(getClickablePaperStyle().borderColor).toBeUndefined();
  });
});
