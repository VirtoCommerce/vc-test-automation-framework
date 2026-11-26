import type { Reporter } from "@playwright/test/reporter";

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import { maskSecrets } from "./secret.ts";

/** The options of {@link SecretMaskingReporter}. */
export interface SecretMaskingReporterOptions {
  /** The directories whose text files are masked, such as the Allure results directory. */
  readonly dirs: readonly string[];
}

const TEXT_EXTENSIONS = new Set([".json", ".txt", ".log", ".md", ".html", ".xml", ".csv", ".yaml", ".yml"]);

/**
 * Represents a Playwright reporter that masks registered secrets in the text files that the other reporters and the
 * test runner write, such as a password in the title of a `locator.fill` step.
 *
 * @remarks
 * - It masks when the run ends, after the reporters listed before it have finished writing, so it is listed last.
 *   Playwright also ends an interrupted run; a run that is killed leaves its files unmasked.
 * - It masks the given directories and the output directory of each project, where Playwright keeps the error context
 *   of a failed test.
 * - Binary files, such as screenshots, videos and traces, are not masked: a trace keeps the values that a test types.
 * - It knows the secrets registered in the main process of the run, such as those of the environment that the
 *   Playwright config parses, but not the secrets that a test creates in its worker.
 * - {@link defaultReporters} adds it after the Allure reporter. Playwright loads it by the path of this module, through
 *   its default export.
 */
export default class SecretMaskingReporter implements Reporter {
  readonly #dirs: string[];

  /**
   * Creates the reporter.
   *
   * @param options - The directories to mask besides the output directories of the projects.
   */
  constructor(options: SecretMaskingReporterOptions) {
    this.#dirs = [...options.dirs];
  }

  /**
   * Adds the output directory of each project to the directories to mask.
   *
   * @param config - The configuration of the run.
   */
  onBegin(config: { readonly projects: readonly { readonly outputDir: string }[] }): void {
    this.#dirs.push(...config.projects.map((project) => project.outputDir));
  }

  /** Masks the registered secrets in the text files of the directories. */
  onEnd(): void {
    for (const dir of new Set(this.#dirs)) {
      maskDirectory(dir);
    }
  }

  /**
   * Tells Playwright that the reporter writes nothing to the console.
   *
   * @returns `false`.
   */
  printsToStdio(): boolean {
    return false;
  }
}

function maskDirectory(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      maskDirectory(path);
    } else if (TEXT_EXTENSIONS.has(extname(name).toLowerCase())) {
      maskFile(path);
    }
  }
}

function maskFile(path: string): void {
  const text = readFileSync(path, "utf8");
  const masked = maskSecrets(text);
  if (masked !== text) {
    writeFileSync(path, masked);
  }
}
