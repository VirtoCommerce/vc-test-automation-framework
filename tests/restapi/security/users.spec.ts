import * as allure from "allure-js-commons";

import { newPlatformUser } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / Users");
});

test.describe("platform users (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a user", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new user is created and found by its user name.");
    const draft = newPlatformUser(store.id);
    cleanup.push(`delete user ${draft.userName}`, () => api.rest.users.delete([draft.userName]));

    const result = await test.step("act: create a user", () =>
      api.rest.users.create({ ...draft, password: draft.password.reveal() }));

    await test.step("assert: the user is created and found by its user name", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.rest.users.search({ searchPhrase: draft.userName })).map(({ userName }) => userName)).toContain(
        draft.userName,
      );
    });
  });

  test("reject a user name that is taken", async ({ api, arrange, store }) => {
    await allure.story("Create");
    await allure.description("A second user with the user name of an existing one is rejected.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const duplicate = { ...newPlatformUser(store.id), userName: user.userName, email: user.email };

    const result = await test.step("act: create another user with the same user name", () =>
      api.rest.users.create({ ...duplicate, password: duplicate.password.reveal() }));

    await test.step("assert: the user name is reported as taken", () => {
      expect(result).toMatchObject({
        succeeded: false,
        errors: expect.arrayContaining([expect.stringContaining(`Username '${user.userName}' is already taken`)]),
      });
    });
  });

  test("get a user by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A user is read back by its id with its user name and e-mail.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const reloaded = await test.step("act: get the user by id", () => api.rest.users.getById(user.id));

    await test.step("assert: the fields match the created user", () => {
      expect(reloaded).toMatchObject({ id: user.id, userName: user.userName, email: user.email });
    });
  });

  test("get a user by user name", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A user read by its user name is a back-office manager without roles.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const reloaded = await test.step("act: get the user by user name", () => api.rest.users.get(user.userName));

    await test.step("assert: the user is a manager without roles", () => {
      expect(reloaded).toMatchObject({ userName: user.userName, userType: "Manager", roles: [] });
    });
  });

  test("change the e-mail of a user", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A user's new e-mail is stored.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const email = `updated-${user.email}`;

    const result = await test.step("act: change the e-mail", () => api.rest.users.update({ ...user, email }));

    await test.step("assert: the user has the new e-mail", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.rest.users.get(user.userName)).email).toBe(email);
    });
  });
});
