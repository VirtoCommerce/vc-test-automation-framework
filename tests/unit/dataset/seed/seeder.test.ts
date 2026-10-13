import type { HttpMethod } from "@api/http/http-method";
import type { CollectionName } from "@dataset/manifest";
import type { SeedHttp } from "@dataset/seed/seeder";

import { Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";

import { expect, test } from "@playwright/test";

import { HttpResponse } from "@api/http/http-response";
import { Logger } from "@core/logger";
import { loadDataset } from "@dataset/dataset";
import { seedDataset } from "@dataset/seed/seeder";

const PLACEHOLDERS = {
  STORE_ID: "store-under-test",
  FRONTEND_BASE_URL: "https://frontend.example.com",
  USERS_PASSWORD: "seeder-users-password-1",
  GOOGLE_MAPS_API_KEY: "",
};
const DATASET = loadDataset(PLACEHOLDERS);

interface SentRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly ifMatch?: string;
}

type Answer = { readonly status: number; readonly body?: unknown; readonly eTag?: string };

/** An HTTP client that records every request and answers by path; unknown paths answer 200 without a body. */
function fakeHttp(answers: Readonly<Record<string, Answer>> = {}): SeedHttp & { readonly sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  function answer(method: HttpMethod, path: string, ifMatch?: string): HttpResponse {
    sent.push(ifMatch === undefined ? { method, path } : { method, path, ifMatch });
    const { status, body, eTag } = answers[path] ?? { status: 200 };
    return new HttpResponse({
      method,
      url: path,
      status,
      statusText: String(status),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(eTag === undefined ? {} : { etag: eTag }),
      },
      text: body === undefined ? "" : JSON.stringify(body),
    });
  }
  return {
    sent,
    get: async (path) => answer("GET", path),
    send: async (method, path, options) => answer(method, path, options?.headers?.["If-Match"]),
  };
}

function capture(): { readonly logger: Logger; readonly lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return {
    logger: new Logger("seed", stream),
    lines: () => stripVTControlCharacters(chunks.join("")).split("\n").slice(0, -1),
  };
}

function scope(collections: readonly CollectionName[], skipped: readonly CollectionName[] = []) {
  return { partial: true, collections, skipped };
}

test.describe("seedDataset", () => {
  test("sends the ETag read right before each request as If-Match, where the manifest asks for it", async () => {
    const paths = DATASET.pagesContent
      .all()
      .map(
        (content) =>
          `/api/page-builder-pages/grouped/${encodeURIComponent(String(Reflect.get(content, "pageId")))}/content`,
      );
    const http = fakeHttp(Object.fromEntries(paths.map((path) => [path, { status: 200, eTag: `"${path}"` }])));

    await seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["pagesContent"]),
    });

    expect(http.sent).toEqual(
      paths.flatMap((path) => [
        { method: "GET", path },
        { method: "POST", path, ifMatch: `"${path}"` },
      ]),
    );
  });

  test("sends without If-Match when the version read has no ETag, as older modules answer", async () => {
    const http = fakeHttp();

    await seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["pagesContent"]),
    });

    expect(http.sent.filter(({ method }) => method === "POST").map(({ ifMatch }) => ifMatch)).toEqual(
      DATASET.pagesContent.all().map(() => undefined),
    );
  });

  test("sends every record of the scoped collections with the manifest's method and path", async () => {
    const http = fakeHttp();

    const summary = await seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["currencies"]),
    });

    expect(http.sent).toEqual(DATASET.currencies.all().map(() => ({ method: "POST", path: "/api/currencies" })));
    expect(summary).toEqual({ collections: ["currencies"], sent: DATASET.currencies.size, existing: 0 });
  });

  test("looks a record with a find path up first and leaves a stored one as it is", async () => {
    const [stored, ...others] = DATASET.users.all();
    const storedPath = `/api/platform/security/users/${encodeURIComponent(String(stored?.userName))}`;
    const http = fakeHttp({ [storedPath]: { status: 200, body: { userName: stored?.userName } } });

    const summary = await seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["users"]),
    });

    expect(http.sent.filter(({ method }) => method === "POST")).toHaveLength(others.length);
    expect(summary).toMatchObject({ sent: others.length, existing: 1 });
  });

  test("stops at a request the platform refuses with succeeded: false, naming the record", async () => {
    const [first] = DATASET.roles.all();
    const http = fakeHttp({
      "/api/platform/security/roles": { status: 200, body: { succeeded: false, errors: ["Role exists"] } },
    });

    const run = seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["roles", "currencies"]),
    });

    await expect(run).rejects.toThrow(
      `roles record "${first?.id}": PUT /api/platform/security/roles answered 200 but refused: ["Role exists"]`,
    );
    expect(http.sent.map(({ path }) => path)).not.toContain("/api/currencies");
  });

  test("stops at a failed request, naming the collection and the record", async () => {
    const http = fakeHttp({ "/api/currencies": { status: 500 } });

    const run = seedDataset({
      http,
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["currencies"]),
    });

    await expect(run).rejects.toThrow(/^currencies record "EUR": POST \/api\/currencies .*500/);
  });

  test("runs a collection's finisher right after the collection, and only for seeded collections", async () => {
    const order: string[] = [];
    const http = fakeHttp();
    const send = http.send;

    await seedDataset({
      http: {
        ...http,
        send: (method, path, options) => {
          order.push(path);
          return send(method, path, options);
        },
      },
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger: capture().logger,
      scope: scope(["currencies", "measures"]),
      finishers: {
        currencies: async () => {
          order.push("finish currencies");
        },
        pages: async () => {
          order.push("finish pages");
        },
      },
    });

    expect(order.indexOf("finish currencies")).toBe(DATASET.currencies.size);
    expect(order).not.toContain("finish pages");
  });

  test("warns about skipped modules on a partial run", async () => {
    const { logger, lines } = capture();

    await seedDataset({
      http: fakeHttp(),
      dataset: DATASET,
      placeholders: PLACEHOLDERS,
      logger,
      scope: scope([], ["pickupLocations"]),
    });

    expect(lines()).toContainEqual(
      expect.stringMatching(/WARN pickupLocations: module VirtoCommerce\.XPickup is not installed, skipped$/),
    );
  });
});
