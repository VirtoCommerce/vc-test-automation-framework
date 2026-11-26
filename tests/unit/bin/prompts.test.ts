import { PassThrough } from "node:stream";

import { expect, test } from "@playwright/test";

import { createPrompter, isInteractive } from "../../../bin/lib/prompts.mjs";

function streams() {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk: Buffer) => {
    written += chunk.toString();
  });
  return {
    input: input as unknown as typeof process.stdin,
    output: output as unknown as typeof process.stdout,
    write: (text: string) => input.write(text),
    written: () => written,
  };
}

test.describe("isInteractive", () => {
  const ttyIn = { isTTY: true } as unknown as typeof process.stdin;
  const ttyOut = { isTTY: true } as unknown as typeof process.stdout;
  const pipeIn = { isTTY: false } as unknown as typeof process.stdin;
  const pipeOut = { isTTY: false } as unknown as typeof process.stdout;

  test("is true only for a terminal on both ends and no --yes", () => {
    expect(isInteractive(new Set(), ttyIn, ttyOut)).toBe(true);
    expect(isInteractive(new Set(["--yes"]), ttyIn, ttyOut)).toBe(false);
    expect(isInteractive(new Set(), pipeIn, ttyOut)).toBe(false);
    expect(isInteractive(new Set(), ttyIn, pipeOut)).toBe(false);
  });
});

test.describe("createPrompter", () => {
  test("asks with the default in brackets and returns it for a blank answer", async () => {
    const io = streams();
    const prompter = createPrompter(io.input, io.output);

    const answer = prompter.ask("Administrator login", "admin");
    io.write("\n");
    expect(await answer).toBe("admin");

    const typed = prompter.ask("Store id");
    io.write("  Store  \n");
    expect(await typed).toBe("Store");
    prompter.close();

    expect(io.written()).toContain("Administrator login [admin]: ");
  });

  test("does not echo a secret", async () => {
    const io = streams();
    const prompter = createPrompter(io.input, io.output);

    const answer = prompter.askSecret("Administrator password");
    io.write("hidden-value\n");
    expect(await answer).toBe("hidden-value");
    prompter.close();

    expect(io.written()).toContain("Administrator password: ");
    expect(io.written()).not.toContain("hidden-value");
  });

  test("confirms with y or yes", async () => {
    const io = streams();
    const prompter = createPrompter(io.input, io.output);

    const yes = prompter.confirm("Set VERIFY_SSL=false?");
    io.write("Y\n");
    expect(await yes).toBe(true);
    const no = prompter.confirm("Again?");
    io.write("\n");
    expect(await no).toBe(false);
    prompter.close();
  });

  test("rejects with cancelled on Ctrl+C", async () => {
    const io = streams();
    const prompter = createPrompter(io.input, io.output);

    const answer = prompter.askSecret("Administrator password");
    io.write("par");
    io.write("\u0003");
    await expect(answer).rejects.toThrow(/^cancelled$/);
    prompter.close();
  });
});
