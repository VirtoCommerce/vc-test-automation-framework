import type { output, ZodType } from "zod";

import { prettifyError } from "zod";

/**
 * Parses environment variables with a schema.
 *
 * @remarks
 * An empty variable counts as unset, so the schema's default applies to it.
 *
 * @param schema - The schema that describes the variables.
 * @param source - The variables to parse. The default is `process.env`.
 * @returns The parsed variables.
 * @throws {Error} One or more variables are invalid. The message lists each one and does not contain the values.
 */
export function parseEnv<S extends ZodType>(schema: S, source: NodeJS.ProcessEnv = process.env): output<S> {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]: [string, string | undefined]) => value !== undefined && value !== ""),
  );
  const result = schema.safeParse(present);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${prettifyError(result.error)}`);
  }
  return result.data;
}
