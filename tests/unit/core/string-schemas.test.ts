import type { ZodType } from "zod";

import { expect, test } from "@playwright/test";

import {
  absoluteUrl,
  booleanString,
  maskSecrets,
  nonBlankString,
  originUrl,
  positiveInt,
  Secret,
  secretString,
} from "@/core";

interface ValidCase {
  readonly schema: ZodType;
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
}

interface InvalidCase {
  readonly schema: ZodType;
  readonly name: string;
  readonly input: unknown;
  readonly error: string;
}

const VALID: readonly ValidCase[] = [
  { schema: nonBlankString, name: "nonBlankString", input: "a", output: "a" },
  { schema: nonBlankString, name: "nonBlankString", input: " pass word ", output: " pass word " },
  { schema: absoluteUrl, name: "absoluteUrl", input: "http://localhost:8090/api", output: "http://localhost:8090/api" },
  {
    schema: absoluteUrl,
    name: "absoluteUrl",
    input: "https://example.com/path?q=1#top",
    output: "https://example.com/path?q=1#top",
  },
  { schema: originUrl, name: "originUrl", input: "http://localhost:8090", output: "http://localhost:8090" },
  { schema: originUrl, name: "originUrl", input: "http://localhost:8090/", output: "http://localhost:8090" },
  { schema: originUrl, name: "originUrl", input: "HTTPS://Example.COM:443/", output: "https://example.com" },
  { schema: originUrl, name: "originUrl", input: "http://example.com:80", output: "http://example.com" },
  { schema: positiveInt, name: "positiveInt", input: "1", output: 1 },
  { schema: positiveInt, name: "positiveInt", input: "5000", output: 5000 },
  { schema: positiveInt, name: "positiveInt", input: "007", output: 7 },
  { schema: booleanString, name: "booleanString", input: "true", output: true },
  { schema: booleanString, name: "booleanString", input: "false", output: false },
];

const INVALID: readonly InvalidCase[] = [
  { schema: nonBlankString, name: "nonBlankString", input: "", error: "must not be blank" },
  { schema: nonBlankString, name: "nonBlankString", input: "   ", error: "must not be blank" },
  { schema: nonBlankString, name: "nonBlankString", input: "\t\n", error: "must not be blank" },
  { schema: nonBlankString, name: "nonBlankString", input: 42, error: "expected string" },
  { schema: absoluteUrl, name: "absoluteUrl", input: "not a url", error: "Invalid URL" },
  { schema: absoluteUrl, name: "absoluteUrl", input: "ftp://example.com", error: "Invalid URL" },
  { schema: absoluteUrl, name: "absoluteUrl", input: "localhost:8090", error: "Invalid URL" },
  { schema: absoluteUrl, name: "absoluteUrl", input: "http://user:pass@example.com", error: "credentials" },
  { schema: absoluteUrl, name: "absoluteUrl", input: "http://user@example.com", error: "credentials" },
  { schema: originUrl, name: "originUrl", input: "http://example.com/platform", error: "must be an origin" },
  { schema: originUrl, name: "originUrl", input: "http://example.com/?a=1", error: "must be an origin" },
  { schema: originUrl, name: "originUrl", input: "http://example.com/#top", error: "must be an origin" },
  { schema: originUrl, name: "originUrl", input: "http://user:pass@example.com", error: "credentials" },
  { schema: positiveInt, name: "positiveInt", input: "0", error: ">0" },
  { schema: positiveInt, name: "positiveInt", input: "-1", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: "+5", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: "1.5", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: "1e3", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: " 5", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: "", error: "must be decimal digits" },
  { schema: positiveInt, name: "positiveInt", input: "9007199254740993", error: "int" },
  { schema: booleanString, name: "booleanString", input: "TRUE", error: "must be true or false" },
  { schema: booleanString, name: "booleanString", input: "True", error: "must be true or false" },
  { schema: booleanString, name: "booleanString", input: "1", error: "must be true or false" },
  { schema: booleanString, name: "booleanString", input: "yes", error: "must be true or false" },
  { schema: booleanString, name: "booleanString", input: " true", error: "must be true or false" },
  { schema: booleanString, name: "booleanString", input: "", error: "must be true or false" },
  { schema: secretString, name: "secretString", input: "", error: "must have at least 4 characters" },
  { schema: secretString, name: "secretString", input: "abc", error: "must have at least 4 characters" },
];

test.describe("string schemas", () => {
  for (const { schema, name, input, output } of VALID) {
    test(`${name} parses ${JSON.stringify(input)}`, () => {
      expect(schema.parse(input)).toBe(output);
    });
  }

  for (const { schema, name, input, error } of INVALID) {
    test(`${name} rejects ${JSON.stringify(input)}`, () => {
      const result = schema.safeParse(input);

      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ message }) => message)).toContainEqual(expect.stringContaining(error));
    });
  }
});

test.describe("secretString", () => {
  test("parses a value into a secret that keeps it", () => {
    const secret = secretString.parse("Schema-Secret-1");

    expect(secret).toBeInstanceOf(Secret);
    expect(secret.reveal()).toBe("Schema-Secret-1");
  });

  test("registers a parsed value for masking", () => {
    secretString.parse("Schema-Secret-2");

    expect(maskSecrets("password=Schema-Secret-2")).toBe("password=[SECRET]");
  });

  test("keeps a rejected value out of the error", () => {
    const result = secretString.safeParse("k4&");

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).not.toContain("k4&");
    expect(String(result.error)).not.toContain("k4&");
  });

  test("does not register a rejected value for masking", () => {
    secretString.safeParse("z9&");

    expect(maskSecrets("pin z9&")).toBe("pin z9&");
  });
});
