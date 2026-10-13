import * as allure from "allure-js-commons";

import { Secret } from "@core/secret";
import { newPassword } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / Passwords");
});

test.describe("user passwords (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("reset a password as an administrator", async ({ api, arrange }) => {
    await allure.story("Reset");
    await allure.description("A password an administrator sets signs the user in.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const password = newPassword();

    const result = await test.step("act: set a new password", () =>
      api.rest.users.resetPassword(user.userName, password));

    await test.step("assert: the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.auth.signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
    });
  });

  test("reset a forgotten password with a reset token", async ({ api, arrange }) => {
    await allure.story("Reset");
    await allure.description("A password reset with a reset token replaces the old password.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const token = await test.step("arrange: a password reset token", () =>
      api.rest.users.generatePasswordResetToken(user.id));
    const password = newPassword();

    const result = await test.step("act: reset the password with the token", () =>
      api.rest.users.confirmPasswordReset(user.id, token, password));

    await test.step("assert: only the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.auth.signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
      await expect(api.auth.signIn(credentials)).rejects.toBeHttpError(400);
    });
  });

  test("change a password", async ({ api, arrange }) => {
    await allure.story("Change");
    await allure.description("A password changed with the current one replaces it.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const password = newPassword();

    const result = await test.step("act: change the password", () =>
      api.rest.users.changePassword(user.userName, credentials.password, password));

    await test.step("assert: only the new password signs the user in", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.auth.signIn({ username: user.userName, password })).tokenType).toBe("Bearer");
      await expect(api.auth.signIn(credentials)).rejects.toBeHttpError(400);
    });
  });

  test("reject a password change with a wrong current password", async ({ api, arrange }) => {
    await allure.story("Change");
    await allure.description("A password change with a wrong current password is refused; the old password works.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const result = await test.step("act: change the password, giving a wrong current one", () =>
      api.rest.users.changePassword(user.userName, newPassword(), newPassword()));

    await test.step("assert: the change is refused and the old password still signs in", async () => {
      expect(result).toMatchObject({ succeeded: false, errors: ["Incorrect password."] });
      expect((await api.auth.signIn(credentials)).tokenType).toBe("Bearer");
    });
  });

  test("reject a weak password", async ({ api }) => {
    await allure.story("Policy");
    await allure.description("A three-digit password breaks the password policy for being too short.");

    const result = await test.step("act: validate a three-digit password", () =>
      api.rest.users.validatePassword(new Secret("123")));

    await test.step("assert: the password is too short", () => {
      expect(result).toMatchObject({
        succeeded: false,
        errors: expect.arrayContaining([expect.objectContaining({ code: "PasswordTooShort" })]),
      });
    });
  });

  test("accept a strong password", async ({ api }) => {
    await allure.story("Policy");
    await allure.description("A strong random password meets the password policy.");

    const result = await test.step("act: validate a strong password", () =>
      api.rest.users.validatePassword(newPassword()));

    await test.step("assert: the password is valid", () => {
      expect(result).toMatchObject({ succeeded: true, errors: [] });
    });
  });
});
