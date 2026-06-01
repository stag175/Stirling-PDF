import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useSignupFormValidation } from "@app/routes/signup/SignupFormValidation";

// Mock i18n so messages are deterministic. When a fallback string is provided
// the validator emits it verbatim; when only a key is provided (no fallback),
// the key itself is returned.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const getValidator = () => {
  const { result } = renderHook(() => useSignupFormValidation());
  return result.current.validateSignupForm;
};

describe("useSignupFormValidation", () => {
  describe("happy path", () => {
    it("returns valid with no fieldErrors when all inputs are correct (name omitted)", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "secret1");

      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.fieldErrors).toBeUndefined();
    });

    it("returns valid when an explicit non-empty name is supplied", () => {
      const validate = getValidator();

      const result = validate(
        "user@example.com",
        "secret1",
        "secret1",
        "Ada Lovelace",
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.fieldErrors).toBeUndefined();
    });
  });

  describe("name validation branch", () => {
    it("does not validate name when it is undefined", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "secret1");

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });

    it("does not validate name when it is explicitly null", () => {
      const validate = getValidator();

      const result = validate(
        "user@example.com",
        "secret1",
        "secret1",
        null as unknown as string,
      );

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });

    it("flags an empty-string name as required", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "secret1", "");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.name).toBe("Name is required");
    });

    it("flags a whitespace-only name as required", () => {
      const validate = getValidator();

      const result = validate(
        "user@example.com",
        "secret1",
        "secret1",
        "   \t  ",
      );

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.name).toBe("Name is required");
    });

    it("accepts a name padded with whitespace as long as it has content", () => {
      const validate = getValidator();

      const result = validate(
        "user@example.com",
        "secret1",
        "secret1",
        "  Grace  ",
      );

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });
  });

  describe("email validation branch", () => {
    it("flags an empty email as required", () => {
      const validate = getValidator();

      const result = validate("", "secret1", "secret1");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.email).toBe("Email is required");
    });

    it("flags a malformed email with the invalidEmail key", () => {
      const validate = getValidator();

      const result = validate("not-an-email", "secret1", "secret1");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.email).toBe("signup.invalidEmail");
    });

    it("rejects an email with whitespace inside it", () => {
      const validate = getValidator();

      const result = validate("user @example.com", "secret1", "secret1");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.email).toBe("signup.invalidEmail");
    });

    it("rejects an email missing a domain dot", () => {
      const validate = getValidator();

      const result = validate("user@example", "secret1", "secret1");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.email).toBe("signup.invalidEmail");
    });

    it("accepts a well-formed email", () => {
      const validate = getValidator();

      const result = validate("a.b+tag@sub.example.co", "secret1", "secret1");

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });
  });

  describe("password validation branch", () => {
    it("flags an empty password as required", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "", "");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.password).toBe("Password is required");
    });

    it("flags a password shorter than 6 characters as too short", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "12345", "12345");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.password).toBe("signup.passwordTooShort");
    });

    it("accepts a password of exactly 6 characters (boundary)", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "123456", "123456");

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });
  });

  describe("confirm-password validation branch", () => {
    it("flags an empty confirm password as required", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.confirmPassword).toBe(
        "Please confirm your password",
      );
    });

    it("flags mismatched passwords", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "secret2");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors?.confirmPassword).toBe(
        "signup.passwordsDoNotMatch",
      );
    });

    it("accepts matching passwords", () => {
      const validate = getValidator();

      const result = validate("user@example.com", "secret1", "secret1");

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors).toBeUndefined();
    });
  });

  describe("combined / multi-field error paths", () => {
    it("collects every field error at once", () => {
      const validate = getValidator();

      const result = validate("", "", "", "");

      expect(result.isValid).toBe(false);
      expect(result.error).toBeNull();
      expect(result.fieldErrors).toEqual({
        name: "Name is required",
        email: "Email is required",
        password: "Password is required",
        confirmPassword: "Please confirm your password",
      });
    });

    it("reports invalid-email plus too-short plus mismatch together", () => {
      const validate = getValidator();

      const result = validate("bad-email", "abc", "xyz", "Ada");

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors).toEqual({
        email: "signup.invalidEmail",
        password: "signup.passwordTooShort",
        confirmPassword: "signup.passwordsDoNotMatch",
      });
      // Valid name should not appear in the error map.
      expect(result.fieldErrors?.name).toBeUndefined();
    });
  });
});
