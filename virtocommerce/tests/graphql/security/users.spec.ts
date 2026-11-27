import type { VirtoCommercePlatformCoreSecurityApplicationUser as User } from "@rest/generated/platform.ts";

import { linkParameter } from "@arrange";
import { newPassword } from "@builders/security.ts";
import { ORGANIZATION_EMPLOYEE, OTHER_STORE_EMPLOYEE, STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import {
  GetMeDocument,
  GetOrganizationContactsDocument,
  GetUserDocument,
  InviteUserDocument,
  RegisterByInvitationDocument,
  ResetPasswordByTokenDocument,
  SendPasswordResetEmailDocument,
} from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";
import { INDEX_LAG_TIMEOUT_MS } from "@support/poll.ts";
import { requireFields } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";
import { Secret } from "@virtocommerce/test-automation-framework/core";

const RESET_PASSWORD_NOTIFICATION = "ResetPasswordEmailNotification";
const INVITED_STATUS = "Invited";
const EMPLOYEE_ROLE = "role-org-employee";
const MAINTAINER_ROLE = "role-org-maintainer";
const USERS_PATH = "/api/platform/security/users";

test.describe("current user (anonymous)", () => {
  test("get the anonymous user", async ({ shopper }) => {
    const { me } = await test.step("act: get the current user", () => shopper.graphql.execute(GetMeDocument));

    await test.step("assert: the current user is anonymous", () => {
      expect(me).toMatchObject({ id: expect.any(String), userName: "Anonymous" });
    });
  });
});

test.describe("current user (signed-in customer)", () => {
  const userName = ORGANIZATION_EMPLOYEE.username;
  test.use({ shopperAs: ORGANIZATION_EMPLOYEE });

  test("get the signed-in user", async ({ shopper, dataset }) => {
    const account = dataset.users.get("user-acme-store-employee-1");

    const { me } = await test.step("act: get the current user", () => shopper.graphql.execute(GetMeDocument));

    await test.step("assert: the current user is the signed-in customer", () => {
      expect(me).toMatchObject({ id: account.id, userName });
    });
  });

  test("get the own account by user name", async ({ shopper, dataset }) => {
    const account = dataset.users.get("user-acme-store-employee-1");

    const { user } = await test.step(`act: get the account ${userName}`, () =>
      shopper.graphql.execute(GetUserDocument, { userName }));

    await test.step("assert: the own account is returned", () => {
      expect(user).toMatchObject({ id: account.id, userName });
    });
  });
});

test.describe("another organization's user (signed-in customer)", () => {
  test.use({ shopperAs: OTHER_STORE_EMPLOYEE });

  test("another user's account is forbidden", async ({ shopper }) => {
    const otherUserName = "acme_store_employee_2@acme.com";

    const result = await test.step(`act: get the account ${otherUserName}`, () =>
      shopper.graphql.executeRaw(GetUserDocument, { userName: otherUserName }));

    await test.step("assert: access is denied and no account is returned", () => {
      expect(result.data?.user).toBeNull();
      expect(result.errors).toEqual([
        expect.objectContaining({ extensions: expect.objectContaining({ code: "Forbidden" }) }),
      ]);
    });
  });
});

test.describe("password reset (anonymous visitor)", () => {
  test("reset a password with the token from the reset e-mail", async ({ shopper, arrange, dataset, store }) => {
    const account = dataset.users.get("user-acme-store-password-reset");
    const userName = String(account.userName);
    const { cultureName } = shopper.storeContext;
    const resetEmail = { type: RESET_PASSWORD_NOTIFICATION, recipient: userName };
    const previous = await test.step("arrange: note the latest reset e-mail of the user", () =>
      arrange.mailbox.latest(resetEmail));

    const { sendPasswordResetEmail } = await test.step(`act: request a reset e-mail for ${userName}`, () =>
      shopper.graphql.execute(SendPasswordResetEmailDocument, {
        command: { storeId: store.id, cultureName, loginOrEmail: userName, urlSuffix: "/reset-password" },
      }));
    await test.step("assert: the request is accepted", () => {
      expect(sendPasswordResetEmail).toBe(true);
    });

    const token = await test.step("assert: a new reset e-mail with a token reaches the journal", async () =>
      linkParameter(await arrange.mailbox.waitForNewer(resetEmail, previous), "token"));

    const password = newPassword();
    const { resetPasswordByToken } = await test.step("act: set a new password with the e-mailed token", () =>
      shopper.graphql.execute(ResetPasswordByTokenDocument, {
        command: { userId: String(account.id), token: token.reveal(), newPassword: password.reveal() },
      }));

    await test.step("assert: the reset succeeded and the new password signs in", async () => {
      expect(resetPasswordByToken).toMatchObject({ succeeded: true, errors: [] });
      const signedIn = await arrange.customers.signedIn({ username: userName, password, storeId: store.id });
      expect((await signedIn.graphql.execute(GetMeDocument)).me?.userName).toBe(userName);
    });
  });
});

test.describe("user invitation (organization maintainer and store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("invite a user to an organization", async ({ graphql, arrange, store }) => {
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customer({ role: MAINTAINER_ROLE }));
    const email = `${uniqueId("test-invite")}@example.com`;
    arrange.customers.deleteAccountLater(email);

    const { inviteUser } = await test.step(`act: invite ${email} as an employee`, () =>
      graphql.execute(InviteUserDocument, {
        command: {
          storeId: store.id,
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
            const { organization } = await maintainer.graphql.execute(GetOrganizationContactsDocument, {
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
  test.use({ user: STORE_ADMINISTRATOR, modules: { xProfile: MODULES.xProfile } });

  test("register by invitation", async ({ api, graphql, shopper, arrange, store }) => {
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customer({ role: MAINTAINER_ROLE }));
    const email = `${uniqueId("test-invite")}@example.com`;
    arrange.customers.deleteAccountLater(email);
    const invited = await test.step(`arrange: invite ${email} and take the invitation token`, async () => {
      const { inviteUser } = await graphql.execute(InviteUserDocument, {
        command: {
          storeId: store.id,
          emails: [email],
          organizationId: maintainer.organizationId,
          roleIds: [EMPLOYEE_ROLE],
        },
      });
      expect(inviteUser?.succeeded).toBe(true);
      const user = requireFields(
        (await api.get(`${USERS_PATH}/${encodeURIComponent(email)}`)).expectOk().json<User>(),
        ["id"],
        `The invited user ${email}`,
      );
      const token = (await api.get(`${USERS_PATH}/${user.id}/generatePasswordResetToken`)).expectOk().text;
      return { userId: user.id, token: Secret.of(token) };
    });
    const password = newPassword();

    const { registerByInvitation } = await test.step("act: accept the invitation", () =>
      shopper.graphql.execute(RegisterByInvitationDocument, {
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
      const signedIn = await arrange.customers.signedIn({ username: email, password, storeId: store.id });
      expect((await signedIn.graphql.execute(GetMeDocument)).me?.userName).toBe(email);
    });
  });
});
