import type { TokenManager } from "@api/auth/token-manager";
import type { HttpClient } from "@api/http/http-client";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Env } from "@core/env";

import * as allure from "allure-js-commons";

import { CompletenessClient } from "@api/rest/clients/completeness-client";
import { PlatformClient } from "@api/rest/clients/platform-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { arrangeUser } from "@dataset/arrange/security";
import { newCompletenessChannel } from "@dataset/builders/completeness";
import { credentialsOf, newUser } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

interface NotificationSources {
  readonly platformAdminHttpClient: HttpClient;
  readonly anonymousHttpClient: HttpClient;
  readonly tokenManager: TokenManager;
  readonly cleanupStack: CleanupStack;
  readonly env: Env;
}

interface UserWithNotification {
  readonly platformClient: PlatformClient;
  readonly notificationId: string;
}

test.beforeEach(async () => {
  await allure.feature("Platform / Notifications");
});

test.describe("push notifications (new platform user)", () => {
  test("search push notifications", async ({
    platformAdminHttpClient,
    anonymousHttpClient,
    tokenManager,
    cleanupStack,
    env,
  }) => {
    const { platformClient, notificationId } = await test.step("arrange: a user with one notification", () =>
      arrangeUserWithNotification({ platformAdminHttpClient, anonymousHttpClient, tokenManager, cleanupStack, env }));

    const result = await test.step("act: search notifications", () =>
      platformClient.searchPushNotifications({ take: 20 }));

    await test.step("assert: the user's notification is found", async () => {
      expect(result).toMatchObject({ totalCount: 1, newCount: 1 });
      expect(result.notifyEvents).toEqual([expect.objectContaining({ id: notificationId, isNew: true })]);
    });
  });

  test("mark all push notifications as read", async ({
    platformAdminHttpClient,
    anonymousHttpClient,
    tokenManager,
    cleanupStack,
    env,
  }) => {
    const { platformClient } = await test.step("arrange: a user with one notification", () =>
      arrangeUserWithNotification({ platformAdminHttpClient, anonymousHttpClient, tokenManager, cleanupStack, env }));

    await test.step("act: mark all notifications as read", () => platformClient.markAllPushNotificationsAsRead());

    await test.step("assert: the notification is kept but no longer new", async () => {
      expect(await platformClient.searchPushNotifications({ take: 1 })).toMatchObject({ totalCount: 1, newCount: 0 });
    });
  });
});

async function arrangeUserWithNotification({
  platformAdminHttpClient,
  anonymousHttpClient,
  tokenManager,
  cleanupStack,
  env,
}: NotificationSources): Promise<UserWithNotification> {
  const { storeId } = env;
  const draft = newUser(storeId, { isAdministrator: true });
  await arrangeUser(new UsersClient(platformAdminHttpClient), cleanupStack, draft);
  const httpClient = await tokenManager.authorize(anonymousHttpClient, credentialsOf(draft), storeId);
  const completenessClient = new CompletenessClient(httpClient);
  const channel = await completenessClient.createChannel(newCompletenessChannel());
  cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));
  const { id: notificationId } = await completenessClient.evaluateChannel(channel.id);
  const platformClient = new PlatformClient(httpClient);
  await expect
    .poll(async () => (await platformClient.searchPushNotifications({ ids: [notificationId], take: 1 })).totalCount)
    .toBe(1);
  return { platformClient, notificationId };
}
