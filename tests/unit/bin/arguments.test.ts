import { expect, test } from "@playwright/test";

import { parseArguments, SWITCHES, VALUE_FLAGS } from "../../../bin/lib/arguments.mjs";

const USAGE = "the usage line";

function parse(...args: string[]) {
  return parseArguments(args, USAGE);
}

test.describe("parseArguments", () => {
  test("reads the directory, a switch and a value flag of init", () => {
    const parsed = parse("init", "tests-suite", "--yes", "--backend-url", "http://x");

    expect(parsed.command).toBe("init");
    expect(parsed.positional).toEqual(["tests-suite"]);
    expect([...parsed.switches]).toEqual(["--yes"]);
    expect(parsed.values).toEqual({ "--backend-url": "http://x" });
  });

  test("reads a value flag written with an equals sign", () => {
    expect(parse("init", "--tracker=jira").values).toEqual({ "--tracker": "jira" });
  });

  test("keeps the flags apart in any order", () => {
    const parsed = parse("init", "--customer", "a@b.c", "--skip-install", "--force-ours", "--store-id=Store");

    expect(parsed.positional).toEqual([]);
    expect([...parsed.switches].sort()).toEqual(["--force-ours", "--skip-install"]);
    expect(parsed.values).toEqual({ "--customer": "a@b.c", "--store-id": "Store" });
  });

  test("accepts every value flag and every switch of init", () => {
    const flags = VALUE_FLAGS.flatMap((flag: string) => [flag, "v"]);
    const parsed = parse("init", ...SWITCHES.init, ...flags);

    expect(Object.keys(parsed.values).sort()).toEqual([...VALUE_FLAGS].sort());
    expect([...parsed.switches].sort()).toEqual([...SWITCHES.init].sort());
  });

  test("has no switch that removes a customer", () => {
    expect(() => parse("init", "--no-other-customer")).toThrow(USAGE);
    expect(() => parse("init", "--no-customer")).toThrow(USAGE);
  });

  test("refuses a value flag without a value", () => {
    expect(() => parse("init", "--backend-url")).toThrow(USAGE);
    expect(() => parse("init", "--backend-url", "--yes")).toThrow(USAGE);
    expect(() => parse("init", "--backend-url=")).toThrow(USAGE);
  });

  test("refuses a password flag, since no flag carries one", () => {
    expect(() => parse("init", "--admin-password", "x")).toThrow(USAGE);
    expect(() => parse("init", "--password=x")).toThrow(USAGE);
  });

  test("refuses an unknown flag and a second directory", () => {
    expect(() => parse("init", "--nope")).toThrow(USAGE);
    expect(() => parse("init", "one", "two")).toThrow(USAGE);
  });

  test("refuses a switch given a value", () => {
    expect(() => parse("init", "--yes=1")).toThrow(USAGE);
  });

  test("refuses the init switches and every value flag outside init", () => {
    expect(() => parse("uninstall", "--yes")).toThrow(USAGE);
    expect(() => parse("doctor", "--yes")).toThrow(USAGE);
    expect(() => parse("--yes")).toThrow(USAGE);
    expect(() => parse("--backend-url", "http://x")).toThrow(USAGE);
    expect(() => parse("doctor", "--backend-url", "http://x")).toThrow(USAGE);
  });

  test("refuses a directory outside init", () => {
    expect(() => parse("somewhere")).toThrow(USAGE);
    expect(() => parse("doctor", "somewhere")).toThrow(USAGE);
  });

  test("routes doctor and uninstall", () => {
    expect(parse("doctor")).toMatchObject({ command: "doctor", positional: [] });
    expect(parse("doctor", "--skip-verify").switches.has("--skip-verify")).toBe(true);
    expect(parse("uninstall").command).toBe("uninstall");
  });

  test("makes install the command when there is none", () => {
    expect(parse().command).toBe("install");
    const parsed = parse("--force-ours");

    expect(parsed.command).toBe("install");
    expect([...parsed.switches]).toEqual(["--force-ours"]);
    expect(parsed.values).toEqual({});
  });
});
