import * as allure from "allure-js-commons";

import { TokenAuthClient } from "@api/auth/token-auth-client";
import { NotificationsClient } from "@api/rest/clients/notifications-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { arrangeUser } from "@dataset/arrange/security";
import { credentialsOf, newPassword, newUser } from "@dataset/builders/security";
import { describeIssue, KNOWN_ISSUES } from "@dataset/known-issues";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const CONFIRMATION_EMAIL_NOTIFICATION = "ConfirmationEmailNotification";
const NOTIFICATION_TIMEOUT_MS = 10_000;

test.beforeEach(async () => {
  await allure.feature("Platform / User Passwords");
});

test.describe("user passwords (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("reset a password as an administrator", async ({ httpClient, anonymousHttpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const tokenAuthClient = new TokenAuthClient(anonymousHttpClient);
    const draft = newUser(env.storeId);
    await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));
    const password = newPassword();

    const result = await test.step("act: reset password", () => usersClient.resetPassword(draft.userName, password));

    await test.step("assert: user signs in with the new password", async () => {
      expect(result.succeeded).toBe(true);
      await expect(
        tokenAuthClient.requestToken({ username: draft.userName, password }, env.storeId),
      ).resolves.toMatchObject({ accessToken: expect.any(String) });
    });
  });

  test("change a password", async ({ httpClient, anonymousHttpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const tokenAuthClient = new TokenAuthClient(anonymousHttpClient);
    const draft = newUser(env.storeId);
    await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));
    const password = newPassword();

    const result = await test.step("act: change password", () =>
      usersClient.changePassword(draft.userName, draft.password, password));

    await test.step("assert: only the new password signs in", async () => {
      expect(result.succeeded).toBe(true);
      await expect(
        tokenAuthClient.requestToken({ username: draft.userName, password }, env.storeId),
      ).resolves.toMatchObject({ accessToken: expect.any(String) });
      await expect(tokenAuthClient.requestToken(credentialsOf(draft), env.storeId)).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  test("reject a weak password", async ({ httpClient }) => {
    const usersClient = new UsersClient(httpClient);

    const result = await test.step("act: validate a weak password", () => usersClient.validatePassword("123"));

    await test.step("assert: password rules are reported", async () => {
      expect(result.succeeded).toBe(false);
      expect(result.errors?.map(({ code }) => code)).toContain("PasswordTooShort");
    });
  });

  test("accept a strong password", async ({ httpClient }) => {
    const usersClient = new UsersClient(httpClient);

    const result = await test.step("act: validate a strong password", () =>
      usersClient.validatePassword(newPassword()));

    await test.step("assert: password is valid", async () => {
      expect(result).toMatchObject({ succeeded: true, errors: [] });
    });
  });

  test("send a verification email", async ({ httpClient, platformAdminHttpClient, cleanupStack, env }) => {
    test.fail(true, describeIssue(KNOWN_ISSUES.verificationEmailNotSent));
    const usersClient = new UsersClient(httpClient);
    const draft = newUser(env.storeId, { emailConfirmed: false });
    const user = await test.step("arrange: user with an unconfirmed email", () =>
      arrangeUser(usersClient, cleanupStack, draft));

    await test.step("act: send verification email", () => usersClient.sendVerificationEmail(user.id));

    await test.step("assert: a confirmation email is sent to the user", async () => {
      const notificationsClient = new NotificationsClient(platformAdminHttpClient);
      await expect
        .poll(
          async () =>
            (
              await notificationsClient.searchJournal({
                notificationType: CONFIRMATION_EMAIL_NOTIFICATION,
                keyword: draft.email,
                take: 1,
              })
            ).map(({ to }) => to),
          { timeout: NOTIFICATION_TIMEOUT_MS },
        )
        .toEqual([draft.email]);
    });
  });

  test("reject a password change with a wrong current password", async ({
    httpClient,
    anonymousHttpClient,
    cleanupStack,
    env,
  }) => {
    const usersClient = new UsersClient(httpClient);
    const tokenAuthClient = new TokenAuthClient(anonymousHttpClient);
    const draft = newUser(env.storeId);
    await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));

    const result = await test.step("act: change password with a wrong current password", () =>
      usersClient.changePassword(draft.userName, newPassword(), newPassword()));

    await test.step("assert: change is rejected and the old password still works", async () => {
      expect(result).toMatchObject({ succeeded: false, errors: ["Incorrect password."] });
      await expect(tokenAuthClient.requestToken(credentialsOf(draft), env.storeId)).resolves.toMatchObject({
        accessToken: expect.any(String),
      });
    });
  });

  test("reset a forgotten password with a reset token", async ({
    httpClient,
    anonymousHttpClient,
    cleanupStack,
    env,
  }) => {
    const usersClient = new UsersClient(httpClient);
    const tokenAuthClient = new TokenAuthClient(anonymousHttpClient);
    const draft = newUser(env.storeId);
    const user = await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));
    const resetToken = await test.step("arrange: password reset token", () =>
      usersClient.generatePasswordResetToken(user.id));
    const password = newPassword();

    const result = await test.step("act: confirm password reset", () =>
      usersClient.confirmPasswordReset(user.id, resetToken, password));

    await test.step("assert: only the new password signs in", async () => {
      expect(result.succeeded).toBe(true);
      await expect(
        tokenAuthClient.requestToken({ username: draft.userName, password }, env.storeId),
      ).resolves.toMatchObject({ accessToken: expect.any(String) });
      await expect(tokenAuthClient.requestToken(credentialsOf(draft), env.storeId)).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
