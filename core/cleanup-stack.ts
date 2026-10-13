import { Secret } from "./secret";

/** Undoes one change a test made, such as deleting a record it created. */
export type CleanupAction = () => Promise<unknown>;

/** Wraps the run of one cleanup action, for example in a named report step. */
export type CleanupRunner = (description: string, action: CleanupAction) => Promise<unknown>;

interface CleanupEntry {
  readonly description: string;
  readonly action: CleanupAction;
}

/**
 * Undo actions of a test, run in reverse order so dependants (a membership, a contact's user) go first.
 * Push the undo right before the change: if the change fails halfway, its undo still runs.
 * Tests get one as the `cleanup` fixture; `arrange` registers its own undos there.
 *
 * @example
 * cleanup.push(`delete organization ${organization.id}`, () => organizations.delete([organization.id]));
 * await organizations.create(organization);
 */
export class CleanupStack {
  readonly #entries: CleanupEntry[] = [];

  /**
   * Registers an undo action.
   *
   * @param description - What it undoes; shown as the report step name and in failure messages.
   */
  push(description: string, action: CleanupAction): void {
    this.#entries.push({ description, action });
  }

  /**
   * Runs and removes every action, last registered first; a failing action does not stop the rest.
   *
   * @param run - Wraps each action; by default calls it directly.
   * @throws Error `"<n> cleanup action(s) failed"` listing each failure, with secrets masked.
   */
  async unwind(run: CleanupRunner = (_description, action) => action()): Promise<void> {
    const failures: string[] = [];
    for (let entry = this.#entries.pop(); entry !== undefined; entry = this.#entries.pop()) {
      try {
        await run(entry.description, entry.action);
      } catch (error) {
        failures.push(`${entry.description}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(Secret.mask(`${failures.length} cleanup action(s) failed:\n${failures.join("\n")}`));
    }
  }
}
