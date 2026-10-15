import type { InstalledModules } from "@core/modules";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { record, string } from "zod";

import { parseOrThrow } from "@core/validation";

/** Where the `modules` setup project leaves the platform's installed modules for the rest of the run. */
const INSTALLED_MODULES_FILE = "test-results/installed-modules.json";

/** Saves the installed modules for this run; called once, by the `modules` setup project. */
export async function saveInstalledModules(installed: InstalledModules): Promise<void> {
  await mkdir(dirname(INSTALLED_MODULES_FILE), { recursive: true });
  await writeFile(INSTALLED_MODULES_FILE, JSON.stringify(Object.fromEntries(installed), null, 2));
}

/**
 * Reads the installed modules the `modules` setup project saved at the start of this run.
 *
 * @throws Error when the file is missing: the run's project does not depend on the `modules` setup project.
 */
export async function loadInstalledModules(): Promise<InstalledModules> {
  const text = await readFile(INSTALLED_MODULES_FILE, "utf8").catch((error: unknown) => {
    throw new Error(
      `${INSTALLED_MODULES_FILE} is missing: the project must depend on the "modules" setup project, which reads ` +
        "the installed modules once per run",
      { cause: error },
    );
  });
  return new Map(Object.entries(parseOrThrow(record(string(), string()), JSON.parse(text), INSTALLED_MODULES_FILE)));
}
