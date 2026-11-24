/**
 * Determines whether the process runs on a continuous integration service.
 *
 * @remarks
 * CI services set the `CI` variable, such as `CI=true` on GitHub Actions. An empty value, `false` and `0` do not count,
 * so `CI=false` turns CI behavior off on a developer machine.
 *
 * @example
 * forbidOnly: isCi(),
 *
 * @param source - The variables to read. The default is `process.env`.
 * @returns `true` if `CI` is set to a value other than empty, `false` or `0`; otherwise, `false`.
 */
export function isCi(source: NodeJS.ProcessEnv = process.env): boolean {
  const value = source["CI"]?.trim().toLowerCase();
  return value !== undefined && value !== "" && value !== "false" && value !== "0";
}
