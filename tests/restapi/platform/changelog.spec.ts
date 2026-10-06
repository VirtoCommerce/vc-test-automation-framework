import * as allure from "allure-js-commons";

import { PlatformClient } from "@api/rest/clients/platform-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { requireEach } from "@core/required-fields";
import { arrangeUser } from "@dataset/arrange/security";
import { newUser } from "@dataset/builders/security";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const TRACKED_OBJECT_TYPE = "ApplicationUser";

test.beforeEach(async () => {
  await allure.feature("Platform / Change Log");
});

test.describe("change log (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("get the last modified date", async ({ httpClient }) => {
    const platformClient = new PlatformClient(httpClient);

    const lastModifiedDate = await test.step("act: get last modified date", () => platformClient.getLastModifiedDate());

    await test.step("assert: date is a valid timestamp", async () => {
      expect(Number.isNaN(Date.parse(lastModifiedDate))).toBe(false);
    });
  });

  test("force changes to move the last modified date forward", async ({ httpClient }) => {
    const platformClient = new PlatformClient(httpClient);
    const before = await test.step("arrange: current last modified date", () => platformClient.getLastModifiedDate());

    await test.step("act: force changes", () => platformClient.forceChanges());

    await test.step("assert: last modified date is later", async () => {
      expect(Date.parse(await platformClient.getLastModifiedDate())).toBeGreaterThan(Date.parse(before));
    });
  });

  test("search the change log", async ({ httpClient, cleanupStack, env }) => {
    const platformClient = new PlatformClient(httpClient);
    const user = await test.step("arrange: a new user", () =>
      arrangeUser(new UsersClient(httpClient), cleanupStack, newUser(env.storeId)));

    const result = await test.step("act: search the changes of the user", () =>
      platformClient.searchChangeLog({ objectIds: [user.id], take: 10 }));

    await test.step("assert: the user's creation is logged", async () => {
      expect(result.results).toEqual([
        expect.objectContaining({ objectType: TRACKED_OBJECT_TYPE, objectId: user.id, operationType: "Added" }),
      ]);
    });
  });

  test("filter the change log by object type", async ({ httpClient, cleanupStack, env }) => {
    const platformClient = new PlatformClient(httpClient);
    const user = await test.step("arrange: a new user", () =>
      arrangeUser(new UsersClient(httpClient), cleanupStack, newUser(env.storeId)));

    const result = await test.step(`act: search the newest ${TRACKED_OBJECT_TYPE} changes`, () =>
      platformClient.searchChangeLog({ objectType: TRACKED_OBJECT_TYPE, sort: "createdDate:desc", take: 20 }));

    await test.step(`assert: the user's change is found and only ${TRACKED_OBJECT_TYPE} changes are returned`, async () => {
      const changes = requireEach(result.results, ["objectType", "objectId"], "Change log entry");
      expect(changes.map(({ objectId }) => objectId)).toContain(user.id);
      expect(new Set(changes.map(({ objectType }) => objectType))).toEqual(new Set([TRACKED_OBJECT_TYPE]));
    });
  });
});
