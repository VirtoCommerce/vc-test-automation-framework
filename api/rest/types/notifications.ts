import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type NotificationMessageData = Rest.VirtoCommerceNotificationsModuleCoreModelNotificationMessage;
export type NotificationMessageSearchCriteria =
  Rest.VirtoCommerceNotificationsModuleCoreModelSearchNotificationMessageSearchCriteria;

export const NOTIFICATION_MESSAGE = shape<EmailNotificationMessage>()("Notification message", [
  "id",
  "notificationType",
]);
export type NotificationMessage = Shaped<typeof NOTIFICATION_MESSAGE>;

export type EmailNotificationMessage = NotificationMessageData & {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly subject?: string | null;
  readonly body?: string | null;
};

export interface NotificationJournalPage {
  readonly totalCount?: number;
  readonly results?: EmailNotificationMessage[] | null;
}
