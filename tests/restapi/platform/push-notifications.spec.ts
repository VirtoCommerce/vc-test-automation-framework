import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const NOTIFICATIONS_PAGE_SIZE = 20;
const PUBLISH_TIMEOUT_MS = 30_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Push Notifications");
});

test.describe("push notifications (new platform administrator)", () => {
  test("find a new push notification and mark it as read", async ({ arrange }) => {
    await allure.story("Push notifications");
    await allure.description(
      "A new administrator's only push notification is new; once every notification is marked as read, " +
        "it is kept but no longer new.",
    );
    const { credentials } = await test.step("arrange: a new platform administrator", () =>
      arrange.security.platformUser({ isAdministrator: true }));
    const administrator = await test.step("arrange: the administrator signs in", () =>
      arrange.security.signIn(credentials));
    const channel = await test.step("arrange: a completeness channel", () => arrange.catalog.completenessChannel());
    const evaluation = await test.step("arrange: the administrator evaluates the channel", () =>
      administrator.rest.completeness.channels.evaluate(channel.id));
    await test.step("arrange: the evaluation's notification is published", async () => {
      await expect
        .poll(
          async () => (await administrator.rest.platform.pushNotifications.search({ ids: [evaluation.id] })).totalCount,
          { timeout: PUBLISH_TIMEOUT_MS },
        )
        .toBe(1);
    });

    const page = await test.step("act: search the administrator's notifications", () =>
      administrator.rest.platform.pushNotifications.search({ take: NOTIFICATIONS_PAGE_SIZE }));
    await test.step("assert: the evaluation's notification is the only one, and it is new", () => {
      expect(page).toMatchObject({ totalCount: 1, newCount: 1 });
      expect(page.notifyEvents).toEqual([expect.objectContaining({ id: evaluation.id, isNew: true })]);
    });

    await test.step("act: mark every notification as read", () =>
      administrator.rest.platform.pushNotifications.markAllAsRead());
    await test.step("assert: the notification is kept but no longer new", async () => {
      expect(
        await administrator.rest.platform.pushNotifications.search({ take: NOTIFICATIONS_PAGE_SIZE }),
      ).toMatchObject({
        totalCount: 1,
        newCount: 0,
      });
    });
  });
});
