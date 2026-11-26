import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export function isInteractive(switches, stdin = process.stdin, stdout = process.stdout) {
  return Boolean(stdin.isTTY) && Boolean(stdout.isTTY) && !switches.has("--yes");
}

class MutableOutput extends Writable {
  #target;
  muted = false;

  constructor(target) {
    super();
    this.#target = target;
  }

  get columns() {
    return this.#target.columns;
  }

  get rows() {
    return this.#target.rows;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) {
      this.#target.write(chunk, encoding);
    }
    callback();
  }
}

export function createPrompter(input = process.stdin, output = process.stdout) {
  const sink = new MutableOutput(output);
  const lines = createInterface({ input, output: sink, terminal: true, historySize: 0 });
  let pending;
  lines.on("SIGINT", () => {
    pending?.abort();
  });

  async function question(text, secret) {
    const controller = new AbortController();
    pending = controller;
    sink.muted = false;
    const answer = lines.question(text, { signal: controller.signal });
    sink.muted = secret;
    try {
      return await answer;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("cancelled");
      }
      throw error;
    } finally {
      pending = undefined;
      if (sink.muted) {
        sink.muted = false;
        output.write("\n");
      }
    }
  }

  return {
    async ask(text, fallback) {
      const shown = fallback === undefined || fallback === "" ? `${text}: ` : `${text} [${fallback}]: `;
      const answer = (await question(shown, false)).trim();
      return answer === "" && fallback !== undefined ? fallback : answer;
    },
    async askSecret(text) {
      return question(`${text}: `, true);
    },
    async confirm(text) {
      const answer = (await question(`${text} [y/N]: `, false)).trim().toLowerCase();
      return answer === "y" || answer === "yes";
    },
    close() {
      lines.close();
    },
  };
}
