import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The provider definitions build their labels via i18n; a passthrough t() (returning the fallback)
// lets us exercise the real definition data without an i18n provider.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

import {
  type ProviderType,
  useAllProviders,
} from "@app/components/shared/config/configSections/providerDefinitions";

const VALID_PROVIDER_TYPES: ProviderType[] = [
  "oauth2",
  "saml2",
  "telegram",
  "googledrive",
];
const VALID_FIELD_TYPES = [
  "text",
  "password",
  "switch",
  "textarea",
  "number",
  "tags",
];

describe("useAllProviders", () => {
  it("returns providers with unique ids, names, and valid types", () => {
    const { result } = renderHook(() => useAllProviders());
    const providers = result.current;

    expect(providers.length).toBeGreaterThan(0);

    const ids = providers.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // ids are unique

    for (const p of providers) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(VALID_PROVIDER_TYPES).toContain(p.type);
    }
  });

  it("includes the Google OAuth2 provider with credential fields", () => {
    const { result } = renderHook(() => useAllProviders());
    const google = result.current.find((p) => p.id === "google");

    expect(google).toBeDefined();
    expect(google?.type).toBe("oauth2");
    const fieldKeys = google?.fields.map((f) => f.key) ?? [];
    expect(fieldKeys).toContain("clientId");
    expect(fieldKeys).toContain("clientSecret");
  });

  it("every provider field has a non-empty key and a valid input type", () => {
    const { result } = renderHook(() => useAllProviders());
    for (const provider of result.current) {
      for (const field of provider.fields) {
        expect(field.key).toBeTruthy();
        expect(VALID_FIELD_TYPES).toContain(field.type);
      }
    }
  });
});
