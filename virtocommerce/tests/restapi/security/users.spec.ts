import type { UserDraft } from "@builders/security.ts";
import type {
  VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser,
  VirtoCommercePlatformCoreSecuritySecurityResult as SecurityResult,
  VirtoCommercePlatformCoreSecuritySearchUserSearchResult as UserSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPlatformUser } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { userNamed } from "@support/users.ts";

const USERS_PATH = "/api/platform/security/users";

test.describe("platform users (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a user", async ({ api, arrange, store }) => {
    const draft = newPlatformUser(store.id);
    arrange.security.deleteUserLater(draft.userName);

    const result = await test.step("act: create a user", () => createUser(api, draft));

    await test.step("assert: the user is created and found by its user name", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await searchUsers(api, draft.userName)).map(({ userName }) => userName)).toContain(draft.userName);
    });
  });

  test("reject a user name that is taken", async ({ api, arrange, store }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const duplicate = { ...newPlatformUser(store.id), userName: user.userName, email: user.email };

    const result = await test.step("act: create another user with the same user name", () =>
      createUser(api, duplicate));

    await test.step("assert: the user name is reported as taken", () => {
      expect(result).toMatchObject({
        succeeded: false,
        errors: expect.arrayContaining([expect.stringContaining(`Username '${user.userName}' is already taken`)]),
      });
    });
  });

  test("get a user by id", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const reloaded = await test.step("act: get the user by id", async () =>
      (await api.get(`${USERS_PATH}/id/${user.id}`)).expectOk().json<ApplicationUser>());

    await test.step("assert: the fields match the created user", () => {
      expect(reloaded).toMatchObject({ id: user.id, userName: user.userName, email: user.email });
    });
  });

  test("get a user by user name", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const reloaded = await test.step("act: get the user by user name", () => userNamed(api, user.userName));

    await test.step("assert: the user is a manager without roles", () => {
      expect(reloaded).toMatchObject({ userName: user.userName, userType: "Manager", roles: [] });
    });
  });

  test("change the e-mail of a user", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const email = `updated-${user.email}`;

    const result = await test.step("act: change the e-mail", async () =>
      (await api.put(USERS_PATH, { json: { ...user, email } })).expectOk().json<SecurityResult>());

    await test.step("assert: the user has the new e-mail", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await userNamed(api, user.userName))?.email).toBe(email);
    });
  });
});

async function createUser(api: HttpClient, draft: UserDraft): Promise<SecurityResult> {
  const response = await api.post(`${USERS_PATH}/create`, { json: { ...draft, password: draft.password.reveal() } });
  return response.expectOk().json<SecurityResult>();
}

async function searchUsers(api: HttpClient, searchPhrase: string): Promise<ApplicationUser[]> {
  return (
    (await api.post(`${USERS_PATH}/search`, { json: { searchPhrase } })).expectOk().json<UserSearchResult>().users ?? []
  );
}
