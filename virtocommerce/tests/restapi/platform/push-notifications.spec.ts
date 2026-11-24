import type { VirtoCommercePlatformCorePushNotificationsPushNotificationSearchResult as PushNotificationSearchResult } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";

const PUSH_NOTIFICATIONS_PATH = "/api/platform/pushnotifications";
const NOTIFICATIONS_PAGE_SIZE = 20;
const PUBLISH_TIMEOUT_MS = 30_000;

test.describe("push notifications (new platform administrator)", () => {
  test("find a new push notification and mark it as read", async ({ arrange }) => {
    const { credentials } = await test.step("arrange: a new platform administrator", () =>
      arrange.security.platformUser({ isAdministrator: true }));
    const administrator = await test.step("arrange: the administrator signs in", () =>
      arrange.security.signIn(credentials));
    const channel = await test.step("arrange: a completeness channel", () => arrange.catalog.completenessChannel());
    const evaluation = await test.step("arrange: the administrator evaluates the channel", async () => {
      const response = await administrator.post(`/api/completeness/channels/${channel.id}/evaluate`);
      return requireFields(response.expectOk().json<{ id?: string | null }>(), ["id"], "Evaluation notification");
    });
    await test.step("arrange: the evaluation is finished, so its notification changes no more", async () => {
      await expect
        .poll(
          async () => {
            const { notifyEvents } = await notificationsOf(administrator, { ids: [evaluation.id] });
            return notifyEvents?.map((event) => (event as { finished?: string | null }).finished != null);
          },
          { timeout: PUBLISH_TIMEOUT_MS },
        )
        .toEqual([true]);
    });

    const page = await test.step("act: search the administrator's notifications", () =>
      notificationsOf(administrator, { take: NOTIFICATIONS_PAGE_SIZE }));
    await test.step("assert: the evaluation's notification is the only one, and it is new", () => {
      expect(page).toMatchObject({ totalCount: 1, newCount: 1 });
      expect(page.notifyEvents).toEqual([expect.objectContaining({ id: evaluation.id, isNew: true })]);
    });

    await test.step("act: mark every notification as read", async () =>
      (await administrator.post(`${PUSH_NOTIFICATIONS_PATH}/markAllAsRead`)).expectOk());
    await test.step("assert: the notification is kept but no longer new", async () => {
      expect(await notificationsOf(administrator, { take: NOTIFICATIONS_PAGE_SIZE })).toMatchObject({
        totalCount: 1,
        newCount: 0,
      });
    });
  });
});

async function notificationsOf(
  client: HttpClient,
  criteria: { readonly ids?: readonly string[]; readonly take?: number },
): Promise<PushNotificationSearchResult> {
  return (await client.post(PUSH_NOTIFICATIONS_PATH, { json: criteria }))
    .expectOk()
    .json<PushNotificationSearchResult>();
}
