import type { HttpClient } from "@/http";
import type { InstalledModules } from "@/modules";
import type { Collection } from "./collection.ts";
import type { CollectionName, Manifest } from "./manifest.ts";
import type { PlaceholderValues } from "./placeholders.ts";
import type { Progress } from "./seed-collection.ts";
import type { SeedCollectionFailed, SeedCounts, SeedEvent, SeedFinished } from "./seed-events.ts";
import type { SeedScope, SkippedCollection } from "./seed-scope.ts";

import { errorMessage, maskSecrets } from "@/core";

import { attempt, seedCollection } from "./seed-collection.ts";
import { checkSpec, labeled, pathResolver } from "./seed-requests.ts";
import { resolveSeedScope } from "./seed-scope.ts";

/** Work that follows the seeding of a collection, such as setting the status of the pages just seeded. */
export type SeedFinisher = () => Promise<void>;

/** A dataset as the seeder reads it: the records of each collection of a manifest. */
export type SeedableDataset<TManifest extends Manifest> = {
  readonly [Name in CollectionName<TManifest>]: Collection<object>;
};

/** The options of {@link seedDataset}. */
export interface SeedRun<TManifest extends Manifest> {
  /** The client that sends the seed requests, signed in as a platform administrator. */
  readonly http: HttpClient;
  /** The collections, in seed order, and how each one is sent. */
  readonly manifest: TManifest;
  /** The records to seed. */
  readonly dataset: SeedableDataset<TManifest>;
  /** The modules installed on the platform. A collection whose module does not qualify is skipped. */
  readonly installed: InstalledModules;
  /** The collections to seed, in any order, or `undefined` for every collection. */
  readonly only?: readonly CollectionName<TManifest>[] | undefined;
  /** The values of the `${ENV:key}` placeholders in the paths of the manifest. */
  readonly placeholders?: PlaceholderValues | undefined;
  /** Work to run right after a collection is seeded, by collection. It is skipped with its collection. */
  readonly finishers?: Partial<Readonly<Record<CollectionName<TManifest>, SeedFinisher>>> | undefined;
  /**
   * Receives each step of the run, such as a seeded or a skipped collection. The default discards them. An error that
   * it throws stops the run; it does not replace the failure that it reports.
   */
  readonly onEvent?: ((event: SeedEvent) => void) | undefined;
}

/** The result of {@link seedDataset}. */
export interface SeedSummary<TManifest extends Manifest> {
  /** The collections that were seeded, in seed order. */
  readonly collections: readonly CollectionName<TManifest>[];
  /** The selected collections whose module does not qualify or that have no records, in seed order. */
  readonly skipped: readonly SkippedCollection<TManifest>[];
  /** The number of records that were sent. */
  readonly sent: number;
  /** The number of records that the platform already stored and that were left as they were. */
  readonly existing: number;
}

interface Totals<TManifest extends Manifest> {
  readonly seeded: CollectionName<TManifest>[];
  readonly progress: Progress[];
  skipped: readonly SkippedCollection<TManifest>[];
}

type Notify = (event: SeedEvent) => void;

/**
 * Seeds a dataset into the platform, collection by collection in the order of the manifest.
 *
 * @remarks
 * - The run covers every collection, or the ones in `only`, except those whose module is not installed or not in its
 *   range of versions. Collections without records are skipped too.
 * - The manifest entries of the collections in the run are checked before the first request. A collection sent in one
 *   request cannot have a `parentField` or `${RECORD:field}` placeholders in its `path` and `ifMatchPath`.
 * - A record that the `findPath` of its collection finds is left as it is.
 * - The finisher of a collection runs right after the collection.
 * - The first failure stops the run. A success status with `succeeded: false` in the body also counts as a failure,
 *   because some endpoints refuse a record that way.
 * - `onEvent` receives each step, as a {@link SeedEvent}; a failure is reported before it is thrown, and the run
 *   always ends with a `finished` event.
 *
 * @param run - The client, the manifest, the dataset, the installed modules and the options.
 * @returns What the run seeded and skipped.
 * @throws {Error} A manifest entry is invalid, the installed version of a module cannot be compared with its range, a
 * record cannot be sent, a request fails, a finisher fails, or `onEvent` fails. The message names the collection and,
 * where there is one, the record, and has secrets masked. The cause is the original error.
 * @throws {AggregateError} The run failed, and `onEvent` failed too while it reported the failure. The errors are the
 * failure of the run, then the failure of `onEvent`.
 */
export async function seedDataset<TManifest extends Manifest>(
  run: SeedRun<TManifest>,
): Promise<SeedSummary<TManifest>> {
  const notify = notifier(run.onEvent);
  const startedAt = Date.now();
  const totals: Totals<TManifest> = { seeded: [], progress: [], skipped: [] };
  function finished(failed: number): SeedFinished {
    return {
      kind: "finished",
      seeded: totals.seeded.length,
      skipped: totals.skipped.length,
      failed,
      sent: sum(totals.progress, "sent"),
      existing: sum(totals.progress, "existing"),
      seconds: secondsSince(startedAt),
    };
  }
  try {
    const scope = await reported(
      notify,
      () => ({ kind: "failed", step: "manifest", seconds: secondsSince(startedAt) }),
      () => scopeOf(run),
    );
    totals.skipped = scope.skipped;
    await seedScope(run, scope, notify, totals);
  } catch (error) {
    throw withListenerFailure(error, () => notify(finished(1)));
  }
  notify(finished(0));
  return {
    collections: totals.seeded,
    skipped: totals.skipped,
    sent: sum(totals.progress, "sent"),
    existing: sum(totals.progress, "existing"),
  };
}

function scopeOf<TManifest extends Manifest>(run: SeedRun<TManifest>): SeedScope<TManifest> {
  const scope = resolveSeedScope(run.manifest, run.installed, (name) => run.dataset[name].count, run.only);
  for (const [name, spec] of scope.collections) {
    checkSpec(name, spec);
  }
  return scope;
}

async function seedScope<TManifest extends Manifest>(
  run: SeedRun<TManifest>,
  scope: SeedScope<TManifest>,
  notify: Notify,
  totals: Totals<TManifest>,
): Promise<void> {
  for (const { name, reason } of scope.skipped) {
    notify({ kind: "skipped", name, reason });
  }
  notify({ kind: "started", collections: scope.collections.map(([name]) => name) });
  const values = run.placeholders ?? {};
  const resolve = pathResolver(values);
  for (const [name, spec] of scope.collections) {
    const records = run.dataset[name].all();
    const collectionStartedAt = Date.now();
    const progress: Progress = { sent: 0, existing: 0, subject: undefined };
    totals.progress.push(progress);
    const collection = { http: run.http, name, spec, values, resolve, progress };
    await reported(
      notify,
      () =>
        collectionFailed(name, "records", countsOf(records.length, progress), collectionStartedAt, progress.subject),
      () => seedCollection(collection, labeled(spec, records)),
    );
    totals.seeded.push(name);
    const counts = countsOf(records.length, progress);
    notify({ kind: "seeded", name, counts, seconds: secondsSince(collectionStartedAt) });
    const finisher = run.finishers?.[name];
    if (finisher !== undefined) {
      const finisherStartedAt = Date.now();
      await reported(
        notify,
        () => collectionFailed(name, "finisher", counts, finisherStartedAt),
        () => attempt(name, "finisher", finisher),
      );
    }
  }
}

async function reported<T>(notify: Notify, failed: () => SeedEvent, work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw withListenerFailure(error, () => notify(failed()));
  }
}

function notifier(onEvent: ((event: SeedEvent) => void) | undefined): Notify {
  return function notify(event: SeedEvent): void {
    try {
      onEvent?.(event);
    } catch (error) {
      throw new Error(`The seed event listener failed on a ${event.kind} event: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  };
}

function withListenerFailure(error: unknown, report: () => void): unknown {
  try {
    report();
    return error;
  } catch (listenerError) {
    return new AggregateError(
      [error, listenerError],
      maskSecrets(`${errorMessage(error)}; ${errorMessage(listenerError)}`),
    );
  }
}

function collectionFailed(
  name: string,
  step: SeedCollectionFailed["step"],
  counts: SeedCounts,
  startedAt: number,
  subject?: string,
): SeedCollectionFailed {
  return {
    kind: "failed",
    step,
    name,
    ...(subject === undefined ? {} : { subject }),
    counts,
    seconds: secondsSince(startedAt),
  };
}

function countsOf(records: number, progress: Progress): SeedCounts {
  return { records, sent: progress.sent, existing: progress.existing };
}

function sum(progress: readonly Progress[], field: "sent" | "existing"): number {
  return progress.reduce((total, entry) => total + entry[field], 0);
}

function secondsSince(startedAt: number): number {
  return (Date.now() - startedAt) / 1000;
}
