import type {
  VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser,
  VirtoCommercePlatformCoreSecuritySecurityResult as SecurityResult,
  VirtoCommercePlatformWebModelSecurityUserDetail as UserDetail,
  VirtoCommercePlatformCoreSecuritySearchUserSearchResult as UserSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPassword } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { requireFields } from "@support/require-fields.ts";
import { authHeader, TokenClient } from "@virtocommerce/test-automation-framework/auth";

const SECURITY_PATH = "/api/platform/security";
const USERS_PATH = `${SECURITY_PATH}/users`;
const CONCURRENT_SIGN_INS = 8;

test.describe("sign-in (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("get a token with valid credentials", async ({ http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const token = await test.step("act: request a token", () => new TokenClient(http).signIn(credentials));

    await test.step("assert: the bearer token signs the user in", async () => {
      expect(token.tokenType).toBe("Bearer");
      const current = (await http.withHeaders(authHeader(token)).get(`${SECURITY_PATH}/currentuser`))
        .expectOk()
        .json<UserDetail>();
      expect(current.userName).toBe(user.userName);
    });
  });

  test("reject a token request without a user name", async ({ http }) => {
    const response = await test.step("act: request a token with an empty user name", () =>
      new TokenClient(http).requestPasswordGrant({ username: "", password: newPassword() }));

    await test.step("assert: the request is rejected as invalid_request", () => {
      expect(response.status).toBe(400);
      expect(response.errorJson()).toMatchObject({ error: "invalid_request" });
    });
  });

  test("reject a token request with a wrong password", async ({ http, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const response = await test.step("act: request a token with a wrong password", () =>
      new TokenClient(http).requestPasswordGrant({ username: user.userName, password: newPassword() }));

    await test.step("assert: the request is rejected as invalid_grant", () => {
      expect(response.status).toBe(400);
      expect(response.errorJson()).toMatchObject({ error: "invalid_grant" });
    });
  });

  test("concurrent sign-ins of the same user all get a token", async ({ http, arrange }) => {
    const { credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const tokens = new TokenClient(http);

    const responses = await test.step(`act: request ${CONCURRENT_SIGN_INS} tokens at the same time`, () =>
      Promise.all(Array.from({ length: CONCURRENT_SIGN_INS }, () => tokens.requestPasswordGrant(credentials))));

    await test.step("assert: every request gets a token", () => {
      expect(responses.map(({ status }) => status)).toEqual(Array(CONCURRENT_SIGN_INS).fill(200));
    });
  });

  test("get the signed-in user", async ({ api }) => {
    const current = await test.step("act: get the current user", async () =>
      (await api.get(`${SECURITY_PATH}/currentuser`)).expectOk().json<UserDetail>());

    await test.step("assert: the current user is the administrator", () => {
      expect(current).toMatchObject({ userName: STORE_ADMINISTRATOR.username, isAdministrator: true });
    });
  });

  test("block the sign-in of a locked user until it is unlocked", async ({ api, http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const tokens = new TokenClient(http);

    const locked = await test.step("act: lock the user", () => securityAction(api, `${USERS_PATH}/${user.id}/lock`));
    await test.step("assert: the user's sign-in is rejected", async () => {
      expect(locked).toMatchObject({ succeeded: true });
      await expect(tokens.signIn(credentials)).rejects.toMatchObject({ status: 400 });
    });

    const unlocked = await test.step("act: unlock the user", () =>
      securityAction(api, `${USERS_PATH}/${user.id}/unlock`));
    await test.step("assert: the user signs in again", async () => {
      expect(unlocked).toMatchObject({ succeeded: true });
      expect((await tokens.signIn(credentials)).tokenType).toBe("Bearer");
    });
  });

  test("a deleted user is gone and cannot sign in", async ({ api, http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    await test.step("act: delete the user", async () =>
      (await api.delete(USERS_PATH, { query: { names: [user.userName] } })).expectOk());

    await test.step("assert: the user is not found", async () => {
      const response = await api.get(`${USERS_PATH}/${encodeURIComponent(user.userName)}`);
      expect(response.optionalJson<ApplicationUser>()).toBeUndefined();
      const found = (await api.post(`${USERS_PATH}/search`, { json: { searchPhrase: user.userName } }))
        .expectOk()
        .json<UserSearchResult>();
      expect((found.users ?? []).map(({ id }) => id)).not.toContain(user.id);
    });
    await test.step("assert: the user's sign-in is rejected", async () => {
      await expect(new TokenClient(http).signIn(credentials)).rejects.toMatchObject({ status: 400 });
    });
  });

  test("sign a user out", async ({ http, arrange }) => {
    const { credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const tokens = new TokenClient(http);
    const token = await test.step("arrange: the user signs in", () => tokens.signIn(credentials));
    const { refreshToken } = requireFields(token, ["refreshToken"], `The token of ${credentials.username}`);

    await test.step("act: revoke the token", () => tokens.revoke(token));

    await test.step("assert: the refresh token is rejected", async () => {
      expect(await tokens.refresh(refreshToken)).toBeUndefined();
    });
  });
});

test.describe("sign-in with locked organizations (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR, modules: { xProfile: MODULES.xProfile } });

  test("VCST-5317: sign in with a stale organization once every organization is locked", async ({ http, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const second = await test.step("arrange: the customer's membership in a second organization", async () =>
      arrange.customers.membership(customer, await arrange.customers.organization()));
    await test.step("arrange: the customer is locked in both organizations", () =>
      arrange.customers.lockMemberships(customer, [customer.membershipId, second]));

    const response = await test.step("act: sign in naming the first, locked, organization", () =>
      new TokenClient(http).requestPasswordGrant(customer.credentials, { organization_id: customer.organizationId }));

    await test.step("assert: the sign-in succeeds with a token", () => {
      expect(response.status).toBe(200);
      expect(Object.keys(response.json<object>())).toContain("access_token");
    });
  });
});

async function securityAction(api: HttpClient, path: string): Promise<SecurityResult> {
  return (await api.post(path)).expectOk().json<SecurityResult>();
}
