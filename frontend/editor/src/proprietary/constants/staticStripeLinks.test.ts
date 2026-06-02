import { describe, expect, it } from "vitest";

import { buildStripeUrlWithEmail } from "@app/constants/staticStripeLinks";

describe("buildStripeUrlWithEmail", () => {
  it("appends the email as a locked_prefilled_email query param", () => {
    expect(
      buildStripeUrlWithEmail("https://buy.stripe.com/abc", "user@example.com"),
    ).toBe(
      "https://buy.stripe.com/abc?locked_prefilled_email=user%40example.com",
    );
  });

  it("URL-encodes reserved characters in the email (+ and @)", () => {
    expect(
      buildStripeUrlWithEmail("https://pay", "a+tag@host.io"),
    ).toBe("https://pay?locked_prefilled_email=a%2Btag%40host.io");
  });

  it("encodes spaces and ampersands so they cannot break out of the param", () => {
    expect(buildStripeUrlWithEmail("https://pay", "a b&c=d")).toBe(
      "https://pay?locked_prefilled_email=a%20b%26c%3Dd",
    );
  });

  it("leaves the base URL untouched and produces an empty value for an empty email", () => {
    expect(buildStripeUrlWithEmail("https://pay/checkout", "")).toBe(
      "https://pay/checkout?locked_prefilled_email=",
    );
  });
});
