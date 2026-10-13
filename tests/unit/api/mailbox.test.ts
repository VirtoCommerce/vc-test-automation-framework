import type { Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";
import type { NotificationMessage } from "@api/rest/types/notifications";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { Mailbox } from "@api/mailbox";
import { NotificationsClient } from "@api/rest/clients/notifications-client";
import { MASK, Secret } from "@core/secret";

const QUERY = { type: "ResetPasswordEmailNotification", recipient: "jane@acme.com" } as const;
const FAST = { timeoutMs: 300, intervalMs: 10 } as const;

let server: Server;
let context: APIRequestContext;
let answers: NotificationMessage[][] = [];
let requests: unknown[] = [];

test.beforeAll(async ({ playwright }) => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const results = answers.length > 1 ? answers.shift() : answers[0];
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ results: results ?? [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  context = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.beforeEach(() => {
  answers = [];
  requests = [];
});

function mailbox(): Mailbox {
  return new Mailbox(new NotificationsClient(new HttpClient(context)));
}

function email(id: string, body = ""): NotificationMessage {
  return { id, notificationType: QUERY.type, body };
}

test.describe("Mailbox", () => {
  test.describe("latest", () => {
    test("asks the journal for the newest e-mail of the type to the recipient", async () => {
      answers = [[email("mail-2")]];

      expect(await mailbox().latest(QUERY)).toEqual(email("mail-2"));
      expect(requests).toEqual([
        { notificationType: QUERY.type, keyword: QUERY.recipient, sort: "createdDate:desc", take: 1 },
      ]);
    });

    test("returns undefined when there is no such e-mail", async () => {
      answers = [[]];

      expect(await mailbox().latest(QUERY)).toBeUndefined();
    });

    test("remembers the token and code of every link as secrets, so a printed body is masked", async () => {
      const body =
        '<a href="https://frontend.example.com/reset?token=mailbox-token-2&amp;userId=u-1">Reset</a>' +
        '<a href="https://frontend.example.com/confirm?code=mailbox-code-2">Confirm</a>';
      answers = [[email("mail-1", body)]];

      await mailbox().latest(QUERY);

      expect(Secret.mask(body)).toBe(
        `<a href="https://frontend.example.com/reset?token=${MASK}&amp;userId=u-1">Reset</a>` +
          `<a href="https://frontend.example.com/confirm?code=${MASK}">Confirm</a>`,
      );
    });
  });

  test.describe("waitForNewer", () => {
    test("waits until an e-mail newer than the previous one arrives", async () => {
      answers = [[email("mail-1")], [email("mail-1")], [email("mail-2")]];

      expect(await mailbox().waitForNewer(QUERY, email("mail-1"), FAST)).toEqual(email("mail-2"));
      expect(requests).toHaveLength(3);
    });

    test("takes the first e-mail when there was none before", async () => {
      answers = [[], [email("mail-1")]];

      expect(await mailbox().waitForNewer(QUERY, undefined, FAST)).toEqual(email("mail-1"));
    });

    test("names the e-mail it waited for when none arrives in time", async () => {
      answers = [[email("mail-1")]];

      await expect(mailbox().waitForNewer(QUERY, email("mail-1"), FAST)).rejects.toThrow(
        `Timed out after ${FAST.timeoutMs} ms waiting for a new ${QUERY.type} e-mail to ${QUERY.recipient}`,
      );
    });
  });

  test.describe("linkParameter", () => {
    test("returns a parameter of the first link as a Secret", () => {
      const body =
        '<a href="https://frontend.example.com/reset-password?userId=u-1&amp;token=mailbox-token-1">Reset</a>';

      const token = Mailbox.linkParameter(email("mail-1", body), "token");

      expect(token).toBeInstanceOf(Secret);
      expect(token.reveal()).toBe("mailbox-token-1");
    });

    test("throws for an e-mail without a link", () => {
      expect(() => Mailbox.linkParameter(email("mail-1", "no link here"), "token")).toThrow(
        `The ${QUERY.type} e-mail mail-1 has no link with "token"`,
      );
    });

    test("throws for a link without the parameter", () => {
      const body = '<a href="https://frontend.example.com/reset-password?userId=u-1">Reset</a>';

      expect(() => Mailbox.linkParameter(email("mail-1", body), "token")).toThrow('has no link with "token"');
    });
  });
});
