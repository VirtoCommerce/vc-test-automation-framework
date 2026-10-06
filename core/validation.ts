import type { output, ZodType } from "zod";

import { prettifyError, string } from "zod";

export const nonEmptyString = string().min(1);

export function parseOrThrow<S extends ZodType>(schema: S, value: unknown, label: string): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label}:\n${prettifyError(result.error)}`);
  }
  return result.data;
}
