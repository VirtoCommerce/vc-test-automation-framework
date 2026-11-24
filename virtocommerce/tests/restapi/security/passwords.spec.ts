import type {
  MicrosoftAspNetCoreIdentityIdentityResult as IdentityResult,
  VirtoCommercePlatformCoreSecuritySecurityResult as SecurityResult,
} from "@rest/generated/platform.ts";

import { newPassword } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { TokenClient } from "@virtocommerce/test-automation-framework/auth";
import { Secret } from "@virtocommerce/test-automation-framework/core";

const USERS_PATH = "/api/platform/security/users";

test.describe("user passwords (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("reset a password as an administrator", async ({ api, http, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const password = newPassword();

    const result = await test.step("act: set a new password", async () =>
      (
        await api.post(`${USERS_PATH}/${user.userName}/resetpassword`, {
          json: { newPassword: password.reveal(), forcePasswordChangeOnNextSignIn: false },
        })
      )
        .expectOk()
        .json<SecurityResult>());

    await test.step("assert: the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await new TokenClient(http).signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
    });
  });

  test("reset a forgotten password with a reset token", async ({ api, http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const token = await test.step("arrange: a password reset token", async () =>
      Secret.of((await api.get(`${USERS_PATH}/${user.id}/generatePasswordResetToken`)).expectOk().text));
    const password = newPassword();
    const tokens = new TokenClient(http);

    const result = await test.step("act: reset the password with the token", async () =>
      (
        await api.post(`${USERS_PATH}/${user.id}/resetpasswordconfirm`, {
          json: { token: token.reveal(), newPassword: password.reveal() },
        })
      )
        .expectOk()
        .json<SecurityResult>());

    await test.step("assert: only the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await tokens.signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
      await expect(tokens.signIn(credentials)).rejects.toMatchObject({ status: 400 });
    });
  });

  test("change a password", async ({ api, http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const password = newPassword();
    const tokens = new TokenClient(http);

    const result = await test.step("act: change the password", async () =>
      (
        await api.post(`${USERS_PATH}/${user.userName}/changepassword`, {
          json: { oldPassword: credentials.password.reveal(), newPassword: password.reveal() },
        })
      )
        .expectOk()
        .json<SecurityResult>());

    await test.step("assert: only the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await tokens.signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
      await expect(tokens.signIn(credentials)).rejects.toMatchObject({ status: 400 });
    });
  });

  test("reject a password change with a wrong current password", async ({ api, http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const result = await test.step("act: change the password, giving a wrong current one", async () =>
      (
        await api.post(`${USERS_PATH}/${user.userName}/changepassword`, {
          json: { oldPassword: newPassword().reveal(), newPassword: newPassword().reveal() },
        })
      ).json<SecurityResult>());

    await test.step("assert: the change is refused and the old password still signs in", async () => {
      expect(result).toMatchObject({ succeeded: false, errors: ["Incorrect password."] });
      expect((await new TokenClient(http).signIn(credentials)).tokenType).toBe("Bearer");
    });
  });

  test("reject a weak password", async ({ api }) => {
    const result = await test.step("act: validate a three-digit password", async () =>
      (await api.post("/api/platform/security/validatepassword", { json: "123" })).expectOk().json<IdentityResult>());

    await test.step("assert: the password is too short", () => {
      expect(result).toMatchObject({
        succeeded: false,
        errors: expect.arrayContaining([expect.objectContaining({ code: "PasswordTooShort" })]),
      });
    });
  });

  test("accept a strong password", async ({ api }) => {
    const result = await test.step("act: validate a strong password", async () =>
      (await api.post("/api/platform/security/validatepassword", { json: newPassword().reveal() }))
        .expectOk()
        .json<IdentityResult>());

    await test.step("assert: the password is valid", () => {
      expect(result).toMatchObject({ succeeded: true, errors: [] });
    });
  });
});
