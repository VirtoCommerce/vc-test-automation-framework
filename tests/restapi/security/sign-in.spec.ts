import * as allure from "allure-js-commons";

import { authHeader } from "@api/auth/token-client";
import { requireFields } from "@core/required-fields";
import { newPassword } from "@dataset/builders/security";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const ADMINISTRATOR = "acme_store_administrator@acme.com";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / Sign-in");
});

test.describe("sign-in (store administrator)", () => {
  test.use({ user: ADMINISTRATOR });

  test("get a token with valid credentials", async ({ api, arrange }) => {
    await allure.story("Token");
    await allure.description("A user's credentials get a bearer token that signs the user in.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const token = await test.step("act: request a token", () => api.auth.signIn(credentials));

    await test.step("assert: the bearer token signs the user in", async () => {
      expect(token.tokenType).toBe("Bearer");
      const current = await api.anonymous().withHeaders(authHeader(token)).rest.users.getCurrent();
      expect(current.userName).toBe(user.userName);
    });
  });

  test("reject a token request without a user name", async ({ api }) => {
    await allure.story("Token");
    await allure.description("A token request without a user name is an invalid request.");

    const response = await test.step("act: request a token with an empty user name", () =>
      api.auth.requestPasswordGrant({ username: "", password: newPassword() }));

    await test.step("assert: the request is rejected as invalid_request", () => {
      expect(response.status).toBe(400);
      expect(response.errorJson()).toMatchObject({ error: "invalid_request" });
    });
  });

  test("reject a token request with a wrong password", async ({ api, arrange }) => {
    await allure.story("Token");
    await allure.description("A token request with a wrong password is an invalid grant.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const response = await test.step("act: request a token with a wrong password", () =>
      api.auth.requestPasswordGrant({ username: user.userName, password: newPassword() }));

    await test.step("assert: the request is rejected as invalid_grant", () => {
      expect(response.status).toBe(400);
      expect(response.errorJson()).toMatchObject({ error: "invalid_grant" });
    });
  });

  test("get the signed-in user", async ({ api }) => {
    await allure.story("Current user");
    await allure.description("The signed-in store administrator is reported as a platform administrator.");

    const current = await test.step("act: get the current user", () => api.rest.users.getCurrent());

    await test.step("assert: the current user is the administrator", () => {
      expect(current).toMatchObject({ userName: ADMINISTRATOR, isAdministrator: true });
    });
  });

  test("block the sign-in of a locked user until it is unlocked", async ({ api, arrange }) => {
    await allure.story("Lock");
    await allure.description("A locked user cannot sign in; once unlocked, the user signs in again.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const locked = await test.step("act: lock the user", () => api.rest.users.lock(user.id));
    await test.step("assert: the user's sign-in is rejected", async () => {
      expect(locked).toMatchObject({ succeeded: true });
      await expect(api.auth.signIn(credentials)).rejects.toBeHttpError(400);
    });

    const unlocked = await test.step("act: unlock the user", () => api.rest.users.unlock(user.id));
    await test.step("assert: the user signs in again", async () => {
      expect(unlocked).toMatchObject({ succeeded: true });
      expect((await api.auth.signIn(credentials)).tokenType).toBe("Bearer");
    });
  });

  test("a deleted user is gone and cannot sign in", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted user is neither read nor found, and its sign-in is rejected.");
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    await test.step("act: delete the user", () => api.rest.users.delete([user.userName]));

    await test.step("assert: the user is not found", async () => {
      expect(await api.rest.users.find(user.userName)).toBeUndefined();
      expect((await api.rest.users.search({ searchPhrase: user.userName })).map(({ id }) => id)).not.toContain(user.id);
    });
    await test.step("assert: the user's sign-in is rejected", async () => {
      await expect(api.auth.signIn(credentials)).rejects.toBeHttpError(400);
    });
  });

  test("sign a user out", async ({ api, arrange }) => {
    await allure.story("Sign-out");
    await allure.description("Once a user's token is revoked, its refresh token no longer renews it.");
    const { credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const token = await test.step("arrange: the user signs in", () => api.auth.signIn(credentials));
    const { refreshToken } = requireFields(token, ["refreshToken"], `Token of ${credentials.username}`);

    await test.step("act: revoke the token", () => api.auth.revoke(token));

    await test.step("assert: the refresh token is rejected", async () => {
      expect(await api.auth.refresh(refreshToken)).toBeUndefined();
    });
  });
});

test.describe("sign-in with locked organizations (store administrator)", () => {
  test.use({ user: ADMINISTRATOR, requiresModules: [MODULES.xProfile] });

  test("VCST-5317: sign in with a stale organization once every organization is locked", async ({ api, arrange }) => {
    await allure.story("Organization fallback");
    await allure.link("https://virtocommerce.atlassian.net/browse/VCST-5317", "VCST-5317");
    await allure.description(
      "A customer locked in every organization still signs in when the sign-in names a locked organization.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const second = await test.step("arrange: the customer's membership in a second organization", async () =>
      arrange.customers.membership(customer, await arrange.customers.organization()));
    await test.step("arrange: the customer is locked in both organizations", () =>
      arrange.customers.lockMemberships(customer, [customer.membership, second]));

    const response = await test.step("act: sign in naming the first, locked, organization", () =>
      api.auth.requestPasswordGrant(customer.credentials, { organization_id: customer.organizationId }));

    await test.step("assert: the sign-in succeeds with a token", () => {
      expect(response.status).toBe(200);
      expect(Object.keys(response.json<object>())).toContain("access_token");
    });
  });
});
