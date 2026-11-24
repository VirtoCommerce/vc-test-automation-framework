import type {
  VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser,
  VirtoCommercePlatformCoreSecurityPermission as Permission,
  VirtoCommercePlatformCoreSecurityRole as Role,
  VirtoCommercePlatformCoreSecuritySearchRoleSearchResult as RoleSearchResult,
  VirtoCommercePlatformCoreSecuritySecurityResult as SecurityResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newRole } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { userNamed } from "@support/users.ts";

const CALL_API = "security:call_api";
const RESET_CACHE = "cache:reset";
const READ_SETTINGS = "platform:setting:read";
const ROLES_PATH = "/api/platform/security/roles";
const USERS_PATH = "/api/platform/security/users";

test.describe("roles (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a role", async ({ api, arrange }) => {
    const draft = newRole([CALL_API]);
    arrange.security.deleteRoleLater(draft.name);

    const result = await test.step("act: create a role", () => saveRole(api, draft));

    await test.step(`assert: the role has exactly ${CALL_API}`, async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await roleNamed(api, draft.name))?.permissions?.map(({ name }) => name)).toEqual([CALL_API]);
    });
  });

  test("get a role by name", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role", () => arrange.security.role([CALL_API]));

    const reloaded = await test.step("act: get the role", () => roleNamed(api, role.name));

    await test.step("assert: the fields match the created role", () => {
      expect(reloaded).toMatchObject({ id: role.id, name: role.name });
    });
  });

  test("search roles by keyword", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role", () => arrange.security.role());

    const found = await test.step("act: search roles by its name", () => searchRoles(api, role.name));

    await test.step("assert: exactly the role is found", () => {
      expect(found.map(({ id }) => id)).toEqual([role.id]);
    });
  });

  test("list every permission", async ({ api }) => {
    const permissions = await test.step("act: list every permission", async () =>
      (await api.get("/api/platform/security/permissions")).expectOk().json<Permission[]>());

    await test.step(`assert: ${RESET_CACHE} and ${READ_SETTINGS} are listed`, () => {
      expect(permissions.map(({ name }) => name)).toEqual(expect.arrayContaining([RESET_CACHE, READ_SETTINGS]));
    });
  });

  test("describe a role", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role", () => arrange.security.role());
    const description = `Description of ${role.name}`;

    const result = await test.step("act: describe the role", () => saveRole(api, { ...role, description }));

    await test.step("assert: the role has the description", async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await roleNamed(api, role.name))?.description).toBe(description);
    });
  });

  test("remove a permission from a role", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role with two permissions", () =>
      arrange.security.role([CALL_API, RESET_CACHE]));

    const result = await test.step(`act: remove ${RESET_CACHE}`, () =>
      saveRole(api, { ...role, permissions: [{ name: CALL_API }] }));

    await test.step(`assert: only ${CALL_API} remains`, async () => {
      expect(result).toMatchObject({ succeeded: true });
      expect((await roleNamed(api, role.name))?.permissions?.map(({ name }) => name)).toEqual([CALL_API]);
    });
  });

  test("assign a role to a user and revoke it", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role", () => arrange.security.role([CALL_API]));
    const { user } = await test.step("arrange: a user without roles", () => arrange.security.platformUser());

    const assigned = await test.step("act: assign the role", () =>
      updateUser(api, { ...user, roles: [{ id: role.id, name: role.name }] }));
    await test.step("assert: the user has exactly the role", async () => {
      expect(assigned).toMatchObject({ succeeded: true });
      expect((await userNamed(api, user.userName))?.roles?.map(({ id }) => id)).toEqual([role.id]);
    });

    const revoked = await test.step("act: revoke the role", async () =>
      updateUser(api, { ...(await userNamed(api, user.userName)), roles: [] }));
    await test.step("assert: the user has no roles", async () => {
      expect(revoked).toMatchObject({ succeeded: true });
      expect((await userNamed(api, user.userName))?.roles).toEqual([]);
    });
  });

  test("delete a role", async ({ api, arrange }) => {
    const role = await test.step("arrange: a role", () => arrange.security.role());

    await test.step("act: delete the role", async () =>
      (await api.delete(ROLES_PATH, { query: { ids: [role.id] } })).expectOk());

    await test.step("assert: the role is not found", async () => {
      expect(await roleNamed(api, role.name)).toBeUndefined();
      expect(await searchRoles(api, role.name)).toEqual([]);
    });
  });
});

async function saveRole(api: HttpClient, role: Role): Promise<SecurityResult> {
  return (await api.put(ROLES_PATH, { json: role })).expectOk().json<SecurityResult>();
}

async function roleNamed(api: HttpClient, name: string): Promise<Role | undefined> {
  return (await api.get(`${ROLES_PATH}/${encodeURIComponent(name)}`)).optionalJson<Role>();
}

async function searchRoles(api: HttpClient, keyword: string): Promise<Role[]> {
  return (
    (await api.post(`${ROLES_PATH}/search`, { json: { keyword } })).expectOk().json<RoleSearchResult>().roles ?? []
  );
}

async function updateUser(api: HttpClient, user: ApplicationUser): Promise<SecurityResult> {
  return (await api.put(USERS_PATH, { json: user })).expectOk().json<SecurityResult>();
}
