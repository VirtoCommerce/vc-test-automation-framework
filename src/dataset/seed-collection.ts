import type { HttpClient, HttpResponse } from "@/http";
import type { CollectionSpec } from "./manifest.ts";
import type { PlaceholderValues } from "./placeholders.ts";
import type { LabeledRecord, PathResolver, SeedRequest } from "./seed-requests.ts";

import { array, looseObject, object, string, unknown } from "zod";

import { errorMessage, maskSecrets } from "@/core";

import { fieldOf, parentsFirst, requestOf, storedIdSearchOf } from "./seed-requests.ts";

const storedSearchSchema = object({ results: array(looseObject({ id: string().nullish() })).default([]) });

/** How far the seeding of a collection got: the records sent and stored so far, and the one in progress. */
export interface Progress {
  /** The number of records that were sent. */
  sent: number;
  /** The number of records that the platform already stored. */
  existing: number;
  /** The record or the request in progress, such as `record "product-1"` or `12 records`. */
  subject: string | undefined;
}

/** A collection to seed, with what its requests need. */
export interface CollectionRun {
  /** The client that sends the requests. */
  readonly http: HttpClient;
  /** The name of the collection. */
  readonly name: string;
  /** The manifest entry of the collection. */
  readonly spec: CollectionSpec;
  /** The values of the `${ENV:key}` placeholders. */
  readonly values: PlaceholderValues;
  /** Fills the placeholders of a path. */
  readonly resolve: PathResolver;
  /** Updated as the records are seeded. */
  readonly progress: Progress;
}

/**
 * Seeds the records of one collection, with one request for each record or one request with every record.
 *
 * @remarks
 * A record that the `findPath` of the collection finds is left as it is. The progress is updated as the records are
 * seeded, so it shows how far the collection got when it fails.
 *
 * @param run - The collection, the client and the progress to update.
 * @param entries - The records with their labels, in file order.
 * @throws {Error} A record cannot be sent, or a request fails. The message names the collection and the record, and
 * has secrets masked. The cause is the original error.
 */
export async function seedCollection(run: CollectionRun, entries: readonly LabeledRecord[]): Promise<void> {
  return run.spec.send === "all" ? seedBatch(run, entries) : seedEach(run, entries);
}

/**
 * Runs a step of a seed run, and names the collection and the subject of the step in its error.
 *
 * @param name - The name of the collection.
 * @param label - The subject of the step, such as `record "product-1"` or `finisher`, or `undefined` for the
 * collection.
 * @param work - The step.
 * @returns What the step returns.
 * @throws {Error} The step fails. The message starts with the collection and the subject, and has secrets masked. The
 * cause is the original error.
 */
export async function attempt<T>(name: string, label: string | undefined, work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const subject = label === undefined ? name : `${name} ${label}`;
    throw new Error(maskSecrets(`${subject}: ${errorMessage(error)}`), { cause: error });
  }
}

async function seedEach(run: CollectionRun, entries: readonly LabeledRecord[]): Promise<void> {
  const { http, name, spec, resolve, progress } = run;
  const parentField = spec.parentField;
  const ordered = await attempt(name, undefined, () =>
    parentField === undefined ? entries : parentsFirst(entries, parentField),
  );
  for (const { record, label } of ordered) {
    progress.subject = label;
    await attempt(name, label, async () => {
      if (await isFound(run, record)) {
        progress.existing += 1;
        return;
      }
      const body = await withStoredId(run, record);
      await send(http, spec, requestOf(spec, resolve, body, body));
      progress.sent += 1;
    });
  }
}

async function seedBatch(run: CollectionRun, entries: readonly LabeledRecord[]): Promise<void> {
  const { http, name, spec, resolve, progress } = run;
  const toSend: object[] = [];
  for (const { record, label } of entries) {
    progress.subject = label;
    await attempt(name, label, async () => {
      if (await isFound(run, record)) {
        progress.existing += 1;
      } else {
        toSend.push(await withStoredId(run, record));
      }
    });
  }
  if (toSend.length > 0) {
    const subject = `${toSend.length} records`;
    progress.subject = subject;
    await attempt(name, subject, () => send(http, spec, requestOf(spec, resolve, toSend)));
    progress.sent = toSend.length;
  }
}

async function isFound({ http, spec, resolve }: CollectionRun, record: object): Promise<boolean> {
  if (spec.findPath === undefined) {
    return false;
  }
  const response = await http.get(resolve(spec.findPath, record));
  const body = response.parseOptional(unknown(), { allow404: true });
  return body !== undefined && !(Array.isArray(body) && body.length === 0);
}

async function withStoredId({ http, spec, values }: CollectionRun, record: object): Promise<object> {
  const search = storedIdSearchOf(spec, record, values);
  if (search === undefined) {
    return record;
  }
  const { results } = (await http.post(search.path, { json: search.criteria })).parse(storedSearchSchema);
  const wanted = fieldOf(record, search.match);
  const stored = results.find((result) => typeof result.id === "string" && result[search.match] === wanted);
  return stored === undefined ? record : { ...record, id: stored.id };
}

async function send(http: HttpClient, spec: CollectionSpec, request: SeedRequest): Promise<void> {
  const eTag = request.ifMatchPath === undefined ? undefined : await currentETag(http, request.ifMatchPath);
  const headers = eTag === undefined ? {} : { "if-match": eTag };
  expectAccepted(await http.send(spec.method, request.path, { json: request.body, headers }));
}

async function currentETag(http: HttpClient, path: string): Promise<string | undefined> {
  const response = await http.get(path);
  return response.status === 404 ? undefined : response.expectOk().headers["etag"];
}

function expectAccepted(response: HttpResponse): void {
  response.expectOk();
  if (response.text === "" || !(response.headers["content-type"] ?? "").includes("json")) {
    return;
  }
  const body: unknown = response.json();
  if (typeof body === "object" && body !== null && Reflect.get(body, "succeeded") === false) {
    throw response.toError("the platform refused the record");
  }
}
