import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  accountService,
  type AccountData,
  type LoginPageData,
} from "@app/services/accountService";
import type { MfaSetupResponse } from "@app/responses/Mfa/MfaResponse";
import apiClient from "@app/services/apiClient";

/**
 * Unit tests for the core accountService API object.
 *
 * Its sole external dependency is the shared axios instance exported by
 * `@app/services/apiClient`. We mock that module so no real HTTP (or axios
 * interceptor / config) machinery runs, giving fully deterministic behaviour.
 *
 * Every method is a thin wrapper that either:
 *   - GETs a fixed URL (some with a method-specific config such as
 *     `suppressErrorToast`) and returns `response.data`, or
 *   - builds a `FormData` / JSON body and POSTs it (with method-specific
 *     option flags like `responseType`, `skipAuthRedirect`,
 *     `suppressErrorToast`) and resolves void.
 *
 * We assert BOTH the outbound call shape (URL + body + config) and the
 * returned value, decoding FormData payloads to confirm field names/values,
 * and exercise rejection paths so the `await` lines run on the error branch.
 */

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// apiClient.get/post are overloaded axios methods, so vi.mocked() doesn't surface
// the Mock helpers cleanly; re-type to the vi.fn mocks the factory actually installs.
const mockedClient = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

/** Convenience: make apiClient.get resolve with the given payload as data. */
function resolveGet<T>(data: T): void {
  mockedClient.get.mockResolvedValue({ data } as never);
}

/** Decode a FormData instance into a plain string->string record for assertions. */
function formDataToObject(body: unknown): Record<string, string> {
  expect(body).toBeInstanceOf(FormData);
  const out: Record<string, string> = {};
  for (const [key, value] of (body as FormData).entries()) {
    out[key] = String(value);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accountService.getLoginPageData", () => {
  test("GETs the public login ui-data endpoint and returns response.data", async () => {
    const data: LoginPageData = {
      showDefaultCredentials: true,
      firstTimeSetup: false,
      enableLogin: true,
      ssoAutoLogin: true,
    };
    resolveGet(data);

    const result = await accountService.getLoginPageData();

    expect(result).toBe(data);
    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/login",
    );
  });

  test("returns a payload without the optional ssoAutoLogin flag unchanged", async () => {
    const data: LoginPageData = {
      showDefaultCredentials: false,
      firstTimeSetup: true,
      enableLogin: false,
    };
    resolveGet(data);

    const result = await accountService.getLoginPageData();

    expect(result).toEqual(data);
    expect(result.ssoAutoLogin).toBeUndefined();
  });

  test("propagates a rejection from apiClient.get", async () => {
    mockedClient.get.mockRejectedValue(new Error("login data unavailable"));

    await expect(accountService.getLoginPageData()).rejects.toThrow(
      "login data unavailable",
    );
  });
});

describe("accountService.getAccountData", () => {
  test("GETs the account endpoint with suppressErrorToast and returns data", async () => {
    const data: AccountData = {
      username: "alice",
      role: "ADMIN",
      settings: '{"theme":"dark"}',
      changeCredsFlag: false,
      oAuth2Login: false,
      saml2Login: false,
      mfaEnabled: true,
    };
    resolveGet(data);

    const result = await accountService.getAccountData();

    expect(result).toBe(data);
    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/v1/proprietary/ui-data/account",
      { suppressErrorToast: true },
    );
  });

  test("propagates a rejection from apiClient.get", async () => {
    mockedClient.get.mockRejectedValue(new Error("not authenticated"));

    await expect(accountService.getAccountData()).rejects.toThrow(
      "not authenticated",
    );
  });
});

describe("accountService.changePassword", () => {
  test("POSTs FormData with current/new password fields to change-password", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.changePassword("old-pw", "new-pw");

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = mockedClient.post.mock.calls[0];
    expect(url).toBe("/api/v1/user/change-password");
    expect(formDataToObject(body)).toEqual({
      currentPassword: "old-pw",
      newPassword: "new-pw",
    });
    // No third config argument for this endpoint.
    expect(config).toBeUndefined();
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("wrong password"));

    await expect(
      accountService.changePassword("old-pw", "new-pw"),
    ).rejects.toThrow("wrong password");
  });
});

describe("accountService.changePasswordOnLogin", () => {
  test("POSTs FormData incl. confirmPassword with responseType json config", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.changePasswordOnLogin(
      "temp-pw",
      "fresh-pw",
      "fresh-pw",
    );

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = mockedClient.post.mock.calls[0];
    expect(url).toBe("/api/v1/user/change-password-on-login");
    expect(formDataToObject(body)).toEqual({
      currentPassword: "temp-pw",
      newPassword: "fresh-pw",
      confirmPassword: "fresh-pw",
    });
    expect(config).toEqual({ responseType: "json" });
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("passwords do not match"));

    await expect(
      accountService.changePasswordOnLogin("temp-pw", "fresh-pw", "other-pw"),
    ).rejects.toThrow("passwords do not match");
  });
});

describe("accountService.changeUsername", () => {
  test("POSTs FormData with the prefixed current-password and new username fields", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.changeUsername("bob", "my-pw");

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = mockedClient.post.mock.calls[0];
    expect(url).toBe("/api/v1/user/change-username");
    expect(formDataToObject(body)).toEqual({
      currentPasswordChangeUsername: "my-pw",
      newUsername: "bob",
    });
    expect(config).toBeUndefined();
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("username taken"));

    await expect(accountService.changeUsername("bob", "my-pw")).rejects.toThrow(
      "username taken",
    );
  });
});

describe("accountService.requestMfaSetup", () => {
  test("GETs the mfa setup endpoint with suppressErrorToast and returns data", async () => {
    const data: MfaSetupResponse = {
      otpauthUri: "otpauth://totp/Stirling:alice?secret=ABC",
      secret: "ABC",
      error: null,
    };
    resolveGet(data);

    const result = await accountService.requestMfaSetup();

    expect(result).toBe(data);
    expect(mockedClient.get).toHaveBeenCalledTimes(1);
    expect(mockedClient.get).toHaveBeenCalledWith("/api/v1/auth/mfa/setup", {
      suppressErrorToast: true,
    });
  });

  test("returns an error-shaped MfaSetupResponse without throwing", async () => {
    const data: MfaSetupResponse = {
      otpauthUri: null,
      secret: null,
      error: { error: "already enabled" },
    };
    resolveGet(data);

    const result = await accountService.requestMfaSetup();

    expect(result.error).toEqual({ error: "already enabled" });
  });

  test("propagates a rejection from apiClient.get", async () => {
    mockedClient.get.mockRejectedValue(new Error("setup failed"));

    await expect(accountService.requestMfaSetup()).rejects.toThrow(
      "setup failed",
    );
  });
});

describe("accountService.enableMfa", () => {
  test("POSTs the code as a JSON body with skipAuthRedirect", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.enableMfa("123456");

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
    expect(mockedClient.post).toHaveBeenCalledWith(
      "/api/v1/auth/mfa/enable",
      { code: "123456" },
      { skipAuthRedirect: true },
    );
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("invalid code"));

    await expect(accountService.enableMfa("000000")).rejects.toThrow(
      "invalid code",
    );
  });
});

describe("accountService.disableMfa", () => {
  test("POSTs the code as a JSON body with skipAuthRedirect", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.disableMfa("654321");

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
    expect(mockedClient.post).toHaveBeenCalledWith(
      "/api/v1/auth/mfa/disable",
      { code: "654321" },
      { skipAuthRedirect: true },
    );
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("invalid code"));

    await expect(accountService.disableMfa("999999")).rejects.toThrow(
      "invalid code",
    );
  });
});

describe("accountService.cancelMfaSetup", () => {
  test("POSTs an undefined body to the cancel endpoint with suppressErrorToast", async () => {
    mockedClient.post.mockResolvedValue({ data: undefined } as never);

    const result = await accountService.cancelMfaSetup();

    expect(result).toBeUndefined();
    expect(mockedClient.post).toHaveBeenCalledTimes(1);
    expect(mockedClient.post).toHaveBeenCalledWith(
      "/api/v1/auth/mfa/setup/cancel",
      undefined,
      { suppressErrorToast: true },
    );
  });

  test("propagates a rejection from the POST", async () => {
    mockedClient.post.mockRejectedValue(new Error("nothing to cancel"));

    await expect(accountService.cancelMfaSetup()).rejects.toThrow(
      "nothing to cancel",
    );
  });
});
