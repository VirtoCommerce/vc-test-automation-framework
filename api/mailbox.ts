import type { NotificationsClient } from "./rest/clients/notifications-client";
import type { NotificationMessage } from "./rest/types/notifications";

import { pollUntil } from "@core/poll";
import { Secret } from "@core/secret";

const SECRET_LINK_PARAMETERS = ["token", "code"] as const;

/** Selects e-mails of one notification type to one recipient. */
export interface MailQuery {
  /** Such as `ResetPasswordEmailNotification`. */
  readonly type: string;
  /** User name or e-mail address; matched by the journal's keyword search. */
  readonly recipient: string;
}

/** Polling of {@link Mailbox#waitForNewer}: timeout 30 s and interval 0.5 s by default. */
export interface WaitOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/**
 * Reads sent e-mails from the platform's notification journal, so tests can follow their links (password reset,
 * invitation, verification) without a mail server. Link `token`/`code` values are registered as {@link Secret}s.
 * The notifications client must be allowed to read the journal, e.g. an administrator's.
 *
 * @example
 * const mailbox = new Mailbox(administrator.rest.notifications);
 * const resetEmail = { type: "ResetPasswordEmailNotification", recipient: userName };
 * const previous = await mailbox.latest(resetEmail);
 * // …make the platform send the e-mail…
 * const token = Mailbox.linkParameter(await mailbox.waitForNewer(resetEmail, previous), "token");
 */
export class Mailbox {
  readonly #notifications: NotificationsClient;

  constructor(notifications: NotificationsClient) {
    this.#notifications = notifications;
  }

  /** Returns the newest matching e-mail, or `undefined` when there is none. */
  async latest(query: MailQuery): Promise<NotificationMessage | undefined> {
    const [latest] = await this.#notifications.journal.search({
      notificationType: query.type,
      keyword: query.recipient,
      sort: "createdDate:desc",
      take: 1,
    });
    if (latest !== undefined) {
      rememberLinkSecrets(latest);
    }
    return latest;
  }

  /**
   * Polls for a matching e-mail newer than `previous`, so a mail from an earlier run is never taken.
   *
   * @param previous - Result of {@link Mailbox#latest} taken before triggering the e-mail.
   * @throws Error when no newer e-mail arrives in time.
   */
  async waitForNewer(
    query: MailQuery,
    previous: NotificationMessage | undefined,
    options: WaitOptions = {},
  ): Promise<NotificationMessage> {
    const latest = await pollUntil(
      () => this.latest(query),
      (email) => email !== undefined && email.id !== previous?.id,
      { describe: `a new ${query.type} e-mail to ${query.recipient}`, ...options },
    );
    if (latest === undefined) {
      throw new Error(`No new ${query.type} e-mail to ${query.recipient}`);
    }
    return latest;
  }

  /**
   * Reads a query parameter (such as `token`) of the e-mail's first link, as a {@link Secret}.
   *
   * @throws Error when the e-mail has no link or the first link lacks the parameter.
   */
  static linkParameter(email: NotificationMessage, name: string): Secret {
    const value = linksOf(email)[0]?.searchParams.get(name);
    if (value === undefined || value === null) {
      throw new Error(`The ${email.notificationType} e-mail ${email.id} has no link with "${name}"`);
    }
    return new Secret(value);
  }
}

function linksOf(email: NotificationMessage): URL[] {
  return [...(email.body ?? "").matchAll(/href="([^"]+)"/g)].flatMap(([, href]) => {
    const link = href === undefined ? null : URL.parse(href.replaceAll("&amp;", "&"));
    return link === null ? [] : [link];
  });
}

function rememberLinkSecrets(email: NotificationMessage): void {
  for (const link of linksOf(email)) {
    for (const name of SECRET_LINK_PARAMETERS) {
      const value = link.searchParams.get(name);
      if (value !== null) {
        new Secret(value);
      }
    }
  }
}
