/** The records of a collection, and what happened to them. */
export interface SeedCounts {
  /** The number of records in the collection. */
  readonly records: number;
  /** The number of records that were sent. */
  readonly sent: number;
  /** The number of records that the platform already stored and that were left as they were. */
  readonly existing: number;
}

/** The manifest is checked, and the collections are about to be seeded. */
export interface SeedStarted {
  /** The kind of the event. */
  readonly kind: "started";
  /** The collections to seed, in seed order. */
  readonly collections: readonly string[];
}

/** A collection is left out, because its module does not qualify or it has no records. */
export interface SeedSkipped {
  /** The kind of the event. */
  readonly kind: "skipped";
  /** The name of the collection. */
  readonly name: string;
  /** Why it is left out, such as `VirtoCommerce.XPickup is not installed` or `no records`. */
  readonly reason: string;
}

/** Every record of a collection is sent or already stored. */
export interface SeedSeeded {
  /** The kind of the event. */
  readonly kind: "seeded";
  /** The name of the collection. */
  readonly name: string;
  /** The records of the collection, and what happened to them. */
  readonly counts: SeedCounts;
  /** How long the collection took, in seconds. */
  readonly seconds: number;
}

/** The manifest is invalid, so no request is sent. */
export interface SeedManifestFailed {
  /** The kind of the event. */
  readonly kind: "failed";
  /** What failed. */
  readonly step: "manifest";
  /** How long the check took, in seconds. */
  readonly seconds: number;
}

/** A record or a request of a collection failed, or the finisher of a seeded collection failed. */
export interface SeedCollectionFailed {
  /** The kind of the event. */
  readonly kind: "failed";
  /** What failed: the records of the collection, or its finisher. */
  readonly step: "records" | "finisher";
  /** The name of the collection. */
  readonly name: string;
  /** The record or the request that failed, such as `record "product-1"` or `12 records`, where there is one. */
  readonly subject?: string;
  /** The counts reached before the failure. */
  readonly counts: SeedCounts;
  /** How long the step took until it failed, in seconds. */
  readonly seconds: number;
}

/** The run is over, after the last collection or after a failure. */
export interface SeedFinished {
  /** The kind of the event. */
  readonly kind: "finished";
  /** The number of collections that were seeded. */
  readonly seeded: number;
  /** The number of collections that were skipped. */
  readonly skipped: number;
  /** The number of failures: 0, or 1 for the failure that stopped the run. */
  readonly failed: number;
  /** The number of records that were sent. */
  readonly sent: number;
  /** The number of records that the platform already stored. */
  readonly existing: number;
  /** How long the run took, in seconds. */
  readonly seconds: number;
}

/**
 * A step of a seed run, as `onEvent` of {@link seedDataset} receives it. A run always ends with {@link SeedFinished}.
 */
export type SeedEvent =
  | SeedStarted
  | SeedSkipped
  | SeedSeeded
  | SeedManifestFailed
  | SeedCollectionFailed
  | SeedFinished;
