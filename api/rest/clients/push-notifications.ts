import type { HttpClient } from "../../http/http-client";
import type { PushNotificationSearchCriteria } from "../types/platform";

export const PUSH_NOTIFICATIONS_PATH = "/api/platform/pushnotifications";

export async function findPushNotification<T extends { readonly id?: string | null }>(
  httpClient: HttpClient,
  id: string,
): Promise<T | undefined> {
  const criteria: PushNotificationSearchCriteria = { ids: [id], take: 1 };
  const response = await httpClient.post(PUSH_NOTIFICATIONS_PATH, { json: criteria });
  return response
    .expectOk()
    .json<{ notifyEvents?: T[] | null }>()
    .notifyEvents?.find((notification) => notification.id === id);
}
