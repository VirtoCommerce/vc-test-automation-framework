import * as allure from "allure-js-commons";

import {
  GetMeDocument,
  GetOrganizationContactsDocument,
  GetUserDocument,
  InviteUserDocument,
  RegisterByInvitationDocument,
  ResetPasswordByTokenDocument,
  SendPasswordResetEmailDocument,
} from "@api/graphql/generated/graphql";
import { Mailbox } from "@api/mailbox";
import { INDEX_LAG_TIMEOUT_MS } from "@core/poll";
import { uniqueId } from "@core/unique-id";
import { newPassword } from "@dataset/builders/security";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const RESET_PASSWORD_NOTIFICATION = "ResetPasswordEmailNotification";
const INVITED_STATUS = "Invited";
const EMPLOYEE_ROLE = "role-org-employee";
const MAINTAINER_ROLE = "role-org-maintainer";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Security / Users");
});

test.describe("current user (anonymous)", () => {
  test("get the anonymous user", async ({ api }) => {
    await allure.story("Current user");
    await allure.description("An anonymous visitor asking who they are gets the platform's anonymous user.");

    const { me } = await test.step("act: get the current user", () => api.graphql.execute(GetMeDocument));

    await test.step("assert: the current user is anonymous", () => {
      expect(me).toMatchObject({ id: expect.any(String), userName: "Anonymous" });
    });
  });
});

test.describe("current user (signed-in customer)", () => {
  const userName = "acme_store_employee_1@acme.com";
  test.use({ user: userName });

  test("get the signed-in user", async ({ api, dataset }) => {
    await allure.story("Current user");
    await allure.description("A signed-in customer asking who they are gets their own account.");
    const account = dataset.users.get("user-acme-store-employee-1");

    const { me } = await test.step("act: get the current user", () => api.graphql.execute(GetMeDocument));

    await test.step("assert: the current user is the signed-in customer", () => {
      expect(me).toMatchObject({ id: account.id, userName });
    });
  });

  test("get the own account by user name", async ({ api, dataset }) => {
    await allure.story("User account");
    await allure.description("A signed-in customer can read their own account by user name.");
    const account = dataset.users.get("user-acme-store-employee-1");

    const { user } = await test.step(`act: get the account ${userName}`, () =>
      api.graphql.execute(GetUserDocument, { userName }));

    await test.step("assert: the own account is returned", () => {
      expect(user).toMatchObject({ id: account.id, userName });
    });
  });
});

test.describe("another organization's user (signed-in customer)", () => {
  test.use({ user: "other_store_employee_1@other-store.com" });

  test("another user's account is forbidden", async ({ api }) => {
    await allure.story("User account");
    await allure.description(
      "A customer cannot read the account of a user from an organization they do not belong to.",
    );
    const otherUserName = "acme_store_employee_2@acme.com";

    const result = await test.step(`act: get the account ${otherUserName}`, () =>
      api.graphql.executeRaw(GetUserDocument, { userName: otherUserName }));

    await test.step("assert: access is denied and no account is returned", () => {
      expect(result.data?.user).toBeNull();
      expect(result.errors).toEqual([
        expect.objectContaining({ extensions: expect.objectContaining({ code: "Forbidden" }) }),
      ]);
    });
  });
});

test.describe("password reset (anonymous visitor)", () => {
  test("reset a password with the token from the reset e-mail", async ({ api, arrange, dataset, env }) => {
    await allure.story("Password reset");
    await allure.description(
      "A visitor who forgot their password requests a reset e-mail, sets a new password with its token " +
        "and signs in with the new password. The token is read from the platform's notification journal.",
    );
    const account = dataset.users.get("user-acme-store-password-reset");
    const userName = String(account.userName);
    const { cultureName } = await api.storeContext();
    const resetEmail = { type: RESET_PASSWORD_NOTIFICATION, recipient: userName };
    const previous = await test.step("arrange: note the latest reset e-mail of the user", () =>
      arrange.mailbox.latest(resetEmail));

    const { sendPasswordResetEmail } = await test.step(`act: request a reset e-mail for ${userName}`, () =>
      api.graphql.execute(SendPasswordResetEmailDocument, {
        command: { storeId: env.storeId, cultureName, loginOrEmail: userName, urlSuffix: "/reset-password" },
      }));
    await test.step("assert: the request is accepted", () => {
      expect(sendPasswordResetEmail).toBe(true);
    });

    const token = await test.step("assert: a new reset e-mail with a token reaches the journal", async () =>
      Mailbox.linkParameter(await arrange.mailbox.waitForNewer(resetEmail, previous), "token"));

    const password = newPassword();
    const { resetPasswordByToken } = await test.step("act: set a new password with the e-mailed token", () =>
      api.graphql.execute(ResetPasswordByTokenDocument, {
        command: { userId: String(account.id), token: token.reveal(), newPassword: password.reveal() },
      }));

    await test.step("assert: the reset succeeded and the new password signs in", async () => {
      expect(resetPasswordByToken).toMatchObject({ succeeded: true, errors: [] });
      const signedIn = await api.as({ username: userName, password });
      expect((await signedIn.graphql.execute(GetMeDocument)).me?.userName).toBe(userName);
    });
  });
});

test.describe("user invitation (organization maintainer and store administrator)", () => {
  test("invite a user to an organization", async ({ arrange, env }) => {
    await allure.story("Invitation");
    await allure.description(
      "The store administrator invites a new e-mail address as an employee of a customer's organization; " +
        "the organization's maintainer sees the invited contact.",
    );
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customerAccount({ role: MAINTAINER_ROLE }));
    const email = `${uniqueId("test-invite")}@example.com`;
    arrange.customers.deleteAccountLater(email);

    const { inviteUser } = await test.step(`act: invite ${email} as an employee`, () =>
      arrange.admin.graphql.execute(InviteUserDocument, {
        command: {
          storeId: env.storeId,
          emails: [email],
          organizationId: maintainer.organizationId,
          roleIds: [EMPLOYEE_ROLE],
        },
      }));

    await test.step("assert: the invitation is accepted and the maintainer sees the invited contact", async () => {
      expect(inviteUser?.succeeded).toBe(true);
      await expect
        .poll(
          async () => {
            const { organization } = await maintainer.api.graphql.execute(GetOrganizationContactsDocument, {
              organizationId: maintainer.organizationId,
            });
            return organization?.contacts?.items?.map((contact) => ({
              status: contact?.status,
              userNames: contact?.securityAccounts?.map((account) => account?.userName),
            }));
          },
          { timeout: INDEX_LAG_TIMEOUT_MS },
        )
        .toContainEqual({ status: INVITED_STATUS, userNames: [email] });
    });
  });
});

test.describe("registration by invitation (organization maintainer and store administrator)", () => {
  test.use({ requiresModules: [MODULES.organizationInvites] });

  test("register by invitation", async ({ api, arrange, env }) => {
    await allure.story("Invitation");
    await allure.description(
      "An invited person accepts the invitation with its token, sets a password and signs in with it.",
    );
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customerAccount({ role: MAINTAINER_ROLE }));
    const email = `${uniqueId("test-invite")}@example.com`;
    arrange.customers.deleteAccountLater(email);
    const invited = await test.step(`arrange: invite ${email} and take the invitation token`, async () => {
      const { inviteUser } = await arrange.admin.graphql.execute(InviteUserDocument, {
        command: {
          storeId: env.storeId,
          emails: [email],
          organizationId: maintainer.organizationId,
          roleIds: [EMPLOYEE_ROLE],
        },
      });
      expect(inviteUser?.succeeded).toBe(true);
      const user = await arrange.admin.rest.users.get(email);
      return { userId: user.id, token: await arrange.admin.rest.users.generatePasswordResetToken(user.id) };
    });
    const password = newPassword();

    const { registerByInvitation } = await test.step("act: accept the invitation", () =>
      api.graphql.execute(RegisterByInvitationDocument, {
        command: {
          userId: invited.userId,
          username: email,
          password: password.reveal(),
          token: invited.token.reveal(),
          firstName: "Invited",
          lastName: "Employee",
          organizationId: maintainer.organizationId,
        },
      }));

    await test.step("assert: the registration succeeded and the invited user signs in", async () => {
      expect(registerByInvitation).toMatchObject({ succeeded: true, errors: [] });
      const signedIn = await arrange.security.signIn({ username: email, password });
      expect((await signedIn.graphql.execute(GetMeDocument)).me?.userName).toBe(email);
    });
  });
});
