import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const CHANGE_LOG_TIMEOUT_MS = 30_000;
const USER_TYPE = "ApplicationUser";
const ANOTHER_TYPE = "Role";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Change Log");
});

test.describe("change log (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("get the last modified date", async ({ api }) => {
    await allure.story("Last modified");
    await allure.description("The platform reports when its data last changed, as a date.");

    const lastModified = await test.step("act: get the last modified date", () =>
      api.rest.platform.getLastModifiedDate());

    await test.step("assert: it is a valid date", () => {
      expect(Number.isNaN(Date.parse(lastModified))).toBe(false);
    });
  });

  test("forcing changes moves the last modified date forward", async ({ api }) => {
    await allure.story("Last modified");
    await allure.description("After changes are forced, the last modified date is later than before.");
    const before = await test.step("arrange: the current last modified date", () =>
      api.rest.platform.getLastModifiedDate());

    await test.step("act: force changes", () => api.rest.platform.forceChanges());

    await test.step("assert: the last modified date is later", async () => {
      expect(Date.parse(await api.rest.platform.getLastModifiedDate())).toBeGreaterThan(Date.parse(before));
    });
  });

  test("search the change log by object id", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("The change log of a new user is exactly its creation.");
    const { user } = await test.step("arrange: a new user", () => arrange.security.platformUser());

    await test.step("act and assert: searching the user's changes finds exactly its creation", async () => {
      await expect
        .poll(() => api.rest.platform.changeLog.search({ objectIds: [user.id] }), { timeout: CHANGE_LOG_TIMEOUT_MS })
        .toEqual([expect.objectContaining({ objectType: USER_TYPE, objectId: user.id, operationType: "Added" })]);
    });
  });

  test("filter the change log by object type", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description(
      `A user's changes are found under ${USER_TYPE} and not under another object type, such as ${ANOTHER_TYPE}.`,
    );
    const { user } = await test.step("arrange: a new user", () => arrange.security.platformUser());

    await test.step(`act and assert: only searching as ${USER_TYPE} finds the user's changes`, async () => {
      await expect
        .poll(
          async () => ({
            asUser: (await api.rest.platform.changeLog.search({ objectIds: [user.id], objectType: USER_TYPE })).map(
              ({ objectId }) => objectId,
            ),
            asOther: await api.rest.platform.changeLog.search({ objectIds: [user.id], objectType: ANOTHER_TYPE }),
          }),
          { timeout: CHANGE_LOG_TIMEOUT_MS },
        )
        .toEqual({ asUser: [user.id], asOther: [] });
    });
  });
});
