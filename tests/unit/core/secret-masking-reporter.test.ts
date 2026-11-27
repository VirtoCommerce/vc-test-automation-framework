import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { MASKED, Secret, SecretMaskingReporter } from "@/core";

const VALUE = 'masking-Pa"ssword-42';

test.describe("SecretMaskingReporter", () => {
  let dir: string;

  test.beforeAll(() => {
    Secret.of(VALUE);
  });

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "secret-masking-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("masks a secret in a step title of an Allure result, where it is JSON-escaped", () => {
    const result = join(dir, "a-result.json");
    writeFileSync(result, JSON.stringify({ steps: [{ name: `Fill "${VALUE}" getByTestId('login-password')` }] }));

    new SecretMaskingReporter({ dirs: [dir] }).onEnd();

    const text = readFileSync(result, "utf8");
    expect(text).not.toContain(JSON.stringify(VALUE).slice(1, -1));
    expect(JSON.parse(text)).toEqual({ steps: [{ name: `Fill "${MASKED}" getByTestId('login-password')` }] });
  });

  test("masks text files in nested directories and leaves binary files as they are", () => {
    mkdirSync(join(dir, "nested"));
    const context = join(dir, "nested", "error-context.md");
    const screenshot = join(dir, "nested", "test-failed-1.png");
    writeFileSync(context, `typed ${VALUE}`);
    writeFileSync(screenshot, `png ${VALUE}`);

    new SecretMaskingReporter({ dirs: [dir] }).onEnd();

    expect(readFileSync(context, "utf8")).toBe(`typed ${MASKED}`);
    expect(readFileSync(screenshot, "utf8")).toBe(`png ${VALUE}`);
  });

  test("masks the output directories of the projects", () => {
    const outputDir = join(dir, "test-results");
    mkdirSync(outputDir);
    const context = join(outputDir, "error-context.md");
    writeFileSync(context, `typed ${VALUE}`);
    const reporter = new SecretMaskingReporter({ dirs: [] });

    reporter.onBegin({ projects: [{ outputDir }] });
    reporter.onEnd();

    expect(readFileSync(context, "utf8")).toBe(`typed ${MASKED}`);
  });

  test("leaves a file without secrets untouched", () => {
    const result = join(dir, "b-result.json");
    writeFileSync(result, '{"name":"plain"}');

    new SecretMaskingReporter({ dirs: [dir] }).onEnd();

    expect(readFileSync(result, "utf8")).toBe('{"name":"plain"}');
  });

  test("ignores a directory that does not exist", () => {
    expect(() => new SecretMaskingReporter({ dirs: [join(dir, "missing")] }).onEnd()).not.toThrow();
  });

  test("writes nothing to the console", () => {
    expect(new SecretMaskingReporter({ dirs: [] }).printsToStdio()).toBe(false);
  });
});
