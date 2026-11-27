import { expect, test } from "@playwright/test";
import { object } from "zod";

import { booleanString, nonBlankString, parseEnv, positiveInt, secretString } from "@/core";

const SCHEMA = object({
  NAME: nonBlankString,
  WORKERS: positiveInt.default(2),
  HEADLESS: booleanString.default(true),
});

test.describe("parseEnv", () => {
  test("returns the parsed variables", () => {
    expect(parseEnv(SCHEMA, { NAME: "qa", WORKERS: "4", HEADLESS: "false" })).toEqual({
      NAME: "qa",
      WORKERS: 4,
      HEADLESS: false,
    });
  });

  test("applies defaults for missing variables", () => {
    expect(parseEnv(SCHEMA, { NAME: "qa" })).toEqual({ NAME: "qa", WORKERS: 2, HEADLESS: true });
  });

  test("treats an empty variable as unset, so its default applies", () => {
    expect(parseEnv(SCHEMA, { NAME: "qa", WORKERS: "", HEADLESS: "" })).toEqual({
      NAME: "qa",
      WORKERS: 2,
      HEADLESS: true,
    });
  });

  test("leaves out variables the schema does not name", () => {
    expect(parseEnv(SCHEMA, { NAME: "qa", PATH: "/usr/bin" })).not.toHaveProperty("PATH");
  });

  test("lists every invalid variable in one error", () => {
    const action = () => parseEnv(SCHEMA, { WORKERS: "many", HEADLESS: "yes" });

    expect(action).toThrow("Invalid environment variables:");
    expect(action).toThrow("→ at NAME");
    expect(action).toThrow("→ at WORKERS");
    expect(action).toThrow("→ at HEADLESS");
  });

  test("reports an empty required variable as missing", () => {
    expect(() => parseEnv(SCHEMA, { NAME: "" })).toThrow("→ at NAME");
  });

  test("keeps the values out of the error message", () => {
    const schema = object({ PASSWORD: secretString, WORKERS: positiveInt });

    const action = () => parseEnv(schema, { PASSWORD: "Pw1", WORKERS: "Env-Value-Leak-1" });

    expect(action).toThrow(expect.objectContaining({ message: expect.not.stringContaining("Pw1") }));
    expect(action).toThrow(expect.objectContaining({ message: expect.not.stringContaining("Env-Value-Leak-1") }));
  });

  test("reads process.env by default", () => {
    process.env["PARSE_ENV_PROBE"] = "from-process";

    try {
      expect(parseEnv(object({ PARSE_ENV_PROBE: nonBlankString }))).toEqual({ PARSE_ENV_PROBE: "from-process" });
    } finally {
      delete process.env["PARSE_ENV_PROBE"];
    }
  });
});
