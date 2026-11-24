import type { VirtoCommerceNotificationsModuleCoreModelNotificationMessage as NotificationMessage } from "../rest/generated/platform.ts";
import type { ArrangeContext } from "./context.ts";

import { Secret } from "@virtocommerce/test-automation-framework/core";

import { pollUntil } from "../support/poll.ts";

/** An e-mail of the notification journal of the platform, with the body that e-mail messages add. */
export type Email = NotificationMessage & { readonly body?: string | null };

/** Which e-mails to read: a notification type sent to a recipient. */
export interface MailQuery {
  /** The notification type, such as `ResetPasswordEmailNotification`. */
  readonly type: string;
  /** The e-mail address or user name of the recipient. */
  readonly recipient: string;
}

/** Reads the e-mails that the platform sends, from its notification journal, as the store administrator. */
export interface Mailbox {
  /** Returns the latest e-mail of the query, or `undefined` when there is none. */
  latest(query: MailQuery): Promise<Email | undefined>;
  /**
   * Waits for an e-mail of the query newer than the given one.
   *
   * @param previous - The latest e-mail before the test acted, from {@link Mailbox#latest}.
   * @throws {Error} No newer e-mail arrives in time.
   */
  waitForNewer(query: MailQuery, previous: Email | undefined): Promise<Email>;
}

const NOTIFICATION_JOURNAL_PATH = "/api/notifications/journal";

/**
 * Returns the mailbox of `arrange`.
 *
 * @param context - The store administrator that reads the journal.
 * @returns The mailbox.
 */
export function mailboxArrange({ admin }: ArrangeContext): Mailbox {
  async function latest({ type, recipient }: MailQuery): Promise<Email | undefined> {
    const response = await (await admin()).post(NOTIFICATION_JOURNAL_PATH, {
      json: { notificationType: type, keyword: recipient, sort: "createdDate:desc", take: 1 },
    });
    return response.expectOk().json<{ results?: Email[] | null }>().results?.[0];
  }

  async function waitForNewer(query: MailQuery, previous: Email | undefined): Promise<Email> {
    const email = await pollUntil(
      () => latest(query),
      (found) => found !== undefined && found.id !== previous?.id,
      `a new ${query.type} e-mail to ${query.recipient}`,
    );
    if (email === undefined) {
      throw new Error(`No new ${query.type} e-mail to ${query.recipient}`);
    }
    return email;
  }

  return { latest, waitForNewer };
}

/**
 * Returns a query parameter of the first link of an e-mail that has it, such as the token of a password reset link.
 *
 * @param email - The e-mail.
 * @param name - The name of the parameter.
 * @returns The value, masked in reports.
 * @throws {Error} No link of the e-mail has the parameter.
 */
export function linkParameter(email: Email, name: string): Secret {
  const links = [...(email.body ?? "").matchAll(/href="([^"]+)"/g)].flatMap(([, href]) => {
    const link = href === undefined ? null : URL.parse(href.replaceAll("&amp;", "&"));
    return link === null ? [] : [link];
  });
  const value = links.map((link) => link.searchParams.get(name)).find((found) => found !== null);
  if (value === undefined || value === null) {
    throw new Error(`The ${email.notificationType} e-mail ${email.id} has no link with "${name}"`);
  }
  return Secret.of(value);
}
