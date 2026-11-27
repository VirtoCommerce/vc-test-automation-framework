import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

/**
 * Returns a push notification of the signed-in user by its identifier, such as the progress of an indexation that the
 * platform reports as a notification.
 *
 * @param api - A client signed in as the user who started the operation.
 * @param id - The identifier of the notification.
 * @returns The notification, or `undefined` while the platform has not published it.
 */
export async function pushNotificationOf<T extends { readonly id?: string | null }>(
  api: HttpClient,
  id: string,
): Promise<T | undefined> {
  const response = await api.post("/api/platform/pushnotifications", { json: { ids: [id], take: 1 } });
  return response
    .expectOk()
    .json<{ notifyEvents?: T[] | null }>()
    .notifyEvents?.find((notification) => notification.id === id);
}
