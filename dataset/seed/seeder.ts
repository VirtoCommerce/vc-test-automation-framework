import type { HttpClient } from "@api/http/http-client";
import type { Logger } from "@core/logger";
import type { Dataset } from "../dataset";
import type { CollectionName } from "../manifest";
import type { EnvPlaceholders } from "../placeholders";
import type { SeedScope } from "./seed-scope";

import { Secret } from "@core/secret";

import { MANIFEST } from "../manifest";
import { findPathOf, labelOf, seedRequests } from "./seed-requests";

/** What the seeder sends requests with: an HTTP client signed in as a platform administrator. */
export type SeedHttp = Pick<HttpClient, "get" | "send">;

/** Work that must follow the seeding of a collection, such as setting the status of the pages just seeded. */
export type SeedFinisher = () => Promise<void>;

/** Everything one seed run needs. */
export interface SeedRun {
  readonly http: SeedHttp;
  readonly dataset: Dataset;
  /** Values for `${ENV:…}` in the manifest's paths. */
  readonly placeholders: EnvPlaceholders;
  readonly logger: Logger;
  /** The collections to seed, from {@link resolveSeedScope}. */
  readonly scope: SeedScope;
  /** Work to run right after a collection is seeded, by collection; skipped with its collection. */
  readonly finishers?: Partial<Readonly<Record<CollectionName, SeedFinisher>>>;
}

/** What a seed run did. */
export interface SeedSummary {
  /** The collections seeded, in seed order. */
  readonly collections: readonly CollectionName[];
  /** How many requests stored records. */
  readonly sent: number;
  /** How many records were found already stored and left as they are. */
  readonly existing: number;
}

/**
 * Seeds the dataset into the platform, collection by collection in manifest order (see {@link seedRequests}),
 * running each collection's finisher right after it.
 *
 * - With a `find` path, a record the platform already has is left as it is (the platform refuses duplicates).
 * - A failed request stops the run, including `200` answers with `succeeded: false` (refused user or role).
 * - Collections without records are skipped with a warning; so are those whose module is not installed or not
 *   in the collection's version range.
 *
 * @throws Error naming the collection and the record when a request fails; known secret values are masked.
 */
export async function seedDataset(run: SeedRun): Promise<SeedSummary> {
  const { dataset, logger, scope } = run;
  const startedAt = Date.now();
  for (const { name, reason } of scope.skipped) {
    logger.warn(`${name}: ${reason}, skipped`);
  }
  logger.info(`seeding ${scope.collections.length} collections: ${scope.collections.join(", ")}`);

  let sent = 0;
  let existing = 0;
  const seeded: CollectionName[] = [];
  for (const name of scope.collections) {
    const records: readonly object[] = dataset[name].all();
    if (records.length === 0) {
      logger.warn(`${name}: no records, skipped`);
      continue;
    }
    const collectionStartedAt = Date.now();
    const result = await seedCollection(run, name, records);
    sent += result.sent;
    existing += result.existing;
    seeded.push(name);
    logger.success(
      `${name}: ${records.length} records, ${result.sent} sent, ${result.existing} already stored ` +
        `in ${seconds(collectionStartedAt)}`,
    );
    await run.finishers?.[name]?.();
  }
  logger.success(
    `seeded ${seeded.length} collections: ${sent} sent, ${existing} already stored in ${seconds(startedAt)}`,
  );
  return { collections: seeded, sent, existing };
}

async function seedCollection(
  { http, placeholders }: SeedRun,
  name: CollectionName,
  records: readonly object[],
): Promise<{ readonly sent: number; readonly existing: number }> {
  const spec = MANIFEST[name];
  let sent = 0;
  let existing = 0;
  const missing: object[] = [];
  for (const [index, record] of records.entries()) {
    const findPath = spec.send === "all" ? findPathOf(spec, record, placeholders) : undefined;
    try {
      if (findPath !== undefined && (await isStored(http, findPath))) {
        existing += 1;
      } else {
        missing.push(record);
      }
    } catch (error) {
      throw failure(name, labelOf(spec, record, index), error);
    }
  }
  for (const request of seedRequests(spec, missing, placeholders)) {
    try {
      if (request.findPath !== undefined && (await isStored(http, request.findPath))) {
        existing += 1;
        continue;
      }
      const eTag = request.ifMatchPath === undefined ? undefined : await currentETag(http, request.ifMatchPath);
      const headers = eTag === undefined ? {} : { "If-Match": eTag };
      expectAccepted(await http.send(spec.method, request.path, { json: request.body, headers }));
      sent += 1;
    } catch (error) {
      throw failure(name, request.label, error);
    }
  }
  return { sent, existing };
}

async function currentETag(http: SeedHttp, path: string): Promise<string | undefined> {
  return (await http.get(path)).expectOk().headers["etag"];
}

async function isStored(http: SeedHttp, findPath: string): Promise<boolean> {
  return (await http.get(findPath)).optionalJson({ allow404: true }) !== undefined;
}

function expectAccepted(response: Awaited<ReturnType<SeedHttp["send"]>>): void {
  response.expectOk();
  if (!response.headers["content-type"]?.includes("json")) {
    return;
  }
  const body = response.optionalJson();
  if (typeof body === "object" && body !== null && "succeeded" in body && body.succeeded === false) {
    const errors = "errors" in body ? JSON.stringify(body.errors) : "no errors given";
    throw new Error(`${response.method} ${response.url} answered ${response.status} but refused: ${errors}`);
  }
}

function failure(name: CollectionName, label: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(Secret.mask(`${name} ${label}: ${message}`), { cause: error });
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}
