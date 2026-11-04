import type { WithRequired } from "./required-fields";

/**
 * What a record of one model must have: the fields callers rely on, and the name errors use. Build one per model
 * with {@link shape}; `HttpResponse#record` and its siblings check a response against it.
 */
export interface RecordShape<Data extends object, Field extends keyof Data> {
  /** Names the model in errors, such as `Pricelist`. */
  readonly label: string;
  /** The fields that must be present: not `undefined`, `null` or `""`. */
  readonly fields: readonly Field[];
}

/** The record type a shape guarantees: its data type with the shape's fields required. */
export type Shaped<S> = S extends RecordShape<infer Data, infer Field> ? WithRequired<Data, Field> : never;

/**
 * Builds the shape of a model. Called in two steps so the data type is given and the fields are inferred.
 *
 * @example
 * export const PRICELIST = shape<PricelistData>()("Pricelist", ["id", "name", "currency"]);
 * export type Pricelist = Shaped<typeof PRICELIST>;
 */
export function shape<Data extends object>(): <const Field extends keyof Data>(
  label: string,
  fields: readonly Field[],
) => RecordShape<Data, Field> {
  return function withFields<const Field extends keyof Data>(
    label: string,
    fields: readonly Field[],
  ): RecordShape<Data, Field> {
    return { label, fields };
  };
}
