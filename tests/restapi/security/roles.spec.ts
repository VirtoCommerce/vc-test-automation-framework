import * as allure from "allure-js-commons";

import { newRole } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

const CALL_API = "security:call_api";
const RESET_CACHE = "cache:reset";
const READ_SETTINGS = "platform:setting:read";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / Roles");
});

test.describe("roles (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a role", async ({ api, arrange }) => {
    await allure.story("Create");
    await allure.description("A new role has exactly the permission it was created with.");
    const draft = newRole([CALL_API]);

    const result = await test.step("act: create a role", () => api.rest.roles.save(draft));
    arrange.security.deleteRoleLater(draft.name);

    await test.step(`assert: the role has exactly ${CALL_API}`, async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.rest.roles.get(draft.name)).permissions?.map(({ name }) => name)).toEqual([CALL_API]);
    });
  });

  test("get a role by name", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A role is read back by its name.");
    const role = await test.step("arrange: a role", () => arrange.security.role([CALL_API]));

    const reloaded = await test.step("act: get the role", () => api.rest.roles.get(role.name));

    await test.step("assert: the fields match the created role", () => {
      expect(reloaded).toMatchObject({ id: role.id, name: role.name });
    });
  });

  test("search roles by keyword", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching roles by a role's unique name finds exactly that role.");
    const role = await test.step("arrange: a role", () => arrange.security.role());

    const found = await test.step("act: search roles by its name", () => api.rest.roles.search({ keyword: role.name }));

    await test.step("assert: exactly the role is found", () => {
      expect(found.map(({ id }) => id)).toEqual([role.id]);
    });
  });

  test("list every permission", async ({ api }) => {
    await allure.story("Permissions");
    await allure.description("The platform's permissions include its cache and settings permissions.");

    const permissions = await test.step("act: list every permission", () => api.rest.roles.permissions.list());

    await test.step(`assert: ${RESET_CACHE} and ${READ_SETTINGS} are listed`, () => {
      expect(permissions.map(({ name }) => name)).toEqual(expect.arrayContaining([RESET_CACHE, READ_SETTINGS]));
    });
  });

  test("describe a role", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A role's new description is stored.");
    const role = await test.step("arrange: a role", () => arrange.security.role());
    const description = `Description of ${role.name}`;

    const result = await test.step("act: describe the role", () => api.rest.roles.save({ ...role, description }));

    await test.step("assert: the role has the description", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.rest.roles.get(role.name)).description).toBe(description);
    });
  });

  test("remove a permission from a role", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A permission taken from a role is gone; the other stays.");
    const role = await test.step("arrange: a role with two permissions", () =>
      arrange.security.role([CALL_API, RESET_CACHE]));

    const result = await test.step(`act: remove ${RESET_CACHE}`, () =>
      api.rest.roles.save({ ...role, permissions: [{ name: CALL_API }] }));

    await test.step(`assert: only ${CALL_API} remains`, async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await api.rest.roles.get(role.name)).permissions?.map(({ name }) => name)).toEqual([CALL_API]);
    });
  });

  test("assign a role to a user and revoke it", async ({ api, arrange }) => {
    await allure.story("Assignment");
    await allure.description("A role assigned to a user is the user's only role; once revoked, the user has none.");
    const role = await test.step("arrange: a role", () => arrange.security.role([CALL_API]));
    const { user } = await test.step("arrange: a user without roles", () => arrange.security.platformUser());

    const assigned = await test.step("act: assign the role", () =>
      api.rest.users.update({ ...user, roles: [{ id: role.id, name: role.name }] }));
    await test.step("assert: the user has exactly the role", async () => {
      expect(assigned).toMatchObject({ succeeded: true });
      expect((await api.rest.users.get(user.userName)).roles?.map(({ id }) => id)).toEqual([role.id]);
    });

    const revoked = await test.step("act: revoke the role", async () =>
      api.rest.users.update({ ...(await api.rest.users.get(user.userName)), roles: [] }));
    await test.step("assert: the user has no roles", async () => {
      expect(revoked).toMatchObject({ succeeded: true });
      expect((await api.rest.users.get(user.userName)).roles).toEqual([]);
    });
  });

  test("delete a role", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted role is neither read nor found.");
    const role = await test.step("arrange: a role", () => arrange.security.role());

    await test.step("act: delete the role", () => api.rest.roles.delete([role.id]));

    await test.step("assert: the role is not found", async () => {
      expect(await api.rest.roles.find(role.name)).toBeUndefined();
      expect(await api.rest.roles.search({ keyword: role.name })).toEqual([]);
    });
  });
});
